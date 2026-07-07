// RB事業2課 スケジュール管理 - Cloudflare Worker (API + 静的配信 + Cron)
const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json;charset=utf-8' } });
const ERR = (m, s = 400) => J({ error: m }, s);
const LV = { member: 0, chief: 1, handler: 2, admin: 3 };
const lv = u => LV[u.role] ?? 0;
const HOURLY = 1150; // 基本時給

// ===== 個別追加権限 =====
// 基本権限(メンツ/チーフ/手配者/管理者)とは別に、ユーザー単位で個別に機能を追加できる。
// 各キーには「通常この機能を使えるのは誰か(基準レベル)」を持たせ、
// 基準レベルを満たしていない人でも、追加権限が付与されていればその機能を使える。
const PERMS = {
  report_check:    { label: '新人報告の2次チェック(記入・修正)', baseLv: 1 },
  blacklist_manage:{ label: 'ブラックリストの閲覧・登録・編集', baseLv: 1 },
  site_pay:        { label: '現場の給与・業務内容を見る', baseLv: 2 },
  site_manage:     { label: '現場へのメンバー登録・編集', baseLv: 2 },
  import_data:     { label: 'スプレッドシートからの取り込み', baseLv: 2 },
  handler_tools:   { label: 'ログイン中メンバー・編集履歴の閲覧', baseLv: 2 },
  wage_settings:   { label: '時給・給与確定ロック・通知の設定', baseLv: 3 },
  account_manage:  { label: 'アカウントの作成・権限変更・停止', baseLv: 3 },
  daicho_manage:   { label: '台帳保管の閲覧・ダウンロード・削除', baseLv: 3 },
};
function getPerms(u) { try { return JSON.parse(u.extra_perms || '[]'); } catch (e) { return []; } }
// has: その機能を使えるか(基本権限を満たす、または個別に追加権限が付与されている)
function has(u, key) {
  const p = PERMS[key];
  if (!p) return false;
  if (lv(u) >= p.baseLv) return true;
  return getPerms(u).includes(key);
}

async function getSetting(env, key, def) {
  const r = await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(key).first().catch(() => null);
  return r ? r.value : def;
}

const jstNow = () => new Date(Date.now() + 9 * 3600e3);
const jstDate = () => jstNow().toISOString().slice(0, 10);
const jstTs = () => jstNow().toISOString().slice(0, 19).replace('T', ' ');
const rnd = () => crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');

async function pbkdf2(pw, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const pub = u => ({ id: u.id, regno: u.regno, name: u.name, role: u.role, rank: u.rank, ka: u.ka, han: u.han, station: u.station, skills: u.skills, manager_id: u.manager_id, suspended: u.suspended ? 1 : 0, must_change: u.must_change ? 1 : 0, extra_perms: getPerms(u), notify_rookie: u.notify_rookie === null || u.notify_rookie === undefined ? null : (u.notify_rookie ? 1 : 0) });

// ===== 給与計算 (RB事業2課ルール) =====
// 業務名 → 計算区分。 g5=案内料金(最低5h) / l3=搬入出料金(最低3h) / lg,gl,lgl=時間帯分割 / skip=対象外
const DUTY_MAP = {
  '案内':'g5','受付・案内':'g5','準備':'g5','本部付':'g5','制作補助':'g5','運営補助':'g5','雑務':'g5',
  '準備・設営':'l3','搬入':'l3','搬出':'l3','機材搬入':'l3','機材搬出':'l3','ステージハンド':'l3',
  '搬入・案内':'lg','案内・搬出':'gl','パッケージ':'lgl',
  'ケータリング':'skip','物品販売':'skip',
};
const PAY_RANKS = ['A','B','C','D','E'];
function rankLetter(r){ const m = String(r || '').match(/[A-Ea-e]/); return m ? m[0].toUpperCase() : ''; }

// 全時給を読み込み、(rank,kind,date)で有効な額を返すリゾルバを作る
async function loadWageResolver(env){
  const rows = (await env.DB.prepare('SELECT effective_from,rank,kind,amount FROM wage_rates ORDER BY effective_from').all().catch(() => ({ results: [] }))).results || [];
  return (rank, kind, date) => {
    let best = null;
    for (const r of rows) if (r.rank === rank && r.kind === kind && r.effective_from <= date) best = r.amount;
    return best;
  };
}

// 1日分の給与計算。resolve(rank,kind,date)で時給取得。tin/toutは"HH:MM"
function calcPay({ rank, date, tin, tout, duty, loadEnd, showEnd, multi }, resolve){
  const R = rankLetter(rank);
  const seg = DUTY_MAP[duty] || (duty ? 'skip' : 'g5'); // 未知の業務名は対象外、業務名空は案内扱い
  const m = t => { const x = String(t == null ? '' : t).match(/^(\d{1,2}):(\d{2})$/); return x ? Number(x[1]) * 60 + Number(x[2]) : null; };
  let IN = m(tin), OUT = m(tout);
  if (IN == null || OUT == null) return { hours: 0, overtime: 0, night: 0, pay: 0 };
  if (OUT <= IN) OUT += 1440;
  const H = x => x / 60, total = H(OUT - IN);
  // 対象外(業務 or ランク)
  if (seg === 'skip' || !PAY_RANKS.includes(R)) return { hours: Math.round(total * 100) / 100, overtime: Math.round(Math.max(0, total - 9) * 100) / 100, night: 0, pay: 0 };
  const gw = resolve(R, 'guide', date) || 0, lw = resolve(R, 'load', date) || 0;
  let LE = m(loadEnd), SE = m(showEnd);
  if (LE != null && LE < IN) LE += 1440;
  if (SE != null && SE < IN) SE += 1440;
  let base = 0;
  if (seg === 'g5' || seg === 'l3') {
    const main = seg[0] === 'l' ? lw : gw, min = Number(seg[1]);
    base = Math.max(total, min) * main;
  } else if (seg === 'lg') {
    base = (LE == null) ? total * gw : H(LE - IN) * lw + H(OUT - LE) * gw;
  } else if (seg === 'gl') {
    base = (SE == null) ? total * gw : H(SE - IN) * gw + H(OUT - SE) * lw;
  } else if (seg === 'lgl') {
    base = (LE == null || SE == null) ? total * gw : H(LE - IN) * lw + H(SE - LE) * gw + H(OUT - SE) * lw;
  }
  const OT = Math.max(0, total - 13);          // 給与の超過手当(13時間超)は変更なし
  const night = OUT >= 1320 ? H(OUT - 1320) : 0;
  const pay = Math.round(base + OT * gw * 0.25 + night * gw * 0.25 + (multi ? 500 : 0));
  const otDisp = Math.max(0, total - 9);       // スケジュール表示の残業は9時間超
  return { hours: Math.round(total * 100) / 100, overtime: Math.round(otDisp * 100) / 100, night: Math.round(night * 100) / 100, pay };
}

// 給与確定ロック: 現場日からロック日数(既定14)を過ぎたら確定(編集不可)
// lockDays は呼び出し側で getLockDays(env) から取得して渡す
function payLockDate(lockDays){ const d = new Date(Date.now() + 9 * 3600e3); d.setDate(d.getDate() - (lockDays || 14)); return d.toISOString().slice(0, 10); }
function isLocked(date, me, lockDays){ if (me && me.role === 'admin') return false; return String(date) <= payLockDate(lockDays); }
async function getLockDays(env){ const v = parseInt(await getSetting(env, 'lock_days', '14'), 10); return (isNaN(v) || v < 0) ? 14 : v; }

// ===== 予定表(チーフ/手配者スケジュール表)の取り込み =====
// 月ごとにシートが分かれた予定表を取得し、fromDate以降の予定のみ users.regno と突き合わせて反映する。
// 実績(IN/OUT)を伴わない「予定」のみの表のため、直近(前日まで)は台帳(実績取り込み)を優先し、このシートでは上書きしない。
//
// 人単位の差分スキップ: 前回取り込んだ内容(import_snapshots)と人ごとに比較し、
// 変わっていない人はスケジュールDBへの問い合わせ・書き込みを一切行わずスキップする(API呼び出し削減・前回データは今回の内容で上書きされる)。
async function importScheduleSheet(env, source, url, editorId, fromDate) {
  const meta = parseSheetUrl(url);
  if (!meta) throw new Error('スプレッドシートURLの形式が正しくありません');
  const got = await fetchXlsxSheets(meta.id);
  let allRows = [];
  const sheetReport = [];
  for (const sh of got.sheets) {
    const parsed = parseChiefScheduleSheet(sh.grid, fromDate);
    if (parsed.length) { allRows = allRows.concat(parsed); sheetReport.push({ name: sh.name, count: parsed.length }); }
  }
  if (!allRows.length) return { applied: 0, skipped: 0, sheets: sheetReport, unchangedPeople: 0, changedPeople: 0, errors: ['対象日以降の予定が見つかりませんでした'] };

  // 人(登録番号)ごとにグルーピングし、比較用に内容を正規化してJSON化
  const byRegno = {};
  for (const r of allRows) {
    const regno = normRegno(r.regno);
    if (!regno) continue;
    (byRegno[regno] ||= []).push(r);
  }
  const regnos = Object.keys(byRegno);
  const normalize = list => JSON.stringify(
    list.map(r => ({ date: r.date, type: r.type, site: r.site || '', venue: r.venue || '' }))
      .sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0)
  );

  // 前回スナップショットを一括取得
  const snapMap = {};
  const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
  for (const part of chunk(regnos, 50)) {
    const ph = part.map(() => '?').join(',');
    const rs = (await env.DB.prepare(`SELECT regno, data FROM import_snapshots WHERE source=? AND regno IN (${ph})`).bind(source, ...part).all()).results;
    for (const s of rs) snapMap[s.regno] = s.data;
  }

  let unchangedPeople = 0;
  const rowsToApply = [];
  for (const regno of regnos) {
    const newData = normalize(byRegno[regno]);
    if (snapMap[regno] === newData) { unchangedPeople++; continue; } // 前回と完全一致 → DBに一切触れずスキップ
    rowsToApply.push(...byRegno[regno]);
  }

  // 予定表ソースは「まだ確定していない予定」なので、既に何か入っている日は(手動編集・自動取込問わず)
  // 一切上書きしない。まだ何も無い日にだけ新しい予定を反映する。
  const r = rowsToApply.length
    ? await applyImportRows(env, rowsToApply, editorId, 'skip-if-exists', source)
    : { applied: 0, skipped: 0, skippedUnregistered: 0, skippedUnchanged: 0, skippedInvalid: 0, skippedOtherOrg: 0, errors: [] };

  // スナップショットを今回の内容で更新(前回データは上書きされ消える)
  const snapBatch = regnos.map(regno =>
    env.DB.prepare('REPLACE INTO import_snapshots(source,regno,data,updated_at) VALUES(?,?,?,?)')
      .bind(source, regno, normalize(byRegno[regno]), jstTs())
  );
  for (const part of chunk(snapBatch, 200)) if (part.length) await env.DB.batch(part);

  return { ...r, sheets: sheetReport, unchangedPeople, changedPeople: regnos.length - unchangedPeople };
}

// ---- コンフリクト検知 ----
// "H:MM" を分に変換(不正は null)
function toMin(t) { const m = String(t == null ? '' : t).match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }
// 現場記録の休憩時間(JSON配列)から合計分数を計算する
function sumBreakMinutes(breaksJson) {
  try {
    const arr = JSON.parse(breaksJson || '[]');
    if (!Array.isArray(arr)) return 0;
    let total = 0;
    for (const b of arr) {
      const s = toMin(b && b.start), e = toMin(b && b.end);
      if (s != null && e != null) { let d = e - s; if (d < 0) d += 1440; total += d; }
    }
    return total;
  } catch (e) { return 0; }
}
// 勤務時間(分)から、法定上必要な休憩時間(分)を返す(6h超で45分、8h超で60分。それ以下は0)
function requiredBreakMinutes(workMinutes) {
  if (workMinutes > 480) return 60;
  if (workMinutes > 360) return 45;
  return 0;
}
// 2つの時間帯 [in,out) が重なるか。out<=in は日跨ぎとみなし +24h。時刻未入力は「判定不可=重ならない」扱い
function rangesOverlap(tin1, tout1, tin2, tout2) {
  let s1 = toMin(tin1), e1 = toMin(tout1), s2 = toMin(tin2), e2 = toMin(tout2);
  if (s1 == null || e1 == null || s2 == null || e2 == null) return false;
  if (e1 <= s1) e1 += 1440;
  if (e2 <= s2) e2 += 1440;
  return s1 < e2 && s2 < e1;
}
// 1人・1日の勤務スロット群からコンフリクトを抽出。meta={name,date} を各件に付与
// level 'block'(=ダブルブッキング/要確認) / 'warn'(=同日複数現場の注意)
function dayConflicts(workSlots, meta) {
  const out = [];
  const seen = {};
  for (const s of workSlots) {
    if (s.site && seen[s.site]) out.push({ ...meta, level: 'block', kind: 'duplicate', site: s.site });
    if (s.site) seen[s.site] = true;
  }
  for (let i = 0; i < workSlots.length; i++) for (let j = i + 1; j < workSlots.length; j++) {
    const a = workSlots[i], b = workSlots[j];
    if (a.site && a.site === b.site) continue; // 同一現場は duplicate 側で既出
    if (rangesOverlap(a.tin, a.tout, b.tin, b.tout))
      out.push({ ...meta, level: 'block', kind: 'overlap', a: a.site || '(現場名なし)', b: b.site || '(現場名なし)', atime: `${a.tin || '?'}-${a.tout || '?'}`, btime: `${b.tin || '?'}-${b.tout || '?'}` });
  }
  const sites = workSlots.filter(s => s.site).map(s => s.site);
  if (sites.length >= 2 && !out.some(c => c.kind === 'overlap'))
    out.push({ ...meta, level: 'warn', kind: 'multi', count: sites.length, sites });
  return out;
}
// 日付配列(YYYY-MM-DD)から最長連勤日数を求める
function longestStreak(dates) {
  const ds = [...new Set(dates)].sort();
  let best = 0, run = 0, prev = null;
  for (const d of ds) {
    const t = Date.parse(d + 'T00:00:00Z');
    if (prev != null && t - prev === 86400000) run++; else run = 1;
    if (run > best) best = run;
    prev = t;
  }
  return best;
}

// 履歴比較用に表示項目だけ抜き出す
// 登録番号を比較可能な形に正規化する。
// ・ゼロ幅スペース等の不可視文字(コピペ時に紛れ込むことがある)を除去
// ・全角数字を半角に変換(Excel入力時に全角になっているケースがある)
// ・前後の空白を除去し、末尾の".0"(数値セルの小数点化)を除去
function normRegno(v) {
  return String(v == null ? '' : v)
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .trim()
    .replace(/\.0+$/, '');
}
function stripRow(r) {
  return { type: r.type, site: r.site, venue: r.venue, tin: r.tin, tout: r.tout, pay: r.pay, note: r.note, duty: r.duty, load_end: r.load_end, show_end: r.show_end, multi: r.multi };
}

