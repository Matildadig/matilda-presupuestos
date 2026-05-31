// fmt: punto para decimales, coma para miles  → $1,234.56
export function fmt(n) {
  const num = Number(n || 0);
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtPct(n) {
  return Number(n || 0).toFixed(1) + '%';
}

export function fmtDate(d) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${parseInt(day)} de ${meses[parseInt(m)-1]} de ${y}`;
}

// Helper: round to 2 decimal places to avoid floating point errors
const r2 = n => Math.round(Number(n) * 100) / 100;

export function calcItem(it) {
  const oh       = r2(it.oh_pct  ?? 15);
  const bco      = r2(it.bco_pct ?? 5.5);
  const cantidad = r2(it.cantidad ?? 1);
  const dias     = r2(it.dias    ?? 1);

  // Costo cotizado — compatibilidad con campo antiguo 'costo'
  const costoUnit  = r2(it.costo_unit ?? it.costo ?? 0);
  const costoTotal = r2(costoUnit * cantidad * dias);
  const ohVal      = r2(costoTotal * (oh  / 100));
  const bcoVal     = r2(costoTotal * (bco / 100));
  const totalCosto = r2(costoTotal + ohVal + bcoVal);

  // Costo real
  const costoRealUnit  = (it.costo_real_unit !== undefined && it.costo_real_unit !== null)
    ? r2(it.costo_real_unit) : costoUnit;
  const costoRealTotal = r2(costoRealUnit * cantidad * dias);
  const ohRealVal      = r2(costoRealTotal * (oh / 100));
  const bcoRealPct     = (it.bco_real_pct !== undefined && it.bco_real_pct !== null)
    ? r2(it.bco_real_pct) : bco;
  const bcoRealVal     = r2(costoRealTotal * (bcoRealPct / 100));
  const totalCostoReal = r2(costoRealTotal + ohRealVal + bcoRealVal);
  const ahorro         = r2(totalCosto - totalCostoReal);

  // Precio cliente
  const precioU = r2(it.precio_unit ?? 0);
  const precio  = r2(precioU * cantidad * dias);

  const margen        = r2(precio - totalCosto);
  const margenPct     = precio > 0 ? r2((margen / precio) * 100) : 0;
  const margenReal    = r2(precio - totalCostoReal);
  const margenRealPct = precio > 0 ? r2((margenReal / precio) * 100) : 0;

  // Warning: costo > precio
  const hasWarning = precio > 0 && totalCosto > precio;

  return {
    costoUnit, costoTotal, ohVal, bcoVal, totalCosto,
    costoRealUnit, costoRealTotal, ohRealVal, bcoRealVal, totalCostoReal, ahorro,
    precioU, cantidad, dias, precio,
    margen, margenPct, margenReal, margenRealPct,
    hasWarning,
  };
}

export function calcPpto(p) {
  let subtotalCostoBase = 0, subtotalOH = 0, subtotalBCO = 0, subtotalCosto = 0;
  let subtotalCostoReal = 0, subtotalAhorro = 0, subtotalPrecio = 0;
  let hasWarning = false;

  (p.items || []).forEach(it => {
    if (it._type === 'subcat') return;
    const c = calcItem(it);
    subtotalCostoBase += c.costoTotal;
    subtotalOH        += c.ohVal;
    subtotalBCO       += c.bcoVal;
    subtotalCosto     += c.totalCosto;
    subtotalCostoReal += c.totalCostoReal;
    subtotalAhorro    += c.ahorro;
    subtotalPrecio    += c.precio;
    if (c.hasWarning) hasWarning = true;
  });

  const fee_pct     = r2(p.fee_agencia ?? 0);
  const feeAgencia  = r2(subtotalPrecio * (fee_pct / 100));
  const totalSinIva = r2(subtotalPrecio + feeAgencia);
  const iva15       = r2(totalSinIva * 0.15);
  const totalConIva = r2(totalSinIva + iva15);
  const margenTotal = r2(totalSinIva - subtotalCosto);
  const margenPct   = totalSinIva > 0 ? r2((margenTotal / totalSinIva) * 100) : 0;
  const margenRealTotal = r2(totalSinIva - subtotalCostoReal);
  const margenRealPct   = totalSinIva > 0 ? r2((margenRealTotal / totalSinIva) * 100) : 0;

  const rebate_pct = r2(p.rebate_pct ?? 0);
  const rebate     = p.apply_rebate ? r2(subtotalPrecio * (rebate_pct / 100)) : 0;
  const utilidadConRebate    = r2(margenTotal + rebate);
  const utilidadConRebatePct = totalSinIva > 0 ? r2((utilidadConRebate / totalSinIva) * 100) : 0;

  return {
    subtotalCostoBase, subtotalOH, subtotalBCO, subtotalCosto,
    subtotalCostoReal, subtotalAhorro,
    subtotalPrecio, feeAgencia,
    totalSinIva, iva15, totalConIva,
    margenTotal, margenPct,
    margenRealTotal, margenRealPct,
    rebate, utilidadConRebate, utilidadConRebatePct,
    hasWarning,
  };
}

export function genNomenclatura(nombre, cliente, seq) {
  const now  = new Date();
  const anio = String(now.getFullYear()).slice(-2);
  const MESES = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEPT','OCT','NOV','DIC'];
  const mes  = MESES[now.getMonth()];
  const num  = String(seq).padStart(3, '0');
  const nom  = (nombre  || '').toUpperCase().replace(/[^A-ZÁÉÍÓÚÑ0-9 ]/gi, '').trim().substring(0, 25);
  const cli  = (cliente || '').toUpperCase().replace(/[^A-ZÁÉÍÓÚÑ0-9 ]/gi, '').trim().substring(0, 20);
  return `MATILDA-${num}-${nom}-${cli}-${mes}-${anio}`;
}
