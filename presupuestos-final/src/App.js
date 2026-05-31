import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { S, Badge, Toast } from './styles';
import { calcPpto, fmt, fmtPct } from './calc';
import {
  ESTADOS_PPTO, ESTADOS_PPTO_LABELS, ESTADOS_PPTO_COLORS,
  canChangeEstadoPpto, canEditPpto, canMarkEjecutado,
} from './roles';
import Login from './components/Login';
import EditorPpto from './components/EditorPpto';
import Liquidaciones from './components/Liquidaciones';
import Admin from './components/Admin';

export default function App() {
  const [user, setUser]           = useState(null);
  const [userRole, setUserRole]   = useState('produccion');
  const [loading, setLoading]     = useState(true);
  const [mainTab, setMainTab]     = useState('resumen');
  const [pptos, setPptos]         = useState([]);
  const [categorias, setCats]     = useState([]);
  const [clientes, setClis]       = useState([]);
  const [ejecutivos, setEjecs]    = useState([]);
  const [cfg, setCfg]             = useState({ oh_pct:15, bco_pct:5.5, fee_agencia:0, rebate_pct:2 });
  const [editing, setEditing]     = useState(null);
  const [search, setSearch]       = useState('');
  const [filtroEstado, setFiltro] = useState('todos');
  const [aiQuery, setAiQuery]     = useState('');
  const [aiResp, setAiResp]       = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [toast, setToast]         = useState('');
  const [logoUrl, setLogoUrl]     = useState(null);
  const [popupPpto, setPopupPpto] = useState(null);
  const [exportPeriod, setExportPeriod] = useState({ type:'mes', mes:new Date().getMonth()+1, anio:new Date().getFullYear() });

  useEffect(()=>{
    const saved=localStorage.getItem('matilda_logo');
    if(saved)setLogoUrl(saved);
    supabase.auth.getSession().then(({data:{session}})=>{
      if(session?.user){setUser(session.user);setUserRole(session.user.user_metadata?.role||'produccion');}
      setLoading(false);
    });
    const{data:{subscription}}=supabase.auth.onAuthStateChange((_,session)=>{
      if(session?.user){setUser(session.user);setUserRole(session.user.user_metadata?.role||'produccion');}
      else setUser(null);
    });
    return()=>subscription.unsubscribe();
  },[]);

  useEffect(()=>{
    if(!user)return;
    fetchAll();
    const ch=supabase.channel('rt')
      .on('postgres_changes',{event:'*',schema:'public',table:'presupuestos'},fetchAll)
      .subscribe();
    return()=>supabase.removeChannel(ch);
  },[user]);

  async function fetchAll(){
    const[ppR,catR,cliR,cfgR,ejecR]=await Promise.all([
      supabase.from('presupuestos').select('*').order('created_at',{ascending:false}),
      supabase.from('categorias').select('*').order('nombre'),
      supabase.from('clientes').select('*').order('nombre'),
      supabase.from('config').select('*').single(),
      supabase.from('ejecutivos').select('*').order('nombre'),
    ]);
    if(ppR.data)setPptos(ppR.data);
    if(catR.data)setCats(catR.data);
    if(cliR.data)setClis(cliR.data);
    if(cfgR.data)setCfg(cfgR.data);
    if(ejecR.data)setEjecs(ejecR.data);
  }

  function showToast(m){setToast(m);setTimeout(()=>setToast(''),3000);}
  async function logout(){await supabase.auth.signOut();setUser(null);}

  async function changeEstado(id, estado, estadoActual){
    if(!canChangeEstadoPpto(userRole, estado)){
      showToast('⚠️ No tienes permiso para cambiar a este estado');return;
    }
    if(!canEditPpto(userRole, estadoActual)){
      showToast('⚠️ Este presupuesto está bloqueado para edición');return;
    }
    await supabase.from('presupuestos').update({estado}).eq('id',id);
    fetchAll();
  }

  async function markEjecutado(ppto){
    if(!canMarkEjecutado(userRole)){showToast('Sin permiso');return;}
    const ejecutado=!ppto.ejecutado;
    await supabase.from('presupuestos').update({ejecutado}).eq('id',ppto.id);
    if(ejecutado){
      // Notificación por email via Supabase Edge Function o simplemente log
      try{
        await supabase.functions.invoke('notify-ejecutado',{
          body:{
            presupuesto: ppto.nomenclatura||ppto.nombre,
            cliente: ppto.cliente,
            notificados: ['johanna@matilda.agency','taylor@matilda.agency'],
          }
        });
      }catch(e){ /* Silent fail si no hay edge function */ }
      showToast(`✅ Marcado como ejecutado — se notificó a Johanna y Taylor`);
    }
    fetchAll();
  }

  async function duplicatePpto(ppto){
    if(!window.confirm(`¿Duplicar "${ppto.nombre||ppto.cliente}"? Se creará un presupuesto nuevo con los mismos ítems.`))return;
    const{count}=await supabase.from('presupuestos').select('*',{count:'exact',head:true});
    const{genNomenclatura}=await import('./calc');
    const newNom=genNomenclatura(ppto.nombre,ppto.cliente,(count||0)+1);
    // Copiar ítems: costo real → vacío, mantener precios
    const items=(ppto.items||[]).map(it=>{
      if(it._type==='subcat')return{...it,id:crypto.randomUUID()};
      return{
        ...it, id:crypto.randomUUID(),
        costo_real_unit:null, bco_real_pct:null,
        costo_aprobado:false, num_factura_prov:'',
        foto_referencia:null,
      };
    });
    const nuevo={
      ...ppto, id:undefined,
      nomenclatura:newNom,
      nombre:`COPIA - ${ppto.nombre||''}`,
      estado:'borrador',
      ejecutado:false,
      items,
      created_at:undefined, updated_at:undefined,
    };
    const{error}=await supabase.from('presupuestos').insert(nuevo);
    if(error){showToast('Error al duplicar: '+error.message);return;}
    showToast('Presupuesto duplicado ✓');
    fetchAll();
  }

  async function deletePpto(id){
    if(!window.confirm('¿Eliminar presupuesto?'))return;
    await supabase.from('presupuestos').delete().eq('id',id);
    fetchAll();showToast('Eliminado');
  }

  async function askAI(){
    if(!aiQuery.trim())return;
    setAiLoading(true);setAiResp('');
    const ctx=pptos.map(p=>({
      nomenclatura:p.nomenclatura,nombre:p.nombre,cliente:p.cliente,
      fecha:p.fecha_evento,estado:p.estado,totalConIva:calcPpto(p).totalConIva,
      items:(p.items||[]).filter(it=>!it._type).map(it=>({
        item:it.item,categoria:it.categoria,costo_unit:it.costo_unit,
        precio_unit:it.precio_unit,proveedor:it.proveedor
      }))
    }));
    const apiKey=process.env.REACT_APP_OPENAI_KEY;
    if(!apiKey){setAiResp('⚠️ Falta REACT_APP_OPENAI_KEY en Vercel.');setAiLoading(false);return;}
    try{
      const res=await fetch('https://api.openai.com/v1/chat/completions',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},
        body:JSON.stringify({
          model:'gpt-4o-mini',max_tokens:1000,
          messages:[
            {role:'system',content:`Asistente de presupuestos Matilda. Datos: ${JSON.stringify(ctx)}. Responde en español. Usa formato $1,234.56 para montos.`},
            {role:'user',content:aiQuery}
          ]
        })
      });
      const data=await res.json();
      if(data.error)setAiResp('Error: '+data.error.message);
      else setAiResp(data.choices?.[0]?.message?.content||'Sin respuesta');
    }catch(e){setAiResp('Error: '+e.message);}
    setAiLoading(false);
  }

  function exportExcel(){
    const filtrados=pptos.filter(p=>{
      if(!p.fecha_evento)return false;
      const[y,m]=p.fecha_evento.split('-').map(Number);
      if(exportPeriod.type==='anio')return y===exportPeriod.anio;
      return y===exportPeriod.anio&&m===exportPeriod.mes;
    });
    const rows=[
      ['INFORME MATILDA EVENT DESIGNERS'],
      [`Período: ${exportPeriod.type==='anio'?exportPeriod.anio:`${exportPeriod.mes}/${exportPeriod.anio}`}`],[''],
      ['Código','Cliente','Evento','Fecha','Estado','Ejecutado','PAX','Subtotal Precio','Fee','Subtotal s/IVA','IVA 15%','Total c/IVA','Subtotal Costo','Margen','% Margen'],
      ...filtrados.map(p=>{const t=calcPpto(p);return[
        p.nomenclatura,p.cliente,p.nombre,p.fecha_evento,
        ESTADOS_PPTO_LABELS[p.estado]||p.estado,
        p.ejecutado?'Sí':'No',p.personas,
        t.subtotalPrecio,t.feeAgencia,t.totalSinIva,t.iva15,t.totalConIva,
        t.subtotalCosto,t.margenTotal,t.margenPct.toFixed(1)+'%'
      ];}),
      [''],
      ['TOTALES','','','','','','',
        filtrados.reduce((a,p)=>a+calcPpto(p).subtotalPrecio,0),'',
        filtrados.reduce((a,p)=>a+calcPpto(p).totalSinIva,0),'',
        filtrados.reduce((a,p)=>a+calcPpto(p).totalConIva,0),
        filtrados.reduce((a,p)=>a+calcPpto(p).subtotalCosto,0),
        filtrados.reduce((a,p)=>a+calcPpto(p).margenTotal,0),''
      ],
    ];
    const csv=rows.map(r=>r.map(c=>{const s=String(c??'').replace(/"/g,'""');return s.includes(',')?`"${s}"`:s;}).join(',')).join('\n');
    const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');
    a.href=url;a.download=`informe_matilda_${exportPeriod.anio}${exportPeriod.type==='mes'?'_'+String(exportPeriod.mes).padStart(2,'0'):''}.csv`;
    a.click();URL.revokeObjectURL(url);
  }

  const [selectedIds, setSelectedIds] = useState(new Set());

  function toggleSelect(id){
    setSelectedIds(prev=>{const s=new Set(prev);s.has(id)?s.delete(id):s.add(id);return s;});
  }
  function selectAll(list){setSelectedIds(new Set(list.map(p=>p.id)));}
  function clearSelect(){setSelectedIds(new Set());}

  async function deleteSelected(){
    if(selectedIds.size===0)return;
    if(!window.confirm(`¿Eliminar ${selectedIds.size} presupuesto(s)?`))return;
    await Promise.all([...selectedIds].map(id=>supabase.from('presupuestos').delete().eq('id',id)));
    clearSelect();fetchAll();showToast(`${selectedIds.size} presupuestos eliminados`);
  }
  async function duplicateSelected(){
    if(selectedIds.size===0)return;
    const list=pptos.filter(p=>selectedIds.has(p.id));
    for(const p of list)await duplicatePpto(p);
    clearSelect();
  }

  const filtered=pptos.filter(p=>{
    const q=search.toLowerCase();
    const ms=!q||(p.nombre||'').toLowerCase().includes(q)||(p.cliente||'').toLowerCase().includes(q)||(p.nomenclatura||'').toLowerCase().includes(q);
    const me=filtroEstado==='todos'||p.estado===filtroEstado;
    return ms&&me;
  });

  const anioActual=new Date().getFullYear();
  const pptosAnio=pptos.filter(p=>p.fecha_evento&&p.fecha_evento.startsWith(String(anioActual)));
  const facturados=pptosAnio.filter(p=>p.estado==='facturado');
  const pendFacturar=pptos.filter(p=>p.estado==='pendiente_facturar');
  const globales={
    facturado:facturados.reduce((a,p)=>a+calcPpto(p).totalConIva,0),
    costoFact:facturados.reduce((a,p)=>a+calcPpto(p).subtotalCosto,0),
    margenFact:facturados.reduce((a,p)=>a+calcPpto(p).margenTotal,0),
  };

  const clienteCount={};
  pendFacturar.forEach(p=>{const c=p.cliente||'Sin cliente';clienteCount[c]=(clienteCount[c]||0)+1;});
  const chartData=Object.entries(clienteCount).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const maxCount=Math.max(...chartData.map(([,n])=>n),1);

  if(loading)return<div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontSize:15,color:'#5a7a9a'}}>Cargando…</div>;
  if(!user)return<Login onLogin={u=>{setUser(u);setUserRole(u.user_metadata?.role||'produccion');}}/>;

  if((mainTab==='presupuestos'||mainTab==='resumen')&&editing!==null){
    return(
      <Shell user={user} userRole={userRole} mainTab={mainTab} setMainTab={k=>{setMainTab(k);setEditing(null);}} logout={logout} logoUrl={logoUrl}>
        <EditorPpto
          ppto={editing==='new'?null:editing}
          cfg={cfg} categorias={categorias} clientes={clientes}
          ejecutivos={ejecutivos} logoUrl={logoUrl} userRole={userRole}
          onSave={()=>{setEditing(null);fetchAll();showToast('Presupuesto guardado ✓');}}
          onCancel={()=>setEditing(null)}
        />
      </Shell>
    );
  }

  // Render card de presupuesto en Resumen (sin botones de acción, con checkbox)
  function PptoCard({p}){
    const t=calcPpto(p);
    const warn=t.hasWarning;
    const sel=selectedIds.has(p.id);
    return(
      <div style={{...S.card,
        border: warn?'2px solid #c8264a':sel?'2px solid #3dbfb8':'1px solid #dde6ef',
        background: sel?'#f0fcfc':'#fff',
        cursor:'pointer', transition:'all 0.1s'
      }}>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          {/* Checkbox selección */}
          <input type="checkbox" checked={sel} onChange={e=>{e.stopPropagation();toggleSelect(p.id);}}
            style={{width:18,height:18,cursor:'pointer',accentColor:'#3dbfb8',flexShrink:0}}
            onClick={e=>e.stopPropagation()}/>
          <div style={{flex:1}} onClick={()=>setPopupPpto(p)}>
            {p.nomenclatura&&<div style={{fontSize:10,color:'#8aa0b8',fontFamily:'monospace',marginBottom:1}}>{p.nomenclatura}</div>}
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
              <span style={{fontSize:15,fontWeight:700,color:'#0d3b5e'}}>{p.nombre||p.cliente}</span>
              <Badge estado={p.estado}/>
              {warn&&<span style={{fontSize:12,color:'#fff',fontWeight:700,background:'#c8264a',padding:'2px 8px',borderRadius:4}}>⚠️ COSTO &gt; PRECIO</span>}
              {p.ejecutado&&<span style={{fontSize:10,background:'#edf7ed',color:'#2e8b4e',padding:'2px 6px',borderRadius:4,fontWeight:700}}>✅ Ejecutado</span>}
            </div>
            <div style={{fontSize:12,color:'#8aa0b8',display:'flex',gap:10,flexWrap:'wrap'}}>
              {p.cliente&&<span>🏢 {p.cliente}</span>}
              {p.fecha_evento&&<span>📅 {p.fecha_evento}</span>}
              {p.ciudad&&<span>📍 {p.ciudad}</span>}
              <span>📦 {(p.items||[]).filter(it=>!it._type).length} ítems</span>
            </div>
          </div>
          <div style={{textAlign:'right'}} onClick={()=>setPopupPpto(p)}>
            <div style={{fontSize:11,color:'#aaa'}}>Total c/IVA</div>
            <div style={{fontSize:16,fontWeight:700,color:'#0d3b5e'}}>{fmt(t.totalConIva)}</div>
            <div style={{fontSize:11,color:'#aaa'}}>Margen: {fmt(t.margenTotal)} ({fmtPct(t.margenPct)})</div>
          </div>
        </div>
      </div>
    );
  }

  return(
    <Shell user={user} userRole={userRole} mainTab={mainTab} setMainTab={setMainTab} logout={logout} logoUrl={logoUrl}>

      {/* ══ RESUMEN ══ */}
      {mainTab==='resumen'&&(
        <div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16,flexWrap:'wrap',gap:10}}>
            <h2 style={{fontSize:20,fontWeight:700,color:'#0d3b5e'}}>📊 Resumen {anioActual}</h2>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <select style={{...S.select,width:'auto'}} value={exportPeriod.type} onChange={e=>setExportPeriod(p=>({...p,type:e.target.value}))}>
                <option value="mes">Por mes</option><option value="anio">Por año</option>
              </select>
              {exportPeriod.type==='mes'&&<select style={{...S.select,width:'auto'}} value={exportPeriod.mes} onChange={e=>setExportPeriod(p=>({...p,mes:parseInt(e.target.value)}))}>
                {[1,2,3,4,5,6,7,8,9,10,11,12].map(m=><option key={m} value={m}>{['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][m-1]}</option>)}
              </select>}
              <input type="number" style={{...S.input,width:80}} value={exportPeriod.anio} onChange={e=>setExportPeriod(p=>({...p,anio:parseInt(e.target.value)||anioActual}))}/>
              <button style={S.btnPrimary} onClick={exportExcel}>📊 Exportar</button>
            </div>
          </div>

          <div style={{...S.grid4,marginBottom:16}}>
            <div style={S.metricNavy}><div style={{fontSize:11,color:'#8ab4d4',marginBottom:4}}>Facturado {anioActual}</div><div style={{fontSize:18,fontWeight:800,color:'#fff'}}>{fmt(globales.facturado)}</div></div>
            <div style={S.metricCard}><div style={{fontSize:11,color:'#8aa0b8',marginBottom:4}}>Costo facturado</div><div style={{fontSize:18,fontWeight:700}}>{fmt(globales.costoFact)}</div></div>
            <div style={S.metricTeal}><div style={{fontSize:11,color:'#0d6e69',marginBottom:4}}>Margen facturado</div><div style={{fontSize:18,fontWeight:700,color:'#0d6e69'}}>{fmt(globales.margenFact)}</div></div>
            <div style={S.metricFucsia}><div style={{fontSize:11,color:'#c8264a',marginBottom:4}}>Pendiente facturar</div><div style={{fontSize:18,fontWeight:700,color:'#c8264a'}}>{pendFacturar.length} pptos</div></div>
          </div>

          {chartData.length>0&&(
            <div style={{...S.card,marginBottom:16}}>
              <div style={{fontSize:13,fontWeight:700,color:'#0d3b5e',marginBottom:12}}>Presupuestos pendientes de facturar por cliente</div>
              {chartData.map(([cli,n])=>(
                <div key={cli} style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
                  <div style={{width:130,fontSize:12,color:'#5a7a9a',textAlign:'right',flexShrink:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cli}</div>
                  <div style={{flex:1,background:'#f0f4f8',borderRadius:4,height:20,overflow:'hidden'}}>
                    <div style={{width:`${(n/maxCount)*100}%`,background:'#c8264a',height:'100%',borderRadius:4}}/>
                  </div>
                  <div style={{fontSize:12,fontWeight:700,color:'#0d3b5e',minWidth:20}}>{n}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{...S.card,marginBottom:16}}>
            <div style={{fontSize:14,fontWeight:700,color:'#0d3b5e',marginBottom:10}}>🤖 Consultar con IA</div>
            <div style={{display:'flex',gap:8,marginBottom:8}}>
              <input style={{...S.input,flex:1}} value={aiQuery} onChange={e=>setAiQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&askAI()} placeholder="¿Cuánto costó el escenario? ¿Qué proveedor usamos?"/>
              <button style={S.btnPrimary} onClick={askAI} disabled={aiLoading||!aiQuery.trim()}>{aiLoading?'…':'↗'} Consultar</button>
            </div>
            {aiResp&&<div style={{fontSize:13,lineHeight:1.7,padding:'10px 14px',background:'#f4f8fc',borderRadius:8,border:'1px solid #dde6ef',whiteSpace:'pre-wrap',maxHeight:250,overflowY:'auto'}}>{aiResp}</div>}
          </div>

          <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
            <input style={{...S.input,maxWidth:240}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar…"/>
            <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
              <button onClick={()=>setFiltro('todos')} style={{...S.btnSm,background:filtroEstado==='todos'?'#0d3b5e':'#fff',color:filtroEstado==='todos'?'#fff':'#0d3b5e'}}>Todos</button>
              {ESTADOS_PPTO.map(e=>(
                <button key={e} onClick={()=>setFiltro(e)} style={{...S.btnSm,background:filtroEstado===e?ESTADOS_PPTO_COLORS[e]:'#fff',color:filtroEstado===e?'#fff':ESTADOS_PPTO_COLORS[e],borderColor:ESTADOS_PPTO_COLORS[e]+'66',fontSize:11}}>
                  {ESTADOS_PPTO_LABELS[e]}
                </button>
              ))}
            </div>
          </div>

          {/* Barra de acciones masivas */}
          {selectedIds.size>0&&(
            <div style={{background:'#0d3b5e',borderRadius:8,padding:'10px 16px',marginBottom:12,display:'flex',alignItems:'center',gap:12}}>
              <span style={{color:'#fff',fontWeight:700,fontSize:13}}>{selectedIds.size} seleccionado(s)</span>
              <button style={{...S.btnSm,background:'#fff',color:'#0d3b5e'}} onClick={()=>{
                if(selectedIds.size===1){const p=pptos.find(x=>selectedIds.has(x.id));if(p){setEditing(p);setMainTab('presupuestos');clearSelect();}}
                else showToast('Selecciona solo 1 para editar');
              }}>✏️ Editar</button>
              <button style={{...S.btnSm,background:'#3dbfb8',color:'#fff',border:'none'}} onClick={duplicateSelected}>📋 Duplicar</button>
              {userRole==='admin'&&<button style={{...S.btnSm,background:'#c8264a',color:'#fff',border:'none'}} onClick={deleteSelected}>🗑 Eliminar</button>}
              <button style={{...S.btnSm,background:'none',color:'#8ab4d4',border:'1px solid #4a6a8a'}} onClick={clearSelect}>✕ Cancelar</button>
            </div>
          )}

          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
            <input type="checkbox"
              checked={filtered.length>0&&filtered.every(p=>selectedIds.has(p.id))}
              onChange={e=>e.target.checked?selectAll(filtered):clearSelect()}
              style={{width:18,height:18,cursor:'pointer',accentColor:'#3dbfb8'}}/>
            <span style={{fontSize:12,color:'#5a7a9a'}}>Seleccionar todos ({filtered.length})</span>
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {filtered.map(p=><PptoCard key={p.id} p={p}/>)}
            {filtered.length===0&&<div style={S.empty}>{pptos.length===0?'Sin presupuestos aún.':'Sin resultados.'}</div>}
          </div>
        </div>
      )}

      {/* ══ PRESUPUESTOS ══ */}
      {mainTab==='presupuestos'&&editing===null&&(
        <div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
            <h2 style={{fontSize:20,fontWeight:700,color:'#0d3b5e'}}>📝 Presupuestos</h2>
            <button style={{...S.btnPrimary,background:'#c8264a'}} onClick={()=>setEditing('new')}>+ Nuevo presupuesto</button>
          </div>
          <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
            <input style={{...S.input,maxWidth:260}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar…"/>
            <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
              <button onClick={()=>setFiltro('todos')} style={{...S.btnSm,background:filtroEstado==='todos'?'#0d3b5e':'#fff',color:filtroEstado==='todos'?'#fff':'#0d3b5e',fontSize:11}}>Todos</button>
              {ESTADOS_PPTO.map(e=>(
                <button key={e} onClick={()=>setFiltro(e)} style={{...S.btnSm,background:filtroEstado===e?ESTADOS_PPTO_COLORS[e]:'#fff',color:filtroEstado===e?'#fff':ESTADOS_PPTO_COLORS[e],borderColor:ESTADOS_PPTO_COLORS[e]+'66',fontSize:11}}>
                  {ESTADOS_PPTO_LABELS[e]}
                </button>
              ))}
            </div>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {filtered.map(p=>(
              <div key={p.id} style={{...S.card,cursor:'pointer',border:calcPpto(p).hasWarning?'1px solid #c8264a':'1px solid #dde6ef'}}
                onClick={()=>setEditing(p)}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <div style={{flex:1}}>
                    {p.nomenclatura&&<div style={{fontSize:10,color:'#8aa0b8',fontFamily:'monospace',marginBottom:1}}>{p.nomenclatura}</div>}
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
                      <span style={{fontSize:15,fontWeight:700,color:'#0d3b5e'}}>{p.nombre||p.cliente}</span>
                      <Badge estado={p.estado}/>
                      {calcPpto(p).hasWarning&&<span style={{fontSize:11,color:'#c8264a',fontWeight:700}}>⚠️ Costo &gt; Precio</span>}
                      {p.ejecutado&&<span style={{fontSize:10,background:'#edf7ed',color:'#2e8b4e',padding:'2px 6px',borderRadius:4,fontWeight:700}}>✅ Ejecutado</span>}
                    </div>
                    <div style={{fontSize:12,color:'#8aa0b8',display:'flex',gap:10,flexWrap:'wrap'}}>
                      {p.cliente&&<span>🏢 {p.cliente}</span>}
                      {p.fecha_evento&&<span>📅 {p.fecha_evento}</span>}
                      {p.lugar&&<span>📍 {p.lugar}</span>}
                      <span>📦 {(p.items||[]).filter(it=>!it._type).length} ítems</span>
                    </div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontSize:11,color:'#aaa'}}>Total c/IVA</div>
                    <div style={{fontSize:18,fontWeight:700,color:'#0d3b5e'}}>{fmt(calcPpto(p).totalConIva)}</div>
                    <div style={{fontSize:12,color:'#aaa'}}>Margen: {fmt(calcPpto(p).margenTotal)} ({fmtPct(calcPpto(p).margenPct)})</div>
                  </div>
                </div>
              </div>
            ))}
            {filtered.length===0&&<div style={S.empty}>{pptos.length===0?'Sin presupuestos.':'Sin resultados.'}</div>}
          </div>
        </div>
      )}

      {mainTab==='liquidaciones'&&<Liquidaciones presupuestos={pptos} userRole={userRole}/>}
      {mainTab==='admin'&&userRole==='admin'&&<Admin onLogoChange={url=>{setLogoUrl(url);localStorage.setItem('matilda_logo',url);}}/>}

      {/* Popup presupuesto */}
      {popupPpto&&(
        <div style={{position:'fixed',inset:0,background:'rgba(13,59,94,0.6)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'#fff',borderRadius:14,width:'100%',maxWidth:560,padding:'24px',boxShadow:'0 8px 40px rgba(13,59,94,0.25)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
              <div style={{flex:1}}>
                <div style={{fontSize:10,color:'#8aa0b8',fontFamily:'monospace'}}>{popupPpto.nomenclatura}</div>
                <div style={{fontSize:17,fontWeight:700,color:'#0d3b5e'}}>{popupPpto.nombre||popupPpto.cliente}</div>
                <div style={{marginTop:6,display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
                  <Badge estado={popupPpto.estado}/>
                  {calcPpto(popupPpto).hasWarning&&<span style={{fontSize:12,color:'#fff',fontWeight:700,background:'#c8264a',padding:'2px 8px',borderRadius:4}}>⚠️ COSTO &gt; PRECIO</span>}
                  {popupPpto.ejecutado&&<span style={{fontSize:11,background:'#edf7ed',color:'#2e8b4e',padding:'2px 8px',borderRadius:4,fontWeight:700}}>✅ Ejecutado</span>}
                </div>
              </div>
              <button onClick={()=>setPopupPpto(null)} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:'#8aa0b8'}}>✕</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14,fontSize:13}}>
              {[['Cliente',popupPpto.cliente],['Fecha',popupPpto.fecha_evento],['Lugar',popupPpto.lugar],['PAX',popupPpto.personas?popupPpto.personas+' pax':''],['Total c/IVA',fmt(calcPpto(popupPpto).totalConIva)],['Margen',fmt(calcPpto(popupPpto).margenTotal)]].filter(([,v])=>v).map(([l,v])=>(
                <div key={l} style={{background:'#f4f8fc',borderRadius:6,padding:'8px 12px'}}>
                  <div style={{fontSize:10,color:'#3dbfb8',fontWeight:700,letterSpacing:1,textTransform:'uppercase'}}>{l}</div>
                  <div style={{fontSize:13,fontWeight:600,color:'#0d3b5e'}}>{v}</div>
                </div>
              ))}
            </div>
            {/* Cambiar estado desde popup */}
            <div style={{display:'flex',gap:8,marginBottom:12,alignItems:'center'}}>
              <span style={{fontSize:12,color:'#5a7a9a',flexShrink:0}}>Estado:</span>
              <select style={{...S.select,flex:1}} value={popupPpto.estado}
                onChange={e=>{
                  if(!canChangeEstadoPpto(userRole,e.target.value)){showToast('⚠️ Sin permiso');return;}
                  changeEstado(popupPpto.id,e.target.value,popupPpto.estado);
                  setPopupPpto(prev=>({...prev,estado:e.target.value}));
                }}>
                {ESTADOS_PPTO.map(e=><option key={e} value={e} disabled={!canChangeEstadoPpto(userRole,e)&&popupPpto.estado!==e}>{ESTADOS_PPTO_LABELS[e]}</option>)}
              </select>
              {canMarkEjecutado(userRole)&&(
                <label style={{display:'flex',alignItems:'center',gap:6,fontSize:12,cursor:'pointer',flexShrink:0,padding:'6px 10px',background:popupPpto.ejecutado?'#edf7ed':'#f8fafc',borderRadius:6,border:'1px solid #dde6ef'}}>
                  <input type="checkbox" checked={!!popupPpto.ejecutado} onChange={()=>{markEjecutado(popupPpto);setPopupPpto(prev=>({...prev,ejecutado:!prev.ejecutado}));}} style={{cursor:'pointer'}}/>
                  Ejecutado
                </label>
              )}
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'center',flexWrap:'wrap'}}>
              <button style={S.btnPrimary} onClick={()=>{
                const{generatePdfClienteHTML}=require('./components/PdfCliente');
                const html=generatePdfClienteHTML(popupPpto,logoUrl);
                const w=window.open('','_blank');w.document.write(html);w.document.close();
              }}>📄 PDF cliente</button>
              <button style={{...S.btnSecondary,color:'#c8264a',borderColor:'#c8264a44'}} onClick={()=>{
                const{generatePdfFinancieroHTML}=require('./components/PdfCliente');
                const html=generatePdfFinancieroHTML(popupPpto,logoUrl);
                const w=window.open('','_blank');w.document.write(html);w.document.close();
              }}>📊 PDF financiero</button>
              <button style={S.btnSecondary} onClick={()=>{setEditing(popupPpto);setMainTab('presupuestos');setPopupPpto(null);}}>✏️ Editar</button>
              <button style={{...S.btnSm,fontSize:12}} onClick={()=>{duplicatePpto(popupPpto);setPopupPpto(null);}}>📋 Duplicar</button>
            </div>
          </div>
        </div>
      )}

      <Toast msg={toast}/>
    </Shell>
  );
}

function Shell({children,user,userRole,mainTab,setMainTab,logout,logoUrl}){
  const TABS=[
    ['resumen','📊 Resumen'],
    ['presupuestos','📝 Presupuestos'],
    ['liquidaciones','💰 Liquidaciones'],
    ...(userRole==='admin'?[['admin','⚙️ Admin']]:[]),
  ];
  const roleLabel={admin:'Admin',financiero:'Financiero',produccion:'Producción'};
  const roleColor={admin:'#c8264a',financiero:'#2e8b4e',produccion:'#0d3b5e'};
  return(
    <div style={{minHeight:'100vh',background:'#f0f4f8'}}>
      <nav style={{background:'#0d3b5e',padding:'0 20px',display:'flex',alignItems:'center',gap:2,position:'sticky',top:0,zIndex:100,boxShadow:'0 2px 12px rgba(13,59,94,0.4)',borderBottom:'2px solid #c8264a'}}>
        <div style={{display:'flex',alignItems:'center',marginRight:16,padding:'8px 0'}}>
          {logoUrl
            ?<img src={logoUrl} alt="Matilda" style={{height:64,objectFit:'contain'}}/>
            :<div style={{color:'#fff',fontSize:24,fontStyle:'italic',fontWeight:900,letterSpacing:1}}>matilda <span style={{fontSize:11,color:'#3dbfb8',letterSpacing:2,fontStyle:'normal',fontWeight:600}}>EVENT DESIGNERS</span></div>}
        </div>
        {TABS.map(([k,l])=>(
          <button key={k} onClick={()=>setMainTab(k)} style={{background:mainTab===k?'rgba(255,255,255,0.12)':'none',color:mainTab===k?'#fff':'#8ab4d4',border:'none',cursor:'pointer',padding:'14px 14px',fontSize:13,fontWeight:mainTab===k?700:400,borderBottom:mainTab===k?'2px solid #3dbfb8':'2px solid transparent',transition:'all 0.15s'}}>
            {l}
          </button>
        ))}
        <div style={{flex:1}}/>
        <span style={{fontSize:11,background:roleColor[userRole]||'#555',color:'#fff',padding:'2px 8px',borderRadius:4,marginRight:8,fontWeight:700}}>
          {roleLabel[userRole]||userRole}
        </span>
        <div style={{fontSize:12,color:'#8ab4d4',marginRight:12}}>{user.email}</div>
        <button onClick={logout} style={{background:'none',border:'1px solid #4a6a8a',color:'#8ab4d4',padding:'5px 12px',borderRadius:5,cursor:'pointer',fontSize:12}}>Salir</button>
      </nav>
      <div style={{...S.page,paddingTop:24}}>{children}</div>
    </div>
  );
}
