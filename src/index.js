// RB事業2課 スケジュール管理 - Cloudflare Worker (API + 静的配信 + Cron)
const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json;charset=utf-8' } });
const ERR = (m, s = 400) => J({ error: m }, s);
const LV = { member: 0, chief: 1, handler: 2, admin: 3 };
const lv = u => LV[u.role] ?? 0;
const HOURLY = 1150; // 基本時給

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

const pub = u => ({ id: u.id, regno: u.regno, name: u.name, role: u.role, rank: u.rank, ka: u.ka, han: u.han, station: u.station, skills: u.skills, manager_id: u.manager_id, suspended: u.suspended ? 1 : 0 });

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

// 給与確定ロック: 現場日から2週間(14日)を過ぎたら確定(編集不可)
function payLockDate(){ const d = new Date(Date.now() + 9 * 3600e3); d.setDate(d.getDate() - 14); return d.toISOString().slice(0, 10); }
function isLocked(date, me){ if (me && me.role === 'admin') return false; return String(date) <= payLockDate(); }

// ---- コンフリクト検知 ----
// "H:MM" を分に変換(不正は null)
function toMin(t) { const m = String(t == null ? '' : t).match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }
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
function stripRow(r) {
  return { type: r.type, site: r.site, venue: r.venue, tin: r.tin, tout: r.tout, pay: r.pay, note: r.note, duty: r.duty, load_end: r.load_end, show_end: r.show_end, multi: r.multi };
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
async function applyImportRows(env, rows, editorId, mode = 'replace-person-day', srcLabel = 'spreadsheet') {
  const ts = jstTs();
  const resolve = await loadWageResolver(env);
  let applied = 0, skipped = 0; const errors = [];
  // (uid,date) ごとにグルーピング
  const groups = {}; const order = [];
  for (const r of rows) {
    const regno = String(r.regno || '').trim();
    const date = String(r.date || '').trim();
    if (!regno || !date) { skipped++; continue; }
    const u = await env.DB.prepare('SELECT id, rank FROM users WHERE regno=?').bind(regno).first();
    if (!u) { errors.push(`登録番号 ${regno} は未登録(${date})`); skipped++; continue; }
    const key = u.id + '|' + date;
    if (!groups[key]) { groups[key] = { uid: u.id, rank: u.rank, date, items: [] }; order.push(key); }
    groups[key].items.push(r);
  }
  for (const key of order) {
    const { uid, rank, date, items } = groups[key];
    const before = (await env.DB.prepare('SELECT * FROM schedule WHERE user_id=? AND date=? ORDER BY slot').bind(uid, date).all()).results;
    let baseSlots = [];
    if (mode === 'add') baseSlots = before.map(stripRow);
    // 取り込み行を整形
    const incoming = [];
    for (const r of items) {
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
    if (beforeJson === afterJson) { skipped += items.length; continue; }
    await env.DB.prepare('DELETE FROM schedule WHERE user_id=? AND date=?').bind(uid, date).run();
    let slot = 0;
    for (const s of finalSlots) {
      await env.DB.prepare('INSERT INTO schedule(user_id,date,slot,type,site,venue,tin,tout,hours,overtime,pay,note,duty,load_end,show_end,multi) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(uid, date, slot, s.type, s.site, s.venue, s.tin, s.tout, s.hours || 0, s.overtime || 0, s.pay || 0, s.note, s.duty || '', s.load_end || '', s.show_end || '', s.multi ? 1 : 0).run();
      slot++;
      if (s.type === 'work' && s.site) {
        const rs = (await env.DB.prepare("SELECT * FROM reports WHERE next_date=? AND next_site=?").bind(date, s.site).all()).results;
        for (const rr of rs) await notify(env, [uid], 'rookie', `🔰 ${rr.next_date} ${rr.next_site} に新人「${rr.candidate_name}」が入る予定です`);
      }
    }
    await env.DB.prepare('INSERT INTO schedule_history(ts,editor_id,target_id,date,before_json,after_json) VALUES(?,?,?,?,?,?)')
      .bind(ts, editorId, uid, date, beforeJson, JSON.stringify({ slots: afterJson, _src: srcLabel })).run();
    applied += items.length;
  }
  return { applied, skipped, errors };
}

// グリッドからフォーマットを推定。Cは勤務表(打刻/退勤/集合などの語)、それ以外はAB(月間表)
function detectFormat(grid) {
  const head = grid.slice(0, 12).flat().join(' ');
  if (/退勤時間|打刻時間|集合時間|終了予定時間|就業回数/.test(head)) return 'C';
  return 'AB';
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
function csvExportUrl(id, gid) {
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
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
  const m = s.match(/(\d{1,2}):(\d{2})/);
  return m ? `${Number(m[1])}:${m[2]}` : '';
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

// フォーマットC(IN/OUT表)を解析 → [{regno,date,site,venue,tin,tout,duty,load_end,show_end,note}]
// 既定の列位置(0始まり): 催物名F=5, 会場名G=6, 業務名H=7, 登録番号I=8, 開始時間P=15, 終了予定Q=16, 退勤時間S=18
// OUT = max(退勤時間, 終了予定時間)。搬入終了/終演はブロックヘッダから取得
function parseFormatC(rows, cfg) {
  const col = Object.assign({ saimotsu: 5, venueCol: 6, gyomu: 7, regno: 8, start: 15, tend: 16, tout: 18, headerRow: 10 }, cfg && cfg.C || {});
  const curYear = new Date(Date.now() + 9 * 3600e3).getFullYear();
  let date = '';
  for (let r = 0; r < 4 && !date; r++) for (const cell of (rows[r] || [])) {
    const d = normSheetDate(cell, String(curYear) + '-01');
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) { date = d; break; }
  }
  let venue = '';
  for (let r = 0; r < 6 && !venue; r++) { const line = rows[r] || []; const idx = line.findIndex(x => String(x).includes('会場')); if (idx >= 0 && line[idx + 1]) venue = String(line[idx + 1]).trim(); }
  // 搬入終了 / 終演時間 をヘッダ付近から取得(「搬入終了/10:15」「終演時間 15:00」等)
  let loadEnd = '', showEnd = '';
  for (let r = 0; r < 12; r++) for (const cell of (rows[r] || [])) {
    const s = String(cell); let mm;
    if (!loadEnd && (mm = s.match(/搬入終了[\s\/:：]*(\d{1,2}:\d{2})/))) loadEnd = mm[1];
    if (!showEnd && (mm = s.match(/終演[時間]*[\s\/:：]*(\d{1,2}:\d{2})/))) showEnd = mm[1];
  }
  // OUT = 退勤と終了予定の遅い方(早朝<6:00は翌日扱いで比較)
  const laterTime = (a, b) => {
    if (!a) return b || ''; if (!b) return a || '';
    const v = t => { const m = String(t).match(/^(\d{1,2}):(\d{2})$/); if (!m) return -1; let x = +m[1] * 60 + +m[2]; if (x < 360) x += 1440; return x; };
    return v(a) >= v(b) ? a : b;
  };
  const out = [];
  for (let r = col.headerRow + 1; r < rows.length; r++) {
    const line = rows[r] || [];
    const regno = String(line[col.regno] || '').trim();
    if (!/^\d{3,}$/.test(regno)) continue;
    const duty = String(line[col.gyomu] || '').trim();        // 業務名(給与区分)
    const site = String(line[col.saimotsu] || '').trim() || duty; // 現場名=催物名(無ければ業務名)
    const venueCell = String(line[col.venueCol] || '').trim() || venue;
    const tin = normTime(line[col.start]);
    const tout = laterTime(normTime(line[col.tout]), normTime(line[col.tend])); // 退勤 vs 終了予定
    if (!tin && !tout && !duty) continue;
    out.push({ regno, date, site, venue: venueCell, tin, tout, duty, load_end: loadEnd, show_end: showEnd });
  }
  return { date, venue, rows: out };
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
  for (let c = 0; c < reg.length; c++) { if (/^\d{3,}$/.test(String(reg[c]).trim())) memberCols.push({ regno: String(reg[c]).trim(), c }); }
  const out = [];
  for (let r = firstDateRow; r < rows.length; r++) {
    const line = rows[r] || [];
    const date = normSheetDate(line[dayCol], ym);
    if (!date) continue;
    for (const m of memberCols) {
      const site = String(line[m.c] || '').trim();
      const venue = String(line[m.c + 1] || '').trim();
      const note = String(line[m.c + 2] || '').trim();
      if (!site) continue;
      if (['×', '✕', 'x', 'X', '休暇', '○', '〇', '未定', '手配'].includes(site)) continue; // 非現場
      out.push({ regno: m.regno, date, site, venue, note });
    }
  }
  return { rows: out };
}

async function notify(env, userIds, type, message) {
  const ts = jstTs();
  for (const id of userIds) {
    const dup = await env.DB.prepare('SELECT 1 FROM notifications WHERE user_id=? AND message=? AND read=0').bind(id, message).first();
    if (dup) continue;
    await env.DB.prepare('INSERT INTO notifications(user_id,ts,type,message) VALUES(?,?,?,?)').bind(id, ts, type, message).run();
  }
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
      await env.DB.prepare('UPDATE users SET pass_hash=?, salt=? WHERE id=?').bind(h, salt, u.id).run();
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
    const result = await applyImportRows(env, rows, 0, 'replace-person-day', 'spreadsheet');
    return J({ ok: 1, ...result });
  }

  const me = await auth(req, env);
  if (!me) return ERR('ログインしてください', 401);
  if (me.suspended) { await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(me.id).run(); return ERR('このアカウントは停止されています', 403); }
  const handlerMode = me._handler === 1 && lv(me) >= 2;

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
    const salt = rnd();
    await env.DB.prepare('UPDATE users SET pass_hash=?, salt=? WHERE id=?').bind(await pbkdf2(newpw, salt), salt, me.id).run();
    return J({ ok: 1 });
  }

  // ---- 手配者モード ----
  if (method === 'POST' && path === '/handler-mode') {
    if (lv(me) < 2) return ERR('権限がありません', 403);
    const pin = await getSetting(env, 'handler_pin', '111111');
    if (body.pin !== pin) return ERR('パスワードが違います', 403);
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
    if (lv(me) < 2) return ERR('ページが見つかりません', 404);
    const rows = (await env.DB.prepare('SELECT effective_from,rank,kind,amount FROM wage_rates ORDER BY effective_from,rank,kind').all()).results;
    const periods = {};
    for (const r of rows) { (periods[r.effective_from] ||= { effective_from: r.effective_from, rates: {} }); (periods[r.effective_from].rates[r.rank] ||= {})[r.kind] = r.amount; }
    return J({ lockBefore: payLockDate(), periods: Object.values(periods) });
  }
  // 時給テーブル更新(管理者)。body.rates=[{effective_from,rank,kind,amount}]。新規effective_fromの追加も可
  if (method === 'PUT' && path === '/wage-rates') {
    if (lv(me) < 3) return ERR('管理者のみ変更できます', 403);
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
    if (lv(me) < 3) return ERR('管理者のみ変更できます', 403);
    const ef = String(body.effective_from || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ef)) return ERR('不正な日付です');
    await env.DB.prepare('DELETE FROM wage_rates WHERE effective_from=?').bind(ef).run();
    return J({ ok: 1 });
  }
  // 既存スケジュールの給与・残業を新ルールで一括再計算(管理者)。過去データの修正用
  if (method === 'POST' && path === '/recalc') {
    if (lv(me) < 3) return ERR('管理者のみ実行できます', 403);
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
  if (method === 'POST' && path === '/users') {
    if (lv(me) < 2) return ERR('ページが見つかりません', 404);
    const { regno, name, rank = '', han = '', station = '', role = 'member', manager_id = null } = body;
    if (!regno || !name) return ERR('登録番号と氏名は必須です');
    const newRole = me.role === 'admin' ? (LV[role] != null ? role : 'member') : 'member';
    try {
      await env.DB.prepare('INSERT INTO users(regno,name,rank,han,station,role,manager_id) VALUES(?,?,?,?,?,?,?)')
        .bind(String(regno).trim(), name, rank, han, station, newRole, manager_id || null).run();
    } catch { return ERR('この登録番号は既に存在します'); }
    return J({ ok: 1 });
  }
  let mm;
  if ((mm = path.match(/^\/users\/(\d+)$/))) {
    const uid = Number(mm[1]);
    if (method === 'PATCH') {
      if (body.role !== undefined) { // 役割変更は管理者のみ
        if (me.role !== 'admin') return ERR('役割の変更は管理者のみ可能です', 403);
        if (LV[body.role] == null) return ERR('不正な役割です');
        await env.DB.prepare('UPDATE users SET role=? WHERE id=?').bind(body.role, uid).run();
      }
      if (body.suspended !== undefined) { // アカウント停止/復活は管理者のみ
        if (me.role !== 'admin') return ERR('アカウント停止は管理者のみ可能です', 403);
        const sv = body.suspended ? 1 : 0;
        await env.DB.prepare('UPDATE users SET suspended=? WHERE id=?').bind(sv, uid).run();
        if (sv) await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(uid).run(); // ログイン中なら強制ログアウト
      }
      if (body.skills !== undefined) {
        if (lv(me) < 1) return ERR('権限がありません', 403);
        await env.DB.prepare('UPDATE users SET skills=? WHERE id=?').bind(body.skills, uid).run();
      }
      if (body.manager_id !== undefined) { // 担当手配者の設定(手配担当以上)
        if (lv(me) < 2) return ERR('権限がありません', 403);
        const mid = body.manager_id || null;
        if (mid) { const mgr = await env.DB.prepare('SELECT role FROM users WHERE id=?').bind(mid).first(); if (!mgr || LV[mgr.role] < 2) return ERR('担当手配者は手配担当以上を指定してください'); }
        await env.DB.prepare('UPDATE users SET manager_id=? WHERE id=?').bind(mid, uid).run();
      }
      for (const f of ['name', 'rank', 'han', 'station', 'ka']) {
        if (body[f] !== undefined) {
          if (lv(me) < 2) return ERR('権限がありません', 403);
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
    const canSeePay = lv(me) >= 2; // 手配担当以上のみ 時間・給与・IN・OUT を閲覧可
    const entries = {};            // entries[date] = [ {現場1}, {現場2}, ... ]
    for (const r of rows) {
      if (!canSeePay) { r.hours = 0; r.overtime = 0; r.pay = 0; r.tin = ''; r.tout = ''; r.duty = ''; r.load_end = ''; r.show_end = ''; r.multi = 0; }
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
    const ts = jstTs();
    for (const a of assignments) {
      if (!(a.uid in nameCache)) { const u = await env.DB.prepare('SELECT name, rank FROM users WHERE id=?').bind(a.uid).first(); nameCache[a.uid] = u ? { name: u.name, rank: u.rank } : { name: '', rank: '' }; }
      const uname = nameCache[a.uid].name;
      for (const date of a.dates) {
        if (isLocked(date, me)) { skipped++; continue; } // 給与確定済みは編集不可(管理者は除く)
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
      }
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
    if (isLocked(date, me)) return ERR('給与確定済みのため編集できません（現場日から2週間経過）', 409);
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
    const tgt = await env.DB.prepare('SELECT name, rank FROM users WHERE id=?').bind(uid).first();
    const tname = tgt ? tgt.name : '';
    const trank = tgt ? tgt.rank : '';
    const resolve = await loadWageResolver(env);
    // 給与確定(現場日から2週間)済みの日付は編集不可
    const lockedDates = Object.keys(byDate).filter(d => isLocked(d, me));
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
        }
      }
      // 変更があったら履歴に1件残す(当日まるごと before→after)
      const beforeJson = JSON.stringify(before.map(stripRow));
      const afterJson = JSON.stringify(saved.map(stripRow));
      if (beforeJson !== afterJson)
        await env.DB.prepare('INSERT INTO schedule_history(ts,editor_id,target_id,date,before_json,after_json) VALUES(?,?,?,?,?,?)')
          .bind(ts, me.id, uid, date, beforeJson, afterJson).run();
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
    return J({ ok: 1 });
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
    if (lv(me) < 2) for (const r of rows) { r.tin = ''; r.tout = ''; } // IN/OUTは手配担当以上のみ
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
    const canPay = lv(me) >= 2; // 時間・残業は手配担当以上のみ
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
    if (lv(me) < 2) return ERR('ページが見つかりません', 404);
    const urls = Array.isArray(body.urls) ? body.urls : (body.url ? [body.url] : []);
    if (!urls.length) return ERR('URLが指定されていません');
    const month = body.month || jstDate().slice(0, 7);
    const mode = body.add ? 'add' : 'replace-person-day';
    const results = [];
    for (const rawUrl of urls) {
      const meta = parseSheetUrl(rawUrl);
      if (!meta) { results.push({ url: rawUrl, ok: false, error: 'URLの形式が正しくありません' }); continue; }
      let csv;
      try {
        const resp = await fetch(csvExportUrl(meta.id, meta.gid), { redirect: 'follow' });
        if (!resp.ok) { results.push({ url: rawUrl, ok: false, error: `取得失敗(HTTP ${resp.status})。シートが「リンクを知る全員が閲覧可」か確認してください` }); continue; }
        csv = await resp.text();
        if (/<html/i.test(csv.slice(0, 200))) { results.push({ url: rawUrl, ok: false, error: 'シートが非公開の可能性があります(「リンクを知る全員が閲覧可」に設定してください)' }); continue; }
      } catch (e) { results.push({ url: rawUrl, ok: false, error: '取得時にエラー: ' + e.message }); continue; }

      const grid = parseCsv(csv);
      const fmt = body.format && body.format !== 'auto' ? body.format : detectFormat(grid);
      let parsed;
      if (fmt === 'C') parsed = parseFormatC(grid, body.cfg).rows;
      else parsed = parseFormatAB(grid, month, body.cfg).rows;
      if (!parsed.length) { results.push({ url: rawUrl, ok: false, format: fmt, error: '取り込めるデータが見つかりませんでした(フォーマットや対象月を確認してください)' }); continue; }
      const r = await applyImportRows(env, parsed, me.id, mode, 'スプレッドシートURL');
      results.push({ url: rawUrl, ok: true, format: fmt, applied: r.applied, skipped: r.skipped, errors: r.errors });
    }
    if (body.save) {
      const saved = JSON.parse(await getSetting(env, 'import_urls', '[]') || '[]');
      for (const u of urls) if (!saved.includes(u)) saved.push(u);
      await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('import_urls',?)").bind(JSON.stringify(saved.slice(-50))).run();
    }
    return J({ ok: 1, results });
  }

  // 保存済み取り込みURL(手配担当以上)
  if (method === 'GET' && path === '/import-urls') {
    if (lv(me) < 2) return ERR('ページが見つかりません', 404);
    return J({ urls: JSON.parse(await getSetting(env, 'import_urls', '[]') || '[]') });
  }
  if (method === 'POST' && path === '/import-urls') {
    if (lv(me) < 2) return ERR('ページが見つかりません', 404);
    const urls = Array.isArray(body.urls) ? body.urls.filter(u => parseSheetUrl(u)) : [];
    await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('import_urls',?)").bind(JSON.stringify(urls.slice(-50))).run();
    return J({ ok: 1, urls });
  }

  // ---- 手配者専用 ----
  if (method === 'GET' && path === '/online') {
    if (!handlerMode) return ERR('ページが見つかりません', 404);
    const rows = (await env.DB.prepare(
      'SELECT u.name,u.role,u.regno,MAX(s.last_seen) AS last_seen,MAX(s.handler) AS handler FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.last_seen>? GROUP BY u.id ORDER BY last_seen DESC'
    ).bind(Date.now() - 120000).all()).results;
    return J(rows);
  }
  if (method === 'GET' && path === '/history') {
    if (!handlerMode) return ERR('ページが見つかりません', 404);
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
  if (method === 'GET' && path === '/reports') {
    if (lv(me) < 1) return ERR('ページが見つかりません', 404);
    const rows = (await env.DB.prepare('SELECT * FROM reports ORDER BY id DESC').all()).results;
    return J(rows);
  }
  if ((mm = path.match(/^\/reports\/(\d+)$/)) && method === 'PATCH') {
    if (lv(me) < 1) return ERR('ページが見つかりません', 404);
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

  // ---- ブラックリスト(提出・閲覧ともチーフ以上)----
  if (method === 'GET' && path === '/blacklist') {
    if (lv(me) < 1) return ERR('ページが見つかりません', 404);
    return J((await env.DB.prepare('SELECT * FROM blacklist ORDER BY id DESC').all()).results);
  }
  if (method === 'POST' && path === '/blacklist') {
    if (lv(me) < 1) return ERR('ページが見つかりません', 404);
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

  return ERR('Not found', 404);
}

// 毎日21:00(JST)= 12:00 UTC: 現場入りしているチーフへ新人報告の催促
async function cron2100(env) {
  const today = jstDate();
  const chiefs = (await env.DB.prepare(
    "SELECT DISTINCT u.id FROM users u JOIN schedule s ON s.user_id=u.id WHERE s.date=? AND s.type='work' AND u.role!='member'"
  ).bind(today).all()).results;
  for (const c of chiefs) {
    const done = await env.DB.prepare('SELECT 1 FROM reports WHERE reporter_id=? AND ts LIKE ?').bind(c.id, today + '%').first();
    if (!done) await notify(env, [c.id], 'remind', '⏰【催促】本日の新人報告がまだ提出されていません。忘れずに提出をお願いします。');
  }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await api(req, env, url); }
      catch (e) { return ERR('サーバーエラー: ' + e.message, 500); }
    }
    return env.ASSETS.fetch(req);
  },
  async scheduled(event, env) { await cron2100(env); }
};
