-- ═══════════════════════════════════════════════════════════════
-- CoreDash Watch · อัปเกรดรองรับ "ไฟรั่ว + เบรกเกอร์ตัด" (v1.3)
-- รันไฟล์นี้ครั้งเดียวใน Supabase → SQL Editor หลังจากรัน watch.sql และ link-upgrade.sql แล้ว
-- ปลอดภัยถ้ารันซ้ำ · ไม่มีความลับใดๆ ในไฟล์นี้
--
-- เพิ่มค่าที่อุปกรณ์ส่งได้ (ไม่บังคับ อุปกรณ์รุ่นเดิมส่งแบบเดิมได้ ไม่ต้องแก้):
--   p_leak_ma  ไฟรั่ว (mA)                 จาก ZMCT103C ที่คล้องสาย L+N พร้อมกัน
--   p_brk      วงจรหลังเบรกเกอร์มีไฟไหม     จากโมดูลตรวจไฟ AC ตัวที่ 2 (true = มีไฟ)
--   p_peak_a   กระแสสูงสุดตั้งแต่ส่งครั้งก่อน  (ใช้บอกสาเหตุตอนเบรกเกอร์ตัด)
-- แจ้งเตือนใหม่: ไฟรั่วเกินเกณฑ์ (2 ระดับ) · ไฟรั่วกลับสู่ปกติ · เบรกเกอร์ตัด (พร้อมสาเหตุที่น่าจะเป็น)
--               · เบรกเกอร์กลับมาจ่ายไฟ · กระแสใกล้พิกัดเบรกเกอร์
-- ═══════════════════════════════════════════════════════════════

alter table public.watch_readings add column if not exists leak_ma real;
alter table public.watch_readings add column if not exists brk boolean;
alter table public.watch_readings add column if not exists peak_a real;

alter table public.watch_devices add column if not exists leak_warn_ma real not null default 9;
alter table public.watch_devices add column if not exists leak_trip_ma real not null default 15;
alter table public.watch_devices add column if not exists max_amp real not null default 10;
alter table public.watch_devices add column if not exists leak_level smallint not null default 0;
alter table public.watch_devices add column if not exists brk_ok boolean;

do $$ begin
  alter table public.watch_devices add constraint watch_leak_warn_rng check (leak_warn_ma between 1 and 300);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.watch_devices add constraint watch_leak_trip_rng check (leak_trip_ma between 1 and 300 and leak_trip_ma > leak_warn_ma);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.watch_devices add constraint watch_max_amp_rng check (max_amp between 0.5 and 200);
exception when duplicate_object then null; end $$;

grant select (leak_warn_ma, leak_trip_ma, max_amp, leak_level, brk_ok) on public.watch_devices to authenticated;
grant update (leak_warn_ma, leak_trip_ma, max_amp) on public.watch_devices to authenticated;

drop function if exists public.watch_ingest(text, real, real, real, double precision, real, real, text, boolean, real, real, real);

