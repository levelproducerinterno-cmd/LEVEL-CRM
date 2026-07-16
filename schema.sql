-- Level CRM · Módulo Dirección (Cotizaciones + Contratos)
-- Pega esto completo en Supabase: Project → SQL Editor → New query → Run

create extension if not exists "pgcrypto";

create table if not exists cotizaciones (
  id uuid primary key default gen_random_uuid(),
  nombre_prospecto text not null,
  contacto text,
  servicio text,
  monto numeric,
  fecha_envio date,
  estado text not null default 'pendiente' check (estado in ('pendiente','cerrada','perdida')),
  fecha_resolucion date,
  motivo_perdida text,
  notas text,
  created_at timestamptz not null default now()
);

create table if not exists contratos (
  id uuid primary key default gen_random_uuid(),
  cotizacion_id uuid references cotizaciones(id) on delete set null,
  nombre_cliente text not null,
  monto_mensual numeric,
  fecha_firma date,
  duracion_meses int,
  servicios text,
  notas text,
  created_at timestamptz not null default now()
);

alter table cotizaciones enable row level security;
alter table contratos enable row level security;

-- Abierto para el equipo interno (misma exposición que hoy tiene el Web App de Apps Script).
-- Se puede endurecer más adelante agregando autenticación.
create policy "cotizaciones_anon_all" on cotizaciones
  for all to anon using (true) with check (true);

create policy "contratos_anon_all" on contratos
  for all to anon using (true) with check (true);
