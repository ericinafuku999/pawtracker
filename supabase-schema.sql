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
  arrival_reminder_sent boolean not null default false,
  departure_date date not null,
  departure_time time,
  departure_reminder_sent boolean not null default false,
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

-- Push notification subscriptions (one row per device that enables alerts)
create table if not exists push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);

-- Calendar days marked unavailable (e.g. vacation), one row per blocked date
create table if not exists blocked_days (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  blocked_date date not null,
  reason text,
  created_at timestamptz default now(),
  unique (user_id, blocked_date)
);

-- Meet & Greet appointments (prospective clients, before a real booking exists)
create table if not exists meet_greets (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  customer_name text not null,
  dog_names text not null default '',
  scheduled_date date not null,
  scheduled_time time,
  reminder_sent boolean not null default false,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Row Level Security: users can only see their own data
alter table bookings enable row level security;
alter table expenses enable row level security;
alter table push_subscriptions enable row level security;
alter table blocked_days enable row level security;
alter table meet_greets enable row level security;

create policy "Users see own bookings" on bookings for all using (auth.uid() = user_id);
create policy "Users see own expenses" on expenses for all using (auth.uid() = user_id);
create policy "Users manage own push subscriptions" on push_subscriptions for all using (auth.uid() = user_id);
create policy "Users manage own blocked days" on blocked_days for all using (auth.uid() = user_id);
create policy "Users manage own meet greets" on meet_greets for all using (auth.uid() = user_id);
