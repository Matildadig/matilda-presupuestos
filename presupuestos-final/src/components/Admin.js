import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { S, Label, Toast, Modal } from '../styles';

export default function Admin({ onLogoChange }) {
  const [cfg, setCfg]           = useState({ oh_pct:15, bco_pct:5.5, fee_agencia:0, rebate_pct:2 });
  const [categorias, setCats]   = useState([]);
  const [clientes, setClis]     = useState([]);
  const [ejecutivos, setEjecs]  = useState([]);
  const [toast, setToast]       = useState('');
  const [newCat, setNewCat]     = useState('');
  const [newCli, setNewCli]     = useState({ nombre:'', ruc:'', contacto:'', email:'' });
  const [editCli, setEditCli]   = useState(null);
  const [newEjec, setNewEjec]   = useState({ nombre:'', email:'', cargo:'' });
  const [editEjec, setEditEjec] = useState(null);
  const [tab, setTab]           = useState('config');
  const [saving, setSaving]     = useState(false);
  const [newUser, setNewUser]   = useState({ email:'', password:'', nombre:'', role:'user' });
  const [logoPreview, setLogoPreview] = useState(null);

  useEffect(()=>{
    fetchAll();
    const saved=localStorage.getItem('matilda_logo');
    if(saved)setLogoPreview(saved);
  },[]);

  async function fetchAll(){
    const[cfgR,catR,cliR,ejecR]=await Promise.all([
      supabase.from('config').select('*').single(),
      supabase.from('categorias').select('*').order('nombre'),
      supabase.from('clientes').select('*').order('nombre'),
      supabase.from('ejecutivos').select('*').order('nombre'),
    ]);
    if(cfgR.data)setCfg(cfgR.data);
    if(catR.data)setCats(catR.data);
    if(cliR.data)setClis(cliR.data);
    if(ejecR.data)setEjecs(ejecR.data);
  }
  function showToast(m){setToast(m);setTimeout(()=>setToast(''),2500);}

  async function saveCfg(){
    setSaving(true);
    const{error}=await supabase.from('config').upsert({id:1,...cfg});
    setSaving(false);
    if(error){showToast('Error: '+error.message);return;}
    showToast('Configuración guardada ✓');
  }

  async function addCat(){
    if(!newCat.trim())return;
    const{error}=await supabase.from('categorias').insert({nombre:newCat.trim().toUpperCase()});
    if(error){showToast('Error: '+error.message);return;}
    setNewCat('');fetchAll();showToast('Categoría agregada ✓');
  }
  async function deleteCat(id){
    if(!window.confirm('¿Eliminar categoría?'))return;
    await supabase.from('categorias').delete().eq('id',id);fetchAll();
  }

  async function saveCli(){
    if(!newCli.nombre.trim())return;
    const{error}=await supabase.from('clientes').insert(newCli);
    if(error){showToast('Error: '+error.message);return;}
    setNewCli({nombre:'',ruc:'',contacto:'',email:''});fetchAll();showToast('Cliente agregado ✓');
  }
  async function updateCli(){
    const{error}=await supabase.from('clientes').update(editCli).eq('id',editCli.id);
    if(error){showToast('Error: '+error.message);return;}
    setEditCli(null);fetchAll();showToast('Cliente actualizado ✓');
  }
  async function deleteCli(id){
    if(!window.confirm('¿Eliminar cliente?'))return;
    await supabase.from('clientes').delete().eq('id',id);fetchAll();
  }

  async function saveEjec(){
    if(!newEjec.nombre.trim())return;
    const{error}=await supabase.from('ejecutivos').insert(newEjec);
    if(error){showToast('Error: '+error.message);return;}
    setNewEjec({nombre:'',email:'',cargo:''});fetchAll();showToast('Ejecutivo agregado ✓');
  }
  async function updateEjec(){
    const{error}=await supabase.from('ejecutivos').update(editEjec).eq('id',editEjec.id);
    if(error){showToast('Error: '+error.message);return;}
    setEditEjec(null);fetchAll();showToast('Ejecutivo actualizado ✓');
  }
  async function deleteEjec(id){
    if(!window.confirm('¿Eliminar ejecutivo?'))return;
    await supabase.from('ejecutivos').delete().eq('id',id);fetchAll();
  }

  async function createUser(){
    if(!newUser.email||!newUser.password){showToast('Email y contraseña requeridos');return;}
    const{error}=await supabase.auth.admin.createUser({email:newUser.email,password:newUser.password,email_confirm:true,user_metadata:{nombre:newUser.nombre,role:newUser.role}});
    if(error){showToast('Error: '+error.message);return;}
    setNewUser({email:'',password:'',nombre:'',role:'user'});showToast('Usuario creado ✓');
  }

  function handleLogo(e){
    const file=e.target.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>{
      const data=ev.target.result;
      setLogoPreview(data);
      localStorage.setItem('matilda_logo',data);
      if(onLogoChange)onLogoChange(data);
    };
    reader.readAsDataURL(file);
  }

  async function downloadBackup(){
    showToast('Generando backup…');
    try {
      const [ppR, cliR, catR, ejecR, liqR, cfgR] = await Promise.all([
        supabase.from('presupuestos').select('*'),
        supabase.from('clientes').select('*'),
        supabase.from('categorias').select('*'),
        supabase.from('ejecutivos').select('*'),
        supabase.from('liquidaciones').select('*'),
        supabase.from('config').select('*'),
      ]);
      const backup = {
        fecha: new Date().toISOString(),
        version: '1.0',
        tablas: {
          presupuestos:  ppR.data  || [],
          clientes:      cliR.data || [],
          categorias:    catR.data || [],
          ejecutivos:    ejecR.data|| [],
          liquidaciones: liqR.data || [],
          config:        cfgR.data || [],
        }
      };
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], {type:'application/json'});
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const fecha = new Date().toISOString().slice(0,10);
      a.href     = url;
      a.download = `matilda_backup_${fecha}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Backup descargado ✓ — ${backup.tablas.presupuestos.length} presupuestos, ${backup.tablas.clientes.length} clientes`);
    } catch(e) {
      showToast('Error en backup: ' + e.message);
    }
  }

  const TABS=[['config','⚙️ Config'],['categorias','🏷️ Categorías'],['ejecutivos','👤 Ejecutivos'],['clientes','🏢 Clientes'],['usuarios','👥 Usuarios'],['logo','🖼️ Logo'],['backup','💾 Backup']];

  return(
    <div>
      <h2 style={{fontSize:20,fontWeight:700,color:'#0d3b5e',marginBottom:16}}>⚙️ Administración</h2>
      <div style={{display:'flex',gap:6,marginBottom:20,borderBottom:'2px solid #dde6ef',paddingBottom:0,flexWrap:'wrap'}}>
        {TABS.map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{padding:'8px 14px',border:'none',borderBottom:tab===k?'2px solid #c8264a':'2px solid transparent',background:'none',cursor:'pointer',fontSize:13,fontWeight:tab===k?700:400,color:tab===k?'#c8264a':'#5a7a9a',marginBottom:-2}}>
            {l}
          </button>
        ))}
      </div>

      {tab==='config'&&(
        <div style={S.card}>
          <h3 style={{fontSize:15,fontWeight:700,color:'#0d3b5e',marginBottom:6}}>Porcentajes globales</h3>
          <p style={{fontSize:12,color:'#8aa0b8',marginBottom:16}}>⚠️ Solo aplica a presupuestos nuevos creados después del cambio.</p>
          <div style={S.grid4}>
            {[['OH (%)','oh_pct'],['BCO (%)','bco_pct'],['Fee agencia (%)','fee_agencia'],['Rebate (%)','rebate_pct']].map(([l,k])=>(
              <div key={k}><Label>{l}</Label><input type="number" step="0.1" style={S.input} value={cfg[k]??0} onChange={e=>setCfg(p=>({...p,[k]:parseFloat(e.target.value)??0}))}/></div>
            ))}
          </div>
          <div style={{marginTop:16}}><button style={S.btnPrimary} onClick={saveCfg} disabled={saving}>{saving?'Guardando…':'💾 Guardar configuración'}</button></div>
        </div>
      )}

      {tab==='categorias'&&(
        <div style={S.card}>
          <h3 style={{fontSize:15,fontWeight:700,color:'#0d3b5e',marginBottom:16}}>Categorías de ítems (internas)</h3>
          <div style={{display:'flex',gap:8,marginBottom:16}}>
            <input style={{...S.input,flex:1}} value={newCat} onChange={e=>setNewCat(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addCat()} placeholder="Nueva categoría…"/>
            <button style={S.btnPrimary} onClick={addCat}>+ Agregar</button>
          </div>
          <div style={{display:'flex',flexWrap:'wrap',gap:8}}>
            {categorias.map(c=>(
              <div key={c.id} style={{display:'flex',alignItems:'center',gap:6,background:'#eef4fb',border:'1px solid #c8d8e8',borderRadius:6,padding:'5px 10px'}}>
                <span style={{fontSize:13,fontWeight:600,color:'#0d3b5e'}}>{c.nombre}</span>
                <button onClick={()=>deleteCat(c.id)} style={{background:'none',border:'none',cursor:'pointer',color:'#c8264a',fontSize:14}}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab==='ejecutivos'&&(
        <div>
          <div style={S.card}>
            <h3 style={{fontSize:15,fontWeight:700,color:'#0d3b5e',marginBottom:14}}>Agregar ejecutivo de contacto</h3>
            <div style={S.grid2}>
              <div><Label>Nombre completo *</Label><input style={S.input} value={newEjec.nombre} onChange={e=>setNewEjec(p=>({...p,nombre:e.target.value}))}/></div>
              <div><Label>Cargo</Label><input style={S.input} value={newEjec.cargo} onChange={e=>setNewEjec(p=>({...p,cargo:e.target.value}))} placeholder="Ej: Ejecutiva de Eventos"/></div>
              <div style={{gridColumn:'1/-1'}}><Label>Correo electrónico *</Label><input style={S.input} type="email" value={newEjec.email} onChange={e=>setNewEjec(p=>({...p,email:e.target.value}))}/></div>
            </div>
            <button style={{...S.btnPrimary,marginTop:12}} onClick={saveEjec}>+ Agregar ejecutivo</button>
          </div>
          <div style={S.card}>
            <h3 style={{fontSize:15,fontWeight:700,color:'#0d3b5e',marginBottom:14}}>Ejecutivos ({ejecutivos.length})</h3>
            <table style={S.table}>
              <thead><tr>{['Nombre','Cargo','Email',''].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {ejecutivos.map(e=>(
                  <tr key={e.id}>
                    <td style={S.td}><strong>{e.nombre}</strong></td>
                    <td style={S.td}>{e.cargo}</td>
                    <td style={S.td}>{e.email}</td>
                    <td style={S.td}><div style={{display:'flex',gap:4}}>
                      <button style={S.btnSm} onClick={()=>setEditEjec({...e})}>✏️</button>
                      <button style={S.btnRed} onClick={()=>deleteEjec(e.id)}>🗑</button>
                    </div></td>
                  </tr>
                ))}
                {ejecutivos.length===0&&<tr><td colSpan={4} style={{...S.td,textAlign:'center',color:'#8aa0b8'}}>Sin ejecutivos registrados</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab==='clientes'&&(
        <div>
          <div style={S.card}>
            <h3 style={{fontSize:15,fontWeight:700,color:'#0d3b5e',marginBottom:14}}>Agregar cliente</h3>
            <div style={S.grid2}>
              <div><Label>Nombre / Razón social *</Label><input style={S.input} value={newCli.nombre} onChange={e=>setNewCli(p=>({...p,nombre:e.target.value}))}/></div>
              <div><Label>RUC / Cédula</Label><input style={S.input} value={newCli.ruc} onChange={e=>setNewCli(p=>({...p,ruc:e.target.value}))}/></div>
              <div><Label>Contacto</Label><input style={S.input} value={newCli.contacto} onChange={e=>setNewCli(p=>({...p,contacto:e.target.value}))}/></div>
              <div><Label>Email</Label><input style={S.input} value={newCli.email} onChange={e=>setNewCli(p=>({...p,email:e.target.value}))}/></div>
            </div>
            <button style={{...S.btnPrimary,marginTop:12}} onClick={saveCli}>+ Agregar cliente</button>
          </div>
          <div style={S.card}>
            <h3 style={{fontSize:15,fontWeight:700,color:'#0d3b5e',marginBottom:14}}>Lista de clientes ({clientes.length})</h3>
            <table style={S.table}>
              <thead><tr>{['Nombre','RUC','Contacto','Email',''].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {clientes.map(c=>(
                  <tr key={c.id}>
                    <td style={S.td}><strong>{c.nombre}</strong></td>
                    <td style={S.td}>{c.ruc}</td><td style={S.td}>{c.contacto}</td><td style={S.td}>{c.email}</td>
                    <td style={S.td}><div style={{display:'flex',gap:4}}><button style={S.btnSm} onClick={()=>setEditCli({...c})}>✏️</button><button style={S.btnRed} onClick={()=>deleteCli(c.id)}>🗑</button></div></td>
                  </tr>
                ))}
                {clientes.length===0&&<tr><td colSpan={5} style={{...S.td,textAlign:'center',color:'#8aa0b8'}}>Sin clientes</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab==='usuarios'&&(
        <div style={S.card}>
          <h3 style={{fontSize:15,fontWeight:700,color:'#0d3b5e',marginBottom:16}}>Crear usuario</h3>
          <div style={S.grid2}>
            <div><Label>Nombre</Label><input style={S.input} value={newUser.nombre} onChange={e=>setNewUser(p=>({...p,nombre:e.target.value}))}/></div>
            <div><Label>Rol</Label><select style={S.select} value={newUser.role} onChange={e=>setNewUser(p=>({...p,role:e.target.value}))}><option value="user">Usuario</option><option value="admin">Administrador</option></select></div>
            <div><Label>Email *</Label><input style={S.input} type="email" value={newUser.email} onChange={e=>setNewUser(p=>({...p,email:e.target.value}))}/></div>
            <div><Label>Contraseña *</Label><input style={S.input} type="password" value={newUser.password} onChange={e=>setNewUser(p=>({...p,password:e.target.value}))}/></div>
          </div>
          <button style={{...S.btnPrimary,marginTop:14}} onClick={createUser}>+ Crear usuario</button>
          <p style={{fontSize:12,color:'#8aa0b8',marginTop:10}}>Para eliminar usuarios ve a Supabase → Authentication → Users.</p>
        </div>
      )}

      {tab==='logo'&&(
        <div style={S.card}>
          <h3 style={{fontSize:15,fontWeight:700,color:'#0d3b5e',marginBottom:16}}>🖼️ Logo de Matilda</h3>
          <p style={{fontSize:13,color:'#5a7a9a',marginBottom:16}}>El logo aparece en el navbar y en todos los PDFs generados.</p>
          <div style={{display:'flex',alignItems:'flex-start',gap:24}}>
            <div style={{flex:1}}>
              <Label>Subir logo (PNG con fondo transparente ideal)</Label>
              <input type="file" accept="image/*" onChange={handleLogo} style={{marginTop:8,fontSize:13}}/>
            </div>
            <div style={{textAlign:'center'}}>
              <Label>Vista previa</Label>
              <div style={{marginTop:8,padding:12,background:'#0d3b5e',borderRadius:8,minWidth:160,minHeight:80,display:'flex',alignItems:'center',justifyContent:'center'}}>
                {logoPreview?<img src={logoPreview} alt="logo" style={{maxHeight:60,maxWidth:140,objectFit:'contain'}}/>:<span style={{color:'#8ab4d4',fontSize:12}}>Sin logo</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      )}

      {tab==='backup'&&(
        <div>
          <div style={S.card}>
            <h3 style={{fontSize:15,fontWeight:700,color:'#0d3b5e',marginBottom:8}}>💾 Copia de seguridad</h3>
            <p style={{fontSize:13,color:'#5a7a9a',marginBottom:20,lineHeight:1.6}}>
              Descarga un archivo JSON con todos los datos del sistema: presupuestos, ítems, clientes, ejecutivos, liquidaciones y configuración. Guárdalo en Google Drive o en tu computadora.
            </p>
            <div style={{background:'#f0f4f8',borderRadius:10,padding:'20px',marginBottom:16,display:'flex',alignItems:'center',gap:20}}>
              <div style={{fontSize:48}}>📦</div>
              <div style={{flex:1}}>
                <div style={{fontSize:15,fontWeight:700,color:'#0d3b5e',marginBottom:4}}>Backup completo</div>
                <div style={{fontSize:13,color:'#5a7a9a'}}>Incluye: presupuestos · clientes · ejecutivos · liquidaciones · categorías · configuración</div>
                <div style={{fontSize:12,color:'#8aa0b8',marginTop:4}}>Formato JSON · Se puede restaurar si es necesario</div>
              </div>
              <button style={{...S.btnPrimary,padding:'12px 24px',fontSize:15,background:'#2e8b4e'}} onClick={downloadBackup}>
                ⬇ Descargar backup
              </button>
            </div>
            <div style={{background:'#fff8e6',border:'1px solid #f0d080',borderRadius:8,padding:'12px 16px'}}>
              <div style={{fontSize:13,fontWeight:700,color:'#7a5500',marginBottom:4}}>📅 Recomendación</div>
              <div style={{fontSize:12,color:'#a07020',lineHeight:1.6}}>
                Haz un backup <strong>una vez por semana</strong> y guárdalo en Google Drive en una carpeta llamada "Backups Matilda". 
                Nombra cada archivo con la fecha para tener historial. En caso de cualquier problema, el equipo de soporte puede restaurar los datos desde este archivo.
              </div>
            </div>
          </div>

          <div style={S.card}>
            <h3 style={{fontSize:15,fontWeight:700,color:'#0d3b5e',marginBottom:8}}>🔒 Backups automáticos en Supabase</h3>
            <p style={{fontSize:13,color:'#5a7a9a',marginBottom:12,lineHeight:1.6}}>
              Supabase guarda copias automáticas diarias. Para verlas o activar backups más frecuentes:
            </p>
            <ol style={{fontSize:13,color:'#5a7a9a',lineHeight:2,paddingLeft:20}}>
              <li>Ve a <strong style={{color:'#0d3b5e'}}>supabase.com</strong> → tu proyecto</li>
              <li>Clic en <strong style={{color:'#0d3b5e'}}>Settings → Backups</strong></li>
              <li>En el plan gratuito tienes backups diarios por 7 días</li>
              <li>Con el plan Pro ($25/mes) tienes 30 días de historial y restauración con un clic</li>
            </ol>
          </div>
        </div>
      )}

      {editCli&&(
        <Modal title="Editar cliente" onClose={()=>setEditCli(null)}>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div><Label>Nombre</Label><input style={S.input} value={editCli.nombre} onChange={e=>setEditCli(p=>({...p,nombre:e.target.value}))}/></div>
            <div><Label>RUC</Label><input style={S.input} value={editCli.ruc||''} onChange={e=>setEditCli(p=>({...p,ruc:e.target.value}))}/></div>
            <div><Label>Contacto</Label><input style={S.input} value={editCli.contacto||''} onChange={e=>setEditCli(p=>({...p,contacto:e.target.value}))}/></div>
            <div><Label>Email</Label><input style={S.input} value={editCli.email||''} onChange={e=>setEditCli(p=>({...p,email:e.target.value}))}/></div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:8}}>
              <button style={S.btnSecondary} onClick={()=>setEditCli(null)}>Cancelar</button>
              <button style={S.btnPrimary} onClick={updateCli}>Guardar</button>
            </div>
          </div>
        </Modal>
      )}

      {editEjec&&(
        <Modal title="Editar ejecutivo" onClose={()=>setEditEjec(null)}>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div><Label>Nombre</Label><input style={S.input} value={editEjec.nombre} onChange={e=>setEditEjec(p=>({...p,nombre:e.target.value}))}/></div>
            <div><Label>Cargo</Label><input style={S.input} value={editEjec.cargo||''} onChange={e=>setEditEjec(p=>({...p,cargo:e.target.value}))}/></div>
            <div><Label>Email</Label><input style={S.input} type="email" value={editEjec.email||''} onChange={e=>setEditEjec(p=>({...p,email:e.target.value}))}/></div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:8}}>
              <button style={S.btnSecondary} onClick={()=>setEditEjec(null)}>Cancelar</button>
              <button style={S.btnPrimary} onClick={updateEjec}>Guardar</button>
            </div>
          </div>
        </Modal>
      )}
      <Toast msg={toast}/>
    </div>
  );
}
