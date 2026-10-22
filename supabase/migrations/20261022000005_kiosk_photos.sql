-- Kiosk check-in with a required selfie, monthly report review, and photo clean-up.
--
-- Employees no longer log in. A kiosk page (opened through a link that carries settings.kiosk_key)
-- lists everyone; a person taps their name, takes a selfie, and checks in or out.
-- Selfies are small JPEG thumbnails kept in attendance_photos. A photo is deleted only when
--   (1) HR has marked that month's report as reviewed (report_reviews), and
--   (2) the photo is older than 30 days.
-- An unreviewed month is never purged.

-- ---------------------------------------------------------------- tables
alter table public.settings
  add column if not exists kiosk_key text not null default encode(extensions.gen_random_bytes(12), 'hex');

create table if not exists public.attendance_photos (
  id            uuid primary key default gen_random_uuid(),
  attendance_id uuid not null references public.attendance (id) on delete cascade,
  employee_id   uuid not null references public.employees (id) on delete cascade,
  work_date     date not null,
  kind          text not null check (kind in ('in', 'out')),
  image         text not null,            -- data:image/jpeg;base64,… (~10 KB thumbnail)
  bytes         int not null,
  taken_at      timestamptz not null default now(),
  unique (attendance_id, kind)
);
create index if not exists attendance_photos_date_idx on public.attendance_photos (work_date);

create table if not exists public.report_reviews (
  month       date primary key,           -- first day of the month
  reviewed    boolean not null default true,
  reviewed_by uuid references public.employees (id) on delete set null,
  reviewed_at timestamptz not null default now(),
  note        text
);

alter table public.attendance_photos enable row level security;
alter table public.report_reviews    enable row level security;
revoke all on public.attendance_photos, public.report_reviews from anon, authenticated;

-- ---------------------------------------------------------------- shared stamping logic
create or replace function hr_private.stamp(p_emp uuid, p_kind text, p_lat float8, p_lng float8, p_accuracy real)
returns public.attendance language plpgsql security definer set search_path = '' as $$
declare
  e public.employees;
  d date := hr_private.bkk_today();
  v_dist float8;
  a public.attendance;
begin
  select * into e from public.employees where id = p_emp and active;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if not e.track_attendance then
    raise exception 'NOT_TRACKED';
  end if;
  v_dist := hr_private.check_location(p_lat, p_lng);

  select * into a from public.attendance where employee_id = e.id and work_date = d for update;

  if p_kind = 'in' then
    if found and a.check_in_at is not null then
      raise exception 'ALREADY_CHECKED_IN';
    end if;
    insert into public.attendance (employee_id, work_date, check_in_at, check_in_lat, check_in_lng,
                                   check_in_accuracy_m, check_in_distance_m, late_minutes)
    values (e.id, d, now(), p_lat, p_lng, p_accuracy, v_dist, hr_private.calc_late(now()))
    on conflict (employee_id, work_date) do update
       set check_in_at = excluded.check_in_at, check_in_lat = excluded.check_in_lat,
           check_in_lng = excluded.check_in_lng, check_in_accuracy_m = excluded.check_in_accuracy_m,
           check_in_distance_m = excluded.check_in_distance_m, late_minutes = excluded.late_minutes
    returning * into a;
  elsif p_kind = 'out' then
    if not found or a.check_in_at is null then
      raise exception 'NOT_CHECKED_IN';
    end if;
    if a.check_out_at is not null then
      raise exception 'ALREADY_CHECKED_OUT';
    end if;
    update public.attendance
       set check_out_at = now(), check_out_lat = p_lat, check_out_lng = p_lng,
           check_out_accuracy_m = p_accuracy, check_out_distance_m = v_dist,
           early_minutes = hr_private.calc_early(now())
     where id = a.id
    returning * into a;
  else
    raise exception 'BAD_INPUT';
  end if;
  return a;
end $$;

create or replace function hr_private.kiosk_check(p_key text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_key is null or length(p_key) < 16
     or p_key is distinct from (select kiosk_key from public.settings where id = 1) then
    raise exception 'KIOSK_KEY';
  end if;
end $$;

-- ---------------------------------------------------------------- kiosk (no login, kiosk key)
create or replace function public.hr_kiosk_roster(p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  d date := hr_private.bkk_today();
begin
  perform hr_private.kiosk_check(p_key);
  return jsonb_build_object(
    'today', d,
    'server_time', now(),
    'is_workday', hr_private.is_workday(d),
    'settings', hr_private.settings_json() - 'site_lat' - 'site_lng',
    'holidays', coalesce((select jsonb_agg(to_jsonb(h) order by h.company_off desc, h.name)
                            from public.holidays h where h.holiday_date = d), '[]'::jsonb),
    'employees', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'emp_code', e.emp_code, 'prefix', e.prefix, 'first_name', e.first_name,
               'last_name', e.last_name, 'nickname', e.nickname, 'work_group', e.work_group,
               'position', e.position,
               'check_in_at', a.check_in_at, 'check_out_at', a.check_out_at,
               'late_minutes', coalesce(a.late_minutes, 0), 'early_minutes', coalesce(a.early_minutes, 0))
             order by e.sort_order nulls last, e.emp_code)
        from public.employees e
        left join public.attendance a on a.employee_id = e.id and a.work_date = d
       where e.active and e.track_attendance), '[]'::jsonb)
  );
end $$;

