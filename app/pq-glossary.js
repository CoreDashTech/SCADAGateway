// CoreDash · power-quality glossary: every abbreviation on the screens, in plain Thai/English,
// with the formula, an example from the Lab (13 Nov 2026) and the limit/standard where one exists.
// Used for (1) tap/hover tooltips on any abbreviation and (2) the 📚 learning tab.

const B = (th, en) => ({ th, en });
export const CATS = {
  basic: B('ค่าพื้นฐาน', 'Basics'), power: B('กำลังและ PF', 'Power & PF'), harm: B('ฮาร์มอนิก', 'Harmonics'),
  event: B('เหตุการณ์แรงดัน', 'Voltage events'), wiring: B('การต่อสายและเครื่องวัด', 'Wiring & analyser'), fix: B('อุปกรณ์แก้ไข/ป้องกัน', 'Mitigation & protection')
};

// k = term as shown; re = extra spellings to recognise on screen; s = short meaning; f = formula; ex = Lab example; lim = limit / standard
export const TERMS = [
  { k: 'Urms', re: ['U rms', 'U L-N'], c: 'basic', s: B('แรงดันไฟฟ้าค่าประสิทธิผล (rms) ของแต่ละเฟสเทียบนิวทรัล', 'Effective (rms) voltage of each phase to neutral'), f: 'U = √(mean(u²))', ex: B('Lab: 228.5 / 233.8 / 233.6 V', 'Lab: 228.5 / 233.8 / 233.6 V'), lim: B('230 V ±10% (EN 50160)', '230 V ±10 % (EN 50160)') },
  { k: 'Irms', re: ['I rms', 'I avg'], c: 'basic', s: B('กระแสไฟฟ้าค่าประสิทธิผล รวมทุกความถี่ (หลักและฮาร์มอนิก)', 'Effective current including every frequency (fundamental + harmonics)'), f: 'I = √(I1² + I2² + … + I50²)', ex: B('Lab LOAD: 11.7 / 13.5 / 13.9 A', 'Lab LOAD: 11.7 / 13.5 / 13.9 A') },
  { k: 'Udin', c: 'wiring', s: B('แรงดันอ้างอิงที่ตั้งในเครื่องวัด ใช้เทียบไฟตก/ไฟเกิน (บ้านเรา 230 V เฟส-นิวทรัล)', 'Declared reference voltage set in the analyser for dips/swells (230 V L-N here)') },
  { k: 'f', re: ['Freq', 'Hz'], c: 'basic', s: B('ความถี่ไฟฟ้า ระบบไทย 50 Hz', 'System frequency, 50 Hz in Thailand'), lim: B('50 Hz ±1% (EN 50160)', '50 Hz ±1 % (EN 50160)') },
  { k: 'P', re: ['kW'], c: 'power', s: B('กำลังไฟฟ้าจริง — ส่วนที่ทำงานได้จริง (ความร้อน แรงบิด แสง) และคิดเงินเป็น kWh', 'Real power — does the actual work and is billed as kWh'), f: 'P = mean(u·i)', ex: B('Lab LOAD: 4.84 kW', 'Lab LOAD: 4.84 kW') },
  { k: 'S', re: ['kVA'], c: 'power', s: B('กำลังปรากฏ = แรงดัน × กระแส — ขนาดที่สาย หม้อแปลง เบรกเกอร์ต้องรับ', 'Apparent power = voltage × current — what cables, transformers and breakers must carry'), f: 'S = U × I (ต่อเฟส)', ex: B('Lab LOAD: 9.11 kVA ทั้งที่ใช้จริงแค่ 4.84 kW', 'Lab LOAD: 9.11 kVA for only 4.84 kW of real work') },
  { k: 'Q', re: ['kvar', 'var'], c: 'power', s: B('กำลังไม่ทำงาน — Hioki คิด Q = √(S²−P²) จึงรวมทั้งรีแอกทีฟ (มอเตอร์/คาปาซิเตอร์) และฮาร์มอนิก ค่าลบ = นำหน้า (capacitive)', 'Non-active power — Hioki uses Q = √(S²−P²), so it holds both reactive (motors/capacitors) and harmonic parts; negative = leading (capacitive)'), f: 'Q = sign · √(S² − P²)', ex: B('Lab L1: √(1.714² − 1.093²) = 1.320 kvar', 'Lab L1: √(1.714² − 1.093²) = 1.320 kvar') },
  { k: 'PF', re: ['Power factor', 'ตัวประกอบกำลัง'], c: 'power', s: B('ตัวประกอบกำลังจริง = P ÷ S บอกว่ากระแสที่จ่ายถูกใช้ทำงานจริงกี่เปอร์เซ็นต์ (รวมผลของฮาร์มอนิก)', 'True power factor = P ÷ S: how much of the current does real work (includes harmonics)'), f: 'PF = P / S', ex: B('Lab LOAD: 4.84 / 9.11 = 0.53', 'Lab LOAD: 4.84 / 9.11 = 0.53'), lim: B('ต่ำกว่า ~0.85 การไฟฟ้าเก็บค่า kvar', 'Below ~0.85 the utility charges for kvar') },
  { k: 'DPF', re: ['cos φ', 'cos φ1', 'cosφ'], c: 'power', s: B('ตัวประกอบกำลังเฉพาะความถี่หลัก 50 Hz (มุมระหว่างแรงดันกับกระแส) — ส่วนนี้เท่านั้นที่คาปาซิเตอร์แก้ได้', 'Displacement PF at 50 Hz only (angle between U and I) — the only part a capacitor can fix'), f: 'DPF = cos φ1 ≈ PF × √(1 + THD-I²)', ex: B('PF ต่ำแต่ DPF สูง = ปัญหาจากฮาร์มอนิก ไม่ใช่รีแอกทีฟ', 'Low PF with high DPF = a harmonic problem, not reactive') },
  { k: 'Q1', c: 'power', s: B('กำลังรีแอกทีฟที่ความถี่หลัก — แก้ด้วยคาปาซิเตอร์/SVG ได้', 'Reactive power at the fundamental — fixable with capacitors / SVG'), f: 'Q1 = √(S1² − P²)' },
  { k: 'D', re: ['distortion'], c: 'power', s: B('กำลังจากฮาร์มอนิก (distortion power) — แก้ด้วย APF/ตัวกรองเท่านั้น', 'Distortion (harmonic) power — only an APF / filter fixes it'), f: 'S² = P² + Q1² + D²  (IEEE 1459)' },
  { k: 'WP+', re: ['WP-', 'WP−'], c: 'power', s: B('พลังงานสะสม kWh: WP+ = ใช้จากการไฟฟ้า, WP− = ไหลย้อนออก (เช่น โซลาร์)', 'Accumulated energy kWh: WP+ = consumed, WP− = exported (e.g. solar)') },
  { k: 'WQLAG', re: ['WQLEAD'], c: 'power', s: B('พลังงานรีแอกทีฟสะสม kvarh: LAG = ล้าหลัง (มอเตอร์), LEAD = นำหน้า (คาปาซิเตอร์)', 'Accumulated reactive energy kvarh: LAG = lagging (motors), LEAD = leading (capacitors)') },
  { k: 'kvar charge', re: ['ค่าปรับ kvar'], c: 'power', s: B('การไฟฟ้า (PEA/MEA) เก็บเงินส่วน kvar ที่เกิน 61.97% ของ kW สูงสุด (เท่ากับ PF ≈ 0.85)', 'PEA/MEA bill kvar above 61.97 % of the peak kW (≈ PF 0.85)') },
  { k: 'h', re: ['order', 'ลำดับ'], c: 'harm', s: B('ลำดับฮาร์มอนิก — ความถี่ = h × 50 Hz เช่น h5 = 250 Hz, h7 = 350 Hz, h11 = 550 Hz', 'Harmonic order — frequency = h × 50 Hz, e.g. h5 = 250 Hz, h7 = 350 Hz, h11 = 550 Hz') },
  { k: 'FND', re: ['%ofFND', 'fundamental'], c: 'harm', s: B('ส่วนประกอบความถี่หลัก (50 Hz, ลำดับ 1) — %ofFND = เทียบเป็น % ของความถี่หลัก', 'Fundamental component (50 Hz, order 1) — %ofFND = percent of it') },
  { k: 'THD', c: 'harm', s: B('ความเพี้ยนรวมของรูปคลื่น (Total Harmonic Distortion) = ฮาร์มอนิกทั้งหมดรวมกันเทียบกับความถี่หลัก', 'Total Harmonic Distortion = all harmonics together compared with the fundamental'), f: 'THD = √(Σ h=2…50 Xh²) / X1 × 100%' },
  { k: 'THD-U', re: ['THDU', 'Uthd', 'THD-F U', 'Uthd-F'], c: 'harm', s: B('ความเพี้ยนรวมของแรงดัน — กระทบอุปกรณ์ทุกตัวในระบบ (มอเตอร์ร้อน อิเล็กทรอนิกส์รวน คาปาซิเตอร์เสีย)', 'Voltage distortion — affects every device on the network (hot motors, electronics faults, capacitor failures)'), f: 'THD-U = √(Σ Uh²) / U1', ex: B('Lab 11:44: 9.5% (เกิน 8%)', 'Lab 11:44: 9.5 % (above 8 %)'), lim: B('≤ 8% (IEEE 519 ≤1 kV, IEC 61000-2-4, EN 50160) · แต่ละลำดับ ≤ 5% (IEEE)', '≤ 8 % (IEEE 519 ≤1 kV, IEC 61000-2-4, EN 50160) · each order ≤ 5 % (IEEE)') },
  { k: 'THD-I', re: ['THDI', 'Ithd', 'THD-F I', 'Ithd-F'], c: 'harm', s: B('ความเพี้ยนรวมของกระแส "เทียบกับกระแสตอนนี้" — บอกว่าโหลดสร้างฮาร์มอนิกมากแค่ไหน แต่ตอนโหลดน้อยจะดูสูงเกินจริง', 'Current distortion compared with the current right NOW — shows how much the load distorts, but looks inflated at light load'), f: 'THD-I = Ih / I1 × 100%  (Ih = √Σ Ih²)', ex: B('Lab LOAD L2: 26.9% → Ih ≈ 0.269 × 9.8 A ≈ 2.6 A', 'Lab LOAD L2: 26.9 % → Ih ≈ 0.269 × 9.8 A ≈ 2.6 A') },
  { k: 'TDD', c: 'harm', s: B('ความเพี้ยนรวมของกระแส "เทียบกับกระแสสูงสุดของโรงงาน (IL)" — ค่าที่ IEEE 519 ใช้ตัดสินจริง เพราะไม่หลอกตาตอนโหลดน้อย', 'Current distortion compared with the plant’s MAXIMUM demand current (IL) — what IEEE 519 actually judges, not inflated at light load'), f: 'TDD = Ih / IL × 100%  = THD-I × (I1 / IL)', ex: B('ถ้า THD-I 30% ตอนโหลด 20 A แต่ IL = 100 A → TDD = 30 × 20/100 = 6%', 'THD-I 30 % at 20 A with IL = 100 A → TDD = 30 × 20/100 = 6 %'), lim: B('IEEE 519-2022: 5–20% ตาม Isc/IL (เช่น < 20 → 5%, 20–50 → 8%)', 'IEEE 519-2022: 5–20 % by Isc/IL (e.g. < 20 → 5 %, 20–50 → 8 %)') },
  { k: 'IL', c: 'harm', s: B('กระแสโหลดสูงสุด (เฉลี่ย 15/30 นาที ช่วงที่สูงสุดของปี) ณ จุดต่อกับการไฟฟ้า — ใช้เป็นฐานของ TDD', 'Maximum demand load current (15/30-min average, highest of the year) at the PCC — the base for TDD') },
  { k: 'Isc/IL', re: ['SCR', 'Isc'], c: 'harm', s: B('อัตราส่วนกระแสลัดวงจรต่อกระแสโหลดสูงสุด — แหล่งจ่ายยิ่ง "แข็ง" ยิ่งยอมให้ฮาร์มอนิกได้มาก', 'Short-circuit current ÷ max demand current — a stiffer supply tolerates more harmonic current'), f: 'Isc ≈ I_rated / Z% (หม้อแปลง)', ex: B('หม้อแปลง 1000 kVA Z 5% → Isc ≈ 28.9 kA', '1000 kVA, Z 5 % → Isc ≈ 28.9 kA') },
  { k: 'Ih', c: 'harm', s: B('กระแสฮาร์มอนิกรวม (แอมแปร์) — คือขนาดที่ APF ต้องจ่ายหักล้าง', 'Total harmonic current in amps — what an APF must cancel'), f: 'Ih = I × THD / √(1 + THD²)' },
  { k: 'KF', re: ['K-factor', 'K factor'], c: 'harm', s: B('K-factor บอกความร้อนเพิ่มในหม้อแปลงจากฮาร์มอนิกลำดับสูง (ลำดับยิ่งสูงยิ่งร้อน) 1 = ไม่มีฮาร์มอนิก', 'K-factor: extra transformer heating from high-order harmonics (higher orders heat more); 1 = none'), f: 'KF = Σ (Ih² · h²) / Σ Ih²', ex: B('Lab: KF 38 → ฮาร์มอนิกลำดับสูงจำนวนมาก', 'Lab: KF 38 → lots of high-order harmonics'), lim: B('> 4 ต้องใช้หม้อแปลง K-rated/ลดพิกัด (IEEE C57.110)', '> 4 needs a K-rated / derated transformer (IEEE C57.110)') },
  { k: 'harmH', re: ['UharmH', 'IharmH', '2–80 kHz', 'รบกวน'], c: 'harm', s: B('สัญญาณรบกวนความถี่สูง 2–80 kHz จากการสวิตช์ของ VFD/อินเวอร์เตอร์/LED', 'High-frequency noise 2–80 kHz from VFD / inverter / LED switching') },
  { k: 'Resonance', re: ['เรโซแนนซ์', 'hr'], c: 'harm', s: B('คาปาซิเตอร์กับหม้อแปลงสั่นพ้องที่ลำดับ hr — ถ้าตรงกับฮาร์มอนิกที่มี จะขยายจนแรงดันเพี้ยนและคาปาซิเตอร์ระเบิดได้', 'Capacitor + transformer resonate at order hr — if it matches a present harmonic it is amplified (distortion, capacitor bursts)'), f: 'hr = √(Sk / Qc), Sk = S_tx / Z%' },
  { k: 'DC', re: ['DC offset'], c: 'harm', s: B('ไฟกระแสตรงปนในระบบ AC (ลำดับ 0) ทำให้หม้อแปลงอิ่มตัวและร้อน', 'DC mixed into the AC system (order 0) — saturates and heats transformers'), ex: B('Lab: 2.15%', 'Lab: 2.15 %'), lim: B('IEEE 519: ไม่อนุญาต', 'IEEE 519: not allowed') },
  { k: 'Upk', re: ['Upk+', 'Upk-', 'U peak', 'peak'], c: 'event', s: B('แรงดันยอดคลื่น — ไซน์ปกติ = √2 × 230 ≈ 325 V ถ้าสูงกว่านี้มากคือมีสไปก์/ไฟกระชาก', 'Peak voltage — a clean sine is √2 × 230 ≈ 325 V; much higher means spikes/surges') },
  { k: 'CF', re: ['crest factor'], c: 'event', s: B('Crest factor = ยอด ÷ rms (ไซน์ = 1.41) สูง = รูปคลื่นแหลม (โหลดอิเล็กทรอนิกส์/สไปก์)', 'Crest factor = peak ÷ rms (sine = 1.41); high = peaky waveform'), f: 'CF = Upk / Urms' },
  { k: 'Uunb', re: ['unbalance', 'ไม่สมดุล', 'Uunb0'], c: 'event', s: B('แรงดันไม่สมดุลระหว่าง 3 เฟส — มอเตอร์ร้อนเกิน', 'Voltage unbalance between the 3 phases — motors overheat'), lim: B('≤ 2% (EN 50160)', '≤ 2 % (EN 50160)') },
  { k: 'IN', re: ['I4', 'นิวทรัล'], c: 'event', s: B('กระแสในสายนิวทรัล (CH4) — ฮาร์มอนิกลำดับ 3 รวมกันที่นี่ และสาย N ไม่มีเบรกเกอร์ป้องกัน', 'Neutral current (CH4) — triplen harmonics add up here and N has no breaker') },
  { k: 'Dip', re: ['Sag', 'ไฟตก'], c: 'event', s: B('ไฟตก: แรงดันลดต่ำกว่า 90% ของ Udin ชั่วคราว (10 ms – 1 นาที)', 'Dip/sag: voltage below 90 % of Udin for 10 ms – 1 min'), lim: B('IEC 61000-4-30 · ITIC/SEMI F47', 'IEC 61000-4-30 · ITIC/SEMI F47') },
  { k: 'Swell', re: ['ไฟเกิน'], c: 'event', s: B('ไฟเกิน: แรงดันสูงกว่า 110% ของ Udin ชั่วคราว', 'Swell: voltage above 110 % of Udin, temporarily') },
  { k: 'Interruption', re: ['ไฟดับ'], c: 'event', s: B('ไฟดับ: แรงดันต่ำกว่า 10% ของ Udin', 'Interruption: voltage below 10 % of Udin') },
  { k: 'Transient', re: ['spike', 'สไปก์', 'ไฟกระชาก', 'surge'], c: 'event', s: B('แรงดันพุ่งสั้นมาก (ไมโคร–มิลลิวินาที) จากฟ้าผ่า/การสวิตช์ — ทำให้ฉนวนอ่อนแอ', 'Very short voltage spike (µs–ms) from lightning / switching — weakens insulation') },
  { k: 'RVC', c: 'event', s: B('Rapid Voltage Change: แรงดันเปลี่ยนเร็ว ≥ 3% แต่ยังไม่ถึงไฟตก — ถ้ากระแสไม่เปลี่ยนด้วย มักเป็นจุดต่อหลวม', 'Rapid Voltage Change ≥ 3 % without a dip — with steady current it often means a loose joint'), lim: B('IEC 61000-4-30', 'IEC 61000-4-30') },
  { k: 'Pst', re: ['Plt', 'flicker', 'ไฟกระพริบ'], c: 'event', s: B('ค่าไฟกระพริบที่ตามองเห็น: Pst ช่วง 10 นาที, Plt ช่วง 2 ชม.', 'Visible flicker severity: Pst over 10 min, Plt over 2 h'), lim: B('Plt ≤ 1 (EN 50160)', 'Plt ≤ 1 (EN 50160)') },
  { k: 'ITIC', re: ['CBEMA'], c: 'event', s: B('กราฟความทนไฟตก/ไฟเกินของอุปกรณ์ไอที — จุดที่อยู่นอกกรอบ = อุปกรณ์อาจหยุด/เสีย', 'Tolerance curve of IT equipment for dips/swells — points outside = equipment may trip/fail') },
  { k: '3P4W', c: 'wiring', s: B('3 เฟส 4 สาย (L1 L2 L3 + N) — ตู้เมนและโหลดทั่วไป', '3-phase 4-wire (L1 L2 L3 + N) — main boards and normal loads') },
  { k: '3P3W3M', re: ['3P3W', 'Δ', 'Delta'], c: 'wiring', s: B('3 เฟส 3 สาย ไม่มีนิวทรัล (เช่น APF รุ่น 3L, มอเตอร์ Δ) — ถ้าตั้งเป็น 3P4W แรงดันจะอ่านได้ ~134 V', '3-phase 3-wire, no neutral (e.g. 3L APF, Δ motor) — set as 3P4W it reads ~134 V') },
  { k: 'CT', re: ['CT ratio'], c: 'wiring', s: B('หม้อแปลงกระแส ลดกระแสใหญ่ลงเป็น 5 A/1 A ให้เครื่องวัด/APF อ่าน — CT ratio ต้องตั้งให้ตรงป้าย ห้ามเปิดวงจรขั้วรองขณะมีไฟ', 'Current transformer stepping big currents down to 5 A/1 A — set the ratio from its label; never open a live secondary'), ex: B('Lab 12:12: APF อ่าน 440 A (จริง 13 A) เพราะ CT ratio ผิด', 'Lab 12:12: the APF read 440 A (real 13 A) — wrong CT ratio') },
  { k: 'P1', re: ['P1→', 'ลูกศร'], c: 'wiring', s: B('ด้าน P1 ของ CT/ลูกศรบนแคลมป์ — กำหนดทิศกระแส ถ้ากลับด้าน P จะติดลบ', 'CT P1 side / clamp arrow — sets current direction; reversed gives negative P') },
  { k: 'I Range', re: ['range', 'ช่วงกระแส', 'Clamp Sensor'], c: 'wiring', s: B('ช่วงวัดกระแสของแคลมป์ — กระแสจริงควรอยู่ 10–100% ของช่วง ไม่งั้น THD-I/KF ผิด', 'Clamp current range — the real current should be 10–100 % of it, otherwise THD-I/KF are wrong') },
  { k: 'PCC', c: 'wiring', s: B('จุดต่อร่วมกับการไฟฟ้า (มิเตอร์/หม้อแปลงของโรงงาน) — จุดที่ IEEE 519 ใช้ประเมิน', 'Point of common coupling with the utility — where IEEE 519 is assessed') },
  { k: 'MAIN', re: ['#2'], c: 'wiring', s: B('จุดวัดที่ตู้เมน ก่อนแยกไป APF/โหลด — เห็นผลหลังชดเชย', 'Main measuring point before the APF/load branch — sees the result after compensation') },
  { k: 'LOAD', re: ['#3'], c: 'wiring', s: B('จุดวัดที่สายป้อนโหลด — เห็นสิ่งที่โหลดดึงจริง (ก่อนชดเชย)', 'Load feeder point — sees what the load really draws (before compensation)') },
  { k: 'APF', re: ['AHF', 'Active Power Filter', '#6'], c: 'fix', s: B('ตัวกรองฮาร์มอนิกแบบแอกทีฟ — วัดกระแสโหลดผ่าน CT แล้วฉีดกระแสตรงข้ามหักล้างฮาร์มอนิกและรีแอกทีฟ', 'Active Power Filter — measures load current via CTs and injects the opposite current to cancel harmonics and reactive power'), lim: B('ขนาด ≥ 1.25 × Ih', 'Size ≥ 1.25 × Ih') },
  { k: 'SVG', re: ['SVC', 'static var'], c: 'fix', s: B('Static Var Generator — ชดเชยรีแอกทีฟได้ทั้งนำหน้า/ล้าหลังแบบต่อเนื่อง ไม่เรโซแนนซ์', 'Static Var Generator — continuous leading/lagging reactive compensation, no resonance') },
  { k: 'Detuned', re: ['detuned', '7%', '189 Hz', 'APFC'], c: 'fix', s: B('ตู้คาปาซิเตอร์ที่มีรีแอกเตอร์อนุกรม (7% = จูน 189 Hz) กันไม่ให้เรโซแนนซ์กับฮาร์มอนิกลำดับ 5 ขึ้นไป', 'Capacitor bank with series reactors (7 % = tuned 189 Hz) so it cannot resonate with the 5th and above') },
  { k: 'Reactor', re: ['AC reactor', 'DC choke', 'รีแอกเตอร์'], c: 'fix', s: B('ขดลวดหน้า VFD (3–5%) ลดฮาร์มอนิกที่ต้นเหตุ ราคาถูก', 'Inductor before a VFD (3–5 %) reducing harmonics at the source, cheap') },
  { k: 'SPD', c: 'fix', s: B('อุปกรณ์ป้องกันไฟกระชาก Type 1+2 ตู้เมน, Type 2 ตู้ย่อย', 'Surge protective device: Type 1+2 main, Type 2 sub-boards'), lim: B('IEC 61643-11', 'IEC 61643-11') },
  { k: 'RCD', re: ['RCBO', 'ELCB'], c: 'fix', s: B('เครื่องตัดไฟรั่ว: 30 mA ป้องกันคน, 300 mA ป้องกันไฟไหม้', 'Residual current device: 30 mA for people, 300 mA against fire'), lim: B('IEC 60364-4-42', 'IEC 60364-4-42') },
  { k: 'AFDD', c: 'fix', s: B('เบรกเกอร์ตรวจจับอาร์ก — ตัดวงจรเมื่อพบลักษณะอาร์กจากจุดต่อหลวม/สายเสียหาย', 'Arc-fault detection device — trips on the arc signature of loose joints / damaged cables'), lim: B('IEC 62606', 'IEC 62606') },
  { k: 'ntfy', c: 'fix', s: B('แอปฟรีสำหรับรับแจ้งเตือนเข้ามือถือ ใช้ "หัวข้อ" ลับที่เครื่องมือสร้างให้', 'Free app for phone alerts, using the secret topic the tool creates') }
];

