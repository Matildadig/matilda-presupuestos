// Roles y permisos del sistema
export const ROLES = {
  admin:      'admin',
  financiero: 'financiero',
  produccion: 'produccion',
};

// Estados de presupuesto restringidos (solo financiero/admin)
export const ESTADOS_FINANCIERO = ['pendiente_facturar', 'facturado'];
// Estados que bloquean edición (solo admin puede editar)
export const ESTADOS_BLOQUEADOS_PPTO = ['facturado'];
export const ESTADOS_BLOQUEADOS_LIQ  = ['liquidado'];

// Todos los estados de presupuesto
export const ESTADOS_PPTO = [
  'borrador', 'enviado_cliente', 'aprobado',
  'pendiente_facturar', 'facturado', 'cancelado'
];
export const ESTADOS_PPTO_LABELS = {
  borrador:           'Borrador',
  enviado_cliente:    'Enviado a cliente',
  aprobado:           'Aprobado',
  pendiente_facturar: 'Pendiente facturar',
  facturado:          'Facturado',
  cancelado:          'Cancelado',
};
export const ESTADOS_PPTO_COLORS = {
  borrador:           '#8aa0b8',
  enviado_cliente:    '#0d3b5e',
  aprobado:           '#3dbfb8',
  pendiente_facturar: '#e8a020',
  facturado:          '#2e8b4e',
  cancelado:          '#c8264a',
};

export const ESTADOS_LIQ = ['abierta', 'enviada', 'liquidado'];
export const ESTADOS_LIQ_LABELS = { abierta:'Abierta', enviada:'Enviada', liquidado:'Liquidado' };

// Permisos por rol
export function canChangeEstadoPpto(role, nuevoEstado) {
  if (role === 'admin') return true;
  if (ESTADOS_FINANCIERO.includes(nuevoEstado)) return role === 'financiero';
  return true;
}

export function canEditPpto(role, estadoActual) {
  if (role === 'admin') return true;
  return !ESTADOS_BLOQUEADOS_PPTO.includes(estadoActual);
}

export function canEditLiq(role, estadoActual) {
  if (role === 'admin') return true;
  return !ESTADOS_BLOQUEADOS_LIQ.includes(estadoActual);
}

export function canApproveCostoReal(role) {
  return role === 'admin' || role === 'financiero';
}

export function canEditBcoReal(role) {
  return role === 'admin' || role === 'financiero';
}

export function canChangeLiqToLiquidado(role) {
  return role === 'admin' || role === 'financiero';
}

export function canMarkEjecutado(role) {
  return role === 'admin' || role === 'produccion' || role === 'financiero';
}

// Categorías de liquidación
export const CATS_LIQUIDACION = [
  'Alimentación e Hidratación',
  'Materiales / Suministros',
  'Hospedaje',
  'Movilización / Combustible / Transporte',
  'No deducible',
];
