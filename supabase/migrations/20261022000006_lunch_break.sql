-- Lunch break stamps: out at 12:00 (พักเที่ยง), back at 13:00 (กลับจากพัก), with a selfie each time.
--   break_early_minutes = went to lunch before break_start (12:00)
--   break_late_minutes  = came back after break_end + late_grace_minutes (13:01), counted from 13:00
-- Non-workdays never count as early/late.

alter table public.attendance
  add column if not exists break_out_at        timestamptz,
  add column if not exists break_in_at         timestamptz,
  add column if not exists break_early_minutes int not null default 0,
  add column if not exists break_late_minutes  int not null default 0;

alter table public.settings
  add column if not exists break_start time not null default '12:00',
  add column if not exists break_end   time not null default '13:00';

alter table public.attendance_photos drop constraint if exists attendance_photos_kind_check;
alter table public.attendance_photos
  add constraint attendance_photos_kind_check check (kind in ('in', 'break_out', 'break_in', 'out'));

-- ---------------------------------------------------------------- rules
create or replace function hr_private.calc_break_early(p_at timestamptz) returns int
language sql stable set search_path = '' as $$
  select case
           when p_at is null then 0
           when not hr_private.is_workday((p_at at time zone 'Asia/Bangkok')::date) then 0
           when (p_at at time zone 'Asia/Bangkok')::time < s.break_start
             then ceil(extract(epoch from (s.break_start - (p_at at time zone 'Asia/Bangkok')::time)) / 60)::int
           else 0
         end
    from public.settings s where s.id = 1
$$;

create or replace function hr_private.calc_break_late(p_at timestamptz) returns int
language sql stable set search_path = '' as $$
  select case
           when p_at is null then 0
           when not hr_private.is_workday((p_at at time zone 'Asia/Bangkok')::date) then 0
           when (p_at at time zone 'Asia/Bangkok')::time
                > s.break_end + make_interval(mins => s.late_grace_minutes)
             then ceil(extract(epoch from ((p_at at time zone 'Asia/Bangkok')::time - s.break_end)) / 60)::int
           else 0
         end
    from public.settings s where s.id = 1
$$;

create or replace function hr_private.settings_json() returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'company_name', s.company_name,
    'work_start', to_char(s.work_start, 'HH24:MI'),
    'work_end', to_char(s.work_end, 'HH24:MI'),
    'break_start', to_char(s.break_start, 'HH24:MI'),
    'break_end', to_char(s.break_end, 'HH24:MI'),
    'late_grace_minutes', s.late_grace_minutes,
    'work_days', to_jsonb(s.work_days),
    'require_location', s.require_location,
    'require_pin', s.require_pin,
    'site_lat', s.site_lat, 'site_lng', s.site_lng,
    'site_radius_m', s.site_radius_m,
    'site_configured', s.site_lat is not null and s.site_lng is not null)
    from public.settings s where s.id = 1
$$;

-- ---------------------------------------------------------------- stamping (4 kinds)
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

  elsif p_kind = 'break_out' then
    if not found or a.check_in_at is null then
      raise exception 'NOT_CHECKED_IN';
    end if;
    if a.check_out_at is not null then
      raise exception 'ALREADY_CHECKED_OUT';
    end if;
    if a.break_out_at is not null then
      raise exception 'ALREADY_ON_BREAK';
    end if;
    update public.attendance
       set break_out_at = now(), break_early_minutes = hr_private.calc_break_early(now())
     where id = a.id
    returning * into a;

  elsif p_kind = 'break_in' then
    if not found or a.break_out_at is null then
      raise exception 'NOT_ON_BREAK';
    end if;
    if a.break_in_at is not null then
      raise exception 'ALREADY_BACK';
    end if;
    if a.check_out_at is not null then
      raise exception 'ALREADY_CHECKED_OUT';
    end if;
    update public.attendance
       set break_in_at = now(), break_late_minutes = hr_private.calc_break_late(now())
     where id = a.id
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

