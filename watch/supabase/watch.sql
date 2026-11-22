-- ════════════════════════════════════════════════════════════════════
--  CoreDash Watch · ฐานข้อมูลและตรรกะฝั่งเซิร์ฟเวอร์ทั้งหมด (Supabase)
--  รันไฟล์นี้ใน Supabase → SQL Editor ครั้งเดียว (รันซ้ำได้ ไม่ลบข้อมูลเดิม)
--  ไฟล์นี้ไม่มีรหัสลับ · รหัส Telegram/LINE ใส่แยกตามขั้นตอนใน README
-- ════════════════════════════════════════════════════════════════════

-- ถ้า ๓ บรรทัดนี้ขึ้น error: ไปที่ Database → Extensions เปิด pg_cron และ pg_net ด้วยมือ แล้วรันไฟล์นี้ใหม่
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- ───────── ที่เก็บค่าลับ (ไม่เปิดผ่าน API) ─────────
create schema if not exists watch_private;
revoke all on schema watch_private from public, anon, authenticated;
create table if not exists watch_private.config (k text primary key, v text not null);
revoke all on watch_private.config from public, anon, authenticated;

insert into watch_private.config (k, v) values
  ('trial_days', '90'), ('price_month', '99'), ('price_year', '990'),
  ('contact', '081-923-2380'), ('interval_sec', '60'), ('offline_min', '3'), ('keep_days', '35'),
  ('admin_ids', ''), ('tg_token', ''), ('tg_secret', ''), ('line_token', ''), ('line_secret', '')
on conflict (k) do nothing;

create or replace function watch_private.cfg(p_k text) returns text
language sql stable security definer set search_path = '' as $$
  select v from watch_private.config where k = p_k
$$;

-- ───────── ตาราง ─────────
create table if not exists public.watch_devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'อุปกรณ์ของฉัน' check (char_length(name) between 1 and 80),
  kind text not null default 'pump' check (kind in ('power', 'pump')),
  key_hash text not null unique,
  key_hint text not null,
  link_code text not null unique,
  pump_on_amp real not null default 0.5 check (pump_on_amp between 0.05 and 100),
  baht_per_kwh real not null default 4.5 check (baht_per_kwh between 0 and 50),
  created_at timestamptz not null default now(),
  trial_ends_at timestamptz not null,
  paid_until timestamptz,
  last_seen timestamptz,
  last jsonb,
  mains_ok boolean,
  pump_running boolean,
  offline_alerted boolean not null default false,
  last_test timestamptz,
  tg_chat_id text,
  line_user_id text
);
create index if not exists watch_devices_owner on public.watch_devices(owner_id);

create table if not exists public.watch_readings (
  id bigint generated always as identity primary key,
  device_id uuid not null references public.watch_devices(id) on delete cascade,
  ts timestamptz not null default now(),
  v real, a real, w real, kwh double precision, pf real, hz real,
  temp real, level real, batt real
);
-- ระบบเดิมที่สร้างตารางไปแล้ว
alter table public.watch_readings add column if not exists temp real;
alter table public.watch_readings add column if not exists level real;
alter table public.watch_readings add column if not exists batt real;
create index if not exists watch_readings_dev_ts on public.watch_readings(device_id, ts desc);

create table if not exists public.watch_events (
  id bigint generated always as identity primary key,
  device_id uuid not null references public.watch_devices(id) on delete cascade,
  ts timestamptz not null default now(),
  type text not null,
  message text not null
);
create index if not exists watch_events_dev_ts on public.watch_events(device_id, ts desc);

alter table public.watch_devices enable row level security;
alter table public.watch_readings enable row level security;
alter table public.watch_events enable row level security;

drop policy if exists "own devices read" on public.watch_devices;
create policy "own devices read" on public.watch_devices for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "own devices update" on public.watch_devices;
create policy "own devices update" on public.watch_devices for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "own readings read" on public.watch_readings;
create policy "own readings read" on public.watch_readings for select to authenticated
  using (exists (select 1 from public.watch_devices d where d.id = device_id and d.owner_id = (select auth.uid())));
drop policy if exists "own events read" on public.watch_events;
create policy "own events read" on public.watch_events for select to authenticated
  using (exists (select 1 from public.watch_devices d where d.id = device_id and d.owner_id = (select auth.uid())));

