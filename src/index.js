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
  summary_view:    { label: '稼働サマリーの閲覧', baseLv: 1 },
  day_schedule_view:{ label: 'スケジュール一覧の閲覧', baseLv: 1 },
  member_stats_view:{ label: 'メンバー分析の閲覧', baseLv: 1 },
  sites_view:      { label: '現場一覧の閲覧', baseLv: 1 },
  members_view:    { label: 'メンバー一覧の閲覧', baseLv: 1 },
  site_pay:        { label: '現場の給与・業務内容を見る', baseLv: 2 },
  site_manage:     { label: '現場へのメンバー登録・編集', baseLv: 2 },
  import_data:     { label: 'スプレッドシートからの取り込み', baseLv: 2 },
  handler_tools:   { label: 'ログイン中メンバー・編集履歴の閲覧', baseLv: 2 },
  wage_settings:   { label: '時給・給与確定ロック・通知の設定', baseLv: 3 },
  account_manage:  { label: 'アカウントの作成・権限変更・停止', baseLv: 3 },
  daicho_manage:   { label: '台帳保管の閲覧・ダウンロード・削除', baseLv: 3 },
  dashboard_view:  { label: '管理者ダッシュボードの閲覧', baseLv: 3 },
  member_summary_view: { label: '個人の年間稼働サマリー・備考欄の閲覧', baseLv: 2 },
};
function getPerms(u) { try { return JSON.parse(u.extra_perms || '[]'); } catch (e) { return []; } }
function getRevokedPerms(u) { try { return JSON.parse(u.revoked_perms || '[]'); } catch (e) { return []; } }
// has: その機能を使えるか。
// 1. 明示的に「剥奪」されていれば、baseLvや追加権限に関わらず常に不可(最優先)。
//    例:「チーフ以上は標準で稼働サマリーを見られるが、この人だけは見せたくない」を実現するため。
// 2. 剥奪されていなければ、基本権限(baseLv)を満たす、または個別に追加権限が付与されていれば可。
function has(u, key) {
  const p = PERMS[key];
  if (!p) return false;
  if (getRevokedPerms(u).includes(key)) return false;
  if (lv(u) >= p.baseLv) return true;
  return getPerms(u).includes(key);
}

async function getSetting(env, key, def) {
  const r = await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(key).first().catch(() => null);
  return r ? r.value : def;
}

// 台帳・予定表の取り込み時に「現場名ではない」と判定する文言(×・休暇・1日OK等)を
// キーワード→種別(x/off/ok/paid/ignore)のマップとして取得する。
async function loadNonSiteKeywords(env) {
  const rows = (await env.DB.prepare('SELECT keyword, type FROM non_site_keywords').all().catch(() => ({ results: [] }))).results || [];
  const map = {};
  for (const r of rows) map[r.keyword] = r.type;
  return map;
}

// ---- Googleカレンダー等への購読フィード(iCalendar/.ics)生成 ----
// テキスト中のカンマ・セミコロン・改行等をiCalendar仕様に沿ってエスケープする
function icsEscape(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}
// 日本時間の日付+時刻("2026-07-10","9:00")を、UTC基準のiCalendar日時("20260709T230000Z")に変換する
function icsDateTime(date, time) {
  const [hh, mm] = (time || '0:00').split(':').map(Number);
  const dt = new Date(`${date}T${String(hh).padStart(2, '0')}:${String(mm || 0).padStart(2, '0')}:00+09:00`);
  return dt.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}
