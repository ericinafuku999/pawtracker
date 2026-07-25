-- Run this in your Supabase SQL Editor (supabase.com → your project → SQL Editor)

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Bookings table
create table if not exists bookings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  customer_name text not null,
  dog_names text not null default '',
  number_of_dogs integer not null default 1,
  arrival_date date not null,
  arrival_time time,
  departure_date date not null,
  departure_time time,
  number_of_days integer not null default 0,
  dog_days integer not null default 0,
  dog_days_override integer,
  rate_per_dog_day numeric not null default 50,
  total_revenue numeric not null default 0,
  payment_type text not null check (payment_type in ('Rover', 'Venmo')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'partially paid', 'paid')),
  amount_received numeric not null default 0,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  cancellation_reason text,
  notes text,
  month_allocations jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Expenses table
create table if not exists expenses (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  expense_date date not null,
  vendor text not null,
  amount numeric not null,
  category text not null,
  payment_method text,
  tax_deductible boolean not null default true,
  business_use_percentage numeric not null default 100,
  deductible_amount numeric not null default 0,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Row Level Security: users can only see their own data
alter table bookings enable row level security;
alter table expenses enable row level security;

create policy "Users see own bookings" on bookings for all using (auth.uid() = user_id);
create policy "Users see own expenses" on expenses for all using (auth.uid() = user_id);
