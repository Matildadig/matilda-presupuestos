// Matilda brand: azul marino #0d3b5e, fucsia #c8264a, teal #3dbfb8, blanco
export const BRAND = { navy: '#0d3b5e', fucsia: '#c8264a', teal: '#3dbfb8', white: '#fff' };

export const S = {
  page: { maxWidth: 980, margin: '0 auto', padding: '20px 16px' },
  card: { background: '#fff', border: '1px solid #dde6ef', borderRadius: 10, padding: '16px 18px', marginBottom: 12 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  grid3: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 },
  grid4: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 },
  input: { width: '100%', padding: '7px 10px', border: '1px solid #c8d8e8', borderRadius: 6, fontSize: 14, outline: 'none', background: '#fff', color: '#1a1a2e' },
  inputRO: { width: '100%', padding: '7px 10px', border: '1px solid #e0eaf2', borderRadius: 6, fontSize: 14, background: '#f4f8fc', color: '#4a6080', cursor: 'default' },
  select: { width: '100%', padding: '7px 10px', border: '1px solid #c8d8e8', borderRadius: 6, fontSize: 13, background: '#fff', color: '#1a1a2e', cursor: 'pointer' },
  label: { fontSize: 11, color: '#5a7a9a', marginBottom: 3, fontWeight: 600, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' },
  textarea: { width: '100%', padding: '7px 10px', border: '1px solid #c8d8e8', borderRadius: 6, fontSize: 14, outline: 'none', background: '#fff', color: '#1a1a2e', resize: 'vertical' },
  btnPrimary: { padding: '8px 18px', background: '#0d3b5e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 700 },
  btnFucsia: { padding: '8px 18px', background: '#c8264a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 700 },
  btnTeal: { padding: '7px 14px', background: '#3dbfb8', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 },
  btnSecondary: { padding: '7px 14px', background: '#fff', color: '#0d3b5e', border: '1px solid #c8d8e8', borderRadius: 6, cursor: 'pointer', fontSize: 13 },
  btnRed: { padding: '5px 10px', background: 'none', color: '#c8264a', border: '1px solid #f0a0b0', borderRadius: 5, cursor: 'pointer', fontSize: 12 },
  btnSm: { padding: '5px 10px', background: '#fff', border: '1px solid #c8d8e8', borderRadius: 5, cursor: 'pointer', fontSize: 12, color: '#0d3b5e' },
  metricCard: { background: '#f0f4f8', borderRadius: 8, padding: '12px 14px' },
  metricNavy: { background: '#0d3b5e', borderRadius: 8, padding: '12px 14px' },
  metricTeal: { background: '#e0f7f6', borderRadius: 8, padding: '12px 14px' },
  metricFucsia: { background: '#fdeef1', borderRadius: 8, padding: '12px 14px' },
  divider: { borderTop: '1px solid #dde6ef', margin: '16px 0' },
  empty: { textAlign: 'center', padding: '3rem', color: '#8aa0b8', border: '1px dashed #c8d8e8', borderRadius: 10 },
  table: { width: '100%', fontSize: 13, borderCollapse: 'collapse', border: '1px solid #dde6ef', borderRadius: 8, overflow: 'hidden' },
  th: { padding: '8px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', color: '#fff', background: '#0d3b5e' },
  td: { padding: '8px 12px', borderTop: '1px solid #eef2f7' },
};

export function Label({ children }) {
  return <div style={S.label}>{children}</div>;
}

export function Badge({ estado }) {
  const MAP = {
    borrador:           ['#8aa0b8', 'Borrador'],
    enviado_cliente:    ['#0d3b5e', 'Enviado a cliente'],
    entregado:          ['#0d3b5e', 'Enviado a cliente'], // compat
    aprobado:           ['#3dbfb8', 'Aprobado'],
    pendiente_facturar: ['#e8a020', 'Pendiente facturar'],
    a_facturar:         ['#e8a020', 'Pendiente facturar'], // compat
    facturado:          ['#2e8b4e', 'Facturado'],
    cancelado:          ['#c8264a', 'Cancelado'],
    abierta:            ['#3dbfb8', 'Abierta'],
    enviada:            ['#0d3b5e', 'Enviada'],
    liquidado:          ['#2e8b4e', 'Liquidado'],
  };
  const [color, label] = MAP[estado] || ['#8aa0b8', estado || 'Borrador'];
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 5,
      background: color + '22', color, border: `1px solid ${color}55` }}>
      {label}
    </span>
  );
}

export function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: '#0d3b5e', color: '#fff', padding: '9px 22px', borderRadius: 8,
      fontSize: 13, zIndex: 9999, boxShadow: '0 4px 16px rgba(13,59,94,0.35)' }}>
      {msg}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(13,59,94,0.5)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: '24px',
        width: '100%', maxWidth: wide ? 900 : 500, maxHeight: '92vh',
        overflowY: 'auto', boxShadow: '0 8px 40px rgba(13,59,94,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0d3b5e' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#8aa0b8' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
