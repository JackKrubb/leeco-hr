-- Early-leave tracking + "late = more than 1 minute after 08:00"
-- (the functions that use early_minutes live in 20261022000002_hr_functions.sql)

alter table public.attendance add column if not exists early_minutes int not null default 0;

alter table public.settings alter column late_grace_minutes set default 1;
update public.settings set late_grace_minutes = 1, work_start = '08:00', work_end = '17:00' where id = 1;

-- recompute for any rows recorded before this change
update public.attendance set early_minutes = hr_private.calc_early(check_out_at) where check_out_at is not null;
