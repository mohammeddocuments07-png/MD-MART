-- MD MART starter schema for Supabase (PostgreSQL)
-- Run this entire file in Supabase Dashboard -> SQL Editor -> New query.
-- Never put a Supabase service_role key in frontend code.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'MD MART member',
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  category text not null check (category in ('Electronics','Home','Fashion','Beauty','Sports','Other')),
  price numeric(12,2) not null check (price > 0),
  stock integer not null default 1 check (stock >= 0),
  image_url text,
  description text not null default '' check (char_length(description) <= 1000),
  status text not null default 'active' check (status in ('active','paused','sold_out')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id),
  status text not null default 'pending' check (status in ('pending','confirmed','shipped','delivered','cancelled')),
  total_amount numeric(12,2) not null check (total_amount >= 0),
  payment_method text not null default 'cod' check (payment_method in ('cod')),
  shipping_name text not null,
  shipping_phone text not null,
  shipping_address text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  seller_id uuid not null references public.profiles(id),
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price > 0),
  created_at timestamptz not null default now()
);

create index if not exists products_status_created_idx on public.products(status, created_at desc);
create index if not exists products_seller_idx on public.products(seller_id);
create index if not exists orders_buyer_created_idx on public.orders(buyer_id, created_at desc);
create index if not exists order_items_seller_idx on public.order_items(seller_id);

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "Profiles are publicly readable" on public.profiles;
create policy "Profiles are publicly readable" on public.profiles for select using (true);
drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile" on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "Anyone can read active products" on public.products;
create policy "Anyone can read active products" on public.products for select using (status = 'active' or seller_id = auth.uid());
drop policy if exists "Signed-in users can create own products" on public.products;
create policy "Signed-in users can create own products" on public.products for insert to authenticated with check (seller_id = auth.uid());
drop policy if exists "Sellers can update their own products" on public.products;
create policy "Sellers can update their own products" on public.products for update to authenticated using (seller_id = auth.uid()) with check (seller_id = auth.uid());
drop policy if exists "Sellers can delete their own products" on public.products;
create policy "Sellers can delete their own products" on public.products for delete to authenticated using (seller_id = auth.uid());

drop policy if exists "Buyers can view their own orders" on public.orders;
create policy "Buyers can view their own orders" on public.orders for select to authenticated using (buyer_id = auth.uid());
drop policy if exists "Buyers can view their order items" on public.order_items;
create policy "Buyers can view their order items" on public.order_items for select to authenticated using (
  exists (select 1 from public.orders o where o.id = order_id and o.buyer_id = auth.uid())
  or seller_id = auth.uid()
);

-- Creates an order using server-side product prices and stock, not prices sent by the browser.
-- Each cart item is {"product_id":"UUID","quantity":1}. Payment is COD only in this free starter.
create or replace function public.place_MD MART_order(
  p_items jsonb,
  p_shipping jsonb,
  p_payment_method text default 'cod'
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_buyer uuid := auth.uid();
  v_order_id uuid := gen_random_uuid();
  v_total numeric(12,2) := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_qty integer;
begin
  if v_buyer is null then raise exception 'Please sign in before placing an order'; end if;
  if p_payment_method <> 'cod' then raise exception 'Only cash on delivery is enabled in this version'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'Cart must contain between 1 and 50 items';
  end if;
  if coalesce(length(trim(p_shipping->>'full_name')),0) < 2
    or coalesce(length(trim(p_shipping->>'phone')),0) < 8
    or coalesce(length(trim(p_shipping->>'address')),0) < 8 then
    raise exception 'Please provide a valid name, phone number and delivery address';
  end if;

  -- Validate/lock all requested products first and compute total from database values.
  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce(v_item->>'product_id','') = '' then raise exception 'Invalid product'; end if;
    v_qty := (v_item->>'quantity')::integer;
    if v_qty < 1 or v_qty > 100 then raise exception 'Invalid quantity'; end if;
    select * into v_product from public.products
      where id = (v_item->>'product_id')::uuid and status = 'active'
      for update;
    if not found then raise exception 'A product is unavailable'; end if;
    if v_product.seller_id = v_buyer then raise exception 'You cannot buy your own listing'; end if;
    if v_product.stock < v_qty then raise exception 'Insufficient stock for: %', v_product.name; end if;
    v_total := v_total + (v_product.price * v_qty);
  end loop;

  insert into public.orders(id,buyer_id,status,total_amount,payment_method,shipping_name,shipping_phone,shipping_address)
  values(v_order_id,v_buyer,'pending',v_total,'cod',
    trim(p_shipping->>'full_name'),trim(p_shipping->>'phone'),trim(p_shipping->>'address'));

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::integer;
    select * into v_product from public.products where id = (v_item->>'product_id')::uuid for update;
    insert into public.order_items(order_id,product_id,seller_id,product_name,quantity,unit_price)
    values(v_order_id,v_product.id,v_product.seller_id,v_product.name,v_qty,v_product.price);
    update public.products set stock = stock - v_qty,
      status = case when stock - v_qty = 0 then 'sold_out' else status end,
      updated_at = now()
      where id = v_product.id;
  end loop;
  return v_order_id;
end;
$$;

revoke all on function public.place_MD MART_order(jsonb,jsonb,text) from public;
grant execute on function public.place_MD MART_order(jsonb,jsonb,text) to authenticated;

-- Allow authenticated users to create the profile row the first time they sign in.
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant select on public.products to anon;
grant select on public.orders to authenticated;
grant select on public.order_items to authenticated;