const index = (() => {
  const m = new Map();
  for (const t of TERMS) for (const k of [t.k, ...(t.re || [])]) m.set(k.toLowerCase(), t);
  return m;
})();
export const findTerm = (k) => index.get(String(k).toLowerCase()) || null;

// abbreviations that get an automatic tooltip on the screens (ASCII terms only, word-bounded)
const AUTO = ['THD-I', 'THD-U', 'THD', 'TDD', 'DPF', 'PF', 'KF', 'K-factor', 'kVA', 'kvar', 'kW', 'Isc/IL', 'IL', 'Ih', 'Urms', 'Irms', 'Upk', 'Uunb', 'RVC', 'Pst', 'Plt', 'ITIC', 'APF', 'SVG', 'SPD', 'RCD', 'AFDD', '3P4W', '3P3W3M', 'CT ratio', 'Udin', 'PCC', 'FND', 'cos φ', 'Q1', 'DC'];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const AUTO_RE = new RegExp('(?<![\\w-])(' + AUTO.slice().sort((a, b) => b.length - a.length).map(esc).join('|') + ')(?![\\w-])', 'g');

// wrap known abbreviations in <abbr class="gl"> inside a DOM subtree (skips inputs, svg, code-free areas already wrapped)
export function annotate(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement;
      if (!p || !n.nodeValue || n.nodeValue.length < 2) return NodeFilter.FILTER_REJECT;
      if (p.closest('abbr.gl, script, style, textarea, input, select, option, svg, button, .gl-pop, [data-nogl]')) return NodeFilter.FILTER_REJECT;
      AUTO_RE.lastIndex = 0;
      return AUTO_RE.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const frag = document.createDocumentFragment(); let last = 0; const s = n.nodeValue;
    AUTO_RE.lastIndex = 0; let m;
    while ((m = AUTO_RE.exec(s))) {
      if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
      const a = document.createElement('abbr'); a.className = 'gl'; a.dataset.t = m[1]; a.textContent = m[1]; a.tabIndex = 0;
      frag.appendChild(a); last = m.index + m[1].length;
    }
    if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
    n.parentNode.replaceChild(frag, n);
  }
}