// 本人による現場変更の報告を、実際にscheduleへ反映する共通処理。
// チーフ以上の即時反映(詳細なし)と、承認時(手配担当者が現場名・時刻・業務名などを補って確定する)の両方から呼ばれる。
// detail: { type:'work'|'off', site, venue, tin, tout, duty, load_end, show_end, multi, note }
async function applySelfReportToSchedule(env, uid, date, toldBy, detail) {
  const before = (await env.DB.prepare('SELECT * FROM schedule WHERE user_id=? AND date=? ORDER BY slot').bind(uid, date).all()).results;
  const beforeJson = JSON.stringify(before.map(stripRow));
  await env.DB.prepare('DELETE FROM schedule WHERE user_id=? AND date=?').bind(uid, date).run();

  let afterRow;
  if (detail.type === 'off') {
    afterRow = { type: 'off', site: '', venue: '', tin: '', tout: '', hours: 0, overtime: 0, pay: 0, note: '', duty: '', load_end: '', show_end: '', multi: 0 };
  } else {
    let hours = 0, overtime = 0, pay = 0;
    if (detail.tin && detail.tout) {
      const u = await env.DB.prepare('SELECT rank FROM users WHERE id=?').bind(uid).first();
      const resolve = await loadWageResolver(env);
      const c = calcPay({ rank: u ? u.rank : '', date, tin: detail.tin, tout: detail.tout, duty: detail.duty, loadEnd: detail.load_end, showEnd: detail.show_end, multi: detail.multi ? 1 : 0 }, resolve);
      if (c) ({ hours, overtime, pay } = c);
    }
    afterRow = {
      type: 'work', site: detail.site || '', venue: detail.venue || '', tin: detail.tin || '', tout: detail.tout || '',
      hours, overtime, pay, note: detail.note || '', duty: detail.duty || '', load_end: detail.load_end || '', show_end: detail.show_end || '', multi: detail.multi ? 1 : 0,
    };
  }
  await env.DB.prepare('INSERT INTO schedule(user_id,date,slot,type,site,venue,tin,tout,hours,overtime,pay,note,duty,load_end,show_end,multi) VALUES(?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(uid, date, afterRow.type, afterRow.site, afterRow.venue, afterRow.tin, afterRow.tout, afterRow.hours, afterRow.overtime, afterRow.pay, afterRow.note, afterRow.duty, afterRow.load_end, afterRow.show_end, afterRow.multi).run();
  await env.DB.prepare('INSERT INTO schedule_history(ts,editor_id,target_id,date,before_json,after_json) VALUES(?,?,?,?,?,?)')
    .bind(jstTs(), uid, uid, date, beforeJson, JSON.stringify({ slots: [stripRow(afterRow)], _src: `本人報告(伝えた人: ${toldBy})` })).run();
}

// 名前から姓(先頭の語)を取り出す。「吉崎 天晴」→「吉崎」/「吉崎天晴」→そのまま
function surname(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  const parts = n.split(/[\s　]+/);
  return parts[0];
}

// 備考・育成計画に入力者名を付与:「物販頭」→「物販頭(吉崎)」。
// 既に末尾が (誰か) で終わっていれば、その括弧を入力者名に置き換える(二重付与を防ぐ)。
function withAuthor(text, authorName) {
  const t = String(text == null ? '' : text).trim();
  if (!t) return '';
  const short = surname(authorName);
  if (!short) return t;
  const stripped = t.replace(/\s*[（(][^（）()]*[）)]\s*$/, '').trim(); // 末尾の括弧書きを除去
  return `${stripped}(${short})`;
}

// 取り込み行をDBに反映する共通処理。
// rows: [{regno,date,type?,site,venue,tin,tout,pay?,note?}]
// mode 'replace-person-day': (登録番号,日付)単位でその日を全置換(複数現場対応)
// mode 'add': 既存に追記(slotを足す)。重複は site で判定してスキップ
// "H:MM" を分に変換(早朝<6:00は翌日扱いで+24h)。比較専用。
function timeToMin(t) {
  const m = String(t || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return -1;
  let x = +m[1] * 60 + +m[2];
  if (x < 360) x += 1440;
  return x;
}

// ===== 台帳に不在の人を休暇扱いにする =====
// 取り込んだ台帳(実績)ファイルの対象日ごとに、「台帳に一切登場しない人」を洗い出し、
// その日その人に登録されている現場(work)予定を全て取り消して休暇(off)に置き換える。
// (台帳が「その日の正しい出勤者名簿」である、という前提のもと、載っていない人は出勤していないとみなす)
// rows: applyImportRowsに渡すのと同じ形式({regno, date, ...}の配列)。
async function clearAbsentFromDaicho(env, rows, editorId) {
  // 対象日ごとに、台帳に登場した登録番号の集合を作る
  const datesRegnos = {};
  for (const r of rows) {
    const regno = normRegno(r.regno);
    const date = String(r.date || '').trim();
    if (!regno || !date) continue;
    (datesRegnos[date] ||= new Set()).add(regno);
  }
  const dates = Object.keys(datesRegnos);
  if (!dates.length) return { clearedPeople: 0, clearedDays: 0 };

  const allUsers = (await env.DB.prepare('SELECT id, regno FROM users').all()).results;
  const regnoById = {}; for (const u of allUsers) regnoById[u.id] = normRegno(u.regno);

  const ts = jstTs();
  const batch = [];
  let clearedPeople = 0;
  const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

  for (const date of dates) {
    const present = datesRegnos[date];
    // その日、現場(work)予定を持っている人を全員洗い出す
    const workUsers = (await env.DB.prepare(
      "SELECT DISTINCT user_id FROM schedule WHERE date=? AND type='work'"
    ).bind(date).all()).results;

    for (const wu of workUsers) {
      const regno = regnoById[wu.user_id];
      if (!regno || present.has(regno)) continue; // 台帳に載っている、または不明なユーザーはそのまま

      const before = (await env.DB.prepare('SELECT * FROM schedule WHERE user_id=? AND date=? ORDER BY slot').bind(wu.user_id, date).all()).results;
      const beforeJson = JSON.stringify(before.map(stripRow));
      const afterJson = JSON.stringify([stripRow({ type: 'off', site: '', venue: '', tin: '', tout: '', pay: 0, note: '', duty: '', load_end: '', show_end: '', multi: 0 })]);
      if (beforeJson === afterJson) continue; // 既に休暇のみなら変更不要

      batch.push(env.DB.prepare('DELETE FROM schedule WHERE user_id=? AND date=?').bind(wu.user_id, date));
      batch.push(env.DB.prepare('INSERT INTO schedule(user_id,date,slot,type,site,venue,tin,tout,hours,overtime,pay,note,duty,load_end,show_end,multi) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(wu.user_id, date, 0, 'off', '', '', '', '', 0, 0, 0, '', '', '', '', 0));
      batch.push(env.DB.prepare('INSERT INTO schedule_history(ts,editor_id,target_id,date,before_json,after_json) VALUES(?,?,?,?,?,?)')
        .bind(ts, editorId, wu.user_id, date, beforeJson, JSON.stringify({ slots: JSON.parse(afterJson), _src: '台帳照合(不在のため休暇に変更)' })));
      clearedPeople++;
    }
  }

  if (batch.length) for (const part of chunk(batch, 200)) await env.DB.batch(part);
  return { clearedPeople, clearedDays: dates.length };
}

async function applyImportRows(env, rows, editorId, mode = 'replace-person-day', srcLabel = 'spreadsheet') {
  const ts = jstTs();
  const resolve = await loadWageResolver(env);
  let applied = 0, skipped = 0, skippedUnregistered = 0, skippedUnchanged = 0, skippedInvalid = 0, skippedOtherOrg = 0; const errors = [];
  // 登録番号→ユーザーの対応を1回のクエリで取得しておく(行ごとにSELECTするとAPIリクエスト数上限に達するため)
  const allUsers = (await env.DB.prepare('SELECT id, regno, rank, name FROM users').all()).results;
  const userByRegno = {}; for (const u of allUsers) userByRegno[normRegno(u.regno)] = u;
  // (uid,date) ごとにグルーピング
  const groups = {}; const order = [];
  for (const r of rows) {
    const regno = normRegno(r.regno);
    const date = String(r.date || '').trim();
    if (!regno || !date) {
      skipped++; skippedInvalid++;
      if (skippedInvalid <= 3) errors.push(`不正な行をスキップ: regno="${regno}" date="${date}" site="${r.site || ''}" duty="${r.duty || ''}"`);
      continue;
    }
    // RB事業2課がアプリで管理するのは「登録番号が3から始まる」人のみ。台帳には同じ会社グループの
    // 他拠点(BP・KB・SBなど)や外部委託(ACT)のスタッフも大量に混在しているため、これらはエラー
    // 扱いにせず静かに対象外とする(未登録警告を出さない)。「所属」列が取得できる場合は、それが
    // "RB"で始まることも合わせて確認する(念のための二重チェック。所属列が無い形式ではこちらは省略)。
    if (!regno.startsWith('3') || (r.org !== undefined && r.org !== '' && !/^RB/i.test(r.org))) { skippedOtherOrg++; continue; }
    const u = userByRegno[regno];
    if (!u) { errors.push(`登録番号 ${regno} は未登録(${date})`); skipped++; skippedUnregistered++; continue; }
    const key = u.id + '|' + date;
    if (!groups[key]) { groups[key] = { uid: u.id, rank: u.rank, name: u.name, date, items: [] }; order.push(key); }
    groups[key].items.push(r);
  }
  // 対象となりうる(user_id,date)の既存スケジュールをまとめて1回で取得しておく
  const uidsAll = [...new Set(order.map(k => groups[k].uid))];
  const datesAll = [...new Set(order.map(k => groups[k].date))];
  const beforeMap = {}; // key "uid|date" -> rows[]
  if (uidsAll.length && datesAll.length) {
    // D1のバインド変数上限を考慮し、user_id・date の両方を安全なサイズにチャンク化して取得する
    // (片方だけチャンク化すると、もう片方が大きい場合に上限を超えてエラーになるため)
    const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
    const uidChunks = chunk(uidsAll, 30);
    const dateChunks = chunk(datesAll, 30);
    for (const uidChunk of uidChunks) {
      for (const dateChunk of dateChunks) {
        const ph1 = uidChunk.map(() => '?').join(',');
        const ph2 = dateChunk.map(() => '?').join(',');
        const rs = (await env.DB.prepare(
          `SELECT * FROM schedule WHERE user_id IN (${ph1}) AND date IN (${ph2}) ORDER BY user_id, date, slot`
        ).bind(...uidChunk, ...dateChunk).all()).results;
        for (const r of rs) (beforeMap[r.user_id + '|' + r.date] ||= []).push(r);
      }
    }
  }
  // DELETE/INSERTをまとめて1回のバッチ実行で送るためのstatement配列
  const batch = [];
  const rookieCheck = []; // 新人配属通知の判定対象({uid,date,site})。後でまとめてreportsと突き合わせる
  for (const key of order) {
    const { uid, rank, name, date, items } = groups[key];
    const before = beforeMap[key] || [];
    // 予定表ソース取込専用モード: その日すでに何かスケジュールが入っていれば
    // (手動編集・自動取込問わず)一切触れずスキップする。既存の予定を保護するため。
    // 予定表ソース取込専用モード: その日すでに「現場(work)」の予定が入っていれば
    // (手動編集・自動取込問わず)一切触れずスキップする。休暇・×・1日OK・有給など
    // まだ現場が決まっていない状態は、通常通り上書きしてよい。
    if (mode === 'skip-if-exists' && before.some(b => b.type === 'work')) { skipped += items.length; skippedUnchanged += items.length; continue; }
    let baseSlots = [];
    if (mode === 'add') baseSlots = before.map(stripRow);
    // 同一(現場名)の行が複数ある場合は1つにマージする(台帳側で準備/搬入/本番などが
    // 別行に分かれていても、同じ人が同じ現場に複数回登録されるのを防ぐため)。
    // IN=最も早い時刻、OUT=最も遅い時刻、業務名は重複を除いて「/」で連結。
    const mergedMap = {}; const mergedOrder = [];
    for (const r of items) {
      const mkey = (r.site || '') + '|' + (r.type || 'work');
      if (!mergedMap[mkey]) { mergedMap[mkey] = { ...r, _duties: new Set() }; mergedOrder.push(mkey); }
      const g = mergedMap[mkey];
      if (r.tin && (!g.tin || timeToMin(r.tin) < timeToMin(g.tin))) g.tin = r.tin;
      if (r.tout && (!g.tout || timeToMin(r.tout) > timeToMin(g.tout))) g.tout = r.tout;
      if (r.load_end && !g.load_end) g.load_end = r.load_end;
      if (r.show_end && !g.show_end) g.show_end = r.show_end;
      if (r.multi) g.multi = 1;
      if (r.duty) g._duties.add(r.duty);
      if (r.note && !g.note) g.note = r.note;
    }
    const mergedItems = mergedOrder.map(k => {
      const g = mergedMap[k];
      const duties = [...g._duties];
      return { ...g, duty: duties.length ? duties.join('/') : g.duty };
    });
    const mergeNote = mergedItems.length < items.length ? `(${items.length}行→${mergedItems.length}件に統合)` : '';
    // 取り込み行を整形
    const incoming = [];
    for (const r of mergedItems) {
      const type = ['work', 'off', 'paid', 'x', 'ok'].includes(r.type) ? r.type : 'work';
      let hours = 0, overtime = 0, pay = 0;
      if (type === 'work' || type === 'paid') {
        const c = calcPay({ rank, date, tin: r.tin, tout: r.tout, duty: r.duty, loadEnd: r.load_end, showEnd: r.show_end, multi: r.multi ? 1 : 0 }, resolve);
        if (c) ({ hours, overtime, pay } = c);
      }
      if (r.pay !== '' && r.pay != null && !isNaN(Number(r.pay))) pay = Math.round(Number(r.pay));
      incoming.push({ type, site: r.site || '', venue: r.venue || '', tin: r.tin || '', tout: r.tout || '', hours, overtime, pay, note: r.note || '', duty: r.duty || '', load_end: r.load_end || '', show_end: r.show_end || '', multi: r.multi ? 1 : 0 });
    }
    // add モードは既存現場名と重複する行を除外
    let finalSlots;
    if (mode === 'add') {
      const seen = new Set(before.map(b => b.site));
      finalSlots = before.map(b => ({ type: b.type, site: b.site, venue: b.venue, tin: b.tin, tout: b.tout, hours: b.hours, overtime: b.overtime, pay: b.pay, note: b.note, duty: b.duty, load_end: b.load_end, show_end: b.show_end, multi: b.multi }));
      for (const it of incoming) { if (seen.has(it.site) && it.site) continue; finalSlots.push(it); seen.add(it.site); }
    } else {
      finalSlots = incoming;
    }
    // 変更判定
    const beforeJson = JSON.stringify(before.map(stripRow));
    const afterJson = JSON.stringify(finalSlots.map(stripRow));
    if (beforeJson === afterJson) { skipped += items.length; skippedUnchanged += items.length; continue; }
    batch.push(env.DB.prepare('DELETE FROM schedule WHERE user_id=? AND date=?').bind(uid, date));
    let slot = 0;
    for (const s of finalSlots) {
      batch.push(env.DB.prepare('INSERT INTO schedule(user_id,date,slot,type,site,venue,tin,tout,hours,overtime,pay,note,duty,load_end,show_end,multi) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(uid, date, slot, s.type, s.site, s.venue, s.tin, s.tout, s.hours || 0, s.overtime || 0, s.pay || 0, s.note, s.duty || '', s.load_end || '', s.show_end || '', s.multi ? 1 : 0));
      slot++;
      if (s.type === 'work' && s.site) rookieCheck.push({ uid, date, site: s.site });
    }
    batch.push(env.DB.prepare('INSERT INTO schedule_history(ts,editor_id,target_id,date,before_json,after_json) VALUES(?,?,?,?,?,?)')
      .bind(ts, editorId, uid, date, beforeJson, JSON.stringify({ slots: JSON.parse(afterJson), _src: srcLabel })));
    applied += items.length;
    if (mergeNote) errors.push(`${name || uid}さん ${date}: 同一現場の重複行を統合しました ${mergeNote}`);
  }
  // DELETE/INSERT/履歴記録をまとめて送信(D1のbatchは1回のAPIリクエストとして扱われる)
  if (batch.length) {
    const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
    for (const part of chunk(batch, 200)) await env.DB.batch(part);
  }
  // 新人配属通知をまとめて判定(対象のnext_date×next_siteの組み合わせだけ取得して突き合わせる)
  if (rookieCheck.length) {
    const dates = [...new Set(rookieCheck.map(x => x.date))];
    const chunkR = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
    let allReports = [];
    for (const dateChunk of chunkR(dates, 50)) {
      const ph = dateChunk.map(() => '?').join(',');
      const rs = (await env.DB.prepare(`SELECT * FROM reports WHERE next_date IN (${ph}) AND next_site!=''`).bind(...dateChunk).all()).results;
      allReports = allReports.concat(rs);
    }
    for (const rc of rookieCheck) {
      const matches = allReports.filter(rr => rr.next_date === rc.date && rr.next_site === rc.site);
      for (const rr of matches) await notify(env, [rc.uid], 'rookie', `🔰 ${rr.next_date} ${rr.next_site} に新人「${rr.candidate_name}」が入る予定です`);
    }
  }
  return { applied, skipped, skippedUnregistered, skippedUnchanged, skippedInvalid, skippedOtherOrg, errors };
}

// グリッドからフォーマットを推定。Cは勤務表(打刻/退勤/集合などの語)、それ以外はAB(月間表)
function detectFormat(grid) {
  const head = grid.slice(0, 14).flat().join(' ');
  if (/退勤時間|打刻時間|集合時間|終了予定時間|就業回数/.test(head)) return 'C';
  return 'AB';
}

// グリッドから「出勤/退勤/受注番号…」のヘッダ行を探し、各列の位置を特定する。
// フォーマット差(出勤と退勤の間に空列があるか)を吸収するため、ヘッダ名で列を引く。
function findHeaderCols(line) {
  const idxOf = (...names) => {
    for (let c = 0; c < line.length; c++) {
      const v = String(line[c] || '').trim();
      if (names.includes(v)) return c;
    }
    return -1;
  };
  const regno = idxOf('登録番号');
  if (regno < 0) return null;
  return {
    saimotsu: idxOf('催物名'),
    venueCol: idxOf('会場名'),
    gyomu: idxOf('業務名'),
    regno,
    rank: idxOf('ランク'),
    start: idxOf('開始時間'),
    tend: idxOf('終了予定時間', '終了予定'),
    tout: idxOf('退勤時間'),
    note: idxOf('備考'),
    org: idxOf('所属'),
  };
}

// ---- スプレッドシートURL取り込み用ヘルパー ----
// 共有URLから {id, gid} を取り出す
function parseSheetUrl(url) {
  const idm = String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  const gidm = String(url).match(/[#&?]gid=([0-9]+)/);
  if (!idm) return null;
  return { id: idm[1], gid: gidm ? gidm[1] : '0' };
}

// CSVエクスポートURLを組み立て(「リンクを知る全員が閲覧可」のシートのみ取得可能)
// Cloudflare WorkersのデフォルトUAだとGoogle側がbot対策ページ(HTML)を返すことがあるため、
// 通常のブラウザに近いヘッダーを付けてリクエストする。
const GSHEET_FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': '*/*',
};

function csvExportUrl(id, gid) {
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

// スプレッドシート内の全シート(タブ)を取得する処理は fetchXlsxSheets() に統合した。

// gvizのCSV出力(これは公開不要・共有リンク権限で取得できる場合がある)
function gvizCsvUrl(id, gid) {
  return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`;
}

// ===== xlsx を丸ごと取得して全シートを2次元配列で返す(依存ライブラリなし) =====
// Google Sheets の /export?format=xlsx は共有リンク権限のままファイル全体を返す。
// xlsx は zip なので、ZIP(ストア/Deflate)を自前展開し、sheetN.xml を簡易パースする。
async function fetchXlsxSheets(id) {
  const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`;
  const resp = await fetch(url, { redirect: 'follow', headers: GSHEET_FETCH_HEADERS });
  if (!resp.ok) throw new Error(`xlsx取得失敗(HTTP ${resp.status})`);
  // ダウンロード時のファイル名はレスポンスヘッダーにも入っていることが多く、
  // docProps/core.xml の dc:title より確実に取れるので優先的にこちらを使う。
  let headerTitle = '';
  const cd = resp.headers.get('content-disposition') || '';
  const cdm = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i);
  if (cdm) {
    try { headerTitle = decodeURIComponent(cdm[1]).replace(/\.xlsx$/i, '').trim(); } catch (e) { headerTitle = cdm[1].replace(/\.xlsx$/i, '').trim(); }
  }
  const buf = new Uint8Array(await resp.arrayBuffer());
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) {
    // xlsxではなくHTML等が返ってきた場合(共有設定 or bot対策ページの可能性)。先頭を少し見せてデバッグしやすくする。
    const head = new TextDecoder().decode(buf.slice(0, 120)).replace(/\s+/g, ' ').trim();
    throw new Error(`xlsxではない応答が返りました(共有設定を「リンクを知る全員が閲覧可」にしてください) [${head.slice(0, 60)}]`);
  }
  const files = await unzip(buf);
  // 共有文字列
  const sstXml = files['xl/sharedStrings.xml'] ? new TextDecoder().decode(files['xl/sharedStrings.xml']) : '';
  const sst = parseSharedStrings(sstXml);
  // workbook.xml でシート名と r:id、_rels で r:id→ファイル名 の対応を取る
  const wbXml = files['xl/workbook.xml'] ? new TextDecoder().decode(files['xl/workbook.xml']) : '';
  const relsXml = files['xl/_rels/workbook.xml.rels'] ? new TextDecoder().decode(files['xl/_rels/workbook.xml.rels']) : '';
  const relMap = {};
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*\/?>/g)) {
    const tag = m[0];
    const id2 = (tag.match(/Id="([^"]+)"/) || [])[1];
    const target = (tag.match(/Target="([^"]+)"/) || [])[1];
    if (id2 && target) relMap[id2] = target;
  }
  const norm = (t) => {
    if (!t) return '';
    let s = t.replace(/^\//, '');
    if (s.startsWith('xl/')) return s;
    return 'xl/' + s;
  };
  const sheets = [];
  for (const m of wbXml.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const tag = m[0];
    const name = (tag.match(/name="([^"]+)"/) || [])[1];
    const rid = (tag.match(/r:id="([^"]+)"/) || [])[1];
    if (!name || !rid) continue;
    const key = norm(relMap[rid]);
    const xml = files[key];
    if (xml) sheets.push({ name: unescapeXml(name), grid: parseSheetXml(new TextDecoder().decode(xml), sst) });
  }
  // ファイルタイトル(Driveのファイル名がそのまま入る。例:「6/30(火)_BP現場台帳」)。
  // レスポンスヘッダー(Content-Disposition)から取れればそれを優先し、
  // 取れなければ docProps/core.xml の dc:title を予備として使う。
  const coreXml = files['docProps/core.xml'] ? new TextDecoder().decode(files['docProps/core.xml']) : '';
  const titleMatch = coreXml.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/);
  const coreTitle = titleMatch ? unescapeXml(titleMatch[1]) : '';
  const fileTitle = headerTitle || coreTitle || '';
  return { sheets, raw: buf, fileTitle };   // raw = 元xlsxバイト列(R2保管用)
}

function parseSharedStrings(xml) {
  const arr = [];
  for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let s = ''; for (const t of si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) s += t[1];
    arr.push(unescapeXml(s));
  }
  return arr;
}

function colToIdx(ref) { // "B12" → 1
  const m = String(ref).match(/^([A-Z]+)/); if (!m) return 0;
  let n = 0; for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSheetXml(xml, sst) {
  const grid = [];
  for (const rowm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = [];
    for (const cm of rowm[1].matchAll(/<c\b([^>]*?)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cm[1] || cm[2] || '';
      const inner = cm[3] || '';
      const rref = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1] || '';
      const ci = rref ? colToIdx(rref) : cells.length;
      const t = (attrs.match(/t="([^"]+)"/) || [])[1] || '';
      let val = '';
      const vm = inner.match(/<v>([\s\S]*?)<\/v>/);
      const isuf = inner.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/);
      if (t === 's' && vm) val = sst[+vm[1]] || '';
      else if (t === 'inlineStr' && isuf) val = unescapeXml(isuf[1]);
      else if (vm) val = unescapeXml(vm[1]);
      while (cells.length < ci) cells.push('');
      cells[ci] = val;
    }
    grid.push(cells);
  }
  return grid;
}

function unescapeXml(s) {
  return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
}

// 最小限のZIP展開(method 0=store, 8=deflate)。DecompressionStreamでinflate。
async function unzip(buf) {
  const files = {};
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // End of Central Directory を末尾から探す
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('zip構造が不正');
  const cdOffset = dv.getUint32(eocd + 16, true);
  const cdCount = dv.getUint16(eocd + 10, true);
  let p = cdOffset;
  for (let n = 0; n < cdCount; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const lhOffset = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
    // ローカルヘッダから実データ開始位置
    const lhNameLen = dv.getUint16(lhOffset + 26, true);
    const lhExtraLen = dv.getUint16(lhOffset + 28, true);
    const dataStart = lhOffset + 30 + lhNameLen + lhExtraLen;
    const comp = buf.subarray(dataStart, dataStart + compSize);
    if (/(sharedStrings|workbook)\.xml$|worksheets\/sheet\d+\.xml$|workbook\.xml\.rels$|docProps\/core\.xml$/.test(name)) {
      files[name] = method === 0 ? comp : await inflateRaw(comp);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

async function inflateRaw(comp) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Response(comp).body.pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// CSVを2次元配列にパース(ダブルクォート・改行・カンマ対応)
function parseCsv(text) {
  const rows = []; let row = [], field = '', i = 0, q = false;
  while (i < text.length) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
    i++;
  }
  row.push(field); rows.push(row);
  return rows;
}

// 時刻文字列を H:MM に正規化(全角・前後空白・"8:00"などを許容)
function normTime(v) {
  let s = String(v == null ? '' : v).trim().replace(/[０-９：]/g, ch => '0123456789:'['０１２３４５６７８９：'.indexOf(ch)]);
  if (!s) return '';
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (m) return `${Number(m[1])}:${m[2]}`;
  // Excelの時刻はしばしば「1日に対する割合」の小数(シリアル値)で保存される。例: 0.354...=8:30
  const f = Number(s);
  if (Number.isFinite(f) && f > 0 && f < 1.5) {
    const totalMin = Math.round((f % 1) * 24 * 60);
    const hh = Math.floor(totalMin / 60), mm = totalMin % 60;
    if (hh >= 0 && hh < 30) return `${hh}:${String(mm).padStart(2, '0')}`;
  }
  return '';
}

// 現場名の表記ゆれを統一する。「〇〇【△△】」(末尾にセクション名)は
// 「【△△】〇〇」(先頭にセクション名)に並べ替える。これにより
// 「アリーナ椅子設営撤去【FANTASTICS】」と「【FANTASTICS】アリーナ椅子設営撤去」のような
// 表記違いが同一現場として扱われ、重複登録を防げる。
// 既に先頭が【】で始まる場合はそのまま。
function normalizeSiteName(site) {
  const s = String(site || '').trim();
  if (!s) return s;
  if (s.startsWith('【')) return s; // 既に正しい並び
  const m = s.match(/^(.*?)\s*【([^】]+)】\s*$/); // 末尾の「【...】」を検出
  if (m && m[1].trim()) return `【${m[2]}】${m[1].trim()}`;
  return s;
}

// 日付文字列を YYYY-MM-DD に正規化。基準年月(ym='2026-06')を補完に使う
function normSheetDate(v, ym) {
  const s = String(v == null ? '' : v).trim();
  let m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);          // 2026-06-13
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  m = s.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);                      // 6/13(土)
  if (m && ym) return `${ym.slice(0, 4)}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})日?$/);                                  // "13" / "13日"
  if (m && ym) return `${ym}-${String(m[1]).padStart(2, '0')}`;
  return '';
}

// フォーマットC(IN/OUT台帳)を解析。
// 1シートに複数イベントブロックが縦に積まれる。各ブロックは
//   「日付/受注番号」「催物名/会場名」「搬入終了」「終演時間」を含むメタ行群 →
//   「出勤…登録番号…業務名…」ヘッダ行 → 人数分のデータ行(FALSE埋めで終端)
// の構造。ヘッダ行(登録番号を含む行)を見つけるたびに直前メタから日付/会場/搬入終了/終演/2stを拾う。
function parseFormatC(rows, cfg, fileDate) {
  const curYear = new Date(Date.now() + 9 * 3600e3).getFullYear();
  const ym0 = String(curYear) + '-01';

  // OUT = 退勤と終了予定の遅い方(早朝<6:00は翌日扱い)
  const laterTime = (a, b) => {
    if (!a) return b || ''; if (!b) return a || '';
    const v = t => { const m = String(t).match(/^(\d{1,2}):(\d{2})$/); if (!m) return -1; let x = +m[1] * 60 + +m[2]; if (x < 360) x += 1440; return x; };
    return v(a) >= v(b) ? a : b;
  };
  // メタ行群(直近ヘッダの手前12行)から日付・会場・搬入終了・終演・2st を拾う
  // テンプレートには2種類ある:
  //   旧形式:「日付/受注番号」のように1セルに結合されたラベルの右隣に "6/29(月)/192266"
  //   新形式:「日付」「受注番号」「催物名」「会場名」がそれぞれ単独のラベルとして別行に並び、右隣に値だけが入る
  const scanMeta = (startRow, headerRow) => {
    let date = '', venue = '', loadEnd = '', showEnd = '', site = '', has2st = false;
    for (let r = startRow; r < headerRow; r++) {
      const line = rows[r] || [];
      for (let c = 0; c < line.length; c++) {
        const s = String(line[c] == null ? '' : line[c]);
        const strim = s.trim();
        // 「日付/受注番号」セルの右隣に "6/29(月)/192266"(旧形式)
        if (!date && /日付[\s\/]*受注番号/.test(s)) {
          const nx = String(line[c + 1] || '');
          const d = normSheetDate(nx, ym0); if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) date = d;
        }
        // 「日付」単独ラベルの右隣に日付だけが入る(新形式)
        if (!date && /^日付$/.test(strim)) {
          const nx = String(line[c + 1] || '');
          const d = normSheetDate(nx, ym0); if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) date = d;
        }
        // 「催物名/会場名」セルの右隣に "催物名/会場名"(旧形式)
        if (!site && /催物名[\s\/]*会場名/.test(s)) {
          const nx = String(line[c + 1] || '');
          const parts = nx.split('/');
          if (parts[0] && parts[0] !== '催物名') site = parts[0].trim();
          if (parts[1]) venue = parts[1].trim();
        }
        // 「催物名」単独ラベルの右隣に催物名だけが入る(新形式)
        if (!site && /^催物名$/.test(strim)) {
          const nx = String(line[c + 1] || '').trim();
          if (nx) site = nx;
        }
        // 「会場名」単独ラベルの右隣に会場名だけが入る(新形式)
        if (!venue && /^会場名$/.test(strim)) {
          const nx = String(line[c + 1] || '').trim();
          if (nx) venue = nx;
        }
        // 搬入終了 / 終演時間 は "搬入終了/11:00" か、セル"搬入終了"+右隣 の両対応
        let mm;
        if (!loadEnd) {
          if ((mm = s.match(/搬入終了[\s\/:：]+(\d{1,2}:\d{2})/))) loadEnd = mm[1];
          else if (/^搬入終了$/.test(s.trim())) { const t = normTime(line[c + 1]); if (t) loadEnd = t; }
        }
        if (!showEnd) {
          if ((mm = s.match(/終演[時間]*[\s\/:：]+(\d{1,2}:\d{2})/))) showEnd = mm[1];
          else if (/^終演時間$/.test(s.trim())) { const t = normTime(line[c + 1]); if (t) showEnd = t; }
        }
        if (!has2st && /(^|[^0-9a-zA-Z])2st([^0-9a-zA-Z]|$)/i.test(s) && c + 1 < line.length) {
          // 手当欄の "2st" ラベル右に氏名や値があれば手当ありとみなす(空ならスキップ)
          // ※業務名側の(2st)で確実判定するのでここは補助
        }
      }
    }
    return { date, venue, loadEnd, showEnd, site };
  };

  const out = [];
  let lastDate = fileDate || '', lastVenue = '';
  for (let r = 0; r < rows.length; r++) {
    const cols = findHeaderCols(rows[r] || []);
    if (!cols) continue;                  // ヘッダ行(登録番号を含む)を探す
    // 「総数,◯◯,受注番号,...」のような全イベント集計(台帳まとめ)表のヘッダーはスキップ。
    // これは既に各イベント単位で数えた人を再度まとめているだけなので、取り込むと二重計上になる。
    if (String((rows[r] || [])[0] || '').trim() === '総数') continue;
    // このブロックのメタを直前から取得
    const meta = scanMeta(Math.max(0, r - 12), r);
    if (meta.date) lastDate = meta.date;
    if (meta.venue) lastVenue = meta.venue;
    const blockDate = meta.date || lastDate;
    const blockVenue = meta.venue || lastVenue;
    const blockLoadEnd = meta.loadEnd, blockShowEnd = meta.showEnd;
    // データ行: ヘッダの次から、登録番号が数値の行を読む。空行/FALSE埋めが続いたら終端
    let blank = 0;
    for (let d = r + 1; d < rows.length; d++) {
      const line = rows[d] || [];
      // 次のブロックのヘッダに当たったら break(外ループが拾う)
      if (findHeaderCols(line)) { r = d - 1; break; }
      // Excelの数値セルは "122842.0" のように小数点付きで来ることがあるため整数化してから判定
      const regno = normRegno(line[cols.regno]);
      if (!/^\d{3,}$/.test(regno)) {
        // 登録番号が数値でなくても、業務名や時刻など他のデータがあれば、外部委託スタッフ
        // (登録番号欄が「ウイリング」等の会社名になっている)の可能性が高い。この場合は
        // ブロック終端とみなさず読み飛ばして次の行へ進む(このような行が20行以上連続する
        // こともあるため)。行全体が本当に空の場合にのみ終端カウントを進める。
        const dutyV = String(line[cols.gyomu] || '').trim();
        const hasOtherData = dutyV || normTime(line[cols.start]) || normTime(cols.tend >= 0 ? line[cols.tend] : '') || normTime(cols.tout >= 0 ? line[cols.tout] : '');
        if (!hasOtherData) { if (++blank > 8) break; }  // FALSE埋め(完全な空行)が続く=ブロック終端
        continue;
      }
      blank = 0;
      let duty = String(line[cols.gyomu] || '').trim();
      let multi = 0;
      // 業務名に "(2st)" → 2st手当ON、表記を除去
      if (/[（(]\s*2st\s*[)）]/i.test(duty)) { multi = 1; duty = duty.replace(/[（(]\s*2st\s*[)）]/ig, '').trim(); }
      const site = normalizeSiteName((cols.saimotsu >= 0 ? String(line[cols.saimotsu] || '').trim() : '') || meta.site || duty);
      const venueCell = (cols.venueCol >= 0 ? String(line[cols.venueCol] || '').trim() : '') || blockVenue;
      const tin = normTime(line[cols.start]);
      const tout = laterTime(normTime(cols.tout >= 0 ? line[cols.tout] : ''), normTime(cols.tend >= 0 ? line[cols.tend] : ''));
      const note = cols.note >= 0 ? String(line[cols.note] || '').trim() : '';
      const org = cols.org >= 0 ? String(line[cols.org] || '').trim() : '';
      if (!tin && !tout && !duty) continue;
      out.push({ regno, date: blockDate, site, venue: venueCell, tin, tout, duty, load_end: blockLoadEnd, show_end: blockShowEnd, multi, note, org });
    }
  }
  return { date: lastDate, venue: lastVenue, rows: out };
}

// Excelのシリアル日付(1900年始まり、整数または"46143"のような文字列)を YYYY-MM-DD に変換
function excelSerialToDate(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 1) return '';
  const ms = Math.round((n - 25569) * 86400000); // 1970-01-01からの経過ms(Excelの1900日付システム基準)
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '';
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// 「チーフ/手配者向けスケジュール表」(月ごとにシートが分かれ、3列(現場名/会場/備考等)×人数が横に並ぶ予定表)を解析。
// ラベル行("現場"または"現場名"を含む列がブロック先頭)の2行上=氏名, 1行上=登録番号(ブロック先頭列)。
// 日付列はラベル行より前の列の中から、データ行でExcelシリアル値(40000〜60000程度)が入っている列を自動検出する
// (表によって日付列の位置が異なる=チーフ表はB列、1課手配表はA列、など)。
// fromDate(YYYY-MM-DD)以降の日付のみを対象に抽出する(それより前は台帳の実績を優先するため取り込まない)。
function parseChiefScheduleSheet(grid, fromDate) {
  const out = [];
  // ラベル行("現場"または"現場名"を含むセルが複数並ぶ行)を探す
  let labelRow = -1, genbaCols = [];
  for (let r = 0; r < Math.min(grid.length, 10); r++) {
    const line = grid[r] || [];
    const cols = [];
    for (let c = 0; c < line.length; c++) if (/^現場名?$/.test(String(line[c]).trim())) cols.push(c);
    if (cols.length >= 1) { labelRow = r; genbaCols = cols; break; }
  }
  if (labelRow < 0) return [];
  const nameRow = grid[labelRow - 2] || [];
  const regnoRow = grid[labelRow - 1] || [];
  const blocks = genbaCols.map(c => ({
    col: c,
    name: String(nameRow[c] || '').trim(),
    regno: normRegno(regnoRow[c]),
  })).filter(b => /^\d{3,}$/.test(b.regno));
  if (!blocks.length) return [];

  // 日付列を自動検出: ラベル行より左の列のうち、直後のデータ行でシリアル日付らしき数値が入っている列
  let dateCol = -1;
  for (let probe = labelRow + 1; probe < Math.min(grid.length, labelRow + 8) && dateCol < 0; probe++) {
    const sample = grid[probe] || [];
    for (let c = 0; c < genbaCols[0]; c++) {
      const v = Number(sample[c]);
      if (Number.isFinite(v) && v > 40000 && v < 60000) { dateCol = c; break; }
    }
  }
  if (dateCol < 0) dateCol = Math.max(0, genbaCols[0] - 2); // 検出できなければフォールバック(よくある位置)

  for (let r = labelRow + 1; r < grid.length; r++) {
    const line = grid[r] || [];
    const dateRaw = line[dateCol];
    if (!dateRaw) continue;
    const date = excelSerialToDate(dateRaw);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (fromDate && date < fromDate) continue; // 対象日より前はスキップ(台帳の実績を優先)
    for (const b of blocks) {
      const site = String(line[b.col] || '').trim();
      const venue = String(line[b.col + 1] || '').trim();
      if (!site || site === '未定') continue; // 空欄・未定はスキップ(現状維持)
      if (site === '×') { out.push({ regno: b.regno, date, type: 'x' }); continue; }
      if (site === '休暇') { out.push({ regno: b.regno, date, type: 'off' }); continue; }
      // それ以外(現場名・"手配"含む)は予定ありとして登録。時刻情報はこの表にはない。
      out.push({ regno: b.regno, date, type: 'work', site, venue, tin: '', tout: '', duty: '' });
    }
  }
  return out;
}

// フォーマットA/B(個人スケジュール月間表・横長)を解析
// 3行目(idx2)に登録番号、メンバーごとに3列セット(現場名・会場・備考/入力)
// 5行目以降(idx4+)に日付(B列)とデータ。ym='2026-06' を日付補完に使う
function parseFormatAB(rows, ym, cfg) {
  const regnoRow = (cfg && cfg.regnoRow) || 2;   // 0始まりで3行目
  const firstDateRow = (cfg && cfg.firstDateRow) || 4;
  const dayCol = (cfg && cfg.dayCol) != null ? cfg.dayCol : 1; // 日付が入る列(B=1)
  // 登録番号が入っている列を検出 → そこから3列が1メンバー(現場名,会場,備考)
  const reg = rows[regnoRow] || [];
  const memberCols = [];
  for (let c = 0; c < reg.length; c++) { if (/^\d{3,}$/.test(normRegno(reg[c]))) memberCols.push({ regno: normRegno(reg[c]), c }); }
  const out = [];
  for (let r = firstDateRow; r < rows.length; r++) {
    const line = rows[r] || [];
    const date = normSheetDate(line[dayCol], ym);
    if (!date) continue;
    for (const m of memberCols) {
      const site = normalizeSiteName(String(line[m.c] || '').trim());
      const venue = String(line[m.c + 1] || '').trim();
      const note = String(line[m.c + 2] || '').trim();
      if (!site) continue;
      if (['×', '✕', 'x', 'X', '休暇', '○', '〇', '未定', '手配'].includes(site)) continue; // 非現場
      out.push({ regno: m.regno, date, site, venue, note });
    }
  }
  return { rows: out };
}

// ---- Firebase Cloud Messaging(プッシュ通知)送信 ----
// Firebaseサービスアカウントの秘密鍵(JSON全体)をwrangler secretとして env.FCM_SERVICE_ACCOUNT に保存し、
// それを使ってGoogleのOAuth2アクセストークンを取得してから、FCM HTTP v1 APIでプッシュを送る。
// 未設定(secret未登録)の場合は何もしない(アプリ内お知らせ機能自体は従来通り動く)。
let fcmAccessTokenCache = null; // { token, expiresAt } 同一Worker実行内でのみ再利用する軽いキャッシュ
async function getFcmAccessToken(env) {
  if (fcmAccessTokenCache && fcmAccessTokenCache.expiresAt > Date.now() + 60000) return fcmAccessTokenCache.token;
  const sa = JSON.parse(env.FCM_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);
  const b64url = obj => btoa(typeof obj === 'string' ? obj : JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const toSign = b64url({ alg: 'RS256', typ: 'JWT' }) + '.' + b64url({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  });
  const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s/g, '');
  const binaryDer = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', binaryDer.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sigBuffer = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(toSign));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBuffer))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${toSign}.${sigB64}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('FCM認証失敗: ' + JSON.stringify(data));
  fcmAccessTokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return data.access_token;
}
// 指定した複数ユーザーの、登録済み全デバイスへプッシュ通知を送る。個別の送信失敗は無視して次へ進む。
async function sendPushToUsers(env, userIds, title, body, link) {
  if (!env.FCM_SERVICE_ACCOUNT || !userIds.length) return;
  try {
    const sa = JSON.parse(env.FCM_SERVICE_ACCOUNT);
    const accessToken = await getFcmAccessToken(env);
    const ph = userIds.map(() => '?').join(',');
    const rows = (await env.DB.prepare(`SELECT token FROM push_tokens WHERE user_id IN (${ph})`).bind(...userIds).all()).results;
    for (const row of rows) {
      try {
        await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: {
            token: row.token,
            notification: { title, body },
            data: link ? { link } : {},
            webpush: link ? { fcm_options: { link } } : undefined,
          } }),
        });
      } catch (e) {}
    }
  } catch (e) { console.error('sendPushToUsers failed:', e); }
}

async function notify(env, userIds, type, message, link = '') {
  const ts = jstTs();
  const newlyNotified = [];
  for (const id of userIds) {
    const dup = await env.DB.prepare('SELECT 1 FROM notifications WHERE user_id=? AND message=? AND read=0').bind(id, message).first();
    if (dup) continue;
    await env.DB.prepare('INSERT INTO notifications(user_id,ts,type,message,link) VALUES(?,?,?,?,?)').bind(id, ts, type, message, link).run();
    newlyNotified.push(id);
  }
  // プッシュ送信は失敗してもアプリ内お知らせの保存自体には影響させない
  if (newlyNotified.length) sendPushToUsers(env, newlyNotified, 'RB事業2課', message, link).catch(() => {});
}

async function notifyChiefs(env, type, message) {
  const rows = (await env.DB.prepare("SELECT id FROM users WHERE role!='member'").all()).results;
  await notify(env, rows.map(r => r.id), type, message);
}

// 新人の次回現場と一致するスケジュールを持つ人へ通知
async function rookieNotify(env, r) {
  if (!r.next_site || !r.next_date) return;
  const rows = (await env.DB.prepare("SELECT user_id FROM schedule WHERE date=? AND site=? AND type='work'").bind(r.next_date, r.next_site).all()).results;
  await notify(env, rows.map(x => x.user_id), 'rookie', `🔰 ${r.next_date} ${r.next_site} に新人「${r.candidate_name}」が入る予定です`);
}

async function auth(req, env) {
  const t = (req.headers.get('authorization') || '').replace('Bearer ', '');
  if (!t) return null;
  const s = await env.DB.prepare('SELECT s.token AS _tk, s.handler AS _handler, u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?').bind(t).first();
  if (!s) return null;
  await env.DB.prepare('UPDATE sessions SET last_seen=? WHERE token=?').bind(Date.now(), t).run();
  return s;
}

async function api(req, env, url) {
  const path = url.pathname.replace(/^\/api/, '');
  const method = req.method;
  const body = method === 'GET' || method === 'DELETE' ? {} : await req.json().catch(() => ({}));

  // ---- 認証不要 ----
  if (method === 'POST' && path === '/login') {
    const { regno, password } = body;
    const u = await env.DB.prepare('SELECT * FROM users WHERE regno=?').bind(String(regno || '').trim()).first();
    if (!u) return ERR('登録番号またはパスワードが違います', 401);
    if (u.suspended) return ERR('このアカウントは停止されています。管理者にお問い合わせください。', 403);
    if (!u.pass_hash) {
      if (password !== u.regno) return ERR('登録番号またはパスワードが違います', 401);
      const salt = rnd();
      const h = await pbkdf2(password, salt);
      // 初期パスワード(=登録番号)での初回ログイン → 強制変更フラグを立てる
      await env.DB.prepare('UPDATE users SET pass_hash=?, salt=?, must_change=1 WHERE id=?').bind(h, salt, u.id).run();
      u.must_change = 1;
    } else {
      const h = await pbkdf2(password || '', u.salt);
      if (h !== u.pass_hash) return ERR('登録番号またはパスワードが違います', 401);
    }
    const token = rnd();
    await env.DB.prepare('INSERT INTO sessions(token,user_id,handler,last_seen,created) VALUES(?,?,0,?,?)').bind(token, u.id, Date.now(), Date.now()).run();
    return J({ token, user: { ...pub(u), handler: 0 } });
  }

  // ---- スプレッドシート取り込み(GAS用・共有トークン認証)----
  // GAS から POST /api/import-schedule で呼び出す。セッション不要。
  if (method === 'POST' && path === '/import-schedule') {
    const tok = await getSetting(env, 'import_token', '');
    if (!tok || body.token !== tok) return ERR('取り込みトークンが違います', 403);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) return ERR('取り込むデータがありません(rowsが空です)');
    // 台帳(実績)ではなく「予定」の連携なので、既に何か入っている日は上書きしない
    const result = await applyImportRows(env, rows, 0, 'skip-if-exists', 'spreadsheet');
    return J({ ok: 1, ...result });
  }

  const me = await auth(req, env);
  if (!me) return ERR('ログインしてください', 401);
  if (me.suspended) { await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(me.id).run(); return ERR('このアカウントは停止されています', 403); }
  const handlerMode = me._handler === 1 && has(me, 'site_manage');

  if (method === 'POST' && path === '/logout') {
    await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(me._tk).run();
    return J({ ok: 1 });
  }
  if (method === 'GET' && path === '/me') return J({ ...pub(me), handler: handlerMode ? 1 : 0 });

  if (method === 'POST' && path === '/password') {
    const { oldpw, newpw } = body;
    if (!newpw || newpw.length < 4) return ERR('新しいパスワードは4文字以上にしてください');
    const h = await pbkdf2(oldpw || '', me.salt);
    if (h !== me.pass_hash) return ERR('現在のパスワードが違います');
    // 初期PW(登録番号)と同じものへの変更は許可しない(強制変更の意味がなくなるため)
    if (newpw === me.regno) return ERR('登録番号と同じパスワードは使えません。別のパスワードを設定してください');
    const salt = rnd();
    await env.DB.prepare('UPDATE users SET pass_hash=?, salt=?, must_change=0 WHERE id=?').bind(await pbkdf2(newpw, salt), salt, me.id).run();
    return J({ ok: 1 });
  }

  // ---- 手配者モード ----
  // PINは誰でも入力を試せる。PINが正しくても、手配権限(site_manage)がない人は
  // 手配モードを有効にできず、代わりに管理者へ通知する(PIN漏えい等の不正利用の検知のため)。
  if (method === 'POST' && path === '/handler-mode') {
    const pin = await getSetting(env, 'handler_pin', '111111');
    if (body.pin !== pin) return ERR('パスワードが違います', 403);
    if (!has(me, 'site_manage')) {
      try {
        const admins = (await env.DB.prepare("SELECT id FROM users WHERE role='admin' AND COALESCE(suspended,0)=0").all()).results;
        if (admins.length) {
          await notify(env, admins.map(a => a.id), 'security',
            `⚠️(${jstTs()}) ${me.name}さん(${me.regno}/${me.role})が手配者パスワードを入力しましたが、権限がないためアクセスを拒否しました。`);
        }
      } catch (e) {}
      return ERR('権限がありません', 403);
    }
    await env.DB.prepare('UPDATE sessions SET handler=1 WHERE token=?').bind(me._tk).run();
    return J({ ok: 1 });
  }
  // 手配者専用パスワードの変更(管理者のみ)
  if (method === 'POST' && path === '/settings/handler-pin') {
    if (me.role !== 'admin') return ERR('管理者のみ変更できます', 403);
    const pin = String(body.pin || '').trim();
    if (pin.length < 4 || pin.length > 20) return ERR('4〜20文字で設定してください');
    await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('handler_pin',?)").bind(pin).run();
    await env.DB.prepare('UPDATE sessions SET handler=0 WHERE user_id!=?').bind(me.id).run(); // 旧PINで入った手配モードを解除
    return J({ ok: 1 });
  }
  if (method === 'GET' && path === '/settings/handler-pin') {
    if (me.role !== 'admin') return ERR('ページが見つかりません', 404);
    return J({ pin: await getSetting(env, 'handler_pin', '111111') });
  }
  // スプレッドシート取り込みトークン(管理者のみ)
  if (method === 'GET' && path === '/settings/import-token') {
    if (me.role !== 'admin') return ERR('ページが見つかりません', 404);
    return J({ token: await getSetting(env, 'import_token', '') });
  }
  if (method === 'POST' && path === '/settings/import-token') {
    if (me.role !== 'admin') return ERR('管理者のみ再発行できます', 403);
    const newTok = 'tok_' + rnd().slice(0, 32);
    await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('import_token',?)").bind(newTok).run();
    return J({ token: newTok });
  }
  if (method === 'DELETE' && path === '/handler-mode') {
    await env.DB.prepare('UPDATE sessions SET handler=0 WHERE token=?').bind(me._tk).run();
    return J({ ok: 1 });
  }

  // ---- ユーザー ----
  if (method === 'GET' && path === '/users') {
    if (lv(me) < 1) return ERR('ページが見つかりません', 404);
    const rows = (await env.DB.prepare('SELECT * FROM users ORDER BY regno').all()).results;
    return J(rows.map(pub));
  }

  // ---- 個別追加権限(管理者のみ) ----
  // 利用可能な権限キー一覧(ラベル・基準レベル付き)
  if (method === 'GET' && path === '/perm-defs') {
    if (!has(me, 'account_manage')) return ERR('ページが見つかりません', 404);
    return J({ perms: Object.entries(PERMS).map(([key, p]) => ({ key, label: p.label, baseLv: p.baseLv })) });
  }
  // 特定ユーザーの基本権限+追加権限を取得
  let pum;
  if (method === 'GET' && (pum = path.match(/^\/users\/(\d+)\/perms$/))) {
    if (!has(me, 'account_manage')) return ERR('ページが見つかりません', 404);
    const u = await env.DB.prepare('SELECT id,name,regno,role FROM users WHERE id=?').bind(Number(pum[1])).first();
    if (!u) return ERR('見つかりません', 404);
    return J({ id: u.id, name: u.name, regno: u.regno, role: u.role, extraPerms: getPerms(u) });
  }
  // 特定ユーザーの追加権限を保存(管理者のみ)
  if (method === 'PUT' && (pum = path.match(/^\/users\/(\d+)\/perms$/))) {
    if (!has(me, 'account_manage')) return ERR('権限がありません', 403);
    const uid = Number(pum[1]);
    const keys = Array.isArray(body.perms) ? body.perms.filter(k => PERMS[k]) : [];
    await env.DB.prepare('UPDATE users SET extra_perms=? WHERE id=?').bind(JSON.stringify(keys), uid).run();
    return J({ ok: 1, extraPerms: keys });
  }

  // ロール単位の一括権限付与(メンツ全員/チーフ全員などに、まとめてチェックを入れて付与)
  // 「全員に付与されている権限」だけをON表示する(一部の人だけ個別に持っている権限はここでは反映しない)
  if (method === 'GET' && (pum = path.match(/^\/role-perms\/(member|chief|handler)$/))) {
    if (!has(me, 'account_manage')) return ERR('ページが見つかりません', 404);
    const role = pum[1];
    const rows = (await env.DB.prepare('SELECT extra_perms FROM users WHERE role=? AND COALESCE(suspended,0)=0').bind(role).all()).results;
    let common = null;
    for (const r of rows) {
      const ps = new Set(getPerms(r));
      common = common === null ? ps : new Set([...common].filter(k => ps.has(k)));
    }
    return J({ role, count: rows.length, perms: common ? [...common] : [] });
  }
  if (method === 'PUT' && (pum = path.match(/^\/role-perms\/(member|chief|handler)$/))) {
    if (!has(me, 'account_manage')) return ERR('権限がありません', 403);
    const role = pum[1];
    const keys = Array.isArray(body.perms) ? body.perms.filter(k => PERMS[k]) : [];
    const rows = (await env.DB.prepare('SELECT id, extra_perms FROM users WHERE role=?').bind(role).all()).results;
    for (const r of rows) {
      // 既存の個別権限のうち、定義済みキー以外(将来の拡張用)は維持しつつ、定義済みキーはチェック状態に合わせて入れ替える
      const cur = getPerms(r).filter(k => !PERMS[k]);
      const next = [...cur, ...keys];
      await env.DB.prepare('UPDATE users SET extra_perms=? WHERE id=?').bind(JSON.stringify(next), r.id).run();
    }
    return J({ ok: 1, role, updated: rows.length, perms: keys });
  }

  // 手配担当の一覧(担当グループのプルダウン用)
  if (method === 'GET' && path === '/managers') {
    if (lv(me) < 1) return ERR('ページが見つかりません', 404);
    const rows = (await env.DB.prepare("SELECT * FROM users WHERE role IN ('handler','admin') ORDER BY regno").all()).results;
    // 各手配担当が受け持つメンバー数も付ける
    const counts = (await env.DB.prepare('SELECT manager_id, COUNT(*) AS n FROM users WHERE manager_id IS NOT NULL GROUP BY manager_id').all()).results;
    const cmap = {}; for (const c of counts) cmap[c.manager_id] = c.n;
    return J(rows.map(u => ({ id: u.id, name: u.name, regno: u.regno, count: cmap[u.id] || 0 })));
  }
  // 時給テーブル取得(手配担当以上)。effective_fromごとにグルーピングして返す
  if (method === 'GET' && path === '/wage-rates') {
    if (!has(me, 'wage_settings')) return ERR('ページが見つかりません', 404);
    const rows = (await env.DB.prepare('SELECT effective_from,rank,kind,amount FROM wage_rates ORDER BY effective_from,rank,kind').all()).results;
    const periods = {};
    for (const r of rows) { (periods[r.effective_from] ||= { effective_from: r.effective_from, rates: {} }); (periods[r.effective_from].rates[r.rank] ||= {})[r.kind] = r.amount; }
    return J({ lockBefore: payLockDate(await getLockDays(env)), lockDays: await getLockDays(env), periods: Object.values(periods) });
  }
  // 時給テーブル更新(管理者)。body.rates=[{effective_from,rank,kind,amount}]。新規effective_fromの追加も可
  if (method === 'PUT' && path === '/wage-rates') {
    if (!has(me, 'wage_settings')) return ERR('権限がありません', 403);
    const list = Array.isArray(body.rates) ? body.rates : [];
    let n = 0;
    for (const r of list) {
      const ef = String(r.effective_from || '').trim(), rk = String(r.rank || '').trim(), kd = (r.kind === 'load' ? 'load' : 'guide');
      const amt = Math.round(Number(r.amount));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ef) || !rk || !Number.isFinite(amt) || amt < 0) continue;
      await env.DB.prepare('INSERT INTO wage_rates(effective_from,rank,kind,amount) VALUES(?,?,?,?) ON CONFLICT(effective_from,rank,kind) DO UPDATE SET amount=excluded.amount').bind(ef, rk, kd, amt).run();
      n++;
    }
    return J({ ok: 1, updated: n });
  }
  // 新しい時給改定(effective_from)を削除(管理者)。確定ロック前提
  if (method === 'POST' && path === '/wage-rates/delete') {
    if (!has(me, 'wage_settings')) return ERR('権限がありません', 403);
    const ef = String(body.effective_from || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ef)) return ERR('不正な日付です');
    await env.DB.prepare('DELETE FROM wage_rates WHERE effective_from=?').bind(ef).run();
    return J({ ok: 1 });
  }
  // 既存スケジュールの給与・残業を新ルールで一括再計算(管理者)。過去データの修正用
  if (method === 'POST' && path === '/recalc') {
    if (!has(me, 'wage_settings')) return ERR('権限がありません', 403);
    const resolve = await loadWageResolver(env);
    const users = (await env.DB.prepare('SELECT id,rank FROM users').all()).results;
    const rankMap = {}; for (const u of users) rankMap[u.id] = u.rank;
    const rows = (await env.DB.prepare("SELECT id,user_id,date,tin,tout,duty,load_end,show_end,multi FROM schedule WHERE type='work'").all()).results;
    let n = 0;
    for (const r of rows) {
      const c = calcPay({ rank: rankMap[r.user_id], date: r.date, tin: r.tin, tout: r.tout, duty: r.duty, loadEnd: r.load_end, showEnd: r.show_end, multi: r.multi }, resolve);
      if (!c) continue;
      await env.DB.prepare('UPDATE schedule SET hours=?, overtime=?, pay=? WHERE id=?').bind(c.hours, c.overtime, c.pay, r.id).run();
      n++;
    }
    return J({ ok: 1, updated: n });
  }

  // ---- 通知設定(管理者) ----
  if (method === 'GET' && path === '/notify-settings') {
    if (!has(me, 'wage_settings')) return ERR('ページが見つかりません', 404);
    return J({
      enabled: (await getSetting(env, 'notify_enabled', '1')) !== '0',
      hour: parseInt(await getSetting(env, 'notify_hour', '21'), 10),
      target: await getSetting(env, 'notify_target', 'chiefs'),
    });
  }
  if (method === 'PUT' && path === '/notify-settings') {
    if (!has(me, 'wage_settings')) return ERR('権限がありません', 403);
    const enabled = body.enabled ? '1' : '0';
    let hour = parseInt(body.hour, 10); if (isNaN(hour) || hour < 0 || hour > 23) hour = 21;
    const target = ['handlers', 'chiefs', 'all'].includes(body.target) ? body.target : 'chiefs';
    await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('notify_enabled',?)").bind(enabled).run();
    await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('notify_hour',?)").bind(String(hour)).run();
    await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('notify_target',?)").bind(target).run();
    return J({ ok: 1, enabled: enabled === '1', hour, target });
  }
  if (method === 'POST' && path === '/notify-test') {
    if (!has(me, 'wage_settings')) return ERR('権限がありません', 403);
    await notify(env, [me.id], 'remind', '🔔【テスト通知】通知は正常に動作しています。');
    return J({ ok: 1 });
  }

  // ---- 予定表ソース管理(動的に何個でも追加可能) ----
  let scm;
  if (method === 'GET' && path === '/sched-sources') {
    if (!has(me, 'wage_settings')) return ERR('ページが見つかりません', 404);
    const rows = (await env.DB.prepare('SELECT * FROM sched_sources ORDER BY id').all()).results;
    return J({ sources: rows.map(r => ({
      id: r.id, label: r.label, url: r.url, enabled: !!r.enabled,
      freqType: r.freq_type, intervalHours: r.interval_hours, hour: r.hour,
      notifyAdmin: !!r.notify_admin, lastRun: r.last_run || '',
      lastResult: (() => { try { return JSON.parse(r.last_result || '') } catch (e) { return null } })(),
    })) });
  }
  if (method === 'POST' && path === '/sched-sources') {
    if (!has(me, 'wage_settings')) return ERR('権限がありません', 403);
    const label = (body.label || '').trim();
    const url = (body.url || '').trim();
    if (!label || !url) return ERR('名前とURLを入力してください');
    if (!parseSheetUrl(url)) return ERR('URLの形式が正しくありません');
    const freqType = body.freqType === 'daily' ? 'daily' : 'interval';
    let intervalHours = parseInt(body.intervalHours, 10); if (isNaN(intervalHours) || intervalHours < 1) intervalHours = 1;
    let hour = parseInt(body.hour, 10); if (isNaN(hour) || hour < 0 || hour > 23) hour = 6;
    const notifyAdmin = body.notifyAdmin === false ? 0 : 1;
    const r = await env.DB.prepare(
      'INSERT INTO sched_sources(label,url,enabled,freq_type,interval_hours,hour,notify_admin,last_run,last_result,created_at,created_by) VALUES(?,?,1,?,?,?,?,?,?,?,?)'
    ).bind(label, url, freqType, intervalHours, hour, notifyAdmin, '', '', jstTs(), me.id).run();
    return J({ ok: 1, id: r.meta.last_row_id });
  }
  if (method === 'PUT' && (scm = path.match(/^\/sched-sources\/(\d+)$/))) {
    if (!has(me, 'wage_settings')) return ERR('権限がありません', 403);
    const id = Number(scm[1]);
    const existing = await env.DB.prepare('SELECT id FROM sched_sources WHERE id=?').bind(id).first();
    if (!existing) return ERR('見つかりません', 404);
    const label = (body.label || '').trim();
    const url = (body.url || '').trim();
    if (!label || !url) return ERR('名前とURLを入力してください');
    if (!parseSheetUrl(url)) return ERR('URLの形式が正しくありません');
    const enabled = body.enabled ? 1 : 0;
    const freqType = body.freqType === 'daily' ? 'daily' : 'interval';
    let intervalHours = parseInt(body.intervalHours, 10); if (isNaN(intervalHours) || intervalHours < 1) intervalHours = 1;
    let hour = parseInt(body.hour, 10); if (isNaN(hour) || hour < 0 || hour > 23) hour = 6;
    const notifyAdmin = body.notifyAdmin === false ? 0 : 1;
    await env.DB.prepare(
      'UPDATE sched_sources SET label=?, url=?, enabled=?, freq_type=?, interval_hours=?, hour=?, notify_admin=? WHERE id=?'
    ).bind(label, url, enabled, freqType, intervalHours, hour, notifyAdmin, id).run();
    return J({ ok: 1 });
  }
  if (method === 'DELETE' && (scm = path.match(/^\/sched-sources\/(\d+)$/))) {
    if (!has(me, 'wage_settings')) return ERR('権限がありません', 403);
    const id = Number(scm[1]);
    await env.DB.prepare('DELETE FROM sched_sources WHERE id=?').bind(id).run();
    await env.DB.prepare("DELETE FROM import_snapshots WHERE source=?").bind('sched_src_' + id).run();
    return J({ ok: 1 });
  }
  // 今すぐ手動実行(対象日=今日+2日以降、固定)
  if (method === 'POST' && (scm = path.match(/^\/sched-sources\/(\d+)\/run$/))) {
    if (!has(me, 'wage_settings')) return ERR('権限がありません', 403);
    const id = Number(scm[1]);
    const src = await env.DB.prepare('SELECT * FROM sched_sources WHERE id=?').bind(id).first();
    if (!src) return ERR('見つかりません', 404);
    const d = new Date(Date.now() + 9 * 3600e3); d.setDate(d.getDate() + 2);
    const fromDate = d.toISOString().slice(0, 10);
    try {
      const r = await importScheduleSheet(env, 'sched_src_' + id, src.url, me.id, fromDate);
      await env.DB.prepare('UPDATE sched_sources SET last_run=?, last_result=? WHERE id=?').bind(
        jstTs(), JSON.stringify({ ts: jstTs(), applied: r.applied, skipped: r.skipped, unchangedPeople: r.unchangedPeople, changedPeople: r.changedPeople, error: '' }), id
      ).run();
      if (src.notify_admin && r.applied > 0) {
        const admins = (await env.DB.prepare("SELECT id FROM users WHERE role='admin' AND COALESCE(suspended,0)=0").all()).results;
        if (admins.length) await notify(env, admins.map(a => a.id), 'sched_import', `📅【${src.label}】からスケジュールを取り込みました(${jstTs()})。反映${r.applied}件・変更あり${r.changedPeople ?? '-'}人`);
      }
      return J({ ok: 1, fromDate, ...r });
    } catch (e) {
      await env.DB.prepare('UPDATE sched_sources SET last_run=?, last_result=? WHERE id=?').bind(
        jstTs(), JSON.stringify({ ts: jstTs(), applied: 0, skipped: 0, error: e.message }), id
      ).run();
      return ERR('取り込みエラー: ' + e.message);
    }
  }

  // ---- 台帳の深夜自動再取り込みの実行時刻設定 ----
  if (method === 'GET' && path === '/daicho-reload-settings') {
    if (!has(me, 'wage_settings')) return ERR('ページが見つかりません', 404);
    return J({ hour: parseInt(await getSetting(env, 'daicho_reload_hour', '0'), 10) });
  }
  if (method === 'PUT' && path === '/daicho-reload-settings') {
    if (!has(me, 'wage_settings')) return ERR('権限がありません', 403);
    let hour = parseInt(body.hour, 10); if (isNaN(hour) || hour < 0 || hour > 23) hour = 0;
    await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('daicho_reload_hour',?)").bind(String(hour)).run();
    return J({ ok: 1, hour });
  }

  // ---- 給与確定ロック期間の設定 ----
  if (method === 'GET' && path === '/lock-settings') {
    if (!has(me, 'wage_settings')) return ERR('ページが見つかりません', 404);
    const days = await getLockDays(env);
    return J({ days, lockBefore: payLockDate(days) });
  }
  if (method === 'PUT' && path === '/lock-settings') {
    if (!has(me, 'wage_settings')) return ERR('権限がありません', 403);
    let days = parseInt(body.days, 10);
    if (isNaN(days) || days < 0 || days > 3650) return ERR('日数は0〜3650の範囲で指定してください');
    await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('lock_days',?)").bind(String(days)).run();
    return J({ ok: 1, days, lockBefore: payLockDate(days) });
  }
  // ---- スタッフ登録のプルダウン選択肢(所属課・班)。閲覧は誰でも、追加・削除は管理者のみ ----
  if (method === 'GET' && path === '/option-lists') {
    const rows = (await env.DB.prepare('SELECT * FROM option_lists ORDER BY category, sort_order, value').all()).results;
    const out = { ka: [], han: [] };
    for (const r of rows) if (out[r.category]) out[r.category].push({ id: r.id, value: r.value });
    return J(out);
  }
  if (method === 'POST' && path === '/option-lists') {
    if (!has(me, 'account_manage')) return ERR('権限がありません', 403);
    const category = body.category === 'han' ? 'han' : body.category === 'ka' ? 'ka' : null;
    const value = String(body.value || '').trim();
    if (!category || !value) return ERR('入力してください');
    try { await env.DB.prepare('INSERT INTO option_lists(category,value,sort_order) VALUES(?,?,100)').bind(category, value).run(); }
    catch (e) { return ERR('既に存在します'); }
    return J({ ok: 1 });
  }
  let olm;
  if (method === 'DELETE' && (olm = path.match(/^\/option-lists\/(\d+)$/))) {
    if (!has(me, 'account_manage')) return ERR('権限がありません', 403);
    await env.DB.prepare('DELETE FROM option_lists WHERE id=?').bind(Number(olm[1])).run();
    return J({ ok: 1 });
  }

  if (method === 'POST' && path === '/users') {
    if (!has(me, 'account_manage') && !has(me, 'site_manage')) return ERR('ページが見つかりません', 404);
    const { regno, name, rank = '', han = '', ka = '', station = '', role = 'member', manager_id = null } = body;
    if (!regno || !name) return ERR('登録番号と氏名は必須です');
    const newRole = has(me, 'account_manage') ? (LV[role] != null ? role : 'member') : 'member';
    try {
      await env.DB.prepare('INSERT INTO users(regno,name,rank,han,ka,station,role,manager_id) VALUES(?,?,?,?,?,?,?,?)')
        .bind(String(regno).trim(), name, rank, han, ka, station, newRole, manager_id || null).run();
    } catch { return ERR('この登録番号は既に存在します'); }
    return J({ ok: 1 });
  }
  let mm;
  if ((mm = path.match(/^\/users\/(\d+)$/))) {
    const uid = Number(mm[1]);
    if (method === 'PATCH') {
      if (body.role !== undefined) { // 役割変更
        if (!has(me, 'account_manage')) return ERR('役割の変更には権限が必要です', 403);
        if (LV[body.role] == null) return ERR('不正な役割です');
        await env.DB.prepare('UPDATE users SET role=? WHERE id=?').bind(body.role, uid).run();
      }
      if (body.suspended !== undefined) { // アカウント停止/復活
        if (!has(me, 'account_manage')) return ERR('アカウント停止には権限が必要です', 403);
        const sv = body.suspended ? 1 : 0;
        await env.DB.prepare('UPDATE users SET suspended=? WHERE id=?').bind(sv, uid).run();
        if (sv) await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(uid).run(); // ログイン中なら強制ログアウト
      }
      if (body.skills !== undefined) {
        if (lv(me) < 1) return ERR('権限がありません', 403);
        await env.DB.prepare('UPDATE users SET skills=? WHERE id=?').bind(body.skills, uid).run();
      }
      if (body.manager_id !== undefined) { // 担当手配者の設定
        if (!has(me, 'site_manage') && !has(me, 'account_manage')) return ERR('権限がありません', 403);
        const mid = body.manager_id || null;
        if (mid) { const mgr = await env.DB.prepare('SELECT role FROM users WHERE id=?').bind(mid).first(); if (!mgr || LV[mgr.role] < 2) return ERR('担当手配者は手配担当以上を指定してください'); }
        await env.DB.prepare('UPDATE users SET manager_id=? WHERE id=?').bind(mid, uid).run();
      }
      if (body.notify_rookie !== undefined) { // 新人報告リマインドの個人設定(NULL=基本ルール/1=常に対象/0=常に対象外)
        if (!has(me, 'wage_settings')) return ERR('権限がありません', 403);
        const v = body.notify_rookie === null ? null : (body.notify_rookie ? 1 : 0);
        await env.DB.prepare('UPDATE users SET notify_rookie=? WHERE id=?').bind(v, uid).run();
      }
      for (const f of ['name', 'rank', 'han', 'station', 'ka']) {
        if (body[f] !== undefined) {
          if (!has(me, 'site_manage') && !has(me, 'account_manage')) return ERR('権限がありません', 403);
          await env.DB.prepare(`UPDATE users SET ${f}=? WHERE id=?`).bind(body[f], uid).run();
        }
      }
      return J({ ok: 1 });
    }
    if (method === 'DELETE') {
      if (me.role !== 'admin') return ERR('権限がありません', 403);
      if (uid === me.id) return ERR('自分自身は削除できません');
      await env.DB.prepare('DELETE FROM users WHERE id=?').bind(uid).run();
      await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(uid).run();
      await env.DB.prepare('DELETE FROM schedule WHERE user_id=?').bind(uid).run();
      return J({ ok: 1 });
    }
  }
  if ((mm = path.match(/^\/users\/(\d+)\/resetpw$/)) && method === 'POST') {
    if (me.role !== 'admin') return ERR('権限がありません', 403);
    const uid = Number(mm[1]);
    await env.DB.prepare('UPDATE users SET pass_hash=NULL, salt=NULL WHERE id=?').bind(uid).run();
    await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(uid).run();
    return J({ ok: 1 });
  }

  // ---- スケジュール ----
  if (method === 'GET' && path === '/schedule') {
    const uid = Number(url.searchParams.get('uid')) || me.id;
    const month = url.searchParams.get('month') || jstDate().slice(0, 7);
    if (uid !== me.id && lv(me) < 1) return ERR('ページが見つかりません', 404);
    const target = uid === me.id ? me : await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(uid).first();
    if (!target) return ERR('ユーザーが見つかりません', 404);
    const rows = (await env.DB.prepare("SELECT * FROM schedule WHERE user_id=? AND date LIKE ? ORDER BY date, slot").bind(uid, month + '%').all()).results;
    const canSeePay = has(me, 'site_pay'); // 時間・給与・IN・OUT を閲覧できるか
    const canSeePaidLeave = has(me, 'site_manage'); // 有給は手配者以上のみ閲覧可(本人も含め、それ以外には「休暇」として見せる)
    // 休憩不足の目安(本人 or 管理者のみ計算。現場記録は本人・管理者しか見れないため)
    const canSeeBreak = (uid === me.id) || me.role === 'admin';
    const breakByKey = {};
    if (canSeeBreak) {
      const recs = (await env.DB.prepare("SELECT date, site, breaks FROM site_records WHERE user_id=? AND date LIKE ?").bind(uid, month + '%').all()).results;
      for (const rec of recs) breakByKey[rec.date + '|' + rec.site] = sumBreakMinutes(rec.breaks);
    }
    const entries = {};            // entries[date] = [ {現場1}, {現場2}, ... ]
    for (const r of rows) {
      if (canSeeBreak && r.type === 'work' && r.site) {
        const sMin = toMin(r.tin), eMin = toMin(r.tout);
        let workMin = 0;
        if (sMin != null && eMin != null) { workMin = eMin - sMin; if (workMin < 0) workMin += 1440; }
        const required = requiredBreakMinutes(workMin);
        const taken = breakByKey[r.date + '|' + r.site] || 0;
        r.breakShort = required > 0 && taken < required;
      }
      if (!canSeePay) { r.hours = 0; r.overtime = 0; r.pay = 0; r.tin = ''; r.tout = ''; r.duty = ''; r.load_end = ''; r.show_end = ''; r.multi = 0; }
      if (r.type === 'paid' && !canSeePaidLeave) { r.type = 'off'; r.hours = 0; r.overtime = 0; r.pay = 0; }
      (entries[r.date] ||= []).push(r);
    }
    // 育成計画(人×日)
    const plans = {};
    const prows = (await env.DB.prepare("SELECT date, plan FROM dev_plan WHERE user_id=? AND date LIKE ?").bind(uid, month + '%').all()).results;
    for (const p of prows) plans[p.date] = p.plan;
    const rookies = (await env.DB.prepare("SELECT candidate_name,next_site,next_date FROM reports WHERE next_date LIKE ? AND next_site!=''").bind(month + '%').all()).results;
    return J({ user: pub(target), entries, plans, rookies, canSeePay });
  }

  // 一括登録:同じ現場を、メンバーごとに指定した日付・備考で登録(既存予定は残して追加)
  if (method === 'PUT' && path === '/schedule-bulk') {
    if (!handlerMode) return ERR('手配者モードでのみ編集できます', 403);
    const site = (body.site || '').trim();
    if (!site) return ERR('現場名を入力してください');
    const tin = body.tin || '', tout = body.tout || '', venue = body.venue || '';
    const duty = body.duty || '', load_end = body.load_end || '', show_end = body.show_end || '', multi = body.multi ? 1 : 0;
    const resolve = await loadWageResolver(env);
    const payOverride = (body.pay !== '' && body.pay != null && !isNaN(Number(body.pay))) ? Math.round(Number(body.pay)) : null;

    // assignments: [{uid, dates:[...], note}] 形式。なければ従来の uids×dates 形式から組み立てる
    let assignments = [];
    if (Array.isArray(body.assignments)) {
      assignments = body.assignments
        .map(a => ({ uid: Number(a.uid), dates: (a.dates || []).filter(Boolean), note: a.note || '' }))
        .filter(a => a.uid && a.dates.length);
    } else {
      const uids = Array.isArray(body.uids) ? body.uids.map(Number).filter(Boolean) : [];
      const dates = Array.isArray(body.dates) ? body.dates.filter(Boolean) : [];
      assignments = uids.map(uid => ({ uid, dates, note: body.note || '' }));
    }
    if (!assignments.length) return ERR('対象メンバーと日付を選んでください');

    let added = 0, skipped = 0;
    const conflicts = [];
    const nameCache = {};
    const lockDays = await getLockDays(env);
    const ts = jstTs();
    const notifyTargets = new Set(); // 手配チーム通知の対象(uid)を、変更があった人だけ集めて最後にまとめて送る
    for (const a of assignments) {
      if (!(a.uid in nameCache)) { const u = await env.DB.prepare('SELECT name, rank, manager_id FROM users WHERE id=?').bind(a.uid).first(); nameCache[a.uid] = u ? { name: u.name, rank: u.rank, managerId: u.manager_id } : { name: '', rank: '', managerId: null }; }
      const uname = nameCache[a.uid].name;
      for (const date of a.dates) {
        if (isLocked(date, me, lockDays)) { skipped++; continue; } // 給与確定済みは編集不可(管理者は除く)
        const before = (await env.DB.prepare('SELECT * FROM schedule WHERE user_id=? AND date=? ORDER BY slot').bind(a.uid, date).all()).results;
        if (before.some(b => b.site === site)) { skipped++; continue; } // 同一現場は無害なので静かにスキップ
        // IN/OUTが既存の現場と重なるか
        const ov = before.find(b => (b.type === 'work' || b.type === 'paid') && rangesOverlap(tin, tout, b.tin, b.tout));
        if (ov) {
          conflicts.push({ name: uname, date, level: 'block', kind: 'overlap', a: site, b: ov.site || '(現場名なし)', atime: `${tin || '?'}-${tout || '?'}`, btime: `${ov.tin || '?'}-${ov.tout || '?'}` });
          if (!body.force) { skipped++; continue; }            // 強行でなければ保存しない
        } else {
          const others = before.filter(b => b.type === 'work' && b.site).map(b => b.site);
          if (others.length) conflicts.push({ name: uname, date, level: 'warn', kind: 'multi', count: others.length + 1, sites: [...others, site] });
        }
        const c = calcPay({ rank: nameCache[a.uid].rank, date, tin, tout, duty, loadEnd: load_end, showEnd: show_end, multi }, resolve);
        const pay = payOverride != null ? payOverride : c.pay;
        const slot = before.length;
        await env.DB.prepare('INSERT INTO schedule(user_id,date,slot,type,site,venue,tin,tout,hours,overtime,pay,note,duty,load_end,show_end,multi) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .bind(a.uid, date, slot, 'work', site, venue, tin, tout, c.hours, c.overtime, pay, withAuthor(a.note, me.name), duty, load_end, show_end, multi).run();
        added++;
        const after = (await env.DB.prepare('SELECT * FROM schedule WHERE user_id=? AND date=? ORDER BY slot').bind(a.uid, date).all()).results;
        await env.DB.prepare('INSERT INTO schedule_history(ts,editor_id,target_id,date,before_json,after_json) VALUES(?,?,?,?,?,?)')
          .bind(ts, me.id, a.uid, date, JSON.stringify(before.map(stripRow)), JSON.stringify(after.map(stripRow))).run();
        const rs = (await env.DB.prepare("SELECT * FROM reports WHERE next_date=? AND next_site=?").bind(date, site).all()).results;
        for (const r of rs) await notify(env, [a.uid], 'rookie', `🔰 ${r.next_date} ${r.next_site} に新人「${r.candidate_name}」が入る予定です`);
        // 手配チーム通知: 対象者の手配担当が自分以外なら、担当へ「更新しました」と知らせる(本人による自己更新は対象外)
        const managerId = nameCache[a.uid].managerId;
        if (managerId && Number(managerId) !== me.id && Number(managerId) !== Number(a.uid)) notifyTargets.add(a.uid);
      }
    }
    for (const uid of notifyTargets) {
      const managerId = nameCache[uid].managerId;
      await notify(env, [Number(managerId)], 'team_sched',
        `📅 ${me.name}さんが${nameCache[uid].name}さんの${site}のスケジュールを更新しました。`,
        `#/schedule/${uid}`);
    }
    return J({ ok: 1, added, skipped, conflicts });
  }

  // 現場の既存メンバーを一括編集(IN/OUT/会場をまとめて更新、対象外を削除)
  if (method === 'PUT' && path === '/site-edit') {
    if (!handlerMode) return ERR('手配者モードでのみ編集できます', 403);
    const site = (body.site || '').trim();
    const date = body.date;
    if (!site || !date) return ERR('不正なリクエストです');
    const venue = (body.venue || '').trim();
    const newSite = (body.newSite || '').trim();
    const tin = (body.tin || '').trim(), tout = (body.tout || '').trim();
    const removeUids = Array.isArray(body.removeUids) ? body.removeUids.map(Number).filter(Boolean) : [];
    const keepUids = Array.isArray(body.keepUids) ? body.keepUids.map(Number).filter(Boolean) : [];
    const ts = jstTs();
    let updated = 0, removed = 0;
    if (isLocked(date, me, await getLockDays(env))) return ERR('給与確定済みのため編集できません（確定期間を過ぎています）', 409);
    const resolve = await loadWageResolver(env);
    // 削除対象
    for (const uid of removeUids) {
      const before = (await env.DB.prepare('SELECT * FROM schedule WHERE user_id=? AND date=? ORDER BY slot').bind(uid, date).all()).results;
      if (!before.some(b => b.site === site)) continue;
      await env.DB.prepare("DELETE FROM schedule WHERE user_id=? AND date=? AND site=?").bind(uid, date, site).run();
      const after = (await env.DB.prepare('SELECT * FROM schedule WHERE user_id=? AND date=? ORDER BY slot').bind(uid, date).all()).results;
      await env.DB.prepare('INSERT INTO schedule_history(ts,editor_id,target_id,date,before_json,after_json) VALUES(?,?,?,?,?,?)')
        .bind(ts, me.id, uid, date, JSON.stringify(before.map(stripRow)), JSON.stringify(after.map(stripRow))).run();
      removed++;
    }
    const rankCache = {};
    // 更新対象(keep)。空欄項目は据え置き。
    for (const uid of keepUids) {
      if (!(uid in rankCache)) { const u = await env.DB.prepare('SELECT rank FROM users WHERE id=?').bind(uid).first(); rankCache[uid] = u ? u.rank : ''; }
      const rows = (await env.DB.prepare("SELECT * FROM schedule WHERE user_id=? AND date=? AND site=?").bind(uid, date, site).all()).results;
      for (const r of rows) {
        const nSite = newSite || r.site;
        const nVenue = venue || r.venue;
        const nTin = tin || r.tin, nTout = tout || r.tout;
        let hours = r.hours, overtime = r.overtime, pay = r.pay;
        if (nTin && nTout) { const c = calcPay({ rank: rankCache[uid], date, tin: nTin, tout: nTout, duty: r.duty, loadEnd: r.load_end, showEnd: r.show_end, multi: r.multi }, resolve); if (c) ({ hours, overtime, pay } = c); }
        await env.DB.prepare("UPDATE schedule SET site=?, venue=?, tin=?, tout=?, hours=?, overtime=?, pay=? WHERE id=?")
          .bind(nSite, nVenue, nTin, nTout, hours, overtime, pay, r.id).run();
        updated++;
      }
    }
    // 手配チーム通知: 更新・削除された対象者の手配担当が自分以外なら知らせる(本人による自己更新は対象外)
    const touchedUids = [...new Set([...removeUids, ...keepUids])];
    if (touchedUids.length) {
      const ph = touchedUids.map(() => '?').join(',');
      const tgtUsers = (await env.DB.prepare(`SELECT id, name, manager_id FROM users WHERE id IN (${ph})`).bind(...touchedUids).all()).results;
      for (const u of tgtUsers) {
        if (u.manager_id && Number(u.manager_id) !== me.id && Number(u.manager_id) !== u.id) {
          await notify(env, [Number(u.manager_id)], 'team_sched',
            `📅 ${me.name}さんが${u.name}さんの${site}のスケジュールを更新しました。`,
            `#/schedule/${u.id}`);
        }
      }
    }
    return J({ ok: 1, updated, removed });
  }

  // 個人スケジュール保存(手配者モード)。1日まるごと置換。保存前にコンフリクト検知
  if (method === 'PUT' && path === '/schedule') {
    if (!handlerMode) return ERR('手配者モードでのみ編集できます', 403);
    const { uid } = body;
    if (!uid) return ERR('不正なリクエストです');
    const ts = jstTs();
    // 受け取り形式を統一: byDate[date] = [ {type,site,...}, ... ]
    const byDate = {};
    if (Array.isArray(body.slots) && body.date) {
      byDate[body.date] = body.slots;                    // 単日・複数現場
    } else if (Array.isArray(body.entries)) {
      for (const e of body.entries) {                    // 従来形式(1行=1日 or 同日複数行)
        if (!e.date) continue;
        (byDate[e.date] ||= []).push(e);
      }
    } else return ERR('不正なリクエストです');

    // --- コンフリクト検知(同日二重現場 / IN・OUT重複) ---
    const tgt = await env.DB.prepare('SELECT name, rank, manager_id FROM users WHERE id=?').bind(uid).first();
    const tname = tgt ? tgt.name : '';
    const trank = tgt ? tgt.rank : '';
    const resolve = await loadWageResolver(env);
    // 給与確定(現場日から2週間)済みの日付は編集不可
    const lockDays = await getLockDays(env);
    const lockedDates = Object.keys(byDate).filter(d => isLocked(d, me, lockDays));
    if (lockedDates.length) return ERR('給与確定済みのため編集できません（現場日から2週間経過）: ' + lockedDates.join(', '), 409);
    const allConflicts = [];
    for (const date of Object.keys(byDate)) {
      const work = byDate[date].filter(e => (e.type === 'work' || e.type === 'paid') && (e.site || e.tin || e.tout));
      allConflicts.push(...dayConflicts(work, { name: tname, date }));
    }
    // block(ダブルブッキング)があり、強行フラグが無ければ保存せず返す
    if (allConflicts.some(c => c.level === 'block') && !body.force) {
      return J({ ok: 0, conflicts: allConflicts });
    }

    let anyChanged = false, changedSite = '';
    for (const date of Object.keys(byDate)) {
      const before = (await env.DB.prepare('SELECT * FROM schedule WHERE user_id=? AND date=? ORDER BY slot').bind(uid, date).all()).results;
      // 有効な行(typeあり)だけ残す
      const slots = byDate[date].filter(e => e.type);
      // いったん当日を全削除して入れ直す(slotを振り直す)
      await env.DB.prepare('DELETE FROM schedule WHERE user_id=? AND date=?').bind(uid, date).run();
      const saved = [];
      let slot = 0;
      for (const e of slots) {
        let hours = 0, overtime = 0, pay = 0;
        if (e.type === 'work' || e.type === 'paid') {
          const c = calcPay({ rank: trank, date, tin: e.tin, tout: e.tout, duty: e.duty, loadEnd: e.load_end, showEnd: e.show_end, multi: e.multi ? 1 : 0 }, resolve);
          if (c) ({ hours, overtime, pay } = c);
        }
        if (e.pay !== '' && e.pay != null && !isNaN(Number(e.pay))) pay = Math.round(Number(e.pay));
        const row = { user_id: uid, date, slot, type: e.type, site: e.site || '', venue: e.venue || '', tin: e.tin || '', tout: e.tout || '', hours, overtime, pay, note: withAuthor(e.note, me.name), duty: e.duty || '', load_end: e.load_end || '', show_end: e.show_end || '', multi: e.multi ? 1 : 0 };
        await env.DB.prepare('INSERT INTO schedule(user_id,date,slot,type,site,venue,tin,tout,hours,overtime,pay,note,duty,load_end,show_end,multi) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .bind(uid, date, slot, row.type, row.site, row.venue, row.tin, row.tout, hours, overtime, pay, row.note, row.duty, row.load_end, row.show_end, row.multi).run();
        saved.push(row); slot++;
        // 新人の次回現場と一致したら本人へ通知
        if (row.type === 'work' && row.site) {
          const rs = (await env.DB.prepare("SELECT * FROM reports WHERE next_date=? AND next_site=?").bind(date, row.site).all()).results;
          for (const r of rs) await notify(env, [uid], 'rookie', `🔰 ${r.next_date} ${r.next_site} に新人「${r.candidate_name}」が入る予定です`);
          if (!changedSite) changedSite = row.site;
        }
      }
      // 変更があったら履歴に1件残す(当日まるごと before→after)
      const beforeJson = JSON.stringify(before.map(stripRow));
      const afterJson = JSON.stringify(saved.map(stripRow));
      if (beforeJson !== afterJson) {
        anyChanged = true;
        await env.DB.prepare('INSERT INTO schedule_history(ts,editor_id,target_id,date,before_json,after_json) VALUES(?,?,?,?,?,?)')
          .bind(ts, me.id, uid, date, beforeJson, afterJson).run();
      }
    }
    // 手配チーム通知: 対象者の手配担当が自分以外なら知らせる(本人による自己更新は対象外)
    if (anyChanged && tgt && tgt.manager_id && Number(tgt.manager_id) !== me.id && Number(tgt.manager_id) !== Number(uid)) {
      await notify(env, [Number(tgt.manager_id)], 'team_sched',
        `📅 ${me.name}さんが${tname}さんの${changedSite ? changedSite + 'の' : ''}スケジュールを更新しました。`,
        `#/schedule/${uid}`);
    }
    return J({ ok: 1, conflicts: allConflicts.filter(c => c.level === 'warn') });
  }

  // 育成計画のみ編集(チーフ以上。手配者モード不要)。dev_planテーブル(人×日)
  if (method === 'PUT' && path === '/schedule-plan') {
    if (lv(me) < 1) return ERR('ページが見つかりません', 404);
    const { uid, date } = body;
    const plan = withAuthor(body.plan, me.name);
    if (!uid || !date) return ERR('不正なリクエストです');
    const cur = await env.DB.prepare('SELECT plan FROM dev_plan WHERE user_id=? AND date=?').bind(uid, date).first();
    const beforePlan = cur ? cur.plan : '';
    if (String(beforePlan) === String(plan || '')) return J({ ok: 1 });
    await env.DB.prepare('INSERT INTO dev_plan(user_id,date,plan) VALUES(?,?,?) ON CONFLICT(user_id,date) DO UPDATE SET plan=excluded.plan')
      .bind(uid, date, plan || '').run();
    await env.DB.prepare('INSERT INTO schedule_history(ts,editor_id,target_id,date,before_json,after_json) VALUES(?,?,?,?,?,?)')
      .bind(jstTs(), me.id, uid, date, JSON.stringify({ plan: beforePlan }), JSON.stringify({ plan: plan || '' })).run();
    // 育成計画が新しく書かれたら、本人へ通知(自分自身が書いた場合は通知しない)
    if (Number(uid) !== me.id && (plan || '').trim() && !(beforePlan || '').trim()) {
      try {
        const tgt = await env.DB.prepare('SELECT name FROM users WHERE id=?').bind(uid).first();
        const siteRow = await env.DB.prepare("SELECT site FROM schedule WHERE user_id=? AND date=? AND type='work' AND site!='' LIMIT 1").bind(uid, date).first();
        const label = `${date} ${tgt ? tgt.name : ''}${siteRow ? '＠' + siteRow.site : ''}`;
        await notify(env, [Number(uid)], 'plan',
          `📘 ${label}に育成計画が追加されました。(${me.name})`,
          `#/schedule/${uid}?month=${date.slice(0, 7)}`);
      } catch (e) {}
    }
    return J({ ok: 1 });
  }

  // ---- 本人による現場変更の報告 ----
  // 手配担当者以外(他のチーフ・手配者など)から直接「現場が変わった」と言われた場合に、
  // 本人がその場で自分のスケジュールへ反映できる。時刻・給与などの詳細は入れず、
  // 現場名/会場名(または休暇)だけを記録する。
  // メンツ(役割が最下位)は手配担当者の承認を経てから反映、チーフ以上は承認不要で即時反映。
  if (method === 'POST' && path === '/schedule-self-report') {
    const date = String(body.date || '').trim();
    const toldBy = String(body.toldBy || '').trim();
    const type = body.type === 'off' ? 'off' : 'work';
    const site = String(body.site || '').trim();
    const venue = String(body.venue || '').trim();
    if (!date) return ERR('現場日を入力してください');
    if (!toldBy) return ERR('誰から言われたかを入力してください');
    if (type === 'work' && !site && !venue) return ERR('現場名か会場名のいずれかを入力してください');

    const uid = me.id;
    const label = type === 'off' ? '休暇' : [site, venue].filter(Boolean).join('／');

    if (lv(me) < 1) {
      // メンツ: 承認が必要。self_reportsにpendingとして保存し、手配担当者に承認依頼を通知する
      await env.DB.prepare(
        'INSERT INTO self_reports(user_id,date,told_by,type,site,venue,status,created_at) VALUES(?,?,?,?,?,?,?,?)'
      ).bind(uid, date, toldBy, type, site, venue, 'pending', jstTs()).run();
      const msg = `📝 ${me.name}さんから、${date}のスケジュールを「${label}」に変更したいと報告がありました。(伝えた人: ${toldBy}) 承認をお願いします。`;
      try {
        if (me.manager_id) await notify(env, [Number(me.manager_id)], 'self_report', msg, '#/self-reports');
        else {
          const admins = (await env.DB.prepare("SELECT id FROM users WHERE role='admin' AND COALESCE(suspended,0)=0").all()).results;
          if (admins.length) await notify(env, admins.map(a => a.id), 'self_report', msg, '#/self-reports');
        }
      } catch (e) {}
      return J({ ok: 1, needsApproval: true });
    }

    // チーフ以上: 承認不要で即時反映(詳細な時刻・業務名などはここでは入れず、後で手配担当者が編集できる)
    await applySelfReportToSchedule(env, uid, date, toldBy, { type, site, venue });
    const msg2 = `📢 ${me.name}さんから、${date}のスケジュールが「${label}」に変更されたと報告がありました。(伝えた人: ${toldBy})`;
    const link2 = `#/schedule/${uid}?month=${date.slice(0, 7)}`;
    try {
      if (me.manager_id) await notify(env, [Number(me.manager_id)], 'self_report', msg2, link2);
      else {
        const admins = (await env.DB.prepare("SELECT id FROM users WHERE role='admin' AND COALESCE(suspended,0)=0").all()).results;
        if (admins.length) await notify(env, admins.map(a => a.id), 'self_report', msg2, link2);
      }
    } catch (e) {}
    return J({ ok: 1, needsApproval: false });
  }

  // 承認待ちの現場変更報告一覧(自分が手配担当している人からの分。管理者は全員分)
  if (method === 'GET' && path === '/self-reports') {
    if (lv(me) < 1) return ERR('ページが見つかりません', 404);
    const rows = me.role === 'admin'
      ? (await env.DB.prepare(
          `SELECT sr.*, u.name AS user_name, u.regno AS user_regno FROM self_reports sr JOIN users u ON u.id=sr.user_id WHERE sr.status='pending' ORDER BY sr.created_at DESC`
        ).all()).results
      : (await env.DB.prepare(
          `SELECT sr.*, u.name AS user_name, u.regno AS user_regno FROM self_reports sr JOIN users u ON u.id=sr.user_id WHERE sr.status='pending' AND u.manager_id=? ORDER BY sr.created_at DESC`
        ).bind(me.id).all()).results;
    return J(rows);
  }
  let srm;
  if (method === 'POST' && (srm = path.match(/^\/self-reports\/(\d+)\/approve$/))) {
    if (!handlerMode && me.role !== 'admin') return ERR('手配者モードでのみ操作できます', 403);
    const id = Number(srm[1]);
    const rep = await env.DB.prepare('SELECT * FROM self_reports WHERE id=?').bind(id).first();
    if (!rep) return ERR('見つかりません', 404);
    if (rep.status !== 'pending') return ERR('すでに処理されています');
    const tgt = await env.DB.prepare('SELECT manager_id FROM users WHERE id=?').bind(rep.user_id).first();
    if (me.role !== 'admin' && String(tgt ? tgt.manager_id : '') !== String(me.id)) return ERR('権限がありません', 403);
    // 承認時に、通常の現場入力と同じ項目(現場名・会場名・時刻・業務名など)を指定できる。
    // 指定がなければ報告内容(現場名/会場名)のみで反映される。
    const detail = rep.type === 'off'
      ? { type: 'off' }
      : {
          type: 'work',
          site: String(body.site ?? rep.site ?? '').trim(),
          venue: String(body.venue ?? rep.venue ?? '').trim(),
          tin: String(body.tin || '').trim(),
          tout: String(body.tout || '').trim(),
          duty: String(body.duty || '').trim(),
          load_end: String(body.load_end || '').trim(),
          show_end: String(body.show_end || '').trim(),
          multi: body.multi ? 1 : 0,
          note: String(body.note || '').trim(),
        };
    await applySelfReportToSchedule(env, rep.user_id, rep.date, rep.told_by, detail);
    await env.DB.prepare('UPDATE self_reports SET status=?, decided_at=?, decided_by=? WHERE id=?').bind('approved', jstTs(), me.id, id).run();
    const label = rep.type === 'off' ? '休暇' : [detail.site, detail.venue].filter(Boolean).join('／');
    try {
      await notify(env, [rep.user_id], 'self_report',
        `✅ ${rep.date}の「${label}」への変更報告が承認され、スケジュールに反映されました。`,
        `#/schedule/${rep.user_id}?month=${rep.date.slice(0, 7)}`);
    } catch (e) {}
    return J({ ok: 1 });
  }
  if (method === 'POST' && (srm = path.match(/^\/self-reports\/(\d+)\/reject$/))) {
    if (!handlerMode && me.role !== 'admin') return ERR('手配者モードでのみ操作できます', 403);
    const id = Number(srm[1]);
    const rep = await env.DB.prepare('SELECT * FROM self_reports WHERE id=?').bind(id).first();
    if (!rep) return ERR('見つかりません', 404);
    if (rep.status !== 'pending') return ERR('すでに処理されています');
    const tgt = await env.DB.prepare('SELECT manager_id FROM users WHERE id=?').bind(rep.user_id).first();
    if (me.role !== 'admin' && String(tgt ? tgt.manager_id : '') !== String(me.id)) return ERR('権限がありません', 403);
    await env.DB.prepare('UPDATE self_reports SET status=?, decided_at=?, decided_by=? WHERE id=?').bind('rejected', jstTs(), me.id, id).run();
    const label = rep.type === 'off' ? '休暇' : [rep.site, rep.venue].filter(Boolean).join('／');
    try {
      await notify(env, [rep.user_id], 'self_report',
        `❌ ${rep.date}の「${label}」への変更報告は見送られました。手配担当者に確認してください。`,
        `#/schedule/${rep.user_id}?month=${rep.date.slice(0, 7)}`);
    } catch (e) {}
    return J({ ok: 1 });
  }

  // ---- 現場記録(配置・休憩時間・自由記入欄)。閲覧・編集は本人と管理者のみ ----
  // 対象の現場での自分の記録を取得。育成計画・備考(scheduleのnote)もあわせて返す。
  if (method === 'GET' && path === '/site-record') {
    const uid = Number(url.searchParams.get('uid'));
    const date = url.searchParams.get('date');
    const site = url.searchParams.get('site');
    if (!uid || !date || !site) return ERR('不正なリクエストです');
    if (uid !== me.id && me.role !== 'admin') return ERR('権限がありません', 403);
    const rec = await env.DB.prepare('SELECT * FROM site_records WHERE user_id=? AND date=? AND site=?').bind(uid, date, site).first();
    const schedRow = await env.DB.prepare("SELECT note FROM schedule WHERE user_id=? AND date=? AND site=? AND type='work' LIMIT 1").bind(uid, date, site).first();
    const planRow = await env.DB.prepare('SELECT plan FROM dev_plan WHERE user_id=? AND date=?').bind(uid, date).first();
    return J({
      placement: rec ? rec.placement : '',
      breaks: rec ? JSON.parse(rec.breaks || '[]') : [],
      memo: rec ? rec.memo : '',
      breakMinutes: rec ? sumBreakMinutes(rec.breaks) : 0,
      note: schedRow ? schedRow.note : '',
      plan: planRow ? planRow.plan : '',
    });
  }
  if (method === 'PUT' && path === '/site-record') {
    const uid = Number(body.uid);
    const date = body.date, site = body.site;
    if (!uid || !date || !site) return ERR('不正なリクエストです');
    if (uid !== me.id && me.role !== 'admin') return ERR('権限がありません', 403);
    const placement = String(body.placement || '').slice(0, 2000);
    const memo = String(body.memo || ''); // 自由記入欄は文字数制限なし
    const breaks = Array.isArray(body.breaks)
      ? body.breaks.filter(b => b && (b.start || b.end)).map(b => ({ start: String(b.start || '').trim(), end: String(b.end || '').trim() }))
      : [];
    await env.DB.prepare(
      `INSERT INTO site_records(user_id,date,site,placement,breaks,memo,updated_at) VALUES(?,?,?,?,?,?,?)
       ON CONFLICT(user_id,date,site) DO UPDATE SET placement=excluded.placement, breaks=excluded.breaks, memo=excluded.memo, updated_at=excluded.updated_at`
    ).bind(uid, date, site, placement, JSON.stringify(breaks), memo, jstTs()).run();
    return J({ ok: 1 });
  }
  // 現場一覧用: その現場日の全員分の休憩時間合計(チーフ以上のみ)。勤務時間との対比で不足の目安も返す。
  if (method === 'GET' && path === '/site-record-breaks') {
    if (lv(me) < 1) return ERR('ページが見つかりません', 404);
    const date = url.searchParams.get('date');
    const site = url.searchParams.get('site');
    if (!date || !site) return ERR('不正なリクエストです');
    const recs = (await env.DB.prepare('SELECT user_id, breaks FROM site_records WHERE date=? AND site=?').bind(date, site).all()).results;
    const schedRows = (await env.DB.prepare("SELECT user_id, tin, tout FROM schedule WHERE date=? AND site=? AND type='work'").bind(date, site).all()).results;
    const breakByUid = {}; for (const r of recs) breakByUid[r.user_id] = sumBreakMinutes(r.breaks);
    const out = schedRows.map(s => {
      let workMin = 0;
      const sIn = toMin(s.tin), sOut = toMin(s.tout);
      if (sIn != null && sOut != null) { workMin = sOut - sIn; if (workMin < 0) workMin += 1440; }
      const taken = breakByUid[s.user_id] || 0;
      const required = requiredBreakMinutes(workMin);
      return { uid: s.user_id, workMinutes: workMin, breakMinutes: taken, requiredMinutes: required, short: required > 0 && taken < required };
    });
    return J(out);
  }

  // 現場一覧(チーフ以上)。現場名×日付ごとに人数・会場をまとめる。month指定可
  if (method === 'GET' && path === '/sites') {
    if (lv(me) < 1) return ERR('ページが見つかりません', 404);
    const month = url.searchParams.get('month') || jstDate().slice(0, 7);
    const rows = (await env.DB.prepare(
      "SELECT date, site, venue, COUNT(*) AS cnt FROM schedule WHERE type='work' AND site<>'' AND date LIKE ? GROUP BY date, site, venue ORDER BY date, site"
    ).bind(month + '%').all()).results;
    return J(rows);
  }

  if (method === 'GET' && path === '/site-members') {
    const date = url.searchParams.get('date'), site = url.searchParams.get('site');
    const rows = (await env.DB.prepare(
      "SELECT u.id as uid,u.name,u.role,u.rank,u.ka,u.han,u.station,s.venue,s.tin,s.tout,s.note FROM schedule s JOIN users u ON u.id=s.user_id WHERE s.date=? AND s.site=? AND s.type='work' ORDER BY CASE u.role WHEN 'admin' THEN 0 WHEN 'handler' THEN 1 WHEN 'chief' THEN 2 ELSE 3 END, u.regno"
    ).bind(date, site).all()).results;
    if (!has(me, 'site_pay')) for (const r of rows) { r.tin = ''; r.tout = ''; } // IN/OUTを表示できるか
    return J(rows);
  }

  // ---- 稼働サマリー(チーフ以上)。月間の出勤日数・現場数・最長連勤・手配偏りを集計 ----
  if (method === 'GET' && path === '/summary') {
    if (lv(me) < 1) return ERR('ページが見つかりません', 404);
    const month = url.searchParams.get('month') || jstDate().slice(0, 7);
    const rows = (await env.DB.prepare(
      "SELECT user_id, date, hours, overtime FROM schedule WHERE type='work' AND site<>'' AND date LIKE ? ORDER BY user_id, date"
    ).bind(month + '%').all()).results;
    const users = (await env.DB.prepare('SELECT id,name,regno,role,rank,han,ka,manager_id FROM users ORDER BY regno').all()).results;
    const umap = {}; for (const u of users) umap[u.id] = u;
    const agg = {};
    for (const r of rows) {
      const a = agg[r.user_id] ||= { dates: [], shifts: 0, hours: 0, overtime: 0 };
      a.dates.push(r.date); a.shifts++; a.hours += r.hours || 0; a.overtime += r.overtime || 0;
    }
    const canPay = has(me, 'site_pay'); // 時間・残業を閲覧できるか
    // 手配担当未設定はチーフ手配(課)として扱う
    const chiefLabel = u => `チーフ手配(${u.ka || '未設定'})`;
    const items = users.map(u => {
      const a = agg[u.id] || { dates: [], shifts: 0, hours: 0, overtime: 0 };
      return {
        uid: u.id, name: u.name, regno: u.regno, role: u.role, rank: u.rank, han: u.han, ka: u.ka || '',
        manager_id: u.manager_id,
        manager_name: u.manager_id && umap[u.manager_id] ? umap[u.manager_id].name : chiefLabel(u),
        workDays: new Set(a.dates).size,
        shifts: a.shifts,
        maxStreak: longestStreak(a.dates),
        hours: canPay ? Math.round(a.hours * 10) / 10 : null,
        overtime: canPay ? Math.round(a.overtime * 10) / 10 : null
      };
    });
    // 手配担当ごとの偏り(担当未設定はチーフ手配(課)単位でまとめる)
    const byMgr = {};
    for (const it of items) {
      const k = it.manager_id ? 'm' + it.manager_id : 'chief:' + (it.ka || '未設定');
      const g = byMgr[k] ||= { key: k, manager_id: it.manager_id || null, name: it.manager_name, members: 0, activeMembers: 0, workDays: 0, shifts: 0 };
      g.members++; g.workDays += it.workDays; g.shifts += it.shifts; if (it.workDays > 0) g.activeMembers++;
    }
    const managers = Object.values(byMgr).sort((x, y) => y.shifts - x.shifts);
    return J({ month, items, managers });
  }

  // ---- スプレッドシートURLから取り込み(手配担当以上)----
  // body: { urls:[...], format:'auto'|'C'|'AB', month:'2026-06'(AB用), add:bool, save:bool }
  if (method === 'POST' && path === '/import-from-url') {
    if (!has(me, 'import_data')) return ERR('ページが見つかりません', 404);
    const urls = Array.isArray(body.urls) ? body.urls : (body.url ? [body.url] : []);
    if (!urls.length) return ERR('URLが指定されていません');
    const month = body.month || jstDate().slice(0, 7);
    // 自動検出(数式キャッシュ等)に失敗した場合の最終フォールバック日付。ユーザーが画面で指定できる。
    const userDate = body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : '';
    const mode = body.add ? 'add' : 'replace-person-day';
    const results = [];
    const urlMeta = {}; // url -> { sheetTitle, targetDate } (保存済みURL一覧の表示用)
    for (const rawUrl of urls) {
      const meta = parseSheetUrl(rawUrl);
      if (!meta) { results.push({ url: rawUrl, ok: false, error: 'URLの形式が正しくありません' }); continue; }

      // まず xlsx 一括取得で全シート(タブ)を読む。失敗したら単一CSVにフォールバック。
      let sheets = null, fellBack = false, rawXlsx = null, xlsxError = '', fileDate = userDate, sheetFileTitle = '';
      try {
        const got = await fetchXlsxSheets(meta.id);
        sheets = got.sheets; rawXlsx = got.raw; sheetFileTitle = got.fileTitle || '';
        // ファイル名(例:「6/30(火)_BP現場台帳」)から日付を抽出。個々のブロックに日付が無い場合の予備として使う。
        // ユーザーが対象日を明示指定していなければ、これを優先的に使う。
        if (!userDate && got.fileTitle) { const fd = normSheetDate(got.fileTitle, jstDate().slice(0, 7)); if (fd && /^\d{4}-\d{2}-\d{2}$/.test(fd)) fileDate = fd; }
      } catch (e) {
        fellBack = true; xlsxError = e.message;
        try {
          const resp = await fetch(csvExportUrl(meta.id, meta.gid), { redirect: 'follow', headers: GSHEET_FETCH_HEADERS });
          if (!resp.ok) { results.push({ url: rawUrl, ok: false, error: `取得失敗(HTTP ${resp.status})。シートを「リンクを知る全員が閲覧可」にしてください` }); continue; }
          const csv = await resp.text();
          if (/<html/i.test(csv.slice(0, 200))) { results.push({ url: rawUrl, ok: false, error: 'シートが非公開の可能性があります(「リンクを知る全員が閲覧可」に設定してください)' }); continue; }
          sheets = [{ name: '(単一シート)', grid: parseCsv(csv) }];
        } catch (e2) { results.push({ url: rawUrl, ok: false, error: '取得エラー: ' + e2.message }); continue; }
      }

      // 各シートを解析して1つにまとめる。シート名では判定せず、実際に登録番号の列を持つ
      // (=社員データの表である)シートだけが結果的に件数を持つので、それ以外は自動的に0件になる。
      // 1シートずつtry-catchし、あるシートの解析でエラーが起きても他のシート(最大20枚程度)の
      // 取り込みが巻き添えにならないようにする(1シートあたり数百行になることもあるため)。
      let allRows = [];
      const sheetReport = [];
      for (const sh of sheets) {
        const nm = sh.name || '';
        const grid = sh.grid;
        if (!grid || !grid.length) { sheetReport.push({ name: nm, count: 0, note: '空シート' }); continue; }
        try {
          const fmt = body.format && body.format !== 'auto' ? body.format : detectFormat(grid);
          let parsed;
          if (fmt === 'C') parsed = parseFormatC(grid, body.cfg, fileDate).rows;
          else parsed = parseFormatAB(grid, month, body.cfg).rows;
          if (parsed && parsed.length) { allRows = allRows.concat(parsed); sheetReport.push({ name: nm, count: parsed.length }); }
          else sheetReport.push({ name: nm, count: 0 });
        } catch (e) {
          sheetReport.push({ name: nm, count: 0, note: `解析エラー: ${e.message}` });
        }
      }

      if (!allRows.length) {
        const detail = sheetReport.length ? `(読み込んだシート: ${sheetReport.map(s => `${s.name}=${s.count}件`).join(', ')})` : '(シートが1枚も読めませんでした)';
        const xerr = fellBack && xlsxError ? ` / 全シート取得エラー: ${xlsxError}` : '';
        results.push({ url: rawUrl, ok: false, error: `取り込めるデータが見つかりませんでした ${detail}${xerr}`, sheets: sheetReport, mode: fellBack ? '単一シート(全タブ取得に失敗)' : '全シート' });
        continue;
      }
      const r = await applyImportRows(env, allRows, me.id, mode, 'スプレッドシートURL');
      // 台帳に登場しない人を休暇にする処理は、複数ファイル(URL)を横断して判定する必要があるため、
      // ここ(手動取り込み・1URLごと)では行わず、夜間の自動再取り込み(cronDaichoReload)でのみ実行する。
      urlMeta[rawUrl] = { sheetTitle: sheetFileTitle || '', targetDate: fileDate || '' };

      // 監査・証拠用に、取り込んだ元Excel(xlsx)をR2へ保管しインデックスを記録する。
      let archived = false, archiveError = '';
      if (rawXlsx && env.DAICHO) {
        try {
          const ts = jstTs();
          const r2key = `daicho/${ts.replace(/[: ]/g, '-')}_${meta.id}.xlsx`;
          await env.DAICHO.put(r2key, rawXlsx, {
            httpMetadata: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
          });
          // 実際のスプレッドシート名(例:「6/30(火)_BP現場台帳」)が取れていればそれを使う。
          // 取れない場合は従来通り日時+ファイルIDで自動生成。
          const safeTitle = sheetFileTitle ? sheetFileTitle.replace(/[\\/:*?"<>|]/g, '_').trim() : '';
          const fname = safeTitle ? `${safeTitle}.xlsx` : `台帳_${ts.slice(0, 10)}_${meta.id.slice(0, 8)}.xlsx`;
          await env.DB.prepare(
            'INSERT INTO daicho_archive(ts,importer_id,importer_name,source_url,file_id,r2_key,file_name,size,applied,sheets) VALUES(?,?,?,?,?,?,?,?,?,?)'
          ).bind(ts, me.id, me.name, rawUrl, meta.id, r2key, fname, rawXlsx.length, r.applied, sheetReport.length).run();
          archived = true;
        } catch (e) { archiveError = e.message; }
      }

      results.push({ url: rawUrl, ok: true, sheetsRead: sheetReport.length, sheets: sheetReport, applied: r.applied, skipped: r.skipped, skippedUnregistered: r.skippedUnregistered, skippedUnchanged: r.skippedUnchanged, skippedInvalid: r.skippedInvalid, skippedOtherOrg: r.skippedOtherOrg, errors: r.errors, mode: fellBack ? '単一シート(全タブ取得に失敗)' : '全シート', archived, archiveError });
    }
    if (body.save) {
      const savedRaw = JSON.parse(await getSetting(env, 'import_urls', '[]') || '[]');
      // 既存の保存データが単純な文字列だった場合(旧形式)は、オブジェクト形式に変換して引き継ぐ
      const saved = savedRaw.map(x => typeof x === 'string' ? { url: x, sheetTitle: '', savedAt: '', targetDate: '' } : x);
      const now = jstTs();
      for (const u of urls) {
        const meta = urlMeta[u] || {};
        const existing = saved.find(x => x.url === u);
        if (existing) {
          if (meta.sheetTitle) existing.sheetTitle = meta.sheetTitle;
          if (meta.targetDate) existing.targetDate = meta.targetDate;
          existing.savedAt = now;
        } else {
          saved.push({ url: u, sheetTitle: meta.sheetTitle || '', targetDate: meta.targetDate || '', savedAt: now });
        }
      }
      await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('import_urls',?)").bind(JSON.stringify(saved.slice(-50))).run();
    }
    return J({ ok: 1, results });
  }

  // 保存済み取り込みURL(手配担当以上)
  if (method === 'GET' && path === '/import-urls') {
    if (!has(me, 'import_data')) return ERR('ページが見つかりません', 404);
    const raw = JSON.parse(await getSetting(env, 'import_urls', '[]') || '[]');
    // 旧形式(単純な文字列の配列)が残っている場合はオブジェクト形式に正規化して返す
    const urls = raw.map(x => typeof x === 'string' ? { url: x, sheetTitle: '', savedAt: '', targetDate: '' } : x);
    return J({ urls });
  }
  if (method === 'POST' && path === '/import-urls') {
    if (!has(me, 'import_data')) return ERR('ページが見つかりません', 404);
    const urls = Array.isArray(body.urls) ? body.urls.filter(u => parseSheetUrl(u)) : [];
    await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('import_urls',?)").bind(JSON.stringify(urls.slice(-50))).run();
    return J({ ok: 1, urls });
  }

  // 台帳自動再取り込みの最終実行結果(管理者ページ表示用)
  if (method === 'GET' && path === '/settings/daicho-reload-result') {
    if (!has(me, 'import_data')) return ERR('ページが見つかりません', 404);
    try { return J({ result: JSON.parse(await getSetting(env, 'daicho_reload_last_result', '') || 'null') }); }
    catch (e) { return J({ result: null }); }
  }

  // ---- 台帳保管(管理者のみ) ----
  if (method === 'GET' && path === '/daicho') {
    if (!has(me, 'daicho_manage')) return ERR('権限がありません', 403);
    const rows = (await env.DB.prepare(
      'SELECT id,ts,importer_name,source_url,file_id,file_name,size,applied,sheets FROM daicho_archive ORDER BY id DESC LIMIT 500'
    ).all()).results;
    return J({ items: rows });
  }
  let dm;
  if (method === 'GET' && (dm = path.match(/^\/daicho\/(\d+)\/download$/))) {
    if (!has(me, 'daicho_manage')) return ERR('権限がありません', 403);
    const rec = await env.DB.prepare('SELECT r2_key,file_name FROM daicho_archive WHERE id=?').bind(Number(dm[1])).first();
    if (!rec) return ERR('見つかりません', 404);
    if (!env.DAICHO) return ERR('R2が未設定です', 500);
    const obj = await env.DAICHO.get(rec.r2_key);
    if (!obj) return ERR('ファイル本体が見つかりません(削除済みの可能性)', 404);
    const fname = encodeURIComponent(rec.file_name || 'daicho.xlsx');
    return new Response(obj.body, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${fname}`
      }
    });
  }
  if (method === 'POST' && (dm = path.match(/^\/daicho\/(\d+)\/delete$/))) {
    if (!has(me, 'daicho_manage')) return ERR('権限がありません', 403);
    const rec = await env.DB.prepare('SELECT r2_key FROM daicho_archive WHERE id=?').bind(Number(dm[1])).first();
    if (!rec) return ERR('見つかりません', 404);
    if (env.DAICHO) { try { await env.DAICHO.delete(rec.r2_key); } catch (e) {} }
    await env.DB.prepare('DELETE FROM daicho_archive WHERE id=?').bind(Number(dm[1])).run();
    return J({ ok: 1 });
  }
  // 台帳の複数選択削除(チェックボックスでまとめて選んだ分を一括削除)
  if (method === 'POST' && path === '/daicho/bulk-delete') {
    if (!has(me, 'daicho_manage')) return ERR('権限がありません', 403);
    const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(n => n > 0) : [];
    if (!ids.length) return ERR('削除するファイルを選択してください');
    const ph = ids.map(() => '?').join(',');
    const recs = (await env.DB.prepare(`SELECT id, r2_key FROM daicho_archive WHERE id IN (${ph})`).bind(...ids).all()).results;
    if (env.DAICHO) {
      for (const rec of recs) { try { await env.DAICHO.delete(rec.r2_key); } catch (e) {} }
    }
    await env.DB.prepare(`DELETE FROM daicho_archive WHERE id IN (${ph})`).bind(...ids).run();
    return J({ ok: 1, deleted: recs.length });
  }

  // 保存済み取り込みURLの削除(手配者以上)
  if (method === 'POST' && path === '/import-urls/delete') {
    if (!has(me, 'import_data')) return ERR('ページが見つかりません', 404);
    const savedRaw = JSON.parse(await getSetting(env, 'import_urls', '[]') || '[]');
    const saved = savedRaw.map(x => typeof x === 'string' ? { url: x, sheetTitle: '', savedAt: '', targetDate: '' } : x);
    let next;
    if (body.all) next = [];
    else if (body.url) next = saved.filter(x => x.url !== body.url);
    else if (Array.isArray(body.urls)) next = saved.filter(x => !body.urls.includes(x.url));
    else next = saved;
    await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('import_urls',?)").bind(JSON.stringify(next)).run();
    return J({ ok: 1, urls: next });
  }

  // ---- 手配者専用 ----
  if (method === 'GET' && path === '/online') {
    if (!handlerMode && !has(me, 'handler_tools')) return ERR('ページが見つかりません', 404);
    const rows = (await env.DB.prepare(
      'SELECT u.id AS uid,u.name,u.role,u.regno,MAX(s.last_seen) AS last_seen,MAX(s.handler) AS handler FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.last_seen>? GROUP BY u.id ORDER BY last_seen DESC'
    ).bind(Date.now() - 120000).all()).results;
    return J(rows);
  }
  if (method === 'GET' && path === '/history') {
    if (!handlerMode && !has(me, 'handler_tools')) return ERR('ページが見つかりません', 404);
    const rows = (await env.DB.prepare(
      "SELECT h.*, COALESCE(e.name, CASE WHEN h.editor_id=0 THEN 'スプレッドシート' ELSE '不明' END) AS editor_name, t.name AS target_name FROM schedule_history h LEFT JOIN users e ON e.id=h.editor_id LEFT JOIN users t ON t.id=h.target_id ORDER BY h.id DESC LIMIT 150"
    ).all()).results;
    return J(rows);
  }

  // ---- 新人報告 ----
  if (method === 'POST' && path === '/reports') {
    const isChief = lv(me) >= 1;
    const r = {
      ts: jstTs(), reporter_id: me.id, reporter_name: me.name,
      candidate_name: (body.candidate_name || '').trim(), candidate_grade: body.candidate_grade || '',
      first_chief: body.first_chief || '', first_note: body.first_note || '',
      s_motivation: isChief ? Number(body.s_motivation) || null : null,
      s_response: isChief ? Number(body.s_response) || null : null,
      s_total: isChief ? Number(body.s_total) || null : null,
      draft: isChief ? (body.draft || '') : '',
      plan: isChief ? (body.plan || '') : '',
      checker: isChief ? me.name : '',
      next_site: body.next_site || '', next_date: body.next_date || '',
      status: isChief ? 'checked' : 'pending'
    };
    if (!r.candidate_name) return ERR('獲得候補者名は必須です');
    await env.DB.prepare(
      'INSERT INTO reports(ts,reporter_id,reporter_name,candidate_name,candidate_grade,first_chief,first_note,s_motivation,s_response,s_total,draft,plan,checker,next_site,next_date,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(r.ts, r.reporter_id, r.reporter_name, r.candidate_name, r.candidate_grade, r.first_chief, r.first_note, r.s_motivation, r.s_response, r.s_total, r.draft, r.plan, r.checker, r.next_site, r.next_date, r.status).run();
    await notifyChiefs(env, 'report', `📝 新人報告:${r.candidate_name}(報告者:${me.name})${r.status === 'pending' ? ' — 2次チェックをお願いします' : ''}`);
    await rookieNotify(env, r);
    return J({ ok: 1 });
  }
  // 新人報告一覧: 1次(報告内容)は全員(メンツ含む)が閲覧可能。2次の編集はチーフ以上のみ(下のPATCHで制限)
  if (method === 'GET' && path === '/reports') {
    const rows = (await env.DB.prepare('SELECT * FROM reports ORDER BY id DESC').all()).results;
    return J(rows);
  }
  if ((mm = path.match(/^\/reports\/(\d+)$/)) && method === 'PATCH') {
    if (!has(me, 'report_check')) return ERR('2次チェックの記入には権限が必要です', 403);
    const id = Number(mm[1]);
    const r = await env.DB.prepare('SELECT * FROM reports WHERE id=?').bind(id).first();
    if (!r) return ERR('報告が見つかりません', 404);
    await env.DB.prepare(
      "UPDATE reports SET s_motivation=?, s_response=?, s_total=?, draft=?, plan=?, checker=?, next_site=?, next_date=?, status='checked' WHERE id=?"
    ).bind(Number(body.s_motivation) || null, Number(body.s_response) || null, Number(body.s_total) || null,
      body.draft || '', body.plan || '', body.checker || me.name,
      body.next_site ?? r.next_site, body.next_date ?? r.next_date, id).run();
    await rookieNotify(env, { ...r, ...body });
    return J({ ok: 1 });
  }

  // ---- ブラックリスト(提出・閲覧ともチーフ以上、または個別権限)----
  if (method === 'GET' && path === '/blacklist') {
    if (!has(me, 'blacklist_manage')) return ERR('ページが見つかりません', 404);
    return J((await env.DB.prepare('SELECT * FROM blacklist ORDER BY id DESC').all()).results);
  }
  if (method === 'POST' && path === '/blacklist') {
    if (!has(me, 'blacklist_manage')) return ERR('ページが見つかりません', 404);
    if (!body.name) return ERR('名前は必須です');
    const sc = v => { const n = Number(v); return (n >= 1 && n <= 5) ? n : null; };
    await env.DB.prepare(
      'INSERT INTO blacklist(ts,date,reporter,name,s_talk,s_dress,s_groom,s_late,s_work,reason,added_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(jstTs(), body.date || jstDate(), body.reporter || me.name, body.name,
      sc(body.s_talk), sc(body.s_dress), sc(body.s_groom), sc(body.s_late), sc(body.s_work),
      body.reason || '', me.name).run();
    return J({ ok: 1 });
  }

  // ---- 管理者:全データ閲覧 ----
  if (method === 'GET' && path === '/admin/data') {
    if (me.role !== 'admin') return ERR('ページが見つかりません', 404);
    const Q = {
      users: "SELECT regno AS 登録番号, name AS 氏名, role AS 役割, rank AS ランク, han AS 班, station AS 最寄駅, skills AS できること, CASE WHEN pass_hash IS NULL THEN '初期PW(登録番号のまま)' ELSE '本人が変更済み' END AS パスワード状態, created AS 作成日 FROM users ORDER BY regno",
      schedule: "SELECT u.name AS 氏名, s.date AS 日付, s.slot AS 枠, s.type AS 種別, s.site AS 現場名, s.venue AS 会場, s.tin AS 'IN', s.tout AS 'OUT', s.hours AS 時間, s.overtime AS 時間外, s.pay AS 給与, s.note AS 備考, COALESCE(d.plan,'') AS 育成計画 FROM schedule s JOIN users u ON u.id=s.user_id LEFT JOIN dev_plan d ON d.user_id=s.user_id AND d.date=s.date ORDER BY s.date DESC, s.slot LIMIT 1000",
      history: "SELECT h.ts AS 日時, COALESCE(e.name, CASE WHEN h.editor_id=0 THEN 'スプレッドシート' ELSE '不明' END) AS 編集者, t.name AS 対象, h.date AS 対象日, h.before_json AS 変更前, h.after_json AS 変更後 FROM schedule_history h LEFT JOIN users e ON e.id=h.editor_id LEFT JOIN users t ON t.id=h.target_id ORDER BY h.id DESC LIMIT 500",
      reports: "SELECT ts AS 日時, reporter_name AS 報告者, candidate_name AS 候補者, candidate_grade AS 学年, first_chief AS '1次_連絡チーフ', first_note AS '1次_所感', s_motivation AS やる気, s_response AS 受け答え, s_total AS 総合点, draft AS ドラフト, plan AS 育成計画, checker AS チェック者, next_site AS 次回現場, next_date AS 次回日付, status AS 状態 FROM reports ORDER BY id DESC",
      blacklist: "SELECT ts AS 登録日時, date AS 日付, reporter AS 報告者, name AS 名前, s_talk AS 会話, s_dress AS 服装, s_groom AS 身なり, s_late AS 遅刻, s_work AS 業務, reason AS 理由, added_by AS 登録者 FROM blacklist ORDER BY id DESC",
      notifications: "SELECT n.ts AS 日時, u.name AS 宛先, n.message AS 内容, CASE n.read WHEN 1 THEN '既読' ELSE '未読' END AS 状態 FROM notifications n JOIN users u ON u.id=n.user_id ORDER BY n.id DESC LIMIT 500",
      sessions: "SELECT u.name AS 氏名, u.regno AS 登録番号, CASE s.handler WHEN 1 THEN '手配モード中' ELSE '' END AS 手配, datetime(s.last_seen/1000,'unixepoch','+9 hours') AS 最終アクセス, datetime(s.created/1000,'unixepoch','+9 hours') AS ログイン日時 FROM sessions s JOIN users u ON u.id=s.user_id ORDER BY s.last_seen DESC"
    };
    const sql = Q[url.searchParams.get('table')];
    if (!sql) return ERR('不正なテーブル名です');
    return J((await env.DB.prepare(sql).all()).results);
  }

  // ---- 通知 ----
  if (method === 'GET' && path === '/notifications') {
    const rows = (await env.DB.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 30').bind(me.id).all()).results;
    const unread = (await env.DB.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id=? AND read=0').bind(me.id).first()).c;
    return J({ items: rows, unread });
  }
  if (method === 'POST' && path === '/notifications/read') {
    await env.DB.prepare('UPDATE notifications SET read=1 WHERE user_id=?').bind(me.id).run();
    return J({ ok: 1 });
  }
  let nrm;
  if (method === 'POST' && (nrm = path.match(/^\/notifications\/(\d+)\/read$/))) {
    await env.DB.prepare('UPDATE notifications SET read=1 WHERE id=? AND user_id=?').bind(Number(nrm[1]), me.id).run();
    return J({ ok: 1 });
  }

  // ---- プッシュ通知用デバイストークン(アプリ版・ブラウザ版共通) ----
  if (method === 'POST' && path === '/push-token') {
    const token = String(body.token || '').trim();
    const platform = ['android', 'ios', 'web'].includes(body.platform) ? body.platform : 'web';
    if (!token) return ERR('トークンが必要です');
    await env.DB.prepare(
      `INSERT INTO push_tokens(user_id,token,platform,created_at) VALUES(?,?,?,?)
       ON CONFLICT(user_id,token) DO UPDATE SET platform=excluded.platform, created_at=excluded.created_at`
    ).bind(me.id, token, platform, jstTs()).run();
    return J({ ok: 1 });
  }
  if (method === 'DELETE' && path === '/push-token') {
    const token = String(body.token || '').trim();
    if (token) await env.DB.prepare('DELETE FROM push_tokens WHERE user_id=? AND token=?').bind(me.id, token).run();
    return J({ ok: 1 });
  }

  return ERR('Not found', 404);
}

// 毎日21:00(JST)= 12:00 UTC: 現場入りしているチーフへ新人報告の催促
// 毎時実行され、設定時刻(JST)に一致する場合のみ新人報告の催促通知を送る。
// settings: notify_enabled('1'/'0'), notify_hour('21'), notify_target('handlers'|'chiefs'|'all')
// ===== 台帳の深夜自動再取り込み =====
// 保存済みURLを毎日JST 0:00 に自動で再取り込みする。
// 手動取り込みは「事前確認・仮登録」、このcronが「その日の夜に確定版で上書き」という運用。
// 実行後:
//   - 取り込んだURLを保存済みリストから削除する
//   - R2台帳は同じfile_idの古いバージョンを削除し、最新版だけ残す
async function cronDaichoReload(env) {
  const targetHour = parseInt(await getSetting(env, 'daicho_reload_hour', '0'), 10);
  const now = new Date(Date.now() + 9 * 3600e3); // JST
  if (now.getUTCHours() !== targetHour) return; // 指定時刻(既定0時)のみ実行
  const today = jstDate();
  const lastRun = await getSetting(env, 'daicho_reload_last_run', '');
  if (lastRun === today) return; // 1日1回のみ
  await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('daicho_reload_last_run',?)").bind(today).run();

  const urlsRaw = JSON.parse(await getSetting(env, 'import_urls', '[]') || '[]');
  const urls = urlsRaw.map(x => typeof x === 'string' ? x : x.url);
  if (!urls.length) return;

  const adminUser = await env.DB.prepare("SELECT id, name FROM users WHERE role='admin' LIMIT 1").first();
  const editorId = adminUser ? adminUser.id : 0;
  const editorName = adminUser ? adminUser.name : '自動';
  const results = [];
  const allRowsCombined = []; // 今夜取り込む全URL(全ファイル)を横断して集める。不在者判定はこれを使って最後にまとめて行う。

  for (const rawUrl of urls) {
    const meta = parseSheetUrl(rawUrl);
    if (!meta) { results.push({ url: rawUrl, ok: false, error: 'URL不正' }); continue; }
    try {
      // 日付制限なし(fromDate=null)で再取り込み → 当日含む全日付を確定版として上書き
      const got = await fetchXlsxSheets(meta.id);
      let allRows = [], sheetReport = [], fileDate = '';
      if (got.fileTitle) { const fd = normSheetDate(got.fileTitle, jstDate().slice(0, 7)); if (fd) fileDate = fd; }
      for (const sh of got.sheets) {
        const grid = sh.grid;
        if (!grid || !grid.length) continue;
        try {
          const fmt = detectFormat(grid);
          let parsed;
          if (fmt === 'C') parsed = parseFormatC(grid, null, fileDate).rows;
          else parsed = parseFormatAB(grid, jstDate().slice(0, 7)).rows;
          if (parsed && parsed.length) { allRows = allRows.concat(parsed); sheetReport.push({ name: sh.name, count: parsed.length }); }
        } catch (e) {
          sheetReport.push({ name: sh.name, count: 0, note: `解析エラー: ${e.message}` });
        }
      }
      if (!allRows.length) { results.push({ url: rawUrl, ok: false, error: 'データなし' }); continue; }
      const r = await applyImportRows(env, allRows, editorId, 'replace-person-day', '台帳自動再取り込み');
      allRowsCombined.push(...allRows); // 不在者判定用に集約(この時点ではまだ休暇化しない)

      // R2台帳を保管(同じfile_idの古いバージョンを削除して最新版だけ残す)
      if (got.raw && env.DAICHO) {
        const ts = jstTs();
        const r2key = `daicho/${ts.replace(/[: ]/g, '-')}_${meta.id}.xlsx`;
        await env.DAICHO.put(r2key, got.raw, {
          httpMetadata: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
        });
        const safeTitle = got.fileTitle ? got.fileTitle.replace(/[\\/:*?"<>|]/g, '_').trim() : '';
        const fname = safeTitle ? `${safeTitle}.xlsx` : `台帳_${ts.slice(0, 10)}_${meta.id.slice(0, 8)}.xlsx`;
        await env.DB.prepare(
          'INSERT INTO daicho_archive(ts,importer_id,importer_name,source_url,file_id,r2_key,file_name,size,applied,sheets) VALUES(?,?,?,?,?,?,?,?,?,?)'
        ).bind(ts, editorId, editorName + '(自動)', rawUrl, meta.id, r2key, fname, got.raw.length, r.applied, sheetReport.length).run();

        // 同じfile_idの古いバージョンを削除(最新版=今追加した1件だけ残す)
        const oldRecs = (await env.DB.prepare(
          'SELECT id, r2_key FROM daicho_archive WHERE file_id=? AND r2_key!=? ORDER BY id DESC'
        ).bind(meta.id, r2key).all()).results;
        for (const old of oldRecs) {
          try { await env.DAICHO.delete(old.r2_key); } catch (e) {}
          await env.DB.prepare('DELETE FROM daicho_archive WHERE id=?').bind(old.id).run();
        }
      }
      results.push({ url: rawUrl, ok: true, applied: r.applied });
    } catch (e) {
      results.push({ url: rawUrl, ok: false, error: e.message });
    }
  }

  // 不在者の休暇化: 今夜取り込んだ「全URL(全ファイル)」を横断して判定する。
  // (1ファイルごとに判定すると、Aファイルには載っているがBファイルには載っていない人まで
  //  誤って休暇にしてしまうため、必ず全ファイル分を集めてから最後に1回だけ行う)
  let absentResult = { clearedPeople: 0, clearedDays: 0 };
  if (allRowsCombined.length) {
    try { absentResult = await clearAbsentFromDaicho(env, allRowsCombined, editorId); }
    catch (e) { console.error('clearAbsentFromDaicho failed:', e); }
  }

  // 取り込んだURLを保存済みリストから削除
  await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('import_urls','[]')").run();

  // 実行結果を記録(管理者ページで確認できるように)
  await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('daicho_reload_last_result',?)").bind(
    JSON.stringify({ ts: jstTs(), count: urls.length, results, clearedAbsent: absentResult.clearedPeople })
  ).run();

  // 管理者へ結果を通知
  const totalApplied = results.reduce((s, r) => s + (r.ok ? (r.applied || 0) : 0), 0);
  const okCount = results.filter(r => r.ok).length;
  const ngCount = results.length - okCount;
  try {
    const admins = (await env.DB.prepare("SELECT id FROM users WHERE role='admin' AND COALESCE(suspended,0)=0").all()).results;
    if (admins.length) {
      await notify(env, admins.map(a => a.id), 'sched_import',
        `🌙 台帳の深夜自動再取り込みが完了しました(${jstTs()})。${okCount}件成功(反映${totalApplied}件)${ngCount ? ` / ${ngCount}件失敗` : ''}${absentResult.clearedPeople ? ` / 不在者の休暇化${absentResult.clearedPeople}件` : ''}`);
    }
  } catch (e) {}
}

// 新人報告リマインド通知。
// 対象者 = 「その日、現場(work)の予定がある」かつ「役割が基本ルールを満たす(既定:チーフ以上)」人。
// 役割に関わらず、個人ごとに users.notify_rookie で「常に対象(1)」「常に対象外(0)」に上書き設定できる(NULL=基本ルールに従う)。
// さらに、対象者本人がその日まだ新人報告を提出していない場合のみ送信する(既に提出済みの人には送らない)。
async function cronNotify(env) {
  const enabled = await getSetting(env, 'notify_enabled', '1');
  if (enabled === '0') return;
  const targetHour = parseInt(await getSetting(env, 'notify_hour', '21'), 10);
  const now = new Date(Date.now() + 9 * 3600e3);   // JST
  if (now.getUTCHours() !== targetHour) return;        // 設定時刻の回だけ実行

  const today = jstDate();
  const scope = await getSetting(env, 'notify_target', 'chiefs'); // 既定:チーフ以上
  let baseRoles = ['chief', 'handler', 'admin'];
  if (scope === 'handlers') baseRoles = ['handler', 'admin'];
  else if (scope === 'all') baseRoles = ['member', 'chief', 'handler', 'admin'];

  const phRole = baseRoles.map(() => '?').join(',');
  const recipients = (await env.DB.prepare(
    `SELECT DISTINCT u.id FROM users u
     JOIN schedule s ON s.user_id = u.id AND s.date = ? AND s.type = 'work'
     WHERE COALESCE(u.suspended,0) = 0
       AND (
         (u.role IN (${phRole}) AND COALESCE(u.notify_rookie, 1) != 0)
         OR u.notify_rookie = 1
       )
       AND NOT EXISTS (
         SELECT 1 FROM reports r WHERE r.reporter_id = u.id AND r.ts LIKE ?
       )`
  ).bind(today, ...baseRoles, today + '%').all()).results;

  const ids = recipients.map(r => r.id);
  if (ids.length) await notify(env, ids, 'remind', `⏰【リマインド】(${today}) 本日現場に入られています。新人の報告があれば忘れずに提出してください。`);
}

// 予定表(チーフ/1課など、sched_sourcesテーブルに登録された全ソース)を自動取り込みする。
// 毎時0分に呼ばれ、各ソースの頻度設定に応じて実行する。
// - freq_type='interval': 前回実行からinterval_hours時間以上経過していたら実行
// - freq_type='daily': 指定時刻(JST)の回のみ、1日1回
// 「読み込み日の2日後以降」のみ反映(当日・翌日は台帳の実績取り込みに任せる)
// 反映件数が1件以上あった場合、notify_adminが有効なら管理者へ通知する。
async function cronScheduleSources(env) {
  const now = new Date(Date.now() + 9 * 3600e3); // JST
  const nowMs = Date.now();
  // last_runが古い(または未実行=空文字)ものから優先的に処理する。
  // これにより、CPU時間制限等で全ソースを処理しきれない場合でも、
  // 最も取り込みが遅れているソースが後回しにされ続けることを防ぐ。
  const sources = (await env.DB.prepare("SELECT * FROM sched_sources WHERE enabled=1 ORDER BY last_run ASC").all()).results;

  for (const src of sources) {
    try {
      let shouldRun = false;
      if (src.freq_type === 'daily') {
        const targetHour = Number(src.hour) || 0;
        if (now.getUTCHours() === targetHour && (src.last_run || '').slice(0, 10) !== jstDate()) shouldRun = true;
      } else {
        const intervalH = Math.max(1, Number(src.interval_hours) || 1);
        if (!src.last_run) shouldRun = true;
        else {
          const lastRunMs = Date.parse(src.last_run.replace(' ', 'T') + '+09:00');
          if (!isNaN(lastRunMs) && (nowMs - lastRunMs) / 3600000 >= intervalH) shouldRun = true;
        }
      }
      if (!shouldRun) continue;
      console.log(`[cronScheduleSources] start: id=${src.id} label=${src.label} lastRun=${src.last_run || '(なし)'}`);

      const d = new Date(Date.now() + 9 * 3600e3); d.setDate(d.getDate() + 2);
      const fromDate = d.toISOString().slice(0, 10); // 読み込み日の2日後
      const adminUser = await env.DB.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").first();
      const r = await importScheduleSheet(env, 'sched_src_' + src.id, src.url, adminUser ? adminUser.id : 0, fromDate);
      await env.DB.prepare('UPDATE sched_sources SET last_run=?, last_result=? WHERE id=?').bind(
        jstTs(),
        JSON.stringify({ ts: jstTs(), applied: r.applied, skipped: r.skipped, unchangedPeople: r.unchangedPeople, changedPeople: r.changedPeople, error: '' }),
        src.id
      ).run();
      console.log(`[cronScheduleSources] done: id=${src.id} applied=${r.applied} skipped=${r.skipped}`);

      if (src.notify_admin && r.applied > 0) {
        const admins = (await env.DB.prepare("SELECT id FROM users WHERE role='admin' AND COALESCE(suspended,0)=0").all()).results;
        if (admins.length) {
          await notify(env, admins.map(a => a.id), 'sched_import',
            `📅【${src.label}】からスケジュールを取り込みました(${jstTs()})。反映${r.applied}件・変更あり${r.changedPeople ?? '-'}人`);
        }
      }
    } catch (e) {
      console.error(`[cronScheduleSources] error: id=${src.id} label=${src.label}`, e);
      // 1つのソースの失敗が他のソースの処理を止めないよう、ここで完結させる
      try {
        await env.DB.prepare('UPDATE sched_sources SET last_run=?, last_result=? WHERE id=?').bind(
          jstTs(), JSON.stringify({ ts: jstTs(), applied: 0, skipped: 0, error: e.message }), src.id
        ).run();
      } catch (e2) {}
    }
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await api(req, env, url); }
      catch (e) { return ERR('サーバーエラー: ' + e.message, 500); }
    }
    const resp = await env.ASSETS.fetch(req);
    // index.html / app.js / style.css は、ブラウザ・CDNどちらにもキャッシュさせない。
    // (これらは更新の反映が最優先のファイルであり、古い版が残ると不具合の原因になるため)
    const p = url.pathname;
    if (p === '/' || p === '/index.html' || p === '/app.js' || p === '/style.css') {
      const headers = new Headers(resp.headers);
      headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      headers.delete('etag');
      return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers });
    }
    return resp;
  },
  // 各cronタスクは互いに影響しないよう、それぞれ独立してtry-catchする。
  // 台帳の深夜再取込を最優先で実行(最も重要な処理のため、他のcronが重くても確実に走らせる)。
  async scheduled(event, env) {
    const startTs = jstTs();
    console.log(`[scheduled] start at ${startTs}`);
    try { await cronDaichoReload(env); } catch (e) { console.error('cronDaichoReload failed:', e); }
    try { await cronScheduleSources(env); } catch (e) { console.error('cronScheduleSources failed:', e); }
    try { await cronNotify(env); } catch (e) { console.error('cronNotify failed:', e); }
    console.log(`[scheduled] end (started at ${startTs})`);
  }
};