create or replace function public.hr_kiosk_stamp(p_key text, p_employee_id uuid, p_kind text, p_photo text,
                                                 p_lat float8 default null, p_lng float8 default null,
                                                 p_accuracy real default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.attendance;
begin
  perform hr_private.kiosk_check(p_key);
  if p_photo is null or p_photo !~ '^data:image/(jpeg|webp|png);base64,[A-Za-z0-9+/=]+$' then
    raise exception 'PHOTO_REQUIRED';
  end if;
  if length(p_photo) > 120000 then
    raise exception 'PHOTO_TOO_LARGE';
  end if;

  a := hr_private.stamp(p_employee_id, p_kind, p_lat, p_lng, p_accuracy);
  insert into public.attendance_photos (attendance_id, employee_id, work_date, kind, image, bytes)
  values (a.id, a.employee_id, a.work_date, p_kind, p_photo, (length(p_photo) * 3 / 4)::int);
  return to_jsonb(a);
end $$;

create or replace function public.hr_kiosk_calendar(p_key text, p_from date, p_to date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform hr_private.kiosk_check(p_key);
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'BAD_RANGE';
  end if;
  return jsonb_build_object(
    'today', hr_private.bkk_today(),
    'work_days', (select to_jsonb(work_days) from public.settings where id = 1),
    'holidays', coalesce((select jsonb_agg(to_jsonb(h) order by h.holiday_date, h.name)
                            from public.holidays h
                           where h.holiday_date between p_from and p_to), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- admin
create or replace function public.hr_admin_kiosk(p_token text, p_rotate boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform hr_private.require_admin(p_token);
  if p_rotate then
    update public.settings set kiosk_key = encode(extensions.gen_random_bytes(12), 'hex') where id = 1;
  end if;
  return jsonb_build_object('kiosk_key', (select kiosk_key from public.settings where id = 1));
end $$;

create or replace function public.hr_admin_photos(p_token text, p_date date) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform hr_private.require_admin(p_token);
  return coalesce((select jsonb_agg(jsonb_build_object('employee_id', p.employee_id, 'kind', p.kind,
                                                       'image', p.image, 'taken_at', p.taken_at))
                     from public.attendance_photos p where p.work_date = p_date), '[]'::jsonb);
end $$;

-- per month: how many photos are stored, whether the report was reviewed, and when they will be gone
create or replace function public.hr_admin_photo_status(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  cur date := date_trunc('month', hr_private.bkk_today())::date;
begin
  perform hr_private.require_admin(p_token);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'month', m.month,
             'photos', coalesce(p.n, 0),
             'bytes', coalesce(p.b, 0),
             'ended', m.month < cur,
             'reviewed', coalesce(r.reviewed, false),
             'reviewed_at', r.reviewed_at,
             'reviewed_by', nullif(trim(coalesce(e.first_name, '') || ' ' || coalesce(e.last_name, '')), ''),
             'all_deleted_by', case when coalesce(r.reviewed, false)
                                    then ((m.month + interval '1 month')::date - 1 + 31) end)
           order by m.month desc)
      from (select distinct date_trunc('month', work_date)::date as month from public.attendance_photos
            union select month from public.report_reviews
            union select cur
            union select (cur - interval '1 month')::date) m
      left join (select date_trunc('month', work_date)::date as month, count(*) as n, sum(bytes) as b
                   from public.attendance_photos group by 1) p on p.month = m.month
      left join public.report_reviews r on r.month = m.month
      left join public.employees e on e.id = r.reviewed_by), '[]'::jsonb);
end $$;

-- HR confirms (or withdraws) that a finished month's report has been checked.
-- Confirming runs the clean-up right away; the daily job keeps it going afterwards.
create or replace function public.hr_admin_review_month(p_token text, p_month date, p_reviewed boolean,
                                                        p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  admin public.employees;
  m date := date_trunc('month', p_month)::date;
  n int := 0;
begin
  admin := hr_private.require_admin(p_token);
  if m >= date_trunc('month', hr_private.bkk_today())::date then
    raise exception 'MONTH_NOT_ENDED';
  end if;
  insert into public.report_reviews (month, reviewed, reviewed_by, reviewed_at, note)
  values (m, p_reviewed, admin.id, now(), nullif(trim(p_note), ''))
  on conflict (month) do update
     set reviewed = excluded.reviewed, reviewed_by = excluded.reviewed_by,
         reviewed_at = excluded.reviewed_at, note = excluded.note;
  if p_reviewed then
    begin
      n := hr_private.purge_photos();
    exception when undefined_function then
      n := 0;   -- clean-up function not installed yet; the daily job will catch up
    end;
  end if;
  return jsonb_build_object('ok', true, 'month', m, 'reviewed', p_reviewed, 'purged', n);
end $$;

-- ---------------------------------------------------------------- clean-up
create or replace function hr_private.purge_photos() returns int
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  delete from public.attendance_photos p
   where p.taken_at < now() - interval '30 days'
     and exists (select 1 from public.report_reviews r
                  where r.month = date_trunc('month', p.work_date)::date and r.reviewed);
  get diagnostics n = row_count;
  return n;
end $$;

create extension if not exists pg_cron;
-- every day 03:15 Bangkok (20:15 UTC)
select cron.schedule('leeco-hr-purge-photos', '15 20 * * *', 'select hr_private.purge_photos()');

-- ---------------------------------------------------------------- grants
revoke all on all functions in schema hr_private from public, anon, authenticated;

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'hr\_%'
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('grant execute on function %s to anon, authenticated', f.sig);
  end loop;
end $$;
