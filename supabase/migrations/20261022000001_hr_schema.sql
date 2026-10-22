-- LEECO HR — core schema
-- All tables live in `public` (so they show up in the Supabase table editor) but are
-- locked down: RLS on, no policies, and no table grants for anon/authenticated.
-- The web app only talks to the database through the hr_* RPC functions
-- (see the next migration), which check the caller's session token themselves.

create schema if not exists hr_private;
revoke all on schema hr_private from public, anon, authenticated;

-- ---------------------------------------------------------------- employees
create table public.employees (
  id               uuid primary key default gen_random_uuid(),
  emp_code         text not null unique,
  prefix           text,                       -- นาย / นาง / น.ส.
  first_name       text not null,
  last_name        text not null default '',
  nickname         text,
  work_group       text,                       -- section header in the sheet: ออฟฟิศ, คลังสินค้า, แผนกพับ …
  department       text,
  position         text,
  company          text,                       -- employing entity: เฮง / JPP / จิรสิน / นอกระบบ
  start_date       date,
  note             text,
  sort_order       int,                        -- ลำดับ from the HR sheet, keeps the familiar order
  role            text not null default 'employee' check (role in ('employee', 'admin')),
  track_attendance boolean not null default true,  -- false for system/admin-only accounts
  active           boolean not null default true,
  pin_hash         text,
  must_change_pin  boolean not null default true,
  failed_attempts  int not null default 0,
  locked_until     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index employees_name_idx on public.employees (lower(first_name), lower(last_name));

-- ---------------------------------------------------------------- holidays
create table public.holidays (
  id           uuid primary key default gen_random_uuid(),
  holiday_date date not null,
  name         text not null,
  type         text not null default 'company' check (type in ('public', 'company')),
  company_off  boolean not null default true,  -- false = public holiday but the company still works
  note         text,
  created_at   timestamptz not null default now(),
  unique (holiday_date, name)
);
create index holidays_date_idx on public.holidays (holiday_date);

-- ---------------------------------------------------------------- attendance
create table public.attendance (
  id                   uuid primary key default gen_random_uuid(),
  employee_id          uuid not null references public.employees (id) on delete cascade,
  work_date            date not null,            -- date in Asia/Bangkok
  check_in_at          timestamptz,
  check_out_at         timestamptz,
  check_in_lat         double precision,
  check_in_lng         double precision,
  check_in_accuracy_m  real,
  check_in_distance_m  real,
  check_out_lat        double precision,
  check_out_lng        double precision,
  check_out_accuracy_m real,
  check_out_distance_m real,
  late_minutes         int not null default 0,
  admin_note           text,
  edited_by            uuid references public.employees (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (employee_id, work_date)
);
create index attendance_date_idx on public.attendance (work_date);

-- ---------------------------------------------------------------- settings (single row)
create table public.settings (
  id                 int primary key default 1 check (id = 1),
  company_name       text not null default 'LEECO',
  work_start         time not null default '08:00',
  work_end           time not null default '17:00',
  late_grace_minutes int not null default 0,
  work_days          int[] not null default '{1,2,3,4,5,6}',  -- ISO weekday: 1 = Mon … 7 = Sun
  require_location   boolean not null default false,
  site_lat           double precision,
  site_lng           double precision,
  site_radius_m      int not null default 300,
  updated_at         timestamptz not null default now()
);
insert into public.settings default values;

-- ---------------------------------------------------------------- import log
create table public.import_logs (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('employees', 'holidays')),
  file_name   text,
  summary     jsonb not null default '{}'::jsonb,
  imported_by uuid references public.employees (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- sessions (private)
create table hr_private.sessions (
  token_hash  text primary key,              -- sha256 hex of the token held in the browser cookie
  employee_id uuid not null references public.employees (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  user_agent  text
);
create index sessions_employee_idx on hr_private.sessions (employee_id);

create sequence hr_private.emp_code_seq start 1;

-- ---------------------------------------------------------------- lock down
alter table public.employees   enable row level security;
alter table public.holidays    enable row level security;
alter table public.attendance  enable row level security;
alter table public.settings    enable row level security;
alter table public.import_logs enable row level security;

revoke all on public.employees, public.holidays, public.attendance, public.settings, public.import_logs
  from anon, authenticated;

-- keep updated_at honest
create or replace function hr_private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger employees_touch  before update on public.employees  for each row execute function hr_private.touch_updated_at();
create trigger attendance_touch before update on public.attendance for each row execute function hr_private.touch_updated_at();
create trigger settings_touch   before update on public.settings   for each row execute function hr_private.touch_updated_at();
