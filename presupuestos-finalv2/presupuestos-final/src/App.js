import { useState, useEffect, useRef } from 'react';
import { supabase } from './supabase';
import { S, Badge, Toast } from './styles';
import { calcPpto, fmt } from './calc';
import Login from './components/Login';
import EditorPpto from './components/EditorPpto';
import Liquidaciones from './components/Liquidaciones';
import Admin from './components/Admin';

const ESTADOS = ['borrador','entregado','aprobado','a_facturar','facturado','cancelado'];
const ESTADO_LABELS = { borrador:'Borrador', entregado:'Entregado', aprobado:'Aprobado', a_facturar:'A facturar', facturado:'Facturado', cancelado:'Cancelado' };
const ESTADO_COLORS = { borrador:'#8aa0b8', entregado:'#0d3b5e', aprobado:'#3dbfb8', a_facturar:'#e8a020', facturado:'#2e8b4e', cancelado:'#c8264a' };

export default function App() {
  const [user, setUser]         = useState(null);
  const [userRole, setUserRole] = useState('user');
  const [loading, setLoading]   = useState(true);
  const [mainTab, setMainTab]   = useState('resumen');
  const [pptos, setPptos]       = useState([]);
  const [categorias, setCats]   = useState([]);
  const [clientes, setClis]     = useState([]);
  const [cfg, setCfg]           = useState({ oh_pct:15, bco_pct:5.5, fee_agencia:5, rebate_pct:2 });
  const [editing, setEditing]   = useState(null);
  const [search, setSearch]     = useState('');
  const [filtroEstado, setFiltro] = useState('todos');
  const [aiQuery, setAiQuery]   = useState('');
  const [aiResp, setAiResp]     = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [toast, setToast]       = useState('');
  const [logoUrl, setLogoUrl]   = useState(null);
  const [popupPpto, setPopupPpto] = useState(null);
  const [exportPeriod, setExportPeriod] = useState({ type:'mes', mes:new Date().getMonth()+1, anio:new Date().getFullYear() });

  useEffect(()=>{
    const saved=localStorage.getItem('matilda_logo');
    if(saved)setLogoUrl(saved);
    supabase.auth.getSession().then(({data:{session}})=>{
      if(session?.user){setUser(session.user);setUserRole(session.user.user_metadata?.role||'user');}
      setLoading(false);
    });
    const{data:{subscription}}=supabase.auth.onAuthStateChange((_,session)=>{
      if(session?.user){setUser(session.user);setUserRole(session.user.user_metadata?.role||'user');}
      else setUser(null);
    });
    return()=>subscription.unsubscribe();
  },[]);

  useEffect(()=>{
    if(!user)return;
    fetchAll();
    const ch=supabase.channel('rt').on('postgres_changes',{event:'*',schema:'public',table:'presupuestos'},fetchAll).subscribe();
    return()=>supabase.removeChannel(ch);
  },[user]);

  async function fetchAll(){
    const[ppR,catR,cliR,cfgR]=await Promise.all([
      supabase.from('presupuestos').select('*').order('created_at',{ascending:false}),
      supabase.from('categorias').select('*').order('nombre'),
      supabase.from('clientes').select('*').order('nombre'),
      supabase.from('config').select('*').single(),
    ]);
    if(ppR.data)setPptos(ppR.data);
    if(catR.data)setCats(catR.data);
    if(cliR.data)setClis(cliR.data);
    if(cfgR.data)setCfg(cfgR.data);
  }

  function showToast(m){setToast(m);setTimeout(()=>setToast(''),2500);}
  async function logout(){await supabase.auth.signOut();setUser(null);}

  async function changeEstado(id,estado){
    await supabase.from('presupuestos').update({estado}).eq('id',id);fetchAll();
  }
  async function deletePpto(id){
    if(!window.confirm('¿Eliminar presupuesto?'))return;
    await supabase.from('presupuestos').delete().eq('id',id);fetchAll();showToast('Eliminado');
  }

  async function askAI(){
    if(!aiQuery.trim())return;
    setAiLoading(true);setAiResp('');
    const ctx=pptos.map(p=>({nomenclatura:p.nomenclatura,nombre:p.nombre,cliente:p.cliente,fecha:p.fecha_evento,estado:p.estado,totalConIva:calcPpto(p).totalConIva,items:(p.items||[]).map(it=>({item:it.item,categoria:it.categoria,costo:it.costo,precio_unit:it.precio_unit,proveedor:it.proveedor}))}));
    try{
      const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1000,system:`Asistente de presupuestos Matilda. Datos: ${JSON.stringify(ctx)}. Responde en español. Menciona nomenclatura, costos, precios y proveedores cuando sea relevante.`,messages:[{role:'user',content:aiQuery}]})});
      const data=await res.json();
      setAiResp(data.content?.map(b=>b.text||'').join('')||'Sin respuesta');
    }catch(e){setAiResp('Error: '+e.message);}
    setAiLoading(false);
  }

  // Exportar Excel del período
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
      ['Código','Cliente','Evento','Fecha','Estado','PAX','Subtotal Precio','Fee','Subtotal s/IVA','IVA 15%','Total c/IVA','Subtotal Costo','Margen'],
      ...filtrados.map(p=>{const t=calcPpto(p);return[p.nomenclatura,p.cliente,p.nombre,p.fecha_evento,p.estado,p.personas,t.subtotalPrecio,t.feeAgencia,t.totalSinIva,t.iva15,t.totalConIva,t.subtotalCosto,t.margenTotal];}),
      [''],
      ['TOTALES','','','','','',
        filtrados.reduce((a,p)=>a+calcPpto(p).subtotalPrecio,0),'',
        filtrados.reduce((a,p)=>a+calcPpto(p).totalSinIva,0),'',
        filtrados.reduce((a,p)=>a+calcPpto(p).totalConIva,0),
        filtrados.reduce((a,p)=>a+calcPpto(p).subtotalCosto,0),
        filtrados.reduce((a,p)=>a+calcPpto(p).margenTotal,0),
      ],
    ];
    const csv=rows.map(r=>r.map(c=>{const s=String(c??'').replace(/"/g,'""');return s.includes(',')?`"${s}"`:s;}).join(',')).join('\n');
    const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`informe_matilda_${exportPeriod.anio}${exportPeriod.type==='mes'?'_'+String(exportPeriod.mes).padStart(2,'0'):''}.csv`;a.click();URL.revokeObjectURL(url);
  }

  const filtered=pptos.filter(p=>{
    const q=search.toLowerCase();
    const ms=!q||(p.nombre||'').toLowerCase().includes(q)||(p.cliente||'').toLowerCase().includes(q)||(p.nomenclatura||'').toLowerCase().includes(q);
    const me=filtroEstado==='todos'||p.estado===filtroEstado;
    return ms&&me;
  });

  // Métricas del año actual
  const anioActual=new Date().getFullYear();
  const pptosAnio=pptos.filter(p=>p.fecha_evento&&p.fecha_evento.startsWith(String(anioActual)));
  const facturados=pptosAnio.filter(p=>p.estado==='facturado');
  const aFacturar=pptos.filter(p=>p.estado==='a_facturar');
  const globales={
    facturado:facturados.reduce((a,p)=>a+calcPpto(p).totalConIva,0),
    costoFact:facturados.reduce((a,p)=>a+calcPpto(p).subtotalCosto,0),
    margenFact:facturados.reduce((a,p)=>a+calcPpto(p).margenTotal,0),
    total:pptos.reduce((a,p)=>a+calcPpto(p).totalConIva,0),
  };

  // Gráfico por cliente (a facturar)
  const clienteCount={};
  aFacturar.forEach(p=>{const c=p.cliente||'Sin cliente';clienteCount[c]=(clienteCount[c]||0)+1;});
  const chartData=Object.entries(clienteCount).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const maxCount=Math.max(...chartData.map(([,n])=>n),1);

  if(loading)return<div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100vh',fontSize:15,color:'#5a7a9a'}}>Cargando…</div>;
  if(!user)return<Login onLogin={u=>{setUser(u);setUserRole(u.user_metadata?.role||'user');}}/>;

  if((mainTab==='presupuestos'||mainTab==='resumen')&&editing!==null){
    return(
      <Shell user={user} userRole={userRole} mainTab={mainTab} setMainTab={k=>{setMainTab(k);setEditing(null);}} logout={logout} logoUrl={logoUrl}>
        <EditorPpto ppto={editing==='new'?null:editing} cfg={cfg} categorias={categorias} clientes={clientes} logoUrl={logoUrl}
          onSave={()=>{setEditing(null);fetchAll();showToast('Presupuesto guardado ✓');}}
          onCancel={()=>setEditing(null)}/>
      </Shell>
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

          {/* Métricas */}
          <div style={{...S.grid4,marginBottom:16}}>
            <div style={S.metricNavy}><div style={{fontSize:11,color:'#8ab4d4',marginBottom:4}}>Facturado {anioActual}</div><div style={{fontSize:18,fontWeight:800,color:'#fff'}}>{fmt(globales.facturado)}</div></div>
            <div style={S.metricCard}><div style={{fontSize:11,color:'#8aa0b8',marginBottom:4}}>Costo presupuestos facturados</div><div style={{fontSize:18,fontWeight:700}}>{fmt(globales.costoFact)}</div></div>
            <div style={S.metricTeal}><div style={{fontSize:11,color:'#0d6e69',marginBottom:4}}>Margen facturado</div><div style={{fontSize:18,fontWeight:700,color:'#0d6e69'}}>{fmt(globales.margenFact)}</div></div>
            <div style={S.metricFucsia}><div style={{fontSize:11,color:'#c8264a',marginBottom:4}}>A facturar</div><div style={{fontSize:18,fontWeight:700,color:'#c8264a'}}>{aFacturar.length} pptos</div></div>
          </div>

          {/* Gráfico por cliente (a facturar) */}
          {chartData.length>0&&(
            <div style={{...S.card,marginBottom:16}}>
              <div style={{fontSize:13,fontWeight:700,color:'#0d3b5e',marginBottom:12}}>Presupuestos "A facturar" por cliente</div>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {chartData.map(([cli,n])=>(
                  <div key={cli} style={{display:'flex',alignItems:'center',gap:10}}>
                    <div style={{width:120,fontSize:12,color:'#5a7a9a',textAlign:'right',flexShrink:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cli}</div>
                    <div style={{flex:1,background:'#f0f4f8',borderRadius:4,height:20,overflow:'hidden'}}>
                      <div style={{width:`${(n/maxCount)*100}%`,background:'#c8264a',height:'100%',borderRadius:4,transition:'width 0.3s'}}/>
                    </div>
                    <div style={{fontSize:12,fontWeight:700,color:'#0d3b5e',minWidth:20}}>{n}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* IA */}
          <div style={{...S.card,marginBottom:16}}>
            <div style={{fontSize:14,fontWeight:700,color:'#0d3b5e',marginBottom:10}}>🤖 Consultar con IA</div>
            <div style={{display:'flex',gap:8,marginBottom:8}}>
              <input style={{...S.input,flex:1}} value={aiQuery} onChange={e=>setAiQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&askAI()} placeholder="¿Cuánto costó el escenario? ¿Qué proveedor usamos para camisetas?"/>
              <button style={S.btnPrimary} onClick={askAI} disabled={aiLoading||!aiQuery.trim()}>{aiLoading?'…':'↗'} Consultar</button>
            </div>
            {aiResp&&<div style={{fontSize:13,lineHeight:1.7,padding:'10px 14px',background:'#f4f8fc',borderRadius:8,border:'1px solid #dde6ef',whiteSpace:'pre-wrap',maxHeight:250,overflowY:'auto'}}>{aiResp}</div>}
          </div>

          {/* Lista con filtros de estado como botones */}
          <div style={{display:'flex',gap:8,marginBottom:12,alignItems:'center',flexWrap:'wrap'}}>
            <input style={{...S.input,maxWidth:240}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar…"/>
            <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
              <button onClick={()=>setFiltro('todos')} style={{...S.btnSm,background:filtroEstado==='todos'?'#0d3b5e':'#fff',color:filtroEstado==='todos'?'#fff':'#0d3b5e',borderColor:filtroEstado==='todos'?'#0d3b5e':'#c8d8e8'}}>Todos</button>
              {ESTADOS.map(e=>(
                <button key={e} onClick={()=>setFiltro(e)} style={{...S.btnSm,background:filtroEstado===e?ESTADO_COLORS[e]:'#fff',color:filtroEstado===e?'#fff':ESTADO_COLORS[e],borderColor:filtroEstado===e?ESTADO_COLORS[e]:ESTADO_COLORS[e]+'66'}}>
                  {ESTADO_LABELS[e]}
                </button>
              ))}
            </div>
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {filtered.map(p=>{
              const t=calcPpto(p);
              return(
                <div key={p.id} style={{...S.card,cursor:'pointer',transition:'box-shadow 0.15s'}} onClick={()=>setPopupPpto(p)}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <div style={{flex:1}}>
                      {p.nomenclatura&&<div style={{fontSize:10,color:'#8aa0b8',fontFamily:'monospace',marginBottom:1}}>{p.nomenclatura}</div>}
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
                        <span style={{fontSize:15,fontWeight:700,color:'#0d3b5e'}}>{p.nombre||p.cliente}</span>
                        <Badge estado={p.estado}/>
                      </div>
                      <div style={{fontSize:12,color:'#8aa0b8',display:'flex',gap:10,flexWrap:'wrap'}}>
                        {p.cliente&&<span>🏢 {p.cliente}</span>}
                        {p.fecha_evento&&<span>📅 {p.fecha_evento}</span>}
                        {p.ciudad&&<span>📍 {p.ciudad}</span>}
                        <span>📦 {(p.items||[]).length} ítems</span>
                      </div>
                    </div>
                    <div style={{textAlign:'right',marginRight:8}}>
                      <div style={{fontSize:11,color:'#aaa'}}>Total c/IVA</div>
                      <div style={{fontSize:16,fontWeight:700,color:'#0d3b5e'}}>{fmt(t.totalConIva)}</div>
                      <div style={{fontSize:11,color:'#aaa'}}>Costo: {fmt(t.subtotalCosto)}</div>
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:4}} onClick={e=>e.stopPropagation()}>
                      <button style={S.btnSm} onClick={()=>{setEditing(p);setMainTab('presupuestos');}}>✏️ Editar</button>
                      <select style={{...S.select,fontSize:11}} value={p.estado} onChange={e=>changeEstado(p.id,e.target.value)}>
                        {ESTADOS.map(e=><option key={e} value={e}>{ESTADO_LABELS[e]}</option>)}
                      </select>
                      <button style={S.btnRed} onClick={()=>deletePpto(p.id)}>🗑</button>
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length===0&&<div style={S.empty}>{pptos.length===0?'Sin presupuestos aún.':'Sin resultados.'}</div>}
          </div>
        </div>
      )}

      {/* ══ PRESUPUESTOS ══ */}
      {mainTab==='presupuestos'&&editing===null&&(
        <div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
            <h2 style={{fontSize:20,fontWeight:700,color:'#0d3b5e'}}>📝 Presupuestos</h2>
            <button style={S.btnFucsia||S.btnPrimary} onClick={()=>setEditing('new')}>+ Nuevo presupuesto</button>
          </div>
          <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap',alignItems:'center'}}>
            <input style={{...S.input,maxWidth:260}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar…"/>
            <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
              <button onClick={()=>setFiltro('todos')} style={{...S.btnSm,background:filtroEstado==='todos'?'#0d3b5e':'#fff',color:filtroEstado==='todos'?'#fff':'#0d3b5e'}}>Todos</button>
              {ESTADOS.map(e=>(
                <button key={e} onClick={()=>setFiltro(e)} style={{...S.btnSm,background:filtroEstado===e?ESTADO_COLORS[e]:'#fff',color:filtroEstado===e?'#fff':ESTADO_COLORS[e],borderColor:ESTADO_COLORS[e]+'66'}}>
                  {ESTADO_LABELS[e]}
                </button>
              ))}
            </div>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {filtered.map(p=>{
              const t=calcPpto(p);
              return(
                <div key={p.id} style={{...S.card,cursor:'pointer'}} onClick={()=>setEditing(p)}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <div style={{flex:1}}>
                      {p.nomenclatura&&<div style={{fontSize:10,color:'#8aa0b8',fontFamily:'monospace',marginBottom:1}}>{p.nomenclatura}</div>}
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
                        <span style={{fontSize:15,fontWeight:700,color:'#0d3b5e'}}>{p.nombre||p.cliente}</span>
                        <Badge estado={p.estado}/>
                      </div>
                      <div style={{fontSize:12,color:'#8aa0b8',display:'flex',gap:10,flexWrap:'wrap'}}>
                        {p.cliente&&<span>🏢 {p.cliente}</span>}
                        {p.fecha_evento&&<span>📅 {p.fecha_evento}</span>}
                        {p.lugar&&<span>📍 {p.lugar}</span>}
                        <span>📦 {(p.items||[]).length} ítems</span>
                      </div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:11,color:'#aaa'}}>Total c/IVA</div>
                      <div style={{fontSize:18,fontWeight:700,color:'#0d3b5e'}}>{fmt(t.totalConIva)}</div>
                      <div style={{fontSize:12,color:'#8aa0b8'}}>Costo: {fmt(t.subtotalCosto)} · Margen: {fmt(t.margenTotal)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length===0&&<div style={S.empty}>{pptos.length===0?'Sin presupuestos.':'Sin resultados.'}</div>}
          </div>
        </div>
      )}

      {mainTab==='liquidaciones'&&<Liquidaciones presupuestos={pptos}/>}
      {mainTab==='admin'&&userRole==='admin'&&<Admin onLogoChange={url=>{setLogoUrl(url);localStorage.setItem('matilda_logo',url);}}/>}

      {/* Popup PDF al hacer clic en presupuesto del resumen */}
      {popupPpto&&(
        <div style={{position:'fixed',inset:0,background:'rgba(13,59,94,0.6)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
          <div style={{background:'#fff',borderRadius:14,width:'100%',maxWidth:520,padding:'24px',boxShadow:'0 8px 40px rgba(13,59,94,0.25)'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <div>
                <div style={{fontSize:10,color:'#8aa0b8',fontFamily:'monospace'}}>{popupPpto.nomenclatura}</div>
                <div style={{fontSize:17,fontWeight:700,color:'#0d3b5e'}}>{popupPpto.nombre||popupPpto.cliente}</div>
              </div>
              <button onClick={()=>setPopupPpto(null)} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:'#8aa0b8'}}>✕</button>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:16,fontSize:13}}>
              {[['Cliente',popupPpto.cliente],['Fecha',popupPpto.fecha_evento],['Lugar',popupPpto.lugar],['PAX',popupPpto.personas?popupPpto.personas+' pax':'']].filter(([,v])=>v).map(([l,v])=>(
                <div key={l} style={{background:'#f4f8fc',borderRadius:6,padding:'8px 12px'}}>
                  <div style={{fontSize:10,color:'#3dbfb8',fontWeight:700,letterSpacing:1,textTransform:'uppercase'}}>{l}</div>
                  <div style={{fontSize:13,fontWeight:600,color:'#0d3b5e'}}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:10,justifyContent:'center'}}>
              <button style={S.btnPrimary} onClick={()=>{
                const{generatePdfClienteHTML}=require('./components/PdfCliente');
                const html=generatePdfClienteHTML(popupPpto,logoUrl);
                const w=window.open('','_blank');w.document.write(html);w.document.close();
              }}>📄 PDF cliente</button>
              <button style={S.btnSecondary} onClick={()=>{setEditing(popupPpto);setMainTab('presupuestos');setPopupPpto(null);}}>✏️ Editar presupuesto</button>
            </div>
          </div>
        </div>
      )}

      <Toast msg={toast}/>
    </Shell>
  );
}

function Shell({children,user,userRole,mainTab,setMainTab,logout,logoUrl}){
  const TABS=[['resumen','📊 Resumen'],['presupuestos','📝 Presupuestos'],['liquidaciones','💰 Liquidaciones'],...(userRole==='admin'?[['admin','⚙️ Admin']]:[] )];
  return(
    <div style={{minHeight:'100vh',background:'#f0f4f8'}}>
      <nav style={{background:'#0d3b5e',padding:'0 20px',display:'flex',alignItems:'center',gap:2,position:'sticky',top:0,zIndex:100,boxShadow:'0 2px 12px rgba(13,59,94,0.4)',borderBottom:'2px solid #c8264a'}}>
        <div style={{display:'flex',alignItems:'center',marginRight:16,padding:'10px 0'}}>
          {logoUrl
            ?<img src={logoUrl} alt="Matilda" style={{height:36,objectFit:'contain'}}/>
            :<div style={{color:'#fff',fontSize:18,fontStyle:'italic',fontWeight:900,letterSpacing:1}}>matilda <span style={{fontSize:9,color:'#3dbfb8',letterSpacing:2,fontStyle:'normal',fontWeight:600}}>EVENT DESIGNERS</span></div>}
        </div>
        {TABS.map(([k,l])=>(
          <button key={k} onClick={()=>setMainTab(k)} style={{background:mainTab===k?'rgba(255,255,255,0.12)':'none',color:mainTab===k?'#fff':'#8ab4d4',border:'none',cursor:'pointer',padding:'14px 14px',fontSize:13,fontWeight:mainTab===k?700:400,borderBottom:mainTab===k?'2px solid #3dbfb8':'2px solid transparent',transition:'all 0.15s'}}>
            {l}
          </button>
        ))}
        <div style={{flex:1}}/>
        <div style={{fontSize:12,color:'#8ab4d4',marginRight:12}}>
          {user.email}
          {userRole==='admin'&&<span style={{marginLeft:6,fontSize:10,background:'#c8264a',color:'#fff',padding:'1px 7px',borderRadius:4}}>ADMIN</span>}
        </div>
        <button onClick={logout} style={{background:'none',border:'1px solid #4a6a8a',color:'#8ab4d4',padding:'5px 12px',borderRadius:5,cursor:'pointer',fontSize:12}}>Salir</button>
      </nav>
      <div style={{...S.page,paddingTop:24}}>{children}</div>
    </div>
  );
}
