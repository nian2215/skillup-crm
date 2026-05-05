-- Payments table for Thawani
-- Run in Supabase SQL Editor

create table if not exists payments (
  id          uuid default uuid_generate_v4() primary key,
  user_id     uuid references auth.users on delete cascade not null,
  plan        text not null check (plan in ('basic','pro','enterprise')),
  amount      numeric not null,
  currency    text default 'OMR',
  session_id  text unique,
  status      text default 'pending' check (status in ('pending','paid','failed')),
  paid_at     timestamptz,
  created_at  timestamptz default now()
);

alter table payments enable row level security;

create policy "Users view own payments"
  on payments for select using (auth.uid() = user_id);
