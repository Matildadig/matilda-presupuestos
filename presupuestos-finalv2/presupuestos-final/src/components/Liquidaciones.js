import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { S, Label, Toast, Modal } from '../styles';
import { fmt } from '../calc';

export default function Liquidaciones({ presupuestos }) {
  const [liqs, setLiqs]     = useState([]);
  const [editing, setEditing] = useState(null);
  const [toast, setToast]   = useState('');
  const [saving, setSaving] = useState(false);
  const [openLiq, setOpenLiq] = useState(null);

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
    // Cargar ítems marcados como liquidación
    const gastosPpto=(pp?.items||[]).filter(it=>it.es_liquidacion).map(it=>({
      id:crypto.randomUUID(), concepto:it.item||'',
      subtotal15:0, subtotal0:0, iva:0, total:0,
      ruc_proveedor:'', nombre_proveedor:it.proveedor||'', num_factura:'',
      valor_asignado:it.precio_unit*(it.cantidad||1)*(it.dias||1), valor_justificado:0, notas:'',
    }));
    setEditing(prev=>({...prev, presupuesto_id:id, presupuesto_nombre:pp?(pp.nomenclatura||pp.nombre||pp.cliente):'', evento:pp?.nombre||'', gastos:gastosPpto.length>0?gastosPpto:prev.gastos}));
  }

  function addGasto(){
    const g={id:crypto.randomUUID(),concepto:'',subtotal15:0,subtotal0:0,iva:0,total:0,ruc_proveedor:'',nombre_proveedor:'',num_factura:'',valor_asignado:0,valor_justificado:0,notas:''};
    setEditing(prev=>({...prev,gastos:[...(prev.gastos||[]),g]}));
  }

  function updGasto(gid,k,v){
    setEditing(prev=>({
      ...prev,
      gastos:prev.gastos.map(g=>{
        if(g.id!==gid)return g;
        const nums=['subtotal15','subtotal0','valor_asignado','valor_justificado'];
        const upd={...g,[k]:nums.includes(k)?(parseFloat(v)||0):v};
        // Recalcular IVA y total automáticamente
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

  function downloadLiqPdf(liq){
    const t=totalesLiq(liq);
    const html=`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>Liquidación</title>
    <style>*{box-sizing:border-box;margin:0;padding:0;}body{font-family:Arial,sans-serif;font-size:12px;color:#1a1a2e;}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}.no-print{display:none;}}</style>
    </head><body style="padding:0;">
    <button class="no-print" onclick="window.print()" style="position:fixed;top:16px;right:16px;background:#c8264a;color:#fff;border:none;padding:8px 18px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;">⬇ PDF</button>
    <div style="max-width:800px;margin:0 auto;">
    <div style="background:#0d3b5e;padding:18px 32px;display:flex;justify-content:space-between;align-items:center;">
      <div style="color:#fff;font-size:20px;font-style:italic;font-weight:900;">matilda <span style="font-size:9px;color:#3dbfb8;letter-spacing:2px;font-style:normal;">EVENT DESIGNERS</span></div>
      <div style="text-align:right;"><div style="color:#3dbfb8;font-size:9px;letter-spacing:2px;">LIQUIDACIÓN DE GASTOS</div></div>
    </div>
    <div style="background:#c8264a;height:3px;"></div>
    <div style="padding:16px 32px;background:#f8fafc;border-bottom:1px solid #dde6ef;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
      <div><div style="font-size:8px;color:#3dbfb8;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:2px;">Evento</div><div style="font-weight:700;color:#0d3b5e;">${liq.evento||'—'}</div></div>
      <div><div style="font-size:8px;color:#3dbfb8;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:2px;">Responsable</div><div style="font-weight:700;color:#0d3b5e;">${liq.responsable||'—'}</div></div>
      <div><div style="font-size:8px;color:#3dbfb8;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:2px;">Presupuesto</div><div style="font-weight:700;color:#0d3b5e;">${liq.presupuesto_nombre||'—'}</div></div>
    </div>
    <div style="padding:16px 32px;">
    <table style="width:100%;border-collapse:collapse;font-size:11px;">
    <thead><tr style="background:#0d3b5e;color:#fff;">
      <th style="padding:7px 10px;text-align:left;">Concepto</th>
      <th style="padding:7px 6px;text-align:right;">Subtotal 0%</th>
      <th style="padding:7px 6px;text-align:right;">Subtotal 15%</th>
      <th style="padding:7px 6px;text-align:right;">IVA</th>
      <th style="padding:7px 6px;text-align:right;">Total</th>
      <th style="padding:7px 6px;text-align:left;">RUC</th>
      <th style="padding:7px 6px;text-align:left;">Proveedor</th>
      <th style="padding:7px 6px;text-align:left;"># Factura</th>
    </tr></thead>
    <tbody>
    ${(liq.gastos||[]).map((g,i)=>`<tr style="border-bottom:1px solid #eef2f7;background:${i%2?'#fafcfe':'#fff'};">
      <td style="padding:6px 10px;font-weight:600;">${g.concepto}</td>
      <td style="padding:6px;text-align:right;">${fmt(g.subtotal0)}</td>
      <td style="padding:6px;text-align:right;">${fmt(g.subtotal15)}</td>
      <td style="padding:6px;text-align:right;">${fmt(g.iva)}</td>
      <td style="padding:6px;text-align:right;font-weight:700;">${fmt(g.total)}</td>
      <td style="padding:6px;font-size:10px;">${g.ruc_proveedor}</td>
      <td style="padding:6px;font-size:10px;">${g.nombre_proveedor}</td>
      <td style="padding:6px;font-size:10px;">${g.num_factura}</td>
    </tr>`).join('')}
    </tbody></table>
    <div style="display:flex;justify-content:flex-end;margin-top:12px;">
      <div style="width:260px;border:1px solid #dde6ef;border-radius:4px;overflow:hidden;">
        <div style="display:flex;justify-content:space-between;padding:6px 12px;border-bottom:1px solid #dde6ef;"><span style="color:#8aa0b8;">Monto asignado</span><span style="font-weight:600;">${fmt(t.asignado)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:6px 12px;border-bottom:1px solid #dde6ef;"><span style="color:#8aa0b8;">Total justificado</span><span style="font-weight:600;">${fmt(t.justificado)}</span></div>
        <div style="display:flex;justify-content:space-between;padding:8px 12px;background:#0d3b5e;"><span style="color:#fff;font-weight:700;">Saldo</span><span style="color:#3dbfb8;font-weight:700;">${fmt(t.saldo)}</span></div>
      </div>
    </div>
    ${liq.notas?`<div style="margin-top:12px;background:#f0f7ff;border-left:3px solid #3dbfb8;padding:10px 14px;font-size:11px;">${liq.notas}</div>`:''}
    </div>
    <div style="background:#0d3b5e;padding:10px 32px;display:flex;justify-content:space-between;margin-top:8px;">
      <div style="font-size:10px;color:#8ab4d4;">mariajose@matilda.agency · +593 97 990 4839</div>
      <div style="font-size:9px;color:#3dbfb8;font-style:italic;">"Donde la estrategia se convierte en experiencia."</div>
    </div>
    </div></body></html>`;
    const w=window.open('','_blank');w.document.write(html);w.document.close();
  }

  function downloadLiqCsv(liq){
    const rows=[
      ['LIQUIDACIÓN DE GASTOS - MATILDA EVENT DESIGNERS'],[''],
      ['Evento:',liq.evento],['Responsable:',liq.responsable],['Presupuesto:',liq.presupuesto_nombre],['Estado:',liq.estado],[''],
      ['Concepto','Subtotal 0%','Subtotal 15%','IVA','Total','RUC Proveedor','Nombre Proveedor','# Factura','Asignado','Justificado'],
      ...(liq.gastos||[]).map(g=>[g.concepto,g.subtotal0,g.subtotal15,g.iva,g.total,g.ruc_proveedor,g.nombre_proveedor,g.num_factura,g.valor_asignado,g.valor_justificado]),
      [''],
    ];
    const t=totalesLiq(liq);
    rows.push(['','','','','','','','','Asignado:',t.asignado]);
    rows.push(['','','','','','','','','Justificado:',t.justificado]);
    rows.push(['','','','','','','','','Saldo:',t.saldo]);
    const csv=rows.map(r=>r.map(c=>{const s=String(c??'').replace(/"/g,'""');return s.includes(',')?`"${s}"`:s;}).join(',')).join('\n');
    const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`liquidacion_${liq.responsable||'liq'}.csv`;a.click();URL.revokeObjectURL(url);
  }

  const estadoColor={abierta:'#3dbfb8',enviada:'#0d3b5e',aprobada:'#2e8b4e'};

  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <h2 style={{fontSize:20,fontWeight:700,color:'#0d3b5e'}}>💰 Liquidaciones</h2>
        <button style={S.btnFucsia||{...S.btnPrimary,background:'#c8264a'}} onClick={()=>setEditing(emptyLiq())}>+ Nueva liquidación</button>
      </div>

      {editing&&(
        <Modal title={editing.id?'Editar liquidación':'Nueva liquidación'} onClose={()=>setEditing(null)} wide>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div style={S.grid2}>
              <div>
                <Label>Presupuesto relacionado</Label>
                <select style={S.select} value={editing.presupuesto_id||''} onChange={e=>setPpto(e.target.value)}>
                  <option value="">— Sin relacionar —</option>
                  {presupuestos.map(p=><option key={p.id} value={p.id}>{p.nomenclatura||p.nombre||p.cliente}</option>)}
                </select>
              </div>
              <div><Label>Nombre del evento</Label><input style={S.input} value={editing.evento||''} onChange={e=>setEditing(p=>({...p,evento:e.target.value}))}/></div>
              <div><Label>Responsable / Supervisor *</Label><input style={S.input} value={editing.responsable||''} onChange={e=>setEditing(p=>({...p,responsable:e.target.value}))}/></div>
              <div>
                <Label>Estado</Label>
                <select style={S.select} value={editing.estado||'abierta'} onChange={e=>setEditing(p=>({...p,estado:e.target.value}))}>
                  <option value="abierta">Abierta</option>
                  <option value="enviada">Enviada</option>
                  <option value="aprobada">Aprobada</option>
                </select>
              </div>
              <div style={{gridColumn:'1/-1'}}><Label>Notas</Label><input style={S.input} value={editing.notas||''} onChange={e=>setEditing(p=>({...p,notas:e.target.value}))}/></div>
            </div>
            <div style={S.divider}/>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <strong style={{fontSize:14,color:'#0d3b5e'}}>Gastos / Facturas</strong>
              <button style={S.btnTeal||{...S.btnPrimary,background:'#3dbfb8'}} onClick={addGasto}>+ Agregar gasto</button>
            </div>
            {(editing.gastos||[]).map(g=>(
              <div key={g.id} style={{border:'1px solid #dde6ef',borderRadius:8,padding:12}}>
                <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr auto',gap:8,marginBottom:8}}>
                  <div><Label>Concepto</Label><input style={S.input} value={g.concepto} onChange={e=>updGasto(g.id,'concepto',e.target.value)}/></div>
                  <div><Label>Subtotal 0%</Label><input type="number" style={S.input} value={g.subtotal0} onChange={e=>updGasto(g.id,'subtotal0',e.target.value)}/></div>
                  <div><Label>Subtotal 15%</Label><input type="number" style={S.input} value={g.subtotal15} onChange={e=>updGasto(g.id,'subtotal15',e.target.value)}/></div>
                  <div><Label>IVA (auto)</Label><input style={S.inputRO} readOnly value={fmt(g.iva)}/></div>
                  <div><Label>Total (auto)</Label><input style={{...S.inputRO,fontWeight:700}} readOnly value={fmt(g.total)}/></div>
                  <div style={{display:'flex',alignItems:'flex-end'}}><button style={S.btnRed} onClick={()=>delGasto(g.id)}>🗑</button></div>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:8}}>
                  <div><Label>RUC proveedor</Label><input style={S.input} value={g.ruc_proveedor||''} onChange={e=>updGasto(g.id,'ruc_proveedor',e.target.value)}/></div>
                  <div><Label>Nombre proveedor</Label><input style={S.input} value={g.nombre_proveedor||''} onChange={e=>updGasto(g.id,'nombre_proveedor',e.target.value)}/></div>
                  <div><Label># Factura</Label><input style={S.input} value={g.num_factura||''} onChange={e=>updGasto(g.id,'num_factura',e.target.value)}/></div>
                  <div><Label>Valor asignado $</Label><input type="number" style={S.input} value={g.valor_asignado||0} onChange={e=>updGasto(g.id,'valor_asignado',e.target.value)}/></div>
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
            {/* Subir comprobante */}
            <div style={{background:'#f0f7ff',borderRadius:8,padding:'10px 14px',border:'1px dashed #3dbfb8'}}>
              <Label>Comprobante de depósito (imagen)</Label>
              <input type="file" accept="image/*" style={{marginTop:6,fontSize:13}}
                onChange={e=>{
                  const file=e.target.files[0];if(!file)return;
                  const reader=new FileReader();
                  reader.onload=ev=>setEditing(p=>({...p,comprobante_url:ev.target.result}));
                  reader.readAsDataURL(file);
                }}/>
              {editing.comprobante_url&&<img src={editing.comprobante_url} alt="comprobante" style={{marginTop:8,maxHeight:120,borderRadius:4,border:'1px solid #dde6ef'}}/>}
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:8}}>
              <button style={S.btnSecondary} onClick={()=>setEditing(null)}>Cancelar</button>
              <button style={S.btnPrimary} onClick={save} disabled={saving}>{saving?'Guardando…':'💾 Guardar'}</button>
            </div>
          </div>
        </Modal>
      )}

      {liqs.length===0&&<div style={S.empty}>Sin liquidaciones. Crea la primera con el botón de arriba.</div>}
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {liqs.map(liq=>{
          const t=totalesLiq(liq);const open=openLiq===liq.id;
          return(
            <div key={liq.id} style={S.card}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{flex:1,cursor:'pointer'}} onClick={()=>setOpenLiq(open?null:liq.id)}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
                    <span style={{fontSize:15,fontWeight:700,color:'#0d3b5e'}}>{liq.evento||liq.responsable}</span>
                    <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:5,background:(estadoColor[liq.estado]||'#888')+'22',color:estadoColor[liq.estado]||'#888',border:`1px solid ${estadoColor[liq.estado]||'#888'}44`}}>{liq.estado}</span>
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
                  <button style={S.btnSm} onClick={()=>setEditing({...liq})}>✏️ Editar</button>
                  <button style={S.btnSm} onClick={()=>downloadLiqPdf(liq)}>📄 PDF</button>
                  <button style={S.btnSm} onClick={()=>downloadLiqCsv(liq)}>📊 CSV</button>
                  <button style={S.btnRed} onClick={()=>deleteLiq(liq.id)}>🗑</button>
                </div>
              </div>
              {open&&(liq.gastos||[]).length>0&&(
                <div style={{marginTop:12,borderTop:'1px solid #eee',paddingTop:12,overflowX:'auto'}}>
                  <table style={S.table}>
                    <thead><tr>{['Concepto','Sub 0%','Sub 15%','IVA','Total','RUC','Proveedor','# Factura'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {liq.gastos.map(g=>(
                        <tr key={g.id}>
                          <td style={S.td}><strong>{g.concepto}</strong></td>
                          <td style={{...S.td,textAlign:'right'}}>{fmt(g.subtotal0)}</td>
                          <td style={{...S.td,textAlign:'right'}}>{fmt(g.subtotal15)}</td>
                          <td style={{...S.td,textAlign:'right'}}>{fmt(g.iva)}</td>
                          <td style={{...S.td,textAlign:'right',fontWeight:700}}>{fmt(g.total)}</td>
                          <td style={S.td}>{g.ruc_proveedor}</td>
                          <td style={S.td}>{g.nombre_proveedor}</td>
                          <td style={S.td}>{g.num_factura}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
