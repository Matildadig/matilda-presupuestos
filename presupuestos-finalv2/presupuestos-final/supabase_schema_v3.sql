-- ============================================================
-- SCHEMA V3 — Sistema Matilda Digital
-- Ejecuta en Supabase > SQL Editor > New query
-- ============================================================

-- 1. Config
create table if not exists config (
  id int primary key default 1, oh_pct numeric default 15,
  bco_pct numeric default 5.5, fee_agencia numeric default 5,
  rebate_pct numeric default 2, updated_at timestamptz default now()
);
insert into config (id) values (1) on conflict do nothing;

-- 2. Categorías
create table if not exists categorias (
  id uuid primary key default gen_random_uuid(), nombre text not null unique
);
insert into categorias (nombre) values
  ('PERSONAL'),('ESCENARIO'),('ALIMENTACION'),('INGRESOS'),('ACTIVIDADES'),
  ('FOYER'),('AMBIENTACION'),('FIESTA'),('LOGISTICA'),('CAMISETAS'),('OTROS')
on conflict do nothing;

-- 3. Clientes
create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null, ruc text default '',
  contacto text default '', email text default '',
  created_at timestamptz default now()
);

-- 4. Presupuestos (drop y recrear para agregar nuevos campos)
drop table if exists presupuestos cascade;
create table presupuestos (
  id            uuid primary key default gen_random_uuid(),
  nomenclatura  text default '',
  nombre        text default '',
  cliente       text default '',
  fecha_evento  date,
  ciudad        text default 'Guayaquil',
  lugar         text default '',
  horario       text default '',
  personas      integer default 0,
  dias_evento   integer default 1,
  fee_agencia   numeric default 5,
  oh_pct        numeric default 15,
  bco_pct       numeric default 5.5,
  rebate_pct    numeric default 2,
  apply_rebate  boolean default false,
  estado        text default 'borrador',
  notas         text default '',
  items         jsonb default '[]'::jsonb,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- 5. Liquidaciones
drop table if exists liquidaciones cascade;
create table liquidaciones (
  id                 uuid primary key default gen_random_uuid(),
  presupuesto_id     uuid references presupuestos(id) on delete set null,
  presupuesto_nombre text default '',
  evento             text default '',
  responsable        text default '',
  estado             text default 'abierta',
  notas              text default '',
  gastos             jsonb default '[]'::jsonb,
  comprobante_url    text default '',
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- 6. Triggers
create or replace function update_updated_at()
returns trigger as $$ begin new.updated_at=now(); return new; end; $$ language plpgsql;

drop trigger if exists trg_ppto on presupuestos;
create trigger trg_ppto before update on presupuestos for each row execute function update_updated_at();
drop trigger if exists trg_liq on liquidaciones;
create trigger trg_liq before update on liquidaciones for each row execute function update_updated_at();

-- 7. RLS
alter table config enable row level security;
alter table categorias enable row level security;
alter table clientes enable row level security;
alter table presupuestos enable row level security;
alter table liquidaciones enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='config' and policyname='auth_all') then
    create policy auth_all on config for all to authenticated using (true) with check (true); end if;
  if not exists (select 1 from pg_policies where tablename='categorias' and policyname='auth_all') then
    create policy auth_all on categorias for all to authenticated using (true) with check (true); end if;
  if not exists (select 1 from pg_policies where tablename='clientes' and policyname='auth_all') then
    create policy auth_all on clientes for all to authenticated using (true) with check (true); end if;
  if not exists (select 1 from pg_policies where tablename='presupuestos' and policyname='auth_all') then
    create policy auth_all on presupuestos for all to authenticated using (true) with check (true); end if;
  if not exists (select 1 from pg_policies where tablename='liquidaciones' and policyname='auth_all') then
    create policy auth_all on liquidaciones for all to authenticated using (true) with check (true); end if;
end $$;

-- 8. Realtime
alter publication supabase_realtime add table presupuestos;
alter publication supabase_realtime add table liquidaciones;

select 'Schema v3 creado correctamente' as resultado;