function icsDateOnly(date) { return date.replace(/-/g, ''); }
// 日付文字列に n日を加算する(UTC基準で日付だけ計算するため、タイムゾーン変換による日付ズレが起きない)
function addDaysStr(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
// 1件のスケジュール行をVEVENTブロックに変換する。時刻が無い(work以外、または時刻未入力)場合は終日イベントにする。
function scheduleRowToIcsEvent(uid, row) {
  const label = { off: '休暇', paid: '有給', ok: '1日OK', x: '×' }[row.type];
  const summary = row.type === 'work' ? (row.site || '(現場)') : (label || row.type);
  const uidStr = `sched-${uid}-${row.date}-${row.slot || 0}@ty-schedule`;
  const lines = ['BEGIN:VEVENT', `UID:${uidStr}`, `DTSTAMP:${icsDateTime(jstDate(), '0:00')}`];
  if (row.type === 'work' && row.tin && row.tout) {
    lines.push(`DTSTART:${icsDateTime(row.date, row.tin)}`);
    lines.push(`DTEND:${icsDateTime(row.date, row.tout)}`);
  } else {
    // 時刻未定の現場・休暇等は終日イベントとして表示する。iCalendar仕様上、終日イベントの
    // DTENDは「その日を含まない翌日」を指定する(排他的)。
    lines.push(`DTSTART;VALUE=DATE:${icsDateOnly(row.date)}`);
    lines.push(`DTEND;VALUE=DATE:${icsDateOnly(addDaysStr(row.date, 1))}`);
  }
  lines.push(`SUMMARY:${icsEscape(summary)}`);
  if (row.venue) lines.push(`LOCATION:${icsEscape(row.venue)}`);
  const descParts = [];
  if (row.duty) descParts.push(`業務: ${row.duty}`);
  if (row.note) descParts.push(`備考: ${row.note}`);
  if (descParts.length) lines.push(`DESCRIPTION:${icsEscape(descParts.join('\n'))}`);
  lines.push('END:VEVENT');
  return lines.join('\r\n');
}

// after_json の内容が「現場(work)」を一切含まない場合(休暇・×・1日OK等のみへの変更)は true を返す。
// このような変更(特に台帳の不在者休暇化・予定表の一括更新等)は大量に発生し履歴を埋め尽くしてしまうため、
// スケジュール変更履歴には記録しない対象と判定する。育成計画の変更・現場を削除した(空にした)変更は、
// 常に記録したい変更なので対象外(false)とする。
function isNonWorkOnlyChange(afterJson) {
  try {
    const after = typeof afterJson === 'string' ? JSON.parse(afterJson) : afterJson;
    if (after && typeof after === 'object' && after.plan !== undefined && after.type === undefined) return false;
    const slots = Array.isArray(after) ? after : (after && after.slots !== undefined ? (typeof after.slots === 'string' ? JSON.parse(after.slots) : after.slots) : (after && after.type ? [after] : []));
    if (!Array.isArray(slots) || !slots.length) return false;
    return !slots.some(s => s && s.type === 'work');
  } catch (e) { return false; }
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

// アプリの機能アップデートのお知らせに使うバージョン番号。新しいお知らせを追加したら値を増やし、
// updateNoticeContent()にも内容を追記する。既にパスワードを変更済み(must_change=0)の既存ユーザーが
// ログインした際、seen_update_version がこれより小さければ「アップデートのお知らせ」を表示する。
const CURRENT_UPDATE_VERSION = 7;

const pub = u => ({ id: u.id, regno: u.regno, name: u.name, role: u.role, rank: u.rank, ka: u.ka, han: u.han, station: u.station, skills: u.skills, manager_id: u.manager_id, suspended: u.suspended ? 1 : 0, must_change: u.must_change ? 1 : 0, extra_perms: getPerms(u), revoked_perms: getRevokedPerms(u), notify_rookie: u.notify_rookie === null || u.notify_rookie === undefined ? null : (u.notify_rookie ? 1 : 0), manner_done: u.manner_done ? 1 : 0, team2_done: u.team2_done ? 1 : 0, su_done: u.su_done ? 1 : 0, graduate_flag: u.graduate_flag ? 1 : 0, promotion_pending_date: u.promotion_pending_date || null, promotion_pending_rank: u.promotion_pending_rank || null, needsUpdateNotice: !u.must_change && (u.seen_update_version || 0) < CURRENT_UPDATE_VERSION, seenUpdateVersion: u.seen_update_version || 0 });

// ===== 給与計算 (RB事業2課ルール) =====
// 業務名 → 計算区分。 g5=案内料金(最低5h) / l3=搬入出料金(最低3h) / lg,gl,lgl=時間帯分割 / skip=対象外
const DUTY_MAP = {
  '案内':'g5','受付・案内':'g5','準備':'g5','本部付':'g5','制作補助':'g5','運営補助':'g5','雑務':'g5',
  '準備・設営':'l3','搬入':'l3','搬出':'l3','機材搬入':'l3','機材搬出':'l3','ステージハンド':'l3',
  '搬入・案内':'lg','案内・搬出':'gl','パッケージ':'lgl',
  'ケータリング':'skip','物品販売':'skip',
};
// duty-map編集APIでの入力チェック用。有効な料金区分コードの一覧。
const DUTY_SEG_LABELS_BACKEND = { g5:1, l3:1, lg:1, gl:1, lgl:1, skip:1 };
const PAY_RANKS = ['A','B','C','D','E'];
function rankLetter(r){ const m = String(r || '').match(/[A-Ea-e]/); return m ? m[0].toUpperCase() : ''; }
// 登録番号の帯から拠点(大阪/京都)を判定する。300000〜349999=大阪、350000〜399999=京都。
// DBには保存せず、集計のたびに都度計算するだけ(既存データを変更しない、軽量な集計専用の判定)。
function baseFromRegno(regno){
  const n = parseInt(String(regno||'').replace(/\D/g,''), 10);
  if(!n) return '';
  if(n >= 300000 && n <= 349999) return '大阪';
  if(n >= 350000 && n <= 399999) return '京都';
  return '';
}

// 全時給を読み込み、(rank,kind,date)で有効な額を返すリゾルバを作る
async function loadWageResolver(env){
  const rows = (await env.DB.prepare('SELECT effective_from,rank,kind,amount FROM wage_rates ORDER BY effective_from').all().catch(() => ({ results: [] }))).results || [];
  return (rank, kind, date) => {
    let best = null;
    for (const r of rows) if (r.rank === rank && r.kind === kind && r.effective_from <= date) best = r.amount;
    return best;
  };
}

// 業務名→料金区分のマップをDBから読み込む(管理者が編集可能)。
// テーブルが空、またはDB未初期化の場合は、コード内蔵のDUTY_MAPにフォールバックする。
async function loadDutyMap(env){
  const rows = (await env.DB.prepare('SELECT duty, seg FROM duty_map').all().catch(() => ({ results: [] }))).results || [];
  if (!rows.length) return DUTY_MAP;
  const map = {};
  for (const r of rows) map[r.duty] = r.seg;
  return map;
}

// 1日分の給与計算。resolve(rank,kind,date)で時給取得。tin/toutは"HH:MM"。
// dutyMapは業務名→料金区分のマップ(loadDutyMapで取得したもの)。省略時はコード内蔵のDUTY_MAPを使う。
function calcPay({ rank, date, tin, tout, duty, loadEnd, showEnd, multi }, resolve, dutyMap){
  const R = rankLetter(rank);
  const seg = (dutyMap || DUTY_MAP)[duty] || (duty ? 'skip' : 'g5'); // 未知の業務名は対象外、業務名空は案内扱い
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

// ランク変更(自動昇格・査定・手動)があった時、その月の給与を月初から新ランクで計算し直す。
// 月の途中でランクが上がっても、その月はまるごと新ランクで再計算する、という仕様のための処理。
async function recalcPayForMonth(env, userId, month, newRank){
  const resolve = await loadWageResolver(env);
  const dutyMap = await loadDutyMap(env);
  const rows = (await env.DB.prepare(
    "SELECT id, date, tin, tout, duty, load_end, show_end, multi FROM schedule WHERE user_id=? AND date LIKE ? AND type='work'"
  ).bind(userId, month + '%').all()).results;
  for (const r of rows) {
    const c = calcPay({ rank: newRank, date: r.date, tin: r.tin, tout: r.tout, duty: r.duty, loadEnd: r.load_end, showEnd: r.show_end, multi: r.multi }, resolve, dutyMap);
    await env.DB.prepare('UPDATE schedule SET hours=?, overtime=?, pay=? WHERE id=?').bind(c.hours, c.overtime, c.pay, r.id).run();
  }
}

// 台帳(実績)取込データから、研修受講(マナー研修/チーム研修/ステージアップ研修)を現場名で自動検出し、
// 該当者のフラグを更新する。実際の昇格(E→D、D→C)は即時ではなく、翌日/翌月1日に日次バッチ(cronRankPromotion)
// で行う(マナー研修は翌日から、チーム研修+ステージアップ研修完了は翌月1日から、という仕様のため)。
async function processTrainingPromotions(env, rows){
  const detectTraining = (site) => {
    const s = String(site || '');
    if (s.includes('マナー')) return 'manner';
    if (s.includes('チーム研修') || s.includes('2部')) return 'team2';
    // ステージアップ研修は、正式名称のほか「SU」という半角略称で記載される場合もある
    if (s.includes('ステージアップ研修') || s.includes('SU')) return 'su';
    return null;
  };
  const byRegno = {};
  for (const r of rows) {
    const training = detectTraining(r.site);
    if (!training) continue;
    const regno = normRegno(r.regno);
    if (!regno) continue;
    (byRegno[regno] ||= new Set()).add(training);
  }
  const regnos = Object.keys(byRegno);
  if (!regnos.length) return;

  const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
  let users = [];
  for (const rc of chunk(regnos, 50)) {
    const ph = rc.map(() => '?').join(',');
    const us = (await env.DB.prepare(`SELECT id, regno, rank, manner_done, team2_done, su_done FROM users WHERE regno IN (${ph})`).bind(...rc).all()).results;
    users = users.concat(us);
  }
  const tomorrow = (() => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();
  const nextMonth1st = (() => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCMonth(d.getUTCMonth() + 1, 1); return d.toISOString().slice(0, 10); })();

  for (const u of users) {
    const trainings = byRegno[normRegno(u.regno)];
    if (!trainings) continue;
    const R = rankLetter(u.rank);
    // マナー研修: Eランクの人のみ対象。受講したら、翌日からDランクへ昇格予約
    if (trainings.has('manner') && !u.manner_done && R === 'E') {
      await env.DB.prepare('UPDATE users SET manner_done=1, promotion_pending_date=?, promotion_pending_rank=? WHERE id=?')
        .bind(tomorrow, 'D', u.id).run();
      continue; // マナー研修とチーム研修/SUは対象ランクが異なるため、同時該当は通常ない
    }
    // チーム研修(2部)・ステージアップ研修(SU): Dランクの人のみ対象。両方受講したら、翌月1日にCランクへ昇格予約
    if (R === 'D') {
      const team2Done = trainings.has('team2') ? 1 : u.team2_done;
      const suDone = trainings.has('su') ? 1 : u.su_done;
      if (team2Done !== u.team2_done || suDone !== u.su_done) {
        if (team2Done && suDone) {
          await env.DB.prepare('UPDATE users SET team2_done=?, su_done=?, promotion_pending_date=?, promotion_pending_rank=? WHERE id=?')
            .bind(team2Done, suDone, nextMonth1st, 'C', u.id).run();
        } else {
          await env.DB.prepare('UPDATE users SET team2_done=?, su_done=? WHERE id=?').bind(team2Done, suDone, u.id).run();
        }
      }
    }
  }
}

// 給与確定ロック: 現場日からロック日数(既定14)を過ぎたら確定(編集不可)
// lockDays は呼び出し側で getLockDays(env) から取得して渡す
function payLockDate(lockDays){ const d = new Date(Date.now() + 9 * 3600e3); d.setDate(d.getDate() - (lockDays ?? 14)); return d.toISOString().slice(0, 10); }
function isLocked(date, me, lockDays){ if (me && me.role === 'admin') return false; return String(date) <= payLockDate(lockDays); }
async function getLockDays(env){ const v = parseInt(await getSetting(env, 'lock_days', '14'), 10); return (isNaN(v) || v < 0) ? 14 : v; }

// ===== 予定表(チーフ/手配者スケジュール表)の取り込み =====
// 月ごとにシートが分かれた予定表を取得し、fromDate以降の予定のみ users.regno と突き合わせて反映する。
// 実績(IN/OUT)を伴わない「予定」のみの表のため、直近(前日まで)は台帳(実績取り込み)を優先する
// (fromDateの絞り込みにより、直近の日付はそもそも取込対象に含まれない)。
//
// 上書き判定は「日単位のスプレッドシート差分」を基準にする(アプリ側の現在の内容では判定しない):
// 前回取り込んだ内容(import_snapshots)と、今回取り込んだ内容を人・日ごとに比較し、
// スプレッドシート側の内容が変わっていない日はアプリ側に一切触れない(API呼び出し削減にもなる)。
// 逆に、スプレッドシート側の内容が変わっている日は、アプリ側が手動編集されていても新しい内容で
// 上書きする(「予定表が更新されたのに反映されない」という事故を避けるため)。
async function importScheduleSheet(env, source, url, editorId, fromDate, opt = {}) {
  const meta = parseSheetUrl(url);
  if (!meta) throw new Error('スプレッドシートURLの形式が正しくありません');
  const got = await fetchXlsxSheets(meta.id);
  const keywordMap = await loadNonSiteKeywords(env);
  let allRows = [];
  const sheetReport = [];
  let anyLabelFound = false;
  for (const sh of got.sheets) {
    let parsed;
    if (isArrangeSheet(sh.grid)) {
      // 手配管理表(日付列 + 複数人分の[現場/会場/時間]列が横に何組も並ぶ形式)。
      // 年月はシート自身の記載を必須とする(fallback=実行時点の月を使わない)。
      // 1つのスプレッドシートに複数月のタブが並ぶ運用があり、もしタブ自身から年月を
      // 読み取れずに実行時点の月へフォールバックすると、複数の異なる月のタブが
      // 全て同じ月として取り込まれてしまい、同じ日に複数の現場が誤って混在する事故になる。
      // 年月不明のタブは、誤ったデータを取り込むよりスキップする方が安全。
      const ym = detectYmFromGrid(sh.grid, null);
      if (!ym) {
        sheetReport.push({ name: sh.name, count: 0, note: 'シートから年月を読み取れなかったためスキップしました' });
        continue;
      }
      parsed = { rows: parseFormatD(sh.grid, ym, keywordMap, fromDate).rows, labelFound: true };
    } else {
      // 従来のチーフ予定表(日付列が1つ、日付はシリアル値)
      parsed = parseChiefScheduleSheet(sh.grid, fromDate, keywordMap);
    }
    if (parsed.labelFound) anyLabelFound = true;
    if (parsed.rows.length) { allRows = allRows.concat(parsed.rows); sheetReport.push({ name: sh.name, count: parsed.rows.length }); }
  }
  if (!allRows.length) {
    const msg = anyLabelFound
      ? `対象日(${fromDate})以降の予定が見つかりませんでした。予定表ソースは実績を優先するため、取り込み日の2日後以降の日付のみを反映します。過去〜直近の予定を反映したい場合は「スプレッドシート取り込み」から手動で取り込んでください。`
      : 'このシートには「現場」の見出しが横に並ぶレイアウトが見つかりませんでした。予定表ソースが対応しているのは、チーフ予定表(日付列が1つ)と手配管理表(日付列と人ごとの現場/会場/時間の組が横に繰り返される)の2形式です。台帳(IN/OUT表)など別のレイアウトのシートは登録しないでください。';
    return { applied: 0, skipped: 0, sheets: sheetReport, unchangedPeople: 0, changedPeople: 0, errors: [msg] };
  }

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
  // normalize()の結果(日付でソート済みの配列)を、日付ごとの正規化文字列にまとめ直す。
  // 「その日のスプレッドシートの内容が前回取込時と変わったか」を1日単位で比較するために使う。
  const groupByDate = normalizedArr => {
    const byDate = {};
    for (const r of normalizedArr) (byDate[r.date] ||= []).push({ type: r.type, site: r.site, venue: r.venue });
    const out = {};
    for (const d in byDate) out[d] = JSON.stringify(byDate[d].sort((a, b) => (a.type + a.site + a.venue).localeCompare(b.type + b.site + b.venue)));
    return out;
  };

  // 前回スナップショットを一括取得
  const snapMap = {};
  const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
  for (const part of chunk(regnos, 50)) {
    const ph = part.map(() => '?').join(',');
    const rs = (await env.DB.prepare(`SELECT regno, data FROM import_snapshots WHERE source=? AND regno IN (${ph})`).bind(source, ...part).all()).results;
    for (const s of rs) snapMap[s.regno] = s.data;
  }

  // 「前回取り込んだスプレッドシートの内容」と「今回取り込んだスプレッドシートの内容」を日単位で
  // 比較し、変わった日だけを取り込み対象にする(アプリ上で手動編集されていても、スプレッドシート
  // 側の内容が変わっていれば新しい内容を優先して反映する)。スプレッドシート側が前回と同じ日は、
  // アプリ側の内容(手動編集含む)に一切触れない。
  let unchangedPeople = 0;
  const rowsToApply = [];
  for (const regno of regnos) {
    const newList = byRegno[regno].map(r => ({ date: r.date, type: r.type, site: r.site || '', venue: r.venue || '' }));
    const newData = JSON.stringify([...newList].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (snapMap[regno] === newData) { unchangedPeople++; continue; } // 前回と完全一致 → この人はDBに一切触れずスキップ

    let prevList = [];
    if (snapMap[regno]) { try { prevList = JSON.parse(snapMap[regno]); } catch (e) {} }
    const prevByDate = groupByDate(prevList);
    const newByDate = groupByDate(newList);
    for (const date in newByDate) {
      if (newByDate[date] !== prevByDate[date]) rowsToApply.push(...byRegno[regno].filter(r => r.date === date));
    }
  }

  // 上記で「スプレッドシート側の内容が前回と変わった日」だけに絞り込み済みのため、
  // applyImportRowsは(アプリ側の既存内容を見て遠慮する'skip-if-exists'ではなく)
  // 通常の上書きモードで、絞り込んだ日をそのまま反映する。
  const r = rowsToApply.length
    ? await applyImportRows(env, rowsToApply, editorId, 'replace-person-day', source, false, { skipUnassigned: opt.excludeUnmanaged !== false })
    : { applied: 0, skipped: 0, skippedUnregistered: 0, skippedUnchanged: 0, skippedInvalid: 0, skippedOtherOrg: 0, skippedUnassigned: 0, errors: [], changes: [], ts: jstTs() };

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

// 編集履歴1件を取り消す(before_jsonの状態に、対象者のその日のスケジュールを復元する)。
// 単一取り消し・一括取り消しの両方から呼ばれる共通処理。失敗時は例外を投げる(呼び出し側でcatchする)。
async function undoHistoryEntry(env, id, me) {
  const hist = await env.DB.prepare('SELECT * FROM schedule_history WHERE id=?').bind(id).first();
  if (!hist) throw new Error(`履歴#${id}が見つかりません`);
  const uid = hist.target_id, date = hist.date;
  let restoreRows;
  try {
    const parsed = JSON.parse(hist.before_json);
    restoreRows = Array.isArray(parsed) ? parsed : (parsed.slots || []);
  } catch (e) { throw new Error(`履歴#${id}は形式が壊れているため復元できません`); }

  const target = await env.DB.prepare('SELECT rank FROM users WHERE id=?').bind(uid).first();
  const rank = target ? target.rank : '';
  const resolve = await loadWageResolver(env);
  const dutyMap = await loadDutyMap(env);
  const currentRows = (await env.DB.prepare('SELECT * FROM schedule WHERE user_id=? AND date=? ORDER BY slot').bind(uid, date).all()).results;
  const currentJson = JSON.stringify(currentRows.map(stripRow));

  await env.DB.prepare('DELETE FROM schedule WHERE user_id=? AND date=?').bind(uid, date).run();
  let slot = 0;
  for (const r of restoreRows) {
    let hours = 0, overtime = 0, pay = r.pay || 0;
    if (r.type === 'work' || r.type === 'paid') {
      const c = calcPay({ rank, date, tin: r.tin, tout: r.tout, duty: r.duty, loadEnd: r.load_end, showEnd: r.show_end, multi: r.multi ? 1 : 0 }, resolve, dutyMap);
      if (c) ({ hours, overtime, pay } = c);
    }
    await env.DB.prepare('INSERT INTO schedule(user_id,date,slot,type,site,venue,tin,tout,hours,overtime,pay,note,duty,load_end,show_end,multi) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(uid, date, slot, r.type || 'work', r.site || '', r.venue || '', r.tin || '', r.tout || '', hours, overtime, pay, r.note || '', r.duty || '', r.load_end || '', r.show_end || '', r.multi ? 1 : 0).run();
    slot++;
  }
  await env.DB.prepare('INSERT INTO schedule_history(ts,editor_id,target_id,date,before_json,after_json) VALUES(?,?,?,?,?,?)')
    .bind(jstTs(), me.id, uid, date, currentJson, JSON.stringify({ slots: restoreRows, _src: `編集の取り消し(履歴#${id}を元に復元、実行者:${me.name})` })).run();
}

// 本人による現場変更の報告を、実際にscheduleへ反映する共通処理。
// チーフ以上の即時反映(詳細なし)と、承認時(手配担当者が現場名・時刻・業務名などを補って確定する)の両方から呼ばれる。
// detail: { type:'work'|'off', site, venue, tin, tout, duty, load_end, show_end, multi, note }
async function applySelfReportToSchedule(env, uid, date, toldBy, detail) {
  const before = (await env.DB.prepare('SELECT * FROM schedule WHERE user_id=? AND date=? ORDER BY slot').bind(uid, date).all()).results;
  const beforeJson = JSON.stringify(before.map(stripRow));
  await env.DB.prepare('DELETE FROM schedule WHERE user_id=? AND date=?').bind(uid, date).run();

  let afterRow;
  if (detail.type !== 'work') {
    afterRow = { type: detail.type, site: '', venue: '', tin: '', tout: '', hours: 0, overtime: 0, pay: 0, note: '', duty: '', load_end: '', show_end: '', multi: 0 };
  } else {
    let hours = 0, overtime = 0, pay = 0;
    if (detail.tin && detail.tout) {
      const u = await env.DB.prepare('SELECT rank FROM users WHERE id=?').bind(uid).first();
      const resolve = await loadWageResolver(env);
    const dutyMap = await loadDutyMap(env);
      const c = calcPay({ rank: u ? u.rank : '', date, tin: detail.tin, tout: detail.tout, duty: detail.duty, loadEnd: detail.load_end, showEnd: detail.show_end, multi: detail.multi ? 1 : 0 }, resolve, dutyMap);
      if (c) ({ hours, overtime, pay } = c);
    }
    afterRow = {
      type: 'work', site: detail.site || '', venue: detail.venue || '', tin: detail.tin || '', tout: detail.tout || '',
      hours, overtime, pay, note: detail.note || '', duty: detail.duty || '', load_end: detail.load_end || '', show_end: detail.show_end || '', multi: detail.multi ? 1 : 0,
    };
  }
  await env.DB.prepare('INSERT INTO schedule(user_id,date,slot,type,site,venue,tin,tout,hours,overtime,pay,note,duty,load_end,show_end,multi) VALUES(?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(uid, date, afterRow.type, afterRow.site, afterRow.venue, afterRow.tin, afterRow.tout, afterRow.hours, afterRow.overtime, afterRow.pay, afterRow.note, afterRow.duty, afterRow.load_end, afterRow.show_end, afterRow.multi).run();
  const afterJsonStr = JSON.stringify({ slots: [stripRow(afterRow)], _src: `本人報告(伝えた人: ${toldBy})` });
  if (!isNonWorkOnlyChange(afterJsonStr)) {
    await env.DB.prepare('INSERT INTO schedule_history(ts,editor_id,target_id,date,before_json,after_json) VALUES(?,?,?,?,?,?)')
      .bind(jstTs(), uid, uid, date, beforeJson, afterJsonStr).run();
  }
}

// チーフによるメンバー指名の承認時、対象者のその日のスケジュールに現場を「追加」する
// (既存の予定は消さない。ただし休暇・×等(現場を含まない)のみの場合はそれらを消してから追加する)。
// 備考欄に「誰が希望したか」を記載する。
async function addNominatedSite(env, uid, date, site, venue, nominatorName) {
  const before = (await env.DB.prepare('SELECT * FROM schedule WHERE user_id=? AND date=? ORDER BY slot').bind(uid, date).all()).results;
  const beforeJson = JSON.stringify(before.map(stripRow));
  const hasWork = before.some(b => b.type === 'work');
  let nextSlot = 0;
  if (hasWork) {
    nextSlot = Math.max(...before.map(b => b.slot)) + 1;
  } else if (before.length) {
    await env.DB.prepare('DELETE FROM schedule WHERE user_id=? AND date=?').bind(uid, date).run();
  }
  const note = `${nominatorName}が希望`;
  await env.DB.prepare('INSERT INTO schedule(user_id,date,slot,type,site,venue,tin,tout,hours,overtime,pay,note,duty,load_end,show_end,multi) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(uid, date, nextSlot, 'work', site, venue, '', '', 0, 0, 0, note, '', '', '', 0).run();
  const after = (await env.DB.prepare('SELECT * FROM schedule WHERE user_id=? AND date=? ORDER BY slot').bind(uid, date).all()).results;
  await env.DB.prepare('INSERT INTO schedule_history(ts,editor_id,target_id,date,before_json,after_json) VALUES(?,?,?,?,?,?)')
    .bind(jstTs(), uid, uid, date, beforeJson, JSON.stringify({ slots: after.map(stripRow), _src: `メンバー指名(${nominatorName})` })).run();
}

// 「対象ユーザーに関する手配関連の申請(メンバー指名・現場変更報告)」を承認・却下する権限が
// あるかを判定する。管理者は常に可。チーフ(手配担当者ではない)は、たとえ何らかの理由で
// manager_idに設定されていたとしても対象外とする(承認業務は手配担当者以上に限定するため)。
// 専任の手配担当者(manager_id)が設定されていればその人のみ、未設定(チーフが直接手配している
// 状態)なら、同じ課の手配担当者(handler以上)なら誰でも操作できる。
async function canManageTarget(env, me, targetId) {
  if (me.role === 'admin') return true;
  if (lv(me) < 2) return false;
  const target = await env.DB.prepare('SELECT manager_id, ka FROM users WHERE id=?').bind(targetId).first();
  if (!target) return false;
  if (target.manager_id) return String(target.manager_id) === String(me.id);
  return target.ka === me.ka;
}

// メンバー指名1件を承認/却下する。単一処理・一括処理の両方から呼ばれる共通処理。
// 失敗時は例外を投げる(呼び出し側でメッセージを組み立てる)。
async function decideNomination(env, me, id, action) {
  const nom = await env.DB.prepare('SELECT * FROM site_nominations WHERE id=?').bind(id).first();
  if (!nom) throw new Error(`指名#${id}が見つかりません`);
  if (nom.status !== 'pending') throw new Error(`指名#${id}はすでに処理されています`);
  if (!(await canManageTarget(env, me, nom.target_id))) throw new Error('権限がありません');
  if (action === 'approve') {
    const nominator = await env.DB.prepare('SELECT name FROM users WHERE id=?').bind(nom.nominator_id).first();
    await addNominatedSite(env, nom.target_id, nom.date, nom.site, nom.venue, nominator ? nominator.name : '');
    await env.DB.prepare('UPDATE site_nominations SET status=?, decided_at=?, decided_by=? WHERE id=?').bind('approved', jstTs(), me.id, id).run();
    try {
      await notify(env, [nom.target_id], 'nomination',
        `✅ ${nom.date}の現場「${[nom.site, nom.venue].filter(Boolean).join('／')}」への指名が承認され、スケジュールに追加されました。(${nominator ? nominator.name : ''}さんの希望)`,
        `#/schedule/${nom.target_id}?month=${nom.date.slice(0, 7)}`);
    } catch (e) {}
  } else {
    await env.DB.prepare('UPDATE site_nominations SET status=?, decided_at=?, decided_by=? WHERE id=?').bind('rejected', jstTs(), me.id, id).run();
    try {
      await notify(env, [nom.nominator_id], 'nomination',
        `❌ ${nom.date}の現場「${[nom.site, nom.venue].filter(Boolean).join('／')}」への指名は見送られました。`,
        `#/nominations`);
    } catch (e) {}
  }
}

// 現場変更報告1件を承認/却下する。単一処理・一括処理の両方から呼ばれる共通処理。
// bodyDetailは、承認時に現場名・時刻等を上書きしたい場合のみ渡す(一括処理ではnullを渡し、
// 報告内容そのままで反映する)。type==='work'(現場への変更)を一括承認しようとした場合は、
// 詳細入力が必要なため明確なエラーを投げて弾く。
async function decideSelfReport(env, me, id, action, bodyDetail) {
  const rep = await env.DB.prepare('SELECT * FROM self_reports WHERE id=?').bind(id).first();
  if (!rep) throw new Error(`報告#${id}が見つかりません`);
  if (rep.status !== 'pending') throw new Error(`報告#${id}はすでに処理されています`);
  if (!(await canManageTarget(env, me, rep.user_id))) throw new Error('権限がありません');
  if (action === 'approve') {
    if (rep.type === 'work' && !bodyDetail) throw new Error(`報告#${id}は現場への変更のため、個別に詳細を入力して承認してください`);
    const detail = rep.type !== 'work'
      ? { type: rep.type }
      : {
          type: 'work',
          site: String(bodyDetail.site ?? rep.site ?? '').trim(),
          venue: String(bodyDetail.venue ?? rep.venue ?? '').trim(),
          tin: String(bodyDetail.tin || '').trim(),
          tout: String(bodyDetail.tout || '').trim(),
          duty: String(bodyDetail.duty || '').trim(),
          load_end: String(bodyDetail.load_end || '').trim(),
          show_end: String(bodyDetail.show_end || '').trim(),
          multi: bodyDetail.multi ? 1 : 0,
          note: String(bodyDetail.note || '').trim(),
        };
    await applySelfReportToSchedule(env, rep.user_id, rep.date, rep.told_by, detail);
    await env.DB.prepare('UPDATE self_reports SET status=?, decided_at=?, decided_by=? WHERE id=?').bind('approved', jstTs(), me.id, id).run();
    const typeLabelRow = rep.type !== 'work' ? await env.DB.prepare('SELECT label FROM report_type_options WHERE type=?').bind(rep.type).first() : null;
    const label = rep.type === 'work' ? [detail.site, detail.venue].filter(Boolean).join('／') : ((typeLabelRow && typeLabelRow.label) || rep.type);
    try {
      await notify(env, [rep.user_id], 'self_report',
        `✅ ${rep.date}の「${label}」への変更報告が承認され、スケジュールに反映されました。`,
        `#/schedule/${rep.user_id}?month=${rep.date.slice(0, 7)}`);
    } catch (e) {}
  } else {
    await env.DB.prepare('UPDATE self_reports SET status=?, decided_at=?, decided_by=? WHERE id=?').bind('rejected', jstTs(), me.id, id).run();
    const typeLabelRow = rep.type !== 'work' ? await env.DB.prepare('SELECT label FROM report_type_options WHERE type=?').bind(rep.type).first() : null;
    const label = rep.type === 'work' ? [rep.site, rep.venue].filter(Boolean).join('／') : ((typeLabelRow && typeLabelRow.label) || rep.type);
    try {
      await notify(env, [rep.user_id], 'self_report',
        `❌ ${rep.date}の「${label}」への変更報告は見送られました。手配担当者に確認してください。`,
        `#/schedule/${rep.user_id}?month=${rep.date.slice(0, 7)}`);
    } catch (e) {}
  }
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
      // 台帳の不在者休暇化は「現場に入る予定だった人が急に休暇に変更された」という重要な変更のため、
      // 他の休暇化処理とは異なり例外的に履歴へ記録する
      batch.push(env.DB.prepare('INSERT INTO schedule_history(ts,editor_id,target_id,date,before_json,after_json) VALUES(?,?,?,?,?,?)')
        .bind(ts, editorId, wu.user_id, date, beforeJson, JSON.stringify({ slots: JSON.parse(afterJson), _src: '台帳照合(不在のため休暇に変更)' })));
      clearedPeople++;
    }
  }

  if (batch.length) for (const part of chunk(batch, 200)) await env.DB.batch(part);
  return { clearedPeople, clearedDays: dates.length };
}

// 台帳取込(不在者を休暇にするcheckAbsentと同じタイミング・同じ判定材料)にあわせて、
// 手動登録した現場情報(site_registry)のうち、既に無くなったとみなせるものを自動削除する。
// 「その日の台帳データが今回の取込に含まれていて、かつその現場名が一件も見当たらない」場合だけ
// 削除する。対象日自体が今回の取込範囲に含まれていない場合は判断材料が無いため削除しない
// (例:今月分だけ取り込んだ場合、来月分として登録した現場は残す)。
async function clearAbsentSiteRegistry(env, rows) {
  const datesSites = {};
  for (const r of rows) {
    const date = String(r.date || '').trim();
    if (!date) continue;
    if (!datesSites[date]) datesSites[date] = new Set();
    if (r.site) datesSites[date].add(r.site); // r.site が非空 = その日その現場への実際の配置行(パーサー形式によりtype無しの場合もあるためsiteの有無で判定)
  }
  const dates = Object.keys(datesSites);
  if (!dates.length) return { clearedRegistrations: 0 };
  const ph = dates.map(() => '?').join(',');
  const registryRows = (await env.DB.prepare(`SELECT id, date, site FROM site_registry WHERE date IN (${ph})`).bind(...dates).all()).results;
  const toDelete = registryRows.filter(rg => !datesSites[rg.date].has(rg.site)).map(rg => rg.id);
  if (toDelete.length) {
    const ph2 = toDelete.map(() => '?').join(',');
    await env.DB.prepare(`DELETE FROM site_registry WHERE id IN (${ph2})`).bind(...toDelete).run();
  }
  return { clearedRegistrations: toDelete.length };
}

async function applyImportRows(env, rows, editorId, mode = 'replace-person-day', srcLabel = 'spreadsheet', isDaicho = false, opt = {}) {
  const ts = jstTs();
  const resolve = await loadWageResolver(env);
  const dutyMap = await loadDutyMap(env);
  let applied = 0, skipped = 0, skippedUnregistered = 0, skippedUnchanged = 0, skippedInvalid = 0, skippedOtherOrg = 0, skippedUnassigned = 0; const errors = [];
  const changes = []; // 今回の取込で実際に変更された内容(誰の・どの日の・現場が何になったか)。通知の詳細表示用
  // 登録番号→ユーザーの対応を1回のクエリで取得しておく(行ごとにSELECTするとAPIリクエスト数上限に達するため)
  const allUsers = (await env.DB.prepare('SELECT id, regno, rank, name, manager_id FROM users').all()).results;
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
    // 予定表ソース取込限定のオプション: 手配担当者が未設定(=チーフ手配のまま)のメンバーは、
    // 個別の手配担当者のスプレッドシートにたまたま名前が載っていても取り込み対象から除外する。
    // (台帳=実績の取込では、確定した勤務実態を漏らさないためこのフィルタは適用しない)
    if (opt.skipUnassigned && !u.manager_id) { skipped++; skippedUnassigned++; continue; }
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
    // 台帳・予定表の運用上、1人が1日に複数の異なる現場を掛け持つことは無い(現場入力は1日1件が原則)。
    // そのため、work(現場)タイプが2件以上検出された時点で、正常な勤務実態とは考えにくく、
    // シート解析時に複数日・複数タブのデータが誤って混入した可能性が高いと判断する。
    // 誤ったデータをそのままDBに書き込んでしまう方が実害が大きいため、安全側に倒してこの日は
    // 一切書き込まずスキップし、エラーとして報告する。
    const workItems = mergedItems.filter(m => m.type === 'work');
    if (workItems.length >= 2 || mergedItems.length >= 5) {
      const preview = mergedItems.slice(0, 4).map(m => m.type === 'work' ? (m.site || '(現場名なし)') : m.type).join('/');
      errors.push(`${name || uid}さん ${date}: 1日に${workItems.length}件の異なる現場データが検出されたため、データ異常の可能性があるとしてスキップしました(例: ${preview}${mergedItems.length > 4 ? '...' : ''})`);
      skipped += items.length; skippedInvalid += items.length;
      continue;
    }
    const mergeNote = mergedItems.length < items.length ? `(${items.length}行→${mergedItems.length}件に統合)` : '';
    // 取り込み行を整形
    const incoming = [];
    for (const r of mergedItems) {
      const type = ['work', 'off', 'paid', 'x', 'ok'].includes(r.type) ? r.type : 'work';
      let hours = 0, overtime = 0, pay = 0;
      if (type === 'work' || type === 'paid') {
        const c = calcPay({ rank, date, tin: r.tin, tout: r.tout, duty: r.duty, loadEnd: r.load_end, showEnd: r.show_end, multi: r.multi ? 1 : 0 }, resolve, dutyMap);
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
    // 現場(work)を含まない変更(休暇・×・1日OK等のみ)は変更履歴に記録しない(大量発生するため)
    const afterJsonForHist = JSON.stringify({ slots: JSON.parse(afterJson), _src: srcLabel });
    if (!isNonWorkOnlyChange(afterJsonForHist)) {
      batch.push(env.DB.prepare('INSERT INTO schedule_history(ts,editor_id,target_id,date,before_json,after_json) VALUES(?,?,?,?,?,?)')
        .bind(ts, editorId, uid, date, beforeJson, afterJsonForHist));
    }
    // 通知の詳細表示用に、変更内容を簡潔な文字列で記録する(現場名の要約。何百件にもなりうるため軽量に保つ)
    const summarize = (slots) => slots.length ? slots.map(s => s.type === 'work' ? (s.site || '(現場名なし)') : ({ off: '休暇', paid: '有給', x: 'NG', ok: '1日OK' }[s.type] || s.type)).join('/') : '(空欄)';
    changes.push({ uid, name: name || '', date, before: summarize(before), after: summarize(finalSlots) });
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
      for (const rr of matches) await notify(env, [rc.uid], 'rookie', `🔰 ${rr.next_date} ${rr.next_site} に新人「${rr.candidate_name}」が入る予定です`, '#/sites');
    }
  }
  // 台帳(実績)取込の場合のみ、研修受講(マナー/2部/SU)の自動判定を行う。
  // 予定表ソース等、まだ確定していない予定の取込では判定しない。
  if (isDaicho) { try { await processTrainingPromotions(env, rows); } catch (e) { errors.push('研修判定でエラー: ' + e.message); } }
  return { applied, skipped, skippedUnregistered, skippedUnchanged, skippedInvalid, skippedOtherOrg, skippedUnassigned, errors, changes, ts };
}

// 新しくアカウントが作成された時、氏名が一致する新人報告・ブラックリストのレコードに
// 所属課を記録する(「新人報告→ドラフト→登録」を飛ばして直接登録された場合の後追い対応)。
// これにより、該当レコードは新人共有・ブラックリスト共有(matchRookieAndBlacklist)の対象から外れる。
async function markAcquiredByName(env, name, ka) {
  const normName = s => String(s || '').replace(/[\s　]/g, '');
  const key = normName(name);
  if (!key) return;
  const kaVal = ka || '(所属未設定)';
  const reports = (await env.DB.prepare("SELECT id, candidate_name FROM reports WHERE COALESCE(acquired_ka,'')=''").all()).results;
  for (const r of reports) if (normName(r.candidate_name) === key) {
    await env.DB.prepare('UPDATE reports SET acquired_ka=? WHERE id=?').bind(kaVal, r.id).run();
  }
  const blist = (await env.DB.prepare("SELECT id, name FROM blacklist WHERE COALESCE(matched_ka,'')=''").all()).results;
  for (const b of blist) if (normName(b.name) === key) {
    await env.DB.prepare('UPDATE blacklist SET matched_ka=? WHERE id=?').bind(kaVal, b.id).run();
  }
}

// 台帳データ(氏名を含む行)を、新人報告(未獲得=acquired_kaが空)・ブラックリスト(未マッチ=matched_kaが空)の
// 対象者名と照合する。マッチしたら rookie_site_matches に記録し、その日・その現場に入っているチーフ以上へ
// 通知する。新人報告(良い人の共有)とブラックリスト(悪い人の共有)は、通知の種類・文言を明確に分け、
// 混同しないようにする。既にアプリに登録済み(acquired_ka/matched_kaが設定済み)の人はそもそも対象にしない。
async function matchRookieAndBlacklist(env, rows) {
  const normName = s => String(s || '').replace(/[\s　]/g, '');
  const rowsWithName = (rows || []).filter(r => r.personName && r.date && r.site);
  if (!rowsWithName.length) return;

  const pendingReports = (await env.DB.prepare("SELECT id, candidate_name FROM reports WHERE COALESCE(acquired_ka,'')=''").all()).results;
  const pendingBlacklist = (await env.DB.prepare("SELECT id, name FROM blacklist WHERE COALESCE(matched_ka,'')=''").all()).results;
  if (!pendingReports.length && !pendingBlacklist.length) return;

  const reportMap = {}; for (const r of pendingReports) { const k = normName(r.candidate_name); if (k) (reportMap[k] ||= []).push(r.id); }
  const blacklistMap = {}; for (const b of pendingBlacklist) { const k = normName(b.name); if (k) (blacklistMap[k] ||= []).push(b.id); }

  const candidates = [];
  for (const r of rowsWithName) {
    const key = normName(r.personName);
    if (!key) continue;
    if (reportMap[key]) for (const rid of reportMap[key]) candidates.push({ kind: 'report', matched_name: r.personName, report_id: rid, blacklist_id: null, date: r.date, site: r.site, venue: r.venue || '' });
    if (blacklistMap[key]) for (const bid of blacklistMap[key]) candidates.push({ kind: 'blacklist', matched_name: r.personName, report_id: null, blacklist_id: bid, date: r.date, site: r.site, venue: r.venue || '' });
  }
  if (!candidates.length) return;

  for (const m of candidates) {
    // UNIQUE制約(kind, matched_name, date, site)により、既に記録済みなら重複登録・重複通知はしない
    let inserted;
    try {
      await env.DB.prepare('INSERT INTO rookie_site_matches(kind,matched_name,report_id,blacklist_id,date,site,venue,created_at) VALUES(?,?,?,?,?,?,?,?)')
        .bind(m.kind, m.matched_name, m.report_id, m.blacklist_id, m.date, m.site, m.venue, jstTs()).run();
      inserted = true;
    } catch (e) { inserted = false; } // UNIQUE制約違反=既に通知済みなのでスキップ
    if (!inserted) continue;

    const chiefs = (await env.DB.prepare(
      "SELECT DISTINCT u.id FROM schedule s JOIN users u ON u.id=s.user_id WHERE s.date=? AND s.site=? AND s.type='work' AND u.role!='member'"
    ).bind(m.date, m.site).all()).results;
    if (!chiefs.length) continue;
    if (m.kind === 'report') {
      await notify(env, chiefs.map(c => c.id), 'rookie_share', `🔰 新人共有:「${m.matched_name}」が ${m.date} の現場「${m.site}」に入っています(新人報告あり)`, '#/sites');
    } else {
      await notify(env, chiefs.map(c => c.id), 'blacklist_share', `⚠️ 要注意共有:「${m.matched_name}」が ${m.date} の現場「${m.site}」に入っています(ブラックリスト登録あり)`, '#/sites');
    }
  }
}

// グリッドからフォーマットを推定。Cは勤務表(打刻/退勤/集合などの語)、それ以外はAB(月間表)
function detectFormat(grid) {
  const head = grid.slice(0, 14).flat().join(' ');
  if (/退勤時間|打刻時間|集合時間|終了予定時間|就業回数/.test(head)) return 'C';
  // 手配管理表形式: 「現場/会場/時間」の組が横に何人分も並び、日付列もブロックごとに繰り返される
  if (isArrangeSheet(grid)) return 'D';
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
    nameCol: idxOf('氏名'),
    rank: idxOf('ランク'),
    start: idxOf('開始時間'),
    tend: idxOf('終了予定時間', '終了予定'),
    tout: idxOf('退勤時間'),
    late: idxOf('遅刻･欠勤', '遅刻・欠勤'),
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
// xlsxのバイナリデータ(Uint8Array)から、シート情報を抽出する共通ロジック。
// Googleスプレッドシートのエクスポート(fetchXlsxSheets)、ユーザーが直接アップロードした
// Excelファイル(台帳Excel取込)の両方から共通で呼ばれる。
async function parseXlsxBuffer(buf, headerTitle) {
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) {
    throw new Error('xlsxファイルとして認識できませんでした(拡張子やファイル形式をご確認ください)');
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

async function fetchXlsxSheets(id) {
  const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`;
  // 応答が極端に遅い/ハングするシートがあっても、他の予定表ソースの処理をブロックしないよう
  // 明示的にタイムアウトを設定する(cron実行1回あたりの上限を考慮し25秒)。
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 25000);
  let resp;
  try {
    resp = await fetch(url, { redirect: 'follow', headers: GSHEET_FETCH_HEADERS, signal: ac.signal });
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('シートの取得がタイムアウトしました(25秒)。ファイルが大きすぎるか、共有設定を確認してください。');
    throw e;
  } finally {
    clearTimeout(timer);
  }
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
  return parseXlsxBuffer(buf, headerTitle);
}

// 台帳Excel(xlsxバイナリ)を解析し、DBへ反映する共通処理。
// アップロードされたファイル(POST /import-excel-daicho)、台帳保管から再取込するファイル
// (POST /daicho/reimport-from-archive)、両方から共通で呼ばれる。
// R2への保存や通知等、呼び出し元ごとに異なる後処理は、この関数の外側で行う。
async function processDaichoExcelBuffer(env, buf, fileName, targetDate, editorId, keywordMap) {
  const got = await parseXlsxBuffer(buf, fileName.replace(/\.xlsx?$/i, ''));
  let allRows = [], sheetReport = [];
  // ファイル名・シート自身のいずれからも年月が拾えない手配管理表(フォーマットD)向けに、
  // ユーザーが指定したtargetDateの年月をfallbackとして使う(スプレッドシート取込と違い、
  // 台帳Excelは1ファイル=1日という運用のため、誤って別月と混同するリスクが低いため許可する)。
  const fallbackYm = targetDate ? targetDate.slice(0, 7) : null;
  for (const sh of got.sheets) {
    const grid = sh.grid;
    if (!grid || !grid.length) continue;
    try {
      const fmt = detectFormat(grid);
      let parsed;
      if (fmt === 'C') parsed = parseFormatC(grid, null, targetDate || null).rows;
      else if (fmt === 'D') {
        const ym = detectYmFromGrid(grid, fallbackYm);
        if (!ym) { sheetReport.push({ name: sh.name, count: 0, note: '年月を読み取れず、対象日の指定もなかったためスキップしました' }); continue; }
        parsed = parseFormatD(grid, ym, keywordMap).rows;
      }
      else parsed = parseFormatAB(grid, fallbackYm || jstDate().slice(0, 7), null, keywordMap).rows;
      if (parsed && parsed.length) { allRows = allRows.concat(parsed); sheetReport.push({ name: sh.name, count: parsed.length }); }
    } catch (e) {
      sheetReport.push({ name: sh.name, count: 0, note: `解析エラー: ${e.message}` });
    }
  }
  if (!allRows.length) return { ok: false, error: 'データを読み取れませんでした', sheetReport };
  const r = await applyImportRows(env, allRows, editorId, 'replace-person-day', `台帳Excel取込(${fileName})`, true);
  return { ok: true, applied: r.applied, changes: r.changes || [], ts: r.ts, allRows, sheetReport };
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
  for (const rowm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowAttrs = rowm[1] || '';
    const rowContent = rowm[2] || '';
    // Excelは完全に空の行のXMLタグ自体を省略することがある。単純に<row>の出現順で
    // grid配列に詰めると、その分だけ以降の全ての行が1行以上ズレてしまう
    // (=年月・ヘッダー行の位置がタブごとに不揃いになり、正しく取り込めない原因になっていた)。
    // 必ずrow自身のr属性(実際の行番号、1始まり)を読み、その位置に配置する。
    const rNum = (rowAttrs.match(/r="(\d+)"/) || [])[1];
    const ri = rNum ? (parseInt(rNum, 10) - 1) : grid.length;

    const cells = [];
    for (const cm of rowContent.matchAll(/<c\b([^>]*?)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
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
    while (grid.length < ri) grid.push([]);
    grid[ri] = cells;
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
        // 搬入終了 / 終演時間 は "搬入終了/11:00"、セル"搬入終了"+右隣、セル"搬入終了"+直下 の3パターンに対応
        let mm;
        if (!loadEnd) {
          if ((mm = s.match(/搬入終了[\s\/:：]+(\d{1,2}:\d{2})/))) loadEnd = mm[1];
          else if (/^搬入終了$/.test(strim)) {
            const t = normTime(line[c + 1]); if (t) loadEnd = t;
            else { const t2 = normTime((rows[r + 1] || [])[c]); if (t2) loadEnd = t2; }
          }
        }
        if (!showEnd) {
          if ((mm = s.match(/終演[時間]*[\s\/:：]+(\d{1,2}:\d{2})/))) showEnd = mm[1];
          else if (/^終演時間$/.test(strim)) {
            const t = normTime(line[c + 1]); if (t) showEnd = t;
            else { const t2 = normTime((rows[r + 1] || [])[c]); if (t2) showEnd = t2; }
          }
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
      // U列(退勤時間)またはW列(遅刻・欠勤)に「欠勤」「枠移動」と書かれている行は、現場データ
      // としては登録しない(スキップする)。
      // ・欠勤: この夜、他のどの台帳ファイルにも名前が登場しなければ、不在者休暇化(既存ロジック)
      //   により自動的に休暇へ変更される。
      // ・枠移動: 実際には別の現場(別の台帳ファイル)に配置されているはずなので、この行の情報は
      //   使わず、移動先のシートに登場する正しいデータを優先する。
      const toutRaw = cols.tout >= 0 ? String(line[cols.tout] || '').trim() : '';
      const lateRaw = cols.late >= 0 ? String(line[cols.late] || '').trim() : '';
      if (/欠勤|枠移動/.test(toutRaw) || /欠勤|枠移動/.test(lateRaw)) { continue; }
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
      const personName = cols.nameCol >= 0 ? String(line[cols.nameCol] || '').trim() : '';
      if (!tin && !tout && !duty) continue;
      out.push({ regno, date: blockDate, site, venue: venueCell, tin, tout, duty, load_end: blockLoadEnd, show_end: blockShowEnd, multi, note, org, personName });
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
function parseChiefScheduleSheet(grid, fromDate, keywordMap) {
  keywordMap = keywordMap || {};
  const out = [];
  // ラベル行("現場"または"現場名"を含むセルが複数並ぶ行)を探す
  let labelRow = -1, genbaCols = [];
  for (let r = 0; r < Math.min(grid.length, 10); r++) {
    const line = grid[r] || [];
    const cols = [];
    for (let c = 0; c < line.length; c++) if (/^現場名?$/.test(String(line[c]).trim())) cols.push(c);
    if (cols.length >= 1) { labelRow = r; genbaCols = cols; break; }
  }
  if (labelRow < 0) return { rows: out, labelFound: false };
  const nameRow = grid[labelRow - 2] || [];
  const regnoRow = grid[labelRow - 1] || [];
  const blocks = genbaCols.map(c => ({
    col: c,
    name: String(nameRow[c] || '').trim(),
    regno: normRegno(regnoRow[c]),
  })).filter(b => /^\d{3,}$/.test(b.regno));
  if (!blocks.length) return { rows: out, labelFound: true };

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
      if (!site) continue; // 空欄はスキップ(現状維持)
      const kw = keywordMap[site];
      if (kw) { if (kw !== 'ignore') out.push({ regno: b.regno, date, type: kw }); continue; }
      // 非現場キーワードに一致しない(=現場名・"手配"含む)は予定ありとして登録。時刻情報はこの表にはない。
      out.push({ regno: b.regno, date, type: 'work', site, venue, tin: '', tout: '', duty: '' });
    }
  }
  return { rows: out, labelFound: true };
}

// フォーマットA/B(個人スケジュール月間表・横長)を解析
// 3行目(idx2)に登録番号、メンバーごとに3列セット(現場名・会場・備考/入力)
// 5行目以降(idx4+)に日付(B列)とデータ。ym='2026-06' を日付補完に使う
function parseFormatAB(rows, ym, cfg, keywordMap) {
  keywordMap = keywordMap || {};
  const regnoRow = (cfg && cfg.regnoRow) != null ? cfg.regnoRow : 2;   // 0始まりで3行目
  const firstDateRow = (cfg && cfg.firstDateRow) != null ? cfg.firstDateRow : 4;
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
      const kw = keywordMap[site];
      if (kw) { if (kw !== 'ignore') out.push({ regno: m.regno, date, type: kw, site: '', venue: '', note }); continue; }
      out.push({ regno: m.regno, date, type: 'work', site, venue, note });
    }
  }
  return { rows: out };
}

// シートの左上あたりから「年」と「月」を拾って YYYY-MM を作る。
// 手配管理表は1タブ=1か月で、年と月が別セルに分かれて置かれているため、
// 取り込み実行日ではなくシート自身が持つ年月を優先して使う(翌月分を先に取り込む運用に対応)。
function detectYmFromGrid(grid, fallbackYm) {
  let year = '', month = '';
  // シリアル値として解釈してよい妥当範囲(実行時点の前後2年程度)。
  // 範囲を広く取りすぎると、現場の何らかの数値(時間・金額等)を誤って日付と解釈してしまうリスクがあるため絞る。
  const nowY = new Date(Date.now() + 9 * 3600e3).getUTCFullYear();
  const serialMin = Math.round(Date.UTC(nowY - 1, 0, 1) / 86400000) + 25569;
  const serialMax = Math.round(Date.UTC(nowY + 2, 11, 31) / 86400000) + 25569;
  for (let r = 0; r < Math.min(grid.length, 6); r++) {
    const line = grid[r] || [];
    for (let c = 0; c < Math.min(line.length, 8); c++) {
      const v = String(line[c] == null ? '' : line[c]).trim();
      if (!year) { const m = v.match(/^(20\d{2})年?$/); if (m) year = m[1]; }
      if (!month) { const m = v.match(/^(\d{1,2})月$/); if (m) month = String(m[1]).padStart(2, '0'); }
      // 「6月」等をExcelに入力すると、自動的に日付として認識され、表示形式だけが「M月」等になり、
      // 実際のセル値は日付シリアル値になっていることがある。テキストで検出できなかった場合は、
      // シリアル値からも年・月を拾う。
      if ((!year || !month) && v !== '') {
        const n = Number(v);
        if (Number.isFinite(n) && n >= serialMin && n <= serialMax) {
          const ds = excelSerialToDate(n);
          if (ds) {
            const [dy, dm, dd] = ds.split('-');
            // 「1月1日」は、年だけを入力したセルが日付化された結果である可能性が高い
            // (例:「2026」とだけ入力→2026-01-01と解釈される)。この場合は年情報としてのみ扱い、
            // 月情報としては採用しない(本来の月専用セルの値を上書きしてしまわないようにするため)。
            const isYearOnlyGuess = dm === '01' && dd === '01';
            if (!year) year = dy;
            if (!month && !isYearOnlyGuess) month = dm;
          }
        }
      }
    }
  }
  return (year && month) ? `${year}-${month}` : fallbackYm;
}

// ヘッダー行(「現場」が2つ以上ならぶ行)を探す。見つからなければ -1。
function findArrangeHeaderRow(grid) {
  for (let r = 0; r < Math.min(grid.length, 12); r++) {
    let n = 0;
    for (const v of (grid[r] || [])) if (String(v == null ? '' : v).trim() === '現場') n++;
    if (n >= 2) return r;
  }
  return -1;
}

// 「1日」「15日」のような値、または日付シリアル値が繰り返し現れる列(=日付列)を検出する。
// 手配管理表は横に長いため、日付列がブロックごとに何度も出てくる。
// シート側で日付セルとして書式設定されている場合はシリアル値で届くため、両方を数える。
function findDayCols(grid, headerRow) {
  const count = {};
  for (let r = headerRow + 1; r < grid.length; r++) {
    const line = grid[r] || [];
    for (let c = 0; c < line.length; c++) {
      const v = line[c];
      const s = String(v == null ? '' : v).trim();
      const isDayText = /^\d{1,2}日$/.test(s);
      const n = Number(s);
      const isSerial = s !== '' && Number.isFinite(n) && n > 40000 && n < 60000;
      if (isDayText || isSerial) count[c] = (count[c] || 0) + 1;
    }
  }
  // たまたま1行だけ「3日」等が入っている列を拾わないよう、5行以上あるものだけを日付列とみなす
  return Object.keys(count).map(Number).filter(c => count[c] >= 5).sort((a, b) => a - b);
}

// 手配管理表(フォーマットD)かどうかを判定する。
// 「現場」が2つ以上ならぶヘッダー行があり、かつ日付列が2つ以上ある(=ブロックが横に繰り返される)ことを条件とする。
// 日付列が1つしかない従来のチーフ予定表と取り違えないための条件。
function isArrangeSheet(grid) {
  const hr = findArrangeHeaderRow(grid);
  return hr >= 1 && findDayCols(grid, hr).length >= 2;
}

// フォーマットD(手配管理表)を解析する。
// 「日付列 + 複数人分の[現場/会場/時間]列」というブロックが、横方向に何組も並ぶ形式。
//   2行目: (左端)年       …… 各人の氏名(現場列の位置)、ランク(時間列の位置)
//   3行目: (左端)月       …… 各人の登録番号(現場列の位置)、最寄駅(会場列の位置)
//   4行目: 「現場/会場/時間」のヘッダーが人数分くり返される
//   5行目以降: (日付列)「1日」「月」…… 各人のその日の現場名・会場名
// 日付列がブロックごとに繰り返されるため、各人の日付は「自分より左側で最も近い日付列」から取る。
// 「時間」列は見込み時間(実績のIN/OUTではない)なので、給与計算に影響させないため取り込まない。
function parseFormatD(grid, ym, keywordMap, fromDate) {
  keywordMap = keywordMap || {};
  const cell = (r, c) => String(((grid[r] || [])[c]) == null ? '' : (grid[r] || [])[c]).trim();
  // 日付は「1日」等のテキストと、日付書式のセル(シリアル値)の両方に対応する
  const toDate = (v) => normSheetDate(v, ym) || excelSerialToDate(v);

  const headerRow = findArrangeHeaderRow(grid);
  if (headerRow < 1) return { rows: [] }; // 登録番号行(1つ上)が必要なので headerRow>=1

  // --- 各メンバーのブロック(現場列・会場列)を組み立てる ---
  const header = grid[headerRow] || [];
  const blocks = [];
  for (let c = 0; c < header.length; c++) {
    if (String(header[c] == null ? '' : header[c]).trim() !== '現場') continue;
    // 「現場」の右隣から数列以内にある「会場」を探す(結合セル解除で空列がはさまる場合があるため)
    let venueCol = -1;
    for (let d = c + 1; d <= c + 3 && d < header.length; d++) {
      const v = String(header[d] == null ? '' : header[d]).trim();
      if (v === '会場') { venueCol = d; break; }
      if (v === '現場') break; // 次の人の領域に入ったので打ち切り
    }
    // 登録番号はヘッダーの1つ上の行、現場列と同じ位置にある
    const regno = normRegno(cell(headerRow - 1, c));
    if (!/^\d{3,}$/.test(regno)) continue;
    blocks.push({ regno, siteCol: c, venueCol });
  }
  if (!blocks.length) return { rows: [] };

  const dayCols = findDayCols(grid, headerRow);
  if (!dayCols.length) return { rows: [] };
  // 各ブロックに、自分より左側で最も近い日付列を割り当てる
  for (const b of blocks) {
    let dc = dayCols[0];
    for (const c of dayCols) { if (c < b.siteCol) dc = c; else break; }
    b.dayCol = dc;
  }

  // --- 明細を組み立てる ---
  const out = [];
  for (let r = headerRow + 1; r < grid.length; r++) {
    for (const b of blocks) {
      const date = toDate(cell(r, b.dayCol));
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (fromDate && date < fromDate) continue; // 予定表として取り込む場合、対象日より前は実績を優先するためスキップ
      const site = normalizeSiteName(cell(r, b.siteCol));
      if (!site) continue;
      const kw = keywordMap[site];
      if (kw) { if (kw !== 'ignore') out.push({ regno: b.regno, date, type: kw, site: '', venue: '', note: '' }); continue; }
      const venue = b.venueCol >= 0 ? cell(r, b.venueCol) : '';
      out.push({ regno: b.regno, date, type: 'work', site, venue, note: '' });
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

async function notifyChiefs(env, type, message, link = '') {
  const rows = (await env.DB.prepare("SELECT id FROM users WHERE role!='member'").all()).results;
  await notify(env, rows.map(r => r.id), type, message, link);
}

// 新人の次回現場と一致するスケジュールを持つ人へ通知
async function rookieNotify(env, r) {
  if (!r.next_site || !r.next_date) return;
  const rows = (await env.DB.prepare("SELECT user_id FROM schedule WHERE date=? AND site=? AND type='work'").bind(r.next_date, r.next_site).all()).results;
  await notify(env, rows.map(x => x.user_id), 'rookie', `🔰 ${r.next_date} ${r.next_site} に新人「${r.candidate_name}」が入る予定です`, '#/sites');
}

async function auth(req, env) {
  const t = (req.headers.get('authorization') || '').replace('Bearer ', '');
  if (!t) return null;
  const s = await env.DB.prepare(
    'SELECT s.token AS _tk, s.handler AS _handler, s.created AS _created, s.last_seen AS _lastSeen, u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?'
  ).bind(t).first();
  if (!s) return null;
  // セッションの有効期限: 30日間操作が無ければ失効(アイドルタイムアウト)、
  // また作成から90日経過したら操作の有無に関わらず強制失効させる(トークン漏洩時の被害を限定する)
  const now = Date.now();
  const IDLE_LIMIT = 30 * 24 * 3600e3, ABS_LIMIT = 90 * 24 * 3600e3;
  if ((now - s._lastSeen) > IDLE_LIMIT || (now - s._created) > ABS_LIMIT) {
    await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(t).run();
    return null;
  }
  // メンテナンスモード中は、管理者以外のセッションは無効として扱う
  // (通常はメンテナンス開始時に一括削除されるが、念のためここでも二重にチェックする)
  if (s.role !== 'admin' && (await getSetting(env, 'maintenance_mode', '0')) === '1') {
    await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(t).run();
    return null;
  }
  await env.DB.prepare('UPDATE sessions SET last_seen=? WHERE token=?').bind(now, t).run();
  return s;
}

// ===== 日付×人のマトリックス(スケジュール一覧・現場の稼働表で共通利用) =====
// dates: 対象日(YYYY-MM-DD)の配列。uidList: nullなら全メンバー、配列ならそのuidのみに絞る。
async function buildScheduleMatrixRows(env, dates, uidList) {
  const ph = dates.map(() => '?').join(',');
  const [membersRes, scheduleRes, managersRes] = await Promise.all([
    uidList
      ? env.DB.prepare(`SELECT id, name, regno, rank, ka, han, manager_id, suspended FROM users WHERE id IN (${uidList.map(() => '?').join(',')}) ORDER BY regno`).bind(...uidList).all()
      : env.DB.prepare("SELECT id, name, regno, rank, ka, han, manager_id, suspended FROM users ORDER BY regno").all(),
    uidList
      ? env.DB.prepare(`SELECT user_id, date, type, site, venue, note FROM schedule WHERE date IN (${ph}) AND user_id IN (${uidList.map(() => '?').join(',')}) ORDER BY user_id, date, slot`).bind(...dates, ...uidList).all()
      : env.DB.prepare(`SELECT user_id, date, type, site, venue, note FROM schedule WHERE date IN (${ph}) ORDER BY user_id, date, slot`).bind(...dates).all(),
    env.DB.prepare("SELECT id, name FROM users WHERE role IN ('handler','admin')").all(),
  ]);
  const members = membersRes.results;
  const scheduleRows = scheduleRes.results;
  const byUserDate = {};
  for (const r of scheduleRows) { const key = r.user_id + '|' + r.date; (byUserDate[key] ||= []).push(r); }
  const managers = managersRes.results;
  const mgrName = {}; for (const m of managers) mgrName[m.id] = m.name;
  // 担当未設定は課ごとの「チーフ手配(1課/2課)」として扱う(特定の実在アカウントには紐付けない)
  const chiefLabel = m => m.ka === '1課' ? 'チーフ手配(1課)' : m.ka === '2課' ? 'チーフ手配(2課)' : 'チーフ手配';

  const cellFor = (uid, date) => {
    const slots = byUserDate[uid + '|' + date] || [];
    const workSlots = slots.filter(s => s.type === 'work' && s.site);
    const nonWork = slots.find(s => s.type && s.type !== 'work');
    if (workSlots.length) return {
      status: 'work',
      detail: workSlots.map(s => [s.site, s.venue].filter(Boolean).join('／')).join('、'),
      sites: workSlots.map(s => s.site),
      note: '',
    };
    if (nonWork) return { status: nonWork.type, detail: '', sites: [], note: nonWork.note || '' };
    return { status: 'none', detail: '', sites: [], note: '' };
  };

  return members.map(m => ({
    id: m.id, name: m.name, regno: m.regno, rank: m.rank, ka: m.ka, han: m.han,
    managerId: m.manager_id, managerName: m.manager_id ? ((mgrName[m.manager_id] ? mgrName[m.manager_id] + '手配' : 'チーフ手配')) : chiefLabel(m),
    suspended: m.suspended ? 1 : 0,
    days: dates.map(date => cellFor(m.id, date)),
  }));
}

// 現場名(またはvenueが同じ場合はvenue)を軸に、指定日を含む「連続した日程」の範囲を求める。
// 複数日にわたる現場(仕込み〜本番〜バラシ等)を、暦日の連続性から機械的に推定するためのヘルパー。
// 日をまたいだ現場名の表記ゆれに備え、現場名一致が無い日でも会場名が一致すれば範囲に含める
// (現場名一致を優先し、会場名一致は補助的に使う)。現場の合間(その現場が入っていない中日)は
// 最大3日までまたいで連続とみなし、それを超えて現場が入っていない日が続く場合はそこで期間を
// 打ち切る(合間が無く連続している限り、期間の長さ自体に上限は無い)。
async function findGigDateRange(env, date, site) {
  const siteRow = await env.DB.prepare(
    "SELECT venue FROM schedule WHERE date=? AND site=? AND type='work' LIMIT 1"
  ).bind(date, site).first();
  const venue = siteRow ? (siteRow.venue || '') : '';

  const GAP_MAX = 3; // 現場が入っていない日を、最大何日までまたいで連続とみなすか
  const SAFETY_WINDOW = 60; // DB検索範囲の安全上限(実際の現場でここまで離れることは想定していない)
  const addDays = (s, n) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  };
  const winFrom = addDays(date, -SAFETY_WINDOW), winTo = addDays(date, SAFETY_WINDOW);
  const matchRows = venue
    ? (await env.DB.prepare(
        "SELECT DISTINCT date FROM schedule WHERE type='work' AND date>=? AND date<=? AND (site=? OR venue=?)"
      ).bind(winFrom, winTo, site, venue).all()).results
    : (await env.DB.prepare(
        "SELECT DISTINCT date FROM schedule WHERE type='work' AND date>=? AND date<=? AND site=?"
      ).bind(winFrom, winTo, site).all()).results;
  const matchDates = new Set(matchRows.map(r => r.date));

  const extend = (start, dir) => {
    let cur = start;
    while (true) {
      let bridged = null;
      for (let g = 1; g <= GAP_MAX + 1; g++) {
        const cand = addDays(cur, dir * g);
        if (matchDates.has(cand)) { bridged = cand; break; }
      }
      if (!bridged) break;
      cur = bridged;
    }
    return cur;
  };
  const from = extend(date, -1);
  const to = extend(date, 1);

  const dates = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);
  return { venue, from, to, dates };
}

async function api(req, env, url) {
  const path = url.pathname.replace(/^\/api/, '');
  const method = req.method;
  const body = method === 'GET' ? {} : await req.json().catch(() => ({}));

  // ---- 認証不要 ----
  if (method === 'POST' && path === '/login') {
    const { regno, password } = body;
    const regnoTrim = String(regno || '').trim();
    if (!regnoTrim) return ERR('登録番号を入力してください');

    // ブルートフォース対策: 同じ登録番号への失敗が続いたら一定時間ロックする
    const attempt = await env.DB.prepare('SELECT * FROM login_attempts WHERE regno=?').bind(regnoTrim).first();
    const now = Date.now();
    if (attempt && attempt.locked_until > now) {
      const waitMin = Math.ceil((attempt.locked_until - now) / 60000);
      return ERR(`ログイン試行回数が上限に達しました。${waitMin}分後に再度お試しください。`, 429);
    }
    const MAX_FAIL = 5, LOCK_MS = 15 * 60 * 1000;
    const recordFail = async () => {
      const fc = (attempt ? attempt.fail_count : 0) + 1;
      const lockedUntil = fc >= MAX_FAIL ? now + LOCK_MS : 0;
      await env.DB.prepare(
        'INSERT INTO login_attempts(regno,fail_count,locked_until,last_attempt) VALUES(?,?,?,?) ON CONFLICT(regno) DO UPDATE SET fail_count=excluded.fail_count, locked_until=excluded.locked_until, last_attempt=excluded.last_attempt'
      ).bind(regnoTrim, fc, lockedUntil, now).run();
    };

    const u = await env.DB.prepare('SELECT * FROM users WHERE regno=?').bind(regnoTrim).first();
    if (!u) { await recordFail(); return ERR('登録番号またはパスワードが違います', 401); }
    if (u.suspended) return ERR('このアカウントは停止されています。管理者にお問い合わせください。', 403);
    if (u.role !== 'admin' && (await getSetting(env, 'maintenance_mode', '0')) === '1') {
      return ERR('現在メンテナンス中です。しばらくしてから再度お試しください。', 503);
    }
    if (!u.pass_hash) {
      if (password !== u.regno) { await recordFail(); return ERR('登録番号またはパスワードが違います', 401); }
      const salt = rnd();
      const h = await pbkdf2(password, salt);
      // 初期パスワード(=登録番号)での初回ログイン → 強制変更フラグを立てる
      await env.DB.prepare('UPDATE users SET pass_hash=?, salt=?, must_change=1 WHERE id=?').bind(h, salt, u.id).run();
      u.must_change = 1;
    } else {
      const h = await pbkdf2(password || '', u.salt);
      if (h !== u.pass_hash) { await recordFail(); return ERR('登録番号またはパスワードが違います', 401); }
    }
    if (attempt) await env.DB.prepare('DELETE FROM login_attempts WHERE regno=?').bind(regnoTrim).run();
    const token = rnd();
    await env.DB.prepare('INSERT INTO sessions(token,user_id,handler,last_seen,created) VALUES(?,?,0,?,?)').bind(token, u.id, Date.now(), Date.now()).run();
    return J({ token, user: { ...pub(u), handler: 0 } });
  }

  // ---- Googleカレンダー等への購読フィード配信(認証不要・専用トークンで本人確認) ----
  let icsm;
  if (method === 'GET' && (icsm = path.match(/^\/calendar\/([a-zA-Z0-9]+)\.ics$/))) {
    const token = icsm[1];
    const u = await env.DB.prepare('SELECT id, name FROM users WHERE calendar_token=?').bind(token).first();
    if (!u) return new Response('Not Found', { status: 404 });
    const fromDate = jstDate();
    const toDateObj = new Date(Date.now() + 9 * 3600e3); toDateObj.setMonth(toDateObj.getMonth() + 3);
    const toDate = toDateObj.toISOString().slice(0, 10);
    const rows = (await env.DB.prepare(
      "SELECT * FROM schedule WHERE user_id=? AND date>=? AND date<=? AND type IN ('work','off','paid','ok') ORDER BY date, slot"
    ).bind(u.id, fromDate, toDate).all()).results;
    const events = rows.map(r => scheduleRowToIcsEvent(u.id, r)).join('\r\n');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RB Jigyou 2ka//Schedule//JA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      `X-WR-CALNAME:${icsEscape(u.name + 'のスケジュール(RB事業2課)')}`, events, 'END:VCALENDAR'].filter(Boolean).join('\r\n');
    return new Response(ics, { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } });
  }

  // ---- スプレッドシート取り込み(GAS用・共有トークン認証)----
  // GAS から POST /api/import-schedule で呼び出す。セッション不要。
  if (method === 'POST' && path === '/import-schedule') {
    const tok = await getSetting(env, 'import_token', '');
    if (!tok || body.token !== tok) return ERR('取り込みトークンが違います', 403);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) return ERR('取り込むデータがありません(rowsが空です)');
    // 台帳(実績)ではなく「予定」の連携なので、既に何か入っている日は上書きしない
    const result = await applyImportRows(env, rows, 0, 'skip-if-exists', 'spreadsheet', false, { skipUnassigned: true });
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

  // アップデートのお知らせを確認済みにする
  if (method === 'POST' && path === '/update-notice/seen') {
    await env.DB.prepare('UPDATE users SET seen_update_version=? WHERE id=?').bind(CURRENT_UPDATE_VERSION, me.id).run();
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
            `⚠️(${jstTs()}) ${me.name}さん(${me.regno}/${me.role})が手配者パスワードを入力しましたが、権限がないためアクセスを拒否しました。`, '#/handler-status');
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
  // メンテナンスモード: 有効にすると、管理者以外の全員を強制ログアウトし、
  // メンテナンス終了まで管理者以外はログインできなくする(login/authの両方でチェックしている)。
  if (method === 'GET' && path === '/settings/maintenance') {
    if (me.role !== 'admin') return ERR('ページが見つかりません', 404);
    return J({ enabled: (await getSetting(env, 'maintenance_mode', '0')) === '1' });
  }
  if (method === 'POST' && path === '/settings/maintenance') {
    if (me.role !== 'admin') return ERR('管理者のみ操作できます', 403);
    const enable = !!body.enabled;
    await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('maintenance_mode',?)").bind(enable ? '1' : '0').run();
    let loggedOut = 0;
    if (enable) {
      const targets = (await env.DB.prepare("SELECT s.token FROM sessions s JOIN users u ON u.id=s.user_id WHERE u.role!='admin'").all()).results;
      loggedOut = targets.length;
      await env.DB.prepare("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE role!='admin')").run();
    }
    return J({ ok: 1, enabled: enable, loggedOut });
  }

  // 機能ごとの公開状態。左メニューの各画面を、管理者が個別に
  // ready(通常通り公開) / hidden(準備中) / maintenance(メンテナンス中) に切り替えられる。
  // キーはhashのパス部分(例: '#/summary' → 'summary')。新しい画面を追加したら、
  // ここ(FEATURE_KEYS)とフロントエンドのFEATURE_LABELSの両方に追記する。
  // 未設定のキーは既定で'ready'として扱う(既存画面が突然消えないように)。
  const FEATURE_KEYS = [
    'dashboard',
    'edit', 'self-reports', 'availability', 'availability-team', 'nominate', 'nominations',
    'sites', 'members', 'summary', 'member-stats', 'day-schedule',
    'report', 'reports', 'draft', 'blacklist', 'report-export',
    'admin', 'admin-settings', 'role-permissions', 'handler-status',
    'import', 'sched-sources', 'daicho', 'member-summary',
  ];
  if (method === 'GET' && path === '/settings/feature-status') {
    const status = {};
    for (const k of FEATURE_KEYS) status[k] = await getSetting(env, 'feature_status_' + k, 'ready');
    return J(status);
  }
  if (method === 'POST' && path === '/settings/feature-status') {
    if (me.role !== 'admin') return ERR('管理者のみ操作できます', 403);
    const key = String(body.key || '');
    if (!FEATURE_KEYS.includes(key)) return ERR('不正な機能キーです');
    const status = String(body.status || 'ready');
    if (!['ready', 'hidden', 'maintenance'].includes(status)) return ERR('不正な状態です');
    await env.DB.prepare("REPLACE INTO settings(key,value) VALUES(?,?)").bind('feature_status_' + key, status).run();
    return J({ ok: 1 });
  }

  if (method === 'DELETE' && path === '/handler-mode') {
    await env.DB.prepare('UPDATE sessions SET handler=0 WHERE token=?').bind(me._tk).run();
    return J({ ok: 1 });
  }

  // ---- ユーザー ----
  if (method === 'GET' && path === '/users') {
    if (!has(me, 'members_view')) return ERR('ページが見つかりません', 404);
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
    return J({ id: u.id, name: u.name, regno: u.regno, role: u.role, extraPerms: getPerms(u), revokedPerms: getRevokedPerms(u) });
  }
  // 特定ユーザーの追加権限・剥奪権限を保存(管理者のみ)
  if (method === 'PUT' && (pum = path.match(/^\/users\/(\d+)\/perms$/))) {
    if (!has(me, 'account_manage')) return ERR('権限がありません', 403);
    const uid = Number(pum[1]);
    const keys = Array.isArray(body.perms) ? body.perms.filter(k => PERMS[k]) : [];
    const revokedKeys = Array.isArray(body.revokedPerms) ? body.revokedPerms.filter(k => PERMS[k]) : [];
    // 同じキーを追加かつ剥奪、という矛盾状態は作らない(剥奪を優先し、追加リストからは除く)
    const finalKeys = keys.filter(k => !revokedKeys.includes(k));
    await env.DB.prepare('UPDATE users SET extra_perms=?, revoked_perms=? WHERE id=?').bind(JSON.stringify(finalKeys), JSON.stringify(revokedKeys), uid).run();
    return J({ ok: 1, extraPerms: finalKeys, revokedPerms: revokedKeys });
  }

  // ロール単位の一括権限設定(メンツ全員/チーフ全員などに、まとめて「使える」「使えない」を設定)
  // 「全員に付与されている権限」だけをON表示、「全員から剥奪されている権限」だけを剥奪表示する
  // (一部の人だけ個別設定を持つ場合は、ここでは中間状態として反映しない)
  if (method === 'GET' && (pum = path.match(/^\/role-perms\/(member|chief|handler)$/))) {
    if (!has(me, 'account_manage')) return ERR('ページが見つかりません', 404);
    const role = pum[1];
    const rows = (await env.DB.prepare('SELECT extra_perms, revoked_perms FROM users WHERE role=? AND COALESCE(suspended,0)=0').bind(role).all()).results;
    let common = null, commonRevoked = null;
    for (const r of rows) {
      const ps = new Set(getPerms(r));
      common = common === null ? ps : new Set([...common].filter(k => ps.has(k)));
      const rs = new Set(getRevokedPerms(r));
      commonRevoked = commonRevoked === null ? rs : new Set([...commonRevoked].filter(k => rs.has(k)));
    }
    return J({ role, count: rows.length, perms: common ? [...common] : [], revokedPerms: commonRevoked ? [...commonRevoked] : [] });
  }
  if (method === 'PUT' && (pum = path.match(/^\/role-perms\/(member|chief|handler)$/))) {
    if (!has(me, 'account_manage')) return ERR('権限がありません', 403);
    const role = pum[1];
    const keys = Array.isArray(body.perms) ? body.perms.filter(k => PERMS[k]) : [];
    const revokedKeys = Array.isArray(body.revokedPerms) ? body.revokedPerms.filter(k => PERMS[k]) : [];
    const finalKeys = keys.filter(k => !revokedKeys.includes(k));
    const rows = (await env.DB.prepare('SELECT id, extra_perms, revoked_perms FROM users WHERE role=?').bind(role).all()).results;
    for (const r of rows) {
      // 既存の個別権限のうち、定義済みキー以外(将来の拡張用)は維持しつつ、定義済みキーはチェック状態に合わせて入れ替える
      const cur = getPerms(r).filter(k => !PERMS[k]);
      const next = [...cur, ...finalKeys];
      const curRevoked = getRevokedPerms(r).filter(k => !PERMS[k]);
      const nextRevoked = [...curRevoked, ...revokedKeys];
      await env.DB.prepare('UPDATE users SET extra_perms=?, revoked_perms=? WHERE id=?').bind(JSON.stringify(next), JSON.stringify(nextRevoked), r.id).run();
    }
    return J({ ok: 1, role, updated: rows.length, perms: finalKeys, revokedPerms: revokedKeys });
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
  // 業務名 → 料金区分の対応表(手配担当以上が確認用に閲覧できる)
  if (method === 'GET' && path === '/duty-map') {
    if (!has(me, 'wage_settings')) return ERR('ページが見つかりません', 404);
    return J(await loadDutyMap(env));
  }
  // 業務名の新規追加(管理者のみ)
  if (method === 'POST' && path === '/duty-map') {
    if (!has(me, 'wage_settings')) return ERR('権限がありません', 403);
    const duty = String(body.duty || '').trim();
    const seg = String(body.seg || '');
    if (!duty) return ERR('業務名を入力してください');
    if (!Object.keys(DUTY_SEG_LABELS_BACKEND).includes(seg)) return ERR('不正な料金区分です');
    try {
      await env.DB.prepare('INSERT INTO duty_map(duty,seg) VALUES(?,?)').bind(duty, seg).run();
    } catch { return ERR('その業務名は既に登録されています'); }
    return J({ ok: 1 });
  }
  // 業務名の料金区分を変更(管理者のみ)
  if (method === 'PATCH' && path.startsWith('/duty-map/')) {
    if (!has(me, 'wage_settings')) return ERR('権限がありません', 403);
    const duty = decodeURIComponent(path.slice('/duty-map/'.length));
    const seg = String(body.seg || '');
    if (!Object.keys(DUTY_SEG_LABELS_BACKEND).includes(seg)) return ERR('不正な料金区分です');
    const r = await env.DB.prepare('UPDATE duty_map SET seg=? WHERE duty=?').bind(seg, duty).run();
    if (!r.meta || !r.meta.changes) return ERR('見つかりません', 404);
    return J({ ok: 1 });
  }
  // 業務名の削除(管理者のみ)
  if (method === 'DELETE' && path.startsWith('/duty-map/')) {
    if (!has(me, 'wage_settings')) return ERR('権限がありません', 403);
    const duty = decodeURIComponent(path.slice('/duty-map/'.length));
    await env.DB.prepare('DELETE FROM duty_map WHERE duty=?').bind(duty).run();
    return J({ ok: 1 });
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
    const dutyMap = await loadDutyMap(env);
    const users = (await env.DB.prepare('SELECT id,rank FROM users').all()).results;
    const rankMap = {}; for (const u of users) rankMap[u.id] = u.rank;
    const rows = (await env.DB.prepare("SELECT id,user_id,date,tin,tout,duty,load_end,show_end,multi FROM schedule WHERE type='work'").all()).results;
    let n = 0;
    for (const r of rows) {
      const c = calcPay({ rank: rankMap[r.user_id], date: r.date, tin: r.tin, tout: r.tout, duty: r.duty, loadEnd: r.load_end, showEnd: r.show_end, multi: r.multi }, resolve, dutyMap);
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

  // 今日分の新人報告リマインドを、時刻・既実行チェックを無視して今すぐ本番送信する
  // (Cronトリガーが想定通り動いているか確認する、または動いていない時の応急処置として使う)
  if (method === 'POST' && path === '/notify-run-now') {
    if (!has(me, 'wage_settings')) return ERR('権限がありません', 403);
    try {
      const result = await cronNotify(env, { force: true });
      return J(result);
    } catch (e) {
      // このエンドポイントは管理者が原因調査のために使うものなので、通常のAPIとは異なり
      // エラーメッセージをそのままクライアントに返す(詳細を隠す必要が薄いため)。
      console.error('notify-run-now failed:', e);
      return ERR('実行エラー: ' + (e && e.message ? e.message : String(e)), 500);
    }
  }

  // ---- 予定表ソース管理(動的に何個でも追加可能) ----
  let scm;
  if (method === 'GET' && path === '/sched-sources') {
    if (!has(me, 'wage_settings')) return ERR('ページが見つかりません', 404);
    const rows = (await env.DB.prepare('SELECT * FROM sched_sources ORDER BY id').all()).results;
    return J({ sources: rows.map(r => ({
      id: r.id, label: r.label, url: r.url, enabled: !!r.enabled,
      freqType: r.freq_type, intervalHours: r.interval_hours, hour: r.hour,
      notifyAdmin: !!r.notify_admin, excludeUnmanaged: !!r.exclude_unmanaged, lastRun: r.last_run || '',
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
    const excludeUnmanaged = body.excludeUnmanaged === false ? 0 : 1; // 既定はON(チーフ手配の人は除外)
    const r = await env.DB.prepare(
      'INSERT INTO sched_sources(label,url,enabled,freq_type,interval_hours,hour,notify_admin,exclude_unmanaged,last_run,last_result,created_at,created_by) VALUES(?,?,1,?,?,?,?,?,?,?,?,?)'
    ).bind(label, url, freqType, intervalHours, hour, notifyAdmin, excludeUnmanaged, '', '', jstTs(), me.id).run();
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
    const excludeUnmanaged = body.excludeUnmanaged === false ? 0 : 1;
    await env.DB.prepare(
      'UPDATE sched_sources SET label=?, url=?, enabled=?, freq_type=?, interval_hours=?, hour=?, notify_admin=?, exclude_unmanaged=? WHERE id=?'
    ).bind(label, url, enabled, freqType, intervalHours, hour, notifyAdmin, excludeUnmanaged, id).run();
    return J({ ok: 1 });
  }
  if (method === 'DELETE' && (scm = path.match(/^\/sched-sources\/(\d+)$/))) {
    if (!has(me, 'wage_settings')) return ERR('権限がありません', 403);
    const id = Number(scm[1]);
    await env.DB.prepare('DELETE FROM sched_sources WHERE id=?').bind(id).run();
    await env.DB.prepare("DELETE FROM import_snapshots WHERE source=?").bind('sched_src_' + id).run();
    return J({ ok: 1 });
  }
  // 今すぐ手動実行(既定は対象日=今日+2日以降のみ。body.fullRange=trueで期間制限なしの全件取込)
  if (method === 'POST' && (scm = path.match(/^\/sched-sources\/(\d+)\/run$/))) {
    if (!has(me, 'wage_settings')) return ERR('権限がありません', 403);
    const id = Number(scm[1]);
    const src = await env.DB.prepare('SELECT * FROM sched_sources WHERE id=?').bind(id).first();
    if (!src) return ERR('見つかりません', 404);
    let fromDate = null;
    if (!body.fullRange) {
      const d = new Date(Date.now() + 9 * 3600e3); d.setDate(d.getDate() + 2);
      fromDate = d.toISOString().slice(0, 10);
    }
    try {
      const r = await importScheduleSheet(env, 'sched_src_' + id, src.url, me.id, fromDate, { excludeUnmanaged: !!src.exclude_unmanaged });
      await env.DB.prepare('UPDATE sched_sources SET last_run=?, last_result=? WHERE id=?').bind(
        jstTs(), JSON.stringify({ ts: r.ts, applied: r.applied, skipped: r.skipped, unchangedPeople: r.unchangedPeople, changedPeople: r.changedPeople, error: (r.errors && r.errors[0]) || '', fullRange: !!body.fullRange, changes: r.changes || [] }), id
      ).run();
      if (src.notify_admin && r.applied > 0) {
        const admins = (await env.DB.prepare("SELECT id FROM users WHERE role='admin' AND COALESCE(suspended,0)=0").all()).results;
        if (admins.length) await notify(env, admins.map(a => a.id), 'sched_import', `📅【${src.label}】からスケジュールを取り込みました(${jstTs()})。反映${r.applied}件・変更あり${r.changedPeople ?? '-'}人`, `#/sched-sources?result=${id}`);
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
  // 台帳の再取り込みを、深夜を待たずに今すぐ手動で実行する。
  // body.urls を指定すればそのURLだけ対象にし、未指定なら保存済み全URLを対象にする。
  // 一部URLのみの実行時は、他の未選択ファイルを巻き込まないよう不在者の休暇化は行わない。
  if (method === 'POST' && path === '/daicho-reload-run-now') {
    if (!has(me, 'import_data')) return ERR('権限がありません', 403);
    const savedRaw = JSON.parse(await getSetting(env, 'import_urls', '[]') || '[]');
    const savedUrls = savedRaw.map(x => typeof x === 'string' ? x : x.url);
    if (!savedUrls.length) return ERR('保存済みの取り込みURLがありません。先に「スプレッドシート取り込み」でURLを保存してください。');
    let targetUrls = Array.isArray(body.urls) && body.urls.length ? body.urls.filter(u => savedUrls.includes(u)) : savedUrls;
    if (!targetUrls.length) return ERR('取り込み対象のURLが見つかりません(保存済みリストが更新された可能性があります。画面を再読み込みしてください)');
    const isFullSet = targetUrls.length === savedUrls.length;
    // 不在者の休暇化は、既定では「全件選択時のみ」だが、body.checkAbsentで明示的に指定があればそれに従う
    // (一部URLのみでも、利用者が意図して選んだ場合は許可する。フロント側で警告を表示した上でのチェックを想定)
    const checkAbsent = body.checkAbsent !== undefined ? !!body.checkAbsent : isFullSet;
    try {
      const r = await runDaichoReload(env, targetUrls, { updateRemaining: true, checkAbsent, sourceLabel: '台帳手動再取り込み' });
      const remainRaw = JSON.parse(await getSetting(env, 'import_urls', '[]') || '[]');
      // 手動で今すぐ取り込んだ場合、同じ内容がその夜また自動的に取り込まれて二重に処理される
      // (通知が2回来る、differenceの検出が乱れる等)のを避けるため、深夜自動実行の「本日実行済み」
      // フラグも合わせて更新しておく。これにより、その夜のcronDaichoReloadは通常通りスキップされる。
      await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('daicho_reload_last_run',?)").bind(jstDate()).run();
      return J({
        ok: 1, okCount: r.okCount, ngCount: r.ngCount, totalApplied: r.totalApplied,
        results: r.results, clearedAbsent: r.absentResult.clearedPeople, clearedRegistrations: r.registryResult.clearedRegistrations, checkedAbsent: checkAbsent,
        remainingCount: remainRaw.length,
      });
    } catch (e) {
      return ERR('取り込み中にエラーが発生しました: ' + e.message);
    }
  }

  // ---- 台帳のExcelファイル取り込み(新規機能)。既存のスプレッドシートURL取込(台帳の深夜自動
  // 再取り込み・手動再取り込み)とは完全に独立した、ファイルアップロードによる取込経路。
  // フォーマットは既存の手配管理表(フォーマットC/D/AB)と共通。複数ファイルをまとめて送り、
  // ファイルごとに「この日付として扱う」ことを指定できる(月をまたいだ一括取込を想定)。
  // 深夜の自動実行には一切組み込まない(常に手動操作のみ)。
  if (method === 'POST' && path === '/import-excel-daicho') {
    if (!has(me, 'import_data')) return ERR('権限がありません', 403);
    const files = Array.isArray(body.files) ? body.files : [];
    if (!files.length) return ERR('取り込むファイルがありません');
    if (files.length > 40) return ERR('一度に取り込めるファイルは40件までです(分けて実行してください)');

    const keywordMap = await loadNonSiteKeywords(env);
    const results = [];
    const allRowsCombined = [];

    for (const f of files) {
      const fileName = String(f.fileName || '').slice(0, 200);
      const targetDate = String(f.targetDate || '').trim(); // ユーザーがこのファイルに指定した日付(YYYY-MM-DD)。任意。
      try {
        if (!f.fileBase64) throw new Error('ファイルの内容が空です');
        const bin = atob(f.fileBase64.includes(',') ? f.fileBase64.split(',')[1] : f.fileBase64);
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);

        const pr = await processDaichoExcelBuffer(env, buf, fileName, targetDate, me.id, keywordMap);
        if (!pr.ok) { results.push({ fileName, targetDate, ok: false, error: pr.error }); continue; }
        allRowsCombined.push(...pr.allRows);

        // R2に保管(スプレッドシート台帳と同じ管理下に置く。file_idはファイル名ベースで代用)
        if (env.DAICHO) {
          const ts = jstTs();
          const pseudoFileId = 'excel_' + fileName.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 60);
          const r2key = `daicho/${ts.replace(/[: ]/g, '-')}_${pseudoFileId}.xlsx`;
          await env.DAICHO.put(r2key, buf, { httpMetadata: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } });
          await env.DB.prepare(
            'INSERT INTO daicho_archive(ts,importer_id,importer_name,source_url,file_id,r2_key,file_name,size,applied,sheets) VALUES(?,?,?,?,?,?,?,?,?,?)'
          ).bind(ts, me.id, me.name + '(Excel手動)', '', pseudoFileId, r2key, fileName || `台帳_${ts.slice(0, 10)}.xlsx`, buf.length, pr.applied, pr.sheetReport.length).run();
        }
        results.push({ fileName, targetDate, ok: true, applied: pr.applied, changes: pr.changes, ts: pr.ts });
      } catch (e) {
        results.push({ fileName, targetDate, ok: false, error: e.message });
      }
    }

    // 不在者の休暇化は、既定オフ(複数日をまたぐ取込のため、日ごとに対象者が違うと誤爆しやすい)。
    // 明示的にcheckAbsentが指定された場合のみ、今回アップロードした全ファイル分をまとめて判定する。
    let absentResult = { clearedPeople: 0, clearedDays: 0 };
    let registryResult = { clearedRegistrations: 0 };
    if (body.checkAbsent && allRowsCombined.length) {
      try { absentResult = await clearAbsentFromDaicho(env, allRowsCombined, me.id); }
      catch (e) { console.error('clearAbsentFromDaicho failed:', e); }
      try { registryResult = await clearAbsentSiteRegistry(env, allRowsCombined); }
      catch (e) { console.error('clearAbsentSiteRegistry failed:', e); }
      try { await matchRookieAndBlacklist(env, allRowsCombined); } catch (e) {}
    } else if (allRowsCombined.length) {
      try { await matchRookieAndBlacklist(env, allRowsCombined); } catch (e) {}
    }

    const okCount = results.filter(r => r.ok).length;
    const totalApplied = results.reduce((s, r) => s + (r.ok ? (r.applied || 0) : 0), 0);
    return J({ ok: 1, okCount, ngCount: results.length - okCount, totalApplied, results, clearedAbsent: absentResult.clearedPeople, clearedRegistrations: registryResult.clearedRegistrations });
  }

  // ---- 台帳保管(R2)に既に保存済みのExcelファイルから、再度取り込む(新規機能) ----
  // 「今アップロードし直す」のではなく、過去にアップロード・取込済みのファイルを、台帳保管の
  // 一覧からチェックして選び、それぞれに対象日を指定して、もう一度パース→反映する。
  // 深夜自動実行には一切組み込まない。
  if (method === 'POST' && path === '/daicho/reimport-from-archive') {
    if (!has(me, 'import_data')) return ERR('権限がありません', 403);
    if (!has(me, 'daicho_manage')) return ERR('台帳保管の閲覧権限が必要です', 403);
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return ERR('取り込むファイルを選択してください');
    if (items.length > 40) return ERR('一度に取り込めるファイルは40件までです(分けて実行してください)');
    if (!env.DAICHO) return ERR('R2が未設定のため、この機能は使用できません', 500);

    const keywordMap = await loadNonSiteKeywords(env);
    const results = [];
    const allRowsCombined = [];

    for (const item of items) {
      const archiveId = Number(item.archiveId);
      const targetDate = String(item.targetDate || '').trim();
      const rec = await env.DB.prepare('SELECT r2_key, file_name FROM daicho_archive WHERE id=?').bind(archiveId).first();
      if (!rec) { results.push({ archiveId, fileName: '(不明)', targetDate, ok: false, error: '台帳保管にこのファイルが見つかりません(削除された可能性)' }); continue; }
      const fileName = rec.file_name || `台帳_${archiveId}.xlsx`;
      try {
        const obj = await env.DAICHO.get(rec.r2_key);
        if (!obj) throw new Error('ファイル本体が見つかりません(削除済みの可能性)');
        const buf = new Uint8Array(await obj.arrayBuffer());

        const pr = await processDaichoExcelBuffer(env, buf, fileName, targetDate, me.id, keywordMap);
        if (!pr.ok) { results.push({ archiveId, fileName, targetDate, ok: false, error: pr.error }); continue; }
        allRowsCombined.push(...pr.allRows);
        // 既にR2に保管済みのファイルなので、再アップロード(R2への再書き込み)は行わない。
        // ただし「再取込した」という事実は、既存レコードのapplied件数を更新して残す。
        await env.DB.prepare('UPDATE daicho_archive SET applied=? WHERE id=?').bind(pr.applied, archiveId).run();
        results.push({ archiveId, fileName, targetDate, ok: true, applied: pr.applied, changes: pr.changes, ts: pr.ts });
      } catch (e) {
        results.push({ archiveId, fileName, targetDate, ok: false, error: e.message });
      }
    }

    let absentResult = { clearedPeople: 0, clearedDays: 0 };
    let registryResult = { clearedRegistrations: 0 };
    if (body.checkAbsent && allRowsCombined.length) {
      try { absentResult = await clearAbsentFromDaicho(env, allRowsCombined, me.id); }
      catch (e) { console.error('clearAbsentFromDaicho failed:', e); }
      try { registryResult = await clearAbsentSiteRegistry(env, allRowsCombined); }
      catch (e) { console.error('clearAbsentSiteRegistry failed:', e); }
      try { await matchRookieAndBlacklist(env, allRowsCombined); } catch (e) {}
    } else if (allRowsCombined.length) {
      try { await matchRookieAndBlacklist(env, allRowsCombined); } catch (e) {}
    }

    const okCount = results.filter(r => r.ok).length;
    const totalApplied = results.reduce((s, r) => s + (r.ok ? (r.applied || 0) : 0), 0);
    return J({ ok: 1, okCount, ngCount: results.length - okCount, totalApplied, results, clearedAbsent: absentResult.clearedPeople, clearedRegistrations: registryResult.clearedRegistrations });
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

  // ---- 非現場キーワード管理(台帳・予定表取り込み時に「現場名」として扱わない文言) ----
  const NSK_TYPES = ['x', 'off', 'ok', 'paid', 'ignore'];
  if (method === 'GET' && path === '/non-site-keywords') {
    if (!has(me, 'import_data')) return ERR('ページが見つかりません', 404);
    const rows = (await env.DB.prepare('SELECT * FROM non_site_keywords ORDER BY sort_order, keyword').all()).results;
    return J(rows);
  }
  if (method === 'POST' && path === '/non-site-keywords') {
    if (!has(me, 'import_data')) return ERR('権限がありません', 403);
    const keyword = String(body.keyword || '').trim();
    const type = NSK_TYPES.includes(body.type) ? body.type : '';
    if (!keyword || !type) return ERR('文言と種別を入力してください');
    try { await env.DB.prepare('INSERT INTO non_site_keywords(keyword,type,sort_order) VALUES(?,?,100)').bind(keyword, type).run(); }
    catch (e) { return ERR('既に登録されている文言です'); }
    return J({ ok: 1 });
  }
  let nskm;
  if (method === 'PUT' && (nskm = path.match(/^\/non-site-keywords\/(\d+)$/))) {
    if (!has(me, 'import_data')) return ERR('権限がありません', 403);
    const keyword = String(body.keyword || '').trim();
    const type = NSK_TYPES.includes(body.type) ? body.type : '';
    if (!keyword || !type) return ERR('文言と種別を入力してください');
    try { await env.DB.prepare('UPDATE non_site_keywords SET keyword=?, type=? WHERE id=?').bind(keyword, type, Number(nskm[1])).run(); }
    catch (e) { return ERR('既に登録されている文言です'); }
    return J({ ok: 1 });
  }
  if (method === 'DELETE' && (nskm = path.match(/^\/non-site-keywords\/(\d+)$/))) {
    if (!has(me, 'import_data')) return ERR('権限がありません', 403);
    await env.DB.prepare('DELETE FROM non_site_keywords WHERE id=?').bind(Number(nskm[1])).run();
    return J({ ok: 1 });
  }

  // ---- 現場変更報告モーダルの「変更内容」選択肢管理 ----
  const RTO_TYPES = ['work', 'off', 'ok', 'paid', 'x'];
  if (method === 'GET' && path === '/report-type-options') {
    // ログイン中の全員が使う画面(現場変更の報告)に使われるため、権限を問わず取得できる
    const rows = (await env.DB.prepare('SELECT * FROM report_type_options ORDER BY sort_order, id').all()).results;
    return J(rows);
  }
  if (method === 'POST' && path === '/report-type-options') {
    if (!has(me, 'wage_settings')) return ERR('権限がありません', 403);
    const type = RTO_TYPES.includes(body.type) ? body.type : '';
    const label = String(body.label || '').trim();
    if (!type || !label) return ERR('種別とラベルを入力してください');
    try { await env.DB.prepare('INSERT INTO report_type_options(type,label,sort_order) VALUES(?,?,100)').bind(type, label).run(); }
    catch (e) { return ERR('その種別は既に登録されています'); }
    return J({ ok: 1 });
  }
  let rtom;
  if (method === 'PUT' && (rtom = path.match(/^\/report-type-options\/(\d+)$/))) {
    if (!has(me, 'wage_settings')) return ERR('権限がありません', 403);
    const label = String(body.label || '').trim();
    if (!label) return ERR('ラベルを入力してください');
    await env.DB.prepare('UPDATE report_type_options SET label=? WHERE id=?').bind(label, Number(rtom[1])).run();
    return J({ ok: 1 });
  }
  if (method === 'DELETE' && (rtom = path.match(/^\/report-type-options\/(\d+)$/))) {
    if (!has(me, 'wage_settings')) return ERR('権限がありません', 403);
    const cnt = await env.DB.prepare('SELECT COUNT(*) AS n FROM report_type_options').first();
    if (cnt && cnt.n <= 1) return ERR('選択肢を1つも無くすことはできません');
    await env.DB.prepare('DELETE FROM report_type_options WHERE id=?').bind(Number(rtom[1])).run();
    return J({ ok: 1 });
  }

  // アカウントの一括停止/復活。管理者・アカウント管理権限者向け。
  if (method === 'POST' && path === '/users/bulk-suspend') {
    if (!has(me, 'account_manage')) return ERR('権限がありません', 403);
    const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(Number).filter(n => n > 0))] : [];
    if (!ids.length) return ERR('対象を選択してください');
    if (ids.includes(me.id)) return ERR('自分自身は選択できません');
    const suspend = !!body.suspended;
    const ph = ids.map(() => '?').join(',');
    await env.DB.prepare(`UPDATE users SET suspended=? WHERE id IN (${ph})`).bind(suspend ? 1 : 0, ...ids).run();
    if (suspend) await env.DB.prepare(`DELETE FROM sessions WHERE user_id IN (${ph})`).bind(...ids).run();
    return J({ ok: 1, count: ids.length });
  }

  // 複数メンバーの担当手配者を一括変更する(manager_idがnullの場合はチーフ手配に戻す)
  if (method === 'POST' && path === '/users/bulk-manager') {
    if (!has(me, 'site_manage') && !has(me, 'account_manage')) return ERR('権限がありません', 403);
    const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(Number).filter(n => n > 0))] : [];
    if (!ids.length) return ERR('対象を選択してください');
    const mid = body.manager_id || null;
    if (mid) {
      const mgr = await env.DB.prepare('SELECT role FROM users WHERE id=?').bind(mid).first();
      if (!mgr || LV[mgr.role] < 2) return ERR('担当手配者は手配担当以上を指定してください');
    }
    const ph = ids.map(() => '?').join(',');
    await env.DB.prepare(`UPDATE users SET manager_id=? WHERE id IN (${ph})`).bind(mid, ...ids).run();
    return J({ ok: 1, count: ids.length });
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
    try { await markAcquiredByName(env, name, ka); } catch (e) {}
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
      if (body.regno !== undefined) { // 登録番号の変更(管理者のみ)
        if (me.role !== 'admin') return ERR('登録番号の変更には管理者権限が必要です', 403);
        const newRegno = normRegno(body.regno);
        if (!newRegno) return ERR('登録番号を入力してください');
        const dup = await env.DB.prepare('SELECT id FROM users WHERE regno=? AND id!=?').bind(newRegno, uid).first();
        if (dup) return ERR('その登録番号は既に使われています');
        await env.DB.prepare('UPDATE users SET regno=? WHERE id=?').bind(newRegno, uid).run();
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
      if (body.rank !== undefined) { // ランクの手動変更。履歴に記録し、当月の給与を新ランクで再計算する
        if (!has(me, 'site_manage') && !has(me, 'account_manage')) return ERR('権限がありません', 403);
        const cur = await env.DB.prepare('SELECT rank FROM users WHERE id=?').bind(uid).first();
        const beforeRank = cur ? cur.rank : '';
        if (beforeRank !== body.rank) {
          await env.DB.prepare('UPDATE users SET rank=? WHERE id=?').bind(body.rank, uid).run();
          await env.DB.prepare('INSERT INTO rank_history(user_id,before_rank,after_rank,reason,changed_by,ts) VALUES(?,?,?,?,?,?)')
            .bind(uid, beforeRank, body.rank, 'manual', me.id, jstTs()).run();
          try { await recalcPayForMonth(env, uid, jstDate().slice(0, 7), body.rank); } catch (e) {}
        }
      }
      // 研修受講状況・卒業予定フラグの手動編集(現場データに基づく自動判定を待たず、直接補正したい場合用)
      for (const f of ['manner_done', 'team2_done', 'su_done', 'graduate_flag']) {
        if (body[f] !== undefined) {
          if (!has(me, 'site_manage') && !has(me, 'account_manage')) return ERR('権限がありません', 403);
          await env.DB.prepare(`UPDATE users SET ${f}=? WHERE id=?`).bind(body[f] ? 1 : 0, uid).run();
        }
      }
      for (const f of ['name', 'han', 'station', 'ka']) {
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
  // 査定によるランクアップ(C→B、C→A、B→A)。研修による自動昇格とは別に、手配者以上が判断して実行する。
  // 昇格した月は、月初に遡って新ランクで給与を再計算する。
  if ((mm = path.match(/^\/users\/(\d+)\/assess$/)) && method === 'POST') {
    if (!has(me, 'site_manage') && !has(me, 'account_manage')) return ERR('権限がありません', 403);
    const uid = Number(mm[1]);
    const target = String(body.rank || '').toUpperCase();
    if (!['A', 'B'].includes(target)) return ERR('査定で指定できるのはAランクまたはBランクのみです');
    const u = await env.DB.prepare('SELECT id, rank FROM users WHERE id=?').bind(uid).first();
    if (!u) return ERR('対象のメンバーが見つかりません', 404);
    const cur = rankLetter(u.rank);
    // C→B、C→A、B→A のみ許可(降格・同ランクへの変更は査定では行わない)
    const allowed = (cur === 'C' && (target === 'B' || target === 'A')) || (cur === 'B' && target === 'A');
    if (!allowed) return ERR(`現在${cur || '未設定'}ランクのため、査定で${target}ランクへは変更できません(C→B、C→A、B→Aのみ)`);
    await env.DB.prepare('UPDATE users SET rank=? WHERE id=?').bind(target, uid).run();
    await env.DB.prepare('INSERT INTO rank_history(user_id,before_rank,after_rank,reason,changed_by,ts) VALUES(?,?,?,?,?,?)')
      .bind(uid, u.rank, target, 'assessment', me.id, jstTs()).run();
    const month = jstDate().slice(0, 7);
    try { await recalcPayForMonth(env, uid, month, target); } catch (e) { console.error('recalcPay failed:', e); }
    await notify(env, [uid], 'rank', `🎉 査定により、ランクが ${target} に上がりました。今月分の給与も新しいランクで再計算されています。`, `#/schedule/${uid}?month=${month}`);
    return J({ ok: 1, rank: target });
  }
  // ランク変更履歴の取得(いつ・誰が・なぜ変更したか)
  if ((mm = path.match(/^\/users\/(\d+)\/rank-history$/)) && method === 'GET') {
    if (lv(me) < 1) return ERR('権限がありません', 403);
    const uid = Number(mm[1]);
    const rows = (await env.DB.prepare(
      `SELECT h.*, u.name AS changed_by_name FROM rank_history h
       LEFT JOIN users u ON h.changed_by = u.id
       WHERE h.user_id=? ORDER BY h.id DESC LIMIT 100`
    ).bind(uid).all()).results;
    const reasonLabel = { manner_auto: 'マナー研修による自動昇格', promotion_auto: '2部+SU研修による自動昇格', assessment: '査定', manual: '手動変更' };
    return J(rows.map(r => ({ ...r, reason_label: reasonLabel[r.reason] || r.reason })));
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
      if (!canSeePay) { r.hours = 0; r.overtime = 0; r.pay = 0; r.tin = ''; r.tout = ''; r.duty = ''; r.multi = 0; }
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
    const dutyMap = await loadDutyMap(env);
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
        const c = calcPay({ rank: nameCache[a.uid].rank, date, tin, tout, duty, loadEnd: load_end, showEnd: show_end, multi }, resolve, dutyMap);
        const pay = payOverride != null ? payOverride : c.pay;
        const slot = before.length;
        await env.DB.prepare('INSERT INTO schedule(user_id,date,slot,type,site,venue,tin,tout,hours,overtime,pay,note,duty,load_end,show_end,multi) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .bind(a.uid, date, slot, 'work', site, venue, tin, tout, c.hours, c.overtime, pay, withAuthor(a.note, me.name), duty, load_end, show_end, multi).run();
        added++;
        const after = (await env.DB.prepare('SELECT * FROM schedule WHERE user_id=? AND date=? ORDER BY slot').bind(a.uid, date).all()).results;
        const afterJsonBulk = JSON.stringify(after.map(stripRow));
        if (!isNonWorkOnlyChange(afterJsonBulk)) {
          await env.DB.prepare('INSERT INTO schedule_history(ts,editor_id,target_id,date,before_json,after_json) VALUES(?,?,?,?,?,?)')
            .bind(ts, me.id, a.uid, date, JSON.stringify(before.map(stripRow)), afterJsonBulk).run();
        }
        const rs = (await env.DB.prepare("SELECT * FROM reports WHERE next_date=? AND next_site=?").bind(date, site).all()).results;
        for (const r of rs) await notify(env, [a.uid], 'rookie', `🔰 ${r.next_date} ${r.next_site} に新人「${r.candidate_name}」が入る予定です`, '#/sites');
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
    const dutyMap = await loadDutyMap(env);
    // 削除対象
    for (const uid of removeUids) {
      const before = (await env.DB.prepare('SELECT * FROM schedule WHERE user_id=? AND date=? ORDER BY slot').bind(uid, date).all()).results;
      if (!before.some(b => b.site === site)) continue;
      await env.DB.prepare("DELETE FROM schedule WHERE user_id=? AND date=? AND site=?").bind(uid, date, site).run();
      const after = (await env.DB.prepare('SELECT * FROM schedule WHERE user_id=? AND date=? ORDER BY slot').bind(uid, date).all()).results;
      const afterJsonSe1 = JSON.stringify(after.map(stripRow));
      if (!isNonWorkOnlyChange(afterJsonSe1)) {
        await env.DB.prepare('INSERT INTO schedule_history(ts,editor_id,target_id,date,before_json,after_json) VALUES(?,?,?,?,?,?)')
          .bind(ts, me.id, uid, date, JSON.stringify(before.map(stripRow)), afterJsonSe1).run();
      }
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
        if (nTin && nTout) { const c = calcPay({ rank: rankCache[uid], date, tin: nTin, tout: nTout, duty: r.duty, loadEnd: r.load_end, showEnd: r.show_end, multi: r.multi }, resolve, dutyMap); if (c) ({ hours, overtime, pay } = c); }
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
    const dutyMap = await loadDutyMap(env);
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
          const c = calcPay({ rank: trank, date, tin: e.tin, tout: e.tout, duty: e.duty, loadEnd: e.load_end, showEnd: e.show_end, multi: e.multi ? 1 : 0 }, resolve, dutyMap);
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
          for (const r of rs) await notify(env, [uid], 'rookie', `🔰 ${r.next_date} ${r.next_site} に新人「${r.candidate_name}」が入る予定です`, '#/sites');
          if (!changedSite) changedSite = row.site;
        }
      }
      // 変更があったら履歴に1件残す(当日まるごと before→after)。ただし現場(work)を含まない
      // 変更(休暇・×・1日OK等のみ)は記録しない(大量発生するため)
      const beforeJson = JSON.stringify(before.map(stripRow));
      const afterJson = JSON.stringify(saved.map(stripRow));
      if (beforeJson !== afterJson) {
        anyChanged = true;
        if (!isNonWorkOnlyChange(afterJson)) {
          await env.DB.prepare('INSERT INTO schedule_history(ts,editor_id,target_id,date,before_json,after_json) VALUES(?,?,?,?,?,?)')
            .bind(ts, me.id, uid, date, beforeJson, afterJson).run();
        }
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

  // ---- 本人による休み希望・稼働可能時間の提出 ----
  // 本人が「この日は休みたい」「この日はこの時間帯なら稼働できる(どこから何時発〜何時まで)」を
  // 提出し、手配担当者が配置を組む際の参考にする。あくまで「希望」であり、実際のスケジュール
  // (schedule テーブル)には影響しない。
  if (method === 'GET' && path === '/availability') {
    const uid = Number(url.searchParams.get('uid')) || me.id;
    if (uid !== me.id && lv(me) < 1) return ERR('権限がありません', 403);
    const month = url.searchParams.get('month') || jstDate().slice(0, 7);
    const rows = (await env.DB.prepare(
      "SELECT * FROM availability_requests WHERE user_id=? AND date LIKE ? ORDER BY date"
    ).bind(uid, month + '%').all()).results;
    return J(rows);
  }
  if (method === 'PUT' && path === '/availability') {
    const date = String(body.date || '').trim();
    const type = body.type === 'available' ? 'available' : 'off';
    if (!date) return ERR('日付を指定してください');
    const fromTime = String(body.fromTime || '').trim();
    const toTime = String(body.toTime || '').trim();
    const departure = String(body.departure || '').trim();
    const note = String(body.note || '').trim();
    await env.DB.prepare(
      `INSERT INTO availability_requests(user_id,date,type,from_time,to_time,departure,note,updated_at) VALUES(?,?,?,?,?,?,?,?)
       ON CONFLICT(user_id,date) DO UPDATE SET type=excluded.type, from_time=excluded.from_time, to_time=excluded.to_time, departure=excluded.departure, note=excluded.note, updated_at=excluded.updated_at`
    ).bind(me.id, date, type, fromTime, toTime, departure, note, jstTs()).run();
    return J({ ok: 1 });
  }
  if (method === 'DELETE' && path === '/availability') {
    const date = String(body.date || '').trim();
    if (!date) return ERR('日付を指定してください');
    await env.DB.prepare('DELETE FROM availability_requests WHERE user_id=? AND date=?').bind(me.id, date).run();
    return J({ ok: 1 });
  }
  // 手配担当者向け:自分が担当するメンバー(管理者は全員)の、指定月の希望一覧をまとめて取得
  if (method === 'GET' && path === '/availability/team') {
    if (lv(me) < 2) return ERR('ページが見つかりません', 404);
    const month = url.searchParams.get('month') || jstDate().slice(0, 7);
    const rows = me.role === 'admin'
      ? (await env.DB.prepare(
          `SELECT a.*, u.name AS user_name, u.regno AS user_regno FROM availability_requests a JOIN users u ON u.id=a.user_id WHERE a.date LIKE ? ORDER BY a.date, u.regno`
        ).bind(month + '%').all()).results
      : (await env.DB.prepare(
          `SELECT a.*, u.name AS user_name, u.regno AS user_regno FROM availability_requests a JOIN users u ON u.id=a.user_id WHERE a.date LIKE ? AND u.manager_id=? ORDER BY a.date, u.regno`
        ).bind(month + '%', me.id).all()).results;
    return J(rows);
  }

  // ---- チーフによるメンバー指名 ----
  // チーフ以上が、自分の行く現場に「この人が欲しい」と指名する。対象者の手配担当者に通知が届き、
  // 承認するとその日のスケジュールに現場が追加され(既存の予定は保持)、備考に「誰が希望したか」が残る。
  if (method === 'POST' && path === '/site-nominations') {
    if (lv(me) < 1) return ERR('権限がありません', 403);
    const date = String(body.date || '').trim();
    const site = String(body.site || '').trim();
    const venue = String(body.venue || '').trim();
    const targetId = Number(body.targetId) || 0;
    if (!date || !site) return ERR('現場日と現場名を入力してください');
    if (!targetId) return ERR('希望する人を選んでください');
    if (targetId === me.id) return ERR('自分自身は指名できません');
    const target = await env.DB.prepare('SELECT id, name, manager_id FROM users WHERE id=?').bind(targetId).first();
    if (!target) return ERR('対象のユーザーが見つかりません');
    await env.DB.prepare(
      'INSERT INTO site_nominations(nominator_id,target_id,date,site,venue,status,created_at) VALUES(?,?,?,?,?,?,?)'
    ).bind(me.id, targetId, date, site, venue, 'pending', jstTs()).run();
    const msg = `🙋 ${me.name}さんから、${date}の現場「${[site, venue].filter(Boolean).join('／')}」に${target.name}さんを希望する報告がありました。承認をお願いします。`;
    try {
      if (target.manager_id) {
        await notify(env, [Number(target.manager_id)], 'nomination', msg, '#/nominations');
      } else {
        // 専任の手配担当者(manager_id)が設定されていない場合は、対象者と同じ課の
        // 手配担当者(handler以上)全員に通知する。同じ課に該当者がいなければ管理者に通知する。
        const targetFull = await env.DB.prepare('SELECT ka FROM users WHERE id=?').bind(targetId).first();
        let recipients = (await env.DB.prepare(
          "SELECT id FROM users WHERE ka=? AND role IN ('handler','admin') AND COALESCE(suspended,0)=0"
        ).bind(targetFull ? targetFull.ka : '').all()).results;
        if (!recipients.length) {
          recipients = (await env.DB.prepare("SELECT id FROM users WHERE role='admin' AND COALESCE(suspended,0)=0").all()).results;
        }
        if (recipients.length) await notify(env, recipients.map(r => r.id), 'nomination', msg, '#/nominations');
      }
    } catch (e) {}
    return J({ ok: 1 });
  }
  // 承認待ちの指名一覧: 自分が直接担当している人 + 専任の手配担当者がいない同じ課の人(管理者は全員分)
  if (method === 'GET' && path === '/site-nominations') {
    if (lv(me) < 2) return ERR('ページが見つかりません', 404);
    const rows = me.role === 'admin'
      ? (await env.DB.prepare(
          `SELECT sn.*, nom.name AS nominator_name, t.name AS target_name, t.regno AS target_regno FROM site_nominations sn JOIN users nom ON nom.id=sn.nominator_id JOIN users t ON t.id=sn.target_id WHERE sn.status='pending' ORDER BY sn.created_at DESC`
        ).all()).results
      : (await env.DB.prepare(
          `SELECT sn.*, nom.name AS nominator_name, t.name AS target_name, t.regno AS target_regno FROM site_nominations sn JOIN users nom ON nom.id=sn.nominator_id JOIN users t ON t.id=sn.target_id
           WHERE sn.status='pending' AND (t.manager_id=? OR (t.manager_id IS NULL AND t.ka=(SELECT ka FROM users WHERE id=?)))
           ORDER BY sn.created_at DESC`
        ).bind(me.id, me.id).all()).results;
    return J(rows);
  }
  let snm;
  if (method === 'POST' && (snm = path.match(/^\/site-nominations\/(\d+)\/approve$/))) {
    try { await decideNomination(env, me, Number(snm[1]), 'approve'); }
    catch (e) { return ERR(e.message); }
    return J({ ok: 1 });
  }
  if (method === 'POST' && (snm = path.match(/^\/site-nominations\/(\d+)\/reject$/))) {
    try { await decideNomination(env, me, Number(snm[1]), 'reject'); }
    catch (e) { return ERR(e.message); }
    return J({ ok: 1 });
  }
  // 複数の指名をまとめて承認/却下する(承認・却下ともに詳細入力が不要なため一括処理に対応)
  if (method === 'POST' && path === '/site-nominations/bulk-decide') {
    const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(Number).filter(n => n > 0))] : [];
    const action = body.action === 'reject' ? 'reject' : 'approve';
    if (!ids.length) return ERR('対象を選択してください');
    let okCount = 0; const failed = [];
    for (const id of ids) {
      try { await decideNomination(env, me, id, action); okCount++; }
      catch (e) { failed.push({ id, error: e.message }); }
    }
    return J({ ok: 1, okCount, failed });
  }

  // ---- 本人による現場変更の報告 ----
  // 手配担当者以外(他のチーフ・手配者など)から直接「現場が変わった」と言われた場合に、
  // 本人がその場で自分のスケジュールへ反映できる。時刻・給与などの詳細は入れず、
  // 現場名/会場名(または休暇)だけを記録する。
  // メンツ(役割が最下位)は手配担当者の承認を経てから反映、チーフ以上は承認不要で即時反映。
  if (method === 'POST' && path === '/schedule-self-report') {
    const date = String(body.date || '').trim();
    const toldBy = String(body.toldBy || '').trim();
    const validTypes = (await env.DB.prepare('SELECT type FROM report_type_options').all()).results.map(r => r.type);
    const type = validTypes.includes(body.type) ? body.type : 'work';
    const site = String(body.site || '').trim();
    const venue = String(body.venue || '').trim();
    if (!date) return ERR('現場日を入力してください');
    if (!toldBy) return ERR('誰から言われたかを入力してください');
    if (type === 'work' && !site && !venue) return ERR('現場名か会場名のいずれかを入力してください');

    const uid = me.id;
    const typeLabelRow = await env.DB.prepare('SELECT label FROM report_type_options WHERE type=?').bind(type).first();
    const label = type === 'work' ? [site, venue].filter(Boolean).join('／') : ((typeLabelRow && typeLabelRow.label) || type);

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
    if (lv(me) < 2) return ERR('ページが見つかりません', 404);
    const rows = me.role === 'admin'
      ? (await env.DB.prepare(
          `SELECT sr.*, u.name AS user_name, u.regno AS user_regno FROM self_reports sr JOIN users u ON u.id=sr.user_id WHERE sr.status='pending' ORDER BY sr.created_at DESC`
        ).all()).results
      : (await env.DB.prepare(
          `SELECT sr.*, u.name AS user_name, u.regno AS user_regno FROM self_reports sr JOIN users u ON u.id=sr.user_id
           WHERE sr.status='pending' AND (u.manager_id=? OR (u.manager_id IS NULL AND u.ka=(SELECT ka FROM users WHERE id=?)))
           ORDER BY sr.created_at DESC`
        ).bind(me.id, me.id).all()).results;
    return J(rows);
  }
  let srm;
  if (method === 'POST' && (srm = path.match(/^\/self-reports\/(\d+)\/approve$/))) {
    if (!handlerMode && me.role !== 'admin') return ERR('手配者モードでのみ操作できます', 403);
    try { await decideSelfReport(env, me, Number(srm[1]), 'approve', body); }
    catch (e) { return ERR(e.message); }
    return J({ ok: 1 });
  }
  if (method === 'POST' && (srm = path.match(/^\/self-reports\/(\d+)\/reject$/))) {
    if (!handlerMode && me.role !== 'admin') return ERR('手配者モードでのみ操作できます', 403);
    try { await decideSelfReport(env, me, Number(srm[1]), 'reject', body); }
    catch (e) { return ERR(e.message); }
    return J({ ok: 1 });
  }
  // 複数の報告をまとめて却下する。承認は「現場への変更(type='work')」だと詳細入力が必要な
  // ため一括処理に対応せず、休暇等(type!=='work')への変更のみ一括承認できる。
  if (method === 'POST' && path === '/self-reports/bulk-decide') {
    if (!handlerMode && me.role !== 'admin') return ERR('手配者モードでのみ操作できます', 403);
    const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(Number).filter(n => n > 0))] : [];
    const action = body.action === 'reject' ? 'reject' : 'approve';
    if (!ids.length) return ERR('対象を選択してください');
    let okCount = 0; const failed = [];
    for (const id of ids) {
      try { await decideSelfReport(env, me, id, action, null); okCount++; }
      catch (e) { failed.push({ id, error: e.message }); }
    }
    return J({ ok: 1, okCount, failed });
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
    if (!has(me, 'sites_view')) return ERR('ページが見つかりません', 404);
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
    if (!has(me, 'sites_view')) return ERR('ページが見つかりません', 404);
    const month = url.searchParams.get('month') || jstDate().slice(0, 7);
    const rows = (await env.DB.prepare(
      "SELECT date, site, venue, COUNT(*) AS cnt FROM schedule WHERE type='work' AND site<>'' AND date LIKE ? GROUP BY date, site, venue ORDER BY date, site"
    ).bind(month + '%').all()).results;
    // 手動登録された現場(site_registry。まだ誰も配置されていない現場を、事前に一覧へ出すための機能)。
    // 実績(schedule)側に同じ(date,site)が既にある場合は、そちらを優先し登録側は表示しない。
    const registryRows = (await env.DB.prepare(
      'SELECT id, date, site, venue FROM site_registry WHERE date LIKE ? ORDER BY date, site'
    ).bind(month + '%').all()).results;
    const existingKeys = new Set(rows.map(r => r.date + '|' + r.site));
    for (const rg of registryRows) {
      const key = rg.date + '|' + rg.site;
      if (existingKeys.has(key)) continue;
      rows.push({ date: rg.date, site: rg.site, venue: rg.venue || '', cnt: 0, registryId: rg.id });
      existingKeys.add(key);
    }
    rows.sort((a, b) => a.date === b.date ? a.site.localeCompare(b.site) : (a.date < b.date ? -1 : 1));
    // 新人共有・要注意共有(台帳と新人報告/ブラックリストの氏名マッチ)がある現場に印を付ける。
    // 良い人(新人報告)と悪い人(ブラックリスト)は別々に持たせ、表示側で混同しないようにする。
    // 新人報告は、誰が報告したか・タップで報告詳細に飛べるよう、report_id/reporter_nameも一緒に返す。
    const matches = (await env.DB.prepare(
      `SELECT m.kind, m.date, m.site, m.matched_name, m.report_id, r.reporter_name
       FROM rookie_site_matches m LEFT JOIN reports r ON m.report_id = r.id
       WHERE m.date LIKE ?`
    ).bind(month + '%').all()).results;
    const rookieMap = {}, blacklistMap = {};
    for (const m of matches) {
      const key = m.date + '|' + m.site;
      if (m.kind === 'report') (rookieMap[key] ||= []).push({ name: m.matched_name, reportId: m.report_id, reporterName: m.reporter_name || '' });
      else (blacklistMap[key] ||= []).push(m.matched_name);
    }
    for (const r of rows) {
      const key = r.date + '|' + r.site;
      r.rookies = rookieMap[key] || [];
      r.blacklistNames = blacklistMap[key] || [];
    }
    return J(rows);
  }

  // ---- 現場一覧: 現場情報の手動登録(手配者以上・手配モード中のみ)。
  //      まだ誰もメンバーが配置されていない現場を、先に現場一覧へ表示させておくための機能。
  //      同じ(date,site)に実績(schedule)ができた時点で、そちらの表示に切り替わる(GET /sites参照)。
  if (method === 'POST' && path === '/sites/register') {
    if (!handlerMode) return ERR('手配者モードでのみ登録できます', 403);
    const date = typeof body.date === 'string' ? body.date.trim() : '';
    const site = typeof body.site === 'string' ? body.site.trim() : '';
    const venue = typeof body.venue === 'string' ? body.venue.trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return ERR('日付を指定してください');
    if (!site) return ERR('現場名を入力してください');
    const already = await env.DB.prepare(
      "SELECT 1 FROM schedule WHERE type='work' AND date=? AND site=? LIMIT 1"
    ).bind(date, site).first();
    if (already) return ERR('既にメンバーが配置されている現場です(現場一覧に表示されています)');
    const dup = await env.DB.prepare('SELECT 1 FROM site_registry WHERE date=? AND site=? LIMIT 1').bind(date, site).first();
    if (dup) return ERR('同じ日付・現場名が既に登録されています');
    await env.DB.prepare('INSERT INTO site_registry(date,site,venue,created_by,created_at) VALUES(?,?,?,?,?)')
      .bind(date, site, venue, me.id, jstTs()).run();
    return J({ ok: 1 });
  }

  // ---- 現場一覧: 手動登録した現場情報の削除(手配者以上・手配モード中のみ) ----
  let srgm;
  if (method === 'DELETE' && (srgm = path.match(/^\/sites\/register\/(\d+)$/))) {
    if (!handlerMode) return ERR('手配者モードでのみ削除できます', 403);
    await env.DB.prepare('DELETE FROM site_registry WHERE id=?').bind(Number(srgm[1])).run();
    return J({ ok: 1 });
  }

  // ---- 現場一覧: 選択した複数の現場をまとめて改名(手配者以上) ----
  // 台帳・予定表それぞれの入力者によって、同じ現場でも現場名・会場名の書き方がバラバラになるのは
  // 避けられない。現場一覧でチェックした(date,site,venue)の組を、まとめて統一名称に変更する。
  // 現場名・会場名のどちらかを空欄にすると、その項目は変更しない(片方だけ直すことも可能)。
  if (method === 'POST' && path === '/sites/bulk-rename') {
    if (!has(me, 'site_manage')) return ERR('権限がありません', 403);
    const items = Array.isArray(body.items) ? body.items : [];
    const newSite = typeof body.newSite === 'string' ? body.newSite.trim() : '';
    const newVenue = typeof body.newVenue === 'string' ? body.newVenue.trim() : '';
    if (!items.length) return ERR('対象の現場が選択されていません');
    if (!newSite && !newVenue) return ERR('新しい現場名または会場名のどちらかを入力してください');

    const ts = jstTs();
    const batch = [];
    const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
    let updatedDays = 0;
    for (const it of items) {
      const date = String(it.date || ''), site = String(it.site || ''), venue = String(it.venue || '');
      if (!date || !site) continue;
      const uidRows = (await env.DB.prepare(
        "SELECT DISTINCT user_id FROM schedule WHERE date=? AND site=? AND venue=? AND type='work'"
      ).bind(date, site, venue).all()).results;
      for (const { user_id } of uidRows) {
        // その人・その日の全スロットを取得し、対象の(site,venue)と一致するスロットだけ改名する
        // (同じ日に他の予定が混在していても、それらは変更しない)
        const before = (await env.DB.prepare('SELECT * FROM schedule WHERE user_id=? AND date=? ORDER BY slot').bind(user_id, date).all()).results;
        const beforeJson = JSON.stringify(before.map(stripRow));
        const afterRows = before.map(r => (r.type === 'work' && r.site === site && r.venue === venue)
          ? { ...r, site: newSite || r.site, venue: newVenue || r.venue }
          : r);
        const afterJson = JSON.stringify(afterRows.map(stripRow));
        if (beforeJson === afterJson) continue;
        batch.push(env.DB.prepare('DELETE FROM schedule WHERE user_id=? AND date=?').bind(user_id, date));
        let slot = 0;
        for (const r of afterRows) {
          batch.push(env.DB.prepare('INSERT INTO schedule(user_id,date,slot,type,site,venue,tin,tout,hours,overtime,pay,note,duty,load_end,show_end,multi) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
            .bind(user_id, date, slot, r.type, r.site, r.venue, r.tin, r.tout, r.hours || 0, r.overtime || 0, r.pay || 0, r.note || '', r.duty || '', r.load_end || '', r.show_end || '', r.multi ? 1 : 0));
          slot++;
        }
        batch.push(env.DB.prepare('INSERT INTO schedule_history(ts,editor_id,target_id,date,before_json,after_json) VALUES(?,?,?,?,?,?)')
          .bind(ts, me.id, user_id, date, beforeJson, JSON.stringify({ slots: afterRows.map(stripRow), _src: `現場一覧の一括変更(${site}${newSite && newSite !== site ? '→' + newSite : ''})` })));
        updatedDays++;
      }
    }
    if (batch.length) for (const part of chunk(batch, 200)) await env.DB.batch(part);
    return J({ ok: 1, updatedDays, ts });
  }

  if (method === 'GET' && path === '/site-members') {
    const date = url.searchParams.get('date'), site = url.searchParams.get('site');
    const rows = (await env.DB.prepare(
      "SELECT u.id as uid,u.name,u.role,u.rank,u.ka,u.han,u.station,s.venue,s.tin,s.tout,s.note,s.load_end,s.show_end FROM schedule s JOIN users u ON u.id=s.user_id WHERE s.date=? AND s.site=? AND s.type='work' ORDER BY CASE u.role WHEN 'admin' THEN 0 WHEN 'handler' THEN 1 WHEN 'chief' THEN 2 ELSE 3 END, u.regno"
    ).bind(date, site).all()).results;
    if (!has(me, 'site_pay')) for (const r of rows) { r.tin = ''; r.tout = ''; } // IN/OUTを表示できるか
    // まだ誰も配置されていない現場は、手動登録(site_registry)側の会場情報を代わりに返す
    let registryVenue = '';
    if (!rows.length) {
      const rg = await env.DB.prepare('SELECT venue FROM site_registry WHERE date=? AND site=? LIMIT 1').bind(date, site).first();
      registryVenue = (rg && rg.venue) || '';
    }
    return J({ list: rows, venue: registryVenue });
  }

  // ---- 現場の稼働表(チーフ以上)。複数日にわたる現場について、その現場が行われている
  //      期間(findGigDateRangeで算出)を対象に、実際にその現場(または同じ会場)へ
  //      入っている人だけを抜き出して、スケジュール一覧と同じマトリックス形式で返す。 ----
  if (method === 'GET' && path === '/site-roster') {
    if (!has(me, 'sites_view')) return ERR('ページが見つかりません', 404);
    const date = url.searchParams.get('date'), site = url.searchParams.get('site');
    if (!date || !site) return ERR('date/site が必要です');
    const { venue, dates } = await findGigDateRange(env, date, site);

    const ph = dates.map(() => '?').join(',');
    const relevantRows = venue
      ? (await env.DB.prepare(`SELECT DISTINCT user_id FROM schedule WHERE type='work' AND date IN (${ph}) AND (site=? OR venue=?)`).bind(...dates, site, venue).all()).results
      : (await env.DB.prepare(`SELECT DISTINCT user_id FROM schedule WHERE type='work' AND date IN (${ph}) AND site=?`).bind(...dates, site).all()).results;
    const uids = relevantRows.map(r => r.user_id);
    const rows = uids.length ? await buildScheduleMatrixRows(env, dates, uids) : [];
    return J({ site, venue, dates, rows });
  }

  // ---- 同会場・同現場名(≒同アーティスト)の過去・今後の公演一覧(チーフ以上)。
  //      現在の現場が含まれる期間(findGigDateRangeで算出)より前/後の日付のみを対象とし、
  //      同じ複数日公演の別の日を「別公演」として誤って拾わないようにする。 ----
  if (method === 'GET' && path === '/site-history') {
    if (!has(me, 'sites_view')) return ERR('ページが見つかりません', 404);
    const date = url.searchParams.get('date'), site = url.searchParams.get('site');
    if (!date || !site) return ERR('date/site が必要です');
    const { venue, from, to } = await findGigDateRange(env, date, site);

    const [sameVenuePastRes, sameVenueFutureRes, sameSitePastRes, sameSiteFutureRes] = await Promise.all([
      venue
        ? env.DB.prepare("SELECT date, site, venue, COUNT(*) AS cnt FROM schedule WHERE type='work' AND venue=? AND date<? GROUP BY date, site, venue ORDER BY date DESC LIMIT 15").bind(venue, from).all()
        : Promise.resolve({ results: [] }),
      venue
        ? env.DB.prepare("SELECT date, site, venue, COUNT(*) AS cnt FROM schedule WHERE type='work' AND venue=? AND date>? GROUP BY date, site, venue ORDER BY date ASC LIMIT 15").bind(venue, to).all()
        : Promise.resolve({ results: [] }),
      env.DB.prepare("SELECT date, site, venue, COUNT(*) AS cnt FROM schedule WHERE type='work' AND site=? AND date<? GROUP BY date, site, venue ORDER BY date DESC LIMIT 15").bind(site, from).all(),
      env.DB.prepare("SELECT date, site, venue, COUNT(*) AS cnt FROM schedule WHERE type='work' AND site=? AND date>? GROUP BY date, site, venue ORDER BY date ASC LIMIT 15").bind(site, to).all(),
    ]);
    return J({
      site, venue, from, to,
      sameVenuePast: sameVenuePastRes.results, sameVenueFuture: sameVenueFutureRes.results,
      sameSitePast: sameSitePastRes.results, sameSiteFuture: sameSiteFutureRes.results,
    });
  }

  // ---- スケジュール一覧(チーフ以上)。指定期間(既定7日分)の全メンバーの予定を、
  //      日付×人のマトリックス形式で返す。現場に入っている人は現場名、休暇/NG/1日OK/有給の
  //      人はその状態、未入力の人も含める。停止中アカウントも一覧性のため含める。 ----
  if (method === 'GET' && path === '/day-schedule') {
    if (!has(me, 'day_schedule_view')) return ERR('ページが見つかりません', 404);
    const fromDate = url.searchParams.get('from') || jstDate();
    const days = Math.min(14, Math.max(1, parseInt(url.searchParams.get('days') || '7', 10)));
    const [fy, fm, fd] = fromDate.split('-').map(Number);
    const dates = [];
    for (let i = 0; i < days; i++) {
      const dt = new Date(Date.UTC(fy, fm - 1, fd + i));
      dates.push(dt.toISOString().slice(0, 10));
    }

    const rows = await buildScheduleMatrixRows(env, dates, null);
    return J({ dates, rows });
  }

  // ---- メンバー分析(チーフ以上)。拠点・課・班・ランクの構成を、全体・課ごとの両方で集計する。
  //      手配担当ごとの内訳(拠点・班・ランク)も併せて返す。停止中アカウントも含める。 ----
  if (method === 'GET' && path === '/member-stats') {
    if (!has(me, 'member_stats_view')) return ERR('ページが見つかりません', 404);
    const [membersRes, managersRes] = await Promise.all([
      env.DB.prepare("SELECT id, name, regno, rank, ka, han, manager_id, suspended FROM users").all(),
      env.DB.prepare("SELECT id, name, ka FROM users WHERE role IN ('handler','admin')").all(),
    ]);
    const members = membersRes.results;
    for (const m of members) m.base = baseFromRegno(m.regno); // 都度計算(DB保存はしない)

    const managers = managersRes.results;
    const mgrName = {}; for (const m of managers) mgrName[m.id] = m.name;
    const chiefLabel = m => m.ka === '1課' ? 'チーフ手配(1課)' : m.ka === '2課' ? 'チーフ手配(2課)' : 'チーフ手配';

    const groupBy = (rows, keyFn) => {
      const map = {};
      for (const r of rows) { const k = keyFn(r) || '未設定'; (map[k] ||= []).push(r); }
      return Object.entries(map).map(([key, list]) => ({ key, count: list.length, ratio: rows.length ? list.length / rows.length : 0 }))
        .sort((a, b) => b.count - a.count);
    };

    const byBase = groupBy(members, m => m.base);
    const byKa = groupBy(members, m => m.ka);
    const byHan = groupBy(members, m => m.han);
    const byRank = groupBy(members, m => m.rank);
    const byHanKa = {}, byRankKa = {};
    for (const ka of ['1課', '2課']) {
      const sub = members.filter(m => m.ka === ka);
      byHanKa[ka] = groupBy(sub, m => m.han);
      byRankKa[ka] = groupBy(sub, m => m.rank);
    }

    // 手配担当者ごとの内訳(担当未設定は課ごとの「チーフ手配」としてまとめる)
    const byManagerMap = {};
    for (const m of members) {
      const key = m.manager_id ? 'm' + m.manager_id : 'chief:' + (m.ka || '未設定');
      const g = byManagerMap[key] ||= {
        key, managerId: m.manager_id || null,
        name: m.manager_id ? ((mgrName[m.manager_id] ? mgrName[m.manager_id]+'手配' : 'チーフ手配')) : chiefLabel(m),
        ka: m.manager_id ? (managers.find(x => x.id === m.manager_id) || {}).ka || '' : (m.ka || ''),
        list: [],
      };
      g.list.push(m);
    }
    const byManager = Object.values(byManagerMap).map(g => ({
      key: g.key, managerId: g.managerId, name: g.name, ka: g.ka,
      count: g.list.length, ratio: members.length ? g.list.length / members.length : 0,
      base: groupBy(g.list, m => m.base),
      han: groupBy(g.list, m => m.han),
      rank: groupBy(g.list, m => m.rank),
    })).sort((a, b) => b.count - a.count);

    // カード選択によるフィルタ表示・個人編集への導線用に、個々のメンバー情報も併せて返す
    const memberList = members.map(m => ({
      id: m.id, name: m.name, regno: m.regno, rank: m.rank, ka: m.ka, han: m.han, base: m.base,
      managerId: m.manager_id, managerName: m.manager_id ? ((mgrName[m.manager_id] ? mgrName[m.manager_id]+'手配' : 'チーフ手配')) : chiefLabel(m),
      suspended: m.suspended ? 1 : 0,
    }));

    return J({ total: members.length, byBase, byKa, byHan, byRank, byHanKa, byRankKa, byManager, members: memberList });
  }

  // ---- 管理者ダッシュボード。複数の集計を1画面にまとめて返す ----
  if (method === 'GET' && path === '/dashboard') {
    if (!has(me, 'dashboard_view')) return ERR('ページが見つかりません', 404);
    const canPay = has(me, 'site_pay'); // 給与見込みを見せるかどうか
    const today = jstDate();
    const month = today.slice(0, 7);
    const prevMonth = (() => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCMonth(d.getUTCMonth() - 1, 1); return d.toISOString().slice(0, 7); })();
    // cronが「今日」「昨日」のいずれでもない日付なら、実行が滞っているとみなす
    const yesterday = (() => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
    const isStale = (d) => !d || (d !== today && d !== yesterday);

    // 個々のクエリでエラーが起きても、ダッシュボード全体を落とさず「取得できなかった」扱いにする。
    // (例:マイグレーション未適用で新しい列が本番DBに存在しない場合など)
    const safe = (p, fallback) => p.catch(e => { console.error('[dashboard] query failed:', e); return fallback; });
    const emptyAll = { results: [] };

    const [
      daichoLastRun, rankLastRun, notifyLastRun, schedSourcesRes,
      selfReportsRes, nominationsRes, reportsRes,
      monthRowsRes, prevMonthRowsRes, usersRes, lockDays,
    ] = await Promise.all([
      safe(getSetting(env, 'daicho_reload_last_run', ''), ''),
      safe(getSetting(env, 'rank_promotion_last_run', ''), ''),
      safe(getSetting(env, 'notify_last_run', ''), ''),
      safe(env.DB.prepare("SELECT label, last_run, last_result, freq_type, interval_hours, hour FROM sched_sources WHERE enabled=1 ORDER BY last_run ASC").all(), emptyAll),
      safe(env.DB.prepare("SELECT created_at FROM self_reports WHERE status='pending'").all(), emptyAll),
      safe(env.DB.prepare("SELECT created_at FROM site_nominations WHERE status='pending'").all(), emptyAll),
      safe(env.DB.prepare("SELECT id FROM reports WHERE status='pending'").all(), emptyAll),
      safe(env.DB.prepare("SELECT user_id, site, hours, overtime, pay FROM schedule WHERE type='work' AND site<>'' AND date LIKE ?").bind(month + '%').all(), emptyAll),
      safe(env.DB.prepare("SELECT hours, overtime, pay FROM schedule WHERE type='work' AND site<>'' AND date LIKE ?").bind(prevMonth + '%').all(), emptyAll),
      safe(env.DB.prepare("SELECT id, name, regno, rank, manager_id, suspended, manner_done, team2_done, su_done, promotion_pending_date, promotion_pending_rank FROM users").all(), emptyAll),
      safe(getLockDays(env), 14),
    ]);

    // ① システム状態
    const oldestSource = (schedSourcesRes.results || [])[0]; // last_run ASCなので先頭が最も遅れている
    let schedSourceDetail = '';
    if (oldestSource) {
      const freqLabel = oldestSource.freq_type === 'daily'
        ? `毎日${String(oldestSource.hour ?? 6).padStart(2, '0')}:00`
        : `${oldestSource.interval_hours || 1}時間ごと`;
      let lastError = '';
      try { const lr = JSON.parse(oldestSource.last_result || '{}'); if (lr.error) lastError = lr.error; } catch (e) {}
      schedSourceDetail = `「${oldestSource.label}」(${freqLabel})` + (lastError ? ` — 前回エラー: ${lastError}` : '');
    }
    const jobs = [
      { key: 'daicho', label: '台帳の再取り込み', lastRun: daichoLastRun, bad: isStale(daichoLastRun) },
      { key: 'schedSources', label: '予定表ソース取込', lastRun: oldestSource ? (oldestSource.last_run || '').slice(0, 10) : '', bad: !schedSourcesRes.results.length ? false : isStale((oldestSource.last_run || '').slice(0, 10)), detail: schedSourceDetail },
      { key: 'rankPromotion', label: 'ランク昇格の適用', lastRun: rankLastRun, bad: isStale(rankLastRun) },
      { key: 'notify', label: '新人報告リマインド', lastRun: notifyLastRun, bad: isStale(notifyLastRun) },
    ];
    const systemStatus = { jobs, hasIssue: jobs.some(j => j.bad) };

    // ② 対応が必要(滞留日数も一緒に返す)
    const daysSince = (ts) => { if (!ts) return 0; const d = Math.floor((Date.now() - Date.parse(ts.replace(' ', 'T') + '+09:00')) / 86400000); return Math.max(0, d); };
    const maxDays = (rows) => rows.reduce((m, r) => Math.max(m, daysSince(r.created_at)), 0);
    const todo = {
      selfReports: { count: selfReportsRes.results.length, maxDays: maxDays(selfReportsRes.results) },
      nominations: { count: nominationsRes.results.length, maxDays: maxDays(nominationsRes.results) },
      reportChecks: { count: reportsRes.results.length },
    };

    // ③ 今月の状況 + 前月比
    const sumRows = (rows) => {
      const sites = new Set(); let hours = 0, overtime = 0, pay = 0;
      for (const r of rows) { if (r.site) sites.add(r.site); hours += r.hours || 0; overtime += r.overtime || 0; pay += r.pay || 0; }
      return { sites: sites.size, headcount: rows.length, hours: Math.round(hours), pay: Math.round(pay) };
    };
    const cur = sumRows(monthRowsRes.results);
    const prev = sumRows(prevMonthRowsRes.results);
    const monthly = {
      month, sites: cur.sites, headcount: cur.headcount, hours: cur.hours,
      pay: canPay ? cur.pay : null,
      diffSites: cur.sites - prev.sites, diffHeadcount: cur.headcount - prev.headcount, diffHours: cur.hours - prev.hours,
      diffPay: canPay ? cur.pay - prev.pay : null,
    };

    // ④ 気になる人(稼働サマリーと同じ判定基準)
    const byUser = {};
    for (const r of monthRowsRes.results) {
      const a = byUser[r.user_id] ||= { dates: new Set(), hours: 0, overtime: 0, siteCounts: {} };
      a.hours += r.hours || 0; a.overtime += r.overtime || 0;
      if (r.site) a.siteCounts[r.site] = (a.siteCounts[r.site] || 0) + 1;
    }
    // maxStreakの計算にはdate列も要るため、別途取得(user_id, dateのみ、軽量)
    const dateRows = (await safe(env.DB.prepare("SELECT user_id, date FROM schedule WHERE type='work' AND site<>'' AND date LIKE ?").bind(month + '%').all(), emptyAll)).results;
    const datesByUser = {};
    for (const r of dateRows) (datesByUser[r.user_id] ||= []).push(r.date);
    let overTotal = 0, streak = 0, few = 0, samesite = 0, overtimeCnt = 0;
    for (const [uid, a] of Object.entries(byUser)) {
      const workDays = new Set(dateRows.filter(r => String(r.user_id) === uid).map(r => r.date)).size;
      const ms = longestStreak(datesByUser[uid] || []);
      let topCnt = 0; for (const c of Object.values(a.siteCounts)) if (c > topCnt) topCnt = c;
      if (canPay && a.hours >= 100) overTotal++;
      if (ms >= 6) streak++;
      if (workDays > 0 && workDays <= 2) few++;
      if (workDays >= 3 && topCnt / workDays >= 0.7) samesite++;
      if (canPay && a.overtime >= 50) overtimeCnt++;
    }
    const attention = { overTotal, streak, few, samesite, overtime: overtimeCnt };

    // ⑤ 昇格予定(今月・来月)、研修待ち人数
    const nextMonthEnd = (() => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCMonth(d.getUTCMonth() + 2, 0); return d.toISOString().slice(0, 10); })();
    const users = usersRes.results;
    const upcoming = users
      .filter(u => u.promotion_pending_date && u.promotion_pending_date <= nextMonthEnd)
      .sort((a, b) => a.promotion_pending_date.localeCompare(b.promotion_pending_date))
      .slice(0, 10)
      .map(u => ({ name: u.name, from: rankLetter(u.rank) || '?', to: u.promotion_pending_rank, date: u.promotion_pending_date }));
    const waitingTeam2Only = users.filter(u => rankLetter(u.rank) === 'D' && u.team2_done && !u.su_done).length;
    const waitingSuOnly = users.filter(u => rankLetter(u.rank) === 'D' && u.su_done && !u.team2_done).length;
    const promotions = { upcoming, waitingTeam2Only, waitingSuOnly };

    // ⑥ データの不備
    const noRank = users.filter(u => !u.suspended && !String(u.rank || '').trim()).length;
    const noManager = users.filter(u => !u.suspended && !u.manager_id).length; // チーフ手配として意図的に空の場合も含む参考値
    const suspendedIds = users.filter(u => u.suspended).map(u => u.id);
    let suspendedButScheduled = 0;
    if (suspendedIds.length) {
      const ph = suspendedIds.map(() => '?').join(',');
      const r = await safe(env.DB.prepare(`SELECT COUNT(DISTINCT user_id) AS c FROM schedule WHERE type='work' AND date>=? AND user_id IN (${ph})`).bind(today, ...suspendedIds).first(), null);
      suspendedButScheduled = r ? r.c : 0;
    }
    const dataIssues = { noRank, noManager, suspendedButScheduled };

    // ⑦ 給与の確定状況
    const lockedUntil = payLockDate(lockDays);
    const unlockedDays = Math.max(0, Math.floor((Date.parse(today) - Date.parse(lockedUntil)) / 86400000));
    const payLock = { lockedUntil, unlockedDays };

    return J({ systemStatus, todo, monthly, attention, promotions, dataIssues, payLock, canPay });
  }

  // ---- 稼働サマリー(チーフ以上)。月間の出勤日数・現場数・最長連勤・手配偏りを集計 ----
  if (method === 'GET' && path === '/summary') {
    if (!has(me, 'summary_view')) return ERR('ページが見つかりません', 404);
    const month = url.searchParams.get('month') || jstDate().slice(0, 7);
    const [rowsRes, usersRes] = await Promise.all([
      env.DB.prepare("SELECT user_id, date, site, hours, overtime FROM schedule WHERE type='work' AND site<>'' AND date LIKE ? ORDER BY user_id, date").bind(month + '%').all(),
      env.DB.prepare('SELECT id,name,regno,role,rank,han,ka,manager_id,suspended FROM users ORDER BY regno').all(),
    ]);
    const rows = rowsRes.results;
    const users = usersRes.results;
    const umap = {}; for (const u of users) umap[u.id] = u;
    const agg = {};
    for (const r of rows) {
      const a = agg[r.user_id] ||= { dates: [], shifts: 0, hours: 0, overtime: 0, siteCounts: {} };
      a.dates.push(r.date); a.shifts++; a.hours += r.hours || 0; a.overtime += r.overtime || 0;
      if (r.site) a.siteCounts[r.site] = (a.siteCounts[r.site] || 0) + 1;
    }
    const canPay = has(me, 'site_pay'); // 時間・残業を閲覧できるか
    // 手配担当未設定はチーフ手配(課)として扱う
    const chiefLabel = u => `チーフ手配(${u.ka || '未設定'})`;
    const items = users.map(u => {
      const a = agg[u.id] || { dates: [], shifts: 0, hours: 0, overtime: 0, siteCounts: {} };
      // 今月最も多く入った現場(「同じ現場ばかり」検知用)
      let topSite = '', topSiteCount = 0;
      for (const [site, cnt] of Object.entries(a.siteCounts)) { if (cnt > topSiteCount) { topSite = site; topSiteCount = cnt; } }
      return {
        uid: u.id, name: u.name, regno: u.regno, role: u.role, rank: u.rank, han: u.han, ka: u.ka || '',
        manager_id: u.manager_id,
        manager_name: u.manager_id && umap[u.manager_id] ? umap[u.manager_id].name : chiefLabel(u),
        suspended: u.suspended ? 1 : 0,
        workDays: new Set(a.dates).size,
        shifts: a.shifts,
        maxStreak: longestStreak(a.dates),
        hours: canPay ? Math.round(a.hours * 10) / 10 : null,
        overtime: canPay ? Math.round(a.overtime * 10) / 10 : null,
        topSite, topSiteCount,
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

  // ---- 個人の年間稼働サマリー(member_summary_view権限があれば、対象が本人でも閲覧可) ----
  // 12月始まり〜翌年11月終わりの年度で、月ごとの勤務日数・総勤務時間・総残業時間・給料を集計する。
  // ?uid=対象者ID &year=基準年(その年の12月〜翌年11月を対象とする)
  if (method === 'GET' && path === '/member-year-summary') {
    if (!has(me, 'member_summary_view')) return ERR('ページが見つかりません', 404);
    const uid = Number(url.searchParams.get('uid'));
    if (!uid) return ERR('対象者が指定されていません');
    const target = await env.DB.prepare('SELECT id,name,regno,rank,ka,han FROM users WHERE id=?').bind(uid).first();
    if (!target) return ERR('対象者が見つかりません', 404);
    let year = parseInt(url.searchParams.get('year'), 10);
    if (isNaN(year)) year = Number(jstDate().slice(0, 4));
    // year年12月〜(year+1)年11月の12ヶ月分のYYYY-MM一覧を作る
    const yms = [];
    for (let i = 0; i < 12; i++) {
      const m = 12 + i; // 12,13,...,23
      const y = year + Math.floor((m - 1) / 12);
      const mm = ((m - 1) % 12) + 1;
      yms.push(`${y}-${String(mm).padStart(2, '0')}`);
    }
    const rows = (await env.DB.prepare(
      "SELECT date, hours, overtime, pay FROM schedule WHERE user_id=? AND type='work' AND date>=? AND date<?"
    ).bind(uid, yms[0] + '-01', (() => { const [ly, lm] = yms[11].split('-').map(Number); const ny = lm === 12 ? ly + 1 : ly; const nm = lm === 12 ? 1 : lm + 1; return `${ny}-${String(nm).padStart(2, '0')}-01`; })()).all()).results;
    const byMonth = {};
    for (const ym of yms) byMonth[ym] = { ym, workDays: 0, hours: 0, overtime: 0, pay: 0, _dates: new Set() };
    for (const r of rows) {
      const ym = r.date.slice(0, 7);
      const b = byMonth[ym]; if (!b) continue;
      b._dates.add(r.date); b.hours += r.hours || 0; b.overtime += r.overtime || 0; b.pay += r.pay || 0;
    }
    const months = yms.map(ym => {
      const b = byMonth[ym];
      return { ym, workDays: b._dates.size, hours: Math.round(b.hours * 10) / 10, overtime: Math.round(b.overtime * 10) / 10, pay: Math.round(b.pay) };
    });
    const total = months.reduce((a, m) => ({
      workDays: a.workDays + m.workDays, hours: Math.round((a.hours + m.hours) * 10) / 10,
      overtime: Math.round((a.overtime + m.overtime) * 10) / 10, pay: a.pay + m.pay,
    }), { workDays: 0, hours: 0, overtime: 0, pay: 0 });
    return J({
      target: { id: target.id, name: target.name, regno: target.regno, rank: target.rank, ka: target.ka, han: target.han },
      yearLabel: `${year}年12月〜${year + 1}年11月`, year, months, total,
    });
  }

  // ---- 個人の備考欄(member_summary_view権限があれば、対象が本人でも閲覧可)。自由記述を時系列で複数件積み重ねる ----
  if (method === 'GET' && path === '/member-notes') {
    if (!has(me, 'member_summary_view')) return ERR('ページが見つかりません', 404);
    const uid = Number(url.searchParams.get('uid'));
    if (!uid) return ERR('対象者が指定されていません');
    const rows = (await env.DB.prepare('SELECT id, author_name, content, ts FROM member_notes WHERE target_id=? ORDER BY id DESC').bind(uid).all()).results;
    return J({ notes: rows });
  }
  if (method === 'POST' && path === '/member-notes') {
    if (!has(me, 'member_summary_view')) return ERR('ページが見つかりません', 404);
    const uid = Number(body.uid);
    if (!uid) return ERR('対象者が指定されていません');
    const content = String(body.content || '').trim();
    if (!content) return ERR('内容を入力してください');
    await env.DB.prepare('INSERT INTO member_notes(target_id,author_id,author_name,content,ts) VALUES(?,?,?,?,?)')
      .bind(uid, me.id, me.name, content, jstTs()).run();
    return J({ ok: 1 });
  }
  if (method === 'DELETE' && (scm = path.match(/^\/member-notes\/(\d+)$/))) {
    if (!has(me, 'member_summary_view')) return ERR('ページが見つかりません', 404);
    const noteId = Number(scm[1]);
    const note = await env.DB.prepare('SELECT target_id, author_id FROM member_notes WHERE id=?').bind(noteId).first();
    if (!note) return ERR('見つかりません', 404);
    // 本人が書いたメモか、管理者のみ削除可(誤記入の訂正手段は必要だが、他人のメモを誰でも消せると荒らされる恐れがあるため)
    if (note.author_id !== me.id && me.role !== 'admin') return ERR('削除できるのは記入者本人か管理者のみです', 403);
    await env.DB.prepare('DELETE FROM member_notes WHERE id=?').bind(noteId).run();
    return J({ ok: 1 });
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
    const keywordMap = await loadNonSiteKeywords(env);
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
          else if (fmt === 'D') parsed = parseFormatD(grid, detectYmFromGrid(grid, month), keywordMap).rows; // シートに記載の年月を優先。無ければ画面で選択した対象月を使う
          else parsed = parseFormatAB(grid, month, body.cfg, keywordMap).rows;
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
      const r = await applyImportRows(env, allRows, me.id, mode, 'スプレッドシートURL', true);
      // 台帳に登場しない人を休暇にする処理は、複数ファイル(URL)を横断して判定する必要があるため、
      // ここ(手動取り込み・1URLごと)では行わず、夜間の自動再取り込み(cronDaichoReload)でのみ実行する。
      urlMeta[rawUrl] = { sheetTitle: sheetFileTitle || '', targetDate: fileDate || '' };
      try { await matchRookieAndBlacklist(env, allRows); } catch (e) {}

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

      results.push({ url: rawUrl, ok: true, sheetsRead: sheetReport.length, sheets: sheetReport, applied: r.applied, skipped: r.skipped, skippedUnregistered: r.skippedUnregistered, skippedUnchanged: r.skippedUnchanged, skippedInvalid: r.skippedInvalid, skippedOtherOrg: r.skippedOtherOrg, errors: r.errors, mode: fellBack ? '単一シート(全タブ取得に失敗)' : '全シート', archived, archiveError, ts: r.ts, changes: r.changes || [] });
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
    const uidFilter = url.searchParams.get('uid');
    const rows = uidFilter
      ? (await env.DB.prepare(
          "SELECT h.*, COALESCE(e.name, CASE WHEN h.editor_id=0 THEN 'スプレッドシート' ELSE '不明' END) AS editor_name, t.name AS target_name FROM schedule_history h LEFT JOIN users e ON e.id=h.editor_id LEFT JOIN users t ON t.id=h.target_id WHERE h.target_id=? ORDER BY h.id DESC LIMIT 500"
        ).bind(Number(uidFilter)).all()).results
      : (await env.DB.prepare(
          "SELECT h.*, COALESCE(e.name, CASE WHEN h.editor_id=0 THEN 'スプレッドシート' ELSE '不明' END) AS editor_name, t.name AS target_name FROM schedule_history h LEFT JOIN users e ON e.id=h.editor_id LEFT JOIN users t ON t.id=h.target_id ORDER BY h.id DESC LIMIT 500"
        ).all()).results;
    return J(rows);
  }
  // 編集履歴からの取り消し。指定した履歴レコードの「変更前(before_json)」の状態に、
  // 対象者のその日のスケジュールを復元する。誤って台帳を読み込んでしまった場合などに使う。
  // 取り消し自体も新しい履歴として記録するため、何度でも辿って戻せる。
  let hum;
  if (method === 'POST' && (hum = path.match(/^\/history\/(\d+)\/undo$/))) {
    if (!handlerMode && !has(me, 'handler_tools')) return ERR('取り消しには手配モードが必要です', 403);
    try { await undoHistoryEntry(env, Number(hum[1]), me); }
    catch (e) { return ERR(e.message); }
    return J({ ok: 1 });
  }
  // 複数の履歴をまとめて取り消す。新しいもの(id降順)から順に1件ずつ処理することで、
  // 同じ対象者・同じ日に複数の変更が選ばれた場合でも、直後の変更が古い状態を上書きしてしまう
  // ことなく、正しく元の状態まで辿り着けるようにする。
  if (method === 'POST' && path === '/history/undo-batch') {
    if (!handlerMode && !has(me, 'handler_tools')) return ERR('取り消しには手配モードが必要です', 403);
    const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(n => n > 0) : [];
    if (!ids.length) return ERR('取り消す履歴を選択してください');
    const sorted = [...new Set(ids)].sort((a, b) => b - a);
    let okCount = 0; const failed = [];
    for (const id of sorted) {
      try { await undoHistoryEntry(env, id, me); okCount++; }
      catch (e) { failed.push({ id, error: e.message }); }
    }
    return J({ ok: 1, okCount, failed });
  }
  // 1回の取り込み実行(スプレッドシート取込・台帳取込・予定表ソース取込)で発生した変更を、
  // まとめて取り消す。取り込み実行時刻(ts)を指定すると、その時刻に記録された履歴を全て
  // (新しいものから順に)取り消す。大量の誤ったデータが取り込まれてしまった際、
  // 1件ずつ選んで取り消す手間を無くすための機能。
  if (method === 'POST' && path === '/history/undo-by-ts') {
    if (!handlerMode && !has(me, 'handler_tools')) return ERR('取り消しには手配モードが必要です', 403);
    const ts = String(body.ts || '').trim();
    if (!ts) return ERR('取り消し対象の取り込み実行時刻が指定されていません');
    const rows = (await env.DB.prepare('SELECT id FROM schedule_history WHERE ts=? ORDER BY id DESC').bind(ts).all()).results;
    if (!rows.length) return ERR(`実行時刻「${ts}」に対応する変更履歴が見つかりませんでした(既に取り消し済み、または対象外の可能性があります)`);
    let okCount = 0; const failed = [];
    for (const r of rows) {
      try { await undoHistoryEntry(env, r.id, me); okCount++; }
      catch (e) { failed.push({ id: r.id, error: e.message }); }
    }
    return J({ ok: 1, okCount, total: rows.length, failed });
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
    const ins = await env.DB.prepare(
      'INSERT INTO reports(ts,reporter_id,reporter_name,candidate_name,candidate_grade,first_chief,first_note,s_motivation,s_response,s_total,draft,plan,checker,next_site,next_date,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(r.ts, r.reporter_id, r.reporter_name, r.candidate_name, r.candidate_grade, r.first_chief, r.first_note, r.s_motivation, r.s_response, r.s_total, r.draft, r.plan, r.checker, r.next_site, r.next_date, r.status).run();
    const newReportId = ins.meta && ins.meta.last_row_id;
    await notifyChiefs(env, 'report', `📝 新人報告:${r.candidate_name}(報告者:${me.name})${r.status === 'pending' ? ' — 2次チェックをお願いします' : ''}`, newReportId ? `#/reports?open=${newReportId}` : '');
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
  if ((mm = path.match(/^\/reports\/(\d+)$/)) && method === 'DELETE') {
    if (!has(me, 'site_manage')) return ERR('削除には手配者以上の権限が必要です', 403);
    const id = Number(mm[1]);
    const r = await env.DB.prepare('SELECT id FROM reports WHERE id=?').bind(id).first();
    if (!r) return ERR('報告が見つかりません', 404);
    await env.DB.prepare('DELETE FROM rookie_site_matches WHERE kind=? AND report_id=?').bind('report', id).run();
    await env.DB.prepare('DELETE FROM reports WHERE id=?').bind(id).run();
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
    const talk = sc(body.s_talk), dress = sc(body.s_dress), groom = sc(body.s_groom), late = sc(body.s_late), work = sc(body.s_work);
    await env.DB.prepare(
      'INSERT INTO blacklist(ts,date,reporter,name,s_talk,s_dress,s_groom,s_late,s_work,reason,added_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(jstTs(), body.date || jstDate(), body.reporter || me.name, body.name,
      talk, dress, groom, late, work,
      body.reason || '', me.name).run();
    try {
      const admins = (await env.DB.prepare("SELECT id FROM users WHERE role='admin' AND COALESCE(suspended,0)=0").all()).results;
      if (admins.length) await notify(env, admins.map(a => a.id), 'blacklist', `⚠️ ブラックリストに登録:${body.name}(登録者:${me.name})`, '#/blacklist');
    } catch (e) {}
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

  // ---- Googleカレンダー等への購読URL(iCalendarフィード)の発行・再発行 ----
  if (method === 'GET' && path === '/calendar-token') {
    const row = await env.DB.prepare('SELECT calendar_token FROM users WHERE id=?').bind(me.id).first();
    return J({ token: row ? row.calendar_token : null });
  }
  if (method === 'POST' && path === '/calendar-token') {
    // 既に発行済みなら、その値をそのまま返す(冪等)。無ければ新規発行する。
    const row = await env.DB.prepare('SELECT calendar_token FROM users WHERE id=?').bind(me.id).first();
    if (row && row.calendar_token) return J({ token: row.calendar_token });
    const token = rnd();
    await env.DB.prepare('UPDATE users SET calendar_token=? WHERE id=?').bind(token, me.id).run();
    return J({ token });
  }
  if (method === 'POST' && path === '/calendar-token/regenerate') {
    // 既存のURLを知っている第三者を締め出すため、新しいトークンに差し替える
    const token = rnd();
    await env.DB.prepare('UPDATE users SET calendar_token=? WHERE id=?').bind(token, me.id).run();
    return J({ token });
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
// 台帳の再取り込み本体。cron(cronDaichoReload)と手動実行(POST /daicho-reload-run-now)の両方から呼ばれる共通ロジック。
// opt.updateRemaining: true の場合、1件処理し終えるたびに import_urls 設定から取り除いて保存する
//   (cron実行中の途中終了への耐性のため)。手動で一部URLだけ選んだ場合は、保存済みリストが
//   壊れないよう false にする。
// opt.checkAbsent: true の場合のみ、対象ファイルに登場しない人を休暇化する。一部のURLだけを
//   対象にした手動実行では、他の未選択ファイルに載っている人まで誤って休暇にしてしまうため、
//   「保存済み全URL」を対象にした場合のみ true にすること。
// opt.sourceLabel: daicho_archive に残す取込元ラベル。
async function runDaichoReload(env, urls, opt = {}) {
  const sourceLabel = opt.sourceLabel || '台帳再取り込み';
  if (!urls.length) return { okCount: 0, ngCount: 0, totalApplied: 0, results: [], absentResult: { clearedPeople: 0, clearedDays: 0 } };

  const adminUser = await env.DB.prepare("SELECT id, name FROM users WHERE role='admin' LIMIT 1").first();
  const editorId = adminUser ? adminUser.id : 0;
  const editorName = adminUser ? adminUser.name : '自動';
  const results = [];
  const allRowsCombined = []; // 対象URL(全ファイル)を横断して集める。不在者判定はこれを使って最後にまとめて行う。
  const keywordMap = await loadNonSiteKeywords(env);

  // 処理中に残っているURL一覧。1件処理し終えるたびに、ここから取り除いて都度保存する。
  let remainingUrls = null;
  if (opt.updateRemaining) {
    const allSavedRaw = JSON.parse(await getSetting(env, 'import_urls', '[]') || '[]');
    remainingUrls = allSavedRaw.map(x => typeof x === 'string' ? x : x.url);
  }

  for (const rawUrl of urls) {
    const meta = parseSheetUrl(rawUrl);
    if (!meta) { results.push({ url: rawUrl, ok: false, error: 'URL不正' }); }
    else {
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
            else if (fmt === 'D') {
              // 複数月のタブが1つのスプレッドシートに並ぶ運用があるため、実行時点の月への
              // フォールバックは行わない(全タブが同じ月として混在してしまう事故を防ぐ)。
              const ym = detectYmFromGrid(grid, null);
              if (!ym) { sheetReport.push({ name: sh.name, count: 0, note: 'シートから年月を読み取れなかったためスキップしました' }); continue; }
              parsed = parseFormatD(grid, ym, keywordMap).rows;
            }
            else parsed = parseFormatAB(grid, jstDate().slice(0, 7), null, keywordMap).rows;
            if (parsed && parsed.length) { allRows = allRows.concat(parsed); sheetReport.push({ name: sh.name, count: parsed.length }); }
          } catch (e) {
            sheetReport.push({ name: sh.name, count: 0, note: `解析エラー: ${e.message}` });
          }
        }
        if (!allRows.length) { results.push({ url: rawUrl, ok: false, error: 'データなし' }); }
        else {
          const r = await applyImportRows(env, allRows, editorId, 'replace-person-day', sourceLabel, true);
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
            ).bind(ts, editorId, editorName + (opt.updateRemaining ? '(自動)' : '(手動)'), rawUrl, meta.id, r2key, fname, got.raw.length, r.applied, sheetReport.length).run();

            // 同じfile_idの古いバージョンを削除(最新版=今追加した1件だけ残す)
            const oldRecs = (await env.DB.prepare(
              'SELECT id, r2_key FROM daicho_archive WHERE file_id=? AND r2_key!=? ORDER BY id DESC'
            ).bind(meta.id, r2key).all()).results;
            for (const old of oldRecs) {
              try { await env.DAICHO.delete(old.r2_key); } catch (e) {}
              await env.DB.prepare('DELETE FROM daicho_archive WHERE id=?').bind(old.id).run();
            }
          }
          results.push({ url: rawUrl, ok: true, applied: r.applied, changes: r.changes || [], ts: r.ts });
        }
      } catch (e) {
        results.push({ url: rawUrl, ok: false, error: e.message });
      }
    }
    // このURLの処理を終えたら、都度リストから取り除いて保存する(cronの途中終了への耐性)
    if (opt.updateRemaining) {
      remainingUrls = remainingUrls.filter(u => u !== rawUrl);
      try { await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('import_urls',?)").bind(JSON.stringify(remainingUrls)).run(); } catch (e) {}
    }
  }

  const totalApplied = results.reduce((s, r) => s + (r.ok ? (r.applied || 0) : 0), 0);
  const okCount = results.filter(r => r.ok).length;
  const ngCount = results.length - okCount;

  // 不在者の休暇化: 対象URL(全ファイル)を横断して判定する。
  // (1ファイルごとに判定すると、Aファイルには載っているがBファイルには載っていない人まで
  //  誤って休暇にしてしまうため、必ず全ファイル分を集めてから最後に1回だけ行う。
  //  一部URLのみの手動実行では、他の未選択ファイルの人を巻き込む恐れがあるため実行しない)
  let absentResult = { clearedPeople: 0, clearedDays: 0 };
  let registryResult = { clearedRegistrations: 0 };
  if (allRowsCombined.length) {
    if (opt.checkAbsent) {
      try { absentResult = await clearAbsentFromDaicho(env, allRowsCombined, editorId); }
      catch (e) { console.error('clearAbsentFromDaicho failed:', e); }
      try { registryResult = await clearAbsentSiteRegistry(env, allRowsCombined); }
      catch (e) { console.error('clearAbsentSiteRegistry failed:', e); }
    }
    try { await matchRookieAndBlacklist(env, allRowsCombined); }
    catch (e) { console.error('matchRookieAndBlacklist failed:', e); }
  }

  return { okCount, ngCount, totalApplied, results, absentResult, registryResult, editorId };
}

async function cronDaichoReload(env) {
  const targetHour = parseInt(await getSetting(env, 'daicho_reload_hour', '0'), 10);
  const now = new Date(Date.now() + 9 * 3600e3); // JST
  // 「ちょうどtargetHourの回」だけを狙うと、Cron Triggerの実行頻度が低い場合に
  // タイミングが合わず永遠に実行されないことがあるため、「targetHourを過ぎていれば」実行する。
  // 日付をまたいだ場合(targetHour=0等)も、日付が変わった時点でlastRunと不一致になり正しく動く。
  if (now.getUTCHours() < targetHour) return;
  const today = jstDate();
  const lastRun = await getSetting(env, 'daicho_reload_last_run', '');
  if (lastRun === today) return; // 1日1回のみ

  let urls;
  try {
    const urlsRaw = JSON.parse(await getSetting(env, 'import_urls', '[]') || '[]');
    urls = urlsRaw.map(x => typeof x === 'string' ? x : x.url);
  } catch (e) {
    console.error('[cronDaichoReload] import_urls の読み込みに失敗しました。フラグは立てず、次回に再試行します:', e);
    return; // ここでフラグを立てると、壊れたデータを直すまで毎日再取込が止まったままになる
  }
  if (!urls.length) {
    await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('daicho_reload_last_run',?)").bind(today).run();
    return;
  }

  const r = await runDaichoReload(env, urls, { updateRemaining: true, checkAbsent: true, sourceLabel: '台帳自動再取り込み' });

  // 全URLの取込を終えてからフラグを立てる(途中で予期せぬ例外が起きても、その日のうちに再試行できるようにするため)
  await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('daicho_reload_last_run',?)").bind(today).run();

  // 取り込み結果を確定・通知しておく(この後の不在者判定・照合処理でタイムアウトしても、
  // 取り込み自体の成否は必ず管理者に届くようにするため)
  await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('daicho_reload_last_result',?)").bind(
    JSON.stringify({ ts: jstTs(), count: urls.length, results: r.results, clearedAbsent: r.absentResult.clearedPeople, clearedRegistrations: r.registryResult.clearedRegistrations })
  ).run();
  try {
    const admins = (await env.DB.prepare("SELECT id FROM users WHERE role='admin' AND COALESCE(suspended,0)=0").all()).results;
    if (admins.length) {
      await notify(env, admins.map(a => a.id), 'sched_import',
        `🌙 台帳の深夜自動再取り込みが完了しました(${jstTs()})。${r.okCount}件成功(反映${r.totalApplied}件)${r.ngCount ? ` / ${r.ngCount}件失敗` : ''}`,
        '#/import?result=daicho');
      if (r.absentResult.clearedPeople) {
        await notify(env, admins.map(a => a.id), 'sched_import', `🌙 台帳自動再取り込みに伴い、不在者の休暇化を${r.absentResult.clearedPeople}件行いました。`, '#/import?result=daicho');
      }
      if (r.registryResult.clearedRegistrations) {
        await notify(env, admins.map(a => a.id), 'sched_import', `🌙 台帳自動再取り込みに伴い、台帳に見当たらなくなった登録現場を${r.registryResult.clearedRegistrations}件削除しました。`, '#/sites');
      }
    }
  } catch (e) {}
}

// 新人報告リマインド通知。
// 対象者 = 「その日、現場(work)の予定がある」かつ「役割が基本ルールを満たす(既定:チーフ以上)」人。
// 役割に関わらず、個人ごとに users.notify_rookie で「常に対象(1)」「常に対象外(0)」に上書き設定できる(NULL=基本ルールに従う)。
// さらに、対象者本人がその日まだ新人報告を提出していない場合のみ送信する(既に提出済みの人には送らない)。
//
// 注意: チーフ予定表の自動取込(cronScheduleSources)は「読み込み日の2日後以降」しか反映しない設計
// (当日・翌日は台帳の実績取り込みを優先するため)なので、チーフ自身の「当日」のscheduleレコードは
// 存在しないことが多い。その場合、上記の条件では対象者が0人になってしまうため、その日どこかの現場
// (work)が1件でも稼働していれば、対象ロール全員(新人報告未提出者)に通知するフォールバックを設ける。
// 研修による昇格予約(promotion_pending_date)が到来した人のランクを、実際に切り替える日次バッチ。
// マナー研修は受講の翌日、チーム研修(2部)+ステージアップ研修(SU)完了は翌月1日から適用される。
// 切り替え時は履歴を残し、その月の給与を月初から新ランクで再計算する。
async function cronRankPromotion(env) {
  const today = jstDate();
  const lastRun = await getSetting(env, 'rank_promotion_last_run', '');
  if (lastRun === today) return { promoted: 0 }; // 1日1回のみ

  const targets = (await env.DB.prepare(
    "SELECT id, rank, promotion_pending_rank FROM users WHERE promotion_pending_date IS NOT NULL AND promotion_pending_date <= ? AND COALESCE(suspended,0)=0"
  ).bind(today).all()).results;
  const ts = jstTs();
  let promoted = 0;
  for (const u of targets) {
    const newRank = u.promotion_pending_rank;
    if (!newRank) {
      await env.DB.prepare('UPDATE users SET promotion_pending_date=NULL, promotion_pending_rank=NULL WHERE id=?').bind(u.id).run();
      continue;
    }
    const reason = newRank === 'D' ? 'manner_auto' : 'promotion_auto';
    await env.DB.prepare('UPDATE users SET rank=?, promotion_pending_date=NULL, promotion_pending_rank=NULL WHERE id=?').bind(newRank, u.id).run();
    await env.DB.prepare('INSERT INTO rank_history(user_id,before_rank,after_rank,reason,changed_by,ts) VALUES(?,?,?,?,?,?)')
      .bind(u.id, u.rank, newRank, reason, null, ts).run();
    // 昇格した月は、月初から新ランクで給与を計算し直す
    try { await recalcPayForMonth(env, u.id, today.slice(0, 7), newRank); } catch (e) { console.error('recalcPay failed for user', u.id, e); }
    try { await notify(env, [u.id], 'rank', `🎉 ランクが ${newRank} に上がりました。今月分の給与も新しいランクで再計算されています。`, `#/schedule/${u.id}?month=${today.slice(0, 7)}`); } catch (e) { console.error('notify failed for user', u.id, e); }
    promoted++;
  }
  // 全対象者を処理し終えてからフラグを立てる(途中で例外が起きても、その日のうちに再試行できるようにするため)
  await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('rank_promotion_last_run',?)").bind(today).run();
  console.log('[cronRankPromotion] promoted', promoted);
  return { promoted };
}

async function cronNotify(env, opt = {}) {
  console.log('[cronNotify] start', JSON.stringify(opt));
  const enabled = await getSetting(env, 'notify_enabled', '1');
  if (enabled === '0' && !opt.force) { console.log('[cronNotify] disabled'); return { sent: 0, reason: '通知設定がOFFです' }; }
  const targetHour = parseInt(await getSetting(env, 'notify_hour', '21'), 10);
  const now = new Date(Date.now() + 9 * 3600e3);   // JST
  const today = jstDate();
  if (!opt.force) {
    // 「ちょうどtargetHourの回」だけを狙うと、Cron Triggerの実行頻度が低い場合に
    // タイミングが合わず永遠に実行されないことがあるため、「targetHourを過ぎていて、
    // かつ今日まだ実行していない」を条件にする(実行頻度に依存しない堅牢な設計)。
    if (now.getUTCHours() < targetHour) { console.log('[cronNotify] before target hour', now.getUTCHours(), targetHour); return { sent: 0, reason: `まだ設定時刻(${targetHour}時)前です` }; }
    const lastRun = await getSetting(env, 'notify_last_run', '');
    if (lastRun === today) { console.log('[cronNotify] already run today', lastRun); return { sent: 0, reason: '本日は既に実行済みです' }; }
  }
  const scope = await getSetting(env, 'notify_target', 'chiefs'); // 既定:チーフ以上
  let baseRoles = ['chief', 'handler', 'admin'];
  if (scope === 'handlers') baseRoles = ['handler', 'admin'];
  else if (scope === 'all') baseRoles = ['member', 'chief', 'handler', 'admin'];
  const phRole = baseRoles.map(() => '?').join(',');
  console.log('[cronNotify] scope', scope, 'roles', baseRoles);

  // その日、稼働している現場が1件も無ければ、そもそも通知の必要が無い
  const hasAnySite = await env.DB.prepare("SELECT 1 FROM schedule WHERE date=? AND type='work' AND site<>'' LIMIT 1").bind(today).first();
  console.log('[cronNotify] hasAnySite', !!hasAnySite, 'today', today);
  if (!hasAnySite) return { sent: 0, reason: '本日、現場の予定が登録されていません' }; // ここで戻る場合はnotify_last_runを更新しない(現場データが後から入ってくる可能性があるため、その日のうちに再挑戦できるようにする)
  // ここまで来たら、今日はもう実行しない(重複送信防止のため、対象者が0人でも記録する)。強制実行時は記録しない(手動テストのため)。
  if (!opt.force) await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('notify_last_run',?)").bind(today).run();

  // その日、実際にwork予定があるチーフ以上(または notify_rookie=1 の個人設定者)のみを対象にする。
  // 過去には「該当者が0人なら対象ロール全員へフォールバックする」仕様だったが、これは
  // 「チーフのスケジュールデータが未登録の環境」を救済するためのものが、実際には
  // 「その日はたまたま誰もチーフが現場に入っていない、ごく普通の日」でも発動してしまい、
  // 現場に入っていない人にまで新人報告リマインドが届いてしまう誤送信の原因になっていた。
  // 対象者が実際に0人であれば、単純に「今日は送る必要が無い」として何もしないのが正しい。
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
  console.log('[cronNotify] recipients', recipients.length);

  const ids = recipients.map(r => r.id);
  if (ids.length) await notify(env, ids, 'remind', `⏰【リマインド】(${today}) 本日現場が稼働しています。新人の報告があれば忘れずに提出してください。`, '#/report');
  console.log('[cronNotify] done, sent to', ids.length);
  return { sent: ids.length, reason: ids.length ? '' : '対象者が0人でした(全員報告済み、または対象ロールの人が現場に入っていません)' };
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
  // ラベルに「チーフ」を含むソースは、他より必ず先に処理する。予定表ソースの反映は
  // skip-if-exists方式(既にその日に予定があれば上書きしない)のため、先に処理された内容が
  // 優先的に残る。同じ人が複数の予定表に載っている場合、チーフ予定表の内容を優先するための措置。
  sources.sort((a, b) => {
    const aChief = /チーフ/.test(a.label) ? 0 : 1;
    const bChief = /チーフ/.test(b.label) ? 0 : 1;
    return aChief - bChief; // 安定ソートなので、同じ優先度内ではlast_run ASCの順序が保たれる
  });

  for (const src of sources) {
    try {
      let shouldRun = false;
      if (src.freq_type === 'daily') {
        const targetHour = Number(src.hour) || 0;
        // 「ちょうどtargetHourの回」だけを狙うと、Cron Triggerの実行頻度が低い場合に
        // タイミングが合わず永遠に実行されないことがあるため、「targetHourを過ぎていれば」実行する。
        if (now.getUTCHours() >= targetHour && (src.last_run || '').slice(0, 10) !== jstDate()) shouldRun = true;
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
      // fetch自体のタイムアウトに加え、パース等の処理も含めた全体に上限を設ける(二重の安全策)。
      // 1ソースが極端に重くても、cron全体・他のソースの処理を巻き込んで止めないようにするため。
      const timeoutMs = 28000;
      const r = await Promise.race([
        importScheduleSheet(env, 'sched_src_' + src.id, src.url, adminUser ? adminUser.id : 0, fromDate, { excludeUnmanaged: !!src.exclude_unmanaged }),
        new Promise((_, rej) => setTimeout(() => rej(new Error(`処理がタイムアウトしました(${timeoutMs / 1000}秒)`)), timeoutMs)),
      ]);
      await env.DB.prepare('UPDATE sched_sources SET last_run=?, last_result=? WHERE id=?').bind(
        jstTs(),
        JSON.stringify({ ts: r.ts, applied: r.applied, skipped: r.skipped, unchangedPeople: r.unchangedPeople, changedPeople: r.changedPeople, error: (r.errors && r.errors[0]) || '', changes: r.changes || [] }),
        src.id
      ).run();
      console.log(`[cronScheduleSources] done: id=${src.id} applied=${r.applied} skipped=${r.skipped}`);

      if (src.notify_admin && r.applied > 0) {
        const admins = (await env.DB.prepare("SELECT id FROM users WHERE role='admin' AND COALESCE(suspended,0)=0").all()).results;
        if (admins.length) {
          await notify(env, admins.map(a => a.id), 'sched_import',
            `📅【${src.label}】からスケジュールを取り込みました(${jstTs()})。反映${r.applied}件・変更あり${r.changedPeople ?? '-'}人`,
            `#/sched-sources?result=${src.id}`);
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
    const withSecurityHeaders = (resp) => {
      const headers = new Headers(resp.headers);
      // クリックジャッキング対策(他サイトのiframeにこのアプリを埋め込ませない)
      headers.set('X-Frame-Options', 'DENY');
      headers.set('Content-Security-Policy', "frame-ancestors 'none'");
      // MIMEタイプスニッフィング対策
      headers.set('X-Content-Type-Options', 'nosniff');
      // どのサイト経由で来たか(リファラ)を、外部サイトへは送らない
      headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
      return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers });
    };
    if (url.pathname.startsWith('/api/')) {
      try { return withSecurityHeaders(await api(req, env, url)); }
      catch (e) {
        // 内部エラーの詳細(SQL文やスタック等)はサーバーログにのみ残し、クライアントには
        // 一般的なメッセージのみ返す(DB構造等の手がかりを外部に与えないため)
        console.error('API error:', e);
        return withSecurityHeaders(ERR('サーバーエラーが発生しました。時間をおいて再度お試しください。', 500));
      }
    }
    const resp = await env.ASSETS.fetch(req);
    // index.html / app.js / style.css は、更新の反映が最優先のファイルなので、ブラウザに
    // そのまま古い版を使わせたくない。ただし no-store(毎回まるごと再ダウンロード)は、
    // ファイルサイズが大きくなるほど読み込みが重くなる。no-cache(ETagで再検証し、変更が
    // 無ければ極小の304応答で済ませる)にすることで、「常に最新版」は保ちつつ軽くする。
    const p = url.pathname;
    if (p === '/' || p === '/index.html' || p === '/app.js' || p === '/style.css') {
      const headers = new Headers(resp.headers);
      headers.set('Cache-Control', 'no-cache, must-revalidate');
      return withSecurityHeaders(new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers }));
    }
    return withSecurityHeaders(resp);
  },
  // 各cronタスクは互いに影響しないよう、それぞれ独立してtry-catchする。
  // 台帳の深夜再取込を最優先で実行(最も重要な処理のため、他のcronが重くても確実に走らせる)。
  async scheduled(event, env) {
    const startTs = jstTs();
    console.log(`[scheduled] start at ${startTs}`);
    try { await cronDaichoReload(env); } catch (e) { console.error('cronDaichoReload failed:', e); }
    try { await cronScheduleSources(env); } catch (e) { console.error('cronScheduleSources failed:', e); }
    try { await cronRankPromotion(env); } catch (e) { console.error('cronRankPromotion failed:', e); }
    try { await cronNotify(env); } catch (e) { console.error('cronNotify failed:', e); }
    console.log(`[scheduled] end (started at ${startTs})`);
  }
};
