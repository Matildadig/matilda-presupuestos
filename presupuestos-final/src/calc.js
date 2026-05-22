export function calcItem(it) {
  const oh       = Number(it.oh_pct  ?? 15);
  const bco      = Number(it.bco_pct ?? 5.5);
  const costo    = Number(it.costo   ?? 0);
  const cantidad = Number(it.cantidad ?? 1);
  const dias     = Number(it.dias    ?? 1);

  // Costo proveedor: también tiene unitario × cantidad × días
  const costoUnit  = Number(it.costo_unit ?? costo);  // si existe costo_unit, úsalo; si no, costo es el total
  const costoTotal = costoUnit * cantidad * dias;

  const precioU  = Number(it.precio_unit ?? 0);
  const precio   = precioU * cantidad * dias;

  const ohVal      = costoTotal * (oh  / 100);
  const bcoVal     = costoTotal * (bco / 100);
  const totalCosto = costoTotal + ohVal + bcoVal;
  const margen     = precio - totalCosto;
  const margenPct  = precio > 0 ? (margen / precio) * 100 : 0;

  return { costoUnit, costoTotal, ohVal, bcoVal, totalCosto, precioU, cantidad, dias, precio, margen, margenPct };
}

export function calcPpto(p) {
  let subtotalCostoBase = 0, subtotalOH = 0, subtotalBCO = 0;
  let subtotalCosto = 0, subtotalPrecio = 0;
  (p.items || []).forEach(it => {
    const c = calcItem(it);
    subtotalCostoBase += c.costoTotal;
    subtotalOH        += c.ohVal;
    subtotalBCO       += c.bcoVal;
    subtotalCosto     += c.totalCosto;
    subtotalPrecio    += c.precio;
  });
  const fee_pct    = p.fee_agencia ?? 0;   // usar ?? para respetar el 0
  const feeAgencia = subtotalPrecio * (fee_pct / 100);
  const rebate_pct = p.rebate_pct ?? 0;
  const rebate     = p.apply_rebate ? subtotalPrecio * (rebate_pct / 100) : 0;
  const totalSinIva = subtotalPrecio + feeAgencia - rebate;
  const iva15       = totalSinIva * 0.15;
  const totalConIva = totalSinIva + iva15;
  const margenTotal = totalSinIva - subtotalCosto;
  const margenPct   = totalSinIva > 0 ? (margenTotal / totalSinIva) * 100 : 0;

  return {
    subtotalCostoBase, subtotalOH, subtotalBCO,
    subtotalCosto, subtotalPrecio,
    feeAgencia, rebate, totalSinIva, iva15, totalConIva,
    margenTotal, margenPct,
  };
}

export function genNomenclatura(nombre, cliente, seq) {
  const now  = new Date();
  const anio = now.getFullYear();
  const mes  = String(now.getMonth() + 1).padStart(2, '0');
  const num  = String(seq).padStart(3, '0');
  const nom  = (nombre  || '').toUpperCase().replace(/[^A-Z0-9 ]/gi, '').trim().substring(0, 20);
  const cli  = (cliente || '').toUpperCase().replace(/[^A-Z0-9 ]/gi, '').trim().substring(0, 15);
  return `${anio}_${mes}-${num}-${nom}-${cli}-MATILDA`;
}

export function fmt(n) {
  return '$' + Number(n || 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