-- ---------------------------------------------------------------- kiosk roster with break fields
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
               'check_in_at', a.check_in_at, 'break_out_at', a.break_out_at,
               'break_in_at', a.break_in_at, 'check_out_at', a.check_out_at,
               'late_minutes', coalesce(a.late_minutes, 0), 'early_minutes', coalesce(a.early_minutes, 0),
               'break_early_minutes', coalesce(a.break_early_minutes, 0),
               'break_late_minutes', coalesce(a.break_late_minutes, 0))
             order by e.sort_order nulls last, e.emp_code)
        from public.employees e
        left join public.attendance a on a.employee_id = e.id and a.work_date = d
       where e.active and e.track_attendance), '[]'::jsonb)
  );
end $$;

-- ---------------------------------------------------------------- report totals with break fields
create or replace function public.hr_admin_attendance(p_token text, p_from date, p_to date,
                                                      p_employee_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_today date := hr_private.bkk_today();
begin
  perform hr_private.require_admin(p_token);
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'BAD_RANGE';
  end if;

  return jsonb_build_object(
    'from', p_from, 'to', p_to,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('employee', hr_private.employee_json(e), 'attendance', to_jsonb(a))
                       order by a.work_date desc, e.sort_order nulls last, e.emp_code)
        from public.attendance a
        join public.employees e on e.id = a.employee_id
       where a.work_date between p_from and p_to
         and (p_employee_id is null or a.employee_id = p_employee_id)), '[]'::jsonb),
    'summary', coalesce((
      select jsonb_agg(x order by (x ->> 'sort_order')::int nulls last, x ->> 'emp_code')
        from (
          select jsonb_build_object(
                   'employee_id', e.id, 'emp_code', e.emp_code, 'sort_order', e.sort_order,
                   'name', trim(coalesce(e.prefix, '') || e.first_name || ' ' || e.last_name),
                   'work_group', e.work_group, 'company', e.company,
                   'workdays', wd.n,
                   'present', coalesce(st.present, 0),
                   'late_days', coalesce(st.late_days, 0),
                   'late_minutes', coalesce(st.late_minutes, 0),
                   'missing_checkout', coalesce(st.missing_checkout, 0),
                   'early_days', coalesce(st.early_days, 0),
                   'early_minutes', coalesce(st.early_minutes, 0),
                   'break_late_days', coalesce(st.break_late_days, 0),
                   'break_late_minutes', coalesce(st.break_late_minutes, 0),
                   'break_early_days', coalesce(st.break_early_days, 0),
                   'break_early_minutes', coalesce(st.break_early_minutes, 0),
                   'missing_break', coalesce(st.missing_break, 0),
                   'absent', greatest(0, wd.n - coalesce(st.present_on_workdays, 0))) as x
            from public.employees e
            cross join lateral (
              select count(*)::int as n
                from generate_series(greatest(p_from, coalesce(e.start_date, p_from)),
                                     least(p_to, v_today), interval '1 day') g
               where hr_private.is_workday(g::date)) wd
            left join lateral (
              select count(*) filter (where a.check_in_at is not null)::int as present,
                     count(*) filter (where a.check_in_at is not null and hr_private.is_workday(a.work_date))::int as present_on_workdays,
                     count(*) filter (where a.late_minutes > 0)::int as late_days,
                     sum(a.late_minutes)::int as late_minutes,
                     count(*) filter (where a.early_minutes > 0)::int as early_days,
                     sum(a.early_minutes)::int as early_minutes,
                     count(*) filter (where a.break_late_minutes > 0)::int as break_late_days,
                     sum(a.break_late_minutes)::int as break_late_minutes,
                     count(*) filter (where a.break_early_minutes > 0)::int as break_early_days,
                     sum(a.break_early_minutes)::int as break_early_minutes,
                     count(*) filter (where a.check_in_at is not null and a.work_date < v_today
                                        and hr_private.is_workday(a.work_date)
                                        and (a.break_out_at is null or a.break_in_at is null))::int as missing_break,
                     count(*) filter (where a.check_in_at is not null and a.check_out_at is null and a.work_date < v_today)::int as missing_checkout
                from public.attendance a
               where a.employee_id = e.id and a.work_date between p_from and p_to) st on true
           where e.active and e.track_attendance
             and (p_employee_id is null or e.id = p_employee_id)) s), '[]'::jsonb)
  );
