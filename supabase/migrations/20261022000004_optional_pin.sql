-- Optional PIN ("test mode")
-- settings.require_pin = false → employees log in with their employee code only.
-- Admin accounts always need their PIN, so the back office stays protected on a public URL.

alter table public.settings add column if not exists require_pin boolean not null default true;

create or replace function hr_private.settings_json() returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'company_name', s.company_name,
    'work_start', to_char(s.work_start, 'HH24:MI'),
    'work_end', to_char(s.work_end, 'HH24:MI'),
    'late_grace_minutes', s.late_grace_minutes,
    'work_days', to_jsonb(s.work_days),
    'require_location', s.require_location,
    'require_pin', s.require_pin,
    'site_lat', s.site_lat, 'site_lng', s.site_lng,
    'site_radius_m', s.site_radius_m,
    'site_configured', s.site_lat is not null and s.site_lng is not null)
    from public.settings s where s.id = 1
$$;

-- what the login page needs to know before anyone is signed in
create or replace function public.hr_public_config() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('company_name', s.company_name, 'require_pin', s.require_pin)
    from public.settings s where s.id = 1
$$;

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
    require_pin        = coalesce((p ->> 'require_pin')::boolean, require_pin),
    site_lat           = case when p ? 'site_lat' then nullif(p ->> 'site_lat', '')::float8 else site_lat end,
    site_lng           = case when p ? 'site_lng' then nullif(p ->> 'site_lng', '')::float8 else site_lng end,
    site_radius_m      = coalesce(nullif(p ->> 'site_radius_m', '')::int, site_radius_m)
  where id = 1;
  return hr_private.settings_json();
end $$;

create or replace function public.hr_login(p_code text, p_pin text, p_user_agent text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e public.employees;
  v_token text;
  v_pin_free boolean;
begin
  select * into e from public.employees
   where upper(emp_code) = upper(trim(coalesce(p_code, ''))) and active;
  if not found then
    perform pg_sleep(0.3);
    return jsonb_build_object('ok', false, 'error', 'INVALID_LOGIN');
  end if;

  v_pin_free := e.role = 'employee' and not (select require_pin from public.settings where id = 1);

  if not v_pin_free then
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
  end if;

  delete from hr_private.sessions where expires_at < now();

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into hr_private.sessions (token_hash, employee_id, expires_at, user_agent)
  values (hr_private.hash_token(v_token), e.id, now() + interval '30 days', left(p_user_agent, 300));

  return jsonb_build_object('ok', true, 'token', v_token, 'role', e.role,
                            'must_change_pin', e.must_change_pin and not v_pin_free);
end $$;

revoke all on function public.hr_public_config() from public;
grant execute on function public.hr_public_config() to anon, authenticated;
revoke all on function public.hr_login(text, text, text) from public;
grant execute on function public.hr_login(text, text, text) to anon, authenticated;
revoke all on function public.hr_admin_save_settings(text, jsonb) from public;
grant execute on function public.hr_admin_save_settings(text, jsonb) to anon, authenticated;
