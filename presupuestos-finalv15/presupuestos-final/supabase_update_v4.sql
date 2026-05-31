-- ============================================================
-- ACTUALIZACIÓN V4 — Ejecutar en Supabase > SQL Editor
-- ============================================================

-- Nuevas columnas en presupuestos
alter table presupuestos add column if not exists ejecutado boolean default false;

-- Tabla ejecutivos (si no existe)
create table if not exists ejecutivos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null, email text default '', cargo text default '',
  created_at timestamptz default now()
);
alter table ejecutivos enable row level security;
create policy "acceso_auth" on ejecutivos for all to authenticated using (true) with check (true);

-- Actualizar roles en usuarios existentes (admin)
-- Cambia el email por el tuyo:
-- update auth.users set raw_user_meta_data = raw_user_meta_data || '{"role":"admin"}' where email = 'camille@matilda.agency';

-- Para Johanna y Taylor (financiero):
-- update auth.users set raw_user_meta_data = raw_user_meta_data || '{"role":"financiero"}' where email = 'johanna@matilda.agency';
-- update auth.users set raw_user_meta_data = raw_user_meta_data || '{"role":"financiero"}' where email = 'taylor@matilda.agency';

-- Los campos de los ítems (costo_real_unit, bco_real_pct, costo_aprobado, num_factura_prov, foto_referencia, subcategoria)
-- se guardan dentro del JSON de 'items' — no requieren columnas nuevas.

select 'Actualización v4 completada' as resultado;
