import { calcItem, calcPpto, fmt, fmtDate } from '../calc';
import LOGO_BASE64 from '../logoBase64';

function groupBySubcat(items) {
  const groups = [];
  let current = null;
  items.forEach(it => {
    if (it._type === 'subcat') {
      current = { subcat: it.subcategoria, items: [] };
      groups.push(current);
    } else {
      if (!current) { current = { subcat: 'Servicios', items: [] }; groups.push(current); }
      current.items.push(it);
    }
  });
  return groups;
}

export function generatePdfClienteHTML(ppto, logoUrlOverride) {
  const totales = calcPpto(ppto);
  const groups  = groupBySubcat(ppto.items || []);
  // Use uploaded logo from admin, or fall back to embedded logo
  const logoSrc = logoUrlOverride || LOGO_BASE64;
  const logoTag = `<img src="${logoSrc}" style="height:90px;object-fit:contain;background:transparent;" alt="Matilda Event Designers" />`;

  // Single header row for all items
  const tableHeader = `
    <tr style="background:#e8f0f8;">
      <th style="padding:7px 14px;text-align:left;color:#0d3b5e;font-size:10px;text-transform:uppercase;letter-spacing:1px;width:45%;">Ítem</th>
      <th style="padding:7px 8px;text-align:center;color:#0d3b5e;font-size:10px;text-transform:uppercase;letter-spacing:1px;">Cant.</th>
      <th style="padding:7px 8px;text-align:center;color:#0d3b5e;font-size:10px;text-transform:uppercase;letter-spacing:1px;">Días</th>
      <th style="padding:7px 8px;text-align:right;color:#0d3b5e;font-size:10px;text-transform:uppercase;letter-spacing:1px;">P. Unit.</th>
      <th style="padding:7px 14px;text-align:right;color:#0d3b5e;font-size:10px;text-transform:uppercase;letter-spacing:1px;">Total</th>
    </tr>`;

  const itemRows = groups.map(({ subcat, items }) => {
    const subcatRow = `<tr><td colspan="5" style="background:#0d3b5e;color:#fff;padding:6px 14px;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">${subcat}</td></tr>`;
    const rows = items.map((it, i) => {
      const c = calcItem(it);
      const fotoCell = it.foto_referencia
        ? `<br><img src="${it.foto_referencia}" style="max-height:60px;max-width:100px;margin-top:4px;border-radius:3px;object-fit:cover;border:1px solid #dde6ef;" />`
        : '';
      return `<tr style="border-bottom:1px solid #eef2f7;background:${i%2===1?'#fafcfe':'#fff'};">
        <td style="padding:8px 14px;">
          <div style="font-weight:700;color:#1a1a2e;font-size:12px;">${it.item || ''}</div>
          ${it.detalle ? `<div style="font-size:11px;color:#6b7a99;margin-top:2px;">${it.detalle}</div>` : ''}
          ${fotoCell}
        </td>
        <td style="padding:8px;text-align:center;color:#1a1a2e;">${c.cantidad}</td>
        <td style="padding:8px;text-align:center;color:#1a1a2e;">${c.dias}</td>
        <td style="padding:8px;text-align:right;color:#1a1a2e;">${fmt(c.precioU)}</td>
        <td style="padding:8px 14px;text-align:right;font-weight:700;color:#1a1a2e;">${fmt(c.precio)}</td>
      </tr>`;
    }).join('');
    return subcatRow + rows;
  }).join('');

  const feeRow = (ppto.fee_agencia ?? 0) > 0
    ? `<div style="display:flex;justify-content:space-between;padding:7px 16px;border-bottom:1px solid #dde6ef;">
        <span style="font-size:12px;color:#6b7a99;">Fee de agencia (${ppto.fee_agencia}%)</span>
        <span style="font-size:12px;font-weight:600;">${fmt(totales.feeAgencia)}</span>
       </div>` : '';

  const infoFields = [
    ['Cliente', ppto.cliente],
    ['Evento',  ppto.nombre],
    ['Fecha',   fmtDate(ppto.fecha_evento)],
    ['Lugar',   ppto.lugar],
    ['PAX',     ppto.personas ? ppto.personas + ' personas' : ''],
    ['Días',    ppto.dias_evento ? ppto.dias_evento + ' días' : ''],
    ['Ejecutivo', ppto.ejecutivo_nombre],
    ['Correo',  ppto.ejecutivo_email],
  ].filter(([,v]) => v).map(([l,v]) => `
    <div>
      <div style="font-size:9px;color:#3dbfb8;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:3px;">${l}</div>
      <div style="font-size:13px;font-weight:700;color:#0d3b5e;">${v}</div>
    </div>`).join('');

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
  <div style="background:#0d3b5e;padding:22px 36px;display:flex;justify-content:space-between;align-items:center;">
    <div style="background:#0d3b5e;">${logoTag}</div>
    <div style="text-align:right;">
      <div style="color:#3dbfb8;font-size:9px;letter-spacing:2px;font-weight:700;text-transform:uppercase;margin-bottom:5px;">Propuesta Comercial</div>
      <div style="color:#fff;font-size:11px;font-weight:700;font-family:monospace;">${ppto.nomenclatura || ''}</div>
      <div style="color:#8ab4d4;font-size:11px;margin-top:4px;">Guayaquil, ${fmtDate(new Date().toISOString().slice(0,10))}</div>
    </div>
  </div>
  <div style="background:#c8264a;height:3px;"></div>
  <!-- INFO EVENTO -->
  <div style="padding:18px 36px 14px;background:#f8fafc;border-bottom:1px solid #dde6ef;">
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">${infoFields}</div>
  </div>
  <!-- ITEMS — una sola tabla continua -->
  <div style="padding:18px 36px 0;">
    <div style="font-size:9px;color:#c8264a;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px;">Detalle de Servicios</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px;">
      <thead>${tableHeader}</thead>
      <tbody>${itemRows}</tbody>
    </table>
  </div>
  <!-- TOTALES -->
  <div style="margin:16px 36px 20px;">
    <div style="display:flex;justify-content:flex-end;">
      <div style="width:340px;border:1px solid #dde6ef;border-radius:4px;overflow:hidden;">
        <div style="display:flex;justify-content:space-between;padding:7px 16px;border-bottom:1px solid #dde6ef;">
          <span style="font-size:12px;color:#6b7a99;">Subtotal servicios</span>
          <span style="font-size:12px;font-weight:600;">${fmt(totales.subtotalPrecio)}</span>
        </div>
        ${feeRow}
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
  <!-- FOOTER — solo frase, sin contacto -->
  <div style="background:#0d3b5e;padding:12px 36px;display:flex;justify-content:center;align-items:center;margin-top:8px;">
    <div style="font-size:10px;color:#3dbfb8;letter-spacing:1px;font-style:italic;">"Donde la estrategia se convierte en experiencia."</div>
  </div>
</div>
</body>
</html>`;
}

export function generatePdfFinancieroHTML(ppto, logoUrlOverride) {
  const totales = calcPpto(ppto);
  const groups  = groupBySubcat(ppto.items || []);
  const logoSrc = logoUrlOverride || LOGO_BASE64;
  const logoTag = `<img src="${logoSrc}" style="height:80px;object-fit:contain;background:transparent;" alt="Matilda Event Designers" />`;

  const infoFields = [
    ['Cliente',   ppto.cliente],
    ['Evento',    ppto.nombre],
    ['Fecha',     fmtDate(ppto.fecha_evento)],
    ['Lugar',     ppto.lugar],
    ['PAX',       ppto.personas ? ppto.personas + ' personas' : ''],
    ['Días',      ppto.dias_evento ? ppto.dias_evento + ' días' : ''],
    ['Ejecutivo', ppto.ejecutivo_nombre],
    ['Correo',    ppto.ejecutivo_email],
  ].filter(([,v]) => v).map(([l,v]) => `
    <div>
      <div style="font-size:9px;color:#3dbfb8;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:2px;">${l}</div>
      <div style="font-size:12px;font-weight:700;color:#0d3b5e;">${v}</div>
    </div>`).join('');

  // Columnas: Ítem | Cant | Días | Costo Unit | Costo Total | OH+BCO | Total Costo | Precio Unit | Precio Total | Costo Real Unit | Costo Real Total | Ahorro | Margen | Proveedor
  const tableHeader = `
    <tr style="background:#0d3b5e;color:#fff;">
      <th style="padding:6px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:1px;width:22%;">Ítem / Detalle</th>
      <th style="padding:6px 5px;text-align:center;font-size:9px;text-transform:uppercase;">Cant</th>
      <th style="padding:6px 5px;text-align:center;font-size:9px;text-transform:uppercase;">Días</th>
      <th style="padding:6px 5px;text-align:right;font-size:9px;text-transform:uppercase;color:#ffcccc;">C.Unit</th>
      <th style="padding:6px 5px;text-align:right;font-size:9px;text-transform:uppercase;color:#ffcccc;">C.Total</th>
      <th style="padding:6px 5px;text-align:right;font-size:9px;text-transform:uppercase;color:#aaddff;">P.Unit</th>
      <th style="padding:6px 5px;text-align:right;font-size:9px;text-transform:uppercase;color:#aaddff;">Total</th>
      <th style="padding:6px 8px;text-align:left;font-size:9px;text-transform:uppercase;">Proveedor</th>
      <th style="padding:6px 8px;text-align:left;font-size:9px;text-transform:uppercase;"># Fact.</th>
      <th style="padding:6px 5px;text-align:right;font-size:9px;text-transform:uppercase;color:#aaffcc;">C.Real Unit</th>
      <th style="padding:6px 5px;text-align:right;font-size:9px;text-transform:uppercase;color:#aaffcc;">C.Real Total</th>
      <th style="padding:6px 5px;text-align:right;font-size:9px;text-transform:uppercase;color:#aaffcc;">Ahorro</th>
      <th style="padding:6px 5px;text-align:right;font-size:9px;text-transform:uppercase;color:#ffffaa;">Margen</th>
    </tr>`;

  const itemRows = groups.map(({ subcat, items }) => {
    const subcatRow = `<tr><td colspan="13" style="background:#1a5078;color:#fff;padding:5px 10px;font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">${subcat}</td></tr>`;
    const rows = items.map((it, i) => {
      const c = calcItem(it);
      const tieneReal = it.costo_real_unit !== null && it.costo_real_unit !== undefined;
      const bg = i % 2 === 1 ? '#f8fafc' : '#fff';
      return `<tr style="border-bottom:1px solid #eef2f7;background:${bg};font-size:10px;">
        <td style="padding:6px 10px;">
          <div style="font-weight:700;color:#1a1a2e;">${it.item || ''}</div>
          ${it.detalle ? `<div style="font-size:9px;color:#6b7a99;margin-top:1px;">${it.detalle}</div>` : ''}
        </td>
        <td style="padding:6px 5px;text-align:center;">${c.cantidad}</td>
        <td style="padding:6px 5px;text-align:center;">${c.dias}</td>
        <td style="padding:6px 5px;text-align:right;color:#8b1a1a;">${fmt(c.costoUnit)}</td>
        <td style="padding:6px 5px;text-align:right;color:#8b1a1a;font-weight:600;">${fmt(c.costoTotal)}</td>
        <td style="padding:6px 5px;text-align:right;color:#0d3b5e;">${fmt(c.precioU)}</td>
        <td style="padding:6px 5px;text-align:right;color:#0d3b5e;font-weight:600;">${fmt(c.precio)}</td>
        <td style="padding:6px 8px;font-size:9px;color:#5a7a9a;">${it.proveedor || ''}</td>
        <td style="padding:6px 8px;font-size:9px;color:#5a7a9a;">${it.num_factura_prov || ''}</td>
        <td style="padding:6px 5px;text-align:right;color:${tieneReal ? '#1a6e3e' : '#bbb'};">${tieneReal ? fmt(c.costoRealUnit) : '—'}</td>
        <td style="padding:6px 5px;text-align:right;color:${tieneReal ? '#1a6e3e' : '#bbb'};">${tieneReal ? fmt(c.costoRealTotal) : '—'}</td>
        <td style="padding:6px 5px;text-align:right;font-weight:${tieneReal?'700':'400'};color:${tieneReal?(c.ahorro>=0?'#1a6e3e':'#8b1a1a'):'#bbb'};">${tieneReal ? fmt(c.ahorro) : '—'}</td>
        <td style="padding:6px 5px;text-align:right;font-weight:600;color:${c.margen>=0?'#1a6e3e':'#8b1a1a'};">${fmt(c.margen)}<div style="font-size:8px;">(${c.margenPct.toFixed(1)}%)</div></td>
      </tr>`;
    }).join('');
    return subcatRow + rows;
  }).join('');

  const t = totales;
  const rebateRow = ppto.apply_rebate ? `
    <tr style="background:#fff8e6;">
      <td colspan="8" style="padding:6px 10px;font-size:11px;color:#7a5500;font-weight:600;">Rebate ${ppto.rebate_pct??0}% (nota de crédito — informativo)</td>
      <td colspan="6" style="padding:6px 10px;text-align:right;color:#7a5500;font-weight:700;">${fmt(t.rebate)}</td>
    </tr>` : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8"/>
<title>${ppto.nomenclatura || 'Presupuesto'} — Financiero</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:Arial,sans-serif; background:#fff; color:#1a1a2e; font-size:11px; }
  @media print {
    body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .no-print { display:none; }
    @page { size: A4 landscape; margin: 10mm; }
  }
</style>
</head>
<body>
<button class="no-print" onclick="window.print()"
  style="position:fixed;top:16px;right:16px;background:#0d3b5e;color:#fff;border:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:700;cursor:pointer;z-index:999;">
  ⬇ Descargar PDF Financiero
</button>
<div style="max-width:1100px;margin:0 auto;padding:0;">
  <!-- HEADER -->
  <div style="background:#0d3b5e;padding:16px 28px;display:flex;justify-content:space-between;align-items:center;">
    <div style="background:#0d3b5e;">${logoTag}</div>
    <div style="text-align:center;">
      <div style="color:#c8264a;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Presupuesto Financiero — USO INTERNO</div>
    </div>
    <div style="text-align:right;">
      <div style="color:#3dbfb8;font-size:9px;letter-spacing:2px;font-weight:700;text-transform:uppercase;margin-bottom:3px;">Código</div>
      <div style="color:#fff;font-size:10px;font-weight:700;font-family:monospace;">${ppto.nomenclatura || ''}</div>
      <div style="color:#8ab4d4;font-size:10px;margin-top:2px;">${fmtDate(new Date().toISOString().slice(0,10))}</div>
    </div>
  </div>
  <div style="background:#c8264a;height:3px;"></div>

  <!-- INFO -->
  <div style="padding:12px 28px;background:#f8fafc;border-bottom:1px solid #dde6ef;">
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">${infoFields}</div>
  </div>

  <!-- LEYENDA COLORES -->
  <div style="padding:8px 28px;background:#fff;border-bottom:1px solid #dde6ef;display:flex;gap:20px;align-items:center;">
    <span style="font-size:9px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:1px;">Leyenda:</span>
    <span style="font-size:9px;color:#8b1a1a;">■ Costo proveedor</span>
    <span style="font-size:9px;color:#7a5500;">■ OH+BCO</span>
    <span style="font-size:9px;color:#5a2a7e;">■ Total costo</span>
    <span style="font-size:9px;color:#0d3b5e;">■ Precio cliente</span>
    <span style="font-size:9px;color:#1a6e3e;">■ Costo real / Ahorro</span>
  </div>

  <!-- TABLA -->
  <div style="padding:12px 28px 0;">
    <table style="width:100%;border-collapse:collapse;font-size:10px;">
      <thead>${tableHeader}</thead>
      <tbody>
        ${itemRows}
        <!-- TOTALES -->
        <tr style="background:#f0f4f8;border-top:2px solid #0d3b5e;">
          <td colspan="4" style="padding:8px 10px;font-weight:700;font-size:11px;color:#0d3b5e;">TOTALES</td>
          <td style="padding:8px 5px;text-align:right;font-weight:700;color:#8b1a1a;">${fmt(t.subtotalCosto)}</td>
          <td style="padding:8px 5px;"></td>
          <td style="padding:8px 5px;text-align:right;font-weight:700;color:#0d3b5e;">${fmt(t.subtotalPrecio)}</td>
          <td colspan="2" style="padding:8px 5px;"></td>
          <td style="padding:8px 5px;"></td>
          <td style="padding:8px 5px;text-align:right;font-weight:700;color:#1a6e3e;">${t.subtotalCostoReal > 0 ? fmt(t.subtotalCostoReal) : '—'}</td>
          <td style="padding:8px 5px;text-align:right;font-weight:700;color:${t.subtotalAhorro>=0?'#1a6e3e':'#8b1a1a'};">${t.subtotalAhorro > 0 ? fmt(t.subtotalAhorro) : '—'}</td>
          <td style="padding:8px 5px;text-align:right;font-weight:700;color:${t.margenTotal>=0?'#1a6e3e':'#8b1a1a'};">${fmt(t.margenTotal)}<div style="font-size:8px;">(${t.margenPct.toFixed(1)}%)</div></td>
        </tr>
        ${rebateRow}
      </tbody>
    </table>
  </div>

  <!-- RESUMEN FINANCIERO -->
  <div style="margin:16px 28px 20px;display:grid;grid-template-columns:1fr 1fr;gap:16px;">
    <!-- Columna izquierda: costos -->
    <div style="border:1px solid #dde6ef;border-radius:6px;overflow:hidden;">
      <div style="background:#1a1a2e;color:#fff;padding:7px 14px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Resumen de costos</div>
      ${[
        ['Subtotal costo proveedores', fmt(t.subtotalCostoBase), '#8b1a1a'],
        ['OH acumulado', fmt(t.subtotalOH), '#7a5500'],
        ['BCO acumulado', fmt(t.subtotalBCO), '#7a5500'],
        ['Total costo c/OH+BCO', fmt(t.subtotalCosto), '#5a2a7e'],
        ...(t.subtotalCostoReal > 0 ? [
          ['─── Cierre ───', '', '#888'],
          ['Costo real total', fmt(t.subtotalCostoReal), '#1a6e3e'],
          ['Ahorro total', fmt(t.subtotalAhorro), t.subtotalAhorro>=0?'#1a6e3e':'#8b1a1a'],
          ['Margen real', `${fmt(t.margenRealTotal)} (${t.margenRealPct.toFixed(1)}%)`, t.margenRealTotal>=0?'#1a6e3e':'#8b1a1a'],
        ] : []),
      ].map(([l,v,col]) => `
        <div style="display:flex;justify-content:space-between;padding:6px 14px;border-bottom:1px solid #eee;">
          <span style="font-size:11px;color:#666;">${l}</span>
          <span style="font-size:11px;font-weight:600;color:${col||'#1a1a2e'};">${v}</span>
        </div>`).join('')}
    </div>
    <!-- Columna derecha: precio cliente -->
    <div style="border:1px solid #dde6ef;border-radius:6px;overflow:hidden;">
      <div style="background:#1a1a2e;color:#fff;padding:7px 14px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Resumen precio cliente</div>
      ${[
        ['Subtotal servicios', fmt(t.subtotalPrecio), '#0d3b5e'],
        [`Fee agencia ${ppto.fee_agencia??0}%`, fmt(t.feeAgencia), '#0d3b5e'],
        ['Subtotal sin IVA', fmt(t.totalSinIva), '#0d3b5e'],
        ['IVA 15%', fmt(t.iva15), '#555'],
        ['TOTAL CON IVA', fmt(t.totalConIva), '#0d3b5e'],
        ['─── Rentabilidad ───', '', '#888'],
        ['Margen cotizado', `${fmt(t.margenTotal)} (${t.margenPct.toFixed(1)}%)`, t.margenTotal>=0?'#1a6e3e':'#8b1a1a'],
        ...(ppto.apply_rebate ? [
          [`Rebate ${ppto.rebate_pct??0}% (nota crédito)`, fmt(t.rebate), '#7a5500'],
          ['Utilidad con rebate', `${fmt(t.utilidadConRebate)} (${t.utilidadConRebatePct.toFixed(1)}%)`, '#7a5500'],
        ] : []),
      ].map(([l,v,col]) => `
        <div style="display:flex;justify-content:space-between;padding:6px 14px;border-bottom:1px solid #eee;${l==='TOTAL CON IVA'?'background:#0d3b5e;':''}">
          <span style="font-size:11px;color:${l==='TOTAL CON IVA'?'#fff':'#666'};">${l}</span>
          <span style="font-size:${l==='TOTAL CON IVA'?'13':'11'}px;font-weight:700;color:${l==='TOTAL CON IVA'?'#3dbfb8':col||'#1a1a2e'};">${v}</span>
        </div>`).join('')}
    </div>
  </div>

  ${ppto.notas ? `
  <div style="margin:0 28px 16px;background:#f0f7ff;border-left:3px solid #3dbfb8;padding:10px 14px;border-radius:0 4px 4px 0;">
    <div style="font-size:9px;color:#3dbfb8;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:3px;">Nota</div>
    <div style="font-size:11px;color:#1a1a2e;line-height:1.5;">${ppto.notas}</div>
  </div>` : ''}

  <div style="background:#0d3b5e;padding:10px 28px;display:flex;justify-content:space-between;align-items:center;">
    <div style="font-size:9px;color:#8ab4d4;">DOCUMENTO DE USO INTERNO — MATILDA EVENT DESIGNERS</div>
    <div style="font-size:9px;color:#3dbfb8;font-style:italic;">"Donde la estrategia se convierte en experiencia."</div>
  </div>
</div>
</body>
</html>`;
}

