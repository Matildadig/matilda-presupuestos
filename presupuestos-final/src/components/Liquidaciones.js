import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { S, Label, Toast, Modal } from '../styles';
import { fmt } from '../calc';
import { CATS_LIQUIDACION, canEditLiq, canChangeLiqToLiquidado } from '../roles';

function emptyGasto() {
  return {
    id: crypto.randomUUID(),
    concepto: '', categoria: CATS_LIQUIDACION[0],
    subtotal15: 0, subtotal0: 0, iva: 0, total: 0,
    ruc_proveedor: '', nombre_proveedor: '', num_factura: '', num_autorizacion: '',
    valor_asignado: 0, valor_justificado: 0, notas: '',
  };
}

export default function Liquidaciones({ presupuestos, userRole }) {
  const [liqs, setLiqs]       = useState([]);
  const [editing, setEditing] = useState(null);
  const [toast, setToast]     = useState('');
  const [saving, setSaving]   = useState(false);
  const [openLiq, setOpenLiq] = useState(null);
  const [subTab, setSubTab]   = useState('activas'); // 'activas' | 'liquidadas'

  const emptyLiq = () => ({
    presupuesto_id:'', presupuesto_nombre:'', evento:'',
    responsable:'', estado:'abierta', notas:'', gastos:[],
  });

  useEffect(()=>{fetchAll();},[]);

  async function fetchAll(){
    const{data}=await supabase.from('liquidaciones').select('*').order('created_at',{ascending:false});
    setLiqs(data||[]);
  }
  function showToast(m){setToast(m);setTimeout(()=>setToast(''),2500);}

  function setPpto(id){
    const pp=presupuestos.find(p=>p.id===id);
    const gastosPpto=(pp?.items||[]).filter(it=>it.es_liquidacion&&!it._type).map(it=>({
      ...emptyGasto(),
      concepto: it.item||'',
      valor_asignado: it.precio_unit*(it.cantidad||1)*(it.dias||1),
      nombre_proveedor: it.proveedor||'',
    }));
    setEditing(prev=>({
      ...prev,
      presupuesto_id:id,
      presupuesto_nombre:pp?(pp.nomenclatura||pp.nombre||pp.cliente):'',
      evento:pp?.nombre||'',
      gastos:gastosPpto.length>0?gastosPpto:(prev.gastos||[]),
    }));
  }

  function addGasto(){
    setEditing(prev=>({...prev,gastos:[...(prev.gastos||[]),emptyGasto()]}));
  }

  function updGasto(gid,k,v){
    setEditing(prev=>({
      ...prev,
      gastos:prev.gastos.map(g=>{
        if(g.id!==gid)return g;
        const nums=['subtotal15','subtotal0','valor_asignado','valor_justificado'];
        const upd={...g,[k]:nums.includes(k)?(parseFloat(v)||0):v};
        if(['subtotal15','subtotal0'].includes(k)){
          upd.iva=upd.subtotal15*0.15;
          upd.total=upd.subtotal15+upd.subtotal0+upd.iva;
          upd.valor_justificado=upd.total;
        }
        return upd;
      })
    }));
  }

  function delGasto(gid){setEditing(prev=>({...prev,gastos:prev.gastos.filter(g=>g.id!==gid)}));}

  async function save(){
    if(!editing.responsable){showToast('Ingresa el responsable');return;}
    // Validate estado change permission
    if(editing.estado==='liquidado'&&!canChangeLiqToLiquidado(userRole)){
      showToast('⚠️ Solo Financiero o Admin pueden marcar como Liquidado');return;
    }
    setSaving(true);
    let error;
    if(editing.id){({error}=await supabase.from('liquidaciones').update(editing).eq('id',editing.id));}
    else{({error}=await supabase.from('liquidaciones').insert(editing));}
    setSaving(false);
    if(error){showToast('Error: '+error.message);return;}
    showToast('Guardado ✓');setEditing(null);fetchAll();
  }

  async function deleteLiq(id){
    if(!window.confirm('¿Eliminar liquidación?'))return;
    await supabase.from('liquidaciones').delete().eq('id',id);
    fetchAll();
  }

  function totalesLiq(liq){
    const gastos=liq.gastos||[];
    const asignado=gastos.reduce((a,g)=>a+(g.valor_asignado||0),0);
    const justificado=gastos.reduce((a,g)=>a+(g.valor_justificado||0),0);
    return{asignado,justificado,saldo:asignado-justificado};
  }

  // Agrupar gastos por categoría para PDF/Excel
  function agruparPorCat(gastos){
    const map={};
    CATS_LIQUIDACION.forEach(c=>{map[c]=[];});
    gastos.forEach(g=>{
      const cat=g.categoria||CATS_LIQUIDACION[0];
      if(!map[cat])map[cat]=[];
      map[cat].push(g);
    });
    return map;
  }

  function downloadLiqPdf(liq){
    const t=totalesLiq(liq);
    const grupos=agruparPorCat(liq.gastos||[]);
    const catRows=CATS_LIQUIDACION.map(cat=>{
      const items=grupos[cat]||[];
      if(!items.length)return'';
      const subtot=items.reduce((a,g)=>a+(g.total||0),0);
      const itemRows=items.map((g,i)=>`
        <tr style="background:${i%2?'#fafcfe':'#fff'};border-bottom:1px solid #eef2f7;font-size:10px;">
          <td style="padding:5px 10px;">${g.concepto}</td>
          <td style="padding:5px 6px;text-align:right;">${fmt(g.subtotal0)}</td>
          <td style="padding:5px 6px;text-align:right;">${fmt(g.subtotal15)}</td>
          <td style="padding:5px 6px;text-align:right;">${fmt(g.iva)}</td>
          <td style="padding:5px 6px;text-align:right;font-weight:700;">${fmt(g.total)}</td>
          <td style="padding:5px 6px;font-size:9px;">${g.ruc_proveedor||''}</td>
          <td style="padding:5px 6px;font-size:9px;">${g.nombre_proveedor||''}</td>
          <td style="padding:5px 6px;font-size:9px;">${g.num_factura||''}</td>
          <td style="padding:5px 6px;font-size:9px;">${g.num_autorizacion||''}</td>
        </tr>`).join('');
      return`
        <tr><td colspan="9" style="background:#1a5078;color:#fff;padding:5px 10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">${cat}</td></tr>
        ${itemRows}
        <tr style="background:#f0f4f8;font-weight:700;font-size:10px;">
          <td style="padding:5px 10px;">Subtotal ${cat}</td>
          <td colspan="3"></td>
          <td style="padding:5px 6px;text-align:right;color:#0d3b5e;">${fmt(subtot)}</td>
          <td colspan="4"></td>
        </tr>`;
    }).join('');

    const html=`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>Liquidación</title>
    <style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;font-size:12px;color:#1a1a2e;}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}.no-print{display:none;}}</style>
    </head><body>
    <button class="no-print" onclick="window.print()" style="position:fixed;top:16px;right:16px;background:#c8264a;color:#fff;border:none;padding:8px 18px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;">⬇ PDF</button>
    <div style="max-width:900px;margin:0 auto;">
    <div style="background:#0d3b5e;padding:16px 28px;display:flex;justify-content:space-between;align-items:center;">
      <div style="color:#fff;font-size:18px;font-style:italic;font-weight:900;">matilda <span style="font-size:9px;color:#3dbfb8;letter-spacing:2px;font-style:normal;">EVENT DESIGNERS</span></div>
      <div style="text-align:right;"><div style="color:#3dbfb8;font-size:9px;letter-spacing:2px;text-transform:uppercase;">Liquidación de Gastos</div></div>
    </div>
    <div style="background:#c8264a;height:3px;"></div>
    <div style="padding:12px 28px;background:#f8fafc;border-bottom:1px solid #dde6ef;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
      ${[['Evento',liq.evento],['Responsable',liq.responsable],['Presupuesto',liq.presupuesto_nombre]].map(([l,v])=>`
        <div><div style="font-size:8px;color:#3dbfb8;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:2px;">${l}</div><div style="font-weight:700;color:#0d3b5e;font-size:12px;">${v||'—'}</div></div>`).join('')}
    </div>
    <div style="padding:12px 28px;">
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:#0d3b5e;color:#fff;font-size:9px;text-transform:uppercase;">
          <th style="padding:6px 10px;text-align:left;">Concepto</th>
          <th style="padding:6px 6px;text-align:right;">Sub 0%</th>
          <th style="padding:6px 6px;text-align:right;">Sub 15%</th>
          <th style="padding:6px 6px;text-align:right;">IVA</th>
          <th style="padding:6px 6px;text-align:right;">Total</th>
          <th style="padding:6px 6px;text-align:left;">RUC</th>
          <th style="padding:6px 6px;text-align:left;">Proveedor</th>
          <th style="padding:6px 6px;text-align:left;"># Factura</th>
          <th style="padding:6px 6px;text-align:left;"># Autorización</th>
        </tr></thead>
        <tbody>
          ${catRows}
          <tr style="background:#0d3b5e;color:#fff;font-weight:700;font-size:11px;">
            <td style="padding:8px 10px;">TOTAL GENERAL</td>
            <td colspan="3"></td>
            <td style="padding:8px 6px;text-align:right;color:#3dbfb8;">${fmt(t.justificado)}</td>
            <td colspan="4"></td>
          </tr>
        </tbody>
      </table>
    </div>
    <div style="margin:0 28px 16px;border:1px solid #dde6ef;border-radius:6px;overflow:hidden;">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;">
        ${[['Monto asignado',fmt(t.asignado),'#0d3b5e'],['Total justificado',fmt(t.justificado),'#0d3b5e'],['Saldo',fmt(t.saldo),t.saldo>=0?'#2e8b4e':'#c8264a']].map(([l,v,col])=>`
          <div style="padding:10px 16px;border-right:1px solid #dde6ef;">
            <div style="font-size:10px;color:#888;margin-bottom:3px;">${l}</div>
            <div style="font-size:15px;font-weight:700;color:${col};">${v}</div>
          </div>`).join('')}
      </div>
    </div>
    ${liq.comprobante_url?`<div style="margin:0 28px 16px;"><div style="font-size:10px;color:#888;margin-bottom:4px;">Comprobante de depósito:</div><img src="${liq.comprobante_url}" style="max-height:120px;border:1px solid #dde6ef;border-radius:4px;"/></div>`:''}
    <div style="background:#0d3b5e;padding:10px 28px;display:flex;justify-content:center;">
      <div style="font-size:9px;color:#3dbfb8;font-style:italic;">"Donde la estrategia se convierte en experiencia."</div>
    </div>
    </div></body></html>`;
    const w=window.open('','_blank');w.document.write(html);w.document.close();
  }

  function downloadLiqCsv(liq){
    const t=totalesLiq(liq);
    const grupos=agruparPorCat(liq.gastos||[]);
    const rows=[
      ['LIQUIDACIÓN DE GASTOS - MATILDA EVENT DESIGNERS'],[''],
      ['Evento:',liq.evento],['Responsable:',liq.responsable],
      ['Presupuesto:',liq.presupuesto_nombre],['Estado:',liq.estado],[''],
    ];
    CATS_LIQUIDACION.forEach(cat=>{
      const items=grupos[cat]||[];
      if(!items.length)return;
      rows.push([cat.toUpperCase()]);
      rows.push(['Concepto','Sub 0%','Sub 15%','IVA','Total','RUC','Proveedor','# Factura','# Autorización']);
      items.forEach(g=>rows.push([g.concepto,g.subtotal0,g.subtotal15,g.iva,g.total,g.ruc_proveedor,g.nombre_proveedor,g.num_factura,g.num_autorizacion]));
      const subtot=items.reduce((a,g)=>a+(g.total||0),0);
      rows.push([`Subtotal ${cat}`,'','','',subtot,'','','','']);
      rows.push([]);
    });
    rows.push(['TOTAL GENERAL','','','',t.justificado]);
    rows.push([]);
    rows.push(['Monto asignado:',t.asignado]);
    rows.push(['Total justificado:',t.justificado]);
    rows.push(['Saldo:',t.saldo]);
    const csv=rows.map(r=>r.map(c=>{const s=String(c??'').replace(/"/g,'""');return s.includes(',')?`"${s}"`:s;}).join(',')).join('\n');
    const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');
    a.href=url;a.download=`liquidacion_${liq.responsable||'liq'}.csv`;a.click();URL.revokeObjectURL(url);
  }

  const estadoColor={abierta:'#3dbfb8',enviada:'#0d3b5e',liquidado:'#2e8b4e'};
  const activas=liqs.filter(l=>l.estado!=='liquidado');
  const liquidadas=liqs.filter(l=>l.estado==='liquidado');
  const listaActual=subTab==='activas'?activas:liquidadas;
  // Solo presupuestos activos para relacionar (no los ya liquidados)
  const pptosActivos=presupuestos.filter(p=>p.estado!=='facturado'||subTab==='activas');

  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <h2 style={{fontSize:20,fontWeight:700,color:'#0d3b5e'}}>💰 Liquidaciones</h2>
        <button style={{...S.btnPrimary,background:'#c8264a'}} onClick={()=>setEditing(emptyLiq())}>+ Nueva liquidación</button>
      </div>

      {/* Sub-tabs */}
      <div style={{display:'flex',gap:4,marginBottom:16,borderBottom:'2px solid #dde6ef',paddingBottom:0}}>
        <button onClick={()=>setSubTab('activas')} style={{padding:'8px 16px',border:'none',cursor:'pointer',fontSize:13,background:'none',borderBottom:subTab==='activas'?'2px solid #c8264a':'2px solid transparent',fontWeight:subTab==='activas'?700:400,color:subTab==='activas'?'#c8264a':'#5a7a9a',marginBottom:-2}}>
          Activas ({activas.length})
        </button>
        <button onClick={()=>setSubTab('liquidadas')} style={{padding:'8px 16px',border:'none',cursor:'pointer',fontSize:13,background:'none',borderBottom:subTab==='liquidadas'?'2px solid #2e8b4e':'2px solid transparent',fontWeight:subTab==='liquidadas'?700:400,color:subTab==='liquidadas'?'#2e8b4e':'#5a7a9a',marginBottom:-2}}>
          Liquidadas ({liquidadas.length})
        </button>
      </div>

      {/* Modal editor */}
      {editing&&(
        <Modal title={editing.id?'Editar liquidación':'Nueva liquidación'} onClose={()=>setEditing(null)} wide>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div style={S.grid2}>
              <div>
                <Label>Presupuesto relacionado</Label>
                <select style={S.select} value={editing.presupuesto_id||''} onChange={e=>setPpto(e.target.value)}>
                  <option value="">— Sin relacionar —</option>
                  {presupuestos.filter(p=>p.estado!=='facturado').map(p=><option key={p.id} value={p.id}>{p.nomenclatura||p.nombre||p.cliente}</option>)}
                </select>
              </div>
              <div><Label>Nombre del evento</Label><input style={S.input} value={editing.evento||''} onChange={e=>setEditing(p=>({...p,evento:e.target.value}))}/></div>
              <div><Label>Responsable / Supervisor *</Label><input style={S.input} value={editing.responsable||''} onChange={e=>setEditing(p=>({...p,responsable:e.target.value}))}/></div>
              <div>
                <Label>Estado</Label>
                <select style={S.select} value={editing.estado||'abierta'} onChange={e=>{
                  if(e.target.value==='liquidado'&&!canChangeLiqToLiquidado(userRole)){
                    showToast('⚠️ Solo Financiero puede marcar como Liquidado');return;
                  }
                  setEditing(p=>({...p,estado:e.target.value}));
                }}>
                  <option value="abierta">Abierta</option>
                  <option value="enviada">Enviada</option>
                  {canChangeLiqToLiquidado(userRole)&&<option value="liquidado">Liquidado</option>}
                </select>
              </div>
              <div style={{gridColumn:'1/-1'}}><Label>Notas</Label><input style={S.input} value={editing.notas||''} onChange={e=>setEditing(p=>({...p,notas:e.target.value}))}/></div>
            </div>

            <div style={S.divider}/>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <strong style={{fontSize:14,color:'#0d3b5e'}}>Gastos / Facturas</strong>
              <button style={{...S.btnPrimary,background:'#3dbfb8',fontSize:13}} onClick={addGasto}>+ Agregar gasto</button>
            </div>

            {(editing.gastos||[]).map(g=>(
              <div key={g.id} style={{border:'1px solid #dde6ef',borderRadius:8,padding:12}}>
                <div style={{display:'grid',gridTemplateColumns:'2fr 2fr auto',gap:8,marginBottom:8,alignItems:'end'}}>
                  <div><Label>Concepto</Label><input style={S.input} value={g.concepto} onChange={e=>updGasto(g.id,'concepto',e.target.value)}/></div>
                  <div>
                    <Label>Categoría</Label>
                    <select style={S.select} value={g.categoria||CATS_LIQUIDACION[0]} onChange={e=>updGasto(g.id,'categoria',e.target.value)}>
                      {CATS_LIQUIDACION.map(c=><option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <button style={S.btnRed} onClick={()=>delGasto(g.id)}>🗑</button>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:8,marginBottom:8}}>
                  <div><Label>Subtotal 0%</Label><input type="number" style={S.input} value={g.subtotal0} onChange={e=>updGasto(g.id,'subtotal0',e.target.value)}/></div>
                  <div><Label>Subtotal 15%</Label><input type="number" style={S.input} value={g.subtotal15} onChange={e=>updGasto(g.id,'subtotal15',e.target.value)}/></div>
                  <div><Label>IVA (auto)</Label><input style={S.inputRO} readOnly value={fmt(g.iva)}/></div>
                  <div><Label>Total (auto)</Label><input style={{...S.inputRO,fontWeight:700}} readOnly value={fmt(g.total)}/></div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:8}}>
                  <div><Label>RUC proveedor</Label><input style={S.input} value={g.ruc_proveedor||''} onChange={e=>updGasto(g.id,'ruc_proveedor',e.target.value)}/></div>
                  <div><Label>Nombre proveedor</Label><input style={S.input} value={g.nombre_proveedor||''} onChange={e=>updGasto(g.id,'nombre_proveedor',e.target.value)}/></div>
                  <div><Label># Factura</Label><input style={S.input} value={g.num_factura||''} onChange={e=>updGasto(g.id,'num_factura',e.target.value)}/></div>
                  <div><Label># Autorización</Label><input style={S.input} value={g.num_autorizacion||''} onChange={e=>updGasto(g.id,'num_autorizacion',e.target.value)}/></div>
                </div>
              </div>
            ))}

            {(editing.gastos||[]).length>0&&(()=>{
              const t=totalesLiq(editing);
              return(
                <div style={{display:'flex',gap:16,background:'#f0f4f8',borderRadius:8,padding:'10px 14px'}}>
                  <span style={{fontSize:13}}>Asignado: <strong>{fmt(t.asignado)}</strong></span>
                  <span style={{fontSize:13}}>Justificado: <strong>{fmt(t.justificado)}</strong></span>
                  <span style={{fontSize:13,color:t.saldo>=0?'#2e8b4e':'#c8264a'}}>Saldo: <strong>{fmt(t.saldo)}</strong></span>
                </div>
              );
            })()}

            <div style={{background:'#f0f7ff',borderRadius:8,padding:'10px 14px',border:'1px dashed #3dbfb8'}}>
              <Label>Comprobante de depósito (imagen)</Label>
              <input type="file" accept="image/*" style={{marginTop:6,fontSize:13}}
                onChange={e=>{
                  const file=e.target.files[0];if(!file)return;
                  const reader=new FileReader();
                  reader.onload=ev=>setEditing(p=>({...p,comprobante_url:ev.target.result}));
                  reader.readAsDataURL(file);
                }}/>
              {editing.comprobante_url&&<img src={editing.comprobante_url} alt="comprobante" style={{marginTop:8,maxHeight:100,borderRadius:4,border:'1px solid #dde6ef'}}/>}
            </div>

            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:8}}>
              <button style={S.btnSecondary} onClick={()=>setEditing(null)}>Cancelar</button>
              <button style={S.btnPrimary} onClick={save} disabled={saving}>{saving?'Guardando…':'💾 Guardar'}</button>
            </div>
          </div>
        </Modal>
      )}

      {listaActual.length===0&&<div style={S.empty}>{subTab==='activas'?'Sin liquidaciones activas.':'Sin liquidaciones liquidadas.'}</div>}
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {listaActual.map(liq=>{
          const t=totalesLiq(liq);const open=openLiq===liq.id;
          const bloqueado=!canEditLiq(userRole,liq.estado);
          return(
            <div key={liq.id} style={{...S.card,border:`1px solid ${bloqueado?'#2e8b4e44':'#dde6ef'}`}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{flex:1,cursor:'pointer'}} onClick={()=>setOpenLiq(open?null:liq.id)}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
                    <span style={{fontSize:15,fontWeight:700,color:'#0d3b5e'}}>{liq.evento||liq.responsable}</span>
                    <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:5,background:(estadoColor[liq.estado]||'#888')+'22',color:estadoColor[liq.estado]||'#888',border:`1px solid ${estadoColor[liq.estado]||'#888'}44`}}>{liq.estado}</span>
                    {bloqueado&&<span style={{fontSize:10,background:'#2e8b4e22',color:'#2e8b4e',padding:'1px 5px',borderRadius:3,fontWeight:700}}>🔒</span>}
                  </div>
                  <div style={{fontSize:12,color:'#8aa0b8',display:'flex',gap:12}}>
                    {liq.presupuesto_nombre&&<span>📋 {liq.presupuesto_nombre}</span>}
                    {liq.responsable&&<span>👤 {liq.responsable}</span>}
                    <span>🧾 {(liq.gastos||[]).length} gastos</span>
                  </div>
                </div>
                <div style={{textAlign:'right',marginRight:12}}>
                  <div style={{fontSize:11,color:'#aaa'}}>Asignado / Justificado</div>
                  <div style={{fontSize:15,fontWeight:700}}>{fmt(t.asignado)} / {fmt(t.justificado)}</div>
                  <div style={{fontSize:12,fontWeight:700,color:t.saldo>=0?'#2e8b4e':'#c8264a'}}>Saldo: {fmt(t.saldo)}</div>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:4}}>
                  {!bloqueado&&<button style={S.btnSm} onClick={()=>setEditing({...liq})}>✏️ Editar</button>}
                  <button style={S.btnSm} onClick={()=>downloadLiqPdf(liq)}>📄 PDF</button>
                  <button style={S.btnSm} onClick={()=>downloadLiqCsv(liq)}>📊 CSV</button>
                  {userRole==='admin'&&<button style={S.btnRed} onClick={()=>deleteLiq(liq.id)}>🗑</button>}
                </div>
              </div>
              {open&&(liq.gastos||[]).length>0&&(
                <div style={{marginTop:12,borderTop:'1px solid #eee',paddingTop:12,overflowX:'auto'}}>
                  {CATS_LIQUIDACION.map(cat=>{
                    const items=(liq.gastos||[]).filter(g=>(g.categoria||CATS_LIQUIDACION[0])===cat);
                    if(!items.length)return null;
                    const subtot=items.reduce((a,g)=>a+(g.total||0),0);
                    return(
                      <div key={cat} style={{marginBottom:12}}>
                        <div style={{background:'#0d3b5e',color:'#fff',padding:'4px 10px',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:1}}>{cat}</div>
                        <table style={{width:'100%',fontSize:11,borderCollapse:'collapse'}}>
                          <thead><tr style={{background:'#e8f0f8'}}>{['Concepto','Sub 0%','Sub 15%','IVA','Total','RUC','Proveedor','# Factura','# Autorización'].map(h=><th key={h} style={{padding:'5px 8px',textAlign:h==='Concepto'?'left':'right',color:'#0d3b5e',fontSize:9,textTransform:'uppercase'}}>{h}</th>)}</tr></thead>
                          <tbody>
                            {items.map(g=>(
                              <tr key={g.id} style={{borderBottom:'1px solid #eef2f7'}}>
                                <td style={{padding:'5px 8px'}}>{g.concepto}</td>
                                <td style={{padding:'5px 8px',textAlign:'right'}}>{fmt(g.subtotal0)}</td>
                                <td style={{padding:'5px 8px',textAlign:'right'}}>{fmt(g.subtotal15)}</td>
                                <td style={{padding:'5px 8px',textAlign:'right'}}>{fmt(g.iva)}</td>
                                <td style={{padding:'5px 8px',textAlign:'right',fontWeight:700}}>{fmt(g.total)}</td>
                                <td style={{padding:'5px 8px',fontSize:10}}>{g.ruc_proveedor}</td>
                                <td style={{padding:'5px 8px',fontSize:10}}>{g.nombre_proveedor}</td>
                                <td style={{padding:'5px 8px',fontSize:10}}>{g.num_factura}</td>
                                <td style={{padding:'5px 8px',fontSize:10}}>{g.num_autorizacion}</td>
                              </tr>
                            ))}
                            <tr style={{background:'#f0f4f8',fontWeight:700}}>
                              <td style={{padding:'5px 8px',color:'#0d3b5e'}}>Subtotal {cat}</td>
                              <td colSpan={3}></td>
                              <td style={{padding:'5px 8px',textAlign:'right',color:'#0d3b5e'}}>{fmt(subtot)}</td>
                              <td colSpan={4}></td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                  <div style={{background:'#0d3b5e',color:'#fff',padding:'8px 14px',display:'flex',justifyContent:'space-between',borderRadius:4}}>
                    <span style={{fontWeight:700,fontSize:12}}>Total justificado</span>
                    <span style={{fontWeight:700,fontSize:14,color:'#3dbfb8'}}>{fmt(t.justificado)}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Toast msg={toast}/>
    </div>
  );
}