create or replace function public.watch_ingest(
  p_key text, p_v real default null, p_a real default null, p_w real default null,
  p_kwh double precision default null, p_pf real default null, p_hz real default null, p_fw text default null,
  p_mains boolean default null, p_batt real default null, p_temp real default null, p_level real default null,
  p_leak_ma real default null, p_brk boolean default null, p_peak_a real default null
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
  lk real := watch_private.in_range(p_leak_ma, 0, 1000);
  pk real := watch_private.in_range(p_peak_a, 0, 500);
  prev_batt real;
  prev_a real;
  prev_leak real;
  snap jsonb;
  mains boolean;
  pump boolean;
  brk boolean;
  leak_lv smallint;
  cause text;
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
          || jsonb_strip_nulls(jsonb_build_object('temp', tmp, 'level', lvl, 'batt', batt, 'leak', lk, 'brk', p_brk, 'peak', pk));

  if not watch_private.is_active(d) then
    update public.watch_devices set last_seen = now(), offline_alerted = false, last = snap where id = d.id;
    return jsonb_build_object('ok', true, 'active', false, 'interval', itv, 'lw', d.leak_warn_ma, 'lt', d.leak_trip_ma, 'ma', d.max_amp);
  end if;

  mains := case when p_mains is not null then p_mains else (v is not null and v >= 150) end;
  pump := case when d.kind = 'pump' then (mains and coalesce(a, 0) >= d.pump_on_amp) end;
  prev_batt := nullif(d.last ->> 'batt', '')::real;
  prev_a := nullif(d.last ->> 'a', '')::real;
  prev_leak := nullif(d.last ->> 'leak', '')::real;
  -- สถานะเบรกเกอร์มีความหมายเฉพาะตอนไฟเข้ายังมี (ถ้าไฟการไฟฟ้าดับ ไม่ถือว่าเบรกเกอร์ตัด)
  brk := case when p_brk is null then null when mains then p_brk else d.brk_ok end;

  if d.offline_alerted then types := array_append(types, 'online'); msgs := array_append(msgs, '✅ ' || d.name || ': กลับมาออนไลน์แล้ว'); end if;
  if d.mains_ok is true and not mains then
    types := array_append(types, 'mains_off');
    msgs := array_append(msgs, '⚡ ' || d.name || ': ไฟฟ้าดับ (ไฟเข้าจากการไฟฟ้าไม่มี)' ||
      case when batt is not null then ' · ทำงานด้วยแบตสำรอง ' || to_char(batt, 'FM0.00') || ' V' else '' end);
  end if;
  if d.mains_ok is false and mains then
    types := array_append(types, 'mains_on');
    msgs := array_append(msgs, '💡 ' || d.name || ': ไฟฟ้ากลับมาแล้ว' || case when v is not null then ' ' || round(v)::text || ' V' else '' end);
  end if;
  if not mains and batt is not null and batt < 3.45 and (prev_batt is null or prev_batt >= 3.45) then
    types := array_append(types, 'batt_low');
    msgs := array_append(msgs, '🔋 ' || d.name || ': แบตสำรองใกล้หมด ' || to_char(batt, 'FM0.00') || ' V อุปกรณ์จะหยุดส่งข้อมูลเร็วๆ นี้');
  end if;
  if d.kind = 'pump' and mains then
    if d.pump_running is true and pump is false then types := array_append(types, 'pump_off'); msgs := array_append(msgs, '🛑 ' || d.name || ': ปั๊มหยุดทำงาน (กระแส ' || to_char(coalesce(a, 0), 'FM990.00') || ' A)'); end if;
    if d.pump_running is false and pump is true then types := array_append(types, 'pump_on'); msgs := array_append(msgs, '▶️ ' || d.name || ': ปั๊มเริ่มทำงาน (กระแส ' || to_char(coalesce(a, 0), 'FM990.00') || ' A)'); end if;
  end if;

  -- ───── ไฟรั่ว: 0 ปกติ · 1 เตือน · 2 อันตราย (ลงจากระดับเมื่อต่ำกว่า 70% ของเกณฑ์ กันแจ้งรัว) ─────
  leak_lv := d.leak_level;
  if lk is not null and coalesce(brk, true) then
    leak_lv := case
      when lk >= d.leak_trip_ma then 2
      when lk >= d.leak_warn_ma then greatest(1, case when lk >= d.leak_trip_ma * 0.7 then d.leak_level else 1 end)::smallint
      when lk < d.leak_warn_ma * 0.7 then 0
      else least(d.leak_level, 1)::smallint end;
    if leak_lv > d.leak_level then
      types := array_append(types, 'leak_' || leak_lv);
      msgs := array_append(msgs, case when leak_lv = 2
        then '🔴 ' || d.name || ': ไฟรั่ว ' || to_char(lk, 'FM990.0') || ' mA ระดับอันตราย งดใช้วงจรนี้และเรียกช่างไฟฟ้า'
        else '🟠 ' || d.name || ': ไฟรั่ว ' || to_char(lk, 'FM990.0') || ' mA สูงกว่าปกติ ควรให้ช่างตรวจ' end);
    elsif leak_lv = 0 and d.leak_level > 0 then
      types := array_append(types, 'leak_ok');
      msgs := array_append(msgs, '✅ ' || d.name || ': ไฟรั่วกลับสู่ปกติ ' || to_char(lk, 'FM990.0') || ' mA');
    end if;
  end if;

  -- ───── เบรกเกอร์ตัด: บอกสาเหตุที่น่าจะเป็นจากค่าก่อนตัด ─────
  if d.brk_ok is true and brk is false then
    cause := case
      when greatest(coalesce(lk, 0), coalesce(prev_leak, 0)) >= d.leak_warn_ma
        then 'น่าจะเป็นไฟรั่ว (ก่อนตัดรั่ว ' || to_char(greatest(coalesce(lk, 0), coalesce(prev_leak, 0)), 'FM990.0') || ' mA) ให้ช่างหาจุดรั่วก่อนเปิดใหม่'
      when greatest(coalesce(pk, 0), coalesce(prev_a, 0)) >= d.max_amp
        then 'น่าจะเป็นกระแสเกิน / ใช้ไฟเกินพิกัด (สูงสุด ' || to_char(greatest(coalesce(pk, 0), coalesce(prev_a, 0)), 'FM990.0') || ' A) ลดเครื่องใช้ก่อนเปิดใหม่'
      else 'อาจเป็นลัดวงจรฉับพลัน หรือมีคนปิดเบรกเกอร์ ให้ตรวจสายและเครื่องใช้ก่อนเปิดใหม่' end;
    types := array_append(types, 'brk_trip');
    msgs := array_append(msgs, '⛔ ' || d.name || ': เบรกเกอร์ตัด · ' || cause);
  end if;
  if d.brk_ok is false and brk is true then
    types := array_append(types, 'brk_on');
    msgs := array_append(msgs, '💡 ' || d.name || ': เบรกเกอร์กลับมาจ่ายไฟแล้ว');
  end if;

  -- ───── กระแสใกล้พิกัดเบรกเกอร์ (90%) แจ้งตอนข้ามเส้นครั้งเดียว ─────
  if mains and a is not null and a >= d.max_amp * 0.9 and (prev_a is null or prev_a < d.max_amp * 0.9) then
    types := array_append(types, 'amp_high');
    msgs := array_append(msgs, '⚠️ ' || d.name || ': ใช้ไฟ ' || to_char(a, 'FM990.0') || ' A ' || case when a >= d.max_amp then 'เกิน' else 'ใกล้' end || 'พิกัดเบรกเกอร์ ' || to_char(d.max_amp, 'FM990.#') || ' A');
  end if;

  insert into public.watch_readings (device_id, v, a, w, kwh, pf, hz, temp, level, batt, leak_ma, brk, peak_a)
  values (d.id, v, a, w, kwh, pf, hz, tmp, lvl, batt, lk, p_brk, pk);
  update public.watch_devices set last_seen = now(), mains_ok = mains, pump_running = pump, offline_alerted = false, last = snap,
    leak_level = case when brk is false then d.leak_level else leak_lv end,
    brk_ok = coalesce(brk, d.brk_ok)
  where id = d.id;

  for i in 1 .. coalesce(array_length(msgs, 1), 0) loop
    insert into public.watch_events (device_id, type, message) values (d.id, types[i], msgs[i]);
    perform watch_private.notify(d.tg_chat_id, d.line_user_id, msgs[i]);
  end loop;

  return jsonb_build_object('ok', true, 'active', true, 'interval', itv, 'lw', d.leak_warn_ma, 'lt', d.leak_trip_ma, 'ma', d.max_amp);
end $$;

revoke execute on function public.watch_ingest from public, anon, authenticated;
grant execute on function public.watch_ingest to anon, authenticated;
notify pgrst, 'reload schema';
