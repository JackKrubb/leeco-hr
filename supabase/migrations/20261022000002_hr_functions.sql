-- LEECO HR — RPC layer
-- Every function the web app calls is a SECURITY DEFINER function in `public` named hr_*.
-- Each one receives the caller's session token and resolves it to an employee before doing
-- anything; admin functions also require role = 'admin'. Business errors are raised as short
-- codes (e.g. 'ALREADY_CHECKED_IN') that the app maps to Thai messages.
-- All times are stored as timestamptz; "today" and late calculations use Asia/Bangkok.

-- ================================================================ helpers (private)

create or replace function hr_private.bkk_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Bangkok')::date
$$;

create or replace function hr_private.hash_token(p text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(p, 'sha256'), 'hex')
$$;

create or replace function hr_private.session_employee(p_token text) returns public.employees
language plpgsql stable security definer set search_path = '' as $$
declare
  e public.employees;
begin
  if p_token is null or length(p_token) < 32 then
    raise exception 'UNAUTHORIZED';
  end if;
  select emp.* into e
    from hr_private.sessions s
    join public.employees emp on emp.id = s.employee_id
   where s.token_hash = hr_private.hash_token(p_token)
     and s.expires_at > now()
     and emp.active;
  if not found then
    raise exception 'UNAUTHORIZED';
  end if;
  return e;
end $$;

create or replace function hr_private.require_admin(p_token text) returns public.employees
language plpgsql stable security definer set search_path = '' as $$
declare
  e public.employees;
begin
  e := hr_private.session_employee(p_token);
  if e.role <> 'admin' then
    raise exception 'FORBIDDEN';
  end if;
  return e;
end $$;

create or replace function hr_private.employee_json(e public.employees) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', e.id, 'emp_code', e.emp_code, 'prefix', e.prefix,
    'first_name', e.first_name, 'last_name', e.last_name, 'nickname', e.nickname,
    'work_group', e.work_group, 'department', e.department, 'position', e.position,
    'company', e.company, 'start_date', e.start_date, 'note', e.note, 'sort_order', e.sort_order,
    'role', e.role, 'track_attendance', e.track_attendance, 'active', e.active,
    'must_change_pin', e.must_change_pin, 'has_pin', e.pin_hash is not null,
    'locked', coalesce(e.locked_until > now(), false)
  )
$$;

create or replace function hr_private.is_workday(d date) returns boolean
language sql stable set search_path = '' as $$
  select extract(isodow from d)::int = any (s.work_days)
     and not exists (select 1 from public.holidays h where h.holiday_date = d and h.company_off)
    from public.settings s
   where s.id = 1
$$;

-- minutes late for a check-in at p_at (0 on non-workdays or inside the grace period)
create or replace function hr_private.calc_late(p_at timestamptz) returns int
language sql stable set search_path = '' as $$
  select case
           when p_at is null then 0
           when not hr_private.is_workday((p_at at time zone 'Asia/Bangkok')::date) then 0
           when (p_at at time zone 'Asia/Bangkok')::time
                > s.work_start + make_interval(mins => s.late_grace_minutes)
             then ceil(extract(epoch from ((p_at at time zone 'Asia/Bangkok')::time - s.work_start)) / 60)::int
           else 0
         end
    from public.settings s
   where s.id = 1
$$;

