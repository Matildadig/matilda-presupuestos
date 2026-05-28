export function calcItem(it) {
  const oh       = Number(it.oh_pct  ?? 15);
  const bco      = Number(it.bco_pct ?? 5.5);
  const cantidad = Number(it.cantidad ?? 1);
  const dias     = Number(it.dias    ?? 1);

  // Costo cotizado — compatibilidad con ítems creados en versión anterior (usaban 'costo')
  const costoUnit  = Number(it.costo_unit ?? it.costo ?? 0);
  const costoTotal = costoUnit * cantidad * dias;
  const ohVal      = costoTotal * (oh  / 100);
  const bcoVal     = costoTotal * (bco / 100);
  const totalCosto = costoTotal + ohVal + bcoVal;

  // Costo real (ejecutado) — si no se ingresó, usa el cotizado
  const costoRealUnit  = it.costo_real_unit !== undefined && it.costo_real_unit !== null
    ? Number(it.costo_real_unit) : costoUnit;
  const costoRealTotal = costoRealUnit * cantidad * dias;
  const ohRealVal      = costoRealTotal * (oh  / 100);
  const bcoRealVal     = costoRealTotal * (bco / 100);
  const totalCostoReal = costoRealTotal + ohRealVal + bcoRealVal;
  const ahorro         = totalCosto - totalCostoReal;

  // Precio cliente
  const precioU = Number(it.precio_unit ?? 0);
  const precio  = precioU * cantidad * dias;

  const margen    = precio - totalCosto;
  const margenPct = precio > 0 ? (margen / precio) * 100 : 0;

  // Margen real (con costo ejecutado)
  const margenReal    = precio - totalCostoReal;
  const margenRealPct = precio > 0 ? (margenReal / precio) * 100 : 0;

  return {
    costoUnit, costoTotal, ohVal, bcoVal, totalCosto,
    costoRealUnit, costoRealTotal, ohRealVal, bcoRealVal, totalCostoReal, ahorro,
    precioU, cantidad, dias, precio,
    margen, margenPct, margenReal, margenRealPct,
  };
}

export function calcPpto(p) {
  let subtotalCostoBase = 0, subtotalOH = 0, subtotalBCO = 0, subtotalCosto = 0;
  let subtotalCostoReal = 0, subtotalAhorro = 0;
  let subtotalPrecio = 0;

  (p.items || []).forEach(it => {
    if (it._type === 'subcat') return; // skip subcategory markers
    const c = calcItem(it);
    subtotalCostoBase += c.costoTotal;
    subtotalOH        += c.ohVal;
    subtotalBCO       += c.bcoVal;
    subtotalCosto     += c.totalCosto;
    subtotalCostoReal += c.totalCostoReal;
    subtotalAhorro    += c.ahorro;
    subtotalPrecio    += c.precio;
  });

  const fee_pct     = p.fee_agencia ?? 0;
  const feeAgencia  = subtotalPrecio * (fee_pct / 100);

  // Rebate ya NO entra en el cálculo principal
  const totalSinIva = subtotalPrecio + feeAgencia;
  const iva15       = totalSinIva * 0.15;
  const totalConIva = totalSinIva + iva15;

  const margenTotal    = totalSinIva - subtotalCosto;
  const margenPct      = totalSinIva > 0 ? (margenTotal / totalSinIva) * 100 : 0;

  // Margen real
  const margenRealTotal = totalSinIva - subtotalCostoReal;
  const margenRealPct   = totalSinIva > 0 ? (margenRealTotal / totalSinIva) * 100 : 0;

  // Rebate — cálculo informativo aparte
  const rebate_pct  = p.rebate_pct ?? 0;
  const rebate      = p.apply_rebate ? subtotalPrecio * (rebate_pct / 100) : 0;
  const utilidadConRebate    = margenTotal + rebate;
  const utilidadConRebatePct = totalSinIva > 0 ? (utilidadConRebate / totalSinIva) * 100 : 0;

  return {
    subtotalCostoBase, subtotalOH, subtotalBCO, subtotalCosto,
    subtotalCostoReal, subtotalAhorro,
    subtotalPrecio, feeAgencia,
    totalSinIva, iva15, totalConIva,
    margenTotal, margenPct,
    margenRealTotal, margenRealPct,
    rebate, utilidadConRebate, utilidadConRebatePct,
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