end $$;

create or replace function public.hr_admin_save_settings(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform hr_private.require_admin(p_token);
  update public.settings set
    company_name       = coalesce(nullif(trim(p ->> 'company_name'), ''), company_name),
    work_start         = coalesce(nullif(p ->> 'work_start', '')::time, work_start),
    work_end           = coalesce(nullif(p ->> 'work_end', '')::time, work_end),
    break_start        = coalesce(nullif(p ->> 'break_start', '')::time, break_start),
    break_end          = coalesce(nullif(p ->> 'break_end', '')::time, break_end),
    late_grace_minutes = coalesce(nullif(p ->> 'late_grace_minutes', '')::int, late_grace_minutes),
    work_days          = coalesce((select array_agg(v::int order by v::int)
                                     from jsonb_array_elements_text(p -> 'work_days') v), work_days),
    require_location   = coalesce((p ->> 'require_location')::boolean, require_location),
    require_pin        = coalesce((p ->> 'require_pin')::boolean, require_pin),
    site_lat           = case when p ? 'site_lat' then nullif(p ->> 'site_lat', '')::float8 else site_lat end,
    site_lng           = case when p ? 'site_lng' then nullif(p ->> 'site_lng', '')::float8 else site_lng end,
    site_radius_m      = coalesce(nullif(p ->> 'site_radius_m', '')::int, site_radius_m)
  where id = 1;
  return hr_private.settings_json();
end $$;

-- HR correction with all four times (local 'HH:MI'; empty = none). All empty deletes the day.
create or replace function public.hr_admin_edit_attendance_v2(p_token text, p_employee_id uuid, p_work_date date,
                                                              p_check_in text, p_break_out text, p_break_in text,
                                                              p_check_out text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  admin public.employees;
  v_in timestamptz;
  v_bo timestamptz;
  v_bi timestamptz;
  v_out timestamptz;
  a public.attendance;
  t constant text := 'Asia/Bangkok';
begin
  admin := hr_private.require_admin(p_token);
  v_in  := case when nullif(p_check_in, '')  is null then null else (p_work_date + p_check_in::time)  at time zone t end;
  v_bo  := case when nullif(p_break_out, '') is null then null else (p_work_date + p_break_out::time) at time zone t end;
  v_bi  := case when nullif(p_break_in, '')  is null then null else (p_work_date + p_break_in::time)  at time zone t end;
  v_out := case when nullif(p_check_out, '') is null then null else (p_work_date + p_check_out::time) at time zone t end;

  if (v_out is not null and v_in is not null and v_out < v_in)
     or (v_bo is not null and v_in is not null and v_bo < v_in)
     or (v_bi is not null and v_bo is not null and v_bi < v_bo)
     or (v_out is not null and v_bi is not null and v_out < v_bi) then
    raise exception 'OUT_BEFORE_IN';
  end if;

  if v_in is null and v_bo is null and v_bi is null and v_out is null then
    delete from public.attendance where employee_id = p_employee_id and work_date = p_work_date;
    return jsonb_build_object('deleted', true);
  end if;

  insert into public.attendance (employee_id, work_date, check_in_at, break_out_at, break_in_at, check_out_at,
                                 late_minutes, break_early_minutes, break_late_minutes, early_minutes,
                                 admin_note, edited_by)
  values (p_employee_id, p_work_date, v_in, v_bo, v_bi, v_out,
          hr_private.calc_late(v_in), hr_private.calc_break_early(v_bo), hr_private.calc_break_late(v_bi),
          hr_private.calc_early(v_out), nullif(trim(p_note), ''), admin.id)
  on conflict (employee_id, work_date) do update
     set check_in_at = excluded.check_in_at, break_out_at = excluded.break_out_at,
         break_in_at = excluded.break_in_at, check_out_at = excluded.check_out_at,
         late_minutes = excluded.late_minutes, break_early_minutes = excluded.break_early_minutes,
         break_late_minutes = excluded.break_late_minutes, early_minutes = excluded.early_minutes,
         admin_note = excluded.admin_note, edited_by = excluded.edited_by
  returning * into a;
  return to_jsonb(a);
end $$;

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
