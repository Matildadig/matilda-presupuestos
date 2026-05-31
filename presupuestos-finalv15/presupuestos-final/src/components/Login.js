import { useState } from 'react';
import { supabase } from '../supabase';
import { S } from '../styles';

export default function Login({ onLogin }) {
  const [email, setEmail]     = useState('');
  const [pass, setPass]       = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault(); setError(''); setLoading(true);
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password: pass });
    setLoading(false);
    if (err) { setError('Email o contraseña incorrectos'); return; }
    onLogin(data.user);
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(135deg, #0d3b5e 0%, #1a6a9a 100%)' }}>
      <div style={{ background:'#fff', borderRadius:16, padding:'40px 36px', width:360, boxShadow:'0 12px 50px rgba(13,59,94,0.4)' }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontSize:36, fontStyle:'italic', fontWeight:900, color:'#c8264a', letterSpacing:1, lineHeight:1 }}>matilda</div>
          <div style={{ fontSize:11, letterSpacing:4, color:'#5a7a9a', fontWeight:600, textTransform:'uppercase', marginTop:4 }}>Event Designers</div>
          <div style={{ width:40, height:3, background:'#3dbfb8', borderRadius:2, margin:'12px auto 0' }}/>
          <p style={{ fontSize:13, color:'#8aa0b8', marginTop:12 }}>Sistema de Presupuestos</p>
        </div>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom:14 }}>
            <label style={S.label}>Email</label>
            <input style={S.input} type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="tu@email.com" required autoFocus />
          </div>
          <div style={{ marginBottom:20 }}>
            <label style={S.label}>Contraseña</label>
            <input style={S.input} type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••" required />
          </div>
          {error && <div style={{ fontSize:13, color:'#c8264a', background:'#fdeef1', padding:'8px 12px', borderRadius:6, marginBottom:14 }}>{error}</div>}
          <button type="submit" style={{ ...S.btnPrimary, width:'100%', padding:'11px', fontSize:15 }} disabled={loading}>
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
