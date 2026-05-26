import { calcItem, calcPpto, fmt, fmtDate } from '../calc';

// Agrupa ítems por categoría
function groupByCategoria(items) {
  const groups = {};
  items.forEach(it => {
    const cat = it.categoria || 'General';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(it);
  });
  return groups;
}

// Genera HTML del PDF cliente (sin costos ni proveedores)
export function generatePdfClienteHTML(ppto, logoUrl) {
  const totales = calcPpto(ppto);
  const groups  = groupByCategoria(ppto.items || []);

  const logoTag = logoUrl
    ? `<img src="${logoUrl}" style="height:52px; object-fit:contain;" alt="Matilda Event Designers" />`
    : `<div style="font-size:26px;font-style:italic;font-weight:900;color:#c8264a;letter-spacing:1px;">matilda<br><span style="font-size:10px;letter-spacing:3px;color:#fff;font-style:normal;font-weight:600;">EVENT DESIGNERS</span></div>`;

  const itemsHTML = Object.entries(groups).map(([cat, items]) => `
    <div style="margin-bottom:16px;">
      <div style="background:#0d3b5e;color:#fff;padding:6px 14px;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">
        ${cat}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead>
          <tr style="background:#e8f0f8;">
            <th style="padding:7px 14px;text-align:left;color:#0d3b5e;font-size:10px;text-transform:uppercase;letter-spacing:1px;width:45%;">Ítem</th>
            <th style="padding:7px 8px;text-align:center;color:#0d3b5e;font-size:10px;text-transform:uppercase;letter-spacing:1px;">Cant.</th>
            <th style="padding:7px 8px;text-align:center;color:#0d3b5e;font-size:10px;text-transform:uppercase;letter-spacing:1px;">Días</th>
            <th style="padding:7px 8px;text-align:right;color:#0d3b5e;font-size:10px;text-transform:uppercase;letter-spacing:1px;">P. Unit.</th>
            <th style="padding:7px 14px;text-align:right;color:#0d3b5e;font-size:10px;text-transform:uppercase;letter-spacing:1px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((it, i) => {
            const c = calcItem(it);
            return `<tr style="border-bottom:1px solid #eef2f7;background:${i%2===1?'#fafcfe':'#fff'};">
              <td style="padding:8px 14px;">
                <div style="font-weight:700;color:#1a1a2e;font-size:12px;">${it.item || ''}</div>
                ${it.detalle ? `<div style="font-size:11px;color:#6b7a99;margin-top:2px;">${it.detalle}</div>` : ''}
              </td>
              <td style="padding:8px;text-align:center;color:#1a1a2e;">${c.cantidad}</td>
              <td style="padding:8px;text-align:center;color:#1a1a2e;">${c.dias}</td>
              <td style="padding:8px;text-align:right;color:#1a1a2e;">${fmt(c.precioU)}</td>
              <td style="padding:8px 14px;text-align:right;font-weight:700;color:#1a1a2e;">${fmt(c.precio)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `).join('');

  const rebateRow = ppto.apply_rebate
    ? `<div style="display:flex;justify-content:space-between;padding:7px 16px;border-bottom:1px solid #dde6ef;">
        <span style="font-size:12px;color:#6b7a99;">Rebate (${ppto.rebate_pct||2}%)</span>
        <span style="font-size:12px;color:#c8264a;font-weight:600;">- ${fmt(totales.rebate)}</span>
       </div>` : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>${ppto.nomenclatura || 'Presupuesto'}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:Arial,sans-serif; background:#fff; color:#1a1a2e; font-size:13px; }
  @media print {
    body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .no-print { display:none; }
  }
</style>
</head>
<body style="padding:0;">

<button class="no-print" onclick="window.print()"
  style="position:fixed;top:16px;right:16px;background:#c8264a;color:#fff;border:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;z-index:999;">
  ⬇ Descargar PDF
</button>

<div style="max-width:800px;margin:0 auto;padding:0;">

  <!-- HEADER -->
  <div style="background:#0d3b5e;padding:24px 36px;display:flex;justify-content:space-between;align-items:center;">
    <div>${logoTag}</div>
    <div style="text-align:right;">
      <div style="color:#3dbfb8;font-size:9px;letter-spacing:2px;font-weight:700;text-transform:uppercase;margin-bottom:5px;">Propuesta Comercial</div>
      <div style="color:#fff;font-size:11px;font-weight:700;font-family:monospace;">${ppto.nomenclatura || ''}</div>
      <div style="color:#8ab4d4;font-size:11px;margin-top:4px;">Guayaquil, ${fmtDate(new Date().toISOString().slice(0,10))}</div>
    </div>
  </div>
  <div style="background:#c8264a;height:3px;"></div>

  <!-- INFO EVENTO -->
  <div style="padding:20px 36px 16px;background:#f8fafc;border-bottom:1px solid #dde6ef;">
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;">
      ${[
        ['Cliente', ppto.cliente],
        ['Evento',  ppto.nombre],
        ['Fecha',   fmtDate(ppto.fecha_evento)],
        ['Lugar',   ppto.lugar],
        ['PAX',     ppto.personas ? `${ppto.personas} personas` : ''],
        ['Días',    ppto.dias_evento ? `${ppto.dias_evento} días` : ''],
      ].map(([l,v]) => v ? `
        <div>
          <div style="font-size:9px;color:#3dbfb8;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:3px;">${l}</div>
          <div style="font-size:13px;font-weight:700;color:#0d3b5e;">${v}</div>
        </div>` : '').join('')}
    </div>
  </div>

  <!-- ITEMS -->
  <div style="padding:20px 36px 0;">
    <div style="font-size:9px;color:#c8264a;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;">Detalle de Servicios</div>
    ${itemsHTML}
  </div>

  <!-- TOTALES -->
  <div style="margin:8px 36px 20px;">
    <div style="display:flex;justify-content:flex-end;">
      <div style="width:340px;border:1px solid #dde6ef;border-radius:4px;overflow:hidden;">
        <div style="display:flex;justify-content:space-between;padding:7px 16px;border-bottom:1px solid #dde6ef;">
          <span style="font-size:12px;color:#6b7a99;">Subtotal servicios</span>
          <span style="font-size:12px;font-weight:600;">${fmt(totales.subtotalPrecio)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:7px 16px;border-bottom:1px solid #dde6ef;">
          <span style="font-size:12px;color:#6b7a99;">Fee de agencia (${ppto.fee_agencia||5}%)</span>
          <span style="font-size:12px;font-weight:600;">${fmt(totales.feeAgencia)}</span>
        </div>
        ${rebateRow}
        <div style="display:flex;justify-content:space-between;padding:8px 16px;border-bottom:1px solid #dde6ef;background:#f0f4f8;">
          <span style="font-size:13px;color:#0d3b5e;font-weight:700;">Subtotal sin IVA</span>
          <span style="font-size:13px;color:#0d3b5e;font-weight:700;">${fmt(totales.totalSinIva)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:7px 16px;border-bottom:1px solid #dde6ef;">
          <span style="font-size:12px;color:#6b7a99;">IVA 15%</span>
          <span style="font-size:12px;font-weight:600;">${fmt(totales.iva15)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;padding:11px 16px;background:#0d3b5e;">
          <span style="font-size:14px;color:#fff;font-weight:700;">TOTAL</span>
          <span style="font-size:16px;color:#3dbfb8;font-weight:700;">${fmt(totales.totalConIva)}</span>
        </div>
      </div>
    </div>
  </div>

  ${ppto.notas ? `
  <div style="margin:0 36px 20px;background:#f0f7ff;border-left:3px solid #3dbfb8;padding:12px 16px;border-radius:0 4px 4px 0;">
    <div style="font-size:9px;color:#3dbfb8;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px;">Nota</div>
    <div style="font-size:12px;color:#1a1a2e;line-height:1.6;">${ppto.notas}</div>
  </div>` : ''}

  <!-- FOOTER -->
  <div style="background:#0d3b5e;padding:12px 36px;display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
    <div style="font-size:10px;color:#8ab4d4;">mariajose@matilda.agency · +593 97 990 4839</div>
    <div style="font-size:9px;color:#3dbfb8;letter-spacing:1px;font-style:italic;">"Donde la estrategia se convierte en experiencia."</div>
    <div style="font-size:10px;color:#8ab4d4;">@matilda_eventos_ec</div>
  </div>

</div>
</body>
</html>`;
}

// Genera HTML del Excel financiero (con costos y proveedores)
export function generateExcelFinancieroData(ppto) {
  const rows = [];
  rows.push(['PRESUPUESTO FINANCIERO - MATILDA EVENT DESIGNERS']);
  rows.push([]);
  rows.push(['Código:', ppto.nomenclatura || '']);
  rows.push(['Cliente:', ppto.cliente || '']);
  rows.push(['Evento:', ppto.nombre || '']);
  rows.push(['Fecha evento:', ppto.fecha_evento || '']);
  rows.push(['Lugar:', ppto.lugar || '']);
  rows.push(['PAX:', ppto.personas || '']);
  rows.push([]);
  rows.push([
    'Categoría','Ítem','Detalle','Cantidad','Días',
    'Costo Unit. Cotizado','Costo Total Cotizado','OH%','OH $','BCO%','BCO $','Total Costo Cotizado',
    'Costo Unit. Real','Costo Total Real','Total Costo Real c/OH+BCO','Ahorro',
    'Precio Unit.','Precio Total','Margen Cotizado','% Margen Cotizado','Margen Real','% Margen Real',
    'Proveedor','Info'
  ]);

  (ppto.items || []).forEach(it => {
    const c = calcItem(it);
    const tieneReal = it.costo_real_unit !== null && it.costo_real_unit !== undefined;
    rows.push([
      it.categoria||'', it.item||'', it.detalle||'',
      c.cantidad, c.dias,
      c.costoUnit, c.costoTotal, it.oh_pct??15, c.ohVal, it.bco_pct??5.5, c.bcoVal, c.totalCosto,
      tieneReal ? c.costoRealUnit : '',
      tieneReal ? c.costoRealTotal : '',
      tieneReal ? c.totalCostoReal : '',
      tieneReal ? c.ahorro : '',
      c.precioU, c.precio,
      c.margen, (c.margenPct).toFixed(1)+'%',
      tieneReal ? c.margenReal : '',
      tieneReal ? (c.margenRealPct).toFixed(1)+'%' : '',
      it.proveedor||'', it.info||''
    ]);
  });

  const t = calcPpto(ppto);
  rows.push([]);
  rows.push(['RESUMEN FINANCIERO']);
  rows.push(['Subtotal costo cotizado:', t.subtotalCosto]);
  if (t.subtotalCostoReal > 0) {
    rows.push(['Subtotal costo real:', t.subtotalCostoReal]);
    rows.push(['Ahorro total:', t.subtotalAhorro]);
  }
  rows.push(['Subtotal precio cliente:', t.subtotalPrecio]);
  rows.push([`Fee agencia ${ppto.fee_agencia??0}%:`, t.feeAgencia]);
  rows.push(['Total sin IVA:', t.totalSinIva]);
  rows.push(['IVA 15%:', t.iva15]);
  rows.push(['Total con IVA:', t.totalConIva]);
  rows.push(['Margen cotizado:', t.margenTotal, `${t.margenPct.toFixed(1)}%`]);
  if (t.subtotalCostoReal > 0) {
    rows.push(['Margen real:', t.margenRealTotal, `${t.margenRealPct.toFixed(1)}%`]);
  }
  if (ppto.apply_rebate) {
    rows.push([`Rebate ${ppto.rebate_pct??0}% (nota de crédito):`, t.rebate]);
    rows.push(['Utilidad con rebate:', t.utilidadConRebate, `${t.utilidadConRebatePct.toFixed(1)}%`]);
  }

  return rows;
}

