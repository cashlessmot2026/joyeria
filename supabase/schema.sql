-- ROUX Joyas 18K · esquema de Supabase
-- Pega este archivo completo en Supabase > SQL Editor > Run. Después ejecuta seed.sql.
-- Es seguro ejecutarlo más de una vez.

create extension if not exists pgcrypto with schema extensions;

-- ───────── Tablas ─────────
create table if not exists public.categories (
  name text primary key,
  image text,
  sort int not null default 0
);

create table if not exists public.products (
  id text primary key,
  name text not null,
  category text not null,
  detail text default '',
  image text default '',
  price bigint not null default 0,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id text primary key,
  created_at timestamptz not null default now(),
  customer jsonb not null,
  items jsonb not null,
  total bigint not null,
  pdf_url text,
  image_url text,
  status text not null default 'nuevo'
);

-- Secretos de la app (hash de la clave de admin). Sin políticas = inaccesible desde el navegador.
create table if not exists public.app_secrets (
  key text primary key,
  value text not null
);

insert into public.app_secrets (key, value)
values ('admin_hash', extensions.crypt('123', extensions.gen_salt('bf')))
on conflict (key) do nothing;

-- ───────── Seguridad por filas (RLS) ─────────
alter table public.categories enable row level security;
alter table public.products   enable row level security;
alter table public.orders     enable row level security;
alter table public.app_secrets enable row level security;

drop policy if exists "catalogo publico categorias" on public.categories;
create policy "catalogo publico categorias" on public.categories for select to anon, authenticated using (true);

drop policy if exists "catalogo publico productos" on public.products;
create policy "catalogo publico productos" on public.products for select to anon, authenticated using (true);

-- Los clientes solo pueden CREAR pedidos (no leerlos ni modificarlos).
drop policy if exists "clientes crean pedidos" on public.orders;
create policy "clientes crean pedidos" on public.orders for insert to anon, authenticated
  with check (status = 'nuevo' and total >= 0);

-- ───────── Funciones de administración (verifican la clave en el servidor) ─────────
create or replace function public._admin_ok(pwd text) returns boolean
language sql security definer set search_path = public, extensions as $$
  select exists (select 1 from public.app_secrets
                 where key = 'admin_hash' and value = extensions.crypt(pwd, value));
$$;

create or replace function public.admin_check(pwd text) returns boolean
language sql security definer set search_path = public, extensions as $$
  select public._admin_ok(pwd);
$$;

create or replace function public.admin_upsert_product(pwd text, p jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._admin_ok(pwd) then raise exception 'clave incorrecta'; end if;
  insert into public.products (id, name, category, detail, image, price, active, sort)
  values (p->>'id', p->>'name', p->>'category', coalesce(p->>'detail',''), coalesce(p->>'image',''),
          coalesce((p->>'price')::bigint, 0), coalesce((p->>'active')::boolean, true),
          coalesce((p->>'sort')::int, 0))
  on conflict (id) do update set
    name = excluded.name, category = excluded.category, detail = excluded.detail,
    image = excluded.image, price = excluded.price, active = excluded.active;
end $$;

create or replace function public.admin_delete_product(pwd text, pid text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._admin_ok(pwd) then raise exception 'clave incorrecta'; end if;
  delete from public.products where id = pid;
end $$;

create or replace function public.admin_upsert_category(pwd text, c jsonb, old_name text default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._admin_ok(pwd) then raise exception 'clave incorrecta'; end if;
  if old_name is not null and old_name <> c->>'name' then
    update public.categories set name = c->>'name', image = coalesce(c->>'image','') where name = old_name;
    update public.products set category = c->>'name' where category = old_name;
  else
    insert into public.categories (name, image, sort)
    values (c->>'name', coalesce(c->>'image',''), coalesce((c->>'sort')::int, 0))
    on conflict (name) do update set image = excluded.image;
  end if;
end $$;

create or replace function public.admin_delete_category(pwd text, cname text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._admin_ok(pwd) then raise exception 'clave incorrecta'; end if;
  if exists (select 1 from public.products where category = cname) then
    raise exception 'la categoría tiene productos; muévelos antes de borrarla';
  end if;
  delete from public.categories where name = cname;
end $$;

create or replace function public.admin_orders(pwd text) returns setof public.orders
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._admin_ok(pwd) then raise exception 'clave incorrecta'; end if;
  return query select * from public.orders order by created_at desc limit 200;
end $$;

create or replace function public.admin_set_order_status(pwd text, oid text, new_status text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._admin_ok(pwd) then raise exception 'clave incorrecta'; end if;
  update public.orders set status = new_status where id = oid;
end $$;

create or replace function public.admin_change_password(pwd text, new_pwd text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._admin_ok(pwd) then raise exception 'clave incorrecta'; end if;
  if length(new_pwd) < 3 then raise exception 'clave muy corta'; end if;
  update public.app_secrets set value = extensions.crypt(new_pwd, extensions.gen_salt('bf'))
   where key = 'admin_hash';
end $$;

revoke all on function public._admin_ok(text) from public, anon, authenticated;
grant execute on function public.admin_check(text) to anon, authenticated;
grant execute on function public.admin_upsert_product(text, jsonb) to anon, authenticated;
grant execute on function public.admin_delete_product(text, text) to anon, authenticated;
grant execute on function public.admin_upsert_category(text, jsonb, text) to anon, authenticated;
grant execute on function public.admin_delete_category(text, text) to anon, authenticated;
grant execute on function public.admin_orders(text) to anon, authenticated;
grant execute on function public.admin_set_order_status(text, text, text) to anon, authenticated;
grant execute on function public.admin_change_password(text, text) to anon, authenticated;

-- ───────── Almacenamiento de tickets (PDF e imagen) ─────────
insert into storage.buckets (id, name, public)
values ('tickets', 'tickets', true)
on conflict (id) do nothing;

drop policy if exists "tickets lectura publica" on storage.objects;
create policy "tickets lectura publica" on storage.objects for select to anon, authenticated
  using (bucket_id = 'tickets');

drop policy if exists "tickets subida clientes" on storage.objects;
create policy "tickets subida clientes" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'tickets' and name ~ '^RJ-[A-Z0-9-]+\.(pdf|png)$');
