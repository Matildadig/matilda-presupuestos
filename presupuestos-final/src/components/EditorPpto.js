import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { S, Label, Badge, Toast } from '../styles';
import { calcItem, calcPpto, genNomenclatura, fmt, fmtPct } from '../calc';
import { generatePdfClienteHTML, generatePdfFinancieroHTML, generateExcelFinancieroData } from './PdfCliente';
import {
  ESTADOS_PPTO, ESTADOS_PPTO_LABELS,
  canChangeEstadoPpto, canEditPpto, canApproveCostoReal, canEditBcoReal,
} from '../roles';

const SESSION_KEY = 'matilda_editor_draft';
const SESSION_TAB = 'matilda_editor_tab';
const ESTADOS_CIERRE = ['aprobado','pendiente_facturar','facturado'];

function emptyItem(p) {
  return {
    id: crypto.randomUUID(),
    item:'', detalle:'', cantidad:1, dias:1,
    costo_unit:0, costo_real_unit:null, bco_real_pct:null,
    costo_aprobado:false,
    oh_pct:Number(p?.oh_pct??15), bco_pct:Number(p?.bco_pct??5.5),
    precio_unit:0, proveedor:'', num_factura_prov:'', info:'',
    categoria:'', subcategoria:'', es_liquidacion:false,
    foto_referencia:null,
  };
}