export function generateExcelFinancieroData(ppto) {
  // Import dynamically to avoid circular deps
  const { calcItem, calcPpto } = require('../calc');
  const rows = [];
  rows.push(['PRESUPUESTO FINANCIERO - MATILDA EVENT DESIGNERS']);
  rows.push([]);
  rows.push(['Código:', ppto.nomenclatura||'']);
  rows.push(['Cliente:', ppto.cliente||'']);
  rows.push(['Evento:', ppto.nombre||'']);
  rows.push(['Fecha evento:', ppto.fecha_evento||'']);
  rows.push(['Lugar:', ppto.lugar||'']);
  rows.push(['PAX:', ppto.personas||'']);
  rows.push(['Ejecutivo:', ppto.ejecutivo_nombre||'']);
  rows.push(['Correo ejecutivo:', ppto.ejecutivo_email||'']);
  rows.push([]);
  rows.push([
    'Subcategoría','Categoría','Ítem','Detalle','Cantidad','Días',
    'Costo Unit.','Costo Total',
    'Precio Unit.','Precio Total',
    'Proveedor','# Factura Proveedor',
    'Costo Real Unit.','Costo Real Total','Ahorro',
    'Margen','% Margen','Margen Real','% Margen Real',
    'OH%','OH $','BCO%','BCO $','Total Costo c/OH+BCO',
    'BCO Real %','Aprobado Financiero','Info'
  ]);
  (ppto.items||[]).forEach(it=>{
    if(it._type==='subcat')return; // skip markers
    const c=calcItem(it);
    const tieneReal=it.costo_real_unit!==null&&it.costo_real_unit!==undefined;
    rows.push([
      it.subcategoria||'', it.categoria||'', it.item||'', it.detalle||'',
      c.cantidad, c.dias,
      c.costoUnit, c.costoTotal,
      c.precioU, c.precio,
      it.proveedor||'', it.num_factura_prov||'',
      tieneReal?c.costoRealUnit:'', tieneReal?c.costoRealTotal:'', tieneReal?c.ahorro:'',
      c.margen, c.margenPct.toFixed(1)+'%',
      tieneReal?c.margenReal:'', tieneReal?c.margenRealPct.toFixed(1)+'%':'',
      it.oh_pct??15, c.ohVal, it.bco_pct??5.5, c.bcoVal, c.totalCosto,
      it.bco_real_pct??'', it.costo_aprobado?'Sí':'No',
      it.info||''
    ]);
  });
  const t=calcPpto(ppto);
  rows.push([]);
  rows.push(['RESUMEN']);
  rows.push(['Subtotal costo cotizado:',t.subtotalCosto]);
  if(t.subtotalCostoReal>0){rows.push(['Subtotal costo real:',t.subtotalCostoReal]);rows.push(['Ahorro total:',t.subtotalAhorro]);}
  rows.push(['Subtotal precio cliente:',t.subtotalPrecio]);
  rows.push([`Fee agencia ${ppto.fee_agencia??0}%:`,t.feeAgencia]);
  rows.push(['Total sin IVA:',t.totalSinIva]);
  rows.push(['IVA 15%:',t.iva15]);
  rows.push(['Total con IVA:',t.totalConIva]);
  rows.push(['Margen cotizado:',t.margenTotal,t.margenPct.toFixed(1)+'%']);
  if(t.subtotalCostoReal>0)rows.push(['Margen real:',t.margenRealTotal,t.margenRealPct.toFixed(1)+'%']);
  if(ppto.apply_rebate){rows.push([`Rebate ${ppto.rebate_pct??0}%:`,t.rebate]);rows.push(['Utilidad con rebate:',t.utilidadConRebate,t.utilidadConRebatePct.toFixed(1)+'%']);}
  return rows;
}
