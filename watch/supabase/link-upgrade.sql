-- ═══════════════════════════════════════════════════════════════
-- CoreDash Watch · อัปเกรดรองรับ CoreDash Link (v1.2)
-- รันไฟล์นี้ครั้งเดียวใน Supabase → SQL Editor (สำหรับระบบที่ติดตั้ง watch.sql ไปแล้ว)
-- ปลอดภัยถ้ารันซ้ำ · ไม่ต้องใส่ความลับใดๆ ในไฟล์นี้
--
-- เพิ่ม: p_mains (บอร์ดบอกเองว่าไฟเมนดับ → แจ้งทันที), p_batt (แบตสำรอง V),
--       p_temp (°C), p_level (% ระดับน้ำ จาก 4–20 mA)
-- อุปกรณ์รุ่นเดิม (coredash-watch.ino) ยังส่งแบบเดิมได้ ไม่ต้องแก้
-- ═══════════════════════════════════════════════════════════════

alter table public.watch_readings add column if not exists temp real;
alter table public.watch_readings add column if not exists level real;
alter table public.watch_readings add column if not exists batt real;

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

revoke execute on function public.watch_ingest from public, anon, authenticated;
grant execute on function public.watch_ingest to anon, authenticated;
notify pgrst, 'reload schema';