export default function EditorPpto({ ppto, onSave, onCancel, cfg, categorias, clientes, ejecutivos, logoUrl, userRole='produccion' }) {
  const [p, setP]               = useState(null);
  const [tab, setTab]           = useState('info');
  const [openItem, setOpenItem] = useState(null);
  const [saving, setSaving]     = useState(false);
  const [toast, setToast]       = useState('');
  const [previewMode, setPreviewMode] = useState(null);

  useEffect(() => {
    if (p) { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(p)); } catch {} }
  }, [p]);

  useEffect(() => {
    try { sessionStorage.setItem(SESSION_TAB, tab); } catch {}
  }, [tab]);

  useEffect(() => {
    const pptoId = ppto?.id || 'new';
    try {
      const draft   = JSON.parse(sessionStorage.getItem(SESSION_KEY));
      const savedTab = sessionStorage.getItem(SESSION_TAB) || 'info';
      if (draft && (draft.id === pptoId || (!draft.id && pptoId === 'new'))) {
        setP(draft); setTab(savedTab); return;
      }
    } catch {}
    if (ppto) {
      const items = (ppto.items||[]).map(it=>({
        ...it,
        costo_unit:      it.costo_unit      ?? it.costo ?? 0,
        costo_real_unit: it.costo_real_unit ?? null,
        precio_unit:     it.precio_unit     ?? it.precio ?? 0,
        cantidad:        it.cantidad        ?? 1,
        dias:            it.dias            ?? 1,
      }));
      setP({...JSON.parse(JSON.stringify(ppto)), items});
    } else {
      setP({
        nombre:'', cliente:'', fecha_evento:new Date().toISOString().slice(0,10),
        ciudad:'Guayaquil', lugar:'', horario:'', personas:0, dias_evento:1,
        fee_agencia: cfg?.fee_agencia ?? 0,
        rebate_pct:  cfg?.rebate_pct  ?? 2,
        oh_pct:      cfg?.oh_pct      ?? 15,
        bco_pct:     cfg?.bco_pct     ?? 5.5,
        apply_rebate:false, estado:'borrador', notas:'', items:[], nomenclatura:'',
        ejecutivo_nombre:'', ejecutivo_email:'',
      });
    }
    setTab('info');
  }, [ppto, cfg]);

  function showToast(m){setToast(m);setTimeout(()=>setToast(''),2500);}
  function setField(k,v){setP(prev=>({...prev,[k]:v}));}
  function setNum(k,v){setP(prev=>({...prev,[k]:v===''?0:parseFloat(v)??0}));}
  function setCliente(n){setP(prev=>({...prev,cliente:n,apply_rebate:n.toUpperCase().includes('TESALIA')}));}

  function addItem(){const it=emptyItem(p);setP(prev=>({...prev,items:[...prev.items,it]}));setOpenItem(it.id);}
  function updItem(id,k,v){
    const nums=['costo_unit','costo_real_unit','precio_unit','oh_pct','bco_pct','bco_real_pct','cantidad','dias'];
    setP(prev=>({...prev,items:prev.items.map(it=>{
      if(it.id!==id)return it;
      if(k==='es_liquidacion'||k==='costo_aprobado')return{...it,[k]:v};
      if(k==='foto_referencia')return{...it,[k]:v};
      if(nums.includes(k)){
        if(k==='costo_real_unit'||k==='bco_real_pct') return{...it,[k]:v===''||v===null?null:parseFloat(v)??null};
        return{...it,[k]:v===''?0:parseFloat(v)??0};
      }
      return{...it,[k]:v};
    })}));
  }
  function delItem(id){setP(prev=>({...prev,items:prev.items.filter(it=>it.id!==id)}));if(openItem===id)setOpenItem(null);}

  async function save(){
    if(!p.nombre&&!p.cliente){showToast('Ingresa nombre o cliente');return;}
    if(!canEditPpto(userRole,p.estado)){showToast('⚠️ Este presupuesto está bloqueado');return;}
    // Warning check: costo > precio
    const tots=calcPpto(p);
    if(tots.hasWarning){
      setToast('⚠️ ADVERTENCIA: Hay ítems donde el costo supera el precio cliente. Revisa la pestaña Ítems.');
      // Still save but show warning — don't return
    }
    setSaving(true);
    let nomenclatura=p.nomenclatura;
    if(!nomenclatura){
      const{count}=await supabase.from('presupuestos').select('*',{count:'exact',head:true});
      nomenclatura=genNomenclatura(p.nombre,p.cliente,(count||0)+1);
    }
    const payload={...p,nomenclatura};
    let error,data;
    if(p.id){({error}=await supabase.from('presupuestos').update(payload).eq('id',p.id));}
    else{({data,error}=await supabase.from('presupuestos').insert(payload).select().single());if(data)setP(prev=>({...prev,id:data.id,nomenclatura}));}
    setSaving(false);
    if(error){showToast('Error: '+error.message);return;}
    try{sessionStorage.removeItem(SESSION_KEY);sessionStorage.removeItem(SESSION_TAB);}catch{}
    showToast('Guardado ✓');onSave();
  }

  function openPdfCliente(){
    if(!p)return;
    const html=generatePdfClienteHTML(p,logoUrl);
    const w=window.open('','_blank');w.document.write(html);w.document.close();
  }

  function openPdfFinanciero(){
    if(!p)return;
    const html=generatePdfFinancieroHTML(p,logoUrl);
    const w=window.open('','_blank');w.document.write(html);w.document.close();
  }
  function downloadExcel(){
    if(!p)return;
    import('xlsx').then(XLSX=>{
      const wb = XLSX.utils.book_new();
      const t = calcPpto(p);

      // ── Colores Matilda ──
      const NAVY   = '0D3B5E';
      const FUCSIA = 'C8264A';
      const TEAL   = '3DBFB8';
      const WHITE  = 'FFFFFF';
      const GRAY   = 'F0F4F8';
      const RED_L  = 'FDEEF1';
      const GRN_L  = 'EDF7ED';
      const YEL_L  = 'FFF8E6';

      const style = (opts={}) => ({
        font:      { name:'Calibri', sz: opts.sz||10, bold:!!opts.bold, color:{rgb: opts.fc||'1A1A2E'} },
        fill:      opts.bg ? { patternType:'solid', fgColor:{rgb:opts.bg} } : undefined,
        border:    { top:{style:'thin',color:{rgb:'C8D8E8'}}, bottom:{style:'thin',color:{rgb:'C8D8E8'}}, left:{style:'thin',color:{rgb:'C8D8E8'}}, right:{style:'thin',color:{rgb:'C8D8E8'}} },
        alignment: { horizontal: opts.align||'left', vertical:'center', wrapText:!!opts.wrap },
      });

      // ── Hoja 1: Detalle ──
      const wsData = [];
      const wsStyles = {};
      let row = 0;

      const addRow = (cells, rowStyle) => {
        wsData.push(cells.map(c=>c.v!==undefined?c.v:c));
        cells.forEach((c,col)=>{
          if(c.s||rowStyle){
            const addr = XLSX.utils.encode_cell({r:row,c:col});
            wsStyles[addr] = c.s || rowStyle;
          }
        });
        row++;
      };

      // Título
      addRow([{v:'PRESUPUESTO FINANCIERO — MATILDA EVENT DESIGNERS',s:style({bold:true,sz:14,fc:WHITE,bg:NAVY,align:'center'})},...Array(12).fill({v:'',s:style({bg:NAVY})})]);

      // Info
      addRow([]);row++;
      const infoStyle = style({bold:true,bg:GRAY});
      const valStyle  = style({});
      [
        ['Código',    p.nomenclatura||''],
        ['Cliente',   p.cliente||''],
        ['Evento',    p.nombre||''],
        ['Fecha',     p.fecha_evento||''],
        ['Lugar',     p.lugar||''],
        ['PAX',       p.personas||''],
        ['Ejecutivo', p.ejecutivo_nombre||''],
        ['Correo',    p.ejecutivo_email||''],
      ].forEach(([label,val])=>{
        addRow([{v:label,s:style({bold:true,bg:GRAY})},{v:val,s:valStyle},...Array(11).fill({v:''})]);
      });

      addRow([]);row++;

      // Cabecera de tabla — columnas en orden correcto
      const HEADERS = [
        {v:'Subcategoría', s:style({bold:true,fc:WHITE,bg:NAVY})},
        {v:'Categoría',    s:style({bold:true,fc:WHITE,bg:NAVY})},
        {v:'Ítem',         s:style({bold:true,fc:WHITE,bg:NAVY,wrap:true})},
        {v:'Detalle',      s:style({bold:true,fc:WHITE,bg:NAVY,wrap:true})},
        {v:'Cant.',        s:style({bold:true,fc:WHITE,bg:NAVY,align:'center'})},
        {v:'Días',         s:style({bold:true,fc:WHITE,bg:NAVY,align:'center'})},
        {v:'C.Unit',       s:style({bold:true,fc:'FFCCCC',bg:NAVY,align:'right'})},
        {v:'C.Total',      s:style({bold:true,fc:'FFCCCC',bg:NAVY,align:'right'})},
        {v:'P.Unit',       s:style({bold:true,fc:'AADDFF',bg:NAVY,align:'right'})},
        {v:'P.Total',      s:style({bold:true,fc:'AADDFF',bg:NAVY,align:'right'})},
        {v:'Proveedor',    s:style({bold:true,fc:WHITE,bg:NAVY})},
        {v:'# Factura',    s:style({bold:true,fc:WHITE,bg:NAVY})},
        {v:'C.Real Unit',  s:style({bold:true,fc:'AAFFCC',bg:NAVY,align:'right'})},
        {v:'C.Real Total', s:style({bold:true,fc:'AAFFCC',bg:NAVY,align:'right'})},
        {v:'Ahorro',       s:style({bold:true,fc:'AAFFCC',bg:NAVY,align:'right'})},
        {v:'Margen',       s:style({bold:true,fc:'FFFFAA',bg:NAVY,align:'right'})},
        {v:'% Margen',     s:style({bold:true,fc:'FFFFAA',bg:NAVY,align:'right'})},
        {v:'OH+BCO $',     s:style({bold:true,fc:'FFDDAA',bg:NAVY,align:'right'})},
        {v:'Total Costo',  s:style({bold:true,fc:'FFDDAA',bg:NAVY,align:'right'})},
        {v:'Aprobado',     s:style({bold:true,fc:WHITE,bg:NAVY,align:'center'})},
      ];
      addRow(HEADERS);

      const headerRow = row - 1;

      // Ítems agrupados
      let prevSubcat = null;
      let altRow = false;
      (p.items||[]).forEach(it=>{
        if(it._type==='subcat'){
          prevSubcat = it.subcategoria;
          // Fila de subcategoría
          addRow([
            {v:it.subcategoria, s:style({bold:true,fc:WHITE,bg:'1A5078'})},
            ...Array(19).fill({v:'',s:style({bg:'1A5078'})})
          ]);
          altRow = false;
          return;
        }
        const c = calcItem(it);
        const tieneReal = it.costo_real_unit!=null && it.costo_real_unit!==undefined;
        const bg = altRow ? 'F8FAFC' : WHITE;
        const numSt = (v, extra={}) => ({v, s:style({align:'right', bg, ...extra})});
        const txtSt = (v) => ({v, s:style({bg})});
        addRow([
          txtSt(it.subcategoria||''),
          txtSt(it.categoria||''),
          {v:it.item||'', s:style({bold:true,bg,wrap:true})},
          txtSt(it.detalle||''),
          {v:c.cantidad, s:style({align:'center',bg})},
          {v:c.dias,     s:style({align:'center',bg})},
          numSt(c.costoUnit,  {fc:'8B1A1A'}),
          numSt(c.costoTotal, {fc:'8B1A1A',bold:true}),
          numSt(c.precioU,    {fc:'0D3B5E'}),
          numSt(c.precio,     {fc:'0D3B5E',bold:true}),
          txtSt(it.proveedor||''),
          txtSt(it.num_factura_prov||''),
          tieneReal ? numSt(c.costoRealUnit,  {fc:'1A6E3E'})              : {v:'—',s:style({align:'right',bg,fc:'BBBBBB'})},
          tieneReal ? numSt(c.costoRealTotal, {fc:'1A6E3E'})              : {v:'—',s:style({align:'right',bg,fc:'BBBBBB'})},
          tieneReal ? numSt(c.ahorro, {fc:c.ahorro>=0?'1A6E3E':'C8264A',bold:true}) : {v:'—',s:style({align:'right',bg,fc:'BBBBBB'})},
          numSt(c.margen,     {fc:c.margen>=0?'1A6E3E':'C8264A',bold:true}),
          {v:c.margenPct.toFixed(1)+'%', s:style({align:'right',bg,fc:c.margen>=0?'1A6E3E':'C8264A'})},
          numSt(c.ohVal+c.bcoVal, {fc:'7A5500'}),
          numSt(c.totalCosto,     {fc:'5A2A7E',bold:true}),
          {v:it.costo_aprobado?'✅':'', s:style({align:'center',bg:it.costo_aprobado?GRN_L:bg})},
        ]);
        altRow = !altRow;
      });

      // Fila de totales
      addRow([
        {v:'TOTALES', s:style({bold:true,fc:WHITE,bg:NAVY})},
        ...Array(5).fill({v:'',s:style({bg:NAVY})}),
        {v:t.subtotalCosto,  s:style({bold:true,align:'right',fc:'FFCCCC',bg:NAVY})},
        {v:'',s:style({bg:NAVY})},
        {v:t.subtotalPrecio, s:style({bold:true,align:'right',fc:'AADDFF',bg:NAVY})},
        {v:t.totalConIva,    s:style({bold:true,align:'right',fc:TEAL,bg:NAVY})},
        ...Array(4).fill({v:'',s:style({bg:NAVY})}),
        {v:t.subtotalCostoReal>0?t.subtotalCostoReal:'—', s:style({bold:true,align:'right',fc:'AAFFCC',bg:NAVY})},
        {v:t.subtotalAhorro>0?t.subtotalAhorro:'—',       s:style({bold:true,align:'right',fc:'AAFFCC',bg:NAVY})},
        {v:t.margenTotal,    s:style({bold:true,align:'right',fc:TEAL,bg:NAVY})},
        {v:t.margenPct.toFixed(1)+'%',s:style({bold:true,align:'right',fc:TEAL,bg:NAVY})},
        ...Array(3).fill({v:'',s:style({bg:NAVY})}),
      ]);

      // ── Resumen financiero (debajo) ──
      row++;addRow([]);
      addRow([{v:'RESUMEN FINANCIERO',s:style({bold:true,sz:11,fc:WHITE,bg:NAVY})},...Array(3).fill({v:'',s:style({bg:NAVY})})]);

      const resRows = [
        ['Subtotal costo proveedores', t.subtotalCosto, GRAY, '5A7A9A'],
        ['OH acumulado',               t.subtotalOH,   GRAY, '7A5500'],
        ['BCO acumulado',              t.subtotalBCO,  GRAY, '7A5500'],
        ['Total costo c/OH+BCO',       t.subtotalCosto,GRAY, '5A2A7E'],
        ['Subtotal precio cliente',    t.subtotalPrecio,GRAY,'0D3B5E'],
        [`Fee agencia ${p.fee_agencia??0}%`, t.feeAgencia, GRAY,'0D3B5E'],
        ['Subtotal sin IVA',           t.totalSinIva,  'E8F0FB','0D3B5E'],
        ['IVA 15%',                    t.iva15,        GRAY,'555555'],
        ['TOTAL CON IVA',              t.totalConIva,  NAVY, WHITE],
        ['Margen cotizado',            t.margenTotal,  t.margenTotal>=0?GRN_L:RED_L, t.margenTotal>=0?'1A6E3E':'C8264A'],
        ...(t.subtotalCostoReal>0?[
          ['Costo real total',     t.subtotalCostoReal, GRN_L,'1A6E3E'],
          ['Ahorro total',         t.subtotalAhorro,    GRN_L,'1A6E3E'],
          ['Margen real',          t.margenRealTotal,   GRN_L,'1A6E3E'],
        ]:[]),
        ...(p.apply_rebate?[
          [`Rebate ${p.rebate_pct??0}%`, t.rebate, YEL_L,'7A5500'],
          ['Utilidad con rebate',  t.utilidadConRebate, YEL_L,'7A5500'],
        ]:[]),
      ];
      resRows.forEach(([label,val,bg,fc])=>{
        addRow([
          {v:label, s:style({bold:true,bg,fc})},
          {v:val,   s:style({align:'right',bold:true,bg,fc})},
          {v:'',s:style({bg})},{v:'',s:style({bg})},
        ]);
      });

      // Crear hoja con datos y estilos
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Aplicar estilos celda por celda
      Object.entries(wsStyles).forEach(([addr,s])=>{ if(ws[addr]) ws[addr].s=s; });

      // Anchos de columna
      ws['!cols'] = [
        {wch:20},{wch:14},{wch:28},{wch:35},
        {wch:6},{wch:6},
        {wch:12},{wch:12},
        {wch:12},{wch:12},
        {wch:22},{wch:18},
        {wch:12},{wch:12},{wch:10},
        {wch:12},{wch:8},
        {wch:10},{wch:12},{wch:9},
      ];

      // Altura filas
      ws['!rows'] = [{hpt:24}]; // fila título más alta

      // Merge del título
      ws['!merges'] = [{s:{r:0,c:0},e:{r:0,c:12}}];

      // Formato numérico para celdas monetarias
      const numFmt = '"$"#,##0.00';
      Object.keys(ws).filter(k=>!k.startsWith('!')).forEach(addr=>{
        const cell = ws[addr];
        if(cell && typeof cell.v === 'number') cell.z = numFmt;
      });

      XLSX.utils.book_append_sheet(wb, ws, 'Financiero');
      XLSX.writeFile(wb, `${p.nomenclatura||'presupuesto'}_financiero.xlsx`, {cellStyles:true});
    }).catch(e=>{
      showToast('Error al generar Excel: '+e.message);
    });
  }

  if(!p)return<div style={{padding:20,color:'#8aa0b8'}}>Cargando…</div>;
  const totales=calcPpto(p);
  const esCierre=ESTADOS_CIERRE.includes(p.estado);
  const bloqueado=!canEditPpto(userRole,p.estado);

  return(
    <div style={{fontFamily:'inherit'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16,flexWrap:'wrap'}}>
        <button style={S.btnSecondary} onClick={onCancel}>← Volver</button>
        <div style={{flex:1,minWidth:0}}>
          {p.nomenclatura&&<div style={{fontSize:10,color:'#8aa0b8',fontFamily:'monospace',marginBottom:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.nomenclatura}</div>}
          <div style={{fontSize:17,fontWeight:700,color:'#0d3b5e',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.nombre||p.cliente||'Nuevo presupuesto'}</div>
        </div>
        <Badge estado={p.estado}/>
        <select style={{...S.select,width:'auto'}} value={p.estado}
          disabled={!canEditPpto(userRole,p.estado)&&userRole!=='admin'}
          onChange={e=>{
            if(!canChangeEstadoPpto(userRole,e.target.value)){showToast('⚠️ Sin permiso para este estado');return;}
            if(!canEditPpto(userRole,p.estado)){showToast('⚠️ Presupuesto bloqueado');return;}
            setField('estado',e.target.value);
          }}>
          {ESTADOS_PPTO.map(e=><option key={e} value={e} disabled={!canChangeEstadoPpto(userRole,e)&&p.estado!==e}>{ESTADOS_PPTO_LABELS[e]}</option>)}
        </select>
        <button style={S.btnSecondary} onClick={openPdfCliente}>📄 PDF cliente</button>
        <button style={{...S.btnSecondary,color:'#c8264a',borderColor:'#c8264a44'}} onClick={openPdfFinanciero}>📊 PDF financiero</button>
        <button style={S.btnSecondary} onClick={downloadExcel}>📥 Excel</button>
        <button style={S.btnPrimary} onClick={save} disabled={saving}>{saving?'Guardando…':'💾 Guardar'}</button>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:4,marginBottom:16,borderBottom:'2px solid #dde6ef',paddingBottom:0}}>
        {[['info','📋 Info'],['items','📦 Ítems'],['totales','💰 Totales'],['vista','👁 Vista previa']].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{
            padding:'8px 16px',border:'none',cursor:'pointer',fontSize:13,background:'none',
            borderBottom:tab===k?'2px solid #c8264a':'2px solid transparent',
            fontWeight:tab===k?700:400,color:tab===k?'#c8264a':'#5a7a9a',marginBottom:-2,
          }}>{l}</button>
        ))}
      </div>

      {/* Warning banners */}
      {totales.hasWarning&&<div style={{background:'#fdeef1',border:'1px solid #c8264a',borderRadius:8,padding:'10px 16px',marginBottom:12,display:'flex',alignItems:'center',gap:10}}><span style={{fontSize:20}}>⚠️</span><div><div style={{fontSize:13,fontWeight:700,color:'#c8264a'}}>Advertencia: hay ítems donde el costo supera el precio al cliente</div><div style={{fontSize:12,color:'#8b1f1f'}}>Revisa los ítems marcados en rojo en la pestaña Ítems.</div></div></div>}
      {bloqueado&&<div style={{background:'#edf7ed',border:'1px solid #2e8b4e',borderRadius:8,padding:'10px 16px',marginBottom:12,display:'flex',alignItems:'center',gap:10}}><span style={{fontSize:18}}>🔒</span><div style={{fontSize:13,fontWeight:700,color:'#2e8b4e'}}>Presupuesto bloqueado — estado: {ESTADOS_PPTO_LABELS[p.estado]}. Solo Admin puede editar.</div></div>}

      {/* ══ INFO ══ */}
      {tab==='info'&&(
        <div style={S.card}>
          <div style={S.grid2}>
            <div style={{gridColumn:'1/-1'}}><Label>Nombre del presupuesto</Label><input style={S.input} value={p.nombre} onChange={e=>setField('nombre',e.target.value)} placeholder="Ej: Convención Anual 2026" disabled={bloqueado}/></div>
            <div><Label>Cliente</Label>
              <select style={S.select} value={p.cliente} onChange={e=>setCliente(e.target.value)} disabled={bloqueado}>
                <option value="">— Seleccionar —</option>
                {clientes.map(c=><option key={c.id} value={c.nombre}>{c.nombre}</option>)}
              </select>
            </div>
            <div><Label>Fecha del evento</Label><input type="date" style={S.input} value={p.fecha_evento||''} onChange={e=>setField('fecha_evento',e.target.value)} disabled={bloqueado}/></div>
            <div><Label>Ciudad</Label><input style={S.input} value={p.ciudad||''} onChange={e=>setField('ciudad',e.target.value)} disabled={bloqueado}/></div>
            <div><Label>Lugar / Venue</Label><input style={S.input} value={p.lugar||''} onChange={e=>setField('lugar',e.target.value)} disabled={bloqueado}/></div>
            <div><Label>Horario</Label><input style={S.input} value={p.horario||''} onChange={e=>setField('horario',e.target.value)} disabled={bloqueado}/></div>
            <div><Label># Personas (PAX)</Label><input type="number" style={S.input} value={p.personas??0} onChange={e=>setField('personas',parseInt(e.target.value)||0)}/></div>
            <div><Label>Días de evento</Label><input type="number" style={S.input} value={p.dias_evento??1} onChange={e=>setField('dias_evento',parseInt(e.target.value)||1)}/></div>
            <div><Label>Fee agencia (%)</Label><input type="number" step="0.1" style={S.input} value={p.fee_agencia??0} onChange={e=>setNum('fee_agencia',e.target.value)}/></div>
            <div><Label>OH nuevos ítems (%)</Label><input type="number" step="0.1" style={S.input} value={p.oh_pct??0} onChange={e=>setNum('oh_pct',e.target.value)}/></div>
            <div><Label>BCO nuevos ítems (%)</Label><input type="number" step="0.1" style={S.input} value={p.bco_pct??0} onChange={e=>setNum('bco_pct',e.target.value)}/></div>
            <div style={{display:'flex',alignItems:'center',gap:10,paddingTop:20}}>
              <input type="checkbox" id="rebate" checked={!!p.apply_rebate} onChange={e=>setField('apply_rebate',e.target.checked)} style={{width:16,height:16,cursor:'pointer'}}/>
              <label htmlFor="rebate" style={{fontSize:13,cursor:'pointer',color:'#0d3b5e'}}>Aplicar REBATE ({p.rebate_pct??0}%) — Solo Tesalia</label>
            </div>
            <div style={{gridColumn:'1/-1'}}><Label>Notas</Label><textarea style={{...S.textarea,height:72}} value={p.notas||''} onChange={e=>setField('notas',e.target.value)}/></div>
            <div style={{gridColumn:'1/-1',background:'#eef4fb',borderRadius:8,padding:'12px',border:'1px solid #c8d8e8'}}>
              <div style={{fontSize:12,fontWeight:700,color:'#0d3b5e',marginBottom:10}}>👤 Ejecutivo de contacto</div>
              <div style={S.grid2}>
                <div>
                  <Label>Ejecutivo</Label>
                  <select style={S.select} value={p.ejecutivo_nombre||''} onChange={e=>{
                    const ejec=(ejecutivos||[]).find(x=>x.nombre===e.target.value);
                    setP(prev=>({...prev, ejecutivo_nombre:e.target.value, ejecutivo_email:ejec?.email||''}));
                  }}>
                    <option value="">— Seleccionar ejecutivo —</option>
                    {(ejecutivos||[]).map(e=><option key={e.id} value={e.nombre}>{e.nombre}{e.cargo?` — ${e.cargo}`:''}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Correo de contacto</Label>
                  <input style={S.input} type="email" value={p.ejecutivo_email||''} onChange={e=>setField('ejecutivo_email',e.target.value)} placeholder="Se completa automáticamente"/>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ ITEMS ══ */}
      {tab==='items'&&(
        <div>
          {/* Toolbar */}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
            <span style={{fontSize:13,color:'#5a7a9a'}}>
              {p.items.length} ítems · Precio total: <strong style={{color:'#0d3b5e'}}>{fmt(totales.subtotalPrecio)}</strong>
            </span>
            <div style={{display:'flex',gap:8}}>
              <button style={{...S.btnPrimary,background:'#0d3b5e'}} onClick={()=>{
                const nombre=window.prompt('Nombre de la subcategoría:');
                if(!nombre||!nombre.trim())return;
                // Insertar un marcador de subcategoría como ítem especial
                const subcat={
                  id:crypto.randomUUID(), _type:'subcat',
                  subcategoria:nombre.trim(), item:'', detalle:'',
                  cantidad:0, dias:0, costo_unit:0, precio_unit:0,
                  oh_pct:0, bco_pct:0, categoria:'', es_liquidacion:false,
                };
                setP(prev=>({...prev,items:[...prev.items,subcat]}));
              }}>+ Subcategoría</button>
              <button style={{...S.btnPrimary,background:'#c8264a'}} onClick={addItem}>+ Ítem</button>
            </div>
          </div>

          {/* Lista agrupada por subcategoría */}
          {(()=>{
            // Construir grupos manteniendo orden de inserción
            const grupos=[]; // [{subcat, items:[]}]
            let grupoActual=null;
            p.items.forEach(it=>{
              if(it._type==='subcat'){
                grupoActual={subcat:it.subcategoria, subcatId:it.id, items:[]};
                grupos.push(grupoActual);
              } else {
                if(!grupoActual){
                  grupoActual={subcat:'Sin subcategoría', subcatId:'__none__', items:[]};
                  grupos.push(grupoActual);
                }
                grupoActual.items.push(it);
              }
            });

            if(grupos.length===0) return(
              <div style={S.empty}>
                Crea una subcategoría con "+ Subcategoría" y luego agrega ítems con "+ Ítem"
              </div>
            );

            return grupos.map((grupo,gi)=>(
              <div key={grupo.subcatId} style={{marginBottom:16}}>
                {/* Cabecera subcategoría */}
                <div style={{display:'flex',alignItems:'center',gap:8,background:'#0d3b5e',borderRadius:'8px 8px 0 0',padding:'8px 14px'}}>
                  <span style={{flex:1,color:'#fff',fontWeight:700,fontSize:14,letterSpacing:0.5}}>{grupo.subcat}</span>
                  <span style={{fontSize:11,color:'#8ab4d4'}}>{grupo.items.length} ítems</span>
                  {/* Renombrar subcategoría */}
                  {grupo.subcatId!=='__none__'&&(
                    <button onClick={()=>{
                      const nuevo=window.prompt('Renombrar subcategoría:',grupo.subcat);
                      if(!nuevo||!nuevo.trim())return;
                      setP(prev=>({...prev,items:prev.items.map(it=>
                        it.id===grupo.subcatId?{...it,subcategoria:nuevo.trim()}:
                        it.subcategoria===grupo.subcat&&it._type!=='subcat'?{...it,subcategoria:nuevo.trim()}:it
                      )}));
                    }} style={{background:'none',border:'1px solid #ffffff44',color:'#fff',padding:'2px 8px',borderRadius:4,cursor:'pointer',fontSize:11}}>✏️</button>
                  )}
                  {/* Agregar ítem a esta subcategoría */}
                  <button onClick={()=>{
                    const it=emptyItem(p);
                    it.subcategoria=grupo.subcat;
                    // Insertar después del último ítem de este grupo
                    const lastIdx=p.items.reduce((acc,item,idx)=>{
                      if(item.subcategoria===grupo.subcat||item.id===grupo.subcatId)return idx;
                      return acc;
                    },-1);
                    setP(prev=>{
                      const arr=[...prev.items];
                      arr.splice(lastIdx+1,0,it);
                      return{...prev,items:arr};
                    });
                    setOpenItem(it.id);
                  }} style={{background:'#c8264a',border:'none',color:'#fff',padding:'3px 10px',borderRadius:4,cursor:'pointer',fontSize:12,fontWeight:600}}>+ ítem</button>
                  {/* Eliminar subcategoría (solo si está vacía) */}
                  {grupo.subcatId!=='__none__'&&(
                    <button onClick={()=>{
                      if(grupo.items.length>0&&!window.confirm(`¿Eliminar subcategoría "${grupo.subcat}" y sus ${grupo.items.length} ítems?`))return;
                      const idsToRemove=new Set([grupo.subcatId,...grupo.items.map(it=>it.id)]);
                      setP(prev=>({...prev,items:prev.items.filter(it=>!idsToRemove.has(it.id))}));
                    }} style={{background:'none',border:'1px solid #ffffff44',color:'#ffa0a0',padding:'2px 8px',borderRadius:4,cursor:'pointer',fontSize:11}}>🗑</button>
                  )}
                </div>

                {/* Ítems de esta subcategoría */}
                <div style={{border:'1px solid #0d3b5e',borderTop:'none',borderRadius:'0 0 8px 8px',overflow:'hidden'}}>
                  {grupo.items.length===0&&(
                    <div style={{padding:'12px 14px',color:'#8aa0b8',fontSize:13,fontStyle:'italic',textAlign:'center'}}>
                      Sin ítems — haz clic en "+ ítem" para agregar
                    </div>
                  )}
                  {grupo.items.map((it,ii)=>{
                    const c=calcItem(it); const open=openItem===it.id;
                    const tieneReal=it.costo_real_unit!==null&&it.costo_real_unit!==undefined;
                    return(
                      <div key={it.id} style={{borderBottom:ii<grupo.items.length-1?'1px solid #eef2f7':'none',background:c.hasWarning?'#fff8f8':'#fff'}}>
                        {/* Cabecera ítem */}
                        <div style={{display:'flex',alignItems:'center',gap:8,padding:'9px 14px',cursor:'pointer',background:open?(c.hasWarning?'#fdeef1':'#eef4fb'):(c.hasWarning?'#fff8f8':'#fff')}} onClick={()=>setOpenItem(open?null:it.id)}>
                          <span style={{fontSize:12,color:'#8aa0b8'}}>{open?'▲':'▼'}</span>
                          <span style={{flex:1,fontWeight:600,fontSize:14,color:c.hasWarning?'#c8264a':'#1a1a2e'}}>{it.item||<span style={{color:'#bbb'}}>Sin nombre</span>}</span>
                          {c.hasWarning&&<span style={{fontSize:11,color:'#c8264a',fontWeight:700}}>⚠️ Costo &gt; Precio</span>}
                          {it.costo_aprobado&&<span style={{fontSize:10,background:'#edf7ed',color:'#2e8b4e',padding:'2px 6px',borderRadius:4,fontWeight:700,border:'1px solid #2e8b4e44'}}>✅ Aprobado</span>}
                          {it.es_liquidacion&&<span style={{fontSize:10,background:'#e0f7f6',color:'#3dbfb8',padding:'2px 7px',borderRadius:4,fontWeight:700,border:'1px solid #3dbfb8'}}>LIQ</span>}
                          {it.categoria&&<span style={{fontSize:11,background:'#e8f0f8',color:'#0d3b5e',padding:'2px 7px',borderRadius:4,fontWeight:600}}>{it.categoria}</span>}
                          {tieneReal&&<span style={{fontSize:11,background:'#edf7ed',color:'#2e8b4e',padding:'2px 7px',borderRadius:4,fontWeight:600,border:'1px solid #2e8b4e44'}}>Ahorro: {fmt(c.ahorro)}</span>}
                          <span style={{fontSize:12,color:'#8aa0b8'}}>Costo: <strong>{fmt(c.costoTotal)}</strong></span>
                          <span style={{fontSize:12,color:'#0d3b5e',fontWeight:600}}>Precio: <strong>{fmt(c.precio)}</strong></span>
                          <span style={{fontSize:11,color:c.margen>=0?'#2e8b4e':'#c8264a',fontWeight:600}}>{fmtPct(c.margenPct)}</span>
                          {!bloqueado&&<button style={{...S.btnRed,padding:'3px 7px'}} onClick={e=>{e.stopPropagation();delItem(it.id);}}>🗑</button>}

                        </div>
                        {/* Detalle ítem */}
                        {open&&(
                          <div style={{padding:14,borderTop:'1px solid #dde6ef',background:'#fafcfe'}}>
                            <div style={S.grid2}>
                              <div><Label>Ítem</Label><input style={S.input} value={it.item} onChange={e=>updItem(it.id,'item',e.target.value)}/></div>
                              <div><Label>Categoría (interna — reportes)</Label>
                                <select style={S.select} value={it.categoria} onChange={e=>updItem(it.id,'categoria',e.target.value)}>
                                  <option value="">— Sin categoría —</option>
                                  {categorias.map(c=><option key={c.id}>{c.nombre}</option>)}
                                </select>
                              </div>
                              <div style={{gridColumn:'1/-1'}}><Label>Detalle</Label><textarea style={{...S.textarea,height:48}} value={it.detalle} onChange={e=>updItem(it.id,'detalle',e.target.value)}/></div>

                              {/* COSTO PROVEEDOR */}
                              <div style={{gridColumn:'1/-1',background:'#f8fafc',borderRadius:8,padding:'10px 12px',border:'1px solid #dde6ef'}}>
                                <div style={{fontSize:12,fontWeight:700,color:'#5a7a9a',marginBottom:8}}>💼 Costo proveedor (cotizado)</div>
                                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:10}}>
                                  <div><Label>Costo unitario ($)</Label><input type="number" step="0.01" style={S.input} value={it.costo_unit??0} onChange={e=>updItem(it.id,'costo_unit',e.target.value)}/></div>
                                  <div><Label>Cantidad</Label><input type="number" style={S.input} value={it.cantidad??1} onChange={e=>updItem(it.id,'cantidad',e.target.value)}/></div>
                                  <div><Label>Días</Label><input type="number" style={S.input} value={it.dias??1} onChange={e=>updItem(it.id,'dias',e.target.value)}/></div>
                                  <div><Label>Total (unit×cant×días)</Label><input style={{...S.inputRO,fontWeight:700}} readOnly value={fmt(c.costoTotal)}/></div>
                                </div>
                                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginTop:8}}>
                                  <div><Label>OH %</Label><input type="number" step="0.1" style={S.input} value={it.oh_pct??0} onChange={e=>updItem(it.id,'oh_pct',e.target.value)}/></div>
                                  <div><Label>BCO %</Label><input type="number" step="0.1" style={S.input} value={it.bco_pct??0} onChange={e=>updItem(it.id,'bco_pct',e.target.value)}/></div>
                                  <div><Label>Total c/OH+BCO</Label><input style={{...S.inputRO,fontWeight:700,color:'#5a7a9a'}} readOnly value={fmt(c.totalCosto)}/></div>
                                </div>
                              </div>

                              {/* COSTO REAL */}
                              {esCierre&&(
                              <div style={{gridColumn:'1/-1',background:tieneReal?'#edf7ed':'#f8fafc',borderRadius:8,padding:'10px 12px',border:`1px solid ${tieneReal?'#2e8b4e44':'#dde6ef'}`}}>
                                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                                  <div style={{fontSize:12,fontWeight:700,color:tieneReal?'#2e8b4e':'#5a7a9a'}}>✅ Costo real (ejecutado)</div>
                                </div>
                                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:10}}>
                                  <div>
                                    <Label>Costo real unitario ($)</Label>
                                    <input type="number" step="0.01"
                                      style={{...S.input,borderColor:tieneReal?'#2e8b4e':'#d0d0c8'}}
                                      value={it.costo_real_unit??''} placeholder="Sin ingresar"
                                      disabled={it.costo_aprobado&&!canApproveCostoReal(userRole)}
                                      onChange={e=>updItem(it.id,'costo_real_unit',e.target.value)}/>
                                  </div>
                                  <div><Label>Cantidad</Label><input style={S.inputRO} readOnly value={it.cantidad??1}/></div>
                                  <div><Label>Días</Label><input style={S.inputRO} readOnly value={it.dias??1}/></div>
                                  <div><Label>Total real</Label><input style={{...S.inputRO,fontWeight:700,color:'#2e8b4e'}} readOnly value={tieneReal?fmt(c.costoRealTotal):'—'}/></div>
                                </div>
                                {/* BCO real — solo financiero */}
                                {canEditBcoReal(userRole)&&(
                                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:8}}>
                                  <div>
                                    <Label>BCO real % (solo financiero — post facturación)</Label>
                                    <input type="number" step="0.1" style={S.input}
                                      value={it.bco_real_pct??''} placeholder={`BCO cotizado: ${it.bco_pct??5.5}%`}
                                      onChange={e=>updItem(it.id,'bco_real_pct',e.target.value)}/>
                                  </div>
                                  <div><Label>BCO real calculado</Label><input style={S.inputRO} readOnly value={it.bco_real_pct!=null?fmt(c.bcoRealVal):'—'}/></div>
                                </div>
                                )}
                                {/* Check de aprobación — solo financiero */}
                                {canApproveCostoReal(userRole)&&tieneReal&&(
                                <div style={{display:'flex',alignItems:'center',gap:10,marginTop:8,padding:'8px 12px',background:it.costo_aprobado?'#edf7ed':'#f8fafc',borderRadius:6,border:`1px solid ${it.costo_aprobado?'#2e8b4e':'#dde6ef'}`}}>
                                  <input type="checkbox" id={`aprov-${it.id}`} checked={!!it.costo_aprobado}
                                    onChange={e=>{
                                      if(!window.confirm(e.target.checked?'¿Confirmar que el costo real está correcto? Una vez aprobado no se podrá modificar.':'¿Quitar aprobación?'))return;
                                      updItem(it.id,'costo_aprobado',e.target.checked);
                                    }}
                                    style={{width:16,height:16,cursor:'pointer',accentColor:'#2e8b4e'}}/>
                                  <label htmlFor={`aprov-${it.id}`} style={{fontSize:13,cursor:'pointer',fontWeight:700,color:it.costo_aprobado?'#2e8b4e':'#5a7a9a'}}>
                                    ✅ Costo real aprobado por Financiero {it.costo_aprobado?'— bloqueado':'— sin aprobar'}
                                  </label>
                                </div>
                                )}
                                {tieneReal&&<div style={{display:'flex',gap:16,marginTop:8,padding:'6px 10px',background:'#fff',borderRadius:6,border:'1px solid #2e8b4e22'}}>
                                  <span style={{fontSize:13,color:'#5a7a9a'}}>Ahorro:</span>
                                  <span style={{fontSize:14,fontWeight:700,color:c.ahorro>=0?'#2e8b4e':'#c8264a'}}>{fmt(c.ahorro)}</span>
                                  <span style={{fontSize:13,color:'#5a7a9a',marginLeft:12}}>Margen real:</span>
                                  <span style={{fontSize:14,fontWeight:700,color:c.margenReal>=0?'#2e8b4e':'#c8264a'}}>{fmt(c.margenReal)} ({fmtPct(c.margenRealPct)})</span>
                                </div>}
                              </div>
                              )}

                              {/* PRECIO CLIENTE */}
                              <div style={{gridColumn:'1/-1',background:'#eef4fb',borderRadius:8,padding:'10px 12px',border:'1px solid #c8d8e8'}}>
                                <div style={{fontSize:12,fontWeight:700,color:'#0d3b5e',marginBottom:8}}>👤 Precio cliente</div>
                                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:10}}>
                                  <div><Label>Precio unitario ($)</Label><input type="number" step="0.01" style={S.input} value={it.precio_unit??0} disabled={it.costo_aprobado&&!canApproveCostoReal(userRole)} onChange={e=>updItem(it.id,'precio_unit',e.target.value)}/></div>
                                  <div><Label>Cantidad</Label><input style={S.inputRO} readOnly value={it.cantidad??1}/></div>
                                  <div><Label>Días</Label><input style={S.inputRO} readOnly value={it.dias??1}/></div>
                                  <div><Label>Total (unit×cant×días)</Label><input style={{...S.inputRO,fontWeight:700,color:'#0d3b5e'}} readOnly value={fmt(c.precio)}/></div>
                                </div>
                              </div>

                              {/* Margen */}
                              <div style={{gridColumn:'1/-1',display:'flex',alignItems:'center',gap:16,padding:'6px 10px',background:c.margen>=0?'#edf7ed':'#fdeef1',borderRadius:6}}>
                                <span style={{fontSize:13,color:'#5a7a9a'}}>Margen cotizado:</span>
                                <span style={{fontSize:15,fontWeight:700,color:c.margen>=0?'#2e8b4e':'#c8264a'}}>{fmt(c.margen)} ({fmtPct(c.margenPct)})</span>
                              </div>

                              <div><Label>Razón social proveedor</Label><input style={S.input} value={it.proveedor||''} onChange={e=>updItem(it.id,'proveedor',e.target.value)}/></div>
                              <div><Label># Factura proveedor</Label><input style={S.input} value={it.num_factura_prov||''} onChange={e=>updItem(it.id,'num_factura_prov',e.target.value)} placeholder="Ej: 001-001-000123456"/></div>
                              <div><Label>Info general</Label><input style={S.input} value={it.info||''} onChange={e=>updItem(it.id,'info',e.target.value)}/></div>

                              {/* Foto de referencia */}
                              <div style={{gridColumn:'1/-1',background:'#f8fafc',borderRadius:8,padding:'10px 12px',border:'1px dashed #c8d8e8'}}>
                                <Label>📸 Foto de referencia (aparece en PDF y vista cliente)</Label>
                                <input type="file" accept="image/*" style={{marginTop:6,fontSize:13,display:'block'}}
                                  onChange={e=>{
                                    const file=e.target.files[0];if(!file)return;
                                    const reader=new FileReader();
                                    reader.onload=ev=>updItem(it.id,'foto_referencia',ev.target.result);
                                    reader.readAsDataURL(file);
                                  }}/>
                                {it.foto_referencia&&(
                                  <div style={{marginTop:8,display:'flex',alignItems:'flex-start',gap:10}}>
                                    <img src={it.foto_referencia} alt="ref" style={{maxHeight:80,maxWidth:120,borderRadius:4,border:'1px solid #dde6ef',objectFit:'cover'}}/>
                                    <button style={S.btnRed} onClick={()=>updItem(it.id,'foto_referencia',null)}>✕ Quitar foto</button>
                                  </div>
                                )}
                              </div>

                              <div style={{gridColumn:'1/-1',display:'flex',alignItems:'center',gap:10,padding:'8px 12px',background:it.es_liquidacion?'#e0f7f6':'#f8fafc',borderRadius:6,border:`1px solid ${it.es_liquidacion?'#3dbfb8':'#dde6ef'}`}}>
                                <input type="checkbox" id={`liq-${it.id}`} checked={!!it.es_liquidacion} onChange={e=>updItem(it.id,'es_liquidacion',e.target.checked)} style={{width:16,height:16,cursor:'pointer',accentColor:'#3dbfb8'}}/>
                                <label htmlFor={`liq-${it.id}`} style={{fontSize:13,cursor:'pointer',fontWeight:600,color:it.es_liquidacion?'#3dbfb8':'#5a7a9a'}}>Ítem de liquidación</label>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ));
          })()}

          {/* Botón global agregar subcategoría al final */}
          {!bloqueado&&<button style={{...S.btnPrimary,background:'#0d3b5e',width:'100%',marginTop:4}} onClick={()=>{
            const nombre=window.prompt('Nombre de la nueva subcategoría:');
            if(!nombre||!nombre.trim())return;
            const subcat={id:crypto.randomUUID(),_type:'subcat',subcategoria:nombre.trim(),item:'',detalle:'',cantidad:0,dias:0,costo_unit:0,precio_unit:0,oh_pct:0,bco_pct:0,categoria:'',es_liquidacion:false};
            setP(prev=>({...prev,items:[...prev.items,subcat]}));
          }}>+ Nueva subcategoría</button>}
        </div>
      )}

      {/* ══ TOTALES ══ */}
      {tab==='totales'&&(
        <div>
          {/* Subtotales costo */}
          <div style={{...S.grid4,marginBottom:12}}>
            <div style={S.metricCard}><div style={{fontSize:11,color:'#8aa0b8',marginBottom:4}}>Subtotal costo proveedores</div><div style={{fontSize:16,fontWeight:700,color:'#5a7a9a'}}>{fmt(totales.subtotalCostoBase)}</div></div>
            <div style={S.metricCard}><div style={{fontSize:11,color:'#8aa0b8',marginBottom:4}}>OH acumulado</div><div style={{fontSize:16,fontWeight:700,color:'#5a7a9a'}}>{fmt(totales.subtotalOH)}</div></div>
            <div style={S.metricCard}><div style={{fontSize:11,color:'#8aa0b8',marginBottom:4}}>BCO acumulado</div><div style={{fontSize:16,fontWeight:700,color:'#5a7a9a'}}>{fmt(totales.subtotalBCO)}</div></div>
            <div style={{...S.metricCard,background:'#f0eaf4'}}><div style={{fontSize:11,color:'#8aa0b8',marginBottom:4}}>Total costo c/OH+BCO</div><div style={{fontSize:16,fontWeight:700,color:'#5a3a7e'}}>{fmt(totales.subtotalCosto)}</div></div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:12}}>
            <div style={S.metricCard}><div style={{fontSize:11,color:'#8aa0b8',marginBottom:4}}>Subtotal precio cliente</div><div style={{fontSize:16,fontWeight:700}}>{fmt(totales.subtotalPrecio)}</div></div>
            <div style={S.metricCard}><div style={{fontSize:11,color:'#8aa0b8',marginBottom:4}}>Fee agencia ({p.fee_agencia??0}%)</div><div style={{fontSize:16,fontWeight:700}}>{fmt(totales.feeAgencia)}</div></div>
            <div style={{...S.metricCard,background:'#e0f7f6'}}><div style={{fontSize:11,color:'#0d6e69',marginBottom:4}}>Margen cotizado</div><div style={{fontSize:16,fontWeight:700,color:'#0d6e69'}}>{fmt(totales.margenTotal)} <span style={{fontSize:13}}>({fmtPct(totales.margenPct)})</span></div></div>
          </div>

          {/* Total principal — SIN rebate */}
          <div style={{border:'1px solid #dde6ef',borderRadius:10,overflow:'hidden',marginBottom:16}}>
            <div style={{display:'flex',justifyContent:'space-between',padding:'11px 20px',borderBottom:'1px solid #dde6ef',background:'#f0f4f8'}}>
              <span style={{fontSize:16,fontWeight:700,color:'#0d3b5e'}}>Subtotal sin IVA</span>
              <span style={{fontSize:16,fontWeight:700,color:'#0d3b5e'}}>{fmt(totales.totalSinIva)}</span>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',padding:'9px 20px',borderBottom:'1px solid #dde6ef'}}>
              <span style={{fontSize:13,color:'#5a7a9a'}}>IVA 15%</span>
              <span style={{fontSize:13,fontWeight:600}}>{fmt(totales.iva15)}</span>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',padding:'14px 20px',background:'#0d3b5e'}}>
              <span style={{fontSize:14,color:'#fff',fontWeight:700}}>TOTAL CON IVA</span>
              <span style={{fontSize:22,color:'#3dbfb8',fontWeight:800}}>{fmt(totales.totalConIva)}</span>
            </div>
          </div>

          {/* REBATE — informativo, después del total */}
          {p.apply_rebate&&(
            <div style={{border:'1px solid #f0d080',borderRadius:10,overflow:'hidden',marginBottom:16,background:'#fff8e6'}}>
              <div style={{padding:'10px 20px',borderBottom:'1px solid #f0d080',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:'#7a5500'}}>REBATE {p.rebate_pct??0}% — Nota de crédito (informativo)</div>
                  <div style={{fontSize:11,color:'#a07020'}}>No incluido en factura. Se emite como nota de crédito separada.</div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <input type="number" step="0.1" style={{...S.input,width:70}} value={p.rebate_pct??0} onChange={e=>setNum('rebate_pct',e.target.value)}/>
                  <span style={{fontSize:18,fontWeight:700,color:'#7a5500'}}>{fmt(totales.rebate)}</span>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:0}}>
                <div style={{padding:'10px 20px',borderRight:'1px solid #f0d080'}}>
                  <div style={{fontSize:11,color:'#a07020',marginBottom:3}}>Utilidad con rebate</div>
                  <div style={{fontSize:16,fontWeight:700,color:'#7a5500'}}>{fmt(totales.utilidadConRebate)}</div>
                </div>
                <div style={{padding:'10px 20px'}}>
                  <div style={{fontSize:11,color:'#a07020',marginBottom:3}}>Margen con rebate</div>
                  <div style={{fontSize:16,fontWeight:700,color:'#7a5500'}}>{fmtPct(totales.utilidadConRebatePct)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Ahorro real — solo si hay ítems con costo real ingresado */}
          {totales.subtotalAhorro!==0&&(
            <div style={{border:'1px solid #2e8b4e44',borderRadius:10,overflow:'hidden',marginBottom:16,background:'#edf7ed'}}>
              <div style={{padding:'10px 20px',borderBottom:'1px solid #2e8b4e22',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <div style={{fontSize:13,fontWeight:700,color:'#2e8b4e'}}>✅ Análisis de cierre (costo real vs cotizado)</div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:0}}>
                <div style={{padding:'10px 20px',borderRight:'1px solid #2e8b4e22'}}>
                  <div style={{fontSize:11,color:'#5a7a9a',marginBottom:3}}>Costo real total</div>
                  <div style={{fontSize:16,fontWeight:700,color:'#2e8b4e'}}>{fmt(totales.subtotalCostoReal)}</div>
                </div>
                <div style={{padding:'10px 20px',borderRight:'1px solid #2e8b4e22'}}>
                  <div style={{fontSize:11,color:'#5a7a9a',marginBottom:3}}>Ahorro total</div>
                  <div style={{fontSize:16,fontWeight:700,color:totales.subtotalAhorro>=0?'#2e8b4e':'#c8264a'}}>{fmt(totales.subtotalAhorro)}</div>
                </div>
                <div style={{padding:'10px 20px'}}>
                  <div style={{fontSize:11,color:'#5a7a9a',marginBottom:3}}>Margen real</div>
                  <div style={{fontSize:16,fontWeight:700,color:totales.margenRealTotal>=0?'#2e8b4e':'#c8264a'}}>{fmt(totales.margenRealTotal)} ({fmtPct(totales.margenRealPct)})</div>
                </div>
              </div>
            </div>
          )}

          {/* Desglose por categoría */}
          <h3 style={{fontSize:14,fontWeight:700,color:'#0d3b5e',margin:'20px 0 10px'}}>Desglose por categoría</h3>
          <table style={S.table}>
            <thead><tr>{['Categoría','Ítems','Costo prov.','OH+BCO','Total costo','Precio cliente','Margen','%'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
            <tbody>
              {categorias.filter(cat=>p.items.some(it=>it.categoria===cat.nombre)).map(cat=>{
                const its=p.items.filter(it=>it.categoria===cat.nombre);
                const tot=its.reduce((a,it)=>{const c=calcItem(it);a.costo+=c.costoTotal;a.ohbco+=c.ohVal+c.bcoVal;a.total+=c.totalCosto;a.precio+=c.precio;a.margen+=c.margen;return a;},{costo:0,ohbco:0,total:0,precio:0,margen:0});
                const pct=tot.precio>0?(tot.margen/tot.precio)*100:0;
                return(<tr key={cat.id}>
                  <td style={S.td}>{cat.nombre}</td>
                  <td style={{...S.td,textAlign:'right',color:'#8aa0b8'}}>{its.length}</td>
                  <td style={{...S.td,textAlign:'right',color:'#8aa0b8'}}>{fmt(tot.costo)}</td>
                  <td style={{...S.td,textAlign:'right',color:'#8aa0b8'}}>{fmt(tot.ohbco)}</td>
                  <td style={{...S.td,textAlign:'right',color:'#5a3a7e'}}>{fmt(tot.total)}</td>
                  <td style={{...S.td,textAlign:'right',fontWeight:600}}>{fmt(tot.precio)}</td>
                  <td style={{...S.td,textAlign:'right',fontWeight:600,color:tot.margen>=0?'#2e8b4e':'#c8264a'}}>{fmt(tot.margen)}</td>
                  <td style={{...S.td,textAlign:'right',fontWeight:600,color:tot.margen>=0?'#2e8b4e':'#c8264a'}}>{fmtPct(pct)}</td>
                </tr>);
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ══ VISTA PREVIA ══ */}
      {tab==='vista'&&(
        <div>
          <div style={{display:'flex',gap:8,marginBottom:16}}>
            <button style={{...S.btnPrimary,opacity:previewMode==='cliente'?1:0.55}} onClick={()=>setPreviewMode('cliente')}>👤 Vista cliente</button>
            <button style={{...S.btnSecondary,opacity:previewMode==='financiero'?1:0.55,border:'1px solid #0d3b5e',color:'#0d3b5e'}} onClick={()=>setPreviewMode('financiero')}>💼 Vista financiera</button>
            <div style={{flex:1}}/>
            <button style={{...S.btnPrimary,background:'#c8264a'}} onClick={openPdfCliente}>📄 PDF cliente</button>
            <button style={{...S.btnSecondary,color:'#c8264a',borderColor:'#c8264a44'}} onClick={openPdfFinanciero}>📊 PDF financiero</button>
            <button style={S.btnSecondary} onClick={downloadExcel}>📥 Excel</button>
          </div>
          {!previewMode&&<div style={S.empty}>Selecciona una vista arriba para previsualizar</div>}
          {previewMode&&(()=>{
            // Agrupar usando marcadores _type:'subcat'
            const groups=[];let cur=null;
            (p.items||[]).forEach(it=>{
              if(it._type==='subcat'){cur={subcat:it.subcategoria,items:[]};groups.push(cur);}
              else{if(!cur){cur={subcat:'Servicios',items:[]};groups.push(cur);}cur.items.push(it);}
            });
            return(
              <div style={{border:'1px solid #dde6ef',borderRadius:8,overflow:'hidden',fontSize:12}}>
                <div style={{background:'#0d3b5e',padding:'12px 20px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div style={{color:'#fff',fontWeight:700,fontSize:14,fontStyle:'italic'}}>matilda <span style={{fontStyle:'normal',fontSize:9,color:'#3dbfb8',letterSpacing:2}}>EVENT DESIGNERS</span></div>
                  <div style={{textAlign:'right'}}><div style={{color:'#3dbfb8',fontSize:9,letterSpacing:1}}>PROPUESTA COMERCIAL</div><div style={{color:'#fff',fontSize:10,fontFamily:'monospace'}}>{p.nomenclatura||'—'}</div></div>
                </div>
                <div style={{background:'#c8264a',height:3}}/>
                <div style={{padding:'12px 20px',background:'#f8fafc',display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,borderBottom:'1px solid #dde6ef'}}>
                  {[['Cliente',p.cliente],['Evento',p.nombre],['Fecha',p.fecha_evento],['Lugar',p.lugar],['PAX',p.personas?`${p.personas} pax`:''],['Días',p.dias_evento?`${p.dias_evento} días`:''],['Ejecutivo',p.ejecutivo_nombre],['Correo',p.ejecutivo_email]].filter(([,v])=>v).map(([l,v])=>(
                    <div key={l}><div style={{fontSize:8,color:'#3dbfb8',fontWeight:700,letterSpacing:1,textTransform:'uppercase'}}>{l}</div><div style={{fontSize:12,fontWeight:700,color:'#0d3b5e'}}>{v}</div></div>
                  ))}
                </div>
                {/* Una sola cabecera de tabla para todas las subcategorías */}
                <div style={{padding:'12px 20px 0'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                    <thead>
                      <tr style={{background:'#e8f0f8'}}>
                        <th style={{padding:'6px 10px',textAlign:'left',color:'#0d3b5e',fontSize:9,textTransform:'uppercase',width:'28%'}}>Ítem</th>
                        <th style={{padding:'6px 6px',textAlign:'center',color:'#0d3b5e',fontSize:9}}>Cant</th>
                        <th style={{padding:'6px 6px',textAlign:'center',color:'#0d3b5e',fontSize:9}}>Días</th>
                        {previewMode==='financiero'&&<>
                          <th style={{padding:'6px',textAlign:'right',color:'#c8264a',fontSize:9}}>C.Unit</th>
                          <th style={{padding:'6px',textAlign:'right',color:'#c8264a',fontSize:9}}>C.Total</th>
                        </>}
                        <th style={{padding:'6px 6px',textAlign:'right',color:'#0d3b5e',fontSize:9}}>P.Unit</th>
                        <th style={{padding:'6px 10px',textAlign:'right',color:'#0d3b5e',fontSize:9}}>Total</th>
                        {previewMode==='financiero'&&<>
                          <th style={{padding:'6px',textAlign:'left',color:'#c8264a',fontSize:9}}>Proveedor</th>
                          <th style={{padding:'6px',textAlign:'left',color:'#c8264a',fontSize:9}}># Fact.</th>
                        </>}
                      </tr>
                    </thead>
                    <tbody>
                      {groups.map(({subcat,items})=>(
                        <>
                          <tr key={`h-${subcat}`}><td colSpan={previewMode==='financiero'?9:5} style={{padding:'5px 10px',background:'#0d3b5e',color:'#fff',fontSize:9,fontWeight:700,letterSpacing:1,textTransform:'uppercase'}}>{subcat}</td></tr>
                          {items.map((it,i)=>{const c=calcItem(it);return(
                            <tr key={it.id} style={{borderBottom:'1px solid #eef2f7',background:i%2?'#fafcfe':'#fff'}}>
                              <td style={{padding:'6px 10px'}}>
                                <div style={{fontWeight:600,color:'#1a1a2e'}}>{it.item}</div>
                                {it.detalle&&<div style={{fontSize:10,color:'#8aa0b8'}}>{it.detalle}</div>}
                                {it.foto_referencia&&<img src={it.foto_referencia} alt="ref" style={{maxHeight:50,maxWidth:80,marginTop:3,borderRadius:3,objectFit:'cover'}}/>}
                              </td>
                              <td style={{padding:'6px',textAlign:'center'}}>{c.cantidad}</td>
                              <td style={{padding:'6px',textAlign:'center'}}>{c.dias}</td>
                              {previewMode==='financiero'&&<>
                                <td style={{padding:'6px',textAlign:'right',color:'#c8264a'}}>{fmt(c.costoUnit)}</td>
                                <td style={{padding:'6px',textAlign:'right',color:'#c8264a',fontWeight:600}}>{fmt(c.costoTotal)}</td>
                              </>}
                              <td style={{padding:'6px',textAlign:'right'}}>{fmt(c.precioU)}</td>
                              <td style={{padding:'6px 10px',textAlign:'right',fontWeight:700}}>{fmt(c.precio)}</td>
                              {previewMode==='financiero'&&<>
                                <td style={{padding:'6px',fontSize:10,color:'#5a7a9a'}}>{it.proveedor}</td>
                                <td style={{padding:'6px',fontSize:10,color:'#5a7a9a'}}>{it.num_factura_prov||''}</td>
                              </>}
                            </tr>
                          );})}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{padding:'8px 20px 16px',display:'flex',justifyContent:'space-between',alignItems:'flex-end',marginTop:8}}>
                  {previewMode==='financiero'&&(
                    <div style={{fontSize:11,color:'#5a7a9a'}}>
                      <div>Costo proveedores: <strong style={{color:'#c8264a'}}>{fmt(totales.subtotalCostoBase)}</strong></div>
                      <div>OH+BCO: <strong style={{color:'#7a5500'}}>{fmt(totales.subtotalOH+totales.subtotalBCO)}</strong></div>
                      <div>Total costo: <strong style={{color:'#5a3a7e'}}>{fmt(totales.subtotalCosto)}</strong></div>
                      <div style={{marginTop:4}}>Margen: <strong style={{color:totales.margenTotal>=0?'#2e8b4e':'#c8264a'}}>{fmt(totales.margenTotal)} ({fmtPct(totales.margenPct)})</strong></div>
                    </div>
                  )}
                  <div style={{marginLeft:'auto',width:300,border:'1px solid #dde6ef',borderRadius:4,overflow:'hidden'}}>
                    <div style={{display:'flex',justifyContent:'space-between',padding:'5px 12px',borderBottom:'1px solid #dde6ef'}}><span style={{fontSize:11,color:'#8aa0b8'}}>Subtotal servicios</span><span style={{fontSize:11,fontWeight:600}}>{fmt(totales.subtotalPrecio)}</span></div>
                    {(p.fee_agencia??0)>0&&<div style={{display:'flex',justifyContent:'space-between',padding:'5px 12px',borderBottom:'1px solid #dde6ef'}}><span style={{fontSize:11,color:'#8aa0b8'}}>Fee agencia ({p.fee_agencia}%)</span><span style={{fontSize:11,fontWeight:600}}>{fmt(totales.feeAgencia)}</span></div>}
                    <div style={{display:'flex',justifyContent:'space-between',padding:'5px 12px',borderBottom:'1px solid #dde6ef',background:'#f0f4f8'}}><span style={{fontSize:11,color:'#0d3b5e',fontWeight:700}}>Subtotal sin IVA</span><span style={{fontSize:11,fontWeight:700,color:'#0d3b5e'}}>{fmt(totales.totalSinIva)}</span></div>
                    <div style={{display:'flex',justifyContent:'space-between',padding:'5px 12px',borderBottom:'1px solid #dde6ef'}}><span style={{fontSize:11,color:'#8aa0b8'}}>IVA 15%</span><span style={{fontSize:11,fontWeight:600}}>{fmt(totales.iva15)}</span></div>
                    <div style={{display:'flex',justifyContent:'space-between',padding:'8px 12px',background:'#0d3b5e'}}><span style={{fontSize:12,color:'#fff',fontWeight:700}}>TOTAL</span><span style={{fontSize:14,color:'#3dbfb8',fontWeight:700}}>{fmt(totales.totalConIva)}</span></div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
      <Toast msg={toast}/>
    </div>
  );
}