revoke all on public.watch_devices, public.watch_readings, public.watch_events from anon, authenticated;
grant select (id, name, kind, key_hint, link_code, pump_on_amp, baht_per_kwh, created_at, trial_ends_at, paid_until,
              last_seen, last, mains_ok, pump_running) on public.watch_devices to authenticated;
grant update (name, kind, pump_on_amp, baht_per_kwh) on public.watch_devices to authenticated;
grant select on public.watch_readings, public.watch_events to authenticated;

-- ───────── เครื่องมือภายใน ─────────
create or replace function watch_private.rand_code(n int) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  abc constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(n);
  s text := '';
begin
  for i in 0 .. n - 1 loop
    s := s || substr(abc, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return s;
end $$;

create or replace function watch_private.hash_key(p_key text) returns text
language sql immutable security definer set search_path = '' as $$
  select encode(extensions.digest(p_key, 'sha256'), 'hex')
$$;

create or replace function watch_private.in_range(x double precision, lo double precision, hi double precision) returns double precision
language sql immutable as $$ select case when x is not null and x <> 'NaN'::float8 and x >= lo and x <= hi then x end $$;

/** ส่งข้อความไป Telegram และ LINE ผ่าน pg_net (ไม่รอผล) */
create or replace function watch_private.notify(p_tg text, p_line text, p_msg text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  tg text := watch_private.cfg('tg_token');
  ln text := watch_private.cfg('line_token');
  sent boolean := false;
begin
  if p_tg is not null and coalesce(tg, '') <> '' then
    perform net.http_post(
      url := 'https://api.telegram.org/bot' || tg || '/sendMessage',
      body := jsonb_build_object('chat_id', p_tg, 'text', p_msg, 'disable_web_page_preview', true),
      headers := '{"Content-Type":"application/json"}'::jsonb);
    sent := true;
  end if;
  if p_line is not null and coalesce(ln, '') <> '' then
    perform net.http_post(
      url := 'https://api.line.me/v2/bot/message/push',
      body := jsonb_build_object('to', p_line, 'messages', jsonb_build_array(jsonb_build_object('type', 'text', 'text', p_msg))),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || ln));
    sent := true;
  end if;
  return sent;
end $$;

create or replace function watch_private.is_active(d public.watch_devices) returns boolean
language sql stable as $$ select coalesce(d.paid_until > now(), false) or d.trial_ends_at > now() $$;

-- ════════ อุปกรณ์ส่งค่ามา (เรียกได้ด้วย publishable key + รหัสอุปกรณ์) ════════
drop function if exists public.watch_ingest(text, real, real, real, double precision, real, real, text);

create or replace function public.watch_ingest(
  p_key text, p_v real default null, p_a real default null, p_w real default null,
  p_kwh double precision default null, p_pf real default null, p_hz real default null, p_fw text default null,
  p_mains boolean default null, p_batt real default null, p_temp real default null, p_level real default null
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  d public.watch_devices;
  itv int := coalesce(watch_private.cfg('interval_sec')::int, 60);
  v real := watch_private.in_range(p_v, 0, 500);
  a real := watch_private.in_range(p_a, 0, 200);
  w real := watch_private.in_range(p_w, 0, 50000);
  kwh double precision := watch_private.in_range(p_kwh, 0, 10000000);
  pf real := watch_private.in_range(p_pf, 0, 1);
  hz real := watch_private.in_range(p_hz, 0, 70);
  batt real := watch_private.in_range(p_batt, 0, 5);
  tmp real := watch_private.in_range(p_temp, -50, 150);
  lvl real := watch_private.in_range(p_level, 0, 100);
  prev_batt real;
  snap jsonb;
  mains boolean;
  pump boolean;
  msgs text[] := '{}';
  types text[] := '{}';
  i int;
begin
  if p_key is null or p_key !~ '^cdw_[A-Z2-9]{24}$' then
    return jsonb_build_object('ok', false, 'error', 'bad key');
  end if;
  select * into d from public.watch_devices where key_hash = watch_private.hash_key(p_key) for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'unknown device'); end if;
  if d.last_seen is not null and d.last_seen > now() - interval '10 seconds' then
    return jsonb_build_object('ok', false, 'error', 'too fast', 'interval', itv);
  end if;

  snap := jsonb_build_object('v', v, 'a', a, 'w', w, 'kwh', kwh, 'pf', pf, 'hz', hz)
          || jsonb_strip_nulls(jsonb_build_object('temp', tmp, 'level', lvl, 'batt', batt));

  if not watch_private.is_active(d) then
    update public.watch_devices set last_seen = now(), offline_alerted = false, last = snap where id = d.id;
    return jsonb_build_object('ok', true, 'active', false, 'interval', itv);
  end if;

  -- สถานะไฟเมน: ถ้าบอร์ดบอกมาเอง (CoreDash Link มีแบตสำรอง) ใช้ค่านั้นก่อน
  -- ถ้าไม่บอก (รุ่นเดิม) ดูจากแรงดันที่ PZEM อ่านได้
  mains := case when p_mains is not null then p_mains else (v is not null and v >= 150) end;
  pump := case when d.kind = 'pump' then (mains and coalesce(a, 0) >= d.pump_on_amp) end;
  prev_batt := nullif(d.last ->> 'batt', '')::real;

  if d.offline_alerted then types := array_append(types, 'online'); msgs := array_append(msgs, '✅ ' || d.name || ': กลับมาออนไลน์แล้ว'); end if;
  if d.mains_ok is true and not mains then
    types := array_append(types, 'mains_off');
    msgs := array_append(msgs, '⚡ ' || d.name || ': ไฟฟ้าดับ' ||
      case when batt is not null then ' · ทำงานด้วยแบตสำรอง ' || to_char(batt, 'FM0.00') || ' V' else ' (ไม่พบแรงดันไฟเมน)' end);
  end if;
  if d.mains_ok is false and mains then
    types := array_append(types, 'mains_on');
    msgs := array_append(msgs, '💡 ' || d.name || ': ไฟฟ้ากลับมาแล้ว' || case when v is not null then ' ' || round(v)::text || ' V' else '' end);
  end if;
  -- แบตใกล้หมดตอนไฟดับ (แจ้งครั้งเดียวตอนข้ามเส้น 3.45 V)
  if not mains and batt is not null and batt < 3.45 and (prev_batt is null or prev_batt >= 3.45) then
    types := array_append(types, 'batt_low');
    msgs := array_append(msgs, '🔋 ' || d.name || ': แบตสำรองใกล้หมด ' || to_char(batt, 'FM0.00') || ' V อุปกรณ์จะหยุดส่งข้อมูลเร็วๆ นี้');
  end if;
  if d.kind = 'pump' and mains then
    if d.pump_running is true and pump is false then types := array_append(types, 'pump_off'); msgs := array_append(msgs, '🛑 ' || d.name || ': ปั๊มหยุดทำงาน (กระแส ' || to_char(coalesce(a, 0), 'FM990.00') || ' A)'); end if;
    if d.pump_running is false and pump is true then types := array_append(types, 'pump_on'); msgs := array_append(msgs, '▶️ ' || d.name || ': ปั๊มเริ่มทำงาน (กระแส ' || to_char(coalesce(a, 0), 'FM990.00') || ' A)'); end if;
  end if;

  insert into public.watch_readings (device_id, v, a, w, kwh, pf, hz, temp, level, batt)
  values (d.id, v, a, w, kwh, pf, hz, tmp, lvl, batt);
  update public.watch_devices set last_seen = now(), mains_ok = mains, pump_running = pump, offline_alerted = false, last = snap
  where id = d.id;

  for i in 1 .. coalesce(array_length(msgs, 1), 0) loop
    insert into public.watch_events (device_id, type, message) values (d.id, types[i], msgs[i]);
    perform watch_private.notify(d.tg_chat_id, d.line_user_id, msgs[i]);
  end loop;

  return jsonb_build_object('ok', true, 'active', true, 'interval', itv);
end $$;

-- ════════ ฟังก์ชันสำหรับผู้ใช้ที่ล็อกอิน ════════
create or replace function public.watch_create_device(p_name text, p_kind text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  k text;
  nid uuid;
begin
  if uid is null then raise exception 'ต้องเข้าสู่ระบบ'; end if;
  if (select count(*) from public.watch_devices where owner_id = uid) >= 10 then raise exception 'เพิ่มได้สูงสุด 10 อุปกรณ์ต่อบัญชี'; end if;
  k := 'cdw_' || watch_private.rand_code(24);
  insert into public.watch_devices (owner_id, name, kind, key_hash, key_hint, link_code, trial_ends_at)
  values (uid, coalesce(nullif(left(btrim(p_name), 80), ''), 'อุปกรณ์ของฉัน'), case when p_kind = 'power' then 'power' else 'pump' end,
          watch_private.hash_key(k), right(k, 4),
          'CD-' || watch_private.rand_code(4) || '-' || watch_private.rand_code(4),
          now() + make_interval(days => coalesce(watch_private.cfg('trial_days')::int, 90)))
  returning id into nid;
  return jsonb_build_object('id', nid, 'key', k);
end $$;

create or replace function public.watch_rotate_key(p_id uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare k text := 'cdw_' || watch_private.rand_code(24);
begin
  update public.watch_devices set key_hash = watch_private.hash_key(k), key_hint = right(k, 4)
  where id = p_id and owner_id = auth.uid();
  if not found then raise exception 'ไม่พบอุปกรณ์'; end if;
  return k;
end $$;

create or replace function public.watch_channels(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('tg', tg_chat_id is not null, 'line', line_user_id is not null)
  from public.watch_devices where id = p_id and owner_id = auth.uid()
$$;

create or replace function public.watch_unlink(p_id uuid, p_ch text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_ch = 'line' then update public.watch_devices set line_user_id = null where id = p_id and owner_id = auth.uid();
  else update public.watch_devices set tg_chat_id = null where id = p_id and owner_id = auth.uid(); end if;
end $$;

create or replace function public.watch_test_alert(p_id uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare d public.watch_devices;
begin
  select * into d from public.watch_devices where id = p_id and owner_id = auth.uid() for update;
  if not found then raise exception 'ไม่พบอุปกรณ์'; end if;
  if d.tg_chat_id is null and d.line_user_id is null then return 'ยังไม่ได้ผูก Telegram หรือ LINE'; end if;
  if d.last_test is not null and d.last_test > now() - interval '1 minute' then return 'รอ 1 นาทีก่อนทดสอบอีกครั้ง'; end if;
  update public.watch_devices set last_test = now() where id = d.id;
  perform watch_private.notify(d.tg_chat_id, d.line_user_id, '🔔 ทดสอบแจ้งเตือนจาก "' || d.name || '" ใช้งานได้ปกติ');
  return 'ok';
end $$;

create or replace function public.watch_delete_device(p_id uuid, p_confirm text) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  delete from public.watch_devices where id = p_id and owner_id = auth.uid() and name = btrim(p_confirm);
  if not found then raise exception 'พิมพ์ชื่ออุปกรณ์ให้ตรงเพื่อยืนยันการลบ'; end if;
end $$;

-- ════════ ผู้ดูแล (user id ใน admin_ids) ════════
create or replace function public.watch_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and auth.uid()::text = any(string_to_array(replace(coalesce(watch_private.cfg('admin_ids'), ''), ' ', ''), ','))
$$;

create or replace function public.watch_admin_list(p_hint text default null)
returns table (id uuid, name text, kind text, key_hint text, trial_ends_at timestamptz, paid_until timestamptz, last_seen timestamptz, owner_email text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.watch_is_admin() then raise exception 'ไม่มีสิทธิ์'; end if;
  return query
    select d.id, d.name, d.kind, d.key_hint, d.trial_ends_at, d.paid_until, d.last_seen, u.email::text
    from public.watch_devices d join auth.users u on u.id = d.owner_id
    where p_hint is null or p_hint = '' or d.key_hint = upper(btrim(p_hint))
    order by d.created_at desc limit 200;
end $$;

create or replace function public.watch_admin_extend(p_id uuid, p_days int) returns timestamptz
language plpgsql volatile security definer set search_path = '' as $$
declare d public.watch_devices; base timestamptz; nu timestamptz;
begin
  if not public.watch_is_admin() then raise exception 'ไม่มีสิทธิ์'; end if;
  if p_days not in (30, 365) then raise exception 'ระยะเวลาไม่ถูกต้อง'; end if;
  select * into d from public.watch_devices where id = p_id for update;
  if not found then raise exception 'ไม่พบอุปกรณ์'; end if;
  base := greatest(now(), coalesce(d.paid_until, now()), d.trial_ends_at);
  nu := base + make_interval(days => p_days);
  update public.watch_devices set paid_until = nu where id = p_id;
  return nu;
end $$;

-- ════════ ใช้โดย Edge Function watch-hook เท่านั้น (service_role) ════════
create or replace function public.watch_hook_config() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('tg_token', watch_private.cfg('tg_token'), 'tg_secret', watch_private.cfg('tg_secret'),
                            'line_token', watch_private.cfg('line_token'), 'line_secret', watch_private.cfg('line_secret'))
$$;

create or replace function public.watch_link(p_code text, p_ch text, p_ident text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare n text;
begin
  if p_ch = 'line' then update public.watch_devices set line_user_id = p_ident where link_code = upper(p_code) returning name into n;
  else update public.watch_devices set tg_chat_id = p_ident where link_code = upper(p_code) returning name into n; end if;
  return n;
end $$;

-- ════════ งานตามเวลา ทุก 1 นาที ════════
create or replace function watch_private.tick() returns int
language plpgsql volatile security definer set search_path = '' as $$
declare
  d record;
  n int := 0;
  off_min int := coalesce(watch_private.cfg('offline_min')::int, 3);
  bkk timestamp := now() at time zone 'Asia/Bangkok';
begin
  -- ๑) อุปกรณ์ขาดการติดต่อ
  for d in select * from public.watch_devices
           where not offline_alerted and last_seen is not null and last_seen < now() - make_interval(mins => off_min)
           limit 500 for update skip locked loop
    update public.watch_devices set offline_alerted = true where id = d.id;
    if coalesce(d.paid_until > now(), false) or d.trial_ends_at > now() then
      insert into public.watch_events (device_id, type, message)
        values (d.id, 'offline', '📴 ' || d.name || ': ขาดการติดต่อเกิน ' || off_min || ' นาที อาจไฟดับทั้งบ้าน หรืออินเทอร์เน็ตหลุด');
      perform watch_private.notify(d.tg_chat_id, d.line_user_id,
        '📴 ' || d.name || ': ขาดการติดต่อเกิน ' || off_min || ' นาที อาจไฟดับทั้งบ้าน หรืออินเทอร์เน็ตหลุด');
      n := n + 1;
    end if;
  end loop;

  -- ๒) วันละครั้ง 09:00 น. เวลาไทย: เตือนก่อนหมดทดลอง 7 วัน และลบข้อมูลเก่า
  if extract(hour from bkk) = 9 and extract(minute from bkk) = 0 then
    for d in select * from public.watch_devices
             where trial_ends_at >= now() + interval '6 days' and trial_ends_at < now() + interval '7 days'
               and (paid_until is null or paid_until < now()) loop
      perform watch_private.notify(d.tg_chat_id, d.line_user_id,
        '🔔 ' || d.name || ': ช่วงทดลองใช้ฟรีจะหมดในอีก 7 วัน ใช้งานต่อ ' || watch_private.cfg('price_month') || ' บาท/เดือน หรือ '
        || watch_private.cfg('price_year') || ' บาท/ปี ติดต่อ ' || watch_private.cfg('contact'));
    end loop;
    delete from public.watch_readings where ts < now() - make_interval(days => coalesce(watch_private.cfg('keep_days')::int, 35));
    delete from public.watch_events where ts < now() - interval '180 days';
  end if;
  return n;
end $$;

-- ───────── สิทธิ์เรียกฟังก์ชัน ─────────
revoke all on all functions in schema watch_private from public, anon, authenticated;
revoke execute on function public.watch_ingest, public.watch_create_device, public.watch_rotate_key, public.watch_channels,
  public.watch_unlink, public.watch_test_alert, public.watch_delete_device, public.watch_is_admin, public.watch_admin_list,
  public.watch_admin_extend, public.watch_hook_config, public.watch_link from public, anon, authenticated;
grant execute on function public.watch_ingest to anon, authenticated;
grant execute on function public.watch_create_device, public.watch_rotate_key, public.watch_channels, public.watch_unlink,
  public.watch_test_alert, public.watch_delete_device, public.watch_is_admin, public.watch_admin_list, public.watch_admin_extend to authenticated;
grant execute on function public.watch_hook_config, public.watch_link to service_role;

-- ───────── ตั้งเวลา ─────────
select cron.unschedule(jobid) from cron.job where jobname = 'coredash-watch';
select cron.schedule('coredash-watch', '* * * * *', 'select watch_private.tick()');