-- great-circle distance in metres
create or replace function hr_private.distance_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns float8 language sql immutable set search_path = '' as $$
  select 2 * 6371000 * asin(sqrt(
           power(sin(radians(lat2 - lat1) / 2), 2)
         + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

create or replace function hr_private.random_pin() returns text
language sql volatile set search_path = '' as $$
  select lpad(((('x' || encode(extensions.gen_random_bytes(3), 'hex'))::bit(24)::int) % 10000)::text, 4, '0')
$$;

create or replace function hr_private.hash_pin(p text) returns text
language sql volatile set search_path = '' as $$
  select extensions.crypt(p, extensions.gen_salt('bf', 8))
$$;

create or replace function hr_private.next_emp_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  c text;
begin
  loop
    c := 'E' || lpad(nextval('hr_private.emp_code_seq')::text, 3, '0');
    exit when not exists (select 1 from public.employees where upper(emp_code) = c);
  end loop;
  return c;
end $$;

create or replace function hr_private.norm(p text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(lower(coalesce(p, '')), '\s+', '', 'g')
$$;

create or replace function hr_private.settings_json() returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'company_name', s.company_name,
    'work_start', to_char(s.work_start, 'HH24:MI'),
    'work_end', to_char(s.work_end, 'HH24:MI'),
    'late_grace_minutes', s.late_grace_minutes,
    'work_days', to_jsonb(s.work_days),
    'require_location', s.require_location,
    'site_lat', s.site_lat, 'site_lng', s.site_lng,
    'site_radius_m', s.site_radius_m,
    'site_configured', s.site_lat is not null and s.site_lng is not null)
    from public.settings s where s.id = 1
$$;

create or replace function hr_private.check_location(p_lat float8, p_lng float8) returns float8
language plpgsql stable set search_path = '' as $$
declare
  s public.settings;
  v_dist float8;
begin
  select * into s from public.settings where id = 1;
  if p_lat is not null and p_lng is not null and s.site_lat is not null and s.site_lng is not null then
    v_dist := hr_private.distance_m(p_lat, p_lng, s.site_lat, s.site_lng);
  end if;
  if s.require_location then
    if p_lat is null or p_lng is null then
      raise exception 'LOCATION_REQUIRED';
    end if;
    if v_dist is not null and v_dist > s.site_radius_m then
      raise exception 'OUTSIDE_SITE:%', round(v_dist)::int;
    end if;
  end if;
  return v_dist;
end $$;

-- ================================================================ auth

create or replace function public.hr_login(p_code text, p_pin text, p_user_agent text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e public.employees;
  v_token text;
begin
  select * into e from public.employees
   where upper(emp_code) = upper(trim(coalesce(p_code, ''))) and active;
  if not found then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'error', 'INVALID_LOGIN');
  end if;
  if e.locked_until is not null and e.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'LOCKED', 'locked_until', e.locked_until);
  end if;
  if e.pin_hash is null then
    return jsonb_build_object('ok', false, 'error', 'NO_PIN');
  end if;
  if extensions.crypt(coalesce(p_pin, ''), e.pin_hash) <> e.pin_hash then
    update public.employees
       set failed_attempts = failed_attempts + 1,
           locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' end
     where id = e.id;
    return jsonb_build_object('ok', false, 'error', 'INVALID_LOGIN',
                              'attempts_left', greatest(0, 4 - e.failed_attempts));
  end if;

  update public.employees set failed_attempts = 0, locked_until = null where id = e.id;
  delete from hr_private.sessions where expires_at < now();

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into hr_private.sessions (token_hash, employee_id, expires_at, user_agent)
  values (hr_private.hash_token(v_token), e.id, now() + interval '30 days', left(p_user_agent, 300));

  return jsonb_build_object('ok', true, 'token', v_token, 'role', e.role,
                            'must_change_pin', e.must_change_pin);
end $$;

create or replace function public.hr_logout(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from hr_private.sessions where token_hash = hr_private.hash_token(coalesce(p_token, ''))
$$;

create or replace function public.hr_change_pin(p_token text, p_old text, p_new text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e public.employees;
begin
  e := hr_private.session_employee(p_token);
  if extensions.crypt(coalesce(p_old, ''), e.pin_hash) <> e.pin_hash then
    return jsonb_build_object('ok', false, 'error', 'WRONG_PIN');
  end if;
  if p_new !~ '^[0-9]{4,6}$' then
    return jsonb_build_object('ok', false, 'error', 'PIN_FORMAT');
  end if;
  if p_new ~ '^([0-9])\1+$' or p_new in ('1234', '12345', '123456', '4321', '654321') or p_new = p_old then
    return jsonb_build_object('ok', false, 'error', 'PIN_WEAK');
  end if;
  update public.employees
     set pin_hash = hr_private.hash_pin(p_new), must_change_pin = false
   where id = e.id;
  return jsonb_build_object('ok', true);
end $$;

-- ================================================================ employee

create or replace function public.hr_me(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  e public.employees;
  d date := hr_private.bkk_today();
begin
  e := hr_private.session_employee(p_token);
  return jsonb_build_object(
    'employee', hr_private.employee_json(e),
    'server_time', now(),
    'settings', hr_private.settings_json() - 'site_lat' - 'site_lng',
    'today', jsonb_build_object(
      'date', d,
      'is_workday', hr_private.is_workday(d),
      'holidays', coalesce((select jsonb_agg(to_jsonb(h) order by h.company_off desc, h.name)
                              from public.holidays h where h.holiday_date = d), '[]'::jsonb),
      'attendance', (select to_jsonb(a) from public.attendance a
                      where a.employee_id = e.id and a.work_date = d)),
    'upcoming_holidays', coalesce((select jsonb_agg(to_jsonb(h) order by h.holiday_date)
                                     from (select * from public.holidays
                                            where holiday_date > d order by holiday_date limit 5) h), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(to_jsonb(a) order by a.work_date desc)
                          from public.attendance a
                         where a.employee_id = e.id and a.work_date > d - 14), '[]'::jsonb)
  );
end $$;

create or replace function public.hr_check_in(p_token text, p_lat float8 default null,
                                              p_lng float8 default null, p_accuracy real default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e public.employees;
  d date := hr_private.bkk_today();
  v_dist float8;
  a public.attendance;
begin
  e := hr_private.session_employee(p_token);
  if not e.track_attendance then
    raise exception 'NOT_TRACKED';
  end if;
  v_dist := hr_private.check_location(p_lat, p_lng);

  select * into a from public.attendance where employee_id = e.id and work_date = d for update;
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
  return to_jsonb(a);
end $$;

create or replace function public.hr_check_out(p_token text, p_lat float8 default null,
                                               p_lng float8 default null, p_accuracy real default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e public.employees;
  d date := hr_private.bkk_today();
  v_dist float8;
  a public.attendance;
begin
  e := hr_private.session_employee(p_token);
  v_dist := hr_private.check_location(p_lat, p_lng);

  select * into a from public.attendance where employee_id = e.id and work_date = d for update;
  if not found or a.check_in_at is null then
    raise exception 'NOT_CHECKED_IN';
  end if;
  if a.check_out_at is not null then
    raise exception 'ALREADY_CHECKED_OUT';
  end if;

  update public.attendance
     set check_out_at = now(), check_out_lat = p_lat, check_out_lng = p_lng,
         check_out_accuracy_m = p_accuracy, check_out_distance_m = v_dist
   where id = a.id
  returning * into a;
  return to_jsonb(a);
end $$;

create or replace function public.hr_calendar(p_token text, p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e public.employees;
begin
  e := hr_private.session_employee(p_token);
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'BAD_RANGE';
  end if;
  return jsonb_build_object(
    'today', hr_private.bkk_today(),
    'work_days', (select to_jsonb(work_days) from public.settings where id = 1),
    'holidays', coalesce((select jsonb_agg(to_jsonb(h) order by h.holiday_date, h.name)
                            from public.holidays h
                           where h.holiday_date between p_from and p_to), '[]'::jsonb),
    'attendance', coalesce((select jsonb_agg(to_jsonb(a) order by a.work_date)
                              from public.attendance a
                             where a.employee_id = e.id and a.work_date between p_from and p_to), '[]'::jsonb)
  );
end $$;

-- ================================================================ admin: dashboard & employees

create or replace function public.hr_admin_dashboard(p_token text, p_date date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  d date := coalesce(p_date, hr_private.bkk_today());
begin
  perform hr_private.require_admin(p_token);
  return jsonb_build_object(
    'date', d,
    'today', hr_private.bkk_today(),
    'is_workday', hr_private.is_workday(d),
    'settings', hr_private.settings_json(),
    'holidays', coalesce((select jsonb_agg(to_jsonb(h)) from public.holidays h where h.holiday_date = d), '[]'::jsonb),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('employee', hr_private.employee_json(emp), 'attendance', to_jsonb(a))
                       order by emp.sort_order nulls last, emp.emp_code)
        from public.employees emp
        left join public.attendance a on a.employee_id = emp.id and a.work_date = d
       where emp.active and emp.track_attendance), '[]'::jsonb)
  );
end $$;

create or replace function public.hr_admin_employees(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform hr_private.require_admin(p_token);
  return coalesce((select jsonb_agg(hr_private.employee_json(e)
                                    order by e.active desc, e.sort_order nulls last, e.emp_code)
                     from public.employees e), '[]'::jsonb);
end $$;

-- rows: [{emp_code?, prefix, first_name, last_name, nickname, work_group, department,
--         position, company, start_date (YYYY-MM-DD), note, sort_order}]
-- Matches by emp_code first, then by first+last name (whitespace/case-insensitive).
-- Blank cells keep the existing value. Everyone in the file is (re)activated.
create or replace function public.hr_admin_import_employees(p_token text, p_rows jsonb,
                                                            p_deactivate_missing boolean default false,
                                                            p_file_name text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  admin public.employees;
  r jsonb;
  v_id uuid;
  v_code text;
  v_first text;
  v_last text;
  v_action text;
  touched uuid[] := '{}';
  n_ins int := 0;
  n_upd int := 0;
  n_deact int := 0;
  results jsonb := '[]'::jsonb;
  summary jsonb;
begin
  admin := hr_private.require_admin(p_token);
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'BAD_INPUT';
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    v_first := nullif(trim(r ->> 'first_name'), '');
    continue when v_first is null;
    v_last := coalesce(trim(r ->> 'last_name'), '');
    v_code := nullif(upper(trim(r ->> 'emp_code')), '');
    v_id := null;

    if v_code is not null then
      select id into v_id from public.employees where upper(emp_code) = v_code;
    end if;
    if v_id is null then
      select id into v_id from public.employees
       where hr_private.norm(first_name) = hr_private.norm(v_first)
         and hr_private.norm(last_name) = hr_private.norm(v_last)
         and not (id = any (touched))
       order by active desc, created_at
       limit 1;
    end if;

    if v_id is null then
      insert into public.employees (emp_code, prefix, first_name, last_name, nickname, work_group,
                                    department, position, company, start_date, note, sort_order)
      values (coalesce(v_code, hr_private.next_emp_code()),
              nullif(trim(r ->> 'prefix'), ''), v_first, v_last,
              nullif(trim(r ->> 'nickname'), ''), nullif(trim(r ->> 'work_group'), ''),
              nullif(trim(r ->> 'department'), ''), nullif(trim(r ->> 'position'), ''),
              nullif(trim(r ->> 'company'), ''), nullif(r ->> 'start_date', '')::date,
              nullif(trim(r ->> 'note'), ''), nullif(r ->> 'sort_order', '')::int)
      returning id, emp_code into v_id, v_code;
      n_ins := n_ins + 1;
      v_action := 'inserted';
    else
      update public.employees set
        prefix     = coalesce(nullif(trim(r ->> 'prefix'), ''), prefix),
        first_name = v_first,
        last_name  = case when v_last <> '' then v_last else last_name end,
        nickname   = coalesce(nullif(trim(r ->> 'nickname'), ''), nickname),
        work_group = coalesce(nullif(trim(r ->> 'work_group'), ''), work_group),
        department = coalesce(nullif(trim(r ->> 'department'), ''), department),
        position   = coalesce(nullif(trim(r ->> 'position'), ''), position),
        company    = coalesce(nullif(trim(r ->> 'company'), ''), company),
        start_date = coalesce(nullif(r ->> 'start_date', '')::date, start_date),
        note       = coalesce(nullif(trim(r ->> 'note'), ''), note),
        sort_order = coalesce(nullif(r ->> 'sort_order', '')::int, sort_order),
        active     = true
      where id = v_id
      returning emp_code into v_code;
      n_upd := n_upd + 1;
      v_action := 'updated';
    end if;

    touched := touched || v_id;
    results := results || jsonb_build_object('emp_code', v_code, 'name', trim(v_first || ' ' || v_last),
                                             'action', v_action);
  end loop;

  if p_deactivate_missing then
    update public.employees
       set active = false
     where role = 'employee' and active and track_attendance and not (id = any (touched));
    get diagnostics n_deact = row_count;
  end if;

  summary := jsonb_build_object('inserted', n_ins, 'updated', n_upd, 'deactivated', n_deact);
  insert into public.import_logs (kind, file_name, summary, imported_by)
  values ('employees', p_file_name, summary, admin.id);

  return summary || jsonb_build_object('ok', true, 'results', results);
end $$;

create or replace function public.hr_admin_save_employee(p_token text, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  admin public.employees;
  e public.employees;
  v_code text := nullif(upper(trim(p ->> 'emp_code')), '');
begin
  admin := hr_private.require_admin(p_token);
  if nullif(trim(p ->> 'first_name'), '') is null then
    raise exception 'FIRST_NAME_REQUIRED';
  end if;
  if (p ->> 'id') is not null and (p ->> 'id')::uuid = admin.id
     and (coalesce(p ->> 'role', 'admin') <> 'admin' or coalesce((p ->> 'active')::boolean, true) = false) then
    raise exception 'CANNOT_DEMOTE_SELF';
  end if;

  begin
    if nullif(p ->> 'id', '') is null then
      insert into public.employees (emp_code, prefix, first_name, last_name, nickname, work_group, department,
                                    position, company, start_date, note, sort_order, role, track_attendance, active)
      values (coalesce(v_code, hr_private.next_emp_code()), nullif(trim(p ->> 'prefix'), ''),
              trim(p ->> 'first_name'), coalesce(trim(p ->> 'last_name'), ''), nullif(trim(p ->> 'nickname'), ''),
              nullif(trim(p ->> 'work_group'), ''), nullif(trim(p ->> 'department'), ''),
              nullif(trim(p ->> 'position'), ''), nullif(trim(p ->> 'company'), ''),
              nullif(p ->> 'start_date', '')::date, nullif(trim(p ->> 'note'), ''),
              nullif(p ->> 'sort_order', '')::int, coalesce(nullif(p ->> 'role', ''), 'employee'),
              coalesce((p ->> 'track_attendance')::boolean, true), coalesce((p ->> 'active')::boolean, true))
      returning * into e;
    else
      update public.employees set
        emp_code = coalesce(v_code, emp_code),
        prefix = nullif(trim(p ->> 'prefix'), ''),
        first_name = trim(p ->> 'first_name'),
        last_name = coalesce(trim(p ->> 'last_name'), ''),
        nickname = nullif(trim(p ->> 'nickname'), ''),
        work_group = nullif(trim(p ->> 'work_group'), ''),
        department = nullif(trim(p ->> 'department'), ''),
        position = nullif(trim(p ->> 'position'), ''),
        company = nullif(trim(p ->> 'company'), ''),
        start_date = nullif(p ->> 'start_date', '')::date,
        note = nullif(trim(p ->> 'note'), ''),
        sort_order = nullif(p ->> 'sort_order', '')::int,
        role = coalesce(nullif(p ->> 'role', ''), role),
        track_attendance = coalesce((p ->> 'track_attendance')::boolean, track_attendance),
        active = coalesce((p ->> 'active')::boolean, active)
      where id = (p ->> 'id')::uuid
      returning * into e;
      if not found then
        raise exception 'NOT_FOUND';
      end if;
      if not e.active then
        delete from hr_private.sessions where employee_id = e.id;
      end if;
    end if;
  exception when unique_violation then
    raise exception 'DUPLICATE_CODE';
  end;
  return hr_private.employee_json(e);
end $$;

create or replace function public.hr_admin_reset_pin(p_token text, p_employee_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_pin text := hr_private.random_pin();
  e public.employees;
begin
  perform hr_private.require_admin(p_token);
  update public.employees
     set pin_hash = hr_private.hash_pin(v_pin), must_change_pin = true, failed_attempts = 0, locked_until = null
   where id = p_employee_id
  returning * into e;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  delete from hr_private.sessions where employee_id = e.id;
  return jsonb_build_object('emp_code', e.emp_code, 'name', trim(e.first_name || ' ' || e.last_name), 'pin', v_pin);
end $$;

-- gives a fresh one-time PIN to every active employee who has none yet
create or replace function public.hr_admin_generate_missing_pins(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e public.employees;
  v_pin text;
  v_list jsonb := '[]'::jsonb;
begin
  perform hr_private.require_admin(p_token);
  for e in select * from public.employees where active and pin_hash is null
           order by sort_order nulls last, emp_code loop
    v_pin := hr_private.random_pin();
    update public.employees set pin_hash = hr_private.hash_pin(v_pin), must_change_pin = true where id = e.id;
    v_list := v_list || jsonb_build_object('emp_code', e.emp_code, 'prefix', e.prefix,
                                     'name', trim(e.first_name || ' ' || e.last_name),
                                     'work_group', e.work_group, 'pin', v_pin);
  end loop;
  return v_list;
end $$;

-- ================================================================ admin: holidays

create or replace function public.hr_admin_holidays(p_token text, p_year int)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform hr_private.require_admin(p_token);
  return coalesce((select jsonb_agg(to_jsonb(h) order by h.holiday_date, h.name)
                     from public.holidays h
                    where extract(year from h.holiday_date) = p_year), '[]'::jsonb);
end $$;

-- rows: [{holiday_date (YYYY-MM-DD), name, type ('public'|'company'), company_off, note}]
create or replace function public.hr_admin_import_holidays(p_token text, p_rows jsonb,
                                                           p_replace_years boolean default false,
                                                           p_file_name text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  admin public.employees;
  n_del int := 0;
  n_up int := 0;
  summary jsonb;
begin
  admin := hr_private.require_admin(p_token);
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'BAD_INPUT';
  end if;

  if p_replace_years then
    delete from public.holidays
     where extract(year from holiday_date) in (
       select distinct extract(year from (x ->> 'holiday_date')::date)
         from jsonb_array_elements(p_rows) x
        where nullif(x ->> 'holiday_date', '') is not null);
    get diagnostics n_del = row_count;
  end if;

  insert into public.holidays (holiday_date, name, type, company_off, note)
  select (x ->> 'holiday_date')::date,
         trim(x ->> 'name'),
         case when x ->> 'type' = 'public' then 'public' else 'company' end,
         coalesce((x ->> 'company_off')::boolean, true),
         nullif(trim(x ->> 'note'), '')
    from jsonb_array_elements(p_rows) x
   where nullif(x ->> 'holiday_date', '') is not null and nullif(trim(x ->> 'name'), '') is not null
  on conflict (holiday_date, name) do update
     set type = excluded.type, company_off = excluded.company_off, note = excluded.note;
  get diagnostics n_up = row_count;

  summary := jsonb_build_object('saved', n_up, 'deleted', n_del);
  insert into public.import_logs (kind, file_name, summary, imported_by)
  values ('holidays', p_file_name, summary, admin.id);
  return summary || jsonb_build_object('ok', true);
end $$;

create or replace function public.hr_admin_save_holiday(p_token text, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  h public.holidays;
begin
  perform hr_private.require_admin(p_token);
  if nullif(p ->> 'holiday_date', '') is null or nullif(trim(p ->> 'name'), '') is null then
    raise exception 'BAD_INPUT';
  end if;
  begin
    if nullif(p ->> 'id', '') is null then
      insert into public.holidays (holiday_date, name, type, company_off, note)
      values ((p ->> 'holiday_date')::date, trim(p ->> 'name'),
              case when p ->> 'type' = 'public' then 'public' else 'company' end,
              coalesce((p ->> 'company_off')::boolean, true), nullif(trim(p ->> 'note'), ''))
      returning * into h;
    else
      update public.holidays set
        holiday_date = (p ->> 'holiday_date')::date, name = trim(p ->> 'name'),
        type = case when p ->> 'type' = 'public' then 'public' else 'company' end,
        company_off = coalesce((p ->> 'company_off')::boolean, true), note = nullif(trim(p ->> 'note'), '')
      where id = (p ->> 'id')::uuid
      returning * into h;
    end if;
  exception when unique_violation then
    raise exception 'DUPLICATE_HOLIDAY';
  end;
  return to_jsonb(h);
end $$;

create or replace function public.hr_admin_delete_holiday(p_token text, p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform hr_private.require_admin(p_token);
  delete from public.holidays where id = p_id;
end $$;

-- ================================================================ admin: attendance

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
    -- per-employee totals; workdays only count days up to today and from the start date
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
                     count(*) filter (where a.check_in_at is not null and a.check_out_at is null and a.work_date < v_today)::int as missing_checkout
                from public.attendance a
               where a.employee_id = e.id and a.work_date between p_from and p_to) st on true
           where e.active and e.track_attendance
             and (p_employee_id is null or e.id = p_employee_id)) s), '[]'::jsonb)
  );
end $$;

-- p_check_in / p_check_out are local Bangkok times 'HH:MI' (null clears it); both null deletes the day
create or replace function public.hr_admin_edit_attendance(p_token text, p_employee_id uuid, p_work_date date,
                                                           p_check_in text, p_check_out text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  admin public.employees;
  v_in timestamptz;
  v_out timestamptz;
  a public.attendance;
begin
  admin := hr_private.require_admin(p_token);
  v_in := case when nullif(p_check_in, '') is null then null
               else (p_work_date + p_check_in::time) at time zone 'Asia/Bangkok' end;
  v_out := case when nullif(p_check_out, '') is null then null
                else (p_work_date + p_check_out::time) at time zone 'Asia/Bangkok' end;
  if v_out is not null and v_in is not null and v_out < v_in then
    raise exception 'OUT_BEFORE_IN';
  end if;

  if v_in is null and v_out is null then
    delete from public.attendance where employee_id = p_employee_id and work_date = p_work_date;
    return jsonb_build_object('deleted', true);
  end if;

  insert into public.attendance (employee_id, work_date, check_in_at, check_out_at, late_minutes, admin_note, edited_by)
  values (p_employee_id, p_work_date, v_in, v_out, hr_private.calc_late(v_in), nullif(trim(p_note), ''), admin.id)
  on conflict (employee_id, work_date) do update
     set check_in_at = excluded.check_in_at, check_out_at = excluded.check_out_at,
         late_minutes = excluded.late_minutes, admin_note = excluded.admin_note, edited_by = excluded.edited_by
  returning * into a;
  return to_jsonb(a);
end $$;

-- ================================================================ admin: settings

create or replace function public.hr_admin_settings(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform hr_private.require_admin(p_token);
  return hr_private.settings_json();
end $$;

create or replace function public.hr_admin_save_settings(p_token text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform hr_private.require_admin(p_token);
  update public.settings set
    company_name       = coalesce(nullif(trim(p ->> 'company_name'), ''), company_name),
    work_start         = coalesce(nullif(p ->> 'work_start', '')::time, work_start),
    work_end           = coalesce(nullif(p ->> 'work_end', '')::time, work_end),
    late_grace_minutes = coalesce(nullif(p ->> 'late_grace_minutes', '')::int, late_grace_minutes),
    work_days          = coalesce((select array_agg(v::int order by v::int)
                                     from jsonb_array_elements_text(p -> 'work_days') v), work_days),
    require_location   = coalesce((p ->> 'require_location')::boolean, require_location),
    site_lat           = case when p ? 'site_lat' then nullif(p ->> 'site_lat', '')::float8 else site_lat end,
    site_lng           = case when p ? 'site_lng' then nullif(p ->> 'site_lng', '')::float8 else site_lng end,
    site_radius_m      = coalesce(nullif(p ->> 'site_radius_m', '')::int, site_radius_m)
  where id = 1;
  return hr_private.settings_json();
end $$;

-- ================================================================ grants
-- Nothing in hr_private is callable from the API; only the hr_* entry points are.
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
