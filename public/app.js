/* RB事業2課 スケジュール管理 SPA */
'use strict';
const $ = s => document.querySelector(s);
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// 絵文字の代わりに使う、線画(Lucideスタイル)のSVGアイコン。24x24のviewBoxを前提にパスのみ記述する。
const ICONS = {
  home:'<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  calendar:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  calendarDays:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
  edit:'<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z"/>',
  handRaise:'<path d="M11 13V6a2 2 0 1 1 4 0v6"/><path d="M15 5a2 2 0 1 1 4 0v9"/><path d="M7 15V9a2 2 0 1 1 4 0v6"/><path d="M7 13a2 2 0 1 0-4 0v3a8 8 0 0 0 8 8h1a8 8 0 0 0 8-8v-1a2 2 0 1 0-4 0"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/>',
  users:'<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  checkCircle:'<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/>',
  stadium:'<path d="M6 22V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v18"/><path d="M3 22h18"/><path d="M9 22v-4h6v4"/><path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01"/>',
  briefcase:'<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  barChart:'<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-4"/>',
  trendingUp:'<path d="M22 7l-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  layoutGrid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  mail:'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/>',
  fileText:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 15h6M9 11h1"/>',
  clipboardList:'<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3"/><path d="M9 12h6M9 16h6M9 9h1"/>',
  paperclip:'<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  key:'<path d="M21 2l-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
  logOut:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  undo:'<path d="M9 14l-4-4 4-4"/><path d="M5 10h11a4 4 0 0 1 4 4v0a4 4 0 0 1-4 4h-1"/>',
  mapPin:'<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  shieldCheck:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
  shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  arrowUpDown:'<path d="M8 3v18M3 7l5-4 5 4M16 21l5-4-5-4M21 17V3"/>',
  search:'<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
  download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  star:'<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
  ban:'<circle cx="12" cy="12" r="10"/><path d="M4.93 4.93l14.14 14.14"/>',
  rss:'<path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/>',
  scroll:'<path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/>',
  refresh:'<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M8 16H3v5"/>',
  x:'<path d="M18 6L6 18M6 6l12 12"/>',
  xCircle:'<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>',
  circle:'<circle cx="12" cy="12" r="10"/>',
  circleFilled:'<circle cx="12" cy="12" r="8" fill="currentColor" stroke="none"/>',
  badge:'<path d="M12 2l2.4 5.5L20 8l-4 4.2L17.5 18 12 15l-5.5 3L8 12.2 4 8l5.6-.5z"/>',
  arrowLeft:'<path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>',
  chevronsUp:'<path d="M17 11l-5-5-5 5"/><path d="M17 18l-5-5-5 5"/>',
  chevronsDown:'<path d="M7 13l5 5 5-5"/><path d="M7 6l5 5 5-5"/>',
  arrowRight:'<path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  trash:'<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  flask:'<path d="M9 2v6L4.5 18a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L15 8V2"/><path d="M9 2h6"/><path d="M8.5 13h7"/>',
  yen:'<path d="M6 3l6 8 6-8"/><path d="M12 11v10M7 12h10M7 16h10"/>',
  sparkles:'<path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M19 15l.75 2.25L22 18l-2.25.75L19 21l-.75-2.25L16 18l2.25-.75z"/>',
  wrench:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L2 19l3 3 7.3-7.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2z"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  unlock:'<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  lock:'<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  bookOpen:'<path d="M2 5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16a2 2 0 0 0-2-2H2z"/><path d="M22 5a2 2 0 0 0-2-2h-5a2 2 0 0 0-2 2v16a2 2 0 0 1 2-2h7z"/>',
  clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  messageCircle:'<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  megaphone:'<path d="M3 11l18-5v12L3 13v-2z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  tag:'<path d="M20.59 13.41L13.42 20.6a2 2 0 0 1-2.83 0L2 12.01V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><path d="M7 7h.01"/>',
  moon:'<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  sun:'<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
  clockWarn:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  repeat:'<path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  activity:'<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  package:'<path d="M16.5 9.4L7.5 4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.27 6.96L12 12.01l8.73-5.05"/><path d="M12 22.08V12"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  construction:'<rect x="2" y="6" width="20" height="8" rx="1"/><path d="M17 14v7M7 14v7M17 3v3M7 3v3M4 14v-6M20 14v-6"/>',
  eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  gauge:'<path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path d="M13.4 10.6L19 5"/><path d="M20.5 15a9 9 0 1 0-17 0"/>',
  play:'<path d="M5 3l14 9-14 9V3z"/>',
  alertTriangle:'<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/>',
  inbox:'<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  sitemap:'<circle cx="12" cy="4" r="2"/><path d="M12 6v4"/><path d="M5 14v-2a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2"/><path d="M5 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/><path d="M12 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/><path d="M19 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/>',
};
// icon('home')のように呼び、絵文字の代わりに使える線画SVGを返す。sizeとcolorは省略可(currentColorを継承)
function icon(name, opt={}){
  const size = opt.size || '1em';
  const path = ICONS[name];
  if(!path) return '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${opt.strokeWidth||2}" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-.15em;flex:none" aria-hidden="true">${path}</svg>`;
}
// メニュー項目に付与された「最低権限」から、実際にその項目を見られる全ロールのドットを並べて生成する。
// 例: minRole='handler' なら「これ以上の全て」= 手配者(緑)・管理者(赤) の2つが並ぶ。
//     minRole='chief' なら チーフ(青)・手配者(緑)・管理者(赤) の3つ全て並ぶ。
const ROLE_DOT_LV = { chief: 1, handler: 2, admin: 3 };
function roleDots(minRole){
  if(!minRole) return '';
  const minLv = ROLE_DOT_LV[minRole];
  return ['chief','handler','admin'].filter(r => ROLE_DOT_LV[r] >= minLv)
    .map(r => `<span class="role-dot role-dot-${r}"></span>`).join('');
}
// ブラックリストの「既にアプリに登録されている」バッジ。一覧・詳細モーダル両方で使う。
const matchedBadge = ka => ka ? `<span class="tag matched" title="既にアプリに登録されています">${icon('clockWarn')} 登録済(${h(ka)})</span>` : '';
// ファイル名から日付を推測する(例:「7月15日_台帳」「2026-07-15」「0715」等、よくある命名パターンに対応)。
// 台帳Excelの手動アップロード・台帳保管からの再取込、両方で使う。
function guessDateFromName(name){
  const today = jstToday();
  const [ty] = today.split('-');
  let m = name.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  m = name.match(/(\d{1,2})月(\d{1,2})日/);
  if (m) return `${ty}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
  m = name.match(/(\d{1,2})[-/](\d{1,2})(?!\d)/);
  if (m) return `${ty}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
  return '';
}
// <input type="time">はHH:MM(2桁ゼロ埋め)でないと値を認識しないため、DBの値をこの形式に正規化する
const timeInputVal = t => { const m = String(t||'').match(/^(\d{1,2}):(\d{2})$/); return m ? `${m[1].padStart(2,'0')}:${m[2]}` : ''; };
const pad = n => String(n).padStart(2, '0');
const WD = ['日','月','火','水','木','金','土'];
// ランクの並び順(A→B→C→D→Eの順)。それ以外の特殊ランク(ケータリング等)は末尾、未設定は最後尾にする。
const RANK_ORDER = { A:0, B:1, C:2, D:3, E:4 };
function rankOrder(r){
  if(!r) return 6;
  const m = String(r).match(/[A-Ea-e]/);
  return m ? RANK_ORDER[m[0].toUpperCase()] : 5;
}
// ランク進捗タイムライン(E→D→C→B→A)。特殊ランク・未設定の場合は何も返さない(呼び出し側で空文字を弾く)。
function renderRankTrack(currentRank){
  const order = ['E','D','C','B','A'];
  const m = String(currentRank||'').match(/[A-Ea-e]/);
  if(!m) return '';
  const cur = m[0].toUpperCase();
  const curIdx = order.indexOf(cur);
  return `<ul class="rank-track">${order.map((r,i) => {
    const cls = i < curIdx ? 'prev' : i === curIdx ? 'current' : '';
    return `<li class="${cls}" data-rank="${r}">${r}</li>`;
  }).join('')}</ul>`;
}
const ROLE_JP = { admin:'チーフ(管理者)', handler:'チーフ(手配者)', chief:'チーフ', member:'メンツ' };
// ログイン中メンバー・セッション一覧で、location.hashを見やすい画面名に変換するための対応表
const PAGE_LABELS = {
  'home':'ホーム','dashboard':'ダッシュボード','schedule':'マイスケジュール','edit':'スケジュール入力',
  'availability':'休み希望・稼働時間の提出','availability-team':'チームの希望一覧','nominate':'メンバーを希望する','nominations':'メンバー指名の承認',
  'self-reports':'現場変更報告の承認','sites':'現場一覧','members':'メンバー一覧','summary':'稼働サマリー','member-stats':'メンバー分析',
  'day-schedule':'スケジュール一覧','member-summary':'個人の年間サマリー','report':'新人報告','reports':'報告一覧','draft':'ドラフト',
  'blacklist':'ブラックリスト','report-export':'スプレッドシート貼り付け用コピー','admin':'アカウント管理','admin-settings':'システム設定',
  'role-permissions':'権限の一括設定','handler-status':'ログイン中・編集履歴','import':'スプレッドシート取り込み','sched-sources':'予定表ソース管理',
  'daicho':'台帳保管','permissions':'権限の個人設定','calendar-guide':'カレンダー連携のやり方','version-history':'アップデート履歴',
  'password':'パスワード変更','login':'ログイン画面','venues':'会場一覧','legacy-import':'過去データ取込確認','artists':'公演一覧',
  'app-structure':'アプリ構造ビューア',
};
function pageLabelFromHash(hash){
  if(!hash) return '';
  const seg = hash.replace(/^#\//,'').split(/[/?]/)[0];
  return PAGE_LABELS[seg] || hash;
}
const LV = { member:0, chief:1, handler:2, admin:3 };
// 個別追加権限の基準レベル(バックエンドのPERMSと対応)
const PERM_BASE_LV = { report_check:1, blacklist_manage:1, summary_view:1, day_schedule_view:1, member_stats_view:1, sites_view:1, members_view:1, site_pay:2, site_manage:2, import_data:2, handler_tools:2, wage_settings:3, account_manage:3, daicho_manage:3, dashboard_view:3, member_summary_view:2, activity_view:3 };
// has(key): MEがその機能を使えるか(基本権限を満たす、または個別に追加権限がある)
function has(key){
  if(!ME) return false;
  if(Array.isArray(ME.revoked_perms) && ME.revoked_perms.includes(key)) return false;
  const base = PERM_BASE_LV[key] ?? 99;
  if((LV[ME.role] ?? 0) >= base) return true;
  return Array.isArray(ME.extra_perms) && ME.extra_perms.includes(key);
}
const yen = n => '¥' + Number(n||0).toLocaleString();
const jstToday = () => new Date(Date.now()+9*3600e3).toISOString().slice(0,10);
// 権限不足・存在しないページの共通表示(機能名を一切見せない)
function notFound(app){ app.innerHTML = '<div class="card" style="text-align:center;padding:40px"><h2 style="border:none">ページが見つかりません</h2><div class="muted">お探しのページは存在しないか、移動した可能性があります。</div><div style="margin-top:16px"><a href="#/schedule" class="btn gold">マイスケジュールへ戻る</a></div></div>'; }

let TOKEN = localStorage.getItem('tk') || '';
let ME = null;
let UPDATE_NOTICE_SHOWN = false; // 1セッション中に一度だけ表示するためのフラグ
// アップデートのお知らせに表示する項目。新機能を追加したら、ここに { v: 新しいバージョン番号, ... } で
// 追記し、src/index.js の CURRENT_UPDATE_VERSION をインクリメントする(バージョン番号は
// サーバー側の値が唯一の正としてME.currentUpdateVersionから取得する。以前はここにも同名の定数を
// 持っていたが、更新のたびに両方をインクリメントし忘れ、片方だけ古いまま残ってお知らせが正しく
// 出なくなる事故があったため、フロント側の定数は廃止した)。過去の項目はそのまま残しておいてよい
// (各ユーザーは自分がまだ見ていないバージョン分の項目だけを見るため、勝手に重複表示されることはない)。
// 細かい変更を毎回1つのバージョンとして刻みすぎると、お知らせ・履歴が読みづらくなる。ある程度まとまった
// タイミングで1バージョンにまとめ、細かい調整点は既存項目の説明文に軽く触れる程度にとどめること。
const UPDATE_ITEMS = [
  { v:1, icon:'home', title:'ホーム画面を追加', desc:'ログイン後、今日・明日の現場や通知が一目で見られるようになりました。', show: () => true },
  { v:1, icon:'handRaise', title:'休み希望・稼働時間の提出', desc:'マイスケジュールから、休み希望や「この時間なら動ける」を手配担当者に伝えられます。', show: () => true },
  { v:1, icon:'user', title:'メンバーを希望する機能', desc:'チーフ以上が「この現場にこの人が欲しい」と指名し、手配担当者の承認で反映できます。', show: () => LV[ME.role] >= 1 },
  { v:1, icon:'barChart', title:'稼働サマリーを強化', desc:'「同じ現場ばかり任されている人」を自動で検知するようになりました。', show: () => LV[ME.role] >= 1 },
  { v:1, icon:'calendar', title:'Googleカレンダー連携', desc:'自分のスケジュールを普段使いのカレンダーアプリに自動反映できます。', link:'#/calendar-guide', linkLabel:'やり方を見る', show: () => true },
  { v:2, icon:'barChart', title:'稼働サマリーをリニューアル', desc:'月100時間超・6連勤以上・同じ現場ばかりなど、気になる状況をひと目で確認できるようになりました。並び替えも自由に変更できます。', show: () => LV[ME.role] >= 1 },
  { v:2, icon:'layoutGrid', title:'スケジュール一覧を追加', desc:'全メンバーの1週間分の予定を、チーフ予定表のような一覧(日付×人のマトリックス表)で確認できます。', show: () => LV[ME.role] >= 1 },
  { v:2, icon:'trendingUp', title:'メンバー分析を追加', desc:'拠点・課・班・ランクの構成を、全体・課ごとにリアルタイムで確認できます。手配担当ごとの内訳も見られます。', show: () => LV[ME.role] >= 1 },
  { v:2, icon:'home', title:'ホーム画面を自由にカスタマイズ', desc:'ホーム画面の「編集」から、ショートカットの並び替え・非表示・追加ができるようになりました(iPhoneのホーム画面のような感覚で使えます)。', show: () => true },
  { v:3, icon:'star', title:'ランクの自動昇格・査定', desc:'マナー研修を受けると翌日にDランク、チーム研修(2部)とステージアップ研修(SU)の両方を受けると翌月1日にCランクへ自動で昇格します。C→B、B→Aは査定ボタンで昇格でき、昇格した月の給与は月初に遡って新しいランクで再計算されます。いつ・誰が・どんな理由でランクを変更したかは、メンバー編集画面から履歴を確認できます。', show: () => true },
  { v:4, icon:'barChart', title:'個人の年間サマリー・備考欄を追加', desc:'メンバーごとの月別稼働日数・時間・給料の年間推移や、申し送り事項を記録する備考欄を確認できるようになりました(手配担当者以上)。', show: () => LV[ME.role] >= 2 },
  { v:4, icon:'fileText', title:'台帳Excelファイルの直接取り込みに対応', desc:'手配管理表のExcelファイルをPCから直接アップロードして取り込めるようになりました。複数ファイルの一括取込や、台帳保管に保存済みのファイルからの再取込にも対応しています(常に手動実行)。', show: () => LV[ME.role] >= 2 },
  { v:5, icon:'layoutGrid', title:'複数日の現場に「稼働表」を追加', desc:'現場一覧の現場詳細から「稼働表」を押すと、その現場が行われている期間(前後の連続した日程を自動判定)に入っている人だけを、日付×人の一覧で確認できるようになりました。現場に入っていない日も、休暇・NG・別の現場のどれかが分かります。', show: () => LV[ME.role] >= 1 },
  { v:5, icon:'clockWarn', title:'現場詳細に「過去・今後の公演」を追加', desc:'現場詳細画面に、同じ会場・同じアーティスト(現場名)の過去と今後の公演一覧を追加しました。押すとその公演の詳細(入っていた人・時間等)がすぐに確認できます。', show: () => LV[ME.role] >= 1 },
  { v:6, icon:'edit', title:'現場一覧で現場名・会場をまとめて変更できるように', desc:'入力者によってバラバラになりがちな現場名・会場の表記を、現場一覧でチェックを入れて選び、まとめて統一名称に変更できるようになりました(手配者以上)。', show: () => LV[ME.role] >= 2 },
  { v:7, icon:'plus', title:'現場一覧に、現場情報を先に登録できるように', desc:'これまで現場一覧はメンバーが配置された現場だけを表示していましたが、まだ誰も配置していない現場も先に登録して表示しておけるようになりました(手配者以上・手配モード中)。登録後は他の現場と同じようにタップしてメンバーを追加でき、不要になれば削除もできます。台帳取込で「登場しない人を休暇に変更する」にチェックを入れた際、その現場が台帳に見当たらなくなっていれば自動的に削除されます。', show: () => LV[ME.role] >= 2 },
  { v:8, icon:'circleFilled', title:'ログイン中メンバーの閲覧中ページを確認できるように', desc:'「ログイン中・編集履歴」画面で、ログイン中の各メンバーが今どの画面を見ているかを確認できるようになりました(管理者以上)。あわせて、アカウント管理の全データ閲覧「ログインセッション」にも、そのセッションが最後に見ていたページを表示するようになりました。', show: () => has('activity_view') },
  { v:9, icon:'edit', title:'現場詳細画面から、同会場・同アーティストの公演をまとめて編集できるように', desc:'現場詳細画面の「同会場の公演」「同アーティストの公演」一覧から、それぞれ「まとめて編集」で一覧全体をまとめて変更できるようになりました(手配者以上)。「同会場の公演」は会場のみ、「同アーティストの公演」は現場名のみが対象で、一覧内の他の項目まで誤って書き換わることはありません。', show: () => LV[ME.role] >= 2 },
  { v:10, icon:'mapPin', title:'会場一覧を追加', desc:'現場一覧と同じ感覚で使える「会場一覧」を追加しました。会場ごとに、過去・今後どちらもまとめてその会場の現場を確認でき、タップすると現場の詳細も見られます。手配者以上であれば、会場名をまとめて変更したり、関連する会場をグループにまとめて絞り込んだりもできます。', show: () => LV[ME.role] >= 1 },
  { v:10, icon:'mapPin', title:'マイスケジュールから「行った会場」「行った公演」を確認できるように', desc:'マイスケジュール画面から「行った会場」「行った公演」ボタンを押すと、実際に行ったことのある会場・公演の一覧と回数を確認できます。会場・公演・現場の詳細画面でも、自分が行ったことのある項目に金色の丸マークが付き、検索バーで現場名・会場名・公演名・日付から探すこともできるようになりました。', show: () => LV[ME.role] >= 1 },
  { v:10, icon:'barChart', title:'マイスケジュールの下部に個人の年間サマリーを表示', desc:'個人の年間サマリーを閲覧できる方(手配担当者以上)は、マイスケジュール画面をスクロールした一番下でも、その人の年間の稼働状況・備考欄をそのまま確認できるようになりました。', show: () => LV[ME.role] >= 2 },
  { v:10, icon:'calendar', title:'マイスケジュールで表示する年月を直接選べるように', desc:'月の見出し部分をタップすると、カレンダーから年月を直接選んで一気に移動できるようになりました(◀▶ボタンでの1ヶ月ずつの移動も引き続き使えます)。', show: () => true },
  { v:11, icon:'sitemap', title:'アプリ構造ビューアを追加', desc:'このアプリの画面・API・DB・権限モデルの全体構造を確認できる開発者向け診断画面「アプリ構造ビューア」を追加しました(管理者専用)。DBテーブルの構造は都度実際のデータベースから取得するため、常に本番の実態が反映されます。', show: () => ME.role === 'admin' },
];
// 機能公開設定の対象画面。バックエンドのFEATURE_KEYSと必ず一致させる。
// 新しい画面を追加したら、ここと src/index.js の FEATURE_KEYS の両方に追記する。
const FEATURE_LABELS = {
  'dashboard': { icon:'gauge', label:'ダッシュボード' },
  'edit': { icon:'edit', label:'スケジュール入力' },
  'self-reports': { icon:'mail', label:'現場変更報告の承認' },
  'availability': { icon:'handRaise', label:'休み希望・稼働時間の提出' },
  'availability-team': { icon:'calendarDays', label:'チームの希望一覧' },
  'nominate': { icon:'user', label:'メンバーを希望する' },
  'nominations': { icon:'checkCircle', label:'メンバー指名の承認' },
  'sites': { icon:'stadium', label:'現場一覧' },
  'members': { icon:'users', label:'メンバー一覧' },
  'summary': { icon:'barChart', label:'稼働サマリー' },
  'member-stats': { icon:'trendingUp', label:'メンバー分析' },
  'day-schedule': { icon:'layoutGrid', label:'スケジュール一覧' },
  'report': { icon:'fileText', label:'新人報告' },
  'reports': { icon:'clipboardList', label:'報告一覧' },
  'draft': { icon:'star', label:'ドラフト' },
  'blacklist': { icon:'ban', label:'ブラックリスト' },
  'report-export': { icon:'paperclip', label:'スプレッドシート貼り付け用コピー' },
  'admin': { icon:'shieldCheck', label:'アカウント管理' },
  'admin-settings': { icon:'wrench', label:'システム設定' },
  'role-permissions': { icon:'shield', label:'権限の一括設定' },
  'handler-status': { icon:'circleFilled', label:'ログイン中・編集履歴' },
  'import': { icon:'download', label:'スプレッドシート取り込み' },
  'sched-sources': { icon:'rss', label:'予定表ソース管理' },
  'daicho': { icon:'package', label:'台帳保管' },
  'member-summary': { icon:'barChart', label:'個人の年間サマリー' },
  'venues': { icon:'mapPin', label:'会場一覧' },
  'venue-manual': { icon:'bookOpen', label:'会場マニュアル' },
  'legacy-import': { icon:'inbox', label:'過去データ取込確認' },
  'artists': { icon:'megaphone', label:'公演一覧' },
  'app-structure': { icon:'sitemap', label:'アプリ構造ビューア' },
};
const FEATURE_KEYS = Object.keys(FEATURE_LABELS);
// 給与計算区分コード → 表示用の日本語ラベル(業務名対応表の表示に使う)
const DUTY_SEG_LABELS = {
  g5: '案内料金(最低5時間)',
  l3: '搬入出料金(最低3時間)',
  lg: '搬入→案内(時間帯で分割計算)',
  gl: '案内→搬出(時間帯で分割計算)',
  lgl: '搬入→案内→搬出(時間帯で分割計算)',
  skip: '対象外(給与計算なし)',
};
// 機能公開設定は画面遷移のたびに最新状態を取得する(キャッシュすると、管理者が変更した直後の
// ユーザーに反映されない不具合が起きるため、あえてキャッシュしない)。
async function getFeatureStatus(){
  return await api('/settings/feature-status').catch(()=>({}));
}
// 準備中・メンテナンス中の画面に来た人に表示する共通メッセージ
function renderFeatureBlocked(app, status, feature){
  const msg = status === 'maintenance'
    ? 'この機能は現在メンテナンス中です。<br>しばらくしてから再度お試しください。'
    : 'この機能は現在準備中です。<br>もうしばらくお待ちください。';
  app.innerHTML = `<h2>${icon(feature.icon)} ${h(feature.label)}</h2><div class="card"><div class="muted" style="text-align:center;padding:30px 0">${msg}</div></div>`;
}
let modalScrollY = 0; // モーダルを開いた時点のスクロール位置(閉じた時に復元する)
let MONTH = new Date(Date.now()+9*3600e3).toISOString().slice(0,7);
// ページ遷移をまたいで保持したいフィルタ・タブ・検索語などの状態。
// #app要素はページ遷移のたびに作り直されるため、そこに状態を持たせると戻った時に消えてしまう。
// このオブジェクトはセッション中ずっと保持されるので、ここに保存する。
const PAGE_STATE = {};
// 検索欄などで、入力のたびに画面を再描画すると(内容によっては入力欄ごと作り直されるため)
// スマホでソフトウェアキーボードが閉じてしまう。入力が止まってから実行することでこれを防ぐ。
function debounce(fn, wait=350){
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(()=>fn(...args), wait); };
}
// setIntervalなどで動的に再描画される領域は、renderのグローバル自動ワイヤリングの対象外になるため、
// 個別にこの関数を呼んでname-linkを有効化する。
function wireNameLinks(container){
  if(!container) return;
  container.querySelectorAll('.name-link[data-goto-uid]').forEach(el => {
    el.onclick = (e) => { e.stopPropagation(); location.hash = '#/schedule/' + el.dataset.gotoUid; };
  });
}
// アプリを最新版に強制更新する(キャッシュされた古いapp.js/style.cssを使い続けてしまう問題への対策)。
// ブラウザのCache Storage APIが使えれば削除し、URLにタイムスタンプを付けて再読み込みすることで、
// ブラウザに「これは新しいリクエストだ」と認識させ、キャッシュを迂回して最新版を取得させる。
async function forceRefresh(btn){
  if(btn){ btn.disabled = true; btn.textContent = '更新中…'; }
  try{
    if('caches' in window){
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  }catch(e){}
  const url = new URL(location.href);
  url.searchParams.set('_r', Date.now());
  location.href = url.toString();
}
// ドロワー(左メニュー)を閉じる際、スライドアウト+フェードアウトのアニメーションを再生してから
// 中身を空にする(即座に消すとカクついて見えるため)。
function closeDrawerAnimated(dr){
  if(!dr) return;
  const bg = dr.querySelector('.drawer-bg');
  const nav = dr.querySelector('.drawer');
  if(!bg && !nav){ dr.innerHTML=''; return; }
  if(bg) bg.classList.add('closing');
  if(nav) nav.classList.add('closing');
  setTimeout(() => {
    // このタイマーが発火するまでの間に、別の新しいドロワーが開かれていた場合は消さない
    if(dr.querySelector('.closing')) dr.innerHTML='';
  }, 180);
}
// 全データ閲覧(システム設定): テーブル表示・ソート・フィルタ・CSVダウンロードの状態
const DV_STATE = { rows:[], cols:[], sortCol:null, sortDir:1, filters:{}, tableName:'' };
function renderDvTable(){
  const { cols, tableName } = DV_STATE;
  const out = $('#dv-out'); if(!out) return;
  out.innerHTML = `
    <div class="row" style="margin-bottom:8px;gap:8px;align-items:center">
      <span class="muted" id="dv-summary"></span>
      <button class="btn ghost xs" id="dv-clear-filter" style="display:none">絞り込み解除</button>
      <button class="btn ghost xs" id="dv-export">${icon('download')} Excel(CSV)でダウンロード</button>
    </div>
    <div class="sched-wrap"><table class="list dv-table">
      <thead>
        <tr>${cols.map(c=>`<th class="dv-th" data-col="${h(c)}" style="cursor:pointer;white-space:nowrap">${h(c)} <span class="dv-sort-mark muted" data-col="${h(c)}">⇅</span></th>`).join('')}</tr>
        <tr class="dv-filter-row">${cols.map(c=>`<td><input class="dv-filter" data-col="${h(c)}" placeholder="絞り込み" style="width:100%;font-size:11px;box-sizing:border-box"></td>`).join('')}</tr>
      </thead>
      <tbody id="dv-tbody"></tbody>
    </table></div>`;
  out.querySelectorAll('.dv-th').forEach(th => th.onclick = () => {
    const c = th.dataset.col;
    if(DV_STATE.sortCol === c) DV_STATE.sortDir *= -1;
    else { DV_STATE.sortCol = c; DV_STATE.sortDir = 1; }
    renderDvBody(); // ソートはtbodyだけ更新すればよい(フィルタ入力欄はそのまま)
  });
  out.querySelectorAll('.dv-filter').forEach(inp => inp.oninput = () => {
    DV_STATE.filters[inp.dataset.col] = inp.value;
    renderDvBody(); // input要素自体には触れないのでキーボードは閉じない
  });
  const cf = $('#dv-clear-filter');
  if(cf) cf.onclick = () => {
    DV_STATE.filters = {};
    out.querySelectorAll('.dv-filter').forEach(inp => inp.value = '');
    renderDvBody();
  };
  renderDvBody();
}
// 全データ閲覧: フィルタ・ソート結果に応じて<tbody>部分だけを再構築する(フィルタ入力欄はそのまま保持)
function renderDvBody(){
  const { rows, cols, sortCol, sortDir, filters, tableName } = DV_STATE;
  let filtered = rows.filter(r => cols.every(c => !filters[c] || String(r[c]??'').toLowerCase().includes(filters[c].toLowerCase())));
  if(sortCol){
    filtered = [...filtered].sort((a,b) => {
      const av = a[sortCol], bv = b[sortCol];
      if(av == null && bv == null) return 0;
      if(av == null) return -1*sortDir; if(bv == null) return 1*sortDir;
      if(av!=='' && bv!=='' && !isNaN(av) && !isNaN(bv)) return (Number(av)-Number(bv))*sortDir;
      return String(av).localeCompare(String(bv), 'ja') * sortDir;
    });
  }
  const tbody = $('#dv-tbody'); if(!tbody) return;
  tbody.innerHTML = filtered.map(r=>`<tr>${cols.map(c=>`<td>${h(r[c])}</td>`).join('')}</tr>`).join('');
  const hasFilter = Object.values(filters).some(v=>v);
  const summary = $('#dv-summary'); if(summary) summary.textContent = `${filtered.length}件 / 全${rows.length}件${hasFilter?' (絞り込み中)':''}`;
  const cf = $('#dv-clear-filter'); if(cf) cf.style.display = hasFilter ? '' : 'none';
  document.querySelectorAll('.dv-sort-mark').forEach(m => { m.textContent = m.dataset.col===sortCol ? (sortDir===1?'▲':'▼') : '⇅'; });
  const exp = $('#dv-export'); if(exp) exp.onclick = () => exportRowsToCsv(filtered, cols, tableName);
}
// テーブルデータをCSV(Excelで直接開ける形式)としてダウンロードする
function exportRowsToCsv(rows, cols, tableName){
  const esc = v => { const s = String(v??''); return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; };
  const lines = [cols.map(esc).join(',')].concat(rows.map(r => cols.map(c=>esc(r[c])).join(',')));
  const csv = '\uFEFF' + lines.join('\r\n'); // BOM付きでExcelでの文字化けを防ぐ
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${tableName || 'data'}_${jstToday()}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
let USERS_CACHE = null;
let LOCK_DAYS = 14;   // 給与確定ロック日数(管理者設定。render時にサーバーから取得)
let timers = [];

// ページ上部の通信中プログレスバー。同時に複数のAPI呼び出しが走っても、
// 全て完了するまで表示し続ける(参照カウント方式)。
let _apiInFlight = 0;
function _progressBarEl(){
  let bar = document.getElementById('page-progress');
  if(!bar){ bar = document.createElement('div'); bar.id = 'page-progress'; document.body.appendChild(bar); }
  return bar;
}
function _showProgressBar(){ const bar = _progressBarEl(); bar.classList.remove('done'); void bar.offsetWidth; bar.classList.add('active'); }
function _hideProgressBar(){
  const bar = _progressBarEl();
  bar.classList.add('done');
  setTimeout(()=>{ bar.classList.remove('active','done'); }, 260);
}
async function api(path, opt = {}) {
  _apiInFlight++;
  if(_apiInFlight === 1) _showProgressBar();
  try {
    const res = await fetch('/api' + path, {
      method: opt.method || 'GET',
      headers: { 'content-type':'application/json', 'x-page': location.hash || '#/home', ...(TOKEN ? { authorization:'Bearer '+TOKEN } : {}) },
      body: opt.body ? JSON.stringify(opt.body) : undefined
    });
    const d = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== '/login') { logoutLocal(); throw new Error(d.error || '再ログインしてください'); }
    if (!res.ok) throw new Error(d.error || 'エラーが発生しました');
    return d;
  } finally {
    _apiInFlight--;
    if(_apiInFlight === 0) _hideProgressBar();
  }
}
function logoutLocal(){ TOKEN=''; ME=null; localStorage.removeItem('tk'); goTo('#/login'); }
function clearTimers(){ timers.forEach(clearInterval); timers=[]; }
function shiftMonth(m, d){ const [y,mm]=m.split('-').map(Number); const dt=new Date(y, mm-1+d, 1); return dt.getFullYear()+'-'+pad(dt.getMonth()+1); }
// 「年月を選択」モーダルの共通処理。月見出しをタップした際に、◀▶での1ヶ月ずつの移動に加えて
// カレンダーから年月を直接選んで一気に移動できるようにする(元はマイスケジュールのみの機能だったが、
// 同様に月をまたいで移動する他のページにも共通化して展開している)。
// input[type=month]は、モーダル(backdrop-filter+border-radius+overflow:hidden)内でiOS Safariが
// ネイティブのフォームコントロールを正しくクリップできず枠からはみ出す不具合が実機で確認されたため、
// 年・月を別々のselectで選ばせる方式にしてある(どのブラウザでも確実に同じ見た目になる)。
function openMonthJumpModal(currentYM, onSelect){
  const [curY, curM] = currentYM.split('-').map(Number);
  const nowY = Number(jstToday().slice(0,4));
  const years = []; for(let y=nowY-5; y<=nowY+2; y++) years.push(y);
  modal(`<h3>${icon('calendar',{size:'15px'})} 表示する年月を選択</h3>
    <div class="row" style="gap:8px;flex-wrap:nowrap">
      <select id="jump-year-input" style="flex:1;min-width:0;padding:10px;border:1px solid var(--line);border-radius:8px;font-size:16px">
        ${years.map(y=>`<option value="${y}" ${y===curY?'selected':''}>${y}年</option>`).join('')}
      </select>
      <select id="jump-month-input" style="flex:1;min-width:0;padding:10px;border:1px solid var(--line);border-radius:8px;font-size:16px">
        ${Array.from({length:12},(_,i)=>i+1).map(m=>`<option value="${m}" ${m===curM?'selected':''}>${m}月</option>`).join('')}
      </select>
    </div>
    <div class="row" style="margin-top:14px"><button class="btn gold" id="jump-month-go">この年月を表示する</button></div>`);
  $('#jump-month-go').onclick = () => {
    const y = $('#jump-year-input').value;
    const m = String($('#jump-month-input').value).padStart(2,'0');
    closeModal();
    onSelect(`${y}-${m}`);
  };
}
async function getUsers(force){ if(!USERS_CACHE||force) USERS_CACHE = await api('/users'); return USERS_CACHE; }

// 認証ヘッダ付きでファイルを取得しブラウザにダウンロードさせる
async function downloadFile(path, filename){
  const res = await fetch('/api'+path, { headers: TOKEN ? { authorization:'Bearer '+TOKEN } : {} });
  if(!res.ok){ const d=await res.json().catch(()=>({})); throw new Error(d.error || 'ダウンロードに失敗しました'); }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=filename||'download'; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 1000);
}

/* ===== モーダル ===== */
// モーダル表示中は背景ページのスクロールを止める(スマホでモーダルの後ろが動いてしまい
// 「画面に固定されていない」ように見えるのを防ぐ)。modal()・popup()の両方から呼ばれる。
function lockBodyScroll(){
  if(document.body.classList.contains('modal-open')) return;
  modalScrollY = window.scrollY;
  document.body.classList.add('modal-open');
  document.body.style.top = `-${modalScrollY}px`;
}
function unlockBodyScroll(){
  document.body.classList.remove('modal-open');
  document.body.style.top = '';
  window.scrollTo(0, modalScrollY || 0);
}
// 直前にクリック(またはタップ)された座標を記録しておき、モーダルを開く際の
// transform-origin(拡大の起点)に使う。ボタンから浮かび上がるような見え方になる。
let _lastPointerPos = null;
document.addEventListener('pointerdown', (e) => { _lastPointerPos = { x: e.clientX, y: e.clientY }; }, true);

function modal(html){
  $('#modal-layer').innerHTML = `<div class="modal-bg"><div class="modal"><button class="close-x">${icon('x',{size:'12px'})}</button>${html}</div></div>`;
  $('#modal-layer .close-x').onclick = closeModal;
  $('#modal-layer .modal-bg').onclick = e => { if(e.target.classList.contains('modal-bg')) closeModal(); };
  lockBodyScroll();
  fitModalToViewport();
  const modalEl = $('#modal-layer .modal');
  if(modalEl){
    if(_lastPointerPos){
      const rect = modalEl.getBoundingClientRect(); // ここで一度読むことでレイアウトを確定させてから起点を計算する
      const ox = Math.max(0, Math.min(rect.width, _lastPointerPos.x - rect.left));
      const oy = Math.max(0, Math.min(rect.height, _lastPointerPos.y - rect.top));
      modalEl.style.transformOrigin = `${ox}px ${oy}px`;
    }
    requestAnimationFrame(() => { modalEl.classList.add('modal-animate-in'); });
  }
  // キーボードの開閉などで表示領域の高さが変わった時も、その都度モーダルを追従させる
  if(window.visualViewport) window.visualViewport.addEventListener('resize', fitModalToViewport);
}
// iOS Safari等では、アドレスバー/ツールバーの表示状態によって実際に見えている高さが
// CSSのvh/dvh単位の計算とズレることがあり、モーダルが画面下に偏って表示されることがある。
// visualViewport(実際に見えている領域)が使える環境では、その高さをそのままpxで指定して
// 確実に中央に来るようにする。
function fitModalToViewport(){
  const bg = document.querySelector('#modal-layer .modal-bg');
  if(!bg) return;
  if(window.visualViewport){
    bg.style.height = window.visualViewport.height + 'px';
    bg.style.top = window.visualViewport.offsetTop + 'px';
  } else {
    bg.style.height = window.innerHeight + 'px';
  }
}
// モーダルを閉じる際、フェードアウト+スケールダウンのアニメーションを再生してから中身を空にする
function closeModal(){
  if(window.visualViewport) window.visualViewport.removeEventListener('resize', fitModalToViewport);
  const layer = $('#modal-layer');
  if(!layer) return;
  const bg = layer.querySelector('.modal-bg');
  const box = layer.querySelector('.modal');
  if(!bg && !box){ layer.innerHTML=''; unlockBodyScroll(); return; }
  if(bg) bg.classList.add('closing');
  if(box) box.classList.add('closing');
  setTimeout(() => {
    // このタイマーが発火するまでの間に、別の新しいモーダルが開かれていた場合は消さない
    // (閉じるアニメーション中に次のモーダルを即座に開くケースがあるため)
    if(layer.querySelector('.closing')){ layer.innerHTML=''; unlockBodyScroll(); }
  }, 160);
}
// ボタンクリックで始まる非同期処理の間、ボタンをスピナー付きの無効状態にする共通ヘルパー。
// 保存・送信系のボタンにひとまとめに適用することで、処理中であることを視覚的に伝える。
async function withLoading(btn, fn){
  if(!btn) return fn();
  const wasDisabled = btn.disabled;
  btn.disabled = true;
  btn.classList.add('btn-loading');
  try{
    return await fn();
  } finally {
    btn.disabled = wasDisabled;
    btn.classList.remove('btn-loading');
  }
}

// 要素内の数値を0(または開始値)から目標値までアニメーションでカウントアップする。
// data-suffix属性があれば末尾に付ける(例:"%")。要素がDOMから外れた場合は自動で止まる。
function animateCount(el, target, opt={}){
  if(!el) return;
  const duration = opt.duration || 550;
  const decimals = opt.decimals || 0;
  const suffix = opt.suffix || '';
  const start = 0;
  const startTime = performance.now();
  const step = (now) => {
    if(!document.body.contains(el)) return; // ページ遷移などで消えていたら止める
    const t = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
    const val = start + (target - start) * eased;
    el.textContent = val.toFixed(decimals) + suffix;
    if(t < 1) requestAnimationFrame(step);
    else el.textContent = target.toFixed(decimals) + suffix;
  };
  requestAnimationFrame(step);
}
// レンダリング後、[data-count]属性を持つ要素をまとめてカウントアップアニメーションさせる。
// 各ページのrenderロジック末尾で呼ぶ。data-count=目標値、data-decimals=小数桁、data-suffix=末尾文字。
function animateCounts(root){
  (root||document).querySelectorAll('[data-count]').forEach(el => {
    const target = parseFloat(el.dataset.count);
    if(Number.isNaN(target)) return;
    animateCount(el, target, { decimals: Number(el.dataset.decimals||0), suffix: el.dataset.suffix||'' });
  });
}
// [data-bar-width]属性を持つ棒グラフ要素(.stat-bar, .mgr-bar等)を、
// 初期幅0(CSS側で指定)から実際の幅まで、次のフレームでアニメーションさせて伸ばす。
function animateBars(root){
  const bars = (root||document).querySelectorAll('[data-bar-width]');
  requestAnimationFrame(() => {
    bars.forEach(el => { el.style.width = el.dataset.barWidth; });
  });
}
// 一覧の各行(テーブル行・カードなど)を、上から順に少しずつ遅延させてフェードインさせる。
// 件数が多い場合は遅延の上限を設け、待たされている印象にならないようにする。
function staggerRows(root, selector){
  const rows = (root||document).querySelectorAll(selector);
  rows.forEach((el, i) => {
    el.style.animationDelay = Math.min(i * 22, 380) + 'ms';
    el.classList.add('stagger-row');
  });
}

// ホーム画面のショートカット配置(個人ごとにカスタマイズ可能)。
// サーバーには保存せず、この端末のブラウザ内(localStorage)にのみ保持する軽量な仕組み。
// hidden: 非表示にしたショートカットのhash配列 / order: 表示順序のhash配列
function getHomeHidden(){ try{ return JSON.parse(localStorage.getItem('home-hidden-'+ME.id) || '[]'); }catch(e){ return []; } }
function setHomeHidden(arr){ localStorage.setItem('home-hidden-'+ME.id, JSON.stringify(arr)); }
function getHomeOrder(){ try{ return JSON.parse(localStorage.getItem('home-order-'+ME.id) || '[]'); }catch(e){ return []; } }
function setHomeOrder(arr){ localStorage.setItem('home-order-'+ME.id, JSON.stringify(arr)); }
// 権限でフィルタ済みの全ショートカット一覧を、保存済みの並び順に沿って並び替える(未保存の項目は末尾)
function applyHomeOrder(items){
  const order = getHomeOrder();
  if(!order.length) return items;
  return [...items].sort((a,b) => {
    const ia = order.indexOf(a[0]), ib = order.indexOf(b[0]);
    if(ia===-1 && ib===-1) return 0;
    if(ia===-1) return 1;
    if(ib===-1) return -1;
    return ia - ib;
  });
}

// ホーム画面のメニューボタン一覧を組み立てる。編集モード中はドラッグ並び替えのロジックを
// 単純に保つためグルーピングせずフラット表示にし、通常表示時のみ、現在の並び順のまま
// カテゴリ(6番目の要素)が連続する区間ごとに見出しを挟む(ユーザーが並び替え済みでも壊れない)。
function renderHomeMenuItems(menuItems, homeEditing){
  const btn = ([hash,iconName,label,,role]) => `<a href="${homeEditing?'javascript:void(0)':hash}" class="home-menu-btn ${homeEditing?'editing':''}" data-hash="${hash}">
        ${homeEditing?`<button class="home-menu-remove" data-hash="${hash}" type="button">${icon('x',{size:'12px'})}</button>`:''}
        ${role?`<span class="role-dots" style="position:absolute;top:8px;right:8px">${roleDots(role)}</span>`:''}
        <span class="home-menu-icon">${icon(iconName,{size:'22px'})}</span><span>${h(label)}</span>
      </a>`;
  if(homeEditing) return menuItems.map(btn).join('');
  let prevCat = null;
  return menuItems.map(item => {
    const cat = item[5];
    const label = (cat && cat !== prevCat) ? `<div class="home-menu-section-label">${h(cat)}</div>` : '';
    prevCat = cat;
    return label + btn(item);
  }).join('');
}
// 保存・更新などの完了をOKボタン付きポップアップで知らせる
function popup(message, kind){
  const isError = kind==='error';
  const iconHtml = isError
    ? `<div class="popup-icon popup-shake" style="color:#b23b3b">${icon('clockWarn',{size:'12px'})}</div>`
    : `<svg class="popup-check-svg" viewBox="0 0 52 52"><circle class="popup-check-circle" cx="26" cy="26" r="23"/><path class="popup-check-mark" d="M14.1 27.2l7.1 7.2 16.7-16.8"/></svg>`;
  $('#modal-layer').innerHTML = `<div class="modal-bg"><div class="modal popup-modal">
    ${iconHtml}
    <div class="popup-msg">${h(message)}</div>
    <button class="btn gold" id="popup-ok" style="width:100%;margin-top:14px">OK</button>
  </div></div>`;
  lockBodyScroll();
  fitModalToViewport();
  if(window.visualViewport) window.visualViewport.addEventListener('resize', fitModalToViewport);
  const modalEl = $('#modal-layer .modal');
  if(modalEl){
    if(_lastPointerPos){
      const rect = modalEl.getBoundingClientRect();
      const ox = Math.max(0, Math.min(rect.width, _lastPointerPos.x - rect.left));
      const oy = Math.max(0, Math.min(rect.height, _lastPointerPos.y - rect.top));
      modalEl.style.transformOrigin = `${ox}px ${oy}px`;
    }
    requestAnimationFrame(() => { modalEl.classList.add('modal-animate-in'); });
  }
  const ok = $('#popup-ok');
  ok.focus();
  ok.onclick = closeModal;
  $('#modal-layer .modal-bg').onclick = e => { if(e.target.classList.contains('modal-bg')) closeModal(); };
}

// コンフリクト検知の確認モーダル。block(ダブルブッキング)がある場合に表示。
// 「強行して保存」=true / 「キャンセル」=false を返す Promise
// 警告(warn)件数を完了メッセージに付記
function withWarnNote(msg, r){ const w=((r&&r.conflicts)||[]).filter(c=>c.level==='warn'); return w.length ? `${msg}(注意:同日複数現場 ${w.length}件)` : msg; }
// 一括登録の保存。block(時間重複)があれば確認 → 強行時に再送して合算。キャンセルは null
async function bulkSaveWithConflicts(body){
  const r = await api('/schedule-bulk', { method:'PUT', body });
  if((r.conflicts||[]).some(c=>c.level==='block')){
    if(!(await conflictModal(r.conflicts))) return null;
    const r2 = await api('/schedule-bulk', { method:'PUT', body:{ ...body, force:true } });
    r2.added = (r.added||0) + (r2.added||0);
    return r2;
  }
  return r;
}
function conflictLine(c){
  if(c.kind==='overlap') return `<b>${h(c.name||'')}</b> <span class="cf-date">${h(c.date||'')}</span> 「${h(c.a)}」(${h(c.atime)}) と 「${h(c.b)}」(${h(c.btime)}) の<b>時間が重複</b>しています`;
  if(c.kind==='duplicate') return `<b>${h(c.name||'')}</b> <span class="cf-date">${h(c.date||'')}</span> 「${h(c.site)}」が<b>二重</b>に入っています`;
  if(c.kind==='multi') return `<b>${h(c.name||'')}</b> <span class="cf-date">${h(c.date||'')}</span> 同じ日に <b>${c.count}現場</b>(${(c.sites||[]).map(h).join('・')})`;
  return h(JSON.stringify(c));
}
function conflictModal(conflicts){
  return new Promise(resolve=>{
    const block = conflicts.filter(c=>c.level==='block');
    const warn = conflicts.filter(c=>c.level==='warn');
    const lay = document.createElement('div');
    lay.className = 'cf-layer';
    lay.innerHTML = `<div class="cf-box">
      <div class="cf-title">${icon('clockWarn')} コンフリクトを検知しました</div>
      ${block.length?`<div class="cf-sec"><div class="cf-h block">このまま保存するとダブルブッキングになります(${block.length}件)</div>${block.map(c=>`<div class="cf-row block">${conflictLine(c)}</div>`).join('')}</div>`:''}
      ${warn.length?`<div class="cf-sec"><div class="cf-h warn">念のため確認(${warn.length}件)</div>${warn.map(c=>`<div class="cf-row warn">${conflictLine(c)}</div>`).join('')}</div>`:''}
      <div class="cf-actions">
        <button class="btn ghost" id="cf-cancel">修正する</button>
        <button class="btn ${block.length?'danger':'gold'}" id="cf-force">${block.length?'承知のうえ強行保存':'このまま保存'}</button>
      </div></div>`;
    document.body.appendChild(lay);
    const done = v => { lay.remove(); resolve(v); };
    lay.querySelector('#cf-cancel').onclick = () => done(false);
    lay.querySelector('#cf-force').onclick = () => done(true);
    lay.addEventListener('click', e => { if(e.target===lay) done(false); });
  });
}

// 手配者モードのPIN入力(prompt()はスマホで不安定なため自前モーダル)
// PINが正しく手配モードに入れたら、通常は「スケジュール入力」ページへ移動する。
// onSuccessを渡した場合はそちらを実行する(承認フローなど、元の操作をそのまま続行したい場合用)。
// アップデートのお知らせモーダル。既にパスワードを変更済みの既存ユーザーが、新しいバージョンで
// アップデートのお知らせ。まだ見ていないバージョン分(ME.seenUpdateVersionより新しい項目)だけを表示する。
// これにより、前に見た内容が再度表示されることはなく、その時点で追加された機能だけが見える。
function openUpdateNotice(){
  const items = UPDATE_ITEMS.filter(it =>
    it.v > (ME.seenUpdateVersion || 0) && it.v <= ME.currentUpdateVersion && (!it.show || it.show())
  );
  const markSeen = async () => {
    ME.needsUpdateNotice = false;
    ME.seenUpdateVersion = ME.currentUpdateVersion;
    try{ await api('/update-notice/seen', { method:'POST' }); }catch(e){}
  };
  if(!items.length){ markSeen(); return; } // 表示すべき新項目が無ければ、既読化だけして何も出さない
  modal(`<h3>${icon('sparkles')} アップデートのお知らせ</h3>
    <div class="upd-list">
      ${items.map((it,i) => `<div class="upd-item"><span class="upd-icon">${icon(it.icon)}</span><div><b>${h(it.title)}</b><div class="muted">${h(it.desc)}${it.link?` <a href="${h(it.link)}" class="upd-link" data-idx="${i}">${h(it.linkLabel||'見る')}</a>`:''}</div></div></div>`).join('')}
    </div>
    <div class="row" style="margin-top:16px"><button class="btn gold" id="upd-close" style="flex:1">確認しました</button></div>`);
  const close = async () => { await markSeen(); closeModal(); };
  $('#upd-close').onclick = close;
  $('#modal-layer').querySelectorAll('.upd-link').forEach(a => {
    a.onclick = (e) => { e.preventDefault(); const link = items[Number(a.dataset.idx)].link; close().then(()=>{ goTo(link); }); };
  });
}

/* ===== バージョン履歴(全員閲覧可)。現在のバージョンと、過去の全アップデート内容を一覧できる。
   閲覧権限が無い項目は、内容を明かさず「細かな修正・改善」としてまとめて表示する。 ===== */
async function pageVersionHistory(app){
  const versions = [...new Set(UPDATE_ITEMS.map(it=>it.v))].sort((a,b)=>b-a);
  const body = versions.map(v => {
    const items = UPDATE_ITEMS.filter(it=>it.v===v);
    const visibleItems = items.filter(it => !it.show || it.show());
    const hiddenCount = items.length - visibleItems.length;
    const itemsHtml = visibleItems.map(it =>
      `<div class="upd-item"><span class="upd-icon">${icon(it.icon)}</span><div><b>${h(it.title)}</b><div class="muted">${h(it.desc)}</div></div></div>`
    ).join('') + (hiddenCount > 0 ? `<div class="upd-item"><span class="upd-icon">${icon('wrench',{size:'12px'})}</span><div><b>細かな修正・改善</b></div></div>` : '');
    const isLatest = v === ME.currentUpdateVersion;
    return `<div class="card" style="margin-bottom:14px">
      <h3 style="margin-bottom:10px">v${v}${isLatest?' <span class="tag checked">最新</span>':''}</h3>
      <div class="upd-list">${itemsHtml || '<div class="muted">細かな修正・改善</div>'}</div>
    </div>`;
  }).join('');
  app.innerHTML = `
    <h2 style="margin-bottom:4px">${icon('scroll')} バージョン履歴</h2>
    <div class="muted" style="margin-bottom:16px">現在のバージョン: <b>v${ME.currentUpdateVersion}</b></div>
    ${body}`;
}

function openHandlerPin(onSuccess){
  modal(`<h3>手配者モードに切り替え</h3>
    <input id="hp-pin" type="tel" inputmode="numeric" autocomplete="off" placeholder="PIN" style="width:100%;font-size:18px;letter-spacing:4px;text-align:center;padding:12px">
    <div id="hp-err"></div>
    <div class="row" style="margin-top:14px"><button class="btn gold" id="hp-go" style="flex:1">切り替える</button></div>`);
  const pin = $('#hp-pin'); if(pin) setTimeout(() => pin.focus(), 80);
  const go = async () => {
    const v = $('#hp-pin').value.trim();
    if(!v){ $('#hp-err').innerHTML='<div class="msg err">PINを入力してください</div>'; return; }
    try{
      await api('/handler-mode',{method:'POST',body:{pin:v}});
      ME.handler=1; closeModal();
      if(onSuccess) onSuccess();
      else goHome();
    }catch(e){ $('#hp-err').innerHTML=`<div class="msg err">${h(e.message)}</div>`; }
  };
  $('#hp-go').onclick = go;
  $('#hp-pin').onkeydown = e => { if(e.key==='Enter') go(); };
}

// 現場情報モーダル(チーフ以上が閲覧、手配担当以上はメンバー追加・一括編集可)
async function openSiteModal(date, site){
  const canPay = LV[ME.role] >= 2;
  const canAdd = ME.handler === 1; // 手配者モードのときメンバー追加・編集可
  const canViewSched = LV[ME.role] >= 1; // 名前タップでスケジュールへ遷移できるか(チーフ以上)
  const canRoster = has('sites_view'); // 稼働表・過去公演を見られるか(このモーダル自体を開ける権限と同じ)
  const canRename = has('site_manage'); // 同会場・同アーティストの公演をまとめて編集できるか(手配者以上)
  const [siteData, breaksArr, history] = await Promise.all([
    api(`/site-members?date=${date}&site=${encodeURIComponent(site)}`),
    canViewSched ? api(`/site-record-breaks?date=${date}&site=${encodeURIComponent(site)}`).catch(()=>[]) : Promise.resolve([]),
    canRoster ? api(`/site-history?date=${date}&site=${encodeURIComponent(site)}`).catch(()=>null) : Promise.resolve(null),
  ]);
  const list = siteData.list;
  // 休憩時間の合計(チーフ以上に公開。6h超45分/8h超60分の目安に届いていない場合だけ軽く表示)
  const breakByUid = {}; breaksArr.forEach(b => breakByUid[b.uid] = b);
  // 誰も配置されていない現場(手動登録のみ)は、site-membersが代わりに返す登録済み会場を使う
  const venue = (list.find(p => p.venue) || {}).venue || siteData.venue || '';
  const loadEnd = (list.find(p => p.load_end) || {}).load_end || '';
  const showEnd = (list.find(p => p.show_end) || {}).show_end || '';
  const chiefs = list.filter(p => p.role !== 'member');
  const members = list.filter(p => p.role === 'member');
  const kaTag = p => p.ka ? `<span class="ka-pill ka-${p.ka==='1課'?'1':'2'}">${p.ka}</span>` : '';
  const editable = canAdd; // 手配者モードなら個人編集可
  const nameHtml = p => canViewSched ? `<span class="name-link" data-goto-uid="${p.uid}">${h(p.name)}</span>` : h(p.name);
  const breakHtml = p => {
    const b = breakByUid[p.uid];
    if(!b || b.workMinutes <= 0) return '';
    const cls = b.short ? 'break-short' : 'break-ok';
    const label = b.short ? `${icon('clockWarn',{size:'11px'})}${b.breakMinutes}/${b.requiredMinutes}分` : `休憩${b.breakMinutes}分`;
    const tip = b.short ? `休憩不足の目安: ${b.breakMinutes}分(必要${b.requiredMinutes}分以上)` : `休憩${b.breakMinutes}分`;
    return `<span class="break-tag ${cls}" title="${h(tip)}">${label}</span>`;
  };
  const card = p => `<div class="dcard ka-${p.ka==='1課'?'1':'2'} ${editable?'sm-edit':''}" ${editable?`data-uid="${p.uid}"`:''}>
    <div class="dcard-head"><span class="dcard-title">${nameHtml(p)} ${kaTag(p)}</span></div>
    <div class="drow"><span class="dk">ランク/班</span><span class="dv">${h(p.rank)||'—'} / ${h(p.han)||'—'}</span></div>
    ${canPay&&(p.tin||p.tout)?`<div class="drow"><span class="dk">IN/OUT</span><span class="dv">${h(p.tin)}〜${h(p.tout)}</span></div>`:''}
    ${breakHtml(p)?`<div class="drow"><span class="dk">休憩</span><span class="dv">${breakHtml(p)}</span></div>`:''}
    ${p.note?`<div class="drow"><span class="dk">備考</span><span class="dv">${h(p.note)}</span></div>`:''}
    ${editable?`<div class="sm-edit-hint">タップして編集 ${icon('edit',{size:'12px'})}</div>`:''}
  </div>`;
  const row = p => `<tr class="ka-row-${p.ka==='1課'?'1':'2'} ${editable?'sm-edit':''}" ${editable?`data-uid="${p.uid}"`:''}><td style="white-space:nowrap">${nameHtml(p)} ${kaTag(p)}</td><td style="white-space:nowrap">${h(p.rank)}</td><td style="white-space:nowrap">${h(p.han)}</td>${canPay?`<td style="white-space:nowrap">${h(p.tin)}</td><td style="white-space:nowrap">${h(p.tout)}</td>`:''}<td style="white-space:nowrap">${breakHtml(p)||''}</td><td style="min-width:150px">${h(p.note)}</td>${editable?`<td class="sm-edit-cell">${icon('edit',{size:'12px'})}</td>`:''}</tr>`;
  const tbl = arr => `<table class="list pc-only"><tr><th>氏名</th><th>ランク</th><th>班</th>${canPay?'<th>IN</th><th>OUT</th>':''}<th>休憩</th><th>備考</th>${editable?'<th></th>':''}</tr>${arr.map(row).join('')}</table>
    <div class="cards sp-only">${arr.map(card).join('')}</div>`;
  // 過去/今後の公演1件分のボタン(押すとその日・その現場の詳細=このモーダル自体を開き直す)。
  // 自分自身が実際に入っていた日は、現場名の横に金色丸(visited-dot)を付けてひと目でわかるようにする。
  const histItem = r => `<button type="button" class="btn ghost sm site-hist-item" data-date="${r.date}" data-site="${h(r.site)}" style="display:block;width:100%;text-align:left;margin-bottom:4px;white-space:normal">
    ${h(r.date)} ${h(r.site)}${r.venue && r.venue!==venue ? ` <span class="muted">(${h(r.venue)})</span>` : ''} <span class="muted">${r.cnt}名</span>${r.visited ? `<span class="visited-dot" title="行ったことがあります"></span>` : ''}
  </button>`;
  // 過去/今後どちらの範囲かひと目でわかるよう、見出しを分けて表示する(境目=現在閲覧中の現場)。
  // bulkKey('venue'|'site')を指定すると、その一覧全体をまとめて会場/現場名変更できるボタンを出す
  // (同会場一覧は会場のみ、同アーティスト一覧は現場名のみ変更可能とし、無関係な項目まで巻き込む
  //  誤操作を防ぐ)。
  const histSection = (label, past, future, bulkKey) => {
    if(!past.length && !future.length) return '';
    const canBulk = canRename && bulkKey;
    return `<div class="section-label" style="margin-top:14px;display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>${label}</span>
        ${canBulk ? `<button type="button" class="btn ghost xs site-hist-bulk-edit" data-key="${bulkKey}">${icon('edit',{size:'11px'})} まとめて編集</button>` : ''}
      </div>
      ${past.length ? `<div class="muted" style="font-size:11px;margin:6px 0 3px">${icon('arrowLeft',{size:'10px'})} 過去</div><div>${past.map(histItem).join('')}</div>` : ''}
      ${future.length ? `<div class="muted" style="font-size:11px;margin:${past.length?'10':'6'}px 0 3px">今後 ${icon('arrowRight',{size:'10px'})}</div><div>${future.map(histItem).join('')}</div>` : ''}`;
  };
  // 過去(本日より前)は現場名・会場名の完全一致でのみ1つの公演として結合する(表記ゆれの
  // 誤結合を防ぐため。2026年8月、過去データ取込に伴い変更)。既に完全一致した実績のみなので
  // 表記統一の必要が無く、まとめて編集ボタンは出さない。
  const samePast = (history && history.samePast) || [];
  // 未来はまだ入力者が表記を統一していない段階のため、従来通り現場名/会場名どちらかの一致で
  // 緩く候補を拾う(同会場の公演/同アーティストの公演の2系統)。
  const sameVenueFuture = (history && history.sameVenueFuture) || [];
  const sameSiteFuture = (history && history.sameSiteFuture) || [];
  // 同会場/同アーティストの一覧は、現在閲覧中の現場自体をわざと除外している(別公演として
  // 誤って混ぜないため)。まとめて編集の対象には、その現在閲覧中の現場自体も
  // 含めないと「選択したのに自分の日だけ変わらない」ことになるため、別途取得したcurrentを加える
  const currentGig = (history && history.current) || [];
  modal(`<h3>現場情報</h3>
    <dl class="kv">
      <dt>現場名</dt><dd><b>${h(site)}</b></dd>
      <dt>会場</dt><dd>${venue ? `<span class="name-link venue-detail-link" data-venue="${h(venue)}">${h(venue)}</span>` : '<span class="muted">未登録</span>'}</dd>
      ${loadEnd?`<dt>搬入終了</dt><dd>${h(loadEnd)}</dd>`:''}
      ${showEnd?`<dt>終演</dt><dd>${h(showEnd)}</dd>`:''}
      <dt>日付</dt><dd>${h(date)}</dd>
      <dt>人数</dt><dd>チーフ・手配 ${chiefs.length}名 / メンツ ${members.length}名(計${list.length}名)</dd>
    </dl>
    ${canRoster ? `<div class="row" style="gap:8px;margin:2px 0 10px">
      <button type="button" class="btn ghost sm" id="site-roster-btn">${icon('layoutGrid',{size:'13px'})} 稼働表</button>
    </div>` : ''}
    ${list.length ? `
      <div class="section-label" style="margin-top:6px">チーフ・手配チーム</div>
      ${chiefs.length ? tbl(chiefs) : '<div class="muted" style="padding:4px 2px">登録されていません</div>'}
      <div class="section-label" style="margin-top:12px">メンツ</div>
      ${members.length ? tbl(members) : '<div class="muted" style="padding:4px 2px">登録されていません</div>'}
    ` : '<div class="muted">この日・この現場に入っているメンバーはいません</div>'}
    ${canAdd ? `<div id="site-add-wrap" style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn gold" id="site-add-btn">＋ メンバーを追加</button>
      ${list.length?`<button class="btn ghost" id="site-edit-btn">${icon('edit')} 全員まとめて一括編集</button>`:''}
    </div>` : ''}
    ${samePast.length ? `<div class="section-label" style="margin-top:14px">過去の公演(現場名・会場名が完全一致)</div>
      <div>${samePast.map(histItem).join('')}</div>` : ''}
    ${venue ? histSection('今後の同会場の公演', [], sameVenueFuture, 'venue') : ''}
    ${histSection('今後の同アーティストの公演', [], sameSiteFuture, 'site')}`);
  const rosterBtn = $('#site-roster-btn');
  if(rosterBtn) rosterBtn.onclick = () => openSiteRoster(date, site);
  const venueLink = $('#modal-layer .venue-detail-link');
  if(venueLink) venueLink.onclick = () => { closeModal(); openVenueModal(venueLink.dataset.venue); };
  document.querySelectorAll('#modal-layer .site-hist-bulk-edit').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      if(btn.dataset.key === 'venue'){
        openSiteBulkRename([...currentGig, ...sameVenueFuture], () => openSiteModal(date, site),
          { fieldsMode:'venue', title:'同会場の公演の会場をまとめて変更' });
      } else {
        openSiteBulkRename([...currentGig, ...sameSiteFuture], () => openSiteModal(date, site),
          { fieldsMode:'site', title:'同アーティストの公演名をまとめて変更' });
      }
    };
  });
  document.querySelectorAll('#modal-layer .site-hist-item').forEach(el => {
    el.onclick = () => openSiteModal(el.dataset.date, el.dataset.site);
  });
  // 氏名タップ → スケジュールへ遷移(編集モーダルより優先。行/カード全体のクリックとは独立させる)
  if(canViewSched){
    document.querySelectorAll('#modal-layer .name-link[data-goto-uid]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        closeModal();
        location.hash = '#/schedule/' + el.dataset.gotoUid;
      };
    });
  }
  if(canAdd){
    $('#site-add-btn').onclick = () => openSiteAdd(date, site, venue, (list.find(p=>p.tin)||{}).tin || '', (list.find(p=>p.tout)||{}).tout || '');
    const eb = $('#site-edit-btn');
    if(eb) eb.onclick = () => openSiteBulkEdit(date, site, venue, list);
    // 各メンバー行/カードをタップ → 個人のその日の編集モーダルへ(氏名タップ時は上のハンドラでstopPropagation済み)
    const byUid = {}; list.forEach(p => byUid[p.uid] = p);
    document.querySelectorAll('.sm-edit[data-uid]').forEach(el => {
      el.style.cursor = 'pointer';
      el.onclick = () => {
        const uid = Number(el.dataset.uid);
        const p = byUid[uid];
        if(!p) return;
        openMemberDayEdit(uid, { name:p.name, role:p.role, rank:p.rank, ka:p.ka, han:p.han }, date);
      };
    });
  }
}

// 複数日にわたる現場の稼働表。現場名(会場名一致を含む)から連続した日付の範囲を自動判定し、
// その期間にこの現場(または同じ会場)へ入っている人だけを、スケジュール一覧と同じマトリックス
// 形式で表示する。openSiteModalの「稼働表」ボタンから呼ばれる。
async function openSiteRoster(date, site){
  let data;
  try{ data = await api(`/site-roster?date=${date}&site=${encodeURIComponent(site)}`); }
  catch(e){ popup(e.message, 'error'); return; }
  const periodLabel = data.dates.length > 1
    ? `${data.dates[0]} 〜 ${data.dates[data.dates.length-1]}(${data.dates.length}日間)`
    : data.dates[0];
  modal(`<h3>${icon('layoutGrid',{size:'15px'})} 稼働表</h3>
    <dl class="kv">
      <dt>現場名</dt><dd><b>${h(data.site)}</b></dd>
      ${data.venue?`<dt>会場</dt><dd>${h(data.venue)}</dd>`:''}
      <dt>期間</dt><dd>${h(periodLabel)}</dd>
    </dl>
    <div style="margin-top:10px">
      ${data.rows.length ? renderMatrixTable(data.dates, data.rows, {scrollable:true}) : '<div class="muted">この期間、この現場に入っているメンバーはいません</div>'}
    </div>`);
  wireMatrixCellClicks($('#modal-layer'));
}

// 現場記録(配置・休憩時間・自由記入欄)。本人と管理者のみ閲覧・編集可。育成計画・備考もあわせて表示。
async function openSiteRecord(uid, uname, date, site){
  let data;
  try{ data = await api(`/site-record?uid=${uid}&date=${date}&site=${encodeURIComponent(site)}`); }
  catch(e){ popup(e.message,'error'); return; }

  const breakRow = (b={}, i=0) => `<div class="sr-break" data-i="${i}">
    <input type="time" class="sr-break-start" value="${timeInputVal(b.start)}">
    <span class="sr-break-sep">〜</span>
    <input type="time" class="sr-break-end" value="${timeInputVal(b.end)}">
    <button class="btn ghost xs sr-break-del" type="button">${icon('x',{size:'12px'})}</button>
  </div>`;

  modal(`<h3>現場記録</h3>
    <div class="muted" style="margin-bottom:10px">${h(uname)} さん / ${h(date)} / ${h(site)}</div>
    ${data.plan ? `<div class="sr-info"><b>育成計画</b><div>${h(data.plan)}</div></div>` : ''}
    ${data.note ? `<div class="sr-info"><b>備考</b><div>${h(data.note)}</div></div>` : ''}
    <div class="form-grid" style="grid-template-columns:80px 1fr;margin-top:10px">
      <label>配置</label><input id="sr-placement" value="${h(data.placement)}" placeholder="例:入口案内">
    </div>
    <div style="margin-top:14px">
      <label style="font-weight:700;font-size:13px">休憩時間 <span class="muted" id="sr-break-total">(合計 ${data.breakMinutes}分)</span></label>
      <div id="sr-breaks" class="sr-breaks-wrap" style="margin-top:8px">${(data.breaks.length?data.breaks:[{}]).map((b,i)=>breakRow(b,i)).join('')}</div>
      <button class="btn ghost sm" id="sr-break-add" type="button" style="margin-top:8px">＋ 休憩を追加</button>
    </div>
    <div style="margin-top:12px">
      <label style="font-weight:700;font-size:13px">自由記入欄</label>
      <textarea id="sr-memo" style="width:100%;min-height:110px;margin-top:6px;box-sizing:border-box">${h(data.memo)}</textarea>
    </div>
    <div class="row" style="margin-top:14px">
      <button class="btn gold" id="sr-save" style="flex:1">保存する</button>
    </div>
`);

  let idx = data.breaks.length || 1;
  const recalcTotal = () => {
    let total = 0;
    document.querySelectorAll('.sr-break').forEach(row => {
      const s = row.querySelector('.sr-break-start').value;
      const e = row.querySelector('.sr-break-end').value;
      if(s && e){
        const [sh,sm] = s.split(':').map(Number), [eh,em] = e.split(':').map(Number);
        let diff = (eh*60+em) - (sh*60+sm);
        if(diff < 0) diff += 1440;
        total += diff;
      }
    });
    const el = $('#sr-break-total');
    if(el) el.textContent = `(合計 ${total}分)`;
  };
  const bind = () => {
    document.querySelectorAll('.sr-break-del').forEach(b => b.onclick = () => {
      const rows = document.querySelectorAll('.sr-break');
      if(rows.length<=1){ b.closest('.sr-break').querySelectorAll('input').forEach(i=>i.value=''); recalcTotal(); return; }
      b.closest('.sr-break').remove();
      recalcTotal();
    });
    document.querySelectorAll('.sr-break-start, .sr-break-end').forEach(i => i.oninput = recalcTotal);
  };
  bind();
  $('#sr-break-add').onclick = () => {
    const div = document.createElement('div');
    div.innerHTML = breakRow({}, idx++);
    $('#sr-breaks').appendChild(div.firstElementChild);
    bind();
  };
  $('#sr-save').onclick = async () => {
    const breaks = [];
    document.querySelectorAll('.sr-break').forEach(row => {
      const s = row.querySelector('.sr-break-start').value;
      const e = row.querySelector('.sr-break-end').value;
      if(s || e) breaks.push({start:s, end:e});
    });
    await withLoading($('#sr-save'), async () => {
      try{
        await api('/site-record', { method:'PUT', body:{ uid, date, site, placement: $('#sr-placement').value, breaks, memo: $('#sr-memo').value } });
        closeModal(); popup('現場記録を保存しました');
      }catch(e){ popup(e.message,'error'); }
    });
  };
}

// 現場の既存メンバーを一括編集(IN/OUT/会場/備考をまとめて変更、個別に外す)
async function openSiteBulkEdit(date, site, venue, list){
  const def = { tin:(list.find(p=>p.tin)||{}).tin||'', tout:(list.find(p=>p.tout)||{}).tout||'' };
  modal(`<h3>既存メンバーを一括編集</h3>
    <div class="muted" style="margin-bottom:8px"><b>${h(site)}</b>${venue?` / ${h(venue)}`:''} / ${h(date)}</div>
    <div class="be-note muted" style="margin-bottom:10px">チェックを入れた人だけに、現場名・会場・IN/OUTの変更を適用します(空欄の項目は変更しません)。チェックを外した人は変更しません。「休暇」にチェックを入れた人はこの現場を休暇に変更します(現場の変更内容より優先されます)。</div>
    <div class="form-grid" style="grid-template-columns:70px 1fr;max-width:420px">
      <label>現場名</label><input id="be-site" value="${h(site)}" placeholder="変更する場合のみ">
      <label>会場</label><input id="be-venue" value="${h(venue)}" placeholder="変更する場合のみ">
      <label>IN</label><input id="be-in" value="${h(def.tin)}" placeholder="例:9:00(全員に適用)">
      <label>OUT</label><input id="be-out" value="${h(def.tout)}" placeholder="例:18:00(全員に適用)">
    </div>
    <div class="section-label" style="margin-top:12px">対象メンバー(${list.length}名)</div>
    <div id="be-list" style="max-height:46vh;overflow:auto;margin-top:6px">
      ${list.map((p,i)=>`<div class="be-item ka-${p.ka==='1課'?'1':'2'}" style="display:flex;align-items:center;gap:8px;padding:7px 8px;border:1px solid var(--line);border-radius:8px;margin-bottom:6px">
        <label style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;cursor:pointer">
          <input type="checkbox" class="be-chk" data-uid="${p.uid}" checked>
          <span style="flex:1"><b>${h(p.name)}</b> ${p.ka?`<span class="ka-pill ka-${p.ka==='1課'?'1':'2'}">${p.ka}</span>`:''} <span class="muted">${h(p.rank)} ${h(p.han)}</span></span>
        </label>
        <span class="muted" style="font-size:12px">${h(p.tin)||'—'}〜${h(p.tout)||'—'}</span>
        <label style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--muted);cursor:pointer"><input type="checkbox" class="be-off" data-uid="${p.uid}">休暇</label>
      </div>`).join('')}
    </div>
    <div class="row" style="margin-top:14px"><button class="btn gold" id="be-save" style="flex:1">変更を保存</button></div>`);
  $('#be-save').onclick = async () => {
    const siteNew=$('#be-site').value.trim();
    const venueNew=$('#be-venue').value.trim(), tin=$('#be-in').value.trim(), tout=$('#be-out').value.trim();
    const offSet = new Set();
    document.querySelectorAll('.be-off').forEach(c=>{ if(c.checked) offSet.add(Number(c.dataset.uid)); });
    const keep=[], off=[];
    document.querySelectorAll('.be-chk').forEach(c=>{
      const uid = Number(c.dataset.uid);
      if(offSet.has(uid)) off.push(uid);
      else if(c.checked) keep.push(uid);
    });
    if(!keep.length && !off.length){ popup('対象を選択してください','error'); return; }
    if(keep.length && !siteNew){ popup('現場名は空にできません','error'); return; }
    await withLoading($('#be-save'), async () => {
      try{
        const r = await api('/site-edit',{method:'PUT',body:{ date, site, keepUids:keep, offUids:off,
          newSite:siteNew, venue:venueNew, tin, tout }});
        closeModal();
        popup(`${r.updated||0}名を更新${r.off?` / ${r.off}名を休暇に変更`:''}しました。`);
        if(typeof pageSites==='function' && location.hash.startsWith('#/sites')){ const app=document.getElementById('app'); pageSites(app); }
        else render();
      }catch(e){ popup(e.message,'error'); }
    });
  };
}

// 現場にメンバー追加(一括登録と同じ:複数人・人ごとに複数日)
async function openSiteAdd(date, site, venue, tin, tout){
  const [users, managers] = await Promise.all([getUsers(true), api('/managers')]);
  modal(`<h3>現場にメンバーを追加</h3>
    <div class="muted" style="margin-bottom:8px"><b>${h(site)}</b>${venue?` / ${h(venue)}`:''}</div>
    <div class="form-grid" style="grid-template-columns:70px 1fr">
      <label>IN</label><input id="sa-in" value="${h(tin)}" placeholder="9:00">
      <label>OUT</label><input id="sa-out" value="${h(tout)}" placeholder="18:00">
    </div>
    <div style="margin-top:12px">
      <label class="bulk-label">① メンバーを追加(同じ手配担当だけ)</label>
      <div class="row" style="gap:6px;margin:6px 0">
        <select id="sa-mgr" class="nowrap" style="flex:1"><option value="">▼ 担当手配者</option>
          ${managers.map(m=>`<option value="${m.id}">${h(m.name)}手配(${m.count}名)</option>`).join('')}
          <option value="__none:1課">チーフ手配(1課)</option>
          <option value="__none:2課">チーフ手配(2課)</option></select>
        <select id="sa-memsel" class="nowrap" style="flex:1"><option value="">担当を選択</option></select>
        <button class="btn ghost sm" id="sa-mem-add">＋追加</button>
      </div>
    </div>
    <div style="margin-top:8px"><label class="bulk-label">② メンバーごとに日付・備考</label>
      <div id="sa-assign" style="margin-top:6px"><div class="muted">メンバーを追加してください</div></div></div>
    <div class="row" style="margin-top:14px"><button class="btn gold" id="sa-save">追加する</button></div>`);
  let asg = [];
  const def1 = date;
  $('#sa-mgr').onchange = () => {
    const mid = $('#sa-mgr').value; let list=[];
    if(mid.startsWith('__none:')) list=users.filter(u=>!u.manager_id && u.ka===mid.slice(7));
    else if(mid) list=users.filter(u=>String(u.manager_id)===String(mid));
    $('#sa-memsel').innerHTML = list.length ? '<option value="">メンバー選択</option>'+list.map(u=>`<option value="${u.id}">${h(u.name)}(${h(u.regno)})</option>`).join('') : '<option value="">該当なし</option>';
  };
  const sync = () => { document.querySelectorAll('#sa-assign .bk-note-input').forEach(inp=>{ const ai=Number(inp.dataset.ai); if(asg[ai]) asg[ai].note=inp.value; }); };
  const renderA = () => {
    const box=$('#sa-assign');
    if(!asg.length){ box.innerHTML='<div class="muted">メンバーを追加してください</div>'; return; }
    box.innerHTML = asg.map((a,ai)=>`<div class="bk-person" data-ai="${ai}">
      <div class="bk-person-head"><b>${h(a.name)}</b><span class="bulk-sub">${h(a.regno)}</span><button class="bk-person-del" data-ai="${ai}">削除</button></div>
      <div class="row" style="gap:6px"><input type="date" class="bk-d-input" data-ai="${ai}"><button class="btn ghost xs bk-d-add" data-ai="${ai}">＋日付</button></div>
      <div class="bulk-chips" style="margin-top:6px">${a.dates.map((d,di)=>`<span class="chip">${d}<button data-ai="${ai}" data-di="${di}">${icon('x',{size:'12px'})}</button></span>`).join('')||'<span class="muted">日付未選択</span>'}</div>
      <div class="row" style="margin-top:6px"><label style="flex:0 0 44px;font-size:13px;color:#555">備考</label><input class="bk-note-input" data-ai="${ai}" value="${h(a.note)}" placeholder="備考(例:物販頭)" style="flex:1"></div>
    </div>`).join('');
    box.querySelectorAll('.bk-d-add').forEach(btn=>btn.onclick=()=>{ const ai=Number(btn.dataset.ai),inp=box.querySelector(`.bk-d-input[data-ai="${ai}"]`); const v=inp.value; if(!v)return; if(!asg[ai].dates.includes(v)){asg[ai].dates.push(v);asg[ai].dates.sort();} sync(); renderA(); });
    box.querySelectorAll('.chip button').forEach(b=>b.onclick=()=>{ sync(); asg[Number(b.dataset.ai)].dates.splice(Number(b.dataset.di),1); renderA(); });
    box.querySelectorAll('.bk-person-del').forEach(b=>b.onclick=()=>{ sync(); asg.splice(Number(b.dataset.ai),1); renderA(); });
  };
  $('#sa-mem-add').onclick = () => {
    const v=$('#sa-memsel').value; if(!v) return;
    if(asg.some(a=>a.uid===Number(v))){ popup('既に追加されています','error'); return; }
    const u=users.find(x=>x.id===Number(v)); if(!u) return;
    sync(); asg.push({uid:u.id,name:u.name,regno:u.regno,dates:[def1],note:''}); renderA();
  };
  $('#sa-save').onclick = async () => {
    sync();
    const assignments = asg.filter(a=>a.dates.length).map(a=>({uid:a.uid,dates:a.dates,note:a.note}));
    if(!assignments.length){ popup('メンバーと日付を指定してください','error'); return; }
    try{
      const r = await bulkSaveWithConflicts({ assignments, site, venue, tin:$('#sa-in').value.trim(), tout:$('#sa-out').value.trim() });
      if(!r) return;
      popup(withWarnNote(`${r.added}名分を現場に追加しました${r.skipped?`(${r.skipped}件はスキップ)`:''}。`, r));
    }catch(e){ popup(e.message,'error'); }
  };
  renderA();
}

/* ===== ルーティング ===== */
window.addEventListener('hashchange', () => {
  // マイ/他メンバーのスケジュールを開いたときは常に今月から表示(月送りは画面内で行うため hashchange は発火しない)
  if((location.hash||'').startsWith('#/schedule')) MONTH = jstToday().slice(0,7);
  render();
});
window.addEventListener('load', render);
// 通知ドロップダウンは、開いた状態で他の場所をタップ/クリックしたら閉じる
// (ベル・ドロップダウン自体の内側クリック、およびホーム画面の「未読の通知」ボタン経由での
//  開閉は、それぞれ個別のonclickで処理されるので対象外)
document.addEventListener('click', (e) => {
  const dd = document.getElementById('dd');
  const bell = document.getElementById('bell');
  const homeNotifBtn = document.getElementById('home-notif-btn');
  if(dd && dd.innerHTML && bell && !dd.contains(e.target) && !bell.contains(e.target)
     && !(homeNotifBtn && homeNotifBtn.contains(e.target))){
    dd.innerHTML = '';
  }
});
// ツールチップ(.tt)はCSSのhoverだけで動くが、スマホはhoverが無いためタップでも開閉できるようにする。
// .ttは各ページの再描画のたびに増減するため、個別に配線せず全画面共通のイベント委譲で処理する。
document.addEventListener('click', (e) => {
  const tt = e.target.closest ? e.target.closest('.tt') : null;
  document.querySelectorAll('.tt.tt-open').forEach(o => { if(o !== tt) o.classList.remove('tt-open'); });
  if(tt){ e.stopPropagation(); tt.classList.toggle('tt-open'); }
});

// ホーム画面へ移動する。location.hash の代入は、値が変化する場合のみ hashchange イベントを
// 発火させる(その場合はイベント側で render() が呼ばれるため、ここでは呼ばない)。既にハッシュが
// #/home のままなら hashchange が発火しないため、その場合だけ明示的に render() する。
// (hashの代入直後にrender()を毎回呼んでしまうと、hashchange経由のrender()と二重に実行され、
//  一方のcloseModal()がもう一方が表示したばかりのモーダルを消してしまうことがあるため)
function goHome(){
  if(location.hash === '#/home') render();
  else location.hash = '#/home';
}
// 任意のハッシュへ、二重render()を起こさず安全に移動する(goHomeの汎用版)
function goTo(hash){
  if(location.hash === hash) render();
  else location.hash = hash;
}

async function render(){
  clearTimers(); closeModal();
  if(!TOKEN){ renderLogin(); return; }
  if(!ME){
    try{ ME = await api('/me'); } catch(e){ renderLogin(e.message); return; }
  }
  // 初期パスワードのまま or 強制変更フラグが立っている場合は、変更するまで他を使えない
  if(ME.must_change){ renderForcedPassword(); return; }
  // 給与ロック日数を取得(手配者以上のみ。表示用の目安。最終判定はサーバー側)
  if(LV[ME.role] >= 2){ try{ const ls = await api('/lock-settings'); if(ls && typeof ls.days==='number') LOCK_DAYS = ls.days; }catch(_){} }
  const hash = location.hash || '#/home';
  renderShell(hash);
  const app = $('#app');

  // 機能公開設定のチェック。管理者は自分で解除できるよう常にスキップする。
  if(ME.role !== 'admin'){
    const featKey = hash.replace(/^#\//, '').split('/')[0];
    if(FEATURE_KEYS.includes(featKey)){
      const status = await getFeatureStatus();
      if(status[featKey] === 'hidden' || status[featKey] === 'maintenance'){
        renderFeatureBlocked(app, status[featKey], FEATURE_LABELS[featKey]);
        return;
      }
    }
  }

  try{
    if(hash === '#/home') await pageHome(app);
    else if(hash === '#/dashboard') await pageDashboard(app);
    else if(hash === '#/availability') await pageAvailability(app);
    else if(hash === '#/availability-team') await pageAvailabilityTeam(app);
    else if(hash === '#/nominate') await pageNominate(app);
    else if(hash === '#/nominations') await pageNominationsApprove(app);
    else if(hash.startsWith('#/schedule')) await pageSchedule(app, hash);
    else if(hash === '#/members') await pageMembers(app);
    else if(hash === '#/sites') await pageSites(app);
    else if(hash === '#/venues') await pageVenues(app);
    else if(hash === '#/artists') await pageArtists(app);
    else if(hash.startsWith('#/venue-manual')) await pageVenueManual(app, hash);
    else if(hash === '#/day-schedule') await pageDaySchedule(app);
    else if(hash === '#/summary') await pageSummary(app);
    else if(hash === '#/member-stats') await pageMemberStats(app);
    else if(hash === '#/edit') await pageEdit(app);
    else if(hash.startsWith('#/edit/')) await pageEdit(app, hash.slice('#/edit/'.length));
    else if(hash === '#/members/mine'){ const st0 = PAGE_STATE.members || (PAGE_STATE.members = { tab:'2課', q:'', mgr:'' }); st0.mgr = String(ME.id); await pageMembers(app); }
    else if(hash === '#/report') pageReportForm(app);
    else if(hash.startsWith('#/reports')) await pageReports(app, hash);
    else if(hash === '#/draft') await pageDraft(app);
    else if(hash.startsWith('#/blacklist')) await pageBlacklist(app, hash);
    else if(hash === '#/report-export') await pageReportExport(app);
    else if(hash.startsWith('#/import')) await pageImport(app, hash);
    else if(hash === '#/handler-status') await pageHandlerStatus(app);
    else if(hash.startsWith('#/legacy-import')) await pageLegacyImport(app, hash);
    else if(hash === '#/app-structure') await pageAppStructure(app);
    else if(hash === '#/self-reports') await pageSelfReports(app);
    else if(hash === '#/admin') await pageAdmin(app);
    else if(hash === '#/admin-settings') await pageAdminSettings(app);
    else if(hash === '#/daicho') await pageDaicho(app);
    else if(hash.startsWith('#/sched-sources')) await pageSchedSources(app, hash);
    else if(hash.startsWith('#/permissions/')) await pagePermissions(app, hash);
    else if(hash === '#/member-summary/search') await pageMemberSummarySearch(app);
    else if(hash.startsWith('#/member-summary/')) await pageMemberYearSummary(app, hash);
    else if(hash === '#/role-permissions') await pageRolePermissions(app);
    else if(hash === '#/password') pagePassword(app);
    else if(hash === '#/calendar-guide') await pageCalendarGuide(app);
    else if(hash === '#/version-history') await pageVersionHistory(app);
    else { location.hash='#/home'; }
  }catch(e){ app.innerHTML = `<div class="msg err">${h(e.message)}</div>`; }
  // 「氏名をタップ→スケジュールへ」を全ページ共通で有効化(各ページが個別にワイヤリングする必要はない)
  app.querySelectorAll('.name-link[data-goto-uid]').forEach(el => {
    if(el.dataset.wired) return; el.dataset.wired = '1';
    el.onclick = (e) => { e.stopPropagation(); location.hash = '#/schedule/' + el.dataset.gotoUid; };
  });
  pollBell();
  // アップデートのお知らせ(1セッション中に一度だけ、パスワード変更済みの人にのみ表示)
  if(ME.needsUpdateNotice && !UPDATE_NOTICE_SHOWN){
    UPDATE_NOTICE_SHOWN = true;
    openUpdateNotice();
  }
}

/* ===== ログイン ===== */
function renderLogin(err){
  clearTimers();
  document.getElementById('root').innerHTML = `
  <div class="login-wrap"><div class="login-card">
    <h1>RB事業2課</h1><div class="sub">SCHEDULE MANAGEMENT</div>
    ${err?`<div class="msg err">${h(err)}</div>`:''}
    <input id="l-regno" placeholder="登録番号" autocomplete="username">
    <input id="l-pw" type="password" placeholder="パスワード" autocomplete="current-password">
    <button class="btn gold" id="l-btn">ログイン</button>
    <div id="l-err"></div>
    <div class="hint">初期パスワードは登録番号と同じです</div>
    <button class="btn ghost sm" id="l-refresh" style="width:100%;margin-top:14px">${icon('refresh')} 最新版に更新(表示がおかしい時)</button>
  </div></div>`;
  const go = async () => {
    await withLoading($('#l-btn'), async () => {
      try{
        const d = await api('/login', { method:'POST', body:{ regno:$('#l-regno').value.trim(), password:$('#l-pw').value } });
        TOKEN = d.token; localStorage.setItem('tk', TOKEN); ME = d.user;
        goHome();
      }catch(e){ $('#l-err').innerHTML = `<div class="msg err">${h(e.message)}</div>`; }
    });
  };
  $('#l-btn').onclick = go;
  $('#l-pw').onkeydown = e => { if(e.key==='Enter') go(); };
  $('#l-refresh').onclick = () => forceRefresh($('#l-refresh'));
}

/* ===== 初回ログイン時の強制パスワード変更 ===== */
function renderForcedPassword(){
  clearTimers();
  document.getElementById('root').innerHTML = `
  <div class="login-wrap"><div class="login-card">
    <h1>パスワードの変更</h1>
    <div class="sub" style="margin-bottom:14px">安全のため、初回ログイン時はパスワードの変更が必要です</div>
    <div class="msg" style="background:#fff6e5;border:1px solid #f0dca8;color:#8a5a00;padding:10px;border-radius:8px;margin-bottom:12px;font-size:13px;text-align:left">
      初期パスワード（登録番号と同じ）は他人に推測されやすく危険です。あなただけが分かる新しいパスワードを設定してください。
    </div>
    <input id="fp-old" type="password" placeholder="現在のパスワード（登録番号）" autocomplete="current-password">
    <input id="fp-new" type="password" placeholder="新しいパスワード（4文字以上）" autocomplete="new-password">
    <input id="fp-new2" type="password" placeholder="新しいパスワード（確認）" autocomplete="new-password">
    <button class="btn gold" id="fp-btn">変更して続ける</button>
    <div id="fp-err" style="margin-top:8px"></div>
    <div class="hint" style="margin-top:12px"><a href="#" id="fp-logout">別のアカウントでログイン</a></div>
  </div></div>`;
  const go = async () => {
    const oldpw = $('#fp-old').value, newpw = $('#fp-new').value, newpw2 = $('#fp-new2').value;
    const err = m => $('#fp-err').innerHTML = `<div class="msg err">${h(m)}</div>`;
    if(newpw.length < 4){ err('新しいパスワードは4文字以上にしてください'); return; }
    if(newpw !== newpw2){ err('確認用パスワードが一致しません'); return; }
    if(newpw === ME.regno){ err('登録番号と同じパスワードは使えません'); return; }
    try{
      await api('/password', { method:'POST', body:{ oldpw, newpw } });
      ME.must_change = 0;
      popup('パスワードを変更しました');
      goHome();
    }catch(e){ err(e.message); }
  };
  $('#fp-btn').onclick = go;
  $('#fp-new2').onkeydown = e => { if(e.key==='Enter') go(); };
  $('#fp-logout').onclick = (e) => { e.preventDefault(); api('/logout',{method:'POST'}).catch(()=>{}); logoutLocal(); };
}

/* ===== シェル(ヘッダー)===== */
function renderShell(hash){
  // hashが指定パスと同一、またはパス配下(パス+'/'で始まる)かを正確に判定する。
  // 単純な startsWith だと "#/admin-settings" が "#/admin" にマッチしてしまう等の誤爆が起きるため使用。
  const hashIs = (h, p) => h === p || h.startsWith(p + '/');
  const isChief = LV[ME.role] >= 1;
  const isHandlerRole = LV[ME.role] >= 2; // 手配担当者(role: handler以上)本人か
  const canEdit = ME.handler === 1;
  const canDraft = has('report_check');
  const canBlacklist = has('blacklist_manage');
  const canAccountAdmin = has('account_manage');
  const canSystemSettings = has('wage_settings');
  const canRolePerm = has('account_manage');
  const canHandlerStatus = has('handler_tools');
  const canImport = has('import_data');
  const canSchedSrc = has('wage_settings');
  const canDaicho = has('daicho_manage');
  const showSystemGroup = canAccountAdmin || canSystemSettings || canRolePerm || canHandlerStatus || ME.role==='admin';
  const showSpreadGroup = canImport || canSchedSrc || canDaicho;
  const canSummaryView = has('summary_view');
  const canDayScheduleView = has('day_schedule_view');
  const canMemberStatsView = has('member_stats_view');
  const canSitesView = has('sites_view');
  const canMembersView = has('members_view');
  const canDashboardView = has('dashboard_view');
  const canMemberSummaryNav = has('member_summary_view');
  const showMemberGroup = isChief || canSummaryView || canDayScheduleView || canMemberStatsView || canMembersView;

  // ナビゲーション構造。children を持つ項目はグループ(タップでサブメニューに切り替わる)、
  // 持たない項目は単独ページへのリンク。権限がない機能は、グループ内の子としても一切出現しない
  // (グループ自体も、中身が1つも無ければ表示されない)。
  // メニュー構成の方針: 「日常的に本人が使う項目」→「チーフ・手配者が現場/メンバーを見る項目」→
  // 「手配者・管理者向けの取込/管理項目」の順に並べる(新機能を追加するたびに末尾へ積み上げて
  // 使いにくくなっていたのを解消。2026年8月整理)。関連する項目は必ずグループ化すること
  // (現場一覧・会場一覧・公演一覧が個別のトップレベル項目のまま並んでいたのが典型例だった)。
  const nav = [
    { path:'#/home', icon:'home', label:'ホーム', show:true },
    { icon:'calendar', label:'スケジュール', show:true, children:[
      { path:'#/schedule', icon:'calendar', label:'マイスケジュール' },
      ...(canEdit ? [{ path:'#/edit', icon:'edit', label:'スケジュール入力', role:'handler' }] : []),
      ...(isHandlerRole ? [{ path:'#/self-reports', icon:'mail', label:'現場変更報告の承認', role:'handler' }] : []),
    ]},
    { icon:'handRaise', label:'希望', show:true, children:[
      { path:'#/availability', icon:'handRaise', label:'休み希望・稼働時間の提出' },
      ...(isHandlerRole ? [{ path:'#/availability-team', icon:'calendarDays', label:'チームの希望一覧', role:'handler' }] : []),
      ...(isChief ? [{ path:'#/nominate', icon:'user', label:'メンバーを希望する', role:'chief' }] : []),
      ...(isHandlerRole ? [{ path:'#/nominations', icon:'checkCircle', label:'メンバー指名の承認', role:'handler' }] : []),
    ]},
    { icon:'sparkles', label:'新人報告', show:true, children:[
      { path:'#/report', icon:'fileText', label:'新人報告' },
      { path:'#/reports', icon:'clipboardList', label:'報告一覧' },
      ...(canDraft ? [{ path:'#/draft', icon:'star', label:'ドラフト', role:'handler' }] : []),
      ...(canBlacklist ? [{ path:'#/blacklist', icon:'ban', label:'ブラックリスト', role:'handler' }] : []),
      ...(ME.role==='admin' ? [{ path:'#/report-export', icon:'paperclip', label:'貼り付け用コピー', role:'admin' }] : []),
    ]},
    { icon:'stadium', label:'現場・会場', show:canSitesView, children:[
      { path:'#/sites', icon:'stadium', label:'現場一覧', role:'chief' },
      { path:'#/venues', icon:'mapPin', label:'会場一覧', role:'chief' },
      { path:'#/artists', icon:'megaphone', label:'公演一覧', role:'chief' },
    ]},
    { icon:'users', label:'メンバー', show:showMemberGroup, children:[
      ...(isHandlerRole ? [{ path:'#/members/mine', icon:'briefcase', label:`${ME.name}手配`, role:'handler' }] : []),
      ...(canMembersView ? [{ path:'#/members', icon:'users', label:'メンバー一覧', role:'chief' }] : []),
      ...(canSummaryView ? [{ path:'#/summary', icon:'barChart', label:'稼働サマリー', role:'chief' }] : []),
      ...(canMemberStatsView ? [{ path:'#/member-stats', icon:'trendingUp', label:'メンバー分析', role:'chief' }] : []),
      ...(canDayScheduleView ? [{ path:'#/day-schedule', icon:'layoutGrid', label:'スケジュール一覧', role:'chief' }] : []),
      ...(canMemberSummaryNav ? [{ path:'#/member-summary/search', icon:'barChart', label:'個人の年間サマリー', role:'handler' }] : []),
    ]},
    { path:'#/dashboard', icon:'gauge', label:'ダッシュボード', show:canDashboardView, role:'admin' },
    { icon:'upload', label:'スプレッド読み込み', show: showSpreadGroup, children:[
      ...(canImport ? [{ path:'#/import', icon:'download', label:'手動取り込み', role:'handler' }] : []),
      ...(canSchedSrc ? [{ path:'#/sched-sources', icon:'rss', label:'予定表ソース管理', role:'admin' }] : []),
      ...(canDaicho ? [{ path:'#/daicho', icon:'package', label:'台帳保管', role:'admin' }] : []),
    ]},
    { icon:'settings', label:'システム管理', show: showSystemGroup, children:[
      ...(canAccountAdmin ? [{ path:'#/admin', icon:'shieldCheck', label:'アカウント管理', role:'admin' }] : []),
      ...(canSystemSettings ? [{ path:'#/admin-settings', icon:'wrench', label:'システム設定', role:'admin' }] : []),
      ...(canRolePerm ? [{ path:'#/role-permissions', icon:'shield', label:'権限の一括設定', role:'admin' }] : []),
      ...(canHandlerStatus ? [{ path:'#/handler-status', icon:'circleFilled', label:'ログイン中・編集履歴', role:'handler' }] : []),
      ...(ME.role==='admin' ? [{ path:'#/legacy-import', icon:'inbox', label:'過去データ取込確認', role:'admin' }] : []),
      ...(ME.role==='admin' ? [{ path:'#/app-structure', icon:'sitemap', label:'アプリ構造ビューア', role:'admin' }] : []),
    ]},
  ].filter(n => n.show);

  // 現在ページ名(ヘッダー中央に表示)。グループ内の子ページも探索する。
  let curName = '';
  outer: for(const item of nav){
    if(item.path && hashIs(hash, item.path)){ curName = item.label; break; }
    if(item.children){
      for(const c of item.children){ if(hashIs(hash, c.path)){ curName = c.label; break outer; } }
    }
  }
  // ドロワーの主要メニューに載らないフッターリンク等(パスワード変更・バージョン履歴・
  // カレンダー連携のやり方 等)は上のnavでは見つからないため、ログイン中一覧で使っている
  // 既存の対応表(PAGE_LABELS)を流用してフォールバックする。無いと、これらのページだけ
  // ヘッダー中央に画面名が出ず「今どこにいるか」が分かりにくかった。
  if(!curName) curName = pageLabelFromHash(hash);
  document.getElementById('root').innerHTML = `
  <header>
    <button class="menu-btn" id="menu-btn" aria-label="メニュー">${icon('menu',{size:'12px'})}</button>
    <a href="#/home" class="brand" id="brand-home">${icon('home',{size:'14px'})}<span class="brand-text">RB事業2課<small>SCHEDULE</small></span></a>
    <div class="cur-page">${h(curName)}</div>
    <div class="hright">
      <button class="pin-btn ${ME.handler===1?'active':''}" id="pin-btn" title="${ME.handler===1?'手配者モードを終了':'手配者モードに入る'}">${ME.handler===1?icon('unlock'):icon('key')}</button>
      <button class="bell" id="bell">${icon('bell',{size:'12px'})}<span class="badge" id="bcount" style="display:none"></span></button>
      <span class="uname">${h(ME.name)}${ME.handler?'<br><span style="color:var(--gold)">(手配モード)</span>':''}</span>
    </div>
  </header>
  <main id="app"><div class="loading-box"><span class="spinner"></span>読み込み中…</div></main>
  <div id="dd"></div>
  <div id="menu-drawer"></div>`;

  const pinBtn = $('#pin-btn');
  if(pinBtn) pinBtn.onclick = async () => {
    if(ME.handler === 1){
      if(!confirm('手配者モードを終了しますか?')) return;
      await withLoading(pinBtn, async () => {
        await api('/handler-mode',{method:'DELETE'}); ME.handler=0; render();
      });
    } else {
      openHandlerPin();
    }
  };

  const footerLinks = `
    <div class="drawer-sep"></div>
    <button type="button" class="drawer-link" data-go="#/password"><span class="drawer-label">${icon('key')} パスワード変更</span></button>
    <button type="button" class="drawer-link" data-go="#/version-history"><span class="drawer-label">${icon('scroll')} バージョン履歴</span></button>
    <button type="button" class="drawer-link" id="dd-refresh"><span class="drawer-label">${icon('refresh')} 最新版に更新</span></button>
    <button type="button" class="drawer-link danger" id="dd-logout"><span class="drawer-label">${icon('logOut')} ログアウト</span></button>`;

  const wireFooter = (dr, close) => {
    dr.querySelectorAll('.drawer-link[data-go]').forEach(btn => btn.onclick = () => {
      const to = btn.dataset.go;
      close();
      if(location.hash === to){ render(); } else { location.hash = to; }
    });
    const dr2 = dr.querySelector('#dd-refresh');
    if(dr2) dr2.onclick = () => forceRefresh(dr2);
    const dl = dr.querySelector('#dd-logout');
    if(dl) dl.onclick = async () => { try{ await api('/logout',{method:'POST'}); }catch(_){} logoutLocal(); };
  };

  const stMenu = PAGE_STATE.menu || (PAGE_STATE.menu = { open:{} });
  // 現在地が属するグループは、初回だけ自動的に開いておく(以降はユーザーの開閉操作を優先)
  nav.forEach((item,i) => {
    if(item.children && item.children.some(c => hashIs(hash,c.path)) && stMenu.open[i]===undefined) stMenu.open[i] = true;
  });

  const renderDrawer = () => {
    const dr = $('#menu-drawer');
    const close = () => closeDrawerAnimated(dr);
    dr.innerHTML = `<div class="drawer-bg" id="drawer-bg"></div>
      <nav class="drawer">
        <div class="drawer-head">メニュー</div>
        ${nav.map((item,i) => {
          if(!item.children){
            return `<button type="button" class="drawer-link ${item.role?'role-'+item.role:''} ${hashIs(hash, item.path)?'active':''}" data-go="${item.path}"><span class="drawer-label">${icon(item.icon)} ${h(item.label)}</span><span class="role-dots">${roleDots(item.role)}</span></button>`;
          }
          const isOpen = !!stMenu.open[i];
          return `<button type="button" class="drawer-link drawer-group" data-toggle="${i}"><span class="drawer-label">${icon(item.icon)} ${h(item.label)}</span><span class="drawer-arrow ${isOpen?'open':''}">›</span></button>
            <div class="drawer-sub ${isOpen?'':'collapsed'}">
              ${item.children.map(c => `<button type="button" class="drawer-link drawer-sublink ${hashIs(hash,c.path)?'active':''}" data-go="${c.path}"><span class="drawer-label">${icon(c.icon)} ${h(c.label)}</span><span class="role-dots">${roleDots(c.role)}</span></button>`).join('')}
            </div>`;
        }).join('')}
        ${footerLinks}
      </nav>`;
    dr.querySelector('#drawer-bg').onclick = close;
    dr.querySelectorAll('.drawer-group').forEach(btn => btn.onclick = () => {
      const i = Number(btn.dataset.toggle);
      stMenu.open[i] = !stMenu.open[i];
      // ドロワー全体(dr.innerHTML)を再構築すると、.drawer/.drawer-bgのフェードイン・スライドイン
      // アニメーションが毎回再発火し、メニューが一瞬消えたように見えてしまう。
      // そのため、該当グループの矢印とサブメニューの開閉クラスだけを直接切り替える。
      const sub = btn.nextElementSibling;
      const arrow = btn.querySelector('.drawer-arrow');
      if(sub && sub.classList.contains('drawer-sub')) sub.classList.toggle('collapsed', !stMenu.open[i]);
      if(arrow) arrow.classList.toggle('open', stMenu.open[i]);
    });
    wireFooter(dr, close);
  };

  $('#menu-btn').onclick = () => {
    const dr = $('#menu-drawer');
    if(dr.innerHTML){ closeDrawerAnimated(dr); return; }
    renderDrawer();
  };

  $('#bell').onclick = openNotifDropdown;
}

// 通知パネル(ベルのドロップダウン)を開く。ヘッダーのベルアイコン、ホーム画面の
// 「未読の通知」カード、両方から共通で呼ばれる。
async function openNotifDropdown(){
  if($('#dd').innerHTML){ $('#dd').innerHTML=''; return; }
  const d = await api('/notifications');
  $('#dd').innerHTML = `<div class="dropdown" style="min-width:300px">
    <div class="notif-list">${d.items.length ? d.items.map(n=>`
      <div class="notif-item ${n.read?'':'unread'} ${n.link?'notif-clickable':''}" data-id="${n.id}" ${n.link?`data-link="${h(n.link)}"`:''}><time>${h(n.ts)}</time>${h(n.message)}</div>`).join('') : '<div class="notif-item muted">通知はありません</div>'}</div>
    ${d.unread ? '<button id="dd-read" class="sep">すべて既読にする</button>' : ''}
  </div>`;
  const dr2 = $('#dd-read');
  if(dr2) dr2.onclick = async () => { await api('/notifications/read',{method:'POST'}); $('#dd').innerHTML=''; pollBell(); };
  $('#dd').querySelectorAll('.notif-clickable').forEach(el => el.onclick = async () => {
    const link = el.dataset.link;
    if(!link) return;
    try{ await api(`/notifications/${el.dataset.id}/read`,{method:'POST'}); }catch(_){}
    $('#dd').innerHTML = ''; pollBell();
    const [hashPart, query] = link.split('?');
    if(query){ const m = new URLSearchParams(query).get('month'); if(m) MONTH = m; }
    if(location.hash === hashPart){ render(); } else { location.hash = hashPart; }
  });
}

async function pollBell(){
  const upd = async () => {
    try{ const d = await api('/notifications'); const b = $('#bcount');
      if(!b) return;
      b.style.display = d.unread ? '' : 'none'; b.textContent = d.unread;
    }catch(_){}
  };
  upd();
  timers.push(setInterval(upd, 45000));
}

/* ===== スケジュール表(写真風)===== */
// 個人スケジュール画面から、その人の変更履歴(誰が・いつ・どこを・どう変更したか)を見る。
// 閲覧は手配者以上(pageSchedule側で呼び出しボタンの表示を制御済み)。
async function openScheduleHistory(uid, name){
  modal(`<h3>${h(name)} さんの変更履歴</h3><div class="muted" style="margin-bottom:10px">直近500件を新しい順に表示します。誤った変更は選択して「取り消す」で1つ前の状態に戻せます。</div>
    <div class="row" id="sh-bulk-bar" style="margin-bottom:10px;gap:8px;align-items:center">
      <button class="btn danger sm" id="sh-bulk-undo" disabled>選択した項目を取り消す(<span id="sh-sel-count">0</span>)</button>
    </div>
    <div id="sh-list" class="muted"><span class="spinner" style="width:13px;height:13px;border-width:2px;margin-right:5px"></span>読み込み中…</div>`);
  const render2 = async () => {
    try{
      const hist = await api(`/history?uid=${uid}`);
      const el = $('#sh-list'); if(!el) return;
      el.innerHTML = hist.length ? hist.map(x=>`<div class="dcard" style="margin-bottom:8px">
        <div class="dcard-head">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" class="sh-check" data-id="${x.id}" data-date="${h(x.date)}">
            <span class="dcard-title">${h(x.date)}</span>
          </label>
          <span class="dcard-sub">${h(x.editor_name)}</span>
        </div>
        <div class="drow"><span class="dk">変更</span><span class="dv">${h(summarizeHistory(x.before_json, x.after_json))}</span></div>
        <div class="drow"><span class="dk">日時</span><span class="dv dcard-sub">${h(x.ts)}</span></div>
        <div class="row" style="margin-top:6px"><button class="btn ghost xs sh-undo" data-id="${x.id}" data-date="${h(x.date)}">${icon('undo',{size:'12px'})} この変更を取り消す</button></div>
      </div>`).join('') : '<div class="muted" style="text-align:center;padding:16px 0">変更履歴はありません</div>';

      const updateBulkBar = () => {
        const checked = el.querySelectorAll('.sh-check:checked');
        $('#sh-sel-count').textContent = checked.length;
        $('#sh-bulk-undo').disabled = checked.length === 0;
        $('#sh-bulk-bar').style.display = hist.length ? '' : 'none';
      };
      el.querySelectorAll('.sh-check').forEach(cb => cb.onchange = updateBulkBar);
      updateBulkBar();

      const undoIds = async (ids) => {
        try{
          const r = await api('/history/undo-batch', { method:'POST', body:{ ids } });
          if(r.failed && r.failed.length) popup(`${r.okCount}件を取り消しました(${r.failed.length}件は失敗)`, 'error');
          else popup(`${r.okCount}件を取り消しました`);
          render2();
        }catch(e){ popup(e.message,'error'); }
      };

      el.querySelectorAll('.sh-undo').forEach(b => b.onclick = () => {
        const doUndo = () => {
          if(!confirm(`${b.dataset.date} の内容を、この変更が行われる前の状態に戻します。よろしいですか？`)) return;
          undoIds([Number(b.dataset.id)]);
        };
        if(ME.handler !== 1 && ME.role !== 'admin'){ openHandlerPin(doUndo); return; }
        doUndo();
      });
      $('#sh-bulk-undo').onclick = () => {
        const ids = [...el.querySelectorAll('.sh-check:checked')].map(cb => Number(cb.dataset.id));
        if(!ids.length) return;
        const doUndo = () => {
          if(!confirm(`選択した${ids.length}件の変更を、それぞれ行われる前の状態に戻します。よろしいですか？`)) return;
          undoIds(ids);
        };
        if(ME.handler !== 1 && ME.role !== 'admin'){ openHandlerPin(doUndo); return; }
        doUndo();
      };
    }catch(e){
      const el = $('#sh-list'); if(el) el.innerHTML = `<div class="msg err">${h(e.message)}</div>`;
    }
  };
  render2();
}

// Googleカレンダー等への購読URL(iCalendarフィード)の案内・発行・再発行モーダル。
async function openCalendarSync(){
  modal(`<h3>${icon('calendar')} カレンダー連携</h3><div class="loading-box"><span class="spinner"></span>読み込み中…</div>`);
  const render2 = async () => {
    let token = null;
    try{ const r = await api('/calendar-token'); token = r.token; }catch(e){}
    const box = document.querySelector('.modal');
    if(!box) return;
    if(!token){
      box.innerHTML = `<button class="close-x">${icon('x',{size:'12px'})}</button><h3>${icon('calendar')} カレンダー連携</h3>
        <button class="btn gold" id="cs-start" style="width:100%">連携を開始する</button>`;
      $('#cs-start').onclick = async () => {
        await withLoading($('#cs-start'), async () => {
          try{ await api('/calendar-token', { method:'POST' }); render2(); }
          catch(e){ popup(e.message,'error'); }
        });
      };
      box.querySelector('.close-x').onclick = closeModal;
      return;
    }
    const url = `${location.origin}/api/calendar/${token}.ics`;
    box.innerHTML = `<button class="close-x">${icon('x',{size:'12px'})}</button><h3>${icon('calendar')} カレンダー連携</h3>
      <div class="row" style="gap:6px;margin-bottom:14px">
        <input id="cs-url" readonly value="${h(url)}" style="flex:1;min-width:0;font-family:monospace;font-size:12px">
        <button class="btn ghost sm" id="cs-copy">コピー</button>
      </div>
      <div class="muted" style="margin-bottom:14px;font-size:12.5px">
        <b>Googleカレンダーの場合:</b> 左メニュー「他のカレンダー」の＋ →「URLで追加」に、このURLを貼り付けてください。<br>
        <a href="#/calendar-guide" id="cs-guide-link">${icon('bookOpen')} 画像付きの詳しいやり方を見る(Google/Outlook/Apple対応)</a>
      </div>
      <button class="btn danger sm" id="cs-regen">URLを再発行する(このURLを無効化)</button>
`;
    box.querySelector('.close-x').onclick = closeModal;
    const guideLink = $('#cs-guide-link');
    if(guideLink) guideLink.onclick = (e) => { e.preventDefault(); closeModal(); goTo('#/calendar-guide'); };
    $('#cs-copy').onclick = () => {
      navigator.clipboard.writeText(url).then(()=>popup('コピーしました')).catch(()=>{
        $('#cs-url').select(); document.execCommand('copy'); popup('コピーしました');
      });
    };
    $('#cs-regen').onclick = async () => {
      if(!confirm('URLを再発行しますか？古いURLは使えなくなり、カレンダーアプリ側で登録し直す必要があります。')) return;
      await withLoading($('#cs-regen'), async () => {
        try{ await api('/calendar-token/regenerate', { method:'POST' }); popup('再発行しました'); render2(); }
        catch(e){ popup(e.message,'error'); }
      });
    };
  };
  render2();
}

/* ===== ホーム画面(ログイン後の最初の画面) ===== */
/* ===== 休み希望・稼働可能時間の提出(本人用) ===== */
async function pageAvailability(app){
  app.innerHTML = `<h2>${icon('handRaise')} 休み希望・稼働可能時間の提出</h2><div class="card"><div class="loading-box"><span class="spinner"></span>読み込み中…</div></div>`;
  let rows;
  try{ rows = await api(`/availability?month=${MONTH}`); }
  catch(e){ app.innerHTML = `<h2>${icon('handRaise')} 休み希望・稼働可能時間の提出</h2><div class="card"><div class="msg err">${h(e.message)}</div></div>`; return; }
  const byDate = {}; rows.forEach(r => byDate[r.date] = r);

  const [y, mo] = MONTH.split('-').map(Number);
  const days = new Date(y, mo, 0).getDate();
  const dateList = Array.from({length:days}, (_,i) => `${MONTH}-${pad(i+1)}`);
  const wd = d => '日月火水木金土'[new Date(d+'T00:00:00+09:00').getDay()];

  app.innerHTML = `
  <h2 style="margin-bottom:4px">${icon('handRaise')} 休み希望・稼働可能時間の提出</h2>
  <div class="card" style="margin-bottom:14px">
    <div class="row" style="align-items:center;gap:10px">
      <button class="btn ghost sm" id="av-prev">◀</button>
      <div class="mtitle" id="av-jump-month" title="タップして年月を選択" style="margin:0;cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px">${y}年 ${mo}月</div>
      <button class="btn ghost sm" id="av-next">▶</button>
    </div>
  </div>
  <div id="av-list"></div>`;

  const TYPE_LABEL = { none:'未設定', off:'休み希望', available:'稼働可能' };
  const renderList = () => {
    const el = $('#av-list'); if(!el) return;
    el.innerHTML = dateList.map(d => {
      const r = byDate[d];
      const type = r ? r.type : 'none';
      const isToday = d === jstToday();
      return `<div class="av-row ${isToday?'av-today':''}" data-date="${d}">
        <div class="av-date">${h(d.slice(8))}<span class="muted"> (${wd(d)})</span></div>
        <select class="av-type" data-date="${d}">
          ${Object.entries(TYPE_LABEL).map(([k,l])=>`<option value="${k}" ${type===k?'selected':''}>${l}</option>`).join('')}
        </select>
        <div class="av-detail" data-date="${d}" style="${type==='available'?'':'display:none'}">
          <input type="time" class="av-from" data-date="${d}" value="${timeInputVal(r&&r.from_time)}" placeholder="開始">
          <span class="muted">〜</span>
          <input type="time" class="av-to" data-date="${d}" value="${timeInputVal(r&&r.to_time)}" placeholder="終了">
          <input class="av-departure" data-date="${d}" value="${h(r&&r.departure||'')}" placeholder="どこから出発できるか(任意)">
        </div>
      </div>`;
    }).join('');

    const save = async (d) => {
      const row = el.querySelector(`.av-row[data-date="${d}"]`);
      const type = row.querySelector('.av-type').value;
      if(type === 'none'){
        try{ await api('/availability', { method:'DELETE', body:{ date:d } }); byDate[d] = undefined; }
        catch(e){ popup(e.message,'error'); }
        return;
      }
      const fromTime = row.querySelector('.av-from') ? row.querySelector('.av-from').value : '';
      const toTime = row.querySelector('.av-to') ? row.querySelector('.av-to').value : '';
      const departure = row.querySelector('.av-departure') ? row.querySelector('.av-departure').value : '';
      try{
        await api('/availability', { method:'PUT', body:{ date:d, type, fromTime, toTime, departure } });
        byDate[d] = { date:d, type, from_time:fromTime, to_time:toTime, departure };
      }catch(e){ popup(e.message,'error'); }
    };

    el.querySelectorAll('.av-type').forEach(sel => sel.onchange = () => {
      const d = sel.dataset.date;
      const detail = el.querySelector(`.av-detail[data-date="${d}"]`);
      if(detail) detail.style.display = sel.value === 'available' ? '' : 'none';
      save(d);
    });
    el.querySelectorAll('.av-from, .av-to, .av-departure').forEach(inp => inp.onchange = () => save(inp.dataset.date));
  };
  renderList();

  $('#av-prev').onclick = () => { MONTH = shiftMonth(MONTH,-1); pageAvailability(app); };
  $('#av-next').onclick = () => { MONTH = shiftMonth(MONTH, 1); pageAvailability(app); };
  $('#av-jump-month').onclick = () => {
    openMonthJumpModal(MONTH, (ym) => { MONTH = ym; pageAvailability(app); });
  };
}

/* ===== チームの休み希望・稼働可能時間の一覧(手配担当者向け) ===== */
async function pageAvailabilityTeam(app){
  if(LV[ME.role] < 2){ notFound(app); return; }
  app.innerHTML = `<h2>${icon('handRaise')} チームの希望一覧</h2><div class="card"><div class="loading-box"><span class="spinner"></span>読み込み中…</div></div>`;
  let rows;
  try{ rows = await api(`/availability/team?month=${MONTH}`); }
  catch(e){ app.innerHTML = `<h2>${icon('handRaise')} チームの希望一覧</h2><div class="card"><div class="msg err">${h(e.message)}</div></div>`; return; }

  const byDate = {};
  rows.forEach(r => { (byDate[r.date] ||= []).push(r); });
  const dates = Object.keys(byDate).sort();
  const [y, mo] = MONTH.split('-').map(Number);
  const wd = d => '日月火水木金土'[new Date(d+'T00:00:00+09:00').getDay()];

  app.innerHTML = `
  <h2 style="margin-bottom:4px">${icon('calendarDays')} チームの希望一覧</h2>
  <div class="card sticky-filters" style="margin-bottom:14px">
    <div class="row" style="align-items:center;gap:10px">
      <button class="btn ghost sm" id="avt-prev">◀</button>
      <div class="mtitle" id="avt-jump-month" title="タップして年月を選択" style="margin:0;cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px">${y}年 ${mo}月</div>
      <button class="btn ghost sm" id="avt-next">▶</button>
    </div>
  </div>
  ${dates.length ? dates.map(d => `<div class="card" style="margin-bottom:10px">
    <div style="font-weight:700;margin-bottom:8px">${h(d)} <span class="muted">(${wd(d)})</span></div>
    ${byDate[d].map(r => `<div class="drow">
      <span class="dk name-link" data-goto-uid="${r.user_id}">${h(r.user_name)}</span>
      <span class="dv">${r.type==='off' ? `${icon('x')} 休み希望` : `${icon('checkCircle')} 稼働可能 ${h(r.from_time||'?')}〜${h(r.to_time||'?')}${r.departure?`<span class="muted">(${h(r.departure)}発)</span>`:''}`}</span>
    </div>`).join('')}
  </div>`).join('') : '<div class="card"><div class="muted" style="text-align:center;padding:20px 0">この月の希望はまだ提出されていません</div></div>'}`;
  wireNameLinks(app);

  $('#avt-prev').onclick = () => { MONTH = shiftMonth(MONTH,-1); pageAvailabilityTeam(app); };
  $('#avt-next').onclick = () => { MONTH = shiftMonth(MONTH, 1); pageAvailabilityTeam(app); };
  $('#avt-jump-month').onclick = () => {
    openMonthJumpModal(MONTH, (ym) => { MONTH = ym; pageAvailabilityTeam(app); });
  };
}

/* ===== メンバーを希望する(チーフ以上) ===== */
async function pageNominate(app){
  if(LV[ME.role] < 1){ notFound(app); return; }
  app.innerHTML = `<h2>${icon('handRaise')} メンバーを希望する</h2><div class="card"><div class="loading-box"><span class="spinner"></span>読み込み中…</div></div>`;
  let schedData, users;
  try{
    [schedData, users] = await Promise.all([
      api(`/schedule?uid=${ME.id}&month=${MONTH}`),
      getUsers(true),
    ]);
  }catch(e){ app.innerHTML = `<h2>${icon('handRaise')} メンバーを希望する</h2><div class="card"><div class="msg err">${h(e.message)}</div></div>`; return; }

  const entries = (schedData && schedData.entries) || {};
  const mySites = [];
  Object.keys(entries).sort().forEach(d => {
    (entries[d]||[]).forEach(e => { if(e.type==='work') mySites.push({date:d, site:e.site, venue:e.venue}); });
  });
  const others = users.filter(u=>u.id!==ME.id).sort((a,b)=>(a.regno||'').localeCompare(b.regno||''));

  app.innerHTML = `
  <h2 style="margin-bottom:4px">${icon('handRaise')} メンバーを希望する</h2>
  <div class="card">
    ${mySites.length ? `
    <div class="form-grid" style="max-width:480px">
      <label>現場 *</label>
      <select id="nm-site">
        <option value="">選択してください</option>
        ${mySites.map((s,i)=>`<option value="${i}">${h(s.date)} ${h(s.site)}${s.venue?`／${h(s.venue)}`:''}</option>`).join('')}
      </select>
      <label>希望する人 *</label>
      <select id="nm-target">
        <option value="">選択してください</option>
        ${others.map(u=>`<option value="${u.id}">${h(u.name)}(${h(u.regno)})</option>`).join('')}
      </select>
    </div>
    <div class="row" style="margin-top:14px"><button class="btn gold" id="nm-save" style="flex:1">希望を送る</button></div>
    ` : `<div class="muted" style="text-align:center;padding:16px 0">今月、あなたが入っている現場が見つかりませんでした。まず自分のスケジュールに現場が登録されている必要があります。</div>`}
  </div>`;

  const sv = $('#nm-save');
  if(sv) sv.onclick = async () => {
    const siteIdx = $('#nm-site').value;
    const targetId = $('#nm-target').value;
    if(siteIdx===''){ popup('現場を選んでください','error'); return; }
    if(!targetId){ popup('希望する人を選んでください','error'); return; }
    const s = mySites[Number(siteIdx)];
    await withLoading(sv, async () => {
      try{
        await api('/site-nominations', { method:'POST', body:{ date:s.date, site:s.site, venue:s.venue, targetId:Number(targetId) } });
        popup('希望を送りました。手配担当者に通知が届きます');
        $('#nm-site').value=''; $('#nm-target').value='';
      }catch(e){ popup(e.message,'error'); }
    });
  };
}

/* ===== メンバー指名の承認(手配担当者向け) ===== */
async function pageNominationsApprove(app){
  if(LV[ME.role] < 2){ notFound(app); return; }
  app.innerHTML = `<h2>${icon('handRaise')} メンバー指名の承認</h2><div class="card"><div class="loading-box"><span class="spinner"></span>読み込み中…</div></div>`;
  let rows;
  try{ rows = await api('/site-nominations'); }
  catch(e){ app.innerHTML = `<h2>${icon('handRaise')} メンバー指名の承認</h2><div class="card"><div class="msg err">${h(e.message)}</div></div>`; return; }

  app.innerHTML = `
  <h2 style="margin-bottom:8px">${icon('handRaise')} メンバー指名の承認</h2>
  ${rows.length ? `
  <div class="row sticky-filters" id="sn-bulk-bar" style="margin-bottom:10px;gap:8px;align-items:center">
    <button class="btn gold sm" id="sn-bulk-approve" disabled>選択した項目を承認(<span id="sn-sel-count">0</span>)</button>
    <button class="btn danger sm" id="sn-bulk-reject" disabled>選択した項目を見送る</button>
  </div>
  <div class="cards" style="display:flex">
    ${rows.map(r=>`<div class="dcard" data-id="${r.id}">
      <div class="dcard-head">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" class="sn-check" data-id="${r.id}">
          <span class="dcard-title">${h(r.target_name)}さん<span class="muted" style="font-size:12px"> (${h(r.target_regno)})</span></span>
        </label>
      </div>
      <div class="drow"><span class="dk">現場日</span><span class="dv">${h(r.date)}</span></div>
      <div class="drow"><span class="dk">現場</span><span class="dv"><b>${h([r.site,r.venue].filter(Boolean).join('／'))}</b></span></div>
      <div class="drow"><span class="dk">指名した人</span><span class="dv">${h(r.nominator_name)}</span></div>
      <div class="dcard-actions">
        <button class="btn gold sm sn-approve" data-id="${r.id}">${icon('checkCircle')} 承認する</button>
        <button class="btn danger sm sn-reject" data-id="${r.id}">${icon('xCircle')} 見送る</button>
      </div>
    </div>`).join('')}
  </div>
  ` : '<div class="card"><div class="muted" style="text-align:center;padding:20px 0">承認待ちの指名はありません</div></div>'}`;

  const proceed = async (id, action) => {
    if(!confirm(action==='approve' ? 'この内容でスケジュールに追加しますか？' : '見送りますか？')) return;
    try{ await api(`/site-nominations/${id}/${action}`, { method:'POST' }); popup(action==='approve'?'承認しました':'見送りました'); pageNominationsApprove(app); }
    catch(e){ popup(e.message,'error'); }
  };
  app.querySelectorAll('.sn-approve').forEach(b => b.onclick = () => {
    if(ME.handler !== 1 && ME.role !== 'admin'){ openHandlerPin(() => proceed(b.dataset.id,'approve')); return; }
    proceed(b.dataset.id,'approve');
  });
  app.querySelectorAll('.sn-reject').forEach(b => b.onclick = () => {
    if(ME.handler !== 1 && ME.role !== 'admin'){ openHandlerPin(() => proceed(b.dataset.id,'reject')); return; }
    proceed(b.dataset.id,'reject');
  });

  // 複数選択・一括承認/却下
  const updateBulkBar = () => {
    const checked = app.querySelectorAll('.sn-check:checked');
    const cnt = $('#sn-sel-count'); if(cnt) cnt.textContent = checked.length;
    const ab = $('#sn-bulk-approve'); if(ab) ab.disabled = checked.length === 0;
    const rb = $('#sn-bulk-reject'); if(rb) rb.disabled = checked.length === 0;
  };
  app.querySelectorAll('.sn-check').forEach(cb => cb.onchange = updateBulkBar);
  const bulkProceed = async (action) => {
    const ids = [...app.querySelectorAll('.sn-check:checked')].map(cb => Number(cb.dataset.id));
    if(!ids.length) return;
    if(!confirm(`選択した${ids.length}件を${action==='approve'?'承認':'見送り'}します。よろしいですか？`)) return;
    try{
      const r = await api('/site-nominations/bulk-decide', { method:'POST', body:{ ids, action } });
      if(r.failed && r.failed.length) popup(`${r.okCount}件処理しました(${r.failed.length}件は失敗: ${r.failed[0].error})`, 'error');
      else popup(`${r.okCount}件処理しました`);
      pageNominationsApprove(app);
    }catch(e){ popup(e.message,'error'); }
  };
  const bab = $('#sn-bulk-approve'); if(bab) bab.onclick = () => {
    if(ME.handler !== 1 && ME.role !== 'admin'){ openHandlerPin(() => bulkProceed('approve')); return; }
    bulkProceed('approve');
  };
  const brb = $('#sn-bulk-reject'); if(brb) brb.onclick = () => {
    if(ME.handler !== 1 && ME.role !== 'admin'){ openHandlerPin(() => bulkProceed('reject')); return; }
    bulkProceed('reject');
  };
}

/* ===== Googleカレンダー連携の詳しいやり方ページ ===== */
async function pageCalendarGuide(app){
  let token = null;
  try{ const r = await api('/calendar-token'); token = r.token; }catch(e){}
  const url = token ? `${location.origin}/api/calendar/${token}.ics` : null;

  app.innerHTML = `
  <h2 style="margin-bottom:4px">${icon('calendar')} カレンダー連携のやり方</h2>

  <div class="card" style="margin-bottom:16px">
    <h3 style="margin-bottom:8px">① まずは自分専用のURLを発行</h3>
    ${token ? `
      <div class="row" style="gap:6px">
        <input id="cg-url" readonly value="${h(url)}" style="flex:1;min-width:0;font-family:monospace;font-size:12px">
        <button class="btn ghost sm" id="cg-copy">コピー</button>
      </div>

      <button class="btn danger sm" id="cg-regen" style="margin-top:10px">URLを再発行する(このURLを無効化)</button>
    ` : `
      <button class="btn gold" id="cg-start">URLを発行する</button>
    `}
  </div>

  <div class="card" style="margin-bottom:16px">
    <h3 style="margin-bottom:10px">② カレンダーアプリに登録する</h3>

    <div class="cg-step">
      <div class="cg-step-title">${icon('circleFilled')} Googleカレンダーの場合</div>
      <div class="muted" style="margin-bottom:6px">${icon('clockWarn')} この設定は<b>パソコンのブラウザ</b>からのみ行えます(スマホアプリからは登録できません)。一度パソコンで登録すれば、以降はスマホのGoogleカレンダーアプリにも自動的に表示されます。</div>
      <ol class="cg-ol">
        <li>パソコンのブラウザで <a href="https://calendar.google.com" target="_blank" rel="noopener">Googleカレンダー</a> を開く</li>
        <li>画面左側「他のカレンダー」の横にある <b>＋</b> をクリック</li>
        <li>「<b>URLで追加</b>」を選択</li>
        <li>①で発行したURLを貼り付けて「<b>カレンダーを追加</b>」をクリック</li>
        <li>数分〜数時間後、左側の「他のカレンダー」に表示されます</li>
      </ol>
    </div>

    <div class="cg-step">
      <div class="cg-step-title">${icon('circle')} Outlookの場合</div>
      <ol class="cg-ol">
        <li>Outlook(Web版またはアプリ)を開く</li>
        <li>カレンダー画面で「<b>カレンダーの追加</b>」→「<b>インターネットから購読</b>」を選択</li>
        <li>①で発行したURLを貼り付けて「<b>インポート</b>」をクリック</li>
      </ol>
    </div>

    <div class="cg-step">
      <div class="cg-step-title">${icon('circle')} Apple カレンダー(iPhone/iPad)の場合</div>
      <ol class="cg-ol">
        <li>「設定」アプリを開く</li>
        <li>「<b>カレンダー</b>」→「<b>アカウント</b>」→「<b>アカウントを追加</b>」</li>
        <li>「<b>その他</b>」→「<b>購読カレンダーを追加</b>」</li>
        <li>①で発行したURLを貼り付けて「<b>次へ</b>」をタップ</li>
      </ol>
    </div>

    <div class="cg-step">
      <div class="cg-step-title">${icon('circle')} Apple カレンダー(Mac)の場合</div>
      <ol class="cg-ol">
        <li>カレンダーアプリを開く</li>
        <li>メニューバー「<b>ファイル</b>」→「<b>新規カレンダー購読</b>」</li>
        <li>①で発行したURLを貼り付けて「<b>登録</b>」をクリック</li>
      </ol>
    </div>
  </div>

  <div class="card">
    <h3 style="margin-bottom:6px">よくある質問</h3>
    <div class="drow"><span class="dk">反映が遅い</span><span class="dv">カレンダーアプリ側が数時間〜半日おきにしかURLを再取得しないため、即時反映はされません。これは仕様上の制限です。</span></div>
    <div class="drow"><span class="dk">向こうから編集できる？</span><span class="dv">できません。このカレンダーは「見るだけ」の一方向連携です。スケジュールの変更は、引き続きこのアプリから行ってください。</span></div>
    <div class="drow"><span class="dk">URLを間違えて共有した</span><span class="dv">上の「URLを再発行する」で古いURLを無効化できます。再発行後は、カレンダーアプリ側で新しいURLに登録し直してください。</span></div>
  </div>`;

  const wireCopy = () => {
    const cp = $('#cg-copy');
    if(cp) cp.onclick = () => {
      navigator.clipboard.writeText(url).then(()=>popup('コピーしました')).catch(()=>{
        $('#cg-url').select(); document.execCommand('copy'); popup('コピーしました');
      });
    };
    const rg = $('#cg-regen');
    if(rg) rg.onclick = async () => {
      if(!confirm('URLを再発行しますか？古いURLは使えなくなり、カレンダーアプリ側で登録し直す必要があります。')) return;
      await withLoading(rg, async () => {
        try{ await api('/calendar-token/regenerate', { method:'POST' }); popup('再発行しました'); pageCalendarGuide(app); }
        catch(e){ popup(e.message,'error'); }
      });
    };
  };
  const st = $('#cg-start');
  if(st) st.onclick = async () => {
    await withLoading(st, async () => {
      try{ await api('/calendar-token', { method:'POST' }); pageCalendarGuide(app); }
      catch(e){ popup(e.message,'error'); }
    });
  };
  wireCopy();
}

// 管理者ダッシュボード。自動処理の稼働状況、承認待ち、月次サマリー、
// 気になる人、昇格予定、データ不備、給与ロック状況を1画面に集約する。
async function pageDashboard(app){
  if(!has('dashboard_view')){ notFound(app); return; }
  app.innerHTML = `<div class="loading-box"><span class="spinner"></span>読み込み中…</div>`;
  let data;
  try{ data = await api('/dashboard'); }
  catch(e){ app.innerHTML = `<div class="msg err">${h(e.message)}</div>`; return; }

  const jobLabel = (key, pcLabel, spLabel) => `<span class="dash-pc-only">${pcLabel}</span><span class="dash-sp-only">${spLabel}</span>`;
  const jobShort = { daicho:'台帳取込', schedSources:'予定表取込', rankPromotion:'ランク昇格', notify:'リマインド' };
  // 異常時、そのジョブを手動実行・確認できる画面へ直接飛べるようにする(権限がない場合はリンクにしない)。
  // ランク昇格は手動実行UIが存在しないため対象外。
  const jobLink = {
    daicho: has('import_data') ? '#/import' : null,
    schedSources: has('wage_settings') ? '#/sched-sources' : null,
    notify: has('wage_settings') ? '#/admin-settings' : null,
  };
  const diffStr = (n) => n == null ? '' : (n > 0 ? `+${n}` : (n < 0 ? `${n}` : '±0'));
  const diffCls = (n) => n > 0 ? 'dash-up' : (n < 0 ? 'dash-down' : '');

  app.innerHTML = `
  <div class="dash-wrap">
    <h2 style="display:flex;align-items:center;gap:8px;margin-bottom:3px">${icon('gauge')} ダッシュボード</h2>
    <div class="dash-sub">${jstToday()} 時点</div>

    <div class="dash-card dash-status ${data.systemStatus.hasIssue?'bad':''}">
      <div class="dash-status-badge">${icon(data.systemStatus.hasIssue?'alertTriangle':'checkCircle',{size:'18px'})} ${data.systemStatus.hasIssue?'1件以上の異常':'すべて正常'}</div>
      <div class="dash-status-sub">${data.systemStatus.hasIssue?'自動処理のうち一部が24時間以上動いていません':'自動処理はすべて正常に動作しています'}</div>
      <div class="dash-jobs">
        ${data.systemStatus.jobs.map(j=>{
          const link = j.bad ? jobLink[j.key] : null;
          const tag = link ? 'a' : 'div';
          return `<${tag} ${link?`href="${link}"`:''} class="dash-job ${j.bad?'bad':''} ${link?'linked':''}">
          <span class="dash-dot"></span>
          <span class="dash-nm">${jobLabel(j.key, j.label, jobShort[j.key]||j.label)}</span>
          <span class="dash-tm">${h(j.lastRun||'未実行')}</span>
          <span class="dash-rs">${j.bad?(j.lastRun?'実行が滞っています':'未実行です'):'正常'}</span>
          ${link?icon('arrowRight',{size:'12px'}):''}
        </${tag}>${j.bad && j.detail ? `<div class="dash-job-detail">${h(j.detail)}</div>` : ''}`;
        }).join('')}
      </div>
    </div>

    <div class="dash-card">
      <div class="dash-card-h"><div class="dash-card-t">${icon('inbox')} 対応が必要</div><span></span></div>
      <div class="dash-todo">
        ${data.todo.selfReports.count?`<a href="#/self-reports" class="dash-todo-row ${data.todo.selfReports.maxDays>=3?'urgent':''}">
          <div class="dash-todo-ic">${icon('mail',{size:'15px'})}</div>
          <div><div class="dash-todo-l">${jobLabel('sr','現場変更報告の承認','現場変更の承認')}</div><div class="dash-todo-s">最長${data.todo.selfReports.maxDays}日待ち</div></div>
          <div class="dash-todo-n">${data.todo.selfReports.count}</div>
          ${icon('arrowRight',{size:'14px'})}
        </a>`:''}
        ${data.todo.nominations.count?`<a href="#/nominations" class="dash-todo-row ${data.todo.nominations.maxDays>=3?'urgent':''}">
          <div class="dash-todo-ic">${icon('user',{size:'15px'})}</div>
          <div><div class="dash-todo-l">${jobLabel('nm','メンバー指名の承認','指名の承認')}</div><div class="dash-todo-s">最長${data.todo.nominations.maxDays}日待ち</div></div>
          <div class="dash-todo-n">${data.todo.nominations.count}</div>
          ${icon('arrowRight',{size:'14px'})}
        </a>`:''}
        ${data.todo.reportChecks.count?`<a href="#/reports" class="dash-todo-row">
          <div class="dash-todo-ic">${icon('fileText',{size:'15px'})}</div>
          <div><div class="dash-todo-l">${jobLabel('rc','新人報告の2次チェック','2次チェック')}</div><div class="dash-todo-s">未チェック</div></div>
          <div class="dash-todo-n">${data.todo.reportChecks.count}</div>
          ${icon('arrowRight',{size:'14px'})}
        </a>`:''}
        ${(!data.todo.selfReports.count && !data.todo.nominations.count && !data.todo.reportChecks.count)?'<div class="dash-todo-empty">対応が必要なものはありません</div>':''}
      </div>
    </div>

    <div class="dash-card">
      <div class="dash-card-h"><div class="dash-card-t">${icon('barChart')} 今月の状況(${data.monthly.month.slice(5)}月)</div><span class="dash-card-more">前月比</span></div>
      <div class="dash-kpis">
        <div class="dash-kpi"><div class="dash-kpi-n" data-count="${data.monthly.sites}">0</div><div class="dash-kpi-l">現場数</div><div class="dash-kpi-d ${diffCls(data.monthly.diffSites)}">${diffStr(data.monthly.diffSites)}</div></div>
        <div class="dash-kpi"><div class="dash-kpi-n" data-count="${data.monthly.headcount}">0</div><div class="dash-kpi-l">のべ人数</div><div class="dash-kpi-d ${diffCls(data.monthly.diffHeadcount)}">${diffStr(data.monthly.diffHeadcount)}</div></div>
        <div class="dash-kpi"><div class="dash-kpi-n" data-count="${data.monthly.hours}">0</div><div class="dash-kpi-l">総稼働時間(h)</div><div class="dash-kpi-d ${diffCls(data.monthly.diffHours)}">${diffStr(data.monthly.diffHours)}</div></div>
        ${data.canPay?`<div class="dash-kpi"><div class="dash-kpi-n" data-count="${Math.round(data.monthly.pay/10000)}">0<span class="dash-kpi-u">万</span></div><div class="dash-kpi-l">給与見込み</div><div class="dash-kpi-d ${diffCls(data.monthly.diffPay)}">${data.monthly.diffPay==null?'':diffStr(Math.round(data.monthly.diffPay/10000))+'万'}</div></div>`:''}
      </div>
    </div>

    <div class="dash-cols">
      <div>
        <div class="dash-card">
          <div class="dash-card-h"><div class="dash-card-t">${icon('alertTriangle')} 気になる人</div><a href="#/summary" class="dash-card-more">稼働サマリーへ ${icon('arrowRight',{size:'12px'})}</a></div>
          <div class="dash-chips">
            <a href="#/summary" class="dash-chip ${data.attention.overTotal?'hot':''}"><span class="el">月100h超</span><span class="dash-c">${data.attention.overTotal}</span></a>
            <a href="#/summary" class="dash-chip ${data.attention.streak?'hot':''}"><span class="el">6連勤以上</span><span class="dash-c">${data.attention.streak}</span></a>
            <a href="#/summary" class="dash-chip"><span class="el">稼働少なめ</span><span class="dash-c">${data.attention.few}</span></a>
            <a href="#/summary" class="dash-chip"><span class="el">同じ現場ばかり</span><span class="dash-c">${data.attention.samesite}</span></a>
            <a href="#/summary" class="dash-chip"><span class="el">残業50h+</span><span class="dash-c">${data.attention.overtime}</span></a>
          </div>
        </div>

        <div class="dash-card">
          <div class="dash-card-h"><div class="dash-card-t">${icon('wrench')} データの不備</div><span></span></div>
          <div class="dash-warns">
            <a href="#/members" class="dash-warn-row">${icon('user',{size:'13px'})}<span class="dash-lbl">ランク未設定</span><span class="dash-c">${data.dataIssues.noRank}人</span></a>
            <a href="#/members" class="dash-warn-row">${icon('user',{size:'13px'})}<span class="dash-lbl">手配担当が未設定</span><span class="dash-c">${data.dataIssues.noManager}人</span></a>
            <a href="#/admin" class="dash-warn-row">${icon('clock',{size:'13px'})}<span class="dash-lbl">停止中だが予定あり</span><span class="dash-c">${data.dataIssues.suspendedButScheduled}人</span></a>
          </div>
        </div>
      </div>

      <div>
        <div class="dash-card">
          <div class="dash-card-h"><div class="dash-card-t">${icon('star')} 昇格予定</div><span class="dash-card-more">今月・来月</span></div>
          <div class="dash-plist">
            ${data.promotions.upcoming.map(p=>`<div class="dash-prow"><span class="dash-nm">${h(p.name)}</span><span class="dash-rankbadge">${h(p.from)} → ${h(p.to)}</span><span class="dash-dt">${h(p.date.slice(5).replace('-','/'))}</span></div>`).join('') || '<div class="dash-todo-empty">昇格予定はいません</div>'}
          </div>
          <div class="dash-pfoot">研修待ち:2部のみ ${data.promotions.waitingTeam2Only}人 / SUのみ ${data.promotions.waitingSuOnly}人</div>
        </div>

        <div class="dash-card">
          <div class="dash-card-h"><div class="dash-card-t">${icon('lock')} 給与の確定状況</div><span></span></div>
          <div class="dash-lockrow"><span class="el">確定済み</span><span class="dash-v">${h(data.payLock.lockedUntil)}まで</span></div>
          <div class="dash-lock-sub">未確定:${data.payLock.unlockedDays}日分</div>
        </div>
      </div>
    </div>
  </div>`;

  animateCounts(app);
}

async function pageHome(app){
  app.innerHTML = '<div class="card"><div class="loading-box"><span class="spinner"></span>読み込み中…</div></div>';
  const homeEditing = !!(PAGE_STATE.home && PAGE_STATE.home.editing);
  const today = jstToday();
  const month = today.slice(0,7);
  const isChief = LV[ME.role] >= 1;
  const isHandlerRole = LV[ME.role] >= 2;

  const [schedData, notifData, selfReports] = await Promise.all([
    api(`/schedule?uid=${ME.id}&month=${month}`).catch(()=>null),
    api('/notifications').catch(()=>({ items:[], unread:0 })),
    isHandlerRole ? api('/self-reports').catch(()=>[]) : Promise.resolve([]),
  ]);

  const entries = (schedData && schedData.entries) || {};
  const wdNames = '日月火水木金土';
  const dayCard = (date, label) => {
    const list = entries[date] || [];
    const works = list.filter(e => e.type === 'work');
    if (!works.length) {
      const off = list[0];
      const label2 = off && off.type !== 'work' ? ({off:'休暇',paid:'有給',ok:'1日OK',x:'×'}[off.type] || '') : '予定なし';
      return `<div class="home-day"><div class="home-day-label">${label}<span class="muted" style="font-weight:400"> ${h(date.slice(5))}</span></div><div class="muted">${h(label2)}</div></div>`;
    }
    return `<div class="home-day"><div class="home-day-label">${label}<span class="muted" style="font-weight:400"> ${h(date.slice(5))}</span></div>
      ${works.map(e=>`<div class="home-day-site">${h(e.site)}${e.venue?`<span class="muted"> ／ ${h(e.venue)}</span>`:''}${e.tin?`<span class="muted"> ${h(e.tin)}〜${h(e.tout||'')}</span>`:''}</div>`).join('')}
    </div>`;
  };
  // 今日から1週間分。スワイプ(横スクロール)で先の予定まで見られるようにする
  const days7 = Array.from({length:7}, (_,i) => {
    const d = new Date(Date.now() + 9*3600e3 + i*24*3600e3).toISOString().slice(0,10);
    const label = i===0 ? '今日' : i===1 ? '明日' : wdNames[new Date(d+'T00:00:00+09:00').getDay()]+'曜日';
    return dayCard(d, label);
  }).join('');

  const unreadCount = notifData.unread || 0;
  const pendingCount = selfReports.length;

  // 6番目の要素はホーム画面でのグルーピング用カテゴリ(通常表示時のみ、この単位で見出しを挟む)。
  const allMenuItems = [
    ['#/schedule','calendar','マイスケジュール', true, null, '個人'],
    ['#/availability','handRaise','休み希望', true, null, '個人'],
    ['#/report','fileText','新人報告', true, null, '個人'],
    ['#/reports','clipboardList','報告一覧', true, null, '個人'],

    ['#/edit','edit','スケジュール入力', ME.handler===1, 'handler', '手配・管理'],
    ['#/availability-team','calendarDays','チーム希望一覧', isHandlerRole, 'handler', '手配・管理'],
    ['#/nominate','user','メンバー指名', isChief, 'chief', '手配・管理'],
    ['#/nominations','checkCircle','指名の承認', isHandlerRole, 'handler', '手配・管理'],
    ['#/self-reports','mail','変更報告承認', isHandlerRole, 'handler', '手配・管理'],
    ['#/members/mine','briefcase',`${h(ME.name)}手配`, isHandlerRole, 'handler', '手配・管理'],
    ['#/import','download','スプレッド取込', has('import_data'), 'handler', '手配・管理'],

    ['#/sites','stadium','現場一覧', has('sites_view'), 'chief', '一覧・分析'],
    ['#/venues','mapPin','会場一覧', has('sites_view'), 'chief', '一覧・分析'],
    ['#/artists','megaphone','公演一覧', has('sites_view'), 'chief', '一覧・分析'],
    ['#/members','users','メンバー\n一覧', has('members_view'), 'chief', '一覧・分析'],
    ['#/summary','barChart','稼働サマリー', has('summary_view'), 'chief', '一覧・分析'],
    ['#/member-summary/search','barChart','個人の年間\nサマリー', has('member_summary_view'), 'handler', '一覧・分析'],
    ['#/member-stats','trendingUp','メンバー分析', has('member_stats_view'), 'chief', '一覧・分析'],
    ['#/day-schedule','layoutGrid','スケジュール一覧', has('day_schedule_view'), 'chief', '一覧・分析'],

    ['#/dashboard','gauge','ダッシュボード', has('dashboard_view'), 'admin', '管理者'],
    ['#/admin','shieldCheck','アカウント管理', has('account_manage'), 'admin', '管理者'],
  ].filter(m=>m[3]);
  const hidden = getHomeHidden();
  const menuItems = applyHomeOrder(allMenuItems.filter(m => !hidden.includes(m[0])));
  const hiddenItems = allMenuItems.filter(m => hidden.includes(m[0]));

  app.innerHTML = `
    <h2 style="margin-bottom:4px">こんにちは、${h(ME.name)}さん</h2>
    <div class="muted" style="margin-bottom:16px">${h(today)} (${h('日月火水木金土'[new Date(today+'T00:00:00+09:00').getDay()])})</div>

    <div class="home-top-cards">
      <div class="card home-days-card">
        <div class="home-days-hint muted">◀ スワイプで1週間先まで見られます ▶</div>
        <div class="home-days">${days7}</div>
      </div>
      <div class="card home-stat-card">
        <button type="button" id="home-notif-btn" class="home-stat" style="border:none;background:none;cursor:pointer;width:100%;text-align:left">
          <span class="home-stat-num">${unreadCount}</span><span class="home-stat-label">${icon('bell',{size:'13px'})} 未読の通知</span>
        </button>
        ${isHandlerRole ? `<a href="#/self-reports" class="home-stat">
          <span class="home-stat-num">${pendingCount}</span><span class="home-stat-label">${icon('fileText',{size:'13px'})} 承認待ちの報告</span>
        </a>` : ''}
      </div>
    </div>

    <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px">
      <div class="muted" style="font-size:12px">${homeEditing?`長押し(またはドラッグ)で並び替え、${icon('x',{size:'10px'})}で非表示にできます`:''}</div>
      <button class="btn ghost sm" id="home-edit-toggle">${homeEditing?'完了':icon('edit',{size:'13px'})+' 編集'}</button>
    </div>
    <div class="home-menu" id="home-menu-grid">
      ${renderHomeMenuItems(menuItems, homeEditing)}
      ${homeEditing?`<button class="home-menu-btn home-menu-add" id="home-menu-add-btn" type="button"><span class="home-menu-icon">${icon('plus',{size:'22px'})}</span><span>追加</span></button>`:''}
    </div>`;

  const notifBtn = $('#home-notif-btn');
  if(notifBtn) notifBtn.onclick = () => openNotifDropdown();

  // ホーム画面を開くたびショートカットが順に軽く浮かび上がる(編集モード中はドラッグ用の
  // wiggleアニメーションと animation プロパティが競合するため、通常表示時のみ適用)
  if(!homeEditing) staggerRows(app, '.home-menu-btn');

  const editToggle = $('#home-edit-toggle');
  editToggle.onclick = () => { PAGE_STATE.home = PAGE_STATE.home||{}; PAGE_STATE.home.editing = !homeEditing; pageHome(app); };

  if(homeEditing){
    // 削除(非表示化)
    $('#home-menu-grid').querySelectorAll('.home-menu-remove').forEach(b => b.onclick = (e) => {
      e.preventDefault(); e.stopPropagation();
      const hash = b.dataset.hash;
      const h2 = getHomeHidden();
      if(!h2.includes(hash)) h2.push(hash);
      setHomeHidden(h2);
      pageHome(app);
    });
    // 追加(非表示リストから選んで復活)
    const addBtn = $('#home-menu-add-btn');
    if(addBtn) addBtn.onclick = () => {
      if(!hiddenItems.length){ popup('非表示にしている項目がありません'); return; }
      modal(`<h3>ショートカットを追加</h3>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${hiddenItems.map(([hash,iconName,label])=>`<button class="btn ghost home-add-item" data-hash="${hash}" style="text-align:left;display:flex;align-items:center;gap:10px"><span style="font-size:18px">${icon(iconName,{size:'18px'})}</span>${h(label)}</button>`).join('')}
        </div>`);
      document.querySelectorAll('.home-add-item').forEach(b => b.onclick = () => {
        const hash = b.dataset.hash;
        setHomeHidden(getHomeHidden().filter(x => x !== hash));
        closeModal(); pageHome(app);
      });
    };
    // ドラッグ&ドロップでの並び替え(Pointer Eventsでマウス・タッチ両対応)
    enableHomeDragSort($('#home-menu-grid'));
  }
}
// ホーム画面の編集モードで、ショートカットをドラッグして並び替えられるようにする(Pointer Events使用)。
function enableHomeDragSort(container){
  if(!container) return;
  let dragEl = null, pointerId = null, startX = 0, startY = 0;
  const items = () => Array.from(container.querySelectorAll('.home-menu-btn:not(.home-menu-add)'));

  // FLIP技法: 並び替え直前の各要素の位置を記録しておく
  const recordPositions = () => {
    const map = new Map();
    items().forEach(el => { if(el !== dragEl) map.set(el, el.getBoundingClientRect()); });
    return map;
  };
  // 記録しておいた「直前の位置」と「並び替え後の位置」の差分だけ逆方向にずらした状態から、
  // 0へアニメーションさせることで、瞬間移動(ジャンプ)ではなく滑らかな移動に見せる。
  // 短時間に連続してスワップが起きると、前回セットしたrAFが実行される前に上書きされ、
  // transformがリセットされないまま残ってしまうことがあるため、要素ごとに前回分をキャンセルする。
  const playFlip = (before) => {
    items().forEach(el => {
      if(el === dragEl) return;
      const b = before.get(el);
      if(!b) return;
      const a = el.getBoundingClientRect();
      const dx = b.left - a.left, dy = b.top - a.top;
      if(el._flipRaf){ cancelAnimationFrame(el._flipRaf); el._flipRaf = null; }
      if(!dx && !dy){ el.style.transition = ''; el.style.transform = ''; return; }
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px,${dy}px)`;
      el._flipRaf = requestAnimationFrame(() => {
        el.style.transition = 'transform .32s cubic-bezier(.16,1,.3,1)';
        el.style.transform = '';
        el._flipRaf = null;
      });
    });
  };

  container.querySelectorAll('.home-menu-btn:not(.home-menu-add)').forEach(el => {
    el.addEventListener('pointerdown', (e) => {
      if(e.target.closest('.home-menu-remove')) return;
      dragEl = el; pointerId = e.pointerId;
      el.setPointerCapture(pointerId);
      el.classList.add('dragging');
      el.style.transition = 'none'; // ドラッグ中は指に1:1で追従させるため、遅延なしにする
      startX = e.clientX; startY = e.clientY;
      e.preventDefault();
    });
    el.addEventListener('pointermove', (e) => {
      if(dragEl !== el) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      el.style.transform = `translate(${dx}px,${dy}px) scale(1.08)`;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
      for(const other of items()){
        if(other === el) continue;
        const r = other.getBoundingClientRect();
        if(cx > r.left && cx < r.right && cy > r.top && cy < r.bottom){
          const before = cx < r.left + r.width/2;
          const positionsBefore = recordPositions();
          container.insertBefore(el, before ? other : other.nextSibling);
          playFlip(positionsBefore);
          break;
        }
      }
    });
    const end = (e) => {
      if(dragEl !== el) return;
      try{ el.releasePointerCapture(pointerId); }catch(_){}
      el.classList.remove('dragging');
      // 最終位置へ、わずかに弾むスプリング風のイージングで着地させる。
      // 着地アニメーション中はwiggle(編集モードの揺れ)と重ならないよう一時的に止める。
      el.style.animation = 'none';
      el.style.transition = 'transform .4s cubic-bezier(.34,1.4,.64,1)';
      el.style.transform = '';
      dragEl = null;
      // 安全策: 短時間の連続スワップでtransformが正しくリセットされずに残ってしまった
      // 他のカードが無いか、ドロップ確定のタイミングで念のため全件クリアする。
      items().forEach(other => {
        if(other === el) return;
        if(other._flipRaf){ cancelAnimationFrame(other._flipRaf); other._flipRaf = null; }
        other.style.transition = '';
        other.style.transform = '';
      });
      setHomeOrder(items().map(x => x.dataset.hash));
      setTimeout(() => { el.style.transition = ''; el.style.animation = ''; }, 420);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    // DOM順序の変更(insertBefore)でポインターキャプチャが失われることがあり、
    // その場合pointerupが届かずtransformが残ったまま(カードが浮いた状態)になってしまう。
    // キャプチャ喪失を検知して確実にクリーンアップする。
    el.addEventListener('lostpointercapture', end);
  });
}

async function pageSchedule(app, hash){
  const m = hash.match(/^#\/schedule\/(\d+)/);
  const uid = m ? Number(m[1]) : ME.id;
  const d = await api(`/schedule?uid=${uid}&month=${MONTH}`);
  const u = d.user;
  const [y, mo] = MONTH.split('-').map(Number);
  const days = new Date(y, mo, 0).getDate();
  const rookieMap = {};
  for(const r of d.rookies||[]) (rookieMap[r.next_date+'|'+r.next_site] ||= []).push(r.candidate_name);

  let workDays=0, offDays=0, sumH=0, sumOT=0, sumPay=0, rows='', mrows='';
  const today = jstToday(); // 今日(YYYY-MM-DD)。該当日を強調表示する
  const canPlan = LV[ME.role] >= 1; // チーフ以上は育成計画を編集可
  const canPay = d.canSeePay;       // 手配担当以上のみ 時間・給与・IN・OUT を閲覧可
  const canRecord = (uid === ME.id) || ME.role === 'admin'; // 現場記録は本人と管理者のみ閲覧・編集可
  const plans = d.plans || {};
  const multi = arr => arr.map(x=>h(x||'')||'&nbsp;').join('<br>'); // 複数現場を改行で重ねる
  // 現場名・会場・備考・育成計画は、長くなるとセルが縦に伸びて崩れるため、1行を保ちつつ
  // 一定の長さを超えたらフォントを少し小さくして読みやすさを保つ。
  const longCls = (text, threshold) => (text && String(text).length > threshold) ? ' text-long' : '';
  // 育成計画セル(日単位)
  const planCell = (date) => {
    const pv = plans[date] || '';
    return `<td class="plan-cell${longCls(pv,15)}" data-date="${date}" data-plan="${h(pv)}" title="${canPlan?'タップで育成計画を編集':''}">${h(pv)}${canPlan?` <span class="plan-edit">${icon('edit',{size:'12px'})}</span>`:''}</td>`;
  };
  for(let i=1;i<=days;i++){
    const date = `${MONTH}-${pad(i)}`;
    const w = new Date(y, mo-1, i).getDay();
    const list = d.entries[date]; // 配列 or undefined
    const wdCls = w===0?'sun':w===6?'sat':'';
    const planVal = plans[date] || '';
    let cells, mBody='', mCls='';   // mBody=スマホ用の内容, mCls=行の種別クラス
    if(!list || !list.length){
      cells = `<td></td><td></td>${canPay?'<td></td><td></td><td></td><td></td><td></td>':''}<td></td>${planCell(date)}`;
      mCls = 'm-empty';
      mBody = `<span class="m-none">予定なし</span>`;
    } else if(list[0].type==='work'){
      // 現場(複数可)
      workDays++;
      const sites=[], venues=[], dutys=[], tins=[], touts=[], hrs=[], ots=[], pays=[], notes=[];
      const mSites=[];
      for(const e of list){
        sumH+=e.hours; sumOT+=e.overtime; sumPay+=e.pay;
        const rk = (LV[ME.role]>=1 ? (rookieMap[date+'|'+e.site]||[]) : []).map(n=>`<span class="tt" data-tip="新人報告で、この現場に来る予定と共有されている人です"><span class="rookie-badge">${icon('badge',{size:'10px'})}${h(n)}</span></span>`).join('');
        sites.push(`<span class="site-cell${longCls(e.site,10)}" data-date="${date}" data-site="${h(e.site)}" title="タップで同じ現場のメンバーを表示">${h(e.site)}${rk}</span>${canRecord?` <span class="rec-btn" data-date="${date}" data-site="${h(e.site)}" title="現場記録を記入${e.breakShort?'(休憩時間が目安に届いていません)':''}">${icon('fileText',{size:'12px'})}${e.breakShort?icon('clockWarn',{size:'12px'}):''}</span>`:''}`);
        venues.push(`<span class="venue-cell${longCls(e.venue,12)}" data-venue="${h(e.venue)}" title="タップでGoogleマップ${(e.load_end||e.show_end)?` ／ 搬入終了${h(e.load_end)||'—'} ／ 終演${h(e.show_end)||'—'}`:''}">${h(e.venue)}</span>${(e.load_end||e.show_end)?`<span class="loadshow-tag" title="搬入終了${h(e.load_end)||'—'} ／ 終演${h(e.show_end)||'—'}">${icon('clock',{size:'12px'})}</span>`:''}`);
        dutys.push(e.duty?h(e.duty):'<span class="muted">—</span>');
        tins.push(h(e.tin)); touts.push(h(e.tout));
        hrs.push(e.hours?e.hours.toFixed(2):''); ots.push(e.overtime?e.overtime.toFixed(2):'');
        pays.push(e.pay?e.pay.toLocaleString():''); if(e.note) notes.push(e.note);
        // スマホ用:1現場ぶんのブロック
        const dutyPart = canPay && e.duty ? `<div class="m-line"><span class="m-k">業務</span><span class="m-v">${h(e.duty)}</span></div>` : '';
        const timePart = canPay && (e.tin||e.tout) ? `<div class="m-line"><span class="m-k">時間</span><span class="m-v">${h(e.tin)}〜${h(e.tout)}${e.hours?`(${e.hours.toFixed(1)}h)`:''}</span></div>` : '';
        const loadShowPart = (e.load_end||e.show_end) ? `<div class="m-line"><span class="m-k">搬入終了/終演</span><span class="m-v">${h(e.load_end)||'—'} / ${h(e.show_end)||'—'}</span></div>` : '';
        const payPart = canPay && e.pay ? `<div class="m-line"><span class="m-k">給与</span><span class="m-v">${yen(e.pay)}${e.overtime?` / 残業${e.overtime.toFixed(2)}h`:''}</span></div>` : '';
        const notePart = e.note ? `<div class="m-line"><span class="m-k">備考</span><span class="m-v">${h(e.note)}</span></div>` : '';
        mSites.push(`<div class="m-site">
          <div class="m-sitename${longCls(e.site,14)}"><span class="site-cell" data-date="${date}" data-site="${h(e.site)}">${h(e.site)}</span>${rk}${canRecord?` <span class="rec-btn" data-date="${date}" data-site="${h(e.site)}">${icon('fileText',{size:'12px'})}記録${e.breakShort?' '+icon('clockWarn',{size:'12px'}):''}</span>`:''}</div>
          ${e.venue?`<div class="m-line"><span class="m-k">会場</span><span class="m-v${longCls(e.venue,16)}"><span class="venue-cell" data-venue="${h(e.venue)}">${h(e.venue)}</span></span></div>`:''}
          ${loadShowPart}
          ${dutyPart}${timePart}${payPart}${notePart}
        </div>`);
      }
      const payPart = canPay ? `<td class="c duty-col">${dutys.join('<br>')}</td><td class="c">${tins.join('<br>')}</td><td class="c">${touts.join('<br>')}</td>
        <td class="r">${hrs.join('<br>')}</td><td class="r">${ots.join('<br>')}</td><td class="r">${pays.join('<br>')}</td>` : '';
      cells = `<td class="site-multi">${sites.join('<br>')}</td><td class="venue-multi">${venues.join('<br>')}</td>
        ${payPart}<td class="note-cell${longCls(notes.join(''),15)}">${multi(notes.length?notes:[''])}</td>${planCell(date)}`;
      mCls = 'm-work';
      mBody = mSites.join('');
    } else {
      const e = list[0];
      const label = e.type==='off'?'休暇':e.type==='paid'?'有給休暇':e.type==='ok'?'1日OK':'×';
      if(e.type==='off'||e.type==='paid') offDays++;
      sumH+=e.hours||0; sumPay+=e.pay||0;
      const payPart = canPay ? `<td></td><td class="c">${h(e.tin)}</td><td class="c">${h(e.tout)}</td>
        <td class="r">${e.hours?e.hours.toFixed(2):''}</td><td></td><td class="r">${e.pay?e.pay.toLocaleString():''}</td>` : '';
      cells = `<td class="off-cell off-${e.type}">${label}</td><td></td>${payPart}<td class="note-cell${longCls(e.note,15)}">${h(e.note||'')}</td>${planCell(date)}`;
      mCls = 'm-off m-'+e.type;
      mBody = `<span class="m-off-label">${label}</span>${e.note?`<div class="m-line"><span class="m-k">備考</span><span class="m-v">${h(e.note)}</span></div>`:''}`;
    }
    rows += `<tr class="${date===today?'is-today':''}"><td class="day">${i}${date===today?'<span class="today-pill">今日</span>':''}</td><td class="wd ${wdCls}">${WD[w]}</td>${cells}</tr>`;
    // スマホ用 日リスト行(育成は:予定がある日、または既に入力済みの日のみ表示)
    const hasContent = !!(list && list.length);
    const showPlan = canPlan && (hasContent || planVal);
    const planM = showPlan ? `<div class="m-line m-plan" data-date="${date}" data-plan="${h(planVal)}"><span class="m-k">育成</span><span class="m-v">${h(planVal)||'<span class="muted">（未入力）</span>'}${canPlan?` <span class="plan-edit">${icon('edit',{size:'12px'})}</span>`:''}</span></div>` : '';
    mrows += `<div class="m-day ${mCls} ${date===today?'is-today':''}">
      <div class="m-date ${wdCls}"><span class="m-dnum">${i}</span><span class="m-dwd">${WD[w]}</span>${date===today?'<span class="today-pill">今日</span>':''}</div>
      <div class="m-content">${mBody}${planM}</div>
    </div>`;
  }

  const others = LV[ME.role]>=1 ? `<button class="btn ghost sm" id="pick-user">他のメンバーを見る ▾</button>` : '';
  const histBtn = LV[ME.role]>=2 ? `<button class="btn ghost sm" id="view-history">${icon('fileText')} 変更履歴</button>` : '';
  const calSyncBtn = uid===ME.id ? `<button class="btn ghost sm" id="cal-sync">${icon('calendar')} カレンダー連携</button>` : '';
  const venueListBtn = has('sites_view') ? `<button class="btn ghost sm" id="member-venue-list">${icon('mapPin')} 行った会場</button>` : '';
  const artistListBtn = has('sites_view') ? `<button class="btn ghost sm" id="member-artist-list">${icon('megaphone')} 行った公演</button>` : '';
  app.innerHTML = `
  <h2>${h(u.name)} のスケジュール ${uid!==ME.id?'<span class="muted">(閲覧中)</span>':''}</h2>
  <div class="card">
    <div class="row sticky-filters" style="justify-content:space-between">
      <div class="month-nav">
        <button class="btn ghost sm" id="prev-m">◀</button>
        <div class="mtitle" id="jump-month-btn" title="タップして年月を選択" style="cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px">${y}年 ${mo}月</div>
        <button class="btn ghost sm" id="next-m">▶</button>
      </div>
      <div class="muted">${h(u.regno)} / ${h(u.rank)} / ${h(u.han)} / ${h(u.station)}</div>
    </div>
    <div class="row" style="margin-bottom:12px;gap:8px">
      ${venueListBtn}
      ${artistListBtn}
      ${others}
      ${histBtn}
      ${calSyncBtn}
    </div>
    ${has('sites_view') ? `<div class="row" style="margin-bottom:6px;gap:8px;flex-wrap:wrap">
      <input id="sched-search-q" placeholder="現場名・会場名・公演名で検索" style="flex:2;min-width:100%;box-sizing:border-box">
      <input id="sched-search-date" placeholder="日付(例:8/15、8月、2024-08)" style="flex:1;min-width:100%;box-sizing:border-box">
    </div>
    <div id="sched-search-results" style="margin-bottom:12px"></div>` : ''}
    <div class="sched-wrap pc-only">
      <table class="sched">
        <thead><tr><th>日</th><th>曜</th><th>現場名</th><th>会場</th>${canPay?'<th>業務</th><th>IN</th><th>OUT</th><th>時間</th><th>時間外</th><th>給与</th>':''}<th>備考</th><th>育成計画</th></tr></thead>
        <tbody>${rows}
        <tr class="total-row">
          <td colspan="2" class="c">合計</td>
          <td>現場日数 ${workDays}日</td>
          <td>休暇日数 ${offDays}日</td>
          ${canPay?`<td></td><td colspan="2" class="c red-num">${sumH.toFixed(1)}時間</td>
          <td class="c red-num">残業${sumOT.toFixed(2)}h</td>
          <td colspan="2" class="r red-num">${yen(sumPay)}</td>`:''}
          <td></td><td></td>
        </tr></tbody>
      </table>
    </div>
    <div class="sched-mobile sp-only">
      ${mrows}
      <div class="m-total">
        <div>現場 <b>${workDays}</b>日 / 休暇 <b>${offDays}</b>日</div>
        ${canPay?`<div>合計 <b class="red-num">${sumH.toFixed(1)}時間</b>(残業${sumOT.toFixed(2)}h)</div><div>給与 <b class="red-num">${yen(sumPay)}</b></div>`:''}
      </div>
    </div>

  </div>
  ${has('member_summary_view') ? `<div id="sched-year-summary" style="margin-top:24px"></div>` : ''}`;

  $('#prev-m').onclick = () => { MONTH = shiftMonth(MONTH,-1); render(); };
  $('#next-m').onclick = () => { MONTH = shiftMonth(MONTH, 1); render(); };
  $('#jump-month-btn').onclick = () => {
    openMonthJumpModal(MONTH, (ym) => { MONTH = ym; render(); });
  };
  const vh = $('#view-history');
  if(vh) vh.onclick = () => openScheduleHistory(uid, u.name);
  const cs = $('#cal-sync');
  if(cs) cs.onclick = () => openCalendarSync();
  const mvl = $('#member-venue-list');
  if(mvl) mvl.onclick = () => openMemberVenueList(uid, u.name);
  const mal = $('#member-artist-list');
  if(mal) mal.onclick = () => openMemberArtistList(uid, u.name);
  if(has('sites_view')){
    let siteLog = null; // 初回検索時に一括取得してキャッシュ(個人単位のため件数は少ない)
    // 「8/15」「8月」「15日」「2024-08」等、月/日どちらか一方だけでも緩くマッチさせる
    const dateMatches = (dateStr, q) => {
      if(!q.trim()) return true;
      const nums = (q.match(/\d+/g)||[]).map(Number);
      if(!nums.length) return false;
      const [y,m,d] = dateStr.split('-').map(Number);
      if(nums.length>=2){
        if(nums[0]>=1900) return y===nums[0] && (nums[1]?m===nums[1]:true);
        return m===nums[0] && d===nums[1];
      }
      const n = nums[0];
      if(q.includes('月')) return m===n;
      if(q.includes('日')) return d===n;
      if(n>=1900) return y===n;
      return m===n || d===n;
    };
    const runSearch = async () => {
      const q = ($('#sched-search-q')?.value||'').trim().toLowerCase();
      const dq = ($('#sched-search-date')?.value||'').trim();
      const resEl = $('#sched-search-results');
      if(!resEl) return;
      if(!q && !dq){ resEl.innerHTML = ''; return; }
      if(!siteLog){
        resEl.innerHTML = `<div class="loading-box"><span class="spinner"></span>読み込み中…</div>`;
        try{ siteLog = await api(`/member-site-log?uid=${uid}`); }
        catch(e){ resEl.innerHTML = `<div class="msg err">${h(e.message)}</div>`; return; }
      }
      const matched = siteLog.filter(r =>
        (!q || r.site.toLowerCase().includes(q) || (r.venue||'').toLowerCase().includes(q) || r.artist.toLowerCase().includes(q)) &&
        dateMatches(r.date, dq)
      );
      resEl.innerHTML = `<div class="muted" style="font-size:12.5px;margin-bottom:6px">${matched.length}件</div>` + (matched.length ? matched.slice(0,200).map(r=>`
        <button type="button" class="btn ghost sm sched-search-item" data-date="${r.date}" data-site="${h(r.site)}" style="display:block;width:100%;text-align:left;margin-bottom:4px;white-space:normal">
          ${h(r.date)} ${h(r.site)}${r.venue?` <span class="muted">(${h(r.venue)})</span>`:''}
        </button>`).join('') : `<div class="muted" style="padding:8px 2px">該当する現場はありません</div>`);
      resEl.querySelectorAll('.sched-search-item').forEach(b => b.onclick = () => openSiteModal(b.dataset.date, b.dataset.site));
    };
    const debouncedSearch = debounce(runSearch, 300);
    const sq = $('#sched-search-q'), sd = $('#sched-search-date');
    if(sq) sq.oninput = debouncedSearch;
    if(sd) sd.oninput = debouncedSearch;
  }
  const pk = $('#pick-user');
  if(pk) pk.onclick = async () => {
    const [users, managers] = await Promise.all([getUsers(true), api('/managers')]);
    modal(`<h3>メンバーを選択</h3>
      <div class="form-grid" style="grid-template-columns:120px 1fr;max-width:460px">
        <label>担当手配者</label>
        <select id="mp-mgr"><option value="">▼ 選択してください</option>
          ${managers.map(m=>`<option value="${m.id}">${h(m.name)}手配(${m.count}名)</option>`).join('')}
          <option value="__none:1課">チーフ手配(1課)</option>
          <option value="__none:2課">チーフ手配(2課)</option>
          <option value="__all">全員から選ぶ</option>
        </select>
        <label>メンバー</label>
        <select id="mp-mem" disabled><option>担当手配者を選んでください</option></select>
      </div>
      <div class="row" style="margin-top:14px"><button class="btn gold" id="mp-go" disabled>表示する</button></div>`);
    const fill = () => {
      const mid = $('#mp-mgr').value;
      let list;
      if(mid==='') { $('#mp-mem').innerHTML='<option>担当手配者を選んでください</option>'; $('#mp-mem').disabled=true; $('#mp-go').disabled=true; return; }
      if(mid==='__all') list = users;
      else if(mid.startsWith('__none:')) list = users.filter(u=>!u.manager_id && u.ka===mid.slice(7));
      else list = users.filter(u=>String(u.manager_id)===String(mid));
      if(!list.length){ $('#mp-mem').innerHTML='<option value="">(該当メンバーなし)</option>'; $('#mp-mem').disabled=true; $('#mp-go').disabled=true; return; }
      $('#mp-mem').disabled=false; $('#mp-go').disabled=false;
      $('#mp-mem').innerHTML = list.map(u=>`<option value="${u.id}">${h(u.name)}(${h(u.regno)})</option>`).join('');
    };
    $('#mp-mgr').onchange = fill;
    $('#mp-go').onclick = () => { const v=$('#mp-mem').value; if(v){ closeModal(); location.hash='#/schedule/'+v; } };
  };

  app.querySelectorAll('.venue-cell').forEach(td => td.onclick = () => {
    if(td.dataset.venue) window.open('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(td.dataset.venue),'_blank');
  });
  if(canPlan){
    let planSaving = false; // td要素はdisabled化できないため、独自フラグで連打を防ぐ
    app.querySelectorAll('.plan-cell, .m-plan').forEach(td => td.onclick = async (ev) => {
      ev.stopPropagation();
      if(planSaving) return;
      const v = prompt(`${u.name} さん ${td.dataset.date} の育成計画`, td.dataset.plan || '');
      if(v==null) return;
      planSaving = true;
      try{
        await api('/schedule-plan', { method:'PUT', body:{ uid, date: td.dataset.date, plan: v } });
        render();
      }catch(e){ alert(e.message); }
      finally{ planSaving = false; }
    });
  }
  app.querySelectorAll('.site-cell').forEach(td => td.onclick = (ev) => { ev.stopPropagation(); openSiteModal(td.dataset.date, td.dataset.site); });
  if(canRecord){
    app.querySelectorAll('.rec-btn').forEach(td => td.onclick = (ev) => { ev.stopPropagation(); openSiteRecord(uid, u.name, td.dataset.date, td.dataset.site); });
  }

  // 手配者モード中:日付(行)タップで、このメンバーのその日に現場を追加/編集
  if(ME.handler === 1){
    const openDayEdit = (date) => openMemberDayEdit(uid, u, date);
    // PC:行の日・曜・備考など(現場名セル以外)をタップ
    app.querySelectorAll('table.sched tbody tr').forEach(tr => {
      if(tr.classList.contains('total-row')) return;
      const dcell = tr.querySelector('td.day');
      if(!dcell) return;
      const dnum = dcell.textContent.trim();
      const date = `${MONTH}-${pad(Number(dnum))}`;
      tr.classList.add('editable-row');
      tr.querySelectorAll('td').forEach(td => {
        if(td.classList.contains('site-multi')||td.classList.contains('plan-cell')) return;
        td.style.cursor='pointer';
        td.addEventListener('click', (ev)=>{ if(ev.target.closest('.venue-cell'))return; openDayEdit(date); });
      });
    });
    // スマホ:日カードタップ
    app.querySelectorAll('.sched-mobile .m-day').forEach((md,idx) => {
      const date = `${MONTH}-${pad(idx+1)}`;
      md.classList.add('editable-row');
      md.addEventListener('click', (ev)=>{
        if(ev.target.closest('.site-cell')||ev.target.closest('.venue-cell')||ev.target.closest('.m-plan'))return;
        openDayEdit(date);
      });
    });
    const hint = document.createElement('div');
    hint.className='muted'; hint.style.marginTop='6px';
    hint.innerHTML=`${icon('wrench',{size:'12px'})} 手配者モード:日付の行をタップ → この人のその日の現場を追加・編集できます`;
    app.querySelector('.card').appendChild(hint);
  } else if(uid === ME.id){
    // 手配者モードでなくても、本人は自分の日付をタップして「現場変更の報告」ができる
    // (手配担当者以外から直接「現場が変わった」と言われた場合の速報用。手配担当者へ自動で通知される)
    const openSelfReport = (date) => openScheduleSelfReport(date);
    app.querySelectorAll('table.sched tbody tr').forEach(tr => {
      if(tr.classList.contains('total-row')) return;
      const dcell = tr.querySelector('td.day');
      if(!dcell) return;
      const dnum = dcell.textContent.trim();
      const date = `${MONTH}-${pad(Number(dnum))}`;
      tr.classList.add('editable-row');
      tr.querySelectorAll('td').forEach(td => {
        if(td.classList.contains('site-multi')||td.classList.contains('plan-cell')) return;
        td.style.cursor='pointer';
        td.addEventListener('click', (ev)=>{ if(ev.target.closest('.venue-cell')||ev.target.closest('.rec-btn'))return; openSelfReport(date); });
      });
    });
    app.querySelectorAll('.sched-mobile .m-day').forEach((md,idx) => {
      const date = `${MONTH}-${pad(idx+1)}`;
      md.classList.add('editable-row');
      md.addEventListener('click', (ev)=>{
        if(ev.target.closest('.site-cell')||ev.target.closest('.venue-cell')||ev.target.closest('.m-plan')||ev.target.closest('.rec-btn'))return;
        openSelfReport(date);
      });
    });
    const hint = document.createElement('div');
    hint.className='muted'; hint.style.marginTop='6px';
    hint.innerHTML=`${icon('messageCircle',{size:'12px'})} 日付をタップ → 手配担当者以外から言われた現場変更を報告できます(自動で手配担当者に通知されます)`;
    app.querySelector('.card').appendChild(hint);
  }

  // マイスケジュール最下部に、個人の年間サマリーをあわせて表示する(閲覧権限はmember_summary_viewと同じ)。
  // メインのスケジュール表とは独立して、この区画だけ年送り・備考の追加/削除で再描画する。
  if(has('member_summary_view')){
    const ysSt = PAGE_STATE.scheduleYearSummary || (PAGE_STATE.scheduleYearSummary = {});
    if(ysSt.uid !== uid){ ysSt.uid = uid; ysSt.year = Number(jstToday().slice(0,4)) - (Number(jstToday().slice(5,7)) < 12 ? 1 : 0); }
    const renderInlineYearSummary = async () => {
      const container = $('#sched-year-summary');
      if(!container) return;
      container.innerHTML = `<div class="loading-box"><span class="spinner"></span>読み込み中…</div>`;
      let data, notesData;
      try{
        [data, notesData] = await Promise.all([
          api(`/member-year-summary?uid=${uid}&year=${ysSt.year}`),
          api(`/member-notes?uid=${uid}`),
        ]);
      }catch(e){ container.innerHTML = ''; return; }
      const canPayYS = has('site_pay');
      container.innerHTML = `<h2 style="margin-bottom:4px">${icon('barChart')} 年間サマリー</h2>${yearSummaryCardsHtml(data, notesData, canPayYS)}`;
      wireYearSummaryCards(uid, (delta)=>{ ysSt.year += delta; renderInlineYearSummary(); }, renderInlineYearSummary);
    };
    renderInlineYearSummary();
  }
}

// 手配者モード:特定メンバーの特定日の現場を追加・編集
const DUTIES = ['案内','受付・案内','準備','本部付','制作補助','運営補助','雑務','準備・設営','搬入','搬出','機材搬入','機材搬出','ステージハンド','搬入・案内','案内・搬出','パッケージ','ケータリング','物品販売'];
function isLockedDate(date){ const d=new Date(Date.now()+9*3600e3); d.setDate(d.getDate()-LOCK_DAYS); return String(date) <= d.toISOString().slice(0,10); }

// 本人が、手配担当者以外から直接聞いた現場変更をその場で報告する(自分のスケジュールのみ対象)。
// 保存すると必ず本来の手配担当者へ通知が届く。時刻・給与などの詳細はここでは入力しない
// (速報用。正式な内容は後で手配担当者が入力する想定)。
async function openScheduleSelfReport(date){
  let typeOptions;
  try{ typeOptions = await api('/report-type-options'); }
  catch(e){ typeOptions = [{type:'work',label:'現場に変更'},{type:'off',label:'休暇に変更'}]; }
  let existingAv = null;
  try{ const list = await api(`/availability?month=${date.slice(0,7)}`); existingAv = list.find(a=>a.date===date) || null; }catch(e){}

  const reportTabHtml = `
    <div class="form-grid" style="max-width:480px">
      <label>現場日 *</label><input type="date" id="sr-date" value="${h(date)}">
      <label>誰から言われたか *</label><input id="sr-toldby">
      <label>変更内容</label>
      <select id="sr-type">
        ${typeOptions.map(o=>`<option value="${h(o.type)}">${h(o.label)}</option>`).join('')}
      </select>
    </div>
    <div id="sr-site-fields" class="form-grid" style="max-width:480px;margin-top:8px">
      <label>現場名</label><input id="sr-site" placeholder="現場名(会場名とどちらか必須)">
      <label>会場名</label><input id="sr-venue" placeholder="会場名(現場名とどちらか必須)">
    </div>
    <div class="row" style="margin-top:14px">
      <button class="btn gold" id="sr-save" style="flex:1">保存する</button>
    </div>
`;

  const availTabHtml = `
    <div class="form-grid" style="max-width:480px">
      <label>希望日</label><span class="muted">${h(date)}</span>
      <label>種別</label>
      <select id="av-m-type">
        <option value="off" ${existingAv&&existingAv.type==='off'?'selected':''}>休み希望</option>
        <option value="available" ${existingAv&&existingAv.type==='available'?'selected':''}>稼働可能</option>
      </select>
    </div>
    <div id="av-m-detail" class="form-grid" style="max-width:480px;margin-top:8px;${existingAv&&existingAv.type==='available'?'':'display:none'}">
      <label>開始時刻</label><input type="time" id="av-m-from" value="${timeInputVal(existingAv&&existingAv.from_time)}">
      <label>終了時刻</label><input type="time" id="av-m-to" value="${timeInputVal(existingAv&&existingAv.to_time)}">
      <label>出発地点</label><input id="av-m-departure" value="${h(existingAv&&existingAv.departure||'')}" placeholder="どこから出発できるか(任意)">
    </div>
    <div class="row" style="margin-top:14px">
      <button class="btn gold" id="av-m-save" style="flex:1">保存する</button>
    </div>
`;

  modal(`<h3>${h(date)} の予定について</h3>
    <div class="row" style="margin-bottom:14px;gap:8px">
      <button class="btn gold sm" id="sr-tab-report" style="flex:1">${icon('megaphone')} 現場変更を報告</button>
      <button class="btn ghost sm" id="sr-tab-avail" style="flex:1">${icon('handRaise')} 休み希望・稼働時間</button>
    </div>
    <div id="sr-tab-content">${reportTabHtml}</div>`);

  const wireReportTab = () => {
    const typeSel = $('#sr-type');
    const siteFields = $('#sr-site-fields');
    if(!typeSel) return;
    typeSel.onchange = () => { siteFields.style.display = typeSel.value === 'work' ? '' : 'none'; };
    $('#sr-save').onclick = async () => {
      const date2 = $('#sr-date').value;
      const toldBy = $('#sr-toldby').value.trim();
      const type = typeSel.value;
      const site = $('#sr-site').value.trim();
      const venue = $('#sr-venue').value.trim();
      if(!date2){ popup('現場日を入力してください','error'); return; }
      if(!toldBy){ popup('誰から言われたかを入力してください','error'); return; }
      if(type==='work' && !site && !venue){ popup('現場名か会場名を入力してください','error'); return; }
      await withLoading($('#sr-save'), async () => {
        try{
          const r = await api('/schedule-self-report', { method:'POST', body:{ date:date2, toldBy, type, site, venue } });
          closeModal();
          popup(r.needsApproval ? '報告しました。手配担当者の承認後にスケジュールへ反映されます' : '報告しました。手配担当者に通知が届きます');
          render();
        }catch(e){ popup(e.message,'error'); }
      });
    };
  };

  const wireAvailTab = () => {
    const typeSel = $('#av-m-type');
    const detail = $('#av-m-detail');
    if(!typeSel) return;
    typeSel.onchange = () => { detail.style.display = typeSel.value === 'available' ? '' : 'none'; };
    $('#av-m-save').onclick = async () => {
      const type = typeSel.value;
      const fromTime = $('#av-m-from').value;
      const toTime = $('#av-m-to').value;
      const departure = $('#av-m-departure').value.trim();
      await withLoading($('#av-m-save'), async () => {
        try{
          await api('/availability', { method:'PUT', body:{ date, type, fromTime, toTime, departure } });
          closeModal();
          popup('休み希望・稼働時間を保存しました');
        }catch(e){ popup(e.message,'error'); }
      });
    };
  };

  $('#sr-tab-report').onclick = () => {
    $('#sr-tab-report').classList.replace('ghost','gold');
    $('#sr-tab-avail').classList.replace('gold','ghost');
    $('#sr-tab-content').innerHTML = reportTabHtml;
    wireReportTab();
  };
  $('#sr-tab-avail').onclick = () => {
    $('#sr-tab-avail').classList.replace('ghost','gold');
    $('#sr-tab-report').classList.replace('gold','ghost');
    $('#sr-tab-content').innerHTML = availTabHtml;
    wireAvailTab();
  };

  wireReportTab();
}

async function openMemberDayEdit(uid, u, date){
  if(ME.handler !== 1){ return; }
  if(isLockedDate(date) && ME.role !== 'admin'){ modal(`<h3>${h(u.name)} さん / ${h(date)}</h3><div class="msg" style="background:#fff6e5;border:1px solid #f0dca8;color:#8a5a00;padding:12px;border-radius:8px">この日は<b>給与確定済み</b>（現場日から2週間経過）のため編集できません。</div><div class="row" style="margin-top:12px"><button class="btn ghost" onclick="closeModal()">閉じる</button></div>`); return; }
  // その日の既存スロットを取得
  let existing = [];
  try{
    const d = await api(`/schedule?uid=${uid}&month=${date.slice(0,7)}`);
    existing = (d.entries && d.entries[date]) ? d.entries[date].filter(e=>e.type==='work') : [];
  }catch(e){}
  const slotRow = (s={}, i=0) => `<div class="md-slot" data-i="${i}">
    <div class="form-grid" style="grid-template-columns:64px 1fr;gap:6px 8px">
      <label>現場名</label><input class="md-site" value="${h(s.site||'')}" placeholder="例:NiziU">
      <label>会場</label><input class="md-venue" value="${h(s.venue||'')}" placeholder="例:京セラドーム大阪">
      <label>業務名</label><select class="md-duty">${DUTIES.map(d=>`<option ${String(s.duty||'案内')===d?'selected':''}>${d}</option>`).join('')}</select>
      <label>IN</label><input class="md-in" value="${h(s.tin||'')}" placeholder="9:00">
      <label>OUT</label><input class="md-out" value="${h(s.tout||'')}" placeholder="18:00">
      <label>搬入終了</label><input class="md-le" value="${h(s.load_end||'')}" placeholder="任意 例:10:30">
      <label>終演</label><input class="md-se" value="${h(s.show_end||'')}" placeholder="任意 例:20:00">
      <label>手当</label><label style="font-weight:400;font-size:13px;display:flex;align-items:center;gap:6px"><input type="checkbox" class="md-multi" ${s.multi?'checked':''} style="width:auto"> 2st(複数回公演 +¥500)</label>
      <label>備考</label><input class="md-note" value="${h(s.note||'')}" placeholder="例:物販頭">
    </div>
    <button class="btn ghost xs md-del" data-i="${i}">この現場を削除</button>
  </div>`;
  modal(`<h3>${h(u.name)} さん / ${h(date)}</h3>
    <div class="muted" style="margin-bottom:8px">この日の現場を追加・編集します(複数可)。業務名で給与が自動計算されます。</div>
    <div id="md-slots">${(existing.length?existing:[{}]).map((s,i)=>slotRow(s,i)).join('')}</div>
    <button class="btn ghost sm" id="md-add" style="margin-top:8px">＋ 現場をもう一つ追加</button>
    <div class="row" style="margin-top:14px;gap:8px">
      <button class="btn gold" id="md-save" style="flex:1">保存する</button>
    </div>
    <div class="row" style="margin-top:8px;gap:6px;align-items:center;flex-wrap:wrap">
      <span class="muted" style="font-size:12px">またはこの日を:</span>
      <button class="btn ghost sm md-status" data-t="ok">1日OK</button>
      <button class="btn ghost sm md-status" data-t="off">休暇</button>
      ${has('site_manage') ? `<button class="btn ghost sm md-status" data-t="paid">有給</button>` : ''}
      <button class="btn ghost sm md-status" data-t="x">×</button>
    </div>`);
  let idx = existing.length || 1;
  const bind = () => {
    document.querySelectorAll('#md-slots .md-del').forEach(b=>b.onclick=()=>{
      const slots=document.querySelectorAll('#md-slots .md-slot');
      if(slots.length<=1){ b.closest('.md-slot').querySelectorAll('input').forEach(i=>i.value=''); return; }
      b.closest('.md-slot').remove();
    });
  };
  bind();
  $('#md-add').onclick = () => { const div=document.createElement('div'); div.innerHTML=slotRow({},idx++); $('#md-slots').appendChild(div.firstElementChild); bind(); };
  $('#md-save').onclick = async () => {
    const slots=[];
    document.querySelectorAll('#md-slots .md-slot').forEach(s=>{
      const site=s.querySelector('.md-site').value.trim();
      if(!site) return;
      slots.push({type:'work',site,venue:s.querySelector('.md-venue').value.trim(),
        tin:s.querySelector('.md-in').value.trim(),tout:s.querySelector('.md-out').value.trim(),
        duty:s.querySelector('.md-duty').value,
        load_end:s.querySelector('.md-le').value.trim(),
        show_end:s.querySelector('.md-se').value.trim(),
        multi:s.querySelector('.md-multi').checked?1:0,
        note:s.querySelector('.md-note').value.trim()});
    });
    if(!slots.length){ popup('現場名を入力してください','error'); return; }
    await withLoading($('#md-save'), async () => {
      try{
        let r = await api('/schedule',{method:'PUT',body:{uid,date,slots}});
        if(r.ok===0 && r.conflicts){
          if(!(await conflictModal(r.conflicts))) return;
          r = await api('/schedule',{method:'PUT',body:{uid,date,slots,force:true}});
        }
        closeModal(); popup(withWarnNote('保存しました', r));
        if(location.hash.startsWith('#/sites')){ pageSites(document.getElementById('app')); } else render();
      }catch(e){ popup(e.message,'error'); }
    });
  };
  document.querySelectorAll('.md-status').forEach(b=>b.onclick = async () => {
    const t=b.dataset.t, lbl={ok:'1日OK',off:'休暇',paid:'有給',x:'×'}[t];
    await withLoading(b, async () => {
      try{
        await api('/schedule',{method:'PUT',body:{uid,date,slots:[{type:t}]}});
        closeModal(); popup(lbl+'に設定しました');
        if(location.hash.startsWith('#/sites')){ pageSites(document.getElementById('app')); } else render();
      }catch(e){ popup(e.message,'error'); }
    });
  });
}

/* ===== 現場一覧(チーフ以上)===== */
async function pageSites(app){
  if(!has('sites_view')){ notFound(app); return; }
  const stSites = PAGE_STATE.sites || (PAGE_STATE.sites = { month: MONTH, openDates: new Set(), selected: new Set() });
  if(!stSites.openDates) stSites.openDates = new Set(); // 古い保存状態との互換
  if(!stSites.selected) stSites.selected = new Set();
  const canRename = has('site_manage'); // 現場名・会場名の一括変更(手配者以上)
  const canRegister = ME.handler===1 && has('site_manage'); // 現場情報の手動登録(手配者以上・手配モード中のみ)
  const month = stSites.month;
  const sites = await api(`/sites?month=${month}`);
  // 日付ごとにグループ化
  const byDate = {};
  for(const s of sites){ (byDate[s.date] ||= []).push(s); }
  const dates = Object.keys(byDate).sort();
  const [y,mo] = month.split('-').map(Number);
  const allOpen = dates.length > 0 && dates.every(d => stSites.openDates.has(d));
  const siteKey = s => `${s.date}|${s.site}|${s.venue||''}`;
  // 前回の月から残った選択(有り得ないはずだが)を除去
  const visibleKeys = new Set(sites.map(siteKey));
  for(const k of [...stSites.selected]) if(!visibleKeys.has(k)) stSites.selected.delete(k);
  app.innerHTML = `
  <h2>現場一覧</h2>
  <div class="card">
    <div class="sticky-filters">
      <div class="row" style="margin-bottom:12px;align-items:center;flex-wrap:wrap;gap:8px">
        <button class="btn ghost sm" id="st-prev">◀</button>
        <b id="st-jump-month" title="タップして年月を選択" style="min-width:110px;text-align:center;cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px">${y}年 ${mo}月</b>
        <button class="btn ghost sm" id="st-next">▶</button>
        ${dates.length ? `<button class="btn ghost sm" id="st-toggle-all">${allOpen ? icon('chevronsUp',{size:'12px'}) : icon('chevronsDown',{size:'12px'})} ${allOpen ? '全て閉じる' : '全て開く'}</button>` : ''}
        ${canRegister ? `<button class="btn ghost sm" id="st-register-btn">${icon('plus',{size:'12px'})} 現場を登録</button>` : ''}
        ${ME.handler===1 ? '<span class="muted" style="margin-left:auto">現場をタップ → メンバー確認・追加</span>' : '<span class="muted" style="margin-left:auto">現場をタップ → メンバー確認</span>'}
      </div>
      ${canRename && stSites.selected.size ? `<div class="row" style="margin-bottom:0;gap:8px;align-items:center;background:#f7f5ef;border:1px solid var(--line);border-radius:8px;padding:8px 10px;flex-wrap:wrap">
        <span class="muted" style="font-weight:600">${stSites.selected.size}件選択中</span>
        <button class="btn gold sm" id="st-bulk-rename">${icon('edit',{size:'12px'})} まとめて現場名・会場を変更</button>
        <button class="btn ghost sm" id="st-bulk-clear">選択解除</button>
      </div>` : ''}
    </div>
    ${dates.length ? dates.map(date=>{
      const w = new Date(date.slice(0,4), Number(date.slice(5,7))-1, Number(date.slice(8,10))).getDay();
      return `<details class="st-day" data-date="${date}" ${stSites.openDates.has(date)?'open':''}>
        <summary class="st-date ${w===0?'sun':w===6?'sat':''}">${Number(date.slice(8,10))}日(${WD[w]}) <span class="muted" style="font-weight:400;font-size:12px">(${byDate[date].length}件)</span></summary>
        <div class="st-sites">
          ${byDate[date].map(s=>`<div class="st-site-row">
          ${canRename ? `<input type="checkbox" class="st-site-check" data-key="${h(siteKey(s))}" ${stSites.selected.has(siteKey(s))?'checked':''}>` : ''}
          <button class="st-site" data-date="${s.date}" data-site="${h(s.site)}">
            <div class="st-site-row1">
              <span class="st-site-name">${h(s.site)}</span>
              <span class="st-site-cnt">${s.cnt}名</span>
            </div>
            ${(s.venue || s.registryId) ? `<div class="st-site-row2">
              ${s.venue?`<span class="st-site-venue">${h(s.venue)}</span>`:''}
              ${s.registryId?`<span class="st-site-tag">登録のみ・未配置</span>`:''}
            </div>` : ''}
          </button>
          ${(s.registryId&&canRegister)?`<button type="button" class="st-site-unregister" data-id="${s.registryId}" title="登録した現場情報を削除">${icon('x',{size:'12px'})}</button>`:''}
          </div>
          ${(s.rookies&&s.rookies.length)?`<div class="st-rookie-list">
            ${s.rookies.map(rk=>`<button type="button" class="st-rookie-item" data-report-id="${rk.reportId||''}">${icon('badge',{size:'11px'})} ${h(rk.name)}${rk.reporterName?`<span class="muted"> (報告:${h(rk.reporterName)})</span>`:''}</button>`).join('')}
          </div>`:''}
          ${(s.blacklistNames&&s.blacklistNames.length)?`<div class="st-rookie-list">
            ${s.blacklistNames.map(b=>`<button type="button" class="st-blacklist-item" data-blacklist-id="${b.blacklistId||''}">${icon('clockWarn',{size:'11px'})} ${h(b.name)}</button>`).join('')}
          </div>`:''}`).join('')}
        </div>
      </details>`;
    }).join('') : '<div class="muted" style="padding:20px 0;text-align:center">この月に登録された現場はありません</div>'}
  </div>`;
  $('#st-prev').onclick = () => { stSites.month = shiftMonth(month,-1); stSites.openDates = new Set(); stSites.selected = new Set(); pageSites(app); };
  $('#st-next').onclick = () => { stSites.month = shiftMonth(month, 1); stSites.openDates = new Set(); stSites.selected = new Set(); pageSites(app); };
  $('#st-jump-month').onclick = () => {
    openMonthJumpModal(month, (ym) => { stSites.month = ym; stSites.openDates = new Set(); stSites.selected = new Set(); pageSites(app); });
  };
  const toggleAllBtn = $('#st-toggle-all');
  if(toggleAllBtn) toggleAllBtn.onclick = () => {
    if(allOpen) stSites.openDates = new Set();
    else stSites.openDates = new Set(dates);
    pageSites(app);
  };
  const registerBtn = $('#st-register-btn');
  if(registerBtn) registerBtn.onclick = () => openSiteRegister(`${month}-01`, () => pageSites(app));
  // 開閉状態を都度PAGE_STATEに記録しておく(現場編集後の再描画で復元するため)
  app.querySelectorAll('.st-day').forEach(d => d.addEventListener('toggle', () => {
    if(d.open) stSites.openDates.add(d.dataset.date);
    else stSites.openDates.delete(d.dataset.date);
  }));
  app.querySelectorAll('.st-site').forEach(b => b.onclick = () => openSiteModal(b.dataset.date, b.dataset.site));
  app.querySelectorAll('.st-rookie-item').forEach(b => b.onclick = () => {
    location.hash = b.dataset.reportId ? `#/reports?open=${b.dataset.reportId}` : '#/reports';
  });
  app.querySelectorAll('.st-blacklist-item').forEach(b => b.onclick = () => {
    location.hash = b.dataset.blacklistId ? `#/blacklist?open=${b.dataset.blacklistId}` : '#/blacklist';
  });
  app.querySelectorAll('.st-site-unregister').forEach(b => b.onclick = async (e) => {
    e.stopPropagation();
    if(!confirm('登録した現場情報を削除しますか？')) return;
    await withLoading(b, async () => {
      try{ await api(`/sites/register/${b.dataset.id}`, { method:'DELETE' }); pageSites(app); }
      catch(err){ popup(err.message,'error'); }
    });
  });
  if(canRename){
    app.querySelectorAll('.st-site-check').forEach(cb => cb.onclick = (e) => {
      e.stopPropagation(); // 親のstate-siteボタン(現場詳細を開く)を誤って発火させない
      if(cb.checked) stSites.selected.add(cb.dataset.key); else stSites.selected.delete(cb.dataset.key);
      pageSites(app);
    });
    const bulkClear = $('#st-bulk-clear');
    if(bulkClear) bulkClear.onclick = () => { stSites.selected = new Set(); pageSites(app); };
    const bulkRename = $('#st-bulk-rename');
    if(bulkRename) bulkRename.onclick = () => {
      const targets = sites.filter(s => stSites.selected.has(siteKey(s)));
      openSiteBulkRename(targets, () => { stSites.selected = new Set(); pageSites(app); });
    };
  }
}

// まだ誰もメンバーが配置されていない現場を、先に現場一覧へ表示させておくための登録モーダル。
// 実際にメンバーを配置すると(schedule側に実績ができると)、そちらの表示に自動的に切り替わる。
function openSiteRegister(defaultDate, onDone){
  modal(`<h3>現場を登録</h3>
    <div class="muted" style="margin-bottom:10px">まだ誰も配置されていない現場を、先に現場一覧に表示させておけます。実際にメンバーを配置すると、そちらの内容が優先されます。</div>
    <div class="form-grid" style="grid-template-columns:70px 1fr">
      <label>日付</label><input type="date" id="sreg-date" value="${h(defaultDate||'')}">
      <label>現場名</label><input id="sreg-site" placeholder="例:〇〇フェス">
      <label>会場</label><input id="sreg-venue" placeholder="任意">
    </div>
    <div class="row" style="margin-top:14px"><button class="btn gold" id="sreg-save" style="flex:1">登録する</button></div>`);
  $('#sreg-save').onclick = async () => {
    const date = $('#sreg-date').value;
    const site = $('#sreg-site').value.trim();
    const venue = $('#sreg-venue').value.trim();
    if(!date || !site){ popup('日付と現場名を入力してください','error'); return; }
    await withLoading($('#sreg-save'), async () => {
      try{
        await api('/sites/register', { method:'POST', body:{ date, site, venue } });
        closeModal();
        popup('現場を登録しました');
        if(onDone) onDone();
      }catch(e){ popup(e.message,'error'); }
    });
  };
}

// 現場一覧でチェックした複数の(date,site,venue)を、まとめて統一の現場名・会場名に変更する。
// 入力者によって現場名・会場名の書き方がバラバラになるのは避けられないため、後から統一するための機能。
// fieldsMode('both'|'site'|'venue')を指定すると、その項目だけを編集可能にする。
// 「同会場の公演」一覧は現場名がバラバラで当然なので会場のみ、「同アーティストの公演」一覧は
// 会場がバラバラなことがあるので現場名のみ、というように誤って無関係な項目を巻き込まないため。
function openSiteBulkRename(targets, onDone, opt={}){
  if(!targets.length) return;
  const first = targets[0];
  const mode = opt.fieldsMode || 'both';
  const showSite = mode !== 'venue', showVenue = mode !== 'site';
  const title = opt.title || `選択した${targets.length}件の現場名・会場をまとめて変更`;
  modal(`<h3>${icon('edit',{size:'15px'})} ${h(title)}</h3>
    <div class="muted" style="font-size:12px;margin-bottom:10px">対象(${targets.length}件):</div>
    <div style="max-height:30vh;overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin-bottom:12px">
      ${targets.map(s=>`<div class="muted" style="font-size:12px;padding:5px 8px;background:#faf9f6;border:1px solid var(--line);border-radius:6px">${h(s.date)} ${h(s.site)}${s.venue?` (${h(s.venue)})`:''} ・${s.cnt}名</div>`).join('')}
    </div>
    ${showSite?`<label style="display:block;margin-bottom:10px">新しい現場名<br>
      <input type="text" id="sbr-site" value="${h(first.site)}" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:8px;margin-top:4px">
    </label>`:''}
    ${showVenue?`<label style="display:block;margin-bottom:10px">新しい会場<br>
      <input type="text" id="sbr-venue" value="${h(first.venue||'')}" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:8px;margin-top:4px">
    </label>`:''}
    ${(showSite&&showVenue)?`<div class="muted" style="font-size:11.5px;margin-bottom:12px">どちらかを空欄のままにすると、その項目は変更しません(現場名だけ・会場だけの統一も可能です)。</div>`:''}
    <button class="btn gold" id="sbr-run">変更を適用する</button>
    <div id="sbr-msg" class="muted" style="margin-top:10px"></div>`);
  $('#sbr-run').onclick = async () => {
    const newSite = showSite ? $('#sbr-site').value.trim() : '';
    const newVenue = showVenue ? $('#sbr-venue').value.trim() : '';
    if(!newSite && !newVenue){ $('#sbr-msg').textContent = mode==='venue' ? '新しい会場を入力してください' : mode==='site' ? '新しい現場名を入力してください' : '現場名または会場のどちらかを入力してください'; return; }
    if(!confirm(`選択した${targets.length}件を、まとめて変更します。よろしいですか?`)) return;
    await withLoading($('#sbr-run'), async () => {
      try{
        const items = targets.map(s => ({ date: s.date, site: s.site, venue: s.venue || '' }));
        const r = await api('/sites/bulk-rename', { method:'POST', body:{ items, newSite, newVenue } });
        closeModal();
        popup(`${r.updatedDays}件を変更しました`);
        if(onDone) onDone();
      }catch(e){ $('#sbr-msg').textContent = e.message; }
    });
  };
}

/* ===== グループ機能(会場一覧・公演一覧共通)。手配者以上が自由に作成し、一覧のフィルタに使う。
   kind: 'venue' | 'artist'。memberLabel: 会場名/公演名の呼び方(表示文言用)。 ===== */

// 選択中の項目(会場名/公演名)を、既存グループに追加 or 新規グループを作って追加する。
function openGroupPicker(kind, memberLabel, groups, selectedMembers, onDone){
  if(!selectedMembers.length) return;
  modal(`<h3>${icon('tag',{size:'15px'})} グループに追加</h3>
    <div class="muted" style="font-size:12px;margin-bottom:10px">対象(${selectedMembers.length}件):</div>
    <div style="max-height:20vh;overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin-bottom:12px">
      ${selectedMembers.map(m=>`<div class="muted" style="font-size:12px;padding:5px 8px;background:#faf9f6;border:1px solid var(--line);border-radius:6px">${h(m)}</div>`).join('')}
    </div>
    ${groups.length ? `<label style="display:block;margin-bottom:10px">既存のグループに追加<br>
      <select id="gp-existing" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:8px;margin-top:4px">
        <option value="">選択してください</option>
        ${groups.map(g=>`<option value="${g.id}">${h(g.name)}(${g.members.length}件)</option>`).join('')}
      </select>
    </label>
    <div class="muted" style="text-align:center;margin:8px 0">または</div>` : ''}
    <label style="display:block;margin-bottom:10px">新しいグループを作る<br>
      <input type="text" id="gp-new" placeholder="新しいグループ名" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:8px;margin-top:4px">
    </label>
    <button class="btn gold" id="gp-run">追加する</button>
    <div id="gp-msg" class="muted" style="margin-top:10px"></div>`);
  $('#gp-run').onclick = async () => {
    const existingSel = $('#gp-existing');
    const existingId = existingSel ? existingSel.value : '';
    const newName = $('#gp-new').value.trim();
    if(!existingId && !newName){ $('#gp-msg').textContent = '既存グループを選ぶか、新しいグループ名を入力してください'; return; }
    await withLoading($('#gp-run'), async () => {
      try{
        if(existingId){
          const g = groups.find(g=>String(g.id)===String(existingId));
          const merged = [...new Set([...(g?g.members:[]), ...selectedMembers])];
          await api(`/site-groups/${existingId}`, { method:'PUT', body:{ members: merged } });
        }else{
          await api('/site-groups', { method:'POST', body:{ kind, name:newName, members:selectedMembers } });
        }
        closeModal();
        popup('グループに追加しました');
        if(onDone) onDone();
      }catch(e){ $('#gp-msg').textContent = e.message; }
    });
  };
}

// グループ管理モーダル。作成済みの全グループを一覧し、名前変更・メンバー個別削除・グループ削除ができる。
async function openGroupManage(kind, memberLabel, onDone){
  let groups;
  try{ groups = await api(`/site-groups?kind=${kind}`); }
  catch(e){ popup(e.message,'error'); return; }
  const render = () => {
    modal(`<h3>${icon('tag',{size:'15px'})} グループ管理</h3>
      ${groups.length ? groups.map(g=>`<div class="card" style="padding:10px 12px;margin-bottom:8px">
        <div class="row" style="align-items:center;gap:8px;margin-bottom:6px">
          <input type="text" class="grp-name-edit" data-id="${g.id}" value="${h(g.name)}" style="flex:1;padding:6px 8px;border:1px solid var(--line);border-radius:6px">
          <button type="button" class="btn ghost xs grp-del" data-id="${g.id}" style="color:#b03030;border-color:#e0b0b0">削除</button>
        </div>
        <div class="muted" style="font-size:11px;margin-bottom:4px">${g.members.length}件</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">
          ${g.members.map(m=>`<span class="ka-pill ka-2" style="display:inline-flex;align-items:center;gap:4px">${h(m)}<button type="button" class="grp-member-del" data-id="${g.id}" data-member="${h(m)}" style="border:none;background:none;cursor:pointer;padding:0;line-height:1;color:inherit">${icon('x',{size:'10px'})}</button></span>`).join('') || '<span class="muted" style="font-size:12px">メンバーなし</span>'}
        </div>
      </div>`).join('') : `<div class="muted" style="text-align:center;padding:16px">まだグループがありません</div>`}
      `);
    document.querySelectorAll('#modal-layer .grp-name-edit').forEach(inp => inp.onchange = async () => {
      const name = inp.value.trim();
      if(!name){ popup('グループ名は空にできません','error'); return; }
      try{ await api(`/site-groups/${inp.dataset.id}`, { method:'PUT', body:{ name } }); popup('変更しました'); if(onDone) onDone(); }
      catch(e){ popup(e.message,'error'); }
    });
    document.querySelectorAll('#modal-layer .grp-del').forEach(btn => btn.onclick = async () => {
      if(!confirm('このグループを削除しますか?(グループ分けの解除のみで、会場・公演のデータ自体は変更されません)')) return;
      try{
        await api(`/site-groups/${btn.dataset.id}`, { method:'DELETE' });
        groups = groups.filter(g=>String(g.id)!==String(btn.dataset.id));
        render();
        if(onDone) onDone();
      }catch(e){ popup(e.message,'error'); }
    });
    document.querySelectorAll('#modal-layer .grp-member-del').forEach(btn => btn.onclick = async () => {
      const g = groups.find(g=>String(g.id)===String(btn.dataset.id));
      if(!g) return;
      const merged = g.members.filter(m=>m!==btn.dataset.member);
      try{
        await api(`/site-groups/${g.id}`, { method:'PUT', body:{ members: merged } });
        g.members = merged;
        render();
        if(onDone) onDone();
      }catch(e){ popup(e.message,'error'); }
    });
  };
  render();
}

/* ===== 会場一覧(チーフ以上)。現場一覧と同じ感覚で、会場ごとに過去/今後の現場を確認できる ===== */
async function pageVenues(app){
  if(!has('sites_view')){ notFound(app); return; }
  const st = PAGE_STATE.venues || (PAGE_STATE.venues = { q:'', selected: new Set(), manualOnly:false, sort:'name', groupFilter:'' });
  if(!st.sort) st.sort = 'name'; // 古い保存状態との互換
  if(st.groupFilter === undefined) st.groupFilter = '';
  const venueSortOptions = { name:'会場名順(あ→ん)', cnt:'使用回数が多い順', recent:'最近使った順' };
  if(!st.selected) st.selected = new Set(); // 古い保存状態との互換
  const canRename = has('site_manage'); // 会場名のまとめて変更・グループ作成(手配者以上)
  app.innerHTML = `<h2>${icon('mapPin')} 会場一覧</h2><div class="card"><div class="loading-box"><span class="spinner"></span>読み込み中…</div></div>`;
  let venues, groups;
  try{ [venues, groups] = await Promise.all([api('/venues'), api('/site-groups?kind=venue')]); }
  catch(e){ app.innerHTML = `<h2>${icon('mapPin')} 会場一覧</h2><div class="card"><div class="msg err">${h(e.message)}</div></div>`; return; }
  // 前回の検索結果に無くなった会場の選択は解除しておく(有り得ないはずだが念のため)
  const allVenues = new Set(venues.map(v => v.venue));
  for(const v of [...st.selected]) if(!allVenues.has(v)) st.selected.delete(v);
  if(st.groupFilter && !groups.some(g=>String(g.id)===String(st.groupFilter))) st.groupFilter = '';

  const renderBulkBar = () => {
    const bar = $('#venue-bulk-bar');
    if(!bar) return;
    const hasBar = canRename && st.selected.size;
    bar.style.cssText = hasBar ? 'margin-bottom:0;gap:8px;align-items:center;flex-wrap:wrap;background:#f7f5ef;border:1px solid var(--line);border-radius:8px;padding:8px 10px' : 'margin-bottom:0';
    bar.innerHTML = hasBar ? `
      <span class="muted" style="font-weight:600">${st.selected.size}件選択中</span>
      <button class="btn gold sm" id="venue-bulk-rename">${icon('edit',{size:'12px'})} まとめて名前を変更</button>
      <button class="btn ghost sm" id="venue-bulk-group">${icon('tag',{size:'12px'})} グループに追加</button>
      <button class="btn ghost sm" id="venue-bulk-clear">選択解除</button>` : '';
    const brBtn = $('#venue-bulk-rename');
    if(brBtn) brBtn.onclick = () => {
      openVenueBulkRename([...st.selected], () => { st.selected = new Set(); pageVenues(app); });
    };
    const bgBtn = $('#venue-bulk-group');
    if(bgBtn) bgBtn.onclick = () => {
      openGroupPicker('venue', '会場', groups, [...st.selected], () => { st.selected = new Set(); pageVenues(app); });
    };
    const bcBtn = $('#venue-bulk-clear');
    if(bcBtn) bcBtn.onclick = () => { st.selected = new Set(); renderList(); renderBulkBar(); };
  };

  const sortList = (list) => {
    const sorted = [...list];
    if(st.sort === 'cnt') sorted.sort((a,b) => b.cnt - a.cnt || String(a.venue||'').localeCompare(String(b.venue||''), 'ja'));
    else if(st.sort === 'recent') sorted.sort((a,b) => String(b.lastDate||'').localeCompare(String(a.lastDate||'')) || String(a.venue||'').localeCompare(String(b.venue||''), 'ja'));
    else sorted.sort((a,b) => String(a.venue||'').localeCompare(String(b.venue||''), 'ja'));
    return sorted;
  };

  const renderList = () => {
    const q = st.q.trim();
    let filtered = q ? venues.filter(v => (v.venue||'').includes(q)) : venues;
    if(st.manualOnly) filtered = filtered.filter(v => v.hasManual);
    if(st.groupFilter){
      const g = groups.find(g=>String(g.id)===String(st.groupFilter));
      if(g) filtered = filtered.filter(v => g.members.includes(v.venue));
    }
    filtered = sortList(filtered);
    const listEl = $('#venue-list');
    if(!listEl) return;
    listEl.innerHTML = filtered.length ? filtered.map(v => `<div class="st-site-row">
        ${canRename ? `<input type="checkbox" class="st-site-check" data-venue="${h(v.venue)}" ${st.selected.has(v.venue)?'checked':''}>` : ''}
        <button type="button" class="st-site venue-item ${v.hasManual?'has-manual':''}" data-venue="${h(v.venue)}">
          <div class="st-site-row1">
            <span class="st-site-name">${h(v.venue)}</span>
            <span class="st-site-cnt">${v.cnt}名</span>
          </div>
          ${v.hasManual?`<div class="st-site-row2"><span class="venue-manual-badge" title="会場マニュアルあり">${icon('bookOpen',{size:'12px'})} マニュアルあり</span></div>`:''}
        </button>
      </div>`).join('') : `<div class="muted" style="padding:20px 0;text-align:center">${q||st.manualOnly||st.groupFilter?'該当する会場はありません':'まだ会場のデータがありません'}</div>`;
    listEl.querySelectorAll('.venue-item').forEach(b => b.onclick = () => openVenueModal(b.dataset.venue));
    if(canRename){
      listEl.querySelectorAll('.st-site-check').forEach(cb => cb.onclick = (e) => {
        e.stopPropagation(); // 親のvenue-itemボタン(会場詳細を開く)を誤って発火させない
        if(cb.checked) st.selected.add(cb.dataset.venue); else st.selected.delete(cb.dataset.venue);
        renderBulkBar();
      });
    }
  };

  app.innerHTML = `
  <h2 style="margin-bottom:8px">${icon('mapPin')} 会場一覧</h2>
  <div class="card">
    <div class="sticky-filters">
      <div class="row" style="margin-bottom:10px">
        <input id="venue-q" placeholder="会場名で検索" value="${h(st.q)}" style="width:100%;box-sizing:border-box">
      </div>
      <div class="row" style="margin-bottom:12px;gap:10px;flex-wrap:wrap;align-items:center">
        <label class="muted" style="font-size:12px;white-space:nowrap">並び替え</label>
        <select id="venue-sort">
          ${Object.entries(venueSortOptions).map(([k,l])=>`<option value="${k}" ${k===st.sort?'selected':''}>${l}</option>`).join('')}
        </select>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;white-space:nowrap;cursor:pointer">
          <input type="checkbox" id="venue-manual-only" ${st.manualOnly?'checked':''}> マニュアルがある会場のみ
        </label>
      </div>
      <div class="row" style="margin-bottom:12px;gap:10px;flex-wrap:wrap;align-items:center">
        <label class="muted" style="font-size:12px;white-space:nowrap">グループで絞り込み</label>
        <select id="venue-group-filter">
          <option value="">(すべて)</option>
          ${groups.map(g=>`<option value="${g.id}" ${String(st.groupFilter)===String(g.id)?'selected':''}>${h(g.name)}(${g.members.length}件)</option>`).join('')}
        </select>
        ${canRename ? `<button type="button" class="btn ghost sm" id="venue-group-manage">${icon('tag',{size:'12px'})} グループ管理</button>` : ''}
      </div>
      <div class="row" id="venue-bulk-bar" style="margin-bottom:0;gap:8px;align-items:center;flex-wrap:wrap"></div>
    </div>
    <div id="venue-list" class="st-sites"></div>
  </div>`;
  renderList();
  renderBulkBar();
  $('#venue-q').oninput = (e) => { st.q = e.target.value; renderList(); };
  $('#venue-sort').onchange = (e) => { st.sort = e.target.value; renderList(); };
  $('#venue-manual-only').onchange = (e) => { st.manualOnly = e.target.checked; renderList(); };
  $('#venue-group-filter').onchange = (e) => { st.groupFilter = e.target.value; renderList(); };
  const groupManageBtn = $('#venue-group-manage');
  if(groupManageBtn) groupManageBtn.onclick = () => openGroupManage('venue', '会場', () => pageVenues(app));
}

// 現場一覧の一括改名と同様、選択した複数の会場名をまとめて統一名称に変更する。
// 対象は(日付,現場名,会場)の組ではなく会場名そのもので、選択した会場名のどれかに一致する
// scheduleの全行(過去・未来・全期間)が対象になる。
function openVenueBulkRename(venues, onDone){
  if(!venues.length) return;
  const title = venues.length === 1 ? `${h(venues[0])} の名前を変更` : `選択した${venues.length}件の会場名をまとめて変更`;
  modal(`<h3>${icon('edit',{size:'15px'})} ${title}</h3>
    ${venues.length > 1 ? `<div class="muted" style="font-size:12px;margin-bottom:10px">対象(${venues.length}件):</div>
    <div style="max-height:30vh;overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin-bottom:12px">
      ${venues.map(v=>`<div class="muted" style="font-size:12px;padding:5px 8px;background:#faf9f6;border:1px solid var(--line);border-radius:6px">${h(v)}</div>`).join('')}
    </div>` : ''}
    <label style="display:block;margin-bottom:10px">新しい会場名<br>
      <input type="text" id="vbr-venue" value="${h(venues[0])}" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:8px;margin-top:4px">
    </label>
    <button class="btn gold" id="vbr-run">変更を適用する</button>
    <div id="vbr-msg" class="muted" style="margin-top:10px"></div>`);
  $('#vbr-run').onclick = async () => {
    const newVenue = $('#vbr-venue').value.trim();
    if(!newVenue){ $('#vbr-msg').textContent = '新しい会場名を入力してください'; return; }
    if(!confirm(venues.length === 1 ? '会場名を変更します。よろしいですか?' : `選択した${venues.length}件を、まとめて変更します。よろしいですか?`)) return;
    await withLoading($('#vbr-run'), async () => {
      try{
        const r = await api('/venues/bulk-rename', { method:'POST', body:{ venues, newVenue } });
        closeModal();
        popup(`${r.updatedDays}件を変更しました`);
        if(onDone) onDone();
      }catch(e){ $('#vbr-msg').textContent = e.message; }
    });
  };
}

// 会場詳細モーダル。その会場の現場を、今日を境に過去・今後に分けて一覧表示する。
// 項目をタップすると現場詳細(openSiteModal)へ、「会場マニュアル」ボタンは専用ページ
// (現時点では機能公開設定「準備中」)へ遷移する。
async function openVenueModal(venue){
  const canRename = has('site_manage'); // 会場名の変更・マニュアル有無フラグの編集(手配者以上)
  let data;
  try{ data = await api(`/venue-history?venue=${encodeURIComponent(venue)}`); }
  catch(e){ popup(e.message, 'error'); return; }
  const item = r => `<button type="button" class="btn ghost sm venue-hist-item" data-date="${r.date}" data-site="${h(r.site)}" style="display:block;width:100%;text-align:left;margin-bottom:4px;white-space:normal">
    ${h(r.date)} ${h(r.site)} <span class="muted">${r.cnt}名</span>${r.visited ? `<span class="visited-dot" title="行ったことがあります"></span>` : ''}
  </button>`;
  modal(`<h3>${icon('mapPin',{size:'15px'})} ${h(venue)}</h3>
    <div class="row" style="gap:8px;margin:2px 0 10px;flex-wrap:wrap;align-items:center">
      <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}" target="_blank" class="btn ghost sm">${icon('mapPin',{size:'13px'})} 地図で見る</a>
      <button type="button" class="btn ghost sm" id="venue-manual-btn">${icon('bookOpen',{size:'13px'})} 会場マニュアル</button>
      <button type="button" class="btn ghost sm" id="venue-members-btn">${icon('users',{size:'13px'})} メンバーリスト</button>
      ${canRename ? `<button type="button" class="btn ghost sm" id="venue-rename-btn">${icon('edit',{size:'13px'})} 名前を変更</button>` : ''}
    </div>
    ${(canRename || data.hasManual) ? `<div class="row" style="margin:0 0 10px;align-items:center">
      ${canRename
        ? `<label style="display:flex;align-items:center;gap:5px;font-size:12.5px;cursor:pointer"><input type="checkbox" id="venue-manual-flag" ${data.hasManual?'checked':''}> マニュアルあり</label>`
        : `<span class="venue-manual-badge">${icon('bookOpen',{size:'12px'})} マニュアルあり</span>`}
    </div>` : ''}
    ${data.past.length ? `<div class="section-label" style="margin-top:6px">${icon('arrowLeft',{size:'10px'})} 過去の公演</div><div>${data.past.map(item).join('')}</div>` : ''}
    ${data.future.length ? `<div class="section-label" style="margin-top:12px">今後の公演 ${icon('arrowRight',{size:'10px'})}</div><div>${data.future.map(item).join('')}</div>` : ''}
    ${(!data.past.length && !data.future.length) ? '<div class="muted">この会場の現場情報はまだありません</div>' : ''}`);
  document.querySelectorAll('#modal-layer .venue-hist-item').forEach(el => {
    el.onclick = () => { closeModal(); openSiteModal(el.dataset.date, el.dataset.site); };
  });
  const manualBtn = $('#venue-manual-btn');
  if(manualBtn) manualBtn.onclick = () => { closeModal(); goTo('#/venue-manual/' + encodeURIComponent(venue)); };
  const membersBtn = $('#venue-members-btn');
  if(membersBtn) membersBtn.onclick = () => openVenueMemberList(venue);
  const renameBtn = $('#venue-rename-btn');
  if(renameBtn) renameBtn.onclick = (e) => { e.stopPropagation(); openVenueBulkRename([venue], () => openVenueModal(venue)); };
  const manualFlag = $('#venue-manual-flag');
  if(manualFlag) manualFlag.onchange = async () => {
    const hasManual = manualFlag.checked;
    try{ await api('/venues/manual-flag', { method:'POST', body:{ venue, hasManual } }); }
    catch(e){ manualFlag.checked = !hasManual; popup(e.message,'error'); }
  };
}

// 会場・公演を経験したことのあるメンバー一覧の共通描画。並び替え(回数順/最近行った順/ランク順)に対応し、
// 選択のたびにサーバーへ再取得する(並び替えロジックをバックエンドと二重実装しないため)。
const memberListSortOptions = { cnt:'回数が多い順', recent:'最近行った人', rank:'ランク順(A→E)' };
async function openMemberVisitList(title, iconName, fetchUrl){
  let sort = 'cnt';
  const render = async () => {
    let rows;
    try{ rows = await api(`${fetchUrl}&sort=${sort}`); }
    catch(e){ popup(e.message, 'error'); return; }
    modal(`<h3>${icon(iconName,{size:'15px'})} ${title}</h3>
      <div class="row" style="gap:8px;margin-bottom:10px;align-items:center">
        <span class="muted">${rows.length}名</span>
        <select id="mvl-sort" style="margin-left:auto">
          ${Object.entries(memberListSortOptions).map(([k,l])=>`<option value="${k}" ${k===sort?'selected':''}>${l}</option>`).join('')}
        </select>
      </div>
      <div style="max-height:60vh;overflow-y:auto">
        ${rows.length ? rows.map(r=>`<div class="mgr-row venue-member-row" style="cursor:pointer" data-uid="${r.id}">
          <div class="mgr-name">
            ${h(r.name)}
            <span class="muted">${h(r.regno)} ${h(r.rank)||''}</span>
          </div>
          <div class="muted" style="font-size:12.5px;white-space:nowrap">${r.cnt}回 <span style="font-size:11px">(最終:${h(r.lastDate)})</span></div>
        </div>`).join('') : '<div class="muted" style="text-align:center;padding:16px">経験したメンバーはいません</div>'}
      </div>`);
    document.querySelectorAll('#modal-layer .venue-member-row').forEach(el => {
      el.onclick = () => { closeModal(); location.hash = '#/schedule/' + el.dataset.uid; };
    });
    $('#mvl-sort').onchange = (e) => { sort = e.target.value; render(); };
  };
  await render();
}
// 会場を経験したことのあるメンバー一覧。名前を押すと個人スケジュールへ遷移する。
function openVenueMemberList(venue){
  return openMemberVisitList(`${h(venue)} を経験したメンバー`, 'users', `/venue-members?venue=${encodeURIComponent(venue)}`);
}
// 公演を経験したことのあるメンバー一覧(準備中)。会場版と同じ操作感。
function openArtistMemberList(artist){
  return openMemberVisitList(`${h(artist)} を経験したメンバー`, 'users', `/artist-members?artist=${encodeURIComponent(artist)}`);
}

// 個人が行ったことのある会場・公演一覧の共通描画。個人スケジュール画面のボタンから開く。
async function openMemberVisitedList(title, iconName, apiPath, uid, emptyMsg, dataKey, onItemClick){
  let rows;
  try{ rows = await api(`${apiPath}?uid=${uid}`); }
  catch(e){ popup(e.message, 'error'); return; }
  modal(`<h3>${icon(iconName,{size:'15px'})} ${title}</h3>
    <div class="muted" style="margin-bottom:10px">${rows.length}件</div>
    <div style="max-height:60vh;overflow-y:auto">
      ${rows.length ? rows.map(r=>`<div class="mgr-row member-visited-row" style="cursor:pointer" data-key="${h(r[dataKey])}">
        <div class="mgr-name">${h(r[dataKey])}</div>
        <div class="muted" style="font-size:12.5px;white-space:nowrap">${r.cnt}回(${r.dateCnt}日) <span style="font-size:11px">(最終:${h(r.lastDate)})</span></div>
      </div>`).join('') : `<div class="muted" style="text-align:center;padding:16px">${emptyMsg}</div>`}
    </div>`);
  document.querySelectorAll('#modal-layer .member-visited-row').forEach(el => {
    el.onclick = () => { closeModal(); onItemClick(el.dataset.key); };
  });
}
// 個人が行ったことのある会場一覧。タップで会場詳細へ。
function openMemberVenueList(uid, name){
  return openMemberVisitedList(`${h(name)} さんが行った会場`, 'mapPin', '/member-venues', uid, 'まだ会場の記録がありません', 'venue', openVenueModal);
}
// 個人が行ったことのある公演一覧(準備中)。タップで公演詳細へ。
function openMemberArtistList(uid, name){
  return openMemberVisitedList(`${h(name)} さんが行った公演`, 'megaphone', '/member-artists', uid, 'まだ公演の記録がありません', 'artist', openArtistModal);
}

// 会場マニュアル(準備中)。中身はまだ無いため、機能公開設定を「準備中」で登録し、通常は
// render()の共通ゲートで自動的に案内される。管理者はゲートを常にスキップするため、
// プレビューできるようここでも同じ準備中メッセージを表示する。
async function pageVenueManual(app, hash){
  const venue = decodeURIComponent(hash.split('/')[2] || '');
  renderFeatureBlocked(app, 'hidden', { icon:'bookOpen', label: venue ? `${venue} マニュアル` : '会場マニュアル' });
}

/* ===== 公演一覧(旧アーティスト一覧。準備中、chief以上)。会場一覧と同じ操作感で、現場名から
   「【セクション等】」を除いた本体名を公演名とみなして集計・一覧表示する。 ===== */
async function pageArtists(app){
  if(!has('sites_view')){ notFound(app); return; }
  const st = PAGE_STATE.artists || (PAGE_STATE.artists = { q:'', selected: new Set(), sort:'name', groupFilter:'', openFolder:'' });
  if(!st.sort) st.sort = 'name'; // 古い保存状態との互換
  if(!st.selected) st.selected = new Set();
  if(st.groupFilter === undefined) st.groupFilter = '';
  if(st.openFolder === undefined) st.openFolder = '';
  const artistSortOptions = { name:'公演名順(あ→ん)', cnt:'使用回数が多い順', recent:'最近使った順' };
  const canRename = has('site_manage'); // 公演名のまとめて変更・グループ/フォルダ作成(手配者以上)
  app.innerHTML = `<h2>${icon('megaphone')} 公演一覧</h2><div class="card"><div class="loading-box"><span class="spinner"></span>読み込み中…</div></div>`;
  let artists, groups, folders;
  try{ [artists, groups, folders] = await Promise.all([api('/artists'), api('/site-groups?kind=artist'), api('/artist-folders')]); }
  catch(e){ app.innerHTML = `<h2>${icon('megaphone')} 公演一覧</h2><div class="card"><div class="msg err">${h(e.message)}</div></div>`; return; }
  // 前回の検索結果に無くなった公演の選択は解除しておく(有り得ないはずだが念のため)
  const allArtists = new Set(artists.map(a => a.artist));
  for(const a of [...st.selected]) if(!allArtists.has(a)) st.selected.delete(a);
  if(st.groupFilter && !groups.some(g=>String(g.id)===String(st.groupFilter))) st.groupFilter = '';
  if(st.openFolder && !folders.some(f=>String(f.id)===String(st.openFolder))) st.openFolder = '';
  const byArtistName = {}; artists.forEach(a => byArtistName[a.artist] = a);

  const renderBulkBar = () => {
    const bar = $('#artist-bulk-bar');
    if(!bar) return;
    const hasBar = canRename && st.selected.size;
    bar.style.cssText = hasBar ? 'margin-bottom:0;gap:8px;align-items:center;flex-wrap:wrap;background:#f7f5ef;border:1px solid var(--line);border-radius:8px;padding:8px 10px' : 'margin-bottom:0';
    bar.innerHTML = hasBar ? `
      <span class="muted" style="font-weight:600">${st.selected.size}件選択中</span>
      <button class="btn gold sm" id="artist-bulk-rename">${icon('edit',{size:'12px'})} まとめて名前を変更</button>
      <button class="btn ghost sm" id="artist-bulk-group">${icon('tag',{size:'12px'})} グループに追加</button>
      ${!st.openFolder ? `<button class="btn ghost sm" id="artist-bulk-folder">${icon('package',{size:'12px'})} フォルダにまとめる</button>` : `
      <button class="btn ghost sm" id="artist-bulk-folder-move">${icon('package',{size:'12px'})} 別のフォルダへ移動</button>
      <button class="btn ghost sm" id="artist-bulk-folder-remove">${icon('x',{size:'12px'})} フォルダから出す</button>`}
      <button class="btn ghost sm" id="artist-bulk-clear">選択解除</button>` : '';
    const brBtn = $('#artist-bulk-rename');
    if(brBtn) brBtn.onclick = () => {
      openArtistBulkRename([...st.selected], () => { st.selected = new Set(); pageArtists(app); });
    };
    const bgBtn = $('#artist-bulk-group');
    if(bgBtn) bgBtn.onclick = () => {
      openGroupPicker('artist', '公演', groups, [...st.selected], () => { st.selected = new Set(); pageArtists(app); });
    };
    const bfBtn = $('#artist-bulk-folder');
    if(bfBtn) bfBtn.onclick = () => {
      openArtistFolderPicker(folders, [...st.selected], () => { st.selected = new Set(); pageArtists(app); });
    };
    const bfmBtn = $('#artist-bulk-folder-move');
    if(bfmBtn) bfmBtn.onclick = () => {
      openArtistFolderPicker(folders, [...st.selected], () => { st.selected = new Set(); pageArtists(app); }, { moveFromFolderId: st.openFolder });
    };
    const bfrBtn = $('#artist-bulk-folder-remove');
    if(bfrBtn) bfrBtn.onclick = async () => {
      const folder = folders.find(f=>String(f.id)===String(st.openFolder));
      if(!folder) return;
      if(!confirm(`選択した${st.selected.size}件をこのフォルダから出しますか?(公演のデータ自体は変更されません)`)) return;
      const remaining = folder.members.filter(m=>!st.selected.has(m));
      await withLoading(bfrBtn, async () => {
        try{
          await api(`/artist-folders/${folder.id}`, { method:'PUT', body:{ members: remaining } });
          st.selected = new Set();
          pageArtists(app);
        }catch(e){ popup(e.message,'error'); }
      });
    };
    const bcBtn = $('#artist-bulk-clear');
    if(bcBtn) bcBtn.onclick = () => { st.selected = new Set(); renderList(); renderBulkBar(); };
  };

  const sortList = (list) => {
    const sorted = [...list];
    if(st.sort === 'cnt') sorted.sort((a,b) => b.cnt - a.cnt || String(a.artist||'').localeCompare(String(b.artist||''), 'ja'));
    else if(st.sort === 'recent') sorted.sort((a,b) => String(b.lastDate||'').localeCompare(String(a.lastDate||'')) || String(a.artist||'').localeCompare(String(b.artist||''), 'ja'));
    else sorted.sort((a,b) => String(a.artist||'').localeCompare(String(b.artist||''), 'ja'));
    return sorted;
  };

  const renderList = () => {
    const q = st.q.trim();
    const listEl = $('#artist-list');
    if(!listEl) return;

    // フォルダの中を開いている場合は、そのフォルダのメンバーだけをフラットに表示する
    if(st.openFolder){
      const folder = folders.find(f=>String(f.id)===String(st.openFolder));
      let members = (folder ? folder.members : []).map(name => byArtistName[name]).filter(Boolean);
      if(q) members = members.filter(a => (a.artist||'').includes(q));
      if(st.groupFilter){
        const g = groups.find(g=>String(g.id)===String(st.groupFilter));
        if(g) members = members.filter(a => g.members.includes(a.artist));
      }
      members = sortList(members);
      listEl.innerHTML = members.length ? members.map(a => `<div class="st-site-row">
          ${canRename ? `<input type="checkbox" class="st-site-check" data-artist="${h(a.artist)}" ${st.selected.has(a.artist)?'checked':''}>` : ''}
          <button type="button" class="st-site artist-item" data-artist="${h(a.artist)}">
            <span class="st-site-name">${h(a.artist)}</span>
            <span class="st-site-cnt">${a.dateCnt}日</span>
          </button>
        </div>`).join('') : `<div class="muted" style="padding:20px 0;text-align:center">該当する公演はありません</div>`;
      listEl.querySelectorAll('.artist-item').forEach(b => b.onclick = () => openArtistModal(b.dataset.artist));
      if(canRename){
        listEl.querySelectorAll('.st-site-check').forEach(cb => cb.onclick = (e) => {
          e.stopPropagation();
          if(cb.checked) st.selected.add(cb.dataset.artist); else st.selected.delete(cb.dataset.artist);
          renderBulkBar();
        });
      }
      return;
    }

    // 通常表示: フォルダに入っている公演はフォルダ1行にまとめ、それ以外はそのまま表示する
    const folderedNames = new Set();
    folders.forEach(f => f.members.forEach(m => folderedNames.add(m)));
    let flat = artists.filter(a => !folderedNames.has(a.artist));
    if(q) flat = flat.filter(a => (a.artist||'').includes(q));
    if(st.groupFilter){
      const g = groups.find(g=>String(g.id)===String(st.groupFilter));
      if(g) flat = flat.filter(a => g.members.includes(a.artist));
    }
    let folderRows = folders.map(f => {
      let members = f.members.map(name => byArtistName[name]).filter(Boolean);
      if(st.groupFilter){
        const g = groups.find(g=>String(g.id)===String(st.groupFilter));
        if(g) members = members.filter(a => g.members.includes(a.artist));
      }
      const dateCnt = members.reduce((s,a)=>s+(a.dateCnt||0), 0);
      const cnt = members.reduce((s,a)=>s+(a.cnt||0), 0);
      return { id:f.id, name:f.name, dateCnt, cnt, memberCount: members.length };
    }).filter(f => f.memberCount > 0 && (!q || f.name.includes(q)));

    flat = sortList(flat);
    folderRows.sort((a,b) => String(a.name||'').localeCompare(String(b.name||''), 'ja'));

    if(!folderRows.length && !flat.length){
      listEl.innerHTML = `<div class="muted" style="padding:20px 0;text-align:center">${q||st.groupFilter?'該当する公演はありません':'まだ現場のデータがありません'}</div>`;
      return;
    }
    listEl.innerHTML =
      folderRows.map(f => `<div class="st-site-row">
        <button type="button" class="st-site folder-item" data-folder="${f.id}">
          ${icon('package',{size:'14px'})} <span class="st-site-name">${h(f.name)}</span>
          <span class="muted" style="font-size:11px">(${f.memberCount}件)</span>
          <span class="st-site-cnt">${f.dateCnt}日</span>
        </button>
      </div>`).join('') +
      flat.map(a => `<div class="st-site-row">
        ${canRename ? `<input type="checkbox" class="st-site-check" data-artist="${h(a.artist)}" ${st.selected.has(a.artist)?'checked':''}>` : ''}
        <button type="button" class="st-site artist-item" data-artist="${h(a.artist)}">
          <span class="st-site-name">${h(a.artist)}</span>
          <span class="st-site-cnt">${a.dateCnt}日</span>
        </button>
      </div>`).join('');
    listEl.querySelectorAll('.artist-item').forEach(b => b.onclick = () => openArtistModal(b.dataset.artist));
    listEl.querySelectorAll('.folder-item').forEach(b => b.onclick = () => { st.openFolder = b.dataset.folder; st.selected = new Set(); renderList(); renderBulkBar(); renderFolderBar(); });
    if(canRename){
      listEl.querySelectorAll('.st-site-check').forEach(cb => cb.onclick = (e) => {
        e.stopPropagation(); // 親のartist-itemボタン(公演詳細を開く)を誤って発火させない
        if(cb.checked) st.selected.add(cb.dataset.artist); else st.selected.delete(cb.dataset.artist);
        renderBulkBar();
      });
    }
  };

  const renderFolderBar = () => {
    const bar = $('#artist-folder-bar');
    if(!bar) return;
    if(!st.openFolder){ bar.innerHTML = ''; return; }
    const folder = folders.find(f=>String(f.id)===String(st.openFolder));
    bar.innerHTML = `<button type="button" class="btn ghost sm" id="artist-folder-back">${icon('arrowLeft',{size:'12px'})} フォルダ一覧へ戻る</button>
      <span class="muted" style="font-weight:600">${icon('package',{size:'12px'})} ${h(folder?folder.name:'')}</span>`;
    $('#artist-folder-back').onclick = () => { st.openFolder = ''; st.selected = new Set(); renderList(); renderBulkBar(); renderFolderBar(); };
  };

  app.innerHTML = `
  <h2 style="margin-bottom:8px">${icon('megaphone')} 公演一覧</h2>
  <div class="card">
    <div class="sticky-filters">
      <div class="row" style="margin-bottom:10px">
        <input id="artist-q" placeholder="公演名で検索" value="${h(st.q)}" style="width:100%;box-sizing:border-box">
      </div>
      <div class="row" style="margin-bottom:12px;gap:10px;flex-wrap:wrap;align-items:center">
        <label class="muted" style="font-size:12px;white-space:nowrap">並び替え</label>
        <select id="artist-sort">
          ${Object.entries(artistSortOptions).map(([k,l])=>`<option value="${k}" ${k===st.sort?'selected':''}>${l}</option>`).join('')}
        </select>
      </div>
      <div class="row" style="margin-bottom:12px;gap:10px;flex-wrap:wrap;align-items:center">
        <label class="muted" style="font-size:12px;white-space:nowrap">グループで絞り込み</label>
        <select id="artist-group-filter">
          <option value="">(すべて)</option>
          ${groups.map(g=>`<option value="${g.id}" ${String(st.groupFilter)===String(g.id)?'selected':''}>${h(g.name)}(${g.members.length}件)</option>`).join('')}
        </select>
        ${canRename ? `<button type="button" class="btn ghost sm" id="artist-group-manage">${icon('tag',{size:'12px'})} グループ管理</button>` : ''}
        ${canRename ? `<button type="button" class="btn ghost sm" id="artist-folder-manage">${icon('package',{size:'12px'})} フォルダ管理</button>` : ''}
        ${canRename ? `<button type="button" class="btn ghost sm" id="artist-find-replace">${icon('repeat',{size:'12px'})} 文字の一部を置換</button>` : ''}
      </div>
      <div class="row" id="artist-folder-bar" style="margin-bottom:0;gap:8px;align-items:center"></div>
      <div class="row" id="artist-bulk-bar" style="margin-bottom:0;gap:8px;align-items:center;flex-wrap:wrap"></div>
    </div>
    <div id="artist-list" class="st-sites" style="margin-top:10px"></div>
  </div>`;
  renderList();
  renderBulkBar();
  renderFolderBar();
  $('#artist-q').oninput = (e) => { st.q = e.target.value; renderList(); };
  $('#artist-sort').onchange = (e) => { st.sort = e.target.value; renderList(); };
  $('#artist-group-filter').onchange = (e) => { st.groupFilter = e.target.value; renderList(); };
  const groupManageBtn = $('#artist-group-manage');
  if(groupManageBtn) groupManageBtn.onclick = () => openGroupManage('artist', '公演', () => pageArtists(app));
  const folderManageBtn = $('#artist-folder-manage');
  if(folderManageBtn) folderManageBtn.onclick = () => openArtistFolderManage(() => pageArtists(app));
  const findReplaceBtn = $('#artist-find-replace');
  if(findReplaceBtn) findReplaceBtn.onclick = () => {
    const folder = st.openFolder ? folders.find(f=>String(f.id)===String(st.openFolder)) : null;
    openArtistFindReplace(() => pageArtists(app), folder ? { artists: folder.members, label: folder.name } : null);
  };
}

// 選択中の公演をフォルダに追加する(既存フォルダに追加 or 新規フォルダを作成)。openGroupPickerと同じ操作感。
// opts.moveFromFolderId を指定すると「移動」モードになり、追加後に移動元フォルダから選択メンバーを
// 取り除く(移動元自身は選択肢から除外する)。folders は移動元を含む全フォルダを渡すこと(移動元の
// 現在のメンバーを引くために参照する)。
function openArtistFolderPicker(folders, selectedArtists, onDone, opts){
  if(!selectedArtists.length) return;
  const moveFromFolderId = opts && opts.moveFromFolderId;
  const pickableFolders = moveFromFolderId ? folders.filter(f=>String(f.id)!==String(moveFromFolderId)) : folders;
  const title = moveFromFolderId ? '別のフォルダへ移動' : 'フォルダにまとめる';
  const btnLabel = moveFromFolderId ? '移動する' : '追加する';
  modal(`<h3>${icon('package',{size:'15px'})} ${title}</h3>
    <div class="muted" style="font-size:12px;margin-bottom:10px">対象(${selectedArtists.length}件):</div>
    <div style="max-height:20vh;overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin-bottom:12px">
      ${selectedArtists.map(a=>`<div class="muted" style="font-size:12px;padding:5px 8px;background:#faf9f6;border:1px solid var(--line);border-radius:6px">${h(a)}</div>`).join('')}
    </div>
    ${pickableFolders.length ? `<label style="display:block;margin-bottom:10px">既存のフォルダに追加<br>
      <select id="afp-existing" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:8px;margin-top:4px">
        <option value="">選択してください</option>
        ${pickableFolders.map(f=>`<option value="${f.id}">${h(f.name)}(${f.members.length}件)</option>`).join('')}
      </select>
    </label>
    <div class="muted" style="text-align:center;margin:8px 0">または</div>` : ''}
    <label style="display:block;margin-bottom:10px">新しいフォルダを作る<br>
      <input type="text" id="afp-new" placeholder="例:G大阪" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:8px;margin-top:4px">
    </label>
    <button class="btn gold" id="afp-run">${btnLabel}</button>
    <div id="afp-msg" class="muted" style="margin-top:10px"></div>`);
  $('#afp-run').onclick = async () => {
    const existingSel = $('#afp-existing');
    const existingId = existingSel ? existingSel.value : '';
    const newName = $('#afp-new').value.trim();
    if(!existingId && !newName){ $('#afp-msg').textContent = '既存フォルダを選ぶか、新しいフォルダ名を入力してください'; return; }
    await withLoading($('#afp-run'), async () => {
      try{
        if(existingId){
          const f = pickableFolders.find(f=>String(f.id)===String(existingId));
          const merged = [...new Set([...(f?f.members:[]), ...selectedArtists])];
          await api(`/artist-folders/${existingId}`, { method:'PUT', body:{ members: merged } });
        }else{
          await api('/artist-folders', { method:'POST', body:{ name:newName, members:selectedArtists } });
        }
        if(moveFromFolderId){
          const src = folders.find(f=>String(f.id)===String(moveFromFolderId));
          if(src){
            const remaining = src.members.filter(m=>!selectedArtists.includes(m));
            await api(`/artist-folders/${moveFromFolderId}`, { method:'PUT', body:{ members: remaining } });
          }
        }
        closeModal();
        popup(moveFromFolderId ? '移動しました' : 'フォルダに追加しました');
        if(onDone) onDone();
      }catch(e){ $('#afp-msg').textContent = e.message; }
    });
  };
}

// フォルダ管理モーダル。グループ管理と同じ操作感で、名前変更・メンバー個別削除・フォルダ削除ができる。
async function openArtistFolderManage(onDone){
  let folders;
  try{ folders = await api('/artist-folders'); }
  catch(e){ popup(e.message,'error'); return; }
  const render = () => {
    modal(`<h3>${icon('package',{size:'15px'})} フォルダ管理</h3>
      ${folders.length ? folders.map(f=>`<div class="card" style="padding:10px 12px;margin-bottom:8px">
        <div class="row" style="align-items:center;gap:8px;margin-bottom:6px">
          <input type="text" class="fld-name-edit" data-id="${f.id}" value="${h(f.name)}" style="flex:1;padding:6px 8px;border:1px solid var(--line);border-radius:6px">
          <button type="button" class="btn ghost xs fld-del" data-id="${f.id}" style="color:#b03030;border-color:#e0b0b0">削除</button>
        </div>
        <div class="muted" style="font-size:11px;margin-bottom:4px">${f.members.length}件</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px">
          ${f.members.map(m=>`<span class="ka-pill ka-2" style="display:inline-flex;align-items:center;gap:4px">${h(m)}<button type="button" class="fld-member-del" data-id="${f.id}" data-member="${h(m)}" style="border:none;background:none;cursor:pointer;padding:0;line-height:1;color:inherit">${icon('x',{size:'10px'})}</button></span>`).join('') || '<span class="muted" style="font-size:12px">メンバーなし</span>'}
        </div>
      </div>`).join('') : `<div class="muted" style="text-align:center;padding:16px">まだフォルダがありません</div>`}
      `);
    document.querySelectorAll('#modal-layer .fld-name-edit').forEach(inp => inp.onchange = async () => {
      const name = inp.value.trim();
      if(!name){ popup('フォルダ名は空にできません','error'); return; }
      try{ await api(`/artist-folders/${inp.dataset.id}`, { method:'PUT', body:{ name } }); popup('変更しました'); if(onDone) onDone(); }
      catch(e){ popup(e.message,'error'); }
    });
    document.querySelectorAll('#modal-layer .fld-del').forEach(btn => btn.onclick = async () => {
      if(!confirm('このフォルダを削除しますか?(フォルダ分けの解除のみで、公演のデータ自体は変更されません)')) return;
      try{
        await api(`/artist-folders/${btn.dataset.id}`, { method:'DELETE' });
        folders = folders.filter(f=>String(f.id)!==String(btn.dataset.id));
        render();
        if(onDone) onDone();
      }catch(e){ popup(e.message,'error'); }
    });
    document.querySelectorAll('#modal-layer .fld-member-del').forEach(btn => btn.onclick = async () => {
      const f = folders.find(f=>String(f.id)===String(btn.dataset.id));
      if(!f) return;
      const merged = f.members.filter(m=>m!==btn.dataset.member);
      try{
        await api(`/artist-folders/${f.id}`, { method:'PUT', body:{ members: merged } });
        f.members = merged;
        render();
        if(onDone) onDone();
      }catch(e){ popup(e.message,'error'); }
    });
  };
  render();
}

// 公演名の一部を置換する(例:「vs」→「VS」)。プレビューで変更対象を確認してから適用する。
function openArtistFindReplace(onDone, scope){
  const scopeArtists = scope && scope.artists && scope.artists.length ? scope.artists : null;
  modal(`<h3>${icon('repeat',{size:'15px'})} 公演名の一部を置換</h3>
    <div class="muted" style="font-size:12px;margin-bottom:10px">公演名に含まれる文字列を一括で置き換えます(例:「vs」→「VS」)。各行の【セクション等】表記は対象外です。</div>
    ${scopeArtists ? `<div class="msg ok" style="font-size:12px;margin-bottom:10px">${icon('package',{size:'12px'})} 「${h(scope.label)}」フォルダ内の公演(${scopeArtists.length}件)のみが対象です。フォルダ外の公演には影響しません。</div>` : ''}
    <div class="form-grid" style="grid-template-columns:90px 1fr;max-width:420px">
      <label>置換前</label><input type="text" id="afr-find" placeholder="例:vs">
      <label>置換後</label><input type="text" id="afr-replace" placeholder="例:VS">
    </div>
    <div class="row" style="margin-top:14px"><button class="btn ghost" id="afr-preview" style="flex:1">プレビュー</button></div>
    <div id="afr-preview-area" style="margin-top:10px"></div>
    <div id="afr-msg" class="muted" style="margin-top:10px"></div>`);
  $('#afr-preview').onclick = async () => {
    const find = $('#afr-find').value;
    const replace = $('#afr-replace').value;
    if(!find){ $('#afr-msg').textContent = '置換前の文字列を入力してください'; return; }
    await withLoading($('#afr-preview'), async () => {
      try{
        const r = await api('/artists/find-replace', { method:'POST', body:{ find, replace, preview:true, artists: scopeArtists || undefined } });
        const area = $('#afr-preview-area');
        if(!r.changes.length){
          area.innerHTML = '<div class="muted">対象の公演名が見つかりませんでした</div>';
          return;
        }
        area.innerHTML = `<div class="muted" style="font-size:12px;margin-bottom:6px">${r.changes.length}件が変更されます:</div>
          <div style="max-height:30vh;overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin-bottom:10px">
            ${r.changes.map(c=>`<div style="font-size:12px;padding:5px 8px;background:#faf9f6;border:1px solid var(--line);border-radius:6px">${h(c.from)} → <b>${h(c.to)}</b></div>`).join('')}
          </div>
          <button class="btn gold" id="afr-apply" style="width:100%">この内容で適用する</button>`;
        $('#afr-apply').onclick = async () => {
          if(!confirm(`${r.changes.length}件の公演名を変更します。よろしいですか?`)) return;
          await withLoading($('#afr-apply'), async () => {
            try{
              const ar = await api('/artists/find-replace', { method:'POST', body:{ find, replace, artists: scopeArtists || undefined } });
              closeModal();
              popup(`${ar.updatedDays}件を変更しました`);
              if(onDone) onDone();
            }catch(e){ $('#afr-msg').textContent = e.message; }
          });
        };
      }catch(e){ $('#afr-msg').textContent = e.message; }
    });
  };
}

// 選択した複数の公演名(現場名の本体部分)をまとめて統一名称に変更する。会場一覧の一括改名と同様、
// 各行の【セクション等】表記はそのまま維持される(バックエンドのrebuildSiteNameが処理する)。
function openArtistBulkRename(artists, onDone){
  if(!artists.length) return;
  const title = artists.length === 1 ? `${h(artists[0])} の名前を変更` : `選択した${artists.length}件の公演名をまとめて変更`;
  modal(`<h3>${icon('edit',{size:'15px'})} ${title}</h3>
    ${artists.length > 1 ? `<div class="muted" style="font-size:12px;margin-bottom:10px">対象(${artists.length}件):</div>
    <div style="max-height:30vh;overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin-bottom:12px">
      ${artists.map(a=>`<div class="muted" style="font-size:12px;padding:5px 8px;background:#faf9f6;border:1px solid var(--line);border-radius:6px">${h(a)}</div>`).join('')}
    </div>` : ''}
    <label style="display:block;margin-bottom:10px">新しい公演名<br>
      <input type="text" id="abr-artist" value="${h(artists[0])}" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:8px;margin-top:4px">
    </label>
    <div class="muted" style="font-size:12px;margin-bottom:10px">各現場の【セクション等】の表記はそのまま維持されます。</div>
    <button class="btn gold" id="abr-run">変更を適用する</button>
    <div id="abr-msg" class="muted" style="margin-top:10px"></div>`);
  $('#abr-run').onclick = async () => {
    const newArtist = $('#abr-artist').value.trim();
    if(!newArtist){ $('#abr-msg').textContent = '新しい公演名を入力してください'; return; }
    if(!confirm(artists.length === 1 ? '公演名を変更します。よろしいですか?' : `選択した${artists.length}件を、まとめて変更します。よろしいですか?`)) return;
    await withLoading($('#abr-run'), async () => {
      try{
        const r = await api('/artists/bulk-rename', { method:'POST', body:{ artists, newArtist } });
        closeModal();
        popup(`${r.updatedDays}件を変更しました`);
        if(onDone) onDone();
      }catch(e){ $('#abr-msg').textContent = e.message; }
    });
  };
}

// 公演詳細モーダル。過去・今後の公演を今日を境に分けて表示する(会場詳細と同じ形式)。
async function openArtistModal(artist){
  const canRename = has('site_manage'); // 公演名の変更(手配者以上)
  let data;
  try{ data = await api(`/artist-history?artist=${encodeURIComponent(artist)}`); }
  catch(e){ popup(e.message, 'error'); return; }
  const item = r => `<button type="button" class="btn ghost sm artist-hist-item" data-date="${r.date}" data-site="${h(r.site)}" style="display:block;width:100%;text-align:left;margin-bottom:4px;white-space:normal">
    ${h(r.date)} ${h(r.site)}${r.venue?` <span class="muted">(${h(r.venue)})</span>`:''} <span class="muted">${r.cnt}名</span>${r.visited ? `<span class="visited-dot" title="行ったことがあります"></span>` : ''}
  </button>`;
  modal(`<h3>${icon('megaphone',{size:'15px'})} ${h(artist)}</h3>
    <div class="row" style="gap:8px;margin:2px 0 10px">
      <button type="button" class="btn ghost sm" id="artist-members-btn">${icon('users',{size:'13px'})} メンバーリスト</button>
      ${canRename ? `<button type="button" class="btn ghost sm" id="artist-rename-btn">${icon('edit',{size:'13px'})} 名前を変更</button>` : ''}
    </div>
    ${data.past.length ? `<div class="section-label" style="margin-top:6px">${icon('arrowLeft',{size:'10px'})} 過去の公演</div><div>${data.past.map(item).join('')}</div>` : ''}
    ${data.future.length ? `<div class="section-label" style="margin-top:12px">今後の公演 ${icon('arrowRight',{size:'10px'})}</div><div>${data.future.map(item).join('')}</div>` : ''}
    ${(!data.past.length && !data.future.length) ? '<div class="muted">この公演の現場情報はまだありません</div>' : ''}`);
  const membersBtn = $('#artist-members-btn');
  if(membersBtn) membersBtn.onclick = () => openArtistMemberList(artist);
  const renameBtn = $('#artist-rename-btn');
  if(renameBtn) renameBtn.onclick = (e) => { e.stopPropagation(); openArtistBulkRename([artist], () => openArtistModal(artist)); };
  document.querySelectorAll('#modal-layer .artist-hist-item').forEach(el => {
    el.onclick = () => { closeModal(); openSiteModal(el.dataset.date, el.dataset.site); };
  });
}

/* ===== 稼働サマリー(チーフ以上)。月間の出勤日数・シフト数・連勤・手配偏りを一覧できる。
   統計カード・手配担当バーをタップすると、その条件で一覧を絞り込める。 ===== */
async function pageSummary(app){
  if(!has('summary_view')){ notFound(app); return; }
  const st = PAGE_STATE.summary || (PAGE_STATE.summary = { month: MONTH, stat: null, mgr: null, sort: 'regno', mgrOpen: true });
  app.innerHTML = `<div class="loading-box"><span class="spinner"></span>読み込み中…</div>`;
  let data;
  try{ data = await api(`/summary?month=${st.month}`); }
  catch(e){ app.innerHTML = `<div class="msg err">${h(e.message)}</div>`; return; }

  const canPay = data.items.some(it => it.hours !== null);
  // 「気になる状況」の判定基準。閾値は運用しながら調整可能。
  const isOver = it => canPay && it.overtime >= 50;                                  // 残業50時間以上
  const isOverTotal = it => canPay && it.hours >= 100;                               // 月間稼働時間100時間超
  const isStreak = it => it.maxStreak >= 6;                                          // 6連勤以上
  const isFew = it => it.workDays > 0 && it.workDays <= 2;                           // 稼働2日以下
  const isSamesite = it => it.workDays >= 3 && it.topSiteCount / it.workDays >= 0.7; // 同じ現場に偏り

  const overTotalList = data.items.filter(isOverTotal);
  const streakList = data.items.filter(isStreak);
  const fewList = data.items.filter(isFew);
  const samesiteList = data.items.filter(isSamesite);
  const overList = data.items.filter(isOver);

  // 統計カード選択によるフィルタ
  let list = data.items;
  if(st.stat === 'overtotal') list = overTotalList;
  else if(st.stat === 'streak') list = streakList;
  else if(st.stat === 'few') list = fewList;
  else if(st.stat === 'samesite') list = samesiteList;
  else if(st.stat === 'over') list = overList;
  // 手配担当選択によるフィルタ(統計フィルタと併用可)
  if(st.mgr) list = list.filter(it => (it.manager_id ? 'm'+it.manager_id : 'chief:'+(it.ka||'未設定')) === st.mgr);

  // 一覧の並び替え(統計・手配担当のフィルタの有無に関わらず、常に適用できる)
  const listSortOptions = { regno:'登録番号順', rank:'ランク順', workDays:'稼働日数順', shifts:'稼働数順', maxStreak:'連勤数順', ...(canPay?{hours:'時間順', overtime:'残業順'}:{}) };
  const listSort = listSortOptions[st.sort] ? st.sort : 'regno';
  if(listSort === 'regno') list = [...list].sort((a,b) => String(a.regno||'').localeCompare(String(b.regno||''), undefined, {numeric:true}));
  else if(listSort === 'rank') list = [...list].sort((a,b) => rankOrder(a.rank) - rankOrder(b.rank) || String(a.regno||'').localeCompare(String(b.regno||''), undefined, {numeric:true}));
  else list = [...list].sort((a,b) => (b[listSort]||0) - (a[listSort]||0));

  const rowCls = it => isOverTotal(it) ? 'r-over' : isStreak(it) ? 'r-streak' : isFew(it) ? 'r-few' : '';
  const badges = it => {
    const b = [];
    if(isOverTotal(it)) b.push('<span class="sum-badge over">月100h超</span>');
    if(isStreak(it)) b.push(`<span class="sum-badge streak">${it.maxStreak}連勤</span>`);
    if(isFew(it)) b.push('<span class="sum-badge few">稼働少なめ</span>');
    if(isSamesite(it)) b.push('<span class="sum-badge samesite">同じ現場</span>');
    if(isOver(it)) b.push('<span class="sum-badge over">残業50h+</span>');
    if(it.workDays === 0) b.push('<span class="sum-badge zero">稼働なし</span>');
    return b.join(' ');
  };
  const mgrSortOptions = { shifts:'稼働数', workDays:'稼働日数', members:'人数' };
  const mgrSort = st.mgrSort || 'shifts';
  const sortedManagers = [...data.managers].sort((a,b)=>b[mgrSort]-a[mgrSort]);
  // グラフの割合は、選んでいる並び替え基準(人数/稼働数/稼働日数)に応じた合計を分母にする
  const mgrTotal = mgrSort === 'members' ? data.items.length : data.managers.reduce((s,m)=>s+(m[mgrSort]||0),0);
  const [y,mo] = st.month.split('-').map(Number);

  app.innerHTML = `
  <div class="sum-head sticky-filters">
    <h2 style="margin-bottom:0">${icon('barChart')} 稼働サマリー</h2>
    <div class="row" style="gap:8px;align-items:center">
      <button class="btn ghost sm" id="sum-prev">◀</button>
      <b id="sum-jump-month" title="タップして年月を選択" style="cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px">${y}年${mo}月</b>
      <button class="btn ghost sm" id="sum-next">▶</button>
    </div>
  </div>
  <div class="muted" style="margin-top:4px">全${data.items.length}名</div>

  <div class="sum-stats">
    <div class="sum-stat sum-stat-clickable ${st.stat==='overtotal'?'st-sel':''} st-over" data-stat="overtotal"><div class="sum-num" data-count="${overTotalList.length}">0</div><div class="sum-lbl">月100h超</div></div>
    <div class="sum-stat sum-stat-clickable ${st.stat==='streak'?'st-sel':''} st-streak" data-stat="streak"><div class="sum-num" data-count="${streakList.length}">0</div><div class="sum-lbl">6連勤以上</div></div>
    <div class="sum-stat sum-stat-clickable ${st.stat==='few'?'st-sel':''} st-few" data-stat="few"><div class="sum-num" data-count="${fewList.length}">0</div><div class="sum-lbl">稼働少なめ</div></div>
    <div class="sum-stat sum-stat-clickable ${st.stat==='samesite'?'st-sel':''} st-samesite" data-stat="samesite"><div class="sum-num" data-count="${samesiteList.length}">0</div><div class="sum-lbl">同じ現場ばかり</div></div>
    <div class="sum-stat sum-stat-clickable ${st.stat==='over'?'st-sel':''} st-over" data-stat="over"><div class="sum-num" data-count="${overList.length}">0</div><div class="sum-lbl">残業50h+</div></div>
    <div class="sum-stat"><div class="sum-num" data-count="${data.items.length}">0</div><div class="sum-lbl">全体</div></div>
  </div>

  <details class="card" style="margin-top:14px" id="mgr-details" ${st.mgrOpen?'open':''}>
    <summary style="cursor:pointer;font-weight:700;font-size:15px;color:var(--ink)">
      手配担当ごとの${mgrSortOptions[mgrSort]} <span class="muted" style="font-weight:400;font-size:12px">(${sortedManagers.length}件)</span>
    </summary>
    <div class="row" style="justify-content:flex-end;align-items:center;margin:10px 0">
      <select id="mgr-sort" style="font-size:12.5px;padding:5px 6px" onclick="event.stopPropagation()">
        ${Object.entries(mgrSortOptions).map(([k,l])=>`<option value="${k}" ${k===mgrSort?'selected':''}>${l}順</option>`).join('')}
      </select>
    </div>
    ${sortedManagers.map(m=>{
      const ratio = mgrTotal ? m[mgrSort]/mgrTotal : 0;
      const sel = st.mgr === m.key;
      return `<div class="mgr-row ${sel?'sel':''}" data-mgr="${h(m.key)}">
        <div class="mgr-name">${h(m.name)} <span class="muted">${m.members}人 / 稼働数${m.shifts}件 / 稼働日数${m.workDays}日</span></div>
        <div class="mgr-bar-wrap"><div class="mgr-bar" data-bar-width="${Math.max(ratio*100,1.5).toFixed(1)}%"></div><div class="mgr-val">${(ratio*100).toFixed(0)}%</div></div>
      </div>`;
    }).join('')}
  </details>

  ${(st.stat||st.mgr) ? `<div class="sum-filter"><b>絞り込み中</b>${st.stat?` / ${({overtotal:'月100h超',streak:'6連勤以上',few:'稼働少なめ',samesite:'同じ現場ばかり',over:'残業50h+'})[st.stat]}`:''}${st.mgr?` / ${h((data.managers.find(m=>m.key===st.mgr)||{}).name||'')}`:''}<button class="sum-clear" id="sum-clear">${icon('x')} 解除</button></div>` : ''}

  <div class="row" style="justify-content:flex-end;align-items:center;gap:8px;margin-top:14px;margin-bottom:-6px">
    <label class="muted" style="font-size:12.5px">並び替え</label>
    <select id="list-sort" style="font-size:12.5px;padding:5px 6px">
      ${Object.entries(listSortOptions).map(([k,l])=>`<option value="${k}" ${k===listSort?'selected':''}>${l}</option>`).join('')}
    </select>
  </div>

  <div class="card" style="margin-top:14px;padding:0">
    <div class="sum-table-wrap">
    <table class="sum-table">
      <tr><th>氏名</th><th>ランク</th><th>手配担当</th><th class="c">稼働日数</th><th class="c">稼働数</th><th class="c">最長連勤</th>${canPay?'<th class="c">時間</th><th class="c">残業</th>':''}<th>状況</th></tr>
      ${list.map(it=>`<tr class="sum-row ${rowCls(it)}">
        <td class="s-name"><span class="name-link" data-goto-uid="${it.uid}">${h(it.name)}</span></td>
        <td>${h(it.rank)||'—'}</td><td>${h(it.manager_name)}</td>
        <td class="c num">${it.workDays}</td><td class="c num">${it.shifts}</td><td class="c num ${isStreak(it)?'hot':''}">${it.maxStreak}</td>
        ${canPay?`<td class="c num ${isOverTotal(it)?'hot':''}">${it.hours!=null?it.hours.toFixed(1):'—'}</td><td class="c num ${isOver(it)?'hot':''}">${it.overtime!=null?it.overtime.toFixed(1):'—'}</td>`:''}
        <td>${badges(it)||'—'}</td>
      </tr>`).join('') || `<tr><td colspan="${canPay?8:6}" class="muted" style="text-align:center;padding:16px">該当する人はいません</td></tr>`}
    </table>
    </div>
    <div class="sum-cards">
      ${list.map(it=>`<div class="sum-card ${rowCls(it)}">
        <div class="sc-top"><span class="sc-name name-link" data-goto-uid="${it.uid}">${h(it.name)}</span><span class="sc-rank">${h(it.rank)||''}</span></div>
        <div class="sc-mgr">${h(it.manager_name)}</div>
        <div class="sc-stats">
          <div class="sc-stat"><b>${it.workDays}</b><span>稼働日</span></div>
          <div class="sc-stat"><b>${it.shifts}</b><span>稼働数</span></div>
          <div class="sc-stat ${isStreak(it)?'hot':''}"><b>${it.maxStreak}</b><span>連勤</span></div>
          ${canPay?`<div class="sc-stat ${isOver(it)?'hot':''}"><b>${it.overtime!=null?it.overtime.toFixed(1):'—'}</b><span>残業h</span></div>`:''}
        </div>
        <div class="sc-badges">${badges(it)}</div>
      </div>`).join('') || '<div class="muted" style="text-align:center;padding:16px">該当する人はいません</div>'}
    </div>
  </div>`;

  $('#sum-prev').onclick = () => { st.month = shiftMonth(st.month,-1); pageSummary(app); };
  $('#sum-next').onclick = () => { st.month = shiftMonth(st.month, 1); pageSummary(app); };
  $('#sum-jump-month').onclick = () => {
    openMonthJumpModal(st.month, (ym) => { st.month = ym; pageSummary(app); });
  };
  app.querySelectorAll('[data-stat]').forEach(el => el.onclick = () => {
    st.stat = st.stat === el.dataset.stat ? null : el.dataset.stat;
    pageSummary(app);
  });
  app.querySelectorAll('[data-mgr]').forEach(el => el.onclick = () => {
    st.mgr = st.mgr === el.dataset.mgr ? null : el.dataset.mgr;
    pageSummary(app);
  });
  const cb = $('#sum-clear'); if(cb) cb.onclick = () => { st.stat=null; st.mgr=null; pageSummary(app); };
  $('#mgr-sort').onchange = (e) => { st.mgrSort = e.target.value; pageSummary(app); };
  $('#mgr-details').ontoggle = (e) => { st.mgrOpen = e.target.open; };
  $('#list-sort').onchange = (e) => { st.sort = e.target.value; pageSummary(app); };
  animateCounts(app);
  animateBars(app);
  staggerRows(app, '.sum-row, .sum-card');
  wireNameLinks(app); // フィルタ・並び替えでの再描画はrender()を経由しないため個別に配線する
}
// 日付×人のマトリックス表(スケジュール一覧・現場の稼働表で共通利用)。
// rows[].days は dates と同じ長さ・順序({status, detail, sites, note})を持つ配列。
const MATRIX_STATUS_INFO = {
  off:  { label:'休', cls:'cell-off' },
  x:    { label:'NG', cls:'cell-x' },
  ok:   { label:'OK', cls:'cell-ok' },
  paid: { label:'有', cls:'cell-paid' },
  none: { label:'', cls:'cell-none' },
};
function matrixCellHtml(cell, isToday, date){
  const todayCls = isToday ? ' matrix-today' : '';
  if(cell.status === 'work'){
    const firstSite = (cell.sites && cell.sites[0]) || '';
    return `<td class="matrix-cell cell-work${todayCls} cell-site-link" title="${h(cell.detail)}" data-date="${date}" data-site="${h(firstSite)}">${h(cell.detail)}</td>`;
  }
  const info = MATRIX_STATUS_INFO[cell.status] || MATRIX_STATUS_INFO.none;
  return `<td class="matrix-cell ${info.cls}${todayCls}">${info.label}</td>`;
}
function renderMatrixTable(dates, rows, opts={}){
  const today = jstToday();
  const dateHead = dates.map(d => {
    const [,mo,da] = d.split('-').map(Number);
    const wd = new Date(d+'T00:00:00+09:00').getDay();
    return { d, mo, da, wd, isToday: d===today };
  });
  // 表が縦に長くなる(メンバー数が多い)ことがあるため、スクロール案内は表の下ではなく
  // 上に出す(下に出すと、案内を見る前に諦めてしまう恐れがあるため)。
  const scrollHint = dates.length>2 && window.innerWidth<640
    ? `<div class="muted" style="font-size:11px;padding:6px 10px 0">横にスクロールできます →</div>` : '';
  return `${scrollHint}<div class="sched-wrap${opts.scrollable?' sched-wrap-scroll':''}">
    <table class="matrix-table">
      <tr>
        <th class="matrix-name-col">氏名</th>
        ${dateHead.map(dh=>`<th class="${dh.isToday?'matrix-today':''}">${dh.mo}/${dh.da}<br><span class="muted" style="font-weight:400">(${WD[dh.wd]})</span></th>`).join('')}
      </tr>
      ${rows.map(r=>`<tr>
        <td class="matrix-name-col"><a href="#/schedule/${r.id}">${h(r.name)}</a><br><span class="muted" style="font-size:9.5px">${h(r.regno)}${r.rank?' '+h(r.rank):''} ${h(r.managerName)}</span></td>
        ${r.days.map((cell,i)=>matrixCellHtml(cell, dateHead[i].isToday, dateHead[i].d)).join('')}
      </tr>`).join('') || `<tr><td colspan="${dates.length+1}" class="muted" style="text-align:center;padding:16px">該当するメンバーはいません</td></tr>`}
    </table>
  </div>`;
}
// マトリックス表内の現場セルタップで現場詳細を開く(呼び出し元のコンテナ要素に対して結線する)
function wireMatrixCellClicks(container){
  container.querySelectorAll('.cell-site-link').forEach(td => td.onclick = () => {
    if(td.dataset.site) openSiteModal(td.dataset.date, td.dataset.site);
  });
}

/* ===== スケジュール一覧(チーフ以上)。日付×人のマトリックス表(チーフ予定表のイメージ)。
   現場の人は現場名(タップで現場詳細)、休みの人は休暇/NG/1日OK/有給を表示。停止中も含む。 ===== */
async function pageDaySchedule(app){
  if(!has('day_schedule_view')){ notFound(app); return; }
  const savedSort = localStorage.getItem('ds-sort') || 'regno';
  const st = PAGE_STATE.daySchedule || (PAGE_STATE.daySchedule = { from: jstToday(), days: 7, sort: savedSort, ka:'', han:'', mgr:'' });
  app.innerHTML = `<div class="loading-box"><span class="spinner"></span>読み込み中…</div>`;
  let data;
  try{ data = await api(`/day-schedule?from=${st.from}&days=${st.days}`); }
  catch(e){ app.innerHTML = `<div class="msg err">${h(e.message)}</div>`; return; }

  const today = jstToday();
  const dateHead = data.dates.map(d => {
    const [,mo,da] = d.split('-').map(Number);
    return { mo, da };
  });

  // フィルタの選択肢は、実際に取得したデータに存在する値だけを出す
  const kaOptions = [...new Set(data.rows.map(r=>r.ka).filter(Boolean))].sort();
  const hanOptions = [...new Set(data.rows.map(r=>r.han).filter(Boolean))].sort();
  const mgrPairs = {};
  for(const r of data.rows){ if(r.managerId) mgrPairs[r.managerId] = r.managerName; }
  const mgrOptions = Object.entries(mgrPairs).sort((a,b)=>String(a[1]).localeCompare(String(b[1]),'ja'));

  // フィルタ適用(st.mgrは managerId の文字列、または担当未設定(課ごとのチーフ手配)を表す '__chief:1課'/'__chief:2課')
  let list = data.rows.filter(r =>
    (!st.ka  || r.ka === st.ka) &&
    (!st.han || r.han === st.han) &&
    (!st.mgr || (st.mgr.startsWith('__chief:') ? (!r.managerId && r.ka === st.mgr.slice(8)) : String(r.managerId)===String(st.mgr)))
  );
  // ソート適用(登録番号は数値、ランクはA→Eの順、それ以外は日本語として比較する)
  list = [...list].sort((a,b) => {
    if(st.sort === 'regno') return String(a.regno||'').localeCompare(String(b.regno||''), undefined, {numeric:true});
    if(st.sort === 'rank') return rankOrder(a.rank) - rankOrder(b.rank) || String(a.regno||'').localeCompare(String(b.regno||''), undefined, {numeric:true});
    const av = a[st.sort] || '', bv = b[st.sort] || '';
    return String(av).localeCompare(String(bv), 'ja') || String(a.regno||'').localeCompare(String(b.regno||''), undefined, {numeric:true});
  });

  const opt = (val, label, cur) => `<option value="${h(val)}" ${cur===val?'selected':''}>${h(label)}</option>`;

  app.innerHTML = `
  <h2 style="margin-bottom:4px">${icon('layoutGrid')} スケジュール一覧</h2>
  <div class="sticky-filters">
    <div class="card" style="margin-bottom:14px">
      <div class="row" style="align-items:center;gap:10px">
        <button class="btn ghost sm" id="ds-prev">◀ 前の${st.days}日間</button>
        <b id="ds-jump-date" title="タップして開始日を選択" style="min-width:120px;text-align:center;cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px">${dateHead[0].mo}/${dateHead[0].da} 〜 ${dateHead[dateHead.length-1].mo}/${dateHead[dateHead.length-1].da}</b>
        <button class="btn ghost sm" id="ds-next">次の${st.days}日間 ▶</button>
        ${st.from!==today?'<button class="btn ghost sm" id="ds-today">今日に戻る</button>':''}
      </div>
    </div>
    <div class="card" style="margin-bottom:0">
      <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
        <label class="muted" style="font-size:12px">並び替え</label>
        <select id="ds-sort">
          ${opt('regno','登録番号順',st.sort)}${opt('rank','ランク順',st.sort)}${opt('ka','課順',st.sort)}${opt('han','班順',st.sort)}${opt('managerName','手配担当順',st.sort)}
        </select>
        <label class="muted" style="font-size:12px;margin-left:8px">絞り込み</label>
        <select id="ds-ka"><option value="">課:すべて</option>${kaOptions.map(v=>opt(v,v,st.ka)).join('')}</select>
        <select id="ds-han"><option value="">班:すべて</option>${hanOptions.map(v=>opt(v,v,st.han)).join('')}</select>
        <select id="ds-mgr">
          <option value="">手配担当:すべて</option>
          ${mgrOptions.map(([id,name])=>opt(id,name,st.mgr)).join('')}
          <option value="__chief:1課" ${st.mgr==='__chief:1課'?'selected':''}>チーフ手配(1課)</option>
          <option value="__chief:2課" ${st.mgr==='__chief:2課'?'selected':''}>チーフ手配(2課)</option>
        </select>
        ${(st.ka||st.han||st.mgr)?`<button class="btn ghost sm" id="ds-clear">${icon('x')} 絞り込み解除</button>`:''}
      </div>
    </div>
  </div>
  <div class="card" style="padding:0;margin-top:14px">
    ${renderMatrixTable(data.dates, list)}
  </div>
  <div class="muted" style="margin-top:8px;font-size:12px">${list.length}人 表示中(全${data.rows.length}人)</div>`;

  $('#ds-prev').onclick = () => { st.from = shiftDate(st.from,-st.days); pageDaySchedule(app); };
  $('#ds-next').onclick = () => { st.from = shiftDate(st.from, st.days); pageDaySchedule(app); };
  const tb = $('#ds-today'); if(tb) tb.onclick = () => { st.from = jstToday(); pageDaySchedule(app); };
  $('#ds-jump-date').onclick = () => {
    modal(`<h3>${icon('calendar',{size:'15px'})} 表示する開始日を選択</h3>
      <input type="date" id="ds-jump-date-input" value="${h(st.from)}" style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--line);border-radius:8px;font-size:16px">
      <div class="row" style="margin-top:14px"><button class="btn gold" id="ds-jump-date-go">この日から表示する</button></div>`);
    $('#ds-jump-date-go').onclick = () => {
      const v = $('#ds-jump-date-input').value;
      if(!v) return;
      st.from = v;
      closeModal();
      pageDaySchedule(app);
    };
  };
  $('#ds-sort').onchange = (e) => { st.sort = e.target.value; localStorage.setItem('ds-sort', st.sort); pageDaySchedule(app); };
  $('#ds-ka').onchange = (e) => { st.ka = e.target.value; pageDaySchedule(app); };
  $('#ds-han').onchange = (e) => { st.han = e.target.value; pageDaySchedule(app); };
  $('#ds-mgr').onchange = (e) => { st.mgr = e.target.value; pageDaySchedule(app); };
  const cb = $('#ds-clear'); if(cb) cb.onclick = () => { st.ka=''; st.han=''; st.mgr=''; pageDaySchedule(app); };
  wireMatrixCellClicks(app);
}

/* ===== メンバー分析(準備中) ===== */
/* ===== メンバー分析(チーフ以上)。拠点・課・班・ランクの構成を、全体・課ごとの両方で確認できる。
   手配担当ごとの内訳(拠点・班・ランク)も見られる。カードをタップするとメンバー一覧に絞り込める。 ===== */
async function pageMemberStats(app){
  if(!has('member_stats_view')){ notFound(app); return; }
  const st = PAGE_STATE.memberStats || (PAGE_STATE.memberStats = { tab:'全体', filter:null, mgrOpen:null, sort:'regno' });
  app.innerHTML = `<div class="muted">集計中…</div>`;
  let data;
  try{ data = await api('/member-stats'); }
  catch(e){ app.innerHTML = `<div class="msg err">${h(e.message)}</div>`; return; }

  const canEdit = has('site_manage') || has('account_manage');

  // 割合バー付きの内訳リスト。各行をタップすると、その条件でメンバー一覧をフィルタする。
  const breakdown = (title, category, list, opt={}) => {
    const sorted = [...list];
    const sumCount = sorted.reduce((s,x)=>s+x.count,0);
    return `<div class="card" style="margin-bottom:14px">
      <h3 style="margin-bottom:12px">${title} <span class="muted" style="font-weight:400;font-size:12px">(計${sumCount}人)</span></h3>
      ${sorted.map(x=>{
        const sel = st.filter && st.filter.category===category && st.filter.value===x.key && st.filter.ka===(opt.ka||null);
        return `<div class="stat-row stat-row-clickable ${sel?'stat-row-sel':''}" data-category="${category}" data-value="${h(x.key)}" data-ka="${h(opt.ka||'')}">
          <div class="stat-name"><span>${h(x.key)}${opt.suffix||''}</span><span class="stat-count">${x.count}人 / ${(x.ratio*100).toFixed(1)}%</span></div>
          <div class="stat-bar-wrap"><div class="stat-bar" data-bar-width="${Math.max(x.ratio*100,1.5).toFixed(1)}%"></div></div>
        </div>`;
      }).join('') || '<div class="muted">データがありません</div>'}
    </div>`;
  };

  // フィルタ条件に一致するメンバーを抽出する
  const filteredMembers = () => {
    if(!st.filter) return [];
    const { category, value, ka } = st.filter;
    if(category === 'manager'){
      if(value === null) return data.members.filter(m => !m.managerId && m.ka === st.filter.mgrKa);
      return data.members.filter(m => m.managerId === value);
    }
    return data.members.filter(m => {
      if(ka && m.ka !== ka) return false;
      return (m[category] || '未設定') === value;
    });
  };

  const tabHan = st.tab==='全体' ? data.byHan : (data.byHanKa[st.tab]||[]);
  const tabRank = st.tab==='全体' ? data.byRank : (data.byRankKa[st.tab]||[]);

  app.innerHTML = `
  <h2 style="margin-bottom:4px">${icon('trendingUp')} メンバー分析</h2>

  <div class="ka-tabs sticky-filters">
    ${['全体','1課','2課'].map(t=>`<button class="ka-tab ${t==='1課'?'ka1':t==='2課'?'ka2':''} ${st.tab===t?'on':''}" data-tab="${t}">${t}</button>`).join('')}
  </div>

  <div class="row" style="gap:14px;flex-wrap:wrap;align-items:flex-start">
    <div style="flex:1;min-width:280px">
      ${st.tab==='全体' ? breakdown('拠点別', 'base', data.byBase) : ''}
      ${st.tab==='全体' ? breakdown('課別', 'ka', data.byKa) : ''}
      ${breakdown(`所属班別(${st.tab})`, 'han', tabHan, {ka: st.tab==='全体'?null:st.tab})}
    </div>
    <div style="flex:1;min-width:280px">
      ${breakdown(`ランク別(${st.tab})`, 'rank', tabRank, {suffix:'ランク', ka: st.tab==='全体'?null:st.tab})}
    </div>
  </div>

  <div class="card" style="margin-bottom:14px">
    <h3 style="margin-bottom:10px">手配担当ごとの内訳 <span class="muted" style="font-weight:400;font-size:12px">(計${data.byManager.reduce((s,m)=>s+m.count,0)}人)</span></h3>
    ${data.byManager.map(m=>{
      const open = st.mgrOpen === m.key;
      return `<div class="mgr-row ${open?'sel':''}" data-mgropen="${h(m.key)}">
        <div class="mgr-name">${h(m.name)} <span class="muted">${m.count}人 / ${(m.ratio*100).toFixed(1)}%</span></div>
        <div class="mgr-bar-wrap"><div class="mgr-bar" data-bar-width="${Math.max(m.ratio*100,1.5).toFixed(1)}%"></div><div class="mgr-val">${(m.ratio*100).toFixed(0)}%</div></div>
        ${open?`<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line);display:flex;gap:16px;flex-wrap:wrap;font-size:12.5px">
          <div><b>拠点:</b> ${m.base.map(x=>`${h(x.key)}${x.count}`).join('、')||'—'}</div>
          <div><b>班:</b> ${m.han.map(x=>`${h(x.key)}${x.count}`).join('、')||'—'}</div>
          <div><b>ランク:</b> ${m.rank.map(x=>`${h(x.key)}${x.count}`).join('、')||'—'}</div>
          <button class="btn ghost xs mgr-detail-btn" data-mgrid="${m.managerId===null?'':m.managerId}" data-mgrka="${h(m.ka||'')}">この担当のメンバーを見る</button>
        </div>`:''}
      </div>`;
    }).join('')}
  </div>

  <div class="card" id="ms-filter-result" style="${st.filter?'':'display:none'}">
    <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:10px">
      <h3 id="ms-filter-title">対象メンバー</h3>
      <button class="btn ghost sm" id="ms-filter-clear">${icon('x')} フィルタ解除</button>
    </div>
    <div id="ms-filter-body"></div>
  </div>`;

  const renderFilterResult = () => {
    const box = $('#ms-filter-result');
    if(!st.filter){ box.style.display='none'; return; }
    box.style.display = '';
    const msSortOptions = { regno:'登録番号順', rank:'ランク順', name:'氏名順(あ→ん)', han:'班順' };
    const sortMsList = (arr) => {
      const sorted = [...arr];
      if(st.sort === 'regno') sorted.sort((a,b) => String(a.regno||'').localeCompare(String(b.regno||''), undefined, {numeric:true}));
      else if(st.sort === 'rank') sorted.sort((a,b) => rankOrder(a.rank) - rankOrder(b.rank) || String(a.regno||'').localeCompare(String(b.regno||''), undefined, {numeric:true}));
      else if(st.sort === 'name') sorted.sort((a,b) => String(a.name||'').localeCompare(String(b.name||''), 'ja'));
      else if(st.sort === 'han') sorted.sort((a,b) => String(a.han||'').localeCompare(String(b.han||''), 'ja') || String(a.regno||'').localeCompare(String(b.regno||''), undefined, {numeric:true}));
      return sorted;
    };
    const list = sortMsList(filteredMembers());
    const catLabels = { base:'拠点', ka:'課', han:'班', rank:'ランク', manager:'手配担当' };
    const displayValue = st.filter.category === 'manager' ? st.filter.label : st.filter.value;
    $('#ms-filter-title').textContent = `${catLabels[st.filter.category]}: ${displayValue} (${list.length}人)`;
    $('#ms-filter-body').innerHTML = `
      <div class="row" style="justify-content:flex-end;align-items:center;gap:6px;margin-bottom:8px">
        <label class="muted" style="font-size:12px">並び替え</label>
        <select id="ms-sort" style="font-size:12.5px;padding:5px 6px">
          ${Object.entries(msSortOptions).map(([k,l])=>`<option value="${k}" ${k===st.sort?'selected':''}>${l}</option>`).join('')}
        </select>
      </div>
      <table class="list pc-only">
        <tr><th>氏名</th><th>登録番号</th><th>ランク</th><th>拠点</th><th>課</th><th>班</th><th>手配担当</th><th></th></tr>
        ${list.map(m=>`<tr>
          <td>${h(m.name)}</td><td>${h(m.regno)}</td><td>${m.rank?h(m.rank)+'ランク':'—'}</td>
          <td>${h(m.base)||'—'}</td><td>${h(m.ka)||'—'}</td><td>${h(m.han)||'—'}</td><td>${h(m.managerName)||'—'}</td>
          <td class="nowrap">
            <button class="btn ghost xs ms-sched" data-id="${m.id}">${icon('calendar',{size:'11px'})}予定</button>
            ${canEdit?`<button class="btn ghost xs ms-edit" data-id="${m.id}">${icon('edit',{size:'11px'})}編集</button>`:''}
          </td>
        </tr>`).join('') || '<tr><td colspan="8" class="muted">該当なし</td></tr>'}
      </table>
      <div class="cards sp-only">
        ${list.map(m=>`<div class="dcard">
          <div class="dcard-head"><span class="dcard-title">${h(m.name)}</span><span class="dcard-sub">${h(m.regno)}</span></div>
          <div class="drow"><span class="dk">ランク/拠点</span><span class="dv">${m.rank?h(m.rank)+'ランク':'—'} / ${h(m.base)||'—'}</span></div>
          <div class="drow"><span class="dk">課/班</span><span class="dv">${h(m.ka)||'—'} / ${h(m.han)||'—'}</span></div>
          <div class="drow"><span class="dk">手配担当</span><span class="dv">${h(m.managerName)||'—'}</span></div>
          <div class="dcard-actions">
            <button class="btn ghost sm ms-sched" data-id="${m.id}">${icon('calendar')} 予定を見る</button>
            ${canEdit?`<button class="btn ghost sm ms-edit" data-id="${m.id}">${icon('edit')} 編集</button>`:''}
          </div>
        </div>`).join('') || '<div class="muted">該当なし</div>'}
      </div>`;
    const msSortSel = $('#ms-sort'); if(msSortSel) msSortSel.onchange = (e) => { st.sort = e.target.value; renderFilterResult(); };
    $('#ms-filter-body').querySelectorAll('.ms-sched').forEach(b => b.onclick = () => { location.hash = '#/schedule/'+b.dataset.id; });
    $('#ms-filter-body').querySelectorAll('.ms-edit').forEach(b => b.onclick = async () => {
      const users = await getUsers();
      const u = users.find(x => String(x.id)===String(b.dataset.id));
      if(!u){ popup('ユーザー情報の取得に失敗しました','error'); return; }
      const managers = await api('/managers').catch(()=>[]);
      openMemberEdit(u, users, managers);
    });
  };

  app.querySelectorAll('[data-tab]').forEach(el => el.onclick = () => {
    st.tab = el.dataset.tab; st.filter = null; pageMemberStats(app);
  });
  app.querySelectorAll('[data-category]').forEach(el => el.onclick = () => {
    const category = el.dataset.category, value = el.dataset.value, ka = el.dataset.ka || null;
    if(st.filter && st.filter.category===category && st.filter.value===value && st.filter.ka===ka){ st.filter = null; }
    else { st.filter = { category, value, ka }; }
    pageMemberStats(app);
  });
  app.querySelectorAll('[data-mgropen]').forEach(el => el.onclick = (e) => {
    if(e.target.closest('.mgr-detail-btn')) return;
    st.mgrOpen = st.mgrOpen === el.dataset.mgropen ? null : el.dataset.mgropen;
    pageMemberStats(app);
  });
  app.querySelectorAll('.mgr-detail-btn').forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    const mgrId = b.dataset.mgrid ? Number(b.dataset.mgrid) : null;
    const mgrKa = b.dataset.mgrka;
    const mgrEntry = data.byManager.find(m => mgrId===null ? (m.managerId===null && m.ka===mgrKa) : m.managerId===mgrId);
    st.filter = { category:'manager', value: mgrId, ka: null, mgrKa, label: mgrEntry ? mgrEntry.name : '' };
    pageMemberStats(app);
  });
  const cb = $('#ms-filter-clear'); if(cb) cb.onclick = () => { st.filter = null; pageMemberStats(app); };
  renderFilterResult();
  if(st.filter){ $('#ms-filter-result').scrollIntoView({ behavior:'smooth', block:'nearest' }); }
  animateBars(app);
  staggerRows(app, '.stat-row, .mgr-row');
}


/* ===== メンバー一覧(チーフ以上)。1課/2課タブ。2課優先表示 ===== */
async function pageMembers(app){
  if(!has('members_view')){ notFound(app); return; }
  const users = await getUsers(true);
  const managers = await api('/managers');
  const st = PAGE_STATE.members || (PAGE_STATE.members = { tab:'2課', q:'', mgr:'', sort:'regno' }); // 既定は2課(主に2課が使うため)
  const kaOf = u => u.ka || '未設定';
  const cnt2 = users.filter(u=>kaOf(u)==='2課').length;
  const cnt1 = users.filter(u=>kaOf(u)==='1課').length;
  const cntX = users.filter(u=>!u.ka).length;

  const isHandler = has('site_manage') || has('account_manage');
  const skillBtn = u => `<button class="btn ghost sm icon-btn" data-skill="${u.id}" title="できること編集">${icon('star')}</button>`;
  const editBtn = u => isHandler
    ? `<button class="btn ghost sm icon-btn" data-edit="${u.id}" title="編集">${icon('edit')}</button>`
    : `<button class="btn ghost sm icon-btn" data-skill="${u.id}" title="できること編集">${icon('star')}</button>`;
  const schedBtn = (u,cls='gold') => `<button class="btn ${cls} sm icon-btn go-sched" data-uid="${u.id}" title="スケジュール">${icon('calendar')}</button>`;
  const goEditBtn = u => isHandler ? `<button class="btn ghost sm icon-btn go-edit" data-uid="${u.id}" title="現場入力">${icon('edit')}</button>` : '';
  const canMemberSummary = has('member_summary_view');
  const goSummaryBtn = u => canMemberSummary ? `<button class="btn ghost sm icon-btn go-year-summary" data-uid="${u.id}" title="年間サマリー">${icon('barChart')}</button>` : '';

  // 並び替え選択肢。ランクは必ず含める(A〜Eランクの昇順)。
  const memberSortOptions = { regno:'登録番号順', rank:'ランク順', name:'氏名順(あ→ん)', han:'班順' };
  const sortList = (list) => {
    const sorted = [...list];
    if(st.sort === 'regno') sorted.sort((a,b) => String(a.regno||'').localeCompare(String(b.regno||''), undefined, {numeric:true}));
    else if(st.sort === 'rank') sorted.sort((a,b) => rankOrder(a.rank) - rankOrder(b.rank) || String(a.regno||'').localeCompare(String(b.regno||''), undefined, {numeric:true}));
    else if(st.sort === 'name') sorted.sort((a,b) => String(a.name||'').localeCompare(String(b.name||''), 'ja'));
    else if(st.sort === 'han') sorted.sort((a,b) => String(a.han||'').localeCompare(String(b.han||''), 'ja') || String(a.regno||'').localeCompare(String(b.regno||''), undefined, {numeric:true}));
    return sorted;
  };

  // リスト部分だけを再構築する。検索欄などフォームのinput要素はここでは一切触らない
  // (input要素をDOMから作り直すと、スマホでソフトウェアキーボードが閉じてしまうため)
  const renderList = () => {
    const tab = st.tab, q = st.q.trim(), fmgr = st.mgr;
    const inTab = u => tab==='未設定' ? !u.ka : kaOf(u)===tab;
    const matchQ = u => !q || (u.name||'').includes(q) || (u.regno||'').includes(q) || (u.han||'').includes(q) || (u.station||'').includes(q);
    const matchMgr = u => {
      if(!fmgr) return true;
      if(fmgr==='__chief') return !u.manager_id;     // チーフ手配
      return String(u.manager_id)===String(fmgr);
    };
    const list = sortList(users.filter(u=>inTab(u)&&matchQ(u)&&matchMgr(u)));
    const area = $('#m-list-area'); if(!area) return;
    area.innerHTML = `
      <div class="row" style="margin:2px 0 10px;gap:10px;align-items:center;flex-wrap:wrap">
        <div class="muted">${list.length}名 表示中</div>
        <div class="row" style="gap:6px;align-items:center;margin-left:auto">
          <label class="muted" style="font-size:12px">並び替え</label>
          <select id="m-sort" style="font-size:12.5px;padding:5px 6px">
            ${Object.entries(memberSortOptions).map(([k,l])=>`<option value="${k}" ${k===st.sort?'selected':''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>
      ${isHandler?`<div class="row" id="m-bulk-bar" style="margin:2px 0 10px;gap:8px;align-items:center">
        <span class="muted">選択中: <span id="m-sel-count">0</span>件</span>
        <button class="btn ghost sm" id="m-bulk-mgr" disabled>選択した人の手配担当を変更</button>
      </div>`:''}
      <div class="list-scroll pc-only">
      <table class="list ka-table ka-${tab==='1課'?'1':'2'}">
      <tr>${isHandler?'<th><input type="checkbox" id="m-check-all"></th>':''}<th style="text-align:left">氏名</th><th>登録番号</th><th>ランク</th><th>班</th><th>手配担当</th><th>最寄駅</th><th>できること</th><th></th></tr>
      ${list.map(u=>`<tr>
        ${isHandler?`<td><input type="checkbox" class="m-check" data-id="${u.id}"></td>`:''}
        <td style="text-align:left"><b class="name-link" data-goto-uid="${u.id}">${h(u.name)}</b></td><td>${h(u.regno)}${baseFromRegno(u.regno)?` <span class="muted" style="font-size:11px">(${baseFromRegno(u.regno)})</span>`:''}</td>
        <td>${h(u.rank)}</td><td>${h(u.han)}</td><td>${h(managerName(u,users))}</td><td>${h(u.station)}</td>
        <td class="wrapcell">${h(u.skills)}</td>
        <td>${editBtn(u)} ${schedBtn(u,'ghost')} ${goEditBtn(u)} ${goSummaryBtn(u)}</td>
      </tr>`).join('') || `<tr><td colspan="${isHandler?8:7}" class="muted" style="text-align:center;padding:16px">該当するメンバーはいません</td></tr>`}
      </table>
      </div>
      <div class="cards sp-only">
      ${list.map(u=>`<div class="dcard ka-${kaOf(u)==='1課'?'1':'2'}">
        <div class="dcard-head"><span style="display:flex;align-items:center;gap:8px">${isHandler?`<input type="checkbox" class="m-check" data-id="${u.id}">`:''}<span class="dcard-title name-link" data-goto-uid="${u.id}">${h(u.name)}</span></span></div>
        <div class="drow"><span class="dk">登録番号</span><span class="dv">${h(u.regno)}${baseFromRegno(u.regno)?` (${baseFromRegno(u.regno)})`:''}</span></div>
        <div class="drow"><span class="dk">ランク / 班</span><span class="dv">${h(u.rank)||'—'} / ${h(u.han)||'—'}</span></div>
        <div class="drow"><span class="dk">手配担当</span><span class="dv">${h(managerName(u,users))}</span></div>
        <div class="drow"><span class="dk">最寄駅</span><span class="dv">${h(u.station)||'—'}</span></div>
        <div class="drow"><span class="dk">できること</span><span class="dv">${h(u.skills)||'<span class="muted">（未設定）</span>'}</span></div>
        <div class="dcard-actions">
          ${editBtn(u)}
          ${schedBtn(u)}
          ${goEditBtn(u)}
          ${goSummaryBtn(u)}
        </div>
      </div>`).join('') || '<div class="muted" style="text-align:center;padding:16px">該当するメンバーはいません</div>'}
      </div>
`;
    wireNameLinks(area);
    const sortSel = $('#m-sort'); if(sortSel) sortSel.onchange = (e) => { st.sort = e.target.value; renderList(); };
    area.querySelectorAll('.go-sched').forEach(b=>b.onclick=()=>{ location.hash='#/schedule/'+b.dataset.uid; });
    area.querySelectorAll('.go-year-summary').forEach(b=>b.onclick=()=>{ location.hash='#/member-summary/'+b.dataset.uid; });
    area.querySelectorAll('.go-edit').forEach(b=>b.onclick=()=>{
      const uid = b.dataset.uid;
      const proceed = () => goTo('#/edit/' + uid);
      if(ME.handler !== 1 && ME.role !== 'admin'){ openHandlerPin(proceed); return; }
      proceed();
    });
    area.querySelectorAll('[data-skill]').forEach(b => b.onclick = async () => {
      const u = users.find(x=>x.id==b.dataset.skill);
      const v = prompt(`${u.name} のできることリスト(カンマ区切り)`, u.skills||'');
      if(v==null) return;
      await withLoading(b, async () => {
        await api('/users/'+u.id, { method:'PATCH', body:{ skills:v } });
        USERS_CACHE = null; render();
      });
    });
    area.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
      openMemberEdit(users.find(x=>x.id==b.dataset.edit), users, managers);
    });

    // 複数選択・手配担当の一括変更
    if(isHandler){
      const updateBulkBar = () => {
        const checked = area.querySelectorAll('.m-check:checked');
        const cnt = $('#m-sel-count'); if(cnt) cnt.textContent = checked.length;
        const btn = $('#m-bulk-mgr'); if(btn) btn.disabled = checked.length === 0;
      };
      const checkAll = $('#m-check-all');
      if(checkAll) checkAll.onchange = () => {
        area.querySelectorAll('.m-check').forEach(cb => cb.checked = checkAll.checked);
        updateBulkBar();
      };
      area.querySelectorAll('.m-check').forEach(cb => cb.onchange = updateBulkBar);
      updateBulkBar();
      const bulkBtn = $('#m-bulk-mgr');
      if(bulkBtn) bulkBtn.onclick = () => {
        const ids = [...area.querySelectorAll('.m-check:checked')].map(cb => Number(cb.dataset.id));
        if(!ids.length) return;
        modal(`<h3>手配担当をまとめて変更</h3>
          <div class="muted" style="margin-bottom:10px">選択した${ids.length}名の担当手配者を、まとめて変更します。</div>
          <select id="bm-mgr" style="width:100%">
            <option value="">チーフ手配(担当なし)</option>
            ${managers.map(m=>`<option value="${m.id}">${h(m.name)}手配</option>`).join('')}
          </select>
          <button class="btn gold" id="bm-save" style="width:100%;margin-top:14px">変更する</button>`);
        $('#bm-save').onclick = async () => {
          const mgrId = $('#bm-mgr').value;
          await withLoading($('#bm-save'), async () => {
            try{
              const r = await api('/users/bulk-manager', { method:'POST', body:{ ids, manager_id: mgrId ? Number(mgrId) : null } });
              USERS_CACHE = null; closeModal(); popup(`${r.count}件の手配担当を変更しました`); render();
            }catch(e){ popup(e.message,'error'); }
          });
        };
      };
    }
  };

  app.innerHTML = `
  <h2>メンバー一覧 <span class="tt" data-tip="現在絞り込み中の課"><span class="ka-badge ka-${st.tab==='1課'?'1':'2'}">${st.tab}</span></span></h2>
  <div class="card">
    <div class="sticky-filters">
      <div class="ka-tabs">
        <button class="ka-tab ka2 ${st.tab==='2課'?'on':''}" data-tab="2課">2課 (${cnt2}名)</button>
        <button class="ka-tab ka1 ${st.tab==='1課'?'on':''}" data-tab="1課">1課 (${cnt1}名)</button>
        ${cntX?`<button class="ka-tab ${st.tab==='未設定'?'on':''}" data-tab="未設定">未設定 (${cntX}名)</button>`:''}
      </div>
      <div class="filter-bar" style="margin-bottom:0">
        <input id="m-search" class="search-input" placeholder="氏名・登録番号・班・駅で検索" value="${h(st.q)}">
        <select id="m-mgr" class="filter-select">
          <option value="">手配担当:すべて</option>
          ${managers.map(m=>`<option value="${m.id}" ${String(st.mgr)===String(m.id)?'selected':''}>${h(m.name)}手配</option>`).join('')}
          <option value="__chief" ${st.mgr==='__chief'?'selected':''}>チーフ手配</option>
        </select>
        <button class="btn ghost sm" id="m-clear" style="${(st.q||st.mgr)?'':'display:none'}">クリア</button>
      </div>
    </div>
    <div id="m-list-area"></div>
  </div>`;

  renderList();

  app.querySelectorAll('.ka-tab').forEach(b=>b.onclick=()=>{ st.tab=b.dataset.tab; pageMembers(app); });
  const si = $('#m-search');
  if(si){
    si.oninput = () => {
      st.q = si.value;
      const mc = $('#m-clear'); if(mc) mc.style.display = (st.q||st.mgr) ? '' : 'none';
      renderList(); // input要素自体には触れず、リストだけ更新するのでキーボードは閉じない
    };
  }
  const mm = $('#m-mgr'); if(mm) mm.onchange = () => { st.mgr = mm.value; const mc=$('#m-clear'); if(mc) mc.style.display=(st.q||st.mgr)?'':'none'; renderList(); };
  const mc = $('#m-clear'); if(mc) mc.onclick = () => { st.q=''; st.mgr=''; pageMembers(app); };
}

// メンバー情報の編集(手配者以上、または個別権限あり)。ランク・課・班・最寄駅・できること・担当手配者(役割の変更はaccount_manage権限のみ)
function openMemberEdit(u, users, managers){
  if(!has('site_manage') && !has('account_manage')){ return; }
  const isAdmin = has('account_manage');
  const ranks = [...new Set(users.map(x=>x.rank).filter(Boolean))].sort();
  const curRank = (String(u.rank||'').match(/[A-Ea-e]/)||[''])[0].toUpperCase();
  // 査定で上げられる先(C→B、C→A、B→A のみ)
  const assessTargets = curRank === 'C' ? ['B','A'] : curRank === 'B' ? ['A'] : [];
  modal(`<h3>${h(u.name)} の情報を編集</h3>
    <div class="form-grid" style="grid-template-columns:84px 1fr;gap:8px 10px;align-items:center">
      <label>氏名</label><input id="ue-name" value="${h(u.name)}">
      <label>ランク</label><input id="ue-rank" list="ue-ranks" value="${h(u.rank||'')}" placeholder="例:Aランク">
      <label>課</label><select id="ue-ka">
        <option value="" ${!u.ka?'selected':''}>未設定</option>
        <option value="1課" ${u.ka==='1課'?'selected':''}>1課</option>
        <option value="2課" ${u.ka==='2課'?'selected':''}>2課</option></select>
      <label>班</label><input id="ue-han" value="${h(u.han||'')}" placeholder="例:S班">
      <label>最寄駅</label><input id="ue-station" value="${h(u.station||'')}">
      <label>できること</label><input id="ue-skills" value="${h(u.skills||'')}" placeholder="進行, 買い出し など">
      <label>手配担当</label><select id="ue-mgr">
        <option value="">チーフ手配(未設定)</option>
        ${managers.map(m=>`<option value="${m.id}" ${String(u.manager_id)===String(m.id)?'selected':''}>${h(m.name)}手配</option>`).join('')}</select>
      ${isAdmin?`<label>役割</label><select id="ue-role">${Object.keys(LV).map(r=>`<option value="${r}" ${u.role===r?'selected':''}>${ROLE_JP[r]}</option>`).join('')}</select>`:''}
    </div>
    <datalist id="ue-ranks">${ranks.map(r=>`<option value="${h(r)}"></option>`).join('')}</datalist>

    <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--line)">
      <div style="font-weight:700;font-size:13.5px;margin-bottom:8px">研修の受講状況</div>
      <div class="row" style="gap:14px;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:5px"><input type="checkbox" id="ue-manner" ${u.manner_done?'checked':''}> マナー研修</label>
        <label style="display:flex;align-items:center;gap:5px"><input type="checkbox" id="ue-team2" ${u.team2_done?'checked':''}> チーム研修(2部)</label>
        <label style="display:flex;align-items:center;gap:5px"><input type="checkbox" id="ue-su" ${u.su_done?'checked':''}> ステージアップ研修(SU)</label>
        <label style="display:flex;align-items:center;gap:5px"><input type="checkbox" id="ue-grad" ${u.graduate_flag?'checked':''}> 卒業予定</label>
      </div>
      ${u.promotion_pending_date?`<div class="muted" style="margin-top:8px;font-size:12px">${icon('clock',{size:'12px'})} ${h(u.promotion_pending_date)} に ${h(u.promotion_pending_rank||'')} ランクへ自動昇格予定</div>`:''}
    </div>

    ${assessTargets.length?`<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line)">
      <div style="font-weight:700;font-size:13.5px;margin-bottom:8px">査定によるランクアップ</div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        ${assessTargets.map(t=>`<button class="btn ghost sm ue-assess" data-rank="${t}">${icon('star',{size:'12px'})} ${t}ランクへ査定</button>`).join('')}
      </div>
      <div class="muted" style="margin-top:6px;font-size:11.5px">査定すると即座に反映され、今月分の給与も新しいランクで再計算されます。</div>
    </div>`:''}

    <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--line)">
      <button class="btn ghost sm" id="ue-history">${icon('scroll',{size:'12px'})} ランク変更履歴を見る</button>
      <div id="ue-history-body" style="margin-top:8px"></div>
    </div>

    <button class="btn gold" id="ue-save" style="width:100%;margin-top:16px">保存する</button>
    `);
  // 査定ボタン
  document.querySelectorAll('.ue-assess').forEach(b => b.onclick = async () => {
    const target = b.dataset.rank;
    if(!confirm(`${u.name}さんを ${target}ランクへ査定します。今月分の給与も再計算されます。よろしいですか?`)) return;
    await withLoading(b, async () => {
      try{
        await api(`/users/${u.id}/assess`, { method:'POST', body:{ rank: target } });
        USERS_CACHE = null; closeModal(); popup(`${target}ランクへ査定しました`); render();
      }catch(e){ popup(e.message,'error'); }
    });
  });
  // ランク変更履歴
  $('#ue-history').onclick = async () => {
    const box = $('#ue-history-body');
    box.innerHTML = `<div class="muted"><span class="spinner" style="width:13px;height:13px;border-width:2px;margin-right:5px"></span>読み込み中…</div>`;
    try{
      const rows = await api(`/users/${u.id}/rank-history`);
      box.innerHTML = rows.length
        ? `<table class="list" style="font-size:12px"><tr><th>日時</th><th>変更</th><th>理由</th><th>操作者</th></tr>
           ${rows.map(r=>`<tr><td class="nowrap">${h(r.ts)}</td><td class="nowrap">${h(r.before_rank||'—')} → ${h(r.after_rank||'')}</td><td>${h(r.reason_label)}</td><td>${h(r.changed_by_name||'自動')}</td></tr>`).join('')}</table>`
        : '<div class="muted">変更履歴はまだありません</div>';
    }catch(e){ box.innerHTML = `<div class="msg err">${h(e.message)}</div>`; }
  };
  $('#ue-save').onclick = async () => {
    const name = $('#ue-name').value.trim();
    if(!name){ popup('氏名は必須です','error'); return; }
    const body = {
      name,
      rank: $('#ue-rank').value.trim(),
      ka: $('#ue-ka').value,
      han: $('#ue-han').value.trim(),
      station: $('#ue-station').value.trim(),
      skills: $('#ue-skills').value.trim(),
      manager_id: $('#ue-mgr').value ? Number($('#ue-mgr').value) : null,
      manner_done: $('#ue-manner').checked ? 1 : 0,
      team2_done: $('#ue-team2').checked ? 1 : 0,
      su_done: $('#ue-su').checked ? 1 : 0,
      graduate_flag: $('#ue-grad').checked ? 1 : 0,
    };
    if(isAdmin){ const r=$('#ue-role'); if(r) body.role = r.value; }
    await withLoading($('#ue-save'), async () => {
      try{
        await api('/users/'+u.id, { method:'PATCH', body });
        USERS_CACHE = null; closeModal(); popup('保存しました'); render();
      }catch(e){ popup(e.message,'error'); }
    });
  };
}
// 手配担当の表示名(担当未設定 → チーフ手配)
function managerName(u, users){
  if(!u.manager_id){
    return u.ka==='1課' ? 'チーフ手配(1課)' : u.ka==='2課' ? 'チーフ手配(2課)' : 'チーフ手配';
  }
  const mgr = users.find(x=>String(x.id)===String(u.manager_id));
  return mgr ? mgr.name+'手配' : 'チーフ手配';
}
// 登録番号の帯から拠点(大阪/京都)を判定する。300000〜349999=大阪、350000〜399999=京都。
// DBには保存せず、表示のたびに都度計算するだけ(既存データを変更しない、軽量な表示専用の判定)。
function baseFromRegno(regno){
  const n = parseInt(String(regno||'').replace(/\D/g,''), 10);
  if(!n) return '';
  if(n >= 300000 && n <= 349999) return '大阪';
  if(n >= 350000 && n <= 399999) return '京都';
  return '';
}
// 日付文字列(YYYY-MM-DD)をn日ずらす。タイムゾーンに依存しないようUTCベースで計算する。
function shiftDate(d, n){
  const [y,m,day] = d.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m-1, day));
  dt.setUTCDate(dt.getUTCDate()+n);
  return dt.toISOString().slice(0,10);
}

/* ===== スケジュール入力(手配者モード)===== */
async function pageEdit(app, initialUid){
  if(ME.handler !== 1){ notFound(app); return; }
  const [users, managers] = await Promise.all([getUsers(true), api('/managers')]);
  app.innerHTML = `
  <h2>スケジュール入力(手配チーム専用)</h2>

  <div class="card" style="margin-bottom:14px">
    <div class="bulk-head" id="bulk-toggle">
      <span><b>${icon('clipboardList')} 複数人に一括登録</b>(同じ現場を、同じ手配担当の複数メンバーへ)</span>
      <span id="bulk-arrow">▼</span>
    </div>
    <div id="bulk-body" style="display:none;margin-top:12px">
      <div class="form-grid" style="grid-template-columns:90px 1fr;max-width:560px">
        <label>現場名 *</label><input id="bk-site" placeholder="例:NiziU 大阪公演">
        <label>会場</label><input id="bk-venue" placeholder="例:京セラドーム大阪">
        <label>IN</label><input id="bk-in" placeholder="例:9:00">
        <label>OUT</label><input id="bk-out" placeholder="例:18:00">
        <label>給与(手動)</label><input id="bk-pay" placeholder="空欄=自動計算">
      </div>
      <div style="margin-top:14px">
        <label class="bulk-label">① メンバーを追加(同じ手配担当だけ)</label>
        <div class="row" style="gap:6px;margin:6px 0">
          <select id="bk-mgr" class="nowrap" style="flex:1">
            <option value="">▼ 担当手配者を選択</option>
            ${managers.map(m=>`<option value="${m.id}">${h(m.name)}手配(${m.count}名)</option>`).join('')}
            <option value="__none:1課">チーフ手配(1課)</option>
            <option value="__none:2課">チーフ手配(2課)</option>
          </select>
          <select id="bk-memsel" class="nowrap" style="flex:1"><option value="">担当手配者を選択</option></select>
          <button class="btn ghost sm" id="bk-mem-add">＋追加</button>
        </div>
      </div>
      <div style="margin-top:10px">
        <label class="bulk-label">② メンバーごとに日付と備考を入力</label>
        <div id="bk-assign" style="margin-top:6px"><div class="muted">上でメンバーを追加してください</div></div>
      </div>
      <div class="row" style="margin-top:14px"><button class="btn gold" id="bk-save">一括登録する</button></div>
    </div>
  </div>

  <div class="card">
    <h3 style="margin:0 0 10px">1人ずつ入力</h3>
    <div class="form-grid" style="grid-template-columns:90px 1fr;max-width:520px;margin-bottom:8px">
      <label>担当手配者</label>
      <select id="e-mgr" class="nowrap">
        <option value="__all">全員</option>
        ${managers.map(m=>`<option value="${m.id}">${h(m.name)}手配(${m.count}名)</option>`).join('')}
        <option value="__none:1課">チーフ手配(1課)</option>
        <option value="__none:2課">チーフ手配(2課)</option>
      </select>
      <label>メンバー</label>
      <select id="e-user" class="nowrap">${users.map(u=>`<option value="${u.id}" ${initialUid && String(u.id)===String(initialUid)?'selected':''}>${h(u.name)}(${h(u.regno)})</option>`).join('')}</select>
      <label>対象月</label>
      <input type="month" id="e-month" value="${MONTH}">
    </div>
    <div class="row" style="margin-bottom:12px">
      <button class="btn" id="e-load">読み込み</button>
      <button class="btn gold pc-only" id="e-save" style="display:inline-block">月をまとめて保存</button>
      <span id="e-msg"></span>
    </div>
    <div id="e-grid" class="pc-only"></div>
    <div id="e-mobile" class="sp-only"></div>

  </div>`;

  // ---- 一括登録(メンバーごとに日付・備考)----
  $('#bulk-toggle').onclick = () => {
    const body = $('#bulk-body'), open = body.style.display==='none';
    body.style.display = open ? 'block' : 'none';
    $('#bulk-arrow').textContent = open ? '▲' : '▼';
  };
  let bkAssign = []; // [{uid, name, regno, dates:[], note}]
  // 担当手配者を選ぶと、その担当のメンバーが2つ目のプルダウンに出る
  $('#bk-mgr').onchange = () => {
    const mid = $('#bk-mgr').value;
    let list = [];
    if(mid.startsWith('__none:')) list = users.filter(u=>!u.manager_id && u.ka===mid.slice(7));
    else if(mid) list = users.filter(u=>String(u.manager_id)===String(mid));
    $('#bk-memsel').innerHTML = list.length
      ? '<option value="">メンバーを選択</option>'+list.map(u=>`<option value="${u.id}">${h(u.name)}(${h(u.regno)})</option>`).join('')
      : '<option value="">該当メンバーなし</option>';
  };
  const renderAssign = () => {
    const box = $('#bk-assign');
    if(!bkAssign.length){ box.innerHTML='<div class="muted">上でメンバーを追加してください</div>'; return; }
    box.innerHTML = bkAssign.map((a,ai)=>`
      <div class="bk-person" data-ai="${ai}">
        <div class="bk-person-head"><b>${h(a.name)}</b><span class="bulk-sub">${h(a.regno)}</span><button class="bk-person-del" data-ai="${ai}">削除</button></div>
        <div class="bk-person-dates">
          <div class="row" style="gap:6px"><input type="date" class="bk-d-input" data-ai="${ai}"><button class="btn ghost xs bk-d-add" data-ai="${ai}">＋日付</button></div>
          <div class="bulk-chips" style="margin-top:6px">${a.dates.map((d,di)=>`<span class="chip">${d}<button data-ai="${ai}" data-di="${di}">${icon('x',{size:'12px'})}</button></span>`).join('')||'<span class="muted">日付未選択</span>'}</div>
        </div>
        <div class="row" style="margin-top:6px"><label style="flex:0 0 44px;font-size:13px;color:#555">備考</label><input class="bk-note-input" data-ai="${ai}" value="${h(a.note)}" placeholder="この人の備考(例:物販頭)" style="flex:1"></div>
      </div>`).join('');
    // 日付追加
    box.querySelectorAll('.bk-d-add').forEach(btn=>btn.onclick=()=>{
      const ai=Number(btn.dataset.ai), inp=box.querySelector(`.bk-d-input[data-ai="${ai}"]`);
      const v=inp.value; if(!v) return;
      if(!bkAssign[ai].dates.includes(v)){ bkAssign[ai].dates.push(v); bkAssign[ai].dates.sort(); }
      syncNotes(); renderAssign();
    });
    // 日付削除
    box.querySelectorAll('.chip button').forEach(b=>b.onclick=()=>{
      syncNotes(); bkAssign[Number(b.dataset.ai)].dates.splice(Number(b.dataset.di),1); renderAssign();
    });
    // メンバー削除
    box.querySelectorAll('.bk-person-del').forEach(b=>b.onclick=()=>{
      syncNotes(); bkAssign.splice(Number(b.dataset.ai),1); renderAssign();
    });
  };
  // 入力中の備考を配列に退避(再描画で消えないように)
  const syncNotes = () => {
    document.querySelectorAll('#bk-assign .bk-note-input').forEach(inp=>{ const ai=Number(inp.dataset.ai); if(bkAssign[ai]) bkAssign[ai].note=inp.value; });
  };
  $('#bk-mem-add').onclick = () => {
    const v = $('#bk-memsel').value; if(!v) return;
    if(bkAssign.some(a=>a.uid===Number(v))){ popup('そのメンバーは既に追加されています','error'); return; }
    const u = users.find(x=>x.id===Number(v)); if(!u) return;
    syncNotes();
    bkAssign.push({ uid:u.id, name:u.name, regno:u.regno, dates:[], note: $('#bk-note-default')?$('#bk-note-default').value:'' });
    renderAssign();
  };
  $('#bk-save').onclick = async () => {
    syncNotes();
    const site = $('#bk-site').value.trim();
    if(!site){ popup('現場名を入力してください', 'error'); return; }
    const assignments = bkAssign.filter(a=>a.dates.length).map(a=>({uid:a.uid, dates:a.dates, note:a.note}));
    if(!assignments.length){ popup('メンバーを追加し、それぞれに日付を1つ以上入れてください', 'error'); return; }
    try{
      const r = await bulkSaveWithConflicts({
        assignments, site, venue:$('#bk-venue').value.trim(),
        tin:$('#bk-in').value.trim(), tout:$('#bk-out').value.trim(), pay:$('#bk-pay').value.trim()
      });
      if(!r) return;
      popup(withWarnNote(`一括登録しました(${r.added}件追加${r.skipped?` / ${r.skipped}件スキップ`:''})。`, r));
      ['bk-site','bk-venue','bk-in','bk-out','bk-pay'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
      bkAssign=[]; renderAssign();
    }catch(e){ popup(e.message, 'error'); }
  };
  renderAssign();

  // 担当手配者で対象メンバーを絞り込む
  $('#e-mgr').onchange = () => {
    const mid = $('#e-mgr').value;
    let list;
    if(mid==='__all') list = users;
    else if(mid.startsWith('__none:')) list = users.filter(u=>!u.manager_id && u.ka===mid.slice(7));
    else list = users.filter(u=>String(u.manager_id)===String(mid));
    $('#e-user').innerHTML = (list.length?list:users).map(u=>`<option value="${u.id}">${h(u.name)}(${h(u.regno)})</option>`).join('');
  };

  // 1現場分の入力行(セル群)を作る
  function slotCells(e){
    e = e || {};
    const sel = v => e.type===v?'selected':'';
    return `<td class="type-col"><select class="etype"><option value="">-</option>
        <option value="work" ${sel('work')}>現場</option><option value="off" ${sel('off')}>休暇</option>
        <option value="paid" ${sel('paid')}>有給</option><option value="ok" ${sel('ok')}>1日OK</option><option value="x" ${sel('x')}>×</option></select></td>
      <td><input class="esite" value="${h(e.site||'')}" placeholder="現場名"></td>
      <td><input class="evenue" value="${h(e.venue||'')}" placeholder="会場"></td>
      <td class="tin-col"><input class="ein" value="${h(e.tin||'')}" placeholder="10:15"></td>
      <td class="tin-col"><input class="eout" value="${h(e.tout||'')}" placeholder="19:45"></td>
      <td class="pay-col"><input class="epay" placeholder="自動" value=""></td>
      <td><input class="enote" value="${h(e.note||'')}" placeholder="備考"></td>
      <td class="c" style="width:54px"><button class="btn ghost xs add-slot" title="この日に現場を追加">＋現場</button><button class="btn danger xs del-slot" title="この行を削除" style="margin-top:2px">削除</button></td>`;
  }

  let MONTH_DATA = {}; // date -> slots[](スマホ用に保持)

  async function load(){
    const uid = $('#e-user').value, m = $('#e-month').value;
    const d = await api(`/schedule?uid=${uid}&month=${m}`);
    const [y,mo] = m.split('-').map(Number);
    const days = new Date(y,mo,0).getDate();
    MONTH_DATA = {};
    let rows='';
    for(let i=1;i<=days;i++){
      const date = `${m}-${pad(i)}`, w = new Date(y,mo-1,i).getDay();
      MONTH_DATA[date] = (d.entries[date] && d.entries[date].length) ? d.entries[date].map(e=>({...e})) : [];
      const list = (d.entries[date] && d.entries[date].length) ? d.entries[date] : [null];
      list.forEach((e, idx) => {
        rows += `<tr data-date="${date}" ${idx===0?`data-first="1" data-rows="${list.length}"`:''} class="${idx>0?'slot-extra':''}">
          ${idx===0 ? `<td class="c" rowspan-day style="width:30px">${i}</td><td class="c wd ${w===0?'sun':w===6?'sat':''}" style="width:28px">${WD[w]}</td>` : `<td class="c slot-cont" style="width:30px"></td><td class="c slot-cont" style="width:28px">〃</td>`}
          ${slotCells(e)}
        </tr>`;
      });
    }
    $('#e-grid').innerHTML = `<div class="sched-wrap"><table class="egrid">
      <tr><th>日</th><th>曜</th><th>種別</th><th>現場名</th><th>会場</th><th>IN</th><th>OUT</th><th>給与(手動)</th><th>備考</th><th></th></tr>${rows}</table></div>`;
    bindRowButtons();
    buildMobile(m, y, mo, days);
  }

  // スマホ用:日付セレクタ + 1日ぶんの縦フォーム
  function buildMobile(m, y, mo, days){
    const el = $('#e-mobile'); if(!el) return;
    let opts='';
    for(let i=1;i<=days;i++){
      const date=`${m}-${pad(i)}`, w=new Date(y,mo-1,i).getDay();
      const cnt=(MONTH_DATA[date]||[]).length;
      const mark = cnt? (MONTH_DATA[date][0].type==='work'?`● ${MONTH_DATA[date].map(s=>s.site||'現場').join('・')}`:'休') : '';
      opts+=`<option value="${date}">${mo}/${i}(${WD[w]}) ${mark}</option>`;
    }
    el.innerHTML = `<div class="me-pick"><label>日付</label><select id="me-date">${opts}</select></div>
      <div id="me-day"></div>`;
    $('#me-date').onchange = () => renderDay($('#me-date').value);
    renderDay($('#me-date').value);
  }

  // スマホ:選んだ日のフォームを描画
  function renderDay(date){
    const slots = MONTH_DATA[date] || [];
    const view = slots.length ? slots : [{type:''}];
    const block = (e,idx) => {
      const sel = v => e.type===v?'selected':'';
      return `<div class="me-slot" data-idx="${idx}">
        <div class="me-row"><label>種別</label>
          <select class="metype"><option value="">-(なし)</option>
            <option value="work" ${sel('work')}>現場</option><option value="off" ${sel('off')}>休暇</option>
            <option value="paid" ${sel('paid')}>有給</option><option value="ok" ${sel('ok')}>1日OK</option><option value="x" ${sel('x')}>×</option></select></div>
        <div class="me-fields">
          <div class="me-row"><label>現場名</label><input class="mesite" value="${h(e.site||'')}" placeholder="現場名"></div>
          <div class="me-row"><label>会場</label><input class="mevenue" value="${h(e.venue||'')}" placeholder="会場"></div>
          <div class="me-row"><label>IN</label><input class="mein" value="${h(e.tin||'')}" placeholder="10:15"></div>
          <div class="me-row"><label>OUT</label><input class="meout" value="${h(e.tout||'')}" placeholder="19:45"></div>
          <div class="me-row"><label>給与(手動)</label><input class="mepay" value="" placeholder="空欄=自動計算"></div>
          <div class="me-row"><label>備考</label><input class="menote" value="${h((e.note||'').replace(/\s*[（(][^（）()]*[）)]\s*$/,''))}" placeholder="物販頭 など"></div>
        </div>
        ${view.length>1?`<button class="btn danger xs me-del">この現場を削除</button>`:''}
      </div>`;
    };
    $('#me-day').innerHTML = `
      <div class="me-slots">${view.map(block).join('')}</div>
      <button class="btn ghost sm" id="me-add" style="margin-top:8px">＋ この日に現場を追加</button>
      <div class="row" style="margin-top:12px"><button class="btn gold" id="me-save">この日を保存</button><span id="me-msg"></span></div>`;
    bindDayForm(date);
  }

  function readDaySlots(){
    const out=[];
    document.querySelectorAll('#me-day .me-slot').forEach(s=>{
      out.push({
        type: s.querySelector('.metype').value,
        site: s.querySelector('.mesite').value.trim(),
        venue: s.querySelector('.mevenue').value.trim(),
        tin: s.querySelector('.mein').value.trim(),
        tout: s.querySelector('.meout').value.trim(),
        pay: s.querySelector('.mepay').value.trim(),
        note: s.querySelector('.menote').value.trim(),
      });
    });
    return out;
  }

  function bindDayForm(date){
    // 種別で現場欄の表示切替
    document.querySelectorAll('#me-day .me-slot').forEach(s=>{
      const t=s.querySelector('.metype'), f=s.querySelector('.me-fields');
      const upd=()=>{ f.style.display = (t.value==='work') ? 'block' : 'none'; };
      upd(); t.onchange=upd;
      const del=s.querySelector('.me-del'); if(del) del.onclick=()=>{ MONTH_DATA[date]=readDaySlots().filter((_,i)=>i!==Number(s.dataset.idx)); renderDay(date); };
    });
    $('#me-add').onclick=()=>{ MONTH_DATA[date]=[...readDaySlots(), {type:'work'}]; renderDay(date); };
    $('#me-save').onclick=async()=>{
      const uid=Number($('#e-user').value);
      const slots=readDaySlots();
      MONTH_DATA[date]=slots;
      await withLoading($('#me-save'), async () => {
        try{
          let r = await api('/schedule',{method:'PUT',body:{uid,date,slots}});
          if(r.ok===0 && r.conflicts){
            if(!(await conflictModal(r.conflicts))) return;
            r = await api('/schedule',{method:'PUT',body:{uid,date,slots,force:true}});
          }
          // 保存後に再読込してマークを更新
          const m=$('#e-month').value; const d=await api(`/schedule?uid=${uid}&month=${m}`);
          MONTH_DATA[date]=(d.entries[date]||[]).map(e=>({...e}));
          const [y,mo]=m.split('-').map(Number); buildMobile(m,y,mo,new Date(y,mo,0).getDate());
          $('#me-date').value=date; renderDay(date);
          const uname=(USERS_CACHE||[]).find(u=>u.id===uid);
          popup(withWarnNote(`${uname?uname.name+' さんの ':''}${date} を保存しました。`, r));
        }catch(e){ popup(e.message, 'error'); }
      });
    };
  }

  function bindRowButtons(){
    // ＋現場:同じ日の最後にスロット行を追加
    $('#e-grid').querySelectorAll('.add-slot').forEach(b => b.onclick = () => {
      const tr = b.closest('tr'); const date = tr.dataset.date;
      // その日の最後の行を探す
      const sameDay = [...$('#e-grid').querySelectorAll(`tr[data-date="${date}"]`)];
      const last = sameDay[sameDay.length-1];
      const nr = document.createElement('tr');
      nr.dataset.date = date; nr.className = 'slot-extra';
      nr.innerHTML = `<td class="c slot-cont" style="width:30px"></td><td class="c slot-cont" style="width:28px">〃</td>${slotCells({type:'work'})}`;
      last.after(nr); bindRowButtons();
    });
    // 削除:その行を消す(その日最後の1行なら空に戻す)
    $('#e-grid').querySelectorAll('.del-slot').forEach(b => b.onclick = () => {
      const tr = b.closest('tr'); const date = tr.dataset.date;
      const sameDay = [...$('#e-grid').querySelectorAll(`tr[data-date="${date}"]`)];
      if(sameDay.length<=1){ // 最後の1行 → 種別を「-」にしてクリア
        tr.querySelector('.etype').value=''; tr.querySelector('.esite').value='';
        tr.querySelector('.evenue').value=''; tr.querySelector('.ein').value='';
        tr.querySelector('.eout').value=''; tr.querySelector('.epay').value=''; tr.querySelector('.enote').value='';
      } else { tr.remove(); }
    });
  }

  $('#e-load').onclick = load;
  $('#e-user').onchange = load;
  if(initialUid) load(); // メンバー一覧などから遷移してきた場合、そのまま自動で読み込む
  $('#e-save').onclick = async () => {
    const uid = Number($('#e-user').value);
    const byDate = {};
    document.querySelectorAll('#e-grid tr[data-date]').forEach(tr => {
      const type = tr.querySelector('.etype').value;
      const date = tr.dataset.date;
      (byDate[date] ||= []).push({
        date, type,
        site: tr.querySelector('.esite').value.trim(),
        venue: tr.querySelector('.evenue').value.trim(),
        tin: tr.querySelector('.ein').value.trim(),
        tout: tr.querySelector('.eout').value.trim(),
        pay: tr.querySelector('.epay').value.trim(),
        note: tr.querySelector('.enote').value.trim()
      });
    });
    // entries形式(同日複数行)でまとめて送る
    const entries = [];
    for(const date of Object.keys(byDate)) for(const e of byDate[date]) entries.push(e);
    await withLoading($('#e-save'), async () => {
      try{
        let r = await api('/schedule', { method:'PUT', body:{ uid, entries } });
        if(r.ok===0 && r.conflicts){
          if(!(await conflictModal(r.conflicts))){ return; }
          r = await api('/schedule', { method:'PUT', body:{ uid, entries, force:true } });
        }
        load();
        popup(withWarnNote('スケジュールを保存しました。', r));
      }catch(e){ popup(e.message, 'error'); }
    });
  };
  load();
}

/* ===== 新人報告フォーム ===== */
function pageReportForm(app){
  const isChief = has('report_check');
  app.innerHTML = `
  <h2>新人報告</h2>
  <div class="card"><div class="form-grid">
    <div class="section-label">基本情報</div>
    <label>報告者名</label><input id="r-name" value="${h(ME.name)}" readonly style="background:#f0efe9">
    <label>獲得候補者名 *</label><input id="r-cand">
    <label>獲得候補者学年</label><select id="r-grade"><option></option>${['高1','高2','高3','大1','大2','大3','大4','専門','社会人','その他'].map(g=>`<option>${g}</option>`).join('')}</select>
    <label>次回現場名(分かれば)</label><input id="r-nsite" placeholder="スケジュールと一致すると現場メンバーに通知">
    <label>次回日付(分かれば)</label><input id="r-ndate" type="date">
    ${isChief ? '<div class="section-label">1次</div>' : '<div class="section-label">報告内容</div>'}
    <label>連絡したチーフ</label><input id="r-fchief">
    <label>所感(良かった点・課題点)</label><textarea id="r-fnote"></textarea>
    ${isChief ? `
    <div class="section-label">2次</div>
    <label>やる気・表情(5段階)</label><select id="r-mot">${[1,2,3,4,5].map(n=>`<option ${n===3?'selected':''}>${n}</option>`).join('')}</select>
    <label>受け答え(5段階)</label><select id="r-res">${[1,2,3,4,5].map(n=>`<option ${n===3?'selected':''}>${n}</option>`).join('')}</select>
    <label>総合点(10段階)</label><select id="r-tot">${[1,2,3,4,5,6,7,8,9,10].map(n=>`<option ${n===5?'selected':''}>${n}</option>`).join('')}</select>
    <label>ドラフト承認</label><select id="r-draft"><option>OK</option><option>不可</option><option selected>様子見</option></select>
    <label>今後の育成計画</label><textarea id="r-plan"></textarea>` : ''}
  </div>
  <div class="row" style="margin-top:16px"><button class="btn gold" id="r-submit">提出する</button><span id="r-msg"></span></div></div>`;
  $('#r-submit').onclick = async () => {
    const body = {
      candidate_name: $('#r-cand').value, candidate_grade: $('#r-grade').value,
      next_site: $('#r-nsite').value.trim(), next_date: $('#r-ndate').value,
      first_chief: $('#r-fchief').value, first_note: $('#r-fnote').value
    };
    if(isChief) Object.assign(body, { s_motivation:$('#r-mot').value, s_response:$('#r-res').value, s_total:$('#r-tot').value, draft:$('#r-draft').value, plan:$('#r-plan').value });
    await withLoading($('#r-submit'), async () => {
      try{
        await api('/reports', { method:'POST', body });
        $('#r-cand').value=''; $('#r-fnote').value='';
        popup('新人報告を提出しました。チーフ全員に通知されます。');
      }catch(e){ popup(e.message, 'error'); }
    });
  };
}

/* ===== 報告一覧・2次チェック ===== */
async function pageReports(app, hash){
  const rows = await api('/reports');
  const acqBadge = ka => ka ? `<span class="tag acquired" title="既にアプリに登録済み">${icon('checkCircle')} ${h(ka)}獲得</span>` : '';
  app.innerHTML = `
  <h2>新人報告一覧</h2>
  <div class="card">
    <table class="list pc-only">
    <tr><th>日時</th><th>報告者</th><th>候補者</th><th>学年</th><th>状態</th><th>ドラフト</th><th>チェック者</th></tr>
    ${rows.map(r=>`<tr class="click" data-id="${r.id}">
      <td>${h(r.ts)}</td><td>${h(r.reporter_name)}</td><td><b>${h(r.candidate_name)}</b></td><td>${h(r.candidate_grade)}</td>
      <td><span class="tag ${r.status}">${r.status==='pending'?'2次未チェック':'チェック済'}</span> ${acqBadge(r.acquired_ka)}</td>
      <td>${h(r.draft)}</td><td>${h(r.checker)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">報告はまだありません</td></tr>'}
    </table>
    <div class="cards sp-only">
    ${rows.map(r=>`<div class="dcard clickable" data-id="${r.id}">
      <div class="dcard-head"><span class="dcard-title">${h(r.candidate_name)}</span><span class="tag ${r.status}">${r.status==='pending'?'2次未チェック':'チェック済'}</span></div>
      ${r.acquired_ka?`<div class="drow"><span class="dk">状態</span><span class="dv">${acqBadge(r.acquired_ka)}</span></div>`:''}
      <div class="drow"><span class="dk">報告者</span><span class="dv">${h(r.reporter_name)}</span></div>
      <div class="drow"><span class="dk">学年</span><span class="dv">${h(r.candidate_grade)||'—'}</span></div>
      ${r.draft?`<div class="drow"><span class="dk">ドラフト</span><span class="dv">${h(r.draft)}</span></div>`:''}
      ${r.checker?`<div class="drow"><span class="dk">チェック者</span><span class="dv">${h(r.checker)}</span></div>`:''}
      <div class="drow"><span class="dk">日時</span><span class="dv dcard-sub">${h(r.ts)}</span></div>
    </div>`).join('') || '<div class="muted">報告はまだありません</div>'}
    </div>
  </div>`;
  app.querySelectorAll('[data-id]').forEach(el => el.onclick = () => openReport(rows.find(r=>r.id==el.dataset.id)));
  // 現場一覧などから「この報告を見る」で遷移してきた場合(#/reports?open=123)、該当の報告を自動で開く
  const openId = new URLSearchParams((hash||'').split('?')[1] || '').get('open');
  if(openId){
    const target = rows.find(r => String(r.id) === String(openId));
    if(target) openReport(target);
  }
}

function openReport(r){
  const pending = r.status === 'pending';
  const canCheck = has('report_check'); // 2次チェックの記入・修正
  const canBlacklist = has('blacklist_manage'); // ブラックリスト登録
  const canDelete = has('site_manage'); // 削除(手配者以上)
  const canSiteLog = has('report_check') || has('blacklist_manage'); // 過去の現場を見る(名前一致検索)
  modal(`<h3>新人報告 #${r.id} ${pending?'<span class="tag pending">2次未チェック</span>':'<span class="tag checked">チェック済</span>'}</h3>
  <dl class="kv">
    <dt>タイムスタンプ</dt><dd>${h(r.ts)}</dd>
    <dt>報告者名</dt><dd>${h(r.reporter_name)}</dd>
    <dt>獲得候補者名</dt><dd><b>${h(r.candidate_name)}</b></dd>
    <dt>学年</dt><dd>${h(r.candidate_grade)}</dd>
    <dt>次回現場</dt><dd>${h(r.next_date)} ${h(r.next_site)}</dd>
    <dt>1次 連絡したチーフ</dt><dd>${h(r.first_chief)}</dd>
    <dt>1次 所感</dt><dd>${h(r.first_note)}</dd>
    ${!pending ? `
    <dt>2次 やる気・表情</dt><dd>${r.s_motivation??''} / 5</dd>
    <dt>2次 受け答え</dt><dd>${r.s_response??''} / 5</dd>
    <dt>2次 総合点</dt><dd>${r.s_total??''} / 10</dd>
    <dt>2次 ドラフト承認</dt><dd><b>${h(r.draft)||'—'}</b></dd>
    <dt>2次 育成計画</dt><dd>${h(r.plan)}</dd>
    <dt>チーフチェック者</dt><dd>${h(r.checker)}</dd>` : ''}
  </dl>
  ${canCheck ? `
  <h3 style="margin-top:14px">${pending ? '2次チェックを入力' : '2次チェックを修正'}</h3>
  <div class="form-grid">
    <label>やる気・表情(5段階)</label><select id="c-mot">${[1,2,3,4,5].map(n=>`<option ${n===(r.s_motivation??3)?'selected':''}>${n}</option>`).join('')}</select>
    <label>受け答え(5段階)</label><select id="c-res">${[1,2,3,4,5].map(n=>`<option ${n===(r.s_response??3)?'selected':''}>${n}</option>`).join('')}</select>
    <label>総合点(10段階)</label><select id="c-tot">${[1,2,3,4,5,6,7,8,9,10].map(n=>`<option ${n===(r.s_total??5)?'selected':''}>${n}</option>`).join('')}</select>
    <label>ドラフト承認</label><select id="c-draft">${['OK','不可','様子見'].map(o=>`<option ${o===(r.draft||'様子見')?'selected':''}>${o}</option>`).join('')}</select>
    <label>今後の育成計画</label><textarea id="c-plan">${h(r.plan||'')}</textarea>
    <label>チーフチェック者名</label><input id="c-checker" value="${h(r.checker||ME.name)}">
  </div>
  <div class="row" style="margin-top:12px"><button class="btn gold" id="c-save">${pending ? 'チェック完了' : '修正を保存'}</button>${!pending?'<span class="muted" style="font-size:12px">※ ドラフト承認を「OK」にするとドラフト一覧に表示されます</span>':''}</div>`
  : (pending ? `<div class="msg" style="background:#f0efe9;padding:12px;border-radius:8px;margin-top:14px;font-size:13px">2次チェックはまだ行われていません。</div>` : '')}
  <div class="row" style="margin-top:14px;gap:8px">
    ${canSiteLog ? `<button class="btn ghost sm" id="rp-sitelog">${icon('stadium',{size:'12px'})} 過去の現場を見る</button>` : ''}
    ${canBlacklist ? `<button class="btn danger sm" id="bl-add">ブラックリストに登録</button>` : ''}
    ${canDelete ? `<button class="btn danger sm" id="report-del" style="margin-left:auto">${icon('trash',{size:'12px'})} この報告を削除</button>` : ''}
  </div>`);
  const siteLogBtn = $('#rp-sitelog');
  if(siteLogBtn) siteLogBtn.onclick = () => openNameSiteLog(r.candidate_name);

  const cs = $('#c-save');
  if(cs) cs.onclick = async () => {
    const wasPending = pending;
    await withLoading(cs, async () => {
      try{
        await api('/reports/'+r.id, { method:'PATCH', body:{
          s_motivation:$('#c-mot').value, s_response:$('#c-res').value, s_total:$('#c-tot').value,
          draft:$('#c-draft').value, plan:$('#c-plan').value, checker:$('#c-checker').value
        }});
        const draftMsg = $('#c-draft').value==='OK' ? 'ドラフト一覧に追加されました。' : '';
        closeModal(); render();
        popup((wasPending?'2次チェックを完了しました。':'2次チェックを更新しました。')+draftMsg);
      }catch(e){ popup(e.message, 'error'); }
    });
  };
  const blAdd = $('#bl-add');
  if(blAdd) blAdd.onclick = async () => {
    if(!confirm(`「${r.candidate_name}」をブラックリストに登録しますか?(5段階評価・詳細はブラックリスト画面で追記できます)`)) return;
    await withLoading(blAdd, async () => {
      try{
        await api('/blacklist', { method:'POST', body:{ name:r.candidate_name, reporter:r.reporter_name, reason:'' } });
        closeModal();
        popup('ブラックリストに登録しました。');
      }catch(e){ popup(e.message, 'error'); }
    });
  };
  const delBtn = $('#report-del');
  if(delBtn) delBtn.onclick = async () => {
    if(!confirm(`「${r.candidate_name}」さんの新人報告(#${r.id})を削除しますか?\n\nこの操作は取り消せません。`)) return;
    await withLoading(delBtn, async () => {
      try{
        await api('/reports/'+r.id, { method:'DELETE' });
        closeModal();
        popup('新人報告を削除しました。');
        render();
      }catch(e){ popup(e.message, 'error'); }
    });
  };
}

// 新人報告・ブラックリストの氏名(自由記述、uidが分からない)から、同じ名前のアプリ登録者を
// 探して過去の現場ログを表示する。uidが分かっている場面ではopenMemberVenueList等を使うこと。
async function openNameSiteLog(name){
  modal(`<h3>${icon('stadium',{size:'15px'})} ${h(name)} さんの過去の現場</h3><div class="loading-box"><span class="spinner"></span>読み込み中…</div>`);
  let data;
  try{ data = await api(`/name-site-log?name=${encodeURIComponent(name)}`); }
  catch(e){ modal(`<h3>${h(name)} さんの過去の現場</h3><div class="msg err">${h(e.message)}</div>`); return; }
  const matchedUsers = data.matchedUsers || [], rows = data.rows || [];
  if(!matchedUsers.length){
    modal(`<h3>${icon('stadium',{size:'15px'})} ${h(name)} さんの過去の現場</h3>
      <div class="muted" style="padding:16px 0;text-align:center">この名前でアプリに登録されているメンバーは見つかりませんでした。</div>`);
    return;
  }
  const multi = matchedUsers.length > 1;
  modal(`<h3>${icon('stadium',{size:'15px'})} ${h(name)} さんの過去の現場${rows.length?` <span class="muted" style="font-size:12px;font-weight:400">(${rows.length}件)</span>`:''}</h3>
    ${multi?`<div class="muted" style="font-size:12px;margin-bottom:10px">同姓同名が${matchedUsers.length}名見つかったため、まとめて表示しています。</div>`:''}
    ${rows.length ? `<div style="max-height:50vh;overflow-y:auto;display:flex;flex-direction:column;gap:4px">
      ${rows.map(r=>`<div style="font-size:12.5px;padding:6px 8px;background:#faf9f6;border:1px solid var(--line);border-radius:6px">
        <b style="color:var(--ink)">${h(r.date)}</b> ${h(r.site)}${r.venue?` <span class="muted">(${h(r.venue)})</span>`:''}
      </div>`).join('')}
    </div>` : `<div class="muted" style="padding:16px 0;text-align:center">アプリへの登録はありますが、現場の実績はまだありません。</div>`}
    ${!multi?`<div class="row" style="margin-top:14px"><a href="#/schedule/${matchedUsers[0].id}" class="btn ghost sm" id="nsl-goto">${icon('calendar',{size:'12px'})} このメンバーのスケジュールを見る</a></div>`:''}`);
  const goto = $('#nsl-goto');
  if(goto) goto.onclick = () => closeModal();
}

/* ===== ドラフトリスト ===== */
async function pageDraft(app){
  if(!has('report_check')){ notFound(app); return; }
  const rows = (await api('/reports')).filter(r => r.draft === 'OK');
  app.innerHTML = `
  <h2>ドラフトあげる人リスト(新人報告で承認OK)</h2>
  <div class="card">
    <table class="list pc-only">
    <tr><th>候補者名</th><th>学年</th><th>総合点</th><th>報告者</th><th>チェック者</th><th>報告日時</th></tr>
    ${rows.map(r=>`<tr><td><b>${h(r.candidate_name)}</b></td><td>${h(r.candidate_grade)}</td><td>${r.s_total??''} / 10</td><td>${h(r.reporter_name)}</td><td>${h(r.checker)}</td><td>${h(r.ts)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">該当者はいません</td></tr>'}
    </table>
    <div class="cards sp-only">
    ${rows.map(r=>`<div class="dcard">
      <div class="dcard-head"><span class="dcard-title">${h(r.candidate_name)}</span><span class="tag checked">総合 ${r.s_total??'—'}/10</span></div>
      <div class="drow"><span class="dk">学年</span><span class="dv">${h(r.candidate_grade)||'—'}</span></div>
      <div class="drow"><span class="dk">報告者</span><span class="dv">${h(r.reporter_name)}</span></div>
      <div class="drow"><span class="dk">チェック者</span><span class="dv">${h(r.checker)}</span></div>
      <div class="drow"><span class="dk">報告日時</span><span class="dv dcard-sub">${h(r.ts)}</span></div>
    </div>`).join('') || '<div class="muted">該当者はいません</div>'}
    </div>
  </div>`;
}

/* ===== ブラックリスト ===== */
async function pageBlacklist(app, hash){
  if(!has('blacklist_manage')){ notFound(app); return; }
  const rows = await api('/blacklist');
  const sc = id => `<select id="${id}" style="width:64px"><option value="">-</option>${[1,2,3,4,5].map(n=>`<option>${n}</option>`).join('')}</select>`;
  const scTh = ['会話','服装','身なり','遅刻','業務'];
  app.innerHTML = `
  <h2>ブラックリスト</h2>
  <div class="card">
    <h2 style="font-size:14px">新規提出 <span class="muted">(チーフ以上)</span></h2>
    <div class="form-grid" style="max-width:560px">
      <label>日付</label><input type="date" id="b-date" value="${jstToday()}">
      <label>報告者</label><input id="b-reporter" value="${h(ME.name)}">
      <label>名前 *</label><input id="b-name" placeholder="対象者の名前">
      <label>会話(5段階)</label>${sc('b-talk')}
      <label>服装(5段階)</label>${sc('b-dress')}
      <label>身なり(5段階)</label>${sc('b-groom')}
      <label>遅刻(5段階)</label>${sc('b-late')}
      <label>業務(5段階)</label>${sc('b-work')}
      <label>理由</label><textarea id="b-reason" placeholder="具体的な理由・エピソード"></textarea>
    </div>
    <div class="row" style="margin-top:14px"><button class="btn danger" id="b-add">提出する</button><span id="b-msg"></span></div>
  </div>
  <div class="card">
    <div class="sched-wrap pc-only"><table class="list">
    <tr><th>提出日時</th><th>日付</th><th>報告者</th><th>名前</th>${scTh.map(t=>`<th>${t}</th>`).join('')}<th>理由</th><th>登録者</th><th>状態</th><th></th></tr>
    ${rows.map(r=>`<tr class="click" data-id="${r.id}">
      <td>${h(r.ts)}</td><td>${h(r.date)}</td><td>${h(r.reporter)}</td><td><b>${h(r.name)}</b></td>
      <td class="c">${r.s_talk??''}</td><td class="c">${r.s_dress??''}</td><td class="c">${r.s_groom??''}</td><td class="c">${r.s_late??''}</td><td class="c">${r.s_work??''}</td>
      <td>${h(r.reason)}</td><td>${h(r.added_by)}</td><td>${matchedBadge(r.matched_ka)}</td>
      <td><button class="btn ghost sm icon-btn bl-sitelog" data-name="${h(r.name)}" title="過去の現場を見る">${icon('stadium')}</button></td></tr>`).join('') || '<tr><td colspan="13" class="muted">登録はありません</td></tr>'}
    </table></div>
    <div class="cards sp-only">
    ${rows.map(r=>{
      const sc2 = [['会話',r.s_talk],['服装',r.s_dress],['身なり',r.s_groom],['遅刻',r.s_late],['業務',r.s_work]].filter(x=>x[1]!=null);
      return `<div class="dcard clickable" data-id="${r.id}">
      <div class="dcard-head"><span class="dcard-title">${h(r.name)}</span><span class="dcard-sub">${h(r.date)}</span></div>
      ${r.matched_ka?`<div class="drow"><span class="dk">状態</span><span class="dv">${matchedBadge(r.matched_ka)}</span></div>`:''}
      <div class="drow"><span class="dk">報告者</span><span class="dv">${h(r.reporter)}</span></div>
      ${sc2.length?`<div class="drow"><span class="dk">評価</span><span class="dv"><div class="dscore">${sc2.map(x=>`<span>${x[0]} ${x[1]}</span>`).join('')}</div></span></div>`:''}
      ${r.reason?`<div class="drow"><span class="dk">理由</span><span class="dv">${h(r.reason)}</span></div>`:''}
      <div class="drow"><span class="dk">登録者</span><span class="dv dcard-sub">${h(r.added_by)} / ${h(r.ts)}</span></div>
      <div class="dcard-actions"><button class="btn ghost sm bl-sitelog" data-name="${h(r.name)}">${icon('stadium',{size:'12px'})} 過去の現場を見る</button></div>
    </div>`;}).join('') || '<div class="muted">登録はありません</div>'}
    </div>
  </div>`;
  app.querySelectorAll('.bl-sitelog').forEach(b => b.onclick = (e) => { e.stopPropagation(); openNameSiteLog(b.dataset.name); });
  app.querySelectorAll('[data-id]').forEach(el => el.onclick = () => {
    const target = rows.find(r => String(r.id) === el.dataset.id);
    if(target) openBlacklistEntry(target);
  });
  // 現場一覧などから「この登録を見る」で遷移してきた場合(#/blacklist?open=123)、該当の登録を自動で開く
  const openId = new URLSearchParams((hash||'').split('?')[1] || '').get('open');
  if(openId){
    const target = rows.find(r => String(r.id) === String(openId));
    if(target) openBlacklistEntry(target);
  }
  $('#b-add').onclick = async () => {
    const name = $('#b-name').value.trim();
    if(!name){ popup('名前は必須です', 'error'); return; }
    await withLoading($('#b-add'), async () => {
      try{
        await api('/blacklist',{method:'POST',body:{
          date:$('#b-date').value, reporter:$('#b-reporter').value.trim(), name,
          s_talk:$('#b-talk').value, s_dress:$('#b-dress').value, s_groom:$('#b-groom').value,
          s_late:$('#b-late').value, s_work:$('#b-work').value, reason:$('#b-reason').value
        }});
        render();
        popup('ブラックリストに登録しました。');
      }catch(e){ popup(e.message, 'error'); }
    });
  };
}

// ブラックリスト1件の詳細モーダル。現場一覧の要注意バッジ(#/blacklist?open=ID)から遷移した時にも使う。
function openBlacklistEntry(r){
  const sc2 = [['会話',r.s_talk],['服装',r.s_dress],['身なり',r.s_groom],['遅刻',r.s_late],['業務',r.s_work]].filter(x=>x[1]!=null);
  modal(`<h3>${icon('ban',{size:'15px'})} ブラックリスト #${r.id} ${matchedBadge(r.matched_ka)}</h3>
  <dl class="kv">
    <dt>提出日時</dt><dd>${h(r.ts)}</dd>
    <dt>対象日付</dt><dd>${h(r.date)}</dd>
    <dt>報告者</dt><dd>${h(r.reporter)}</dd>
    <dt>名前</dt><dd><b>${h(r.name)}</b></dd>
    ${sc2.length?`<dt>評価</dt><dd>${sc2.map(x=>`${x[0]} ${x[1]}`).join(' / ')}</dd>`:''}
    <dt>理由</dt><dd>${h(r.reason)||'—'}</dd>
    <dt>登録者</dt><dd>${h(r.added_by)}</dd>
  </dl>
  <div class="row" style="margin-top:14px">
    <button class="btn ghost sm" id="ble-sitelog">${icon('stadium',{size:'12px'})} 過去の現場を見る</button>
  </div>`);
  $('#ble-sitelog').onclick = () => openNameSiteLog(r.name);
}

/* ===== 新人報告・ブラックリストのスプレッドシート貼り付け用エクスポート(管理者専用) ===== */
async function pageReportExport(app){
  if(ME.role !== 'admin'){ notFound(app); return; }
  app.innerHTML = `<h2>${icon('paperclip')} スプレッドシート貼り付け用にコピー</h2><div class="card"><div class="loading-box"><span class="spinner"></span>読み込み中…</div></div>`;
  let reports, blacklist;
  try{
    [reports, blacklist] = await Promise.all([api('/reports'), api('/blacklist')]);
  }catch(e){ app.innerHTML = `<h2>${icon('paperclip')} スプレッドシート貼り付け用にコピー</h2><div class="card"><div class="msg err">${h(e.message)}</div></div>`; return; }

  const st = PAGE_STATE.reportExport || (PAGE_STATE.reportExport = { rFrom:'', rTo:'', bFrom:'', bTo:'' });

  app.innerHTML = `
  <h2 style="margin-bottom:4px">${icon('paperclip')} スプレッドシート貼り付け用にコピー</h2>

  <div class="card" style="margin-bottom:14px">
    <h3 style="margin-bottom:8px">${icon('sparkles')} 新人報告</h3>
    <div class="row" style="gap:10px;flex-wrap:wrap;align-items:center">
      <label>開始日 <input type="date" id="rex-from" value="${h(st.rFrom)}"></label>
      <label>終了日 <input type="date" id="rex-to" value="${h(st.rTo)}"></label>
      <button class="btn gold sm" id="rex-copy">コピーする</button>
      <span class="muted" id="rex-msg"></span>
    </div>
  </div>

  <div class="card">
    <h3 style="margin-bottom:8px">${icon('clockWarn')} ブラックリスト</h3>
    <div class="muted" style="margin-bottom:8px">評価は5段階からシートの表記(×/△/〇)に自動変換されます(1-2=×、3=△、4-5=〇)。</div>
    <div class="row" style="gap:10px;flex-wrap:wrap;align-items:center">
      <label>開始日 <input type="date" id="bex-from" value="${h(st.bFrom)}"></label>
      <label>終了日 <input type="date" id="bex-to" value="${h(st.bTo)}"></label>
      <button class="btn gold sm" id="bex-copy">コピーする</button>
      <span class="muted" id="bex-msg"></span>
    </div>
  </div>`;

  $('#rex-copy').onclick = () => {
    const from = $('#rex-from').value, to = $('#rex-to').value;
    st.rFrom = from; st.rTo = to;
    // ts は "07/11 20:18" のような "MM/DD HH:mm" 形式。日付比較のため年をつけて正規化する
    const inRange = ts => {
      if(!from && !to) return true;
      const m = String(ts||'').match(/^(\d{2})\/(\d{2})/);
      if(!m) return true;
      const y = new Date().getFullYear();
      const d = `${y}-${m[1]}-${m[2]}`;
      if(from && d < from) return false;
      if(to && d > to) return false;
      return true;
    };
    const targets = reports.filter(r => inRange(r.ts));
    if(!targets.length){ $('#rex-msg').textContent = '対象の報告がありません'; return; }
    const clean = s => String(s??'').replace(/[\t\n\r]+/g,' ').trim();
    const lines = targets.map(r => [
      r.ts, r.reporter_name, '', '', r.status==='checked'?'2次チェック':'1次チェック', '',
      r.candidate_name, r.candidate_grade, '', '', '', '',
      r.next_site, r.first_chief, r.first_note,
      [r.s_motivation, r.s_response].filter(v=>v!=null).join('/'),
      '', '', '',
      r.s_total ?? '', r.draft, r.plan, r.checker,
    ].map(clean).join('\t'));
    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(
      () => { $('#rex-msg').textContent = `${targets.length}件をコピーしました`; },
      () => { $('#rex-msg').textContent = 'コピーに失敗しました(ブラウザの権限を確認してください)'; }
    );
  };

  $('#bex-copy').onclick = () => {
    const from = $('#bex-from').value, to = $('#bex-to').value;
    st.bFrom = from; st.bTo = to;
    const inRange = d => (!from || d >= from) && (!to || d <= to);
    const targets = blacklist.filter(r => inRange(String(r.date||'')));
    if(!targets.length){ $('#bex-msg').textContent = '対象の登録がありません'; return; }
    const mark = n => n == null ? '' : (n <= 2 ? '×' : n === 3 ? '△' : '〇');
    const clean = s => String(s??'').replace(/[\t\n\r]+/g,' ').trim();
    const lines = targets.map(r => [
      r.date, r.reporter, r.name,
      mark(r.s_talk), mark(r.s_dress), mark(r.s_groom), mark(r.s_late), mark(r.s_work),
      r.reason,
    ].map(clean).join('\t'));
    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(
      () => { $('#bex-msg').textContent = `${targets.length}件をコピーしました`; },
      () => { $('#bex-msg').textContent = 'コピーに失敗しました(ブラウザの権限を確認してください)'; }
    );
  };
}

/* ===== 手配者専用ページ ===== */
/* ===== スプレッドシート取り込み(import_data権限・専用ページ) ===== */
async function pageImport(app, hash){
  if(!has('import_data')){ notFound(app); return; }
  const canReloadSettings = has('wage_settings');
  const daichoReloadSettings = canReloadSettings ? await api('/daicho-reload-settings').catch(()=>null) : null;
  const nskList = await api('/non-site-keywords').catch(()=>[]);
  const NSK_TYPE_LABEL = { x:'×(欠勤)', off:'休暇', ok:'1日OK', paid:'有給', ignore:'無視する(現場にも状態にもしない)' };
  app.innerHTML = `
  <h2 style="margin-bottom:8px">${icon('download')} スプレッドシートから取り込み <span class="muted" style="font-weight:400;font-size:13px">(IN/OUT・現場・会場)</span></h2>
  <div class="card">
    <textarea id="imp-urls" placeholder="https://docs.google.com/spreadsheets/d/.../edit?gid=...&#10;https://docs.google.com/spreadsheets/d/.../edit?gid=..." style="width:100%;min-height:80px;font-family:monospace;font-size:12px"></textarea>
    <div class="row" style="margin-top:8px;flex-wrap:wrap">
      <label>対象月 <input type="month" id="imp-month" value="${MONTH}"></label>
      <label>対象日(IN/OUT台帳用・シートの日付欄が空の場合に使用) <input type="date" id="imp-date" value="${jstToday()}"></label>
      <label>フォーマット
        <select id="imp-format">
          <option value="auto">自動判定</option>
          <option value="C">IN/OUT表(勤務表)</option>
          <option value="AB">個人スケジュール(月間表)</option>
          <option value="D">手配管理表(横並び・複数人)</option>
        </select>
      </label>
      <label><input type="checkbox" id="imp-add"> 既存に追加(同日を置き換えない)</label>
      <label><input type="checkbox" id="imp-save" checked> URLを保存する</label>
      <button class="btn gold" id="imp-run">取り込み実行</button>
    </div>
    <div id="imp-result" style="margin-top:10px"></div>
    <div id="imp-saved" class="muted" style="margin-top:8px"></div>
  </div>
  <div class="card" style="margin-top:16px">
    <h3 style="margin-bottom:8px">${icon('tag')} 現場として認識しない文言</h3>
    <div id="nsk-list"></div>
    <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap;align-items:center">
      <input id="nsk-keyword" placeholder="文言(例:公休)" style="width:140px;max-width:100%">
      <select id="nsk-type" style="max-width:100%">${Object.entries(NSK_TYPE_LABEL).map(([k,l])=>`<option value="${k}">${h(l)}</option>`).join('')}</select>
      <button class="btn gold sm" id="nsk-add">追加</button>
    </div>
  </div>
  ${canReloadSettings ? `
  <div class="card" style="margin-top:16px">
    <h3 style="margin-bottom:8px">${icon('moon')} 台帳の深夜自動再取り込み</h3>
    <div class="muted" style="margin-bottom:10px">上記で「URLを保存する」にチェックして取り込んだ台帳URLを、<b>設定した時刻に自動で再取り込み</b>します。手動取り込みが「事前の仮確認」、この自動処理が「その日の夜に確定版で上書き(不在者の休暇化を含む)」という運用です。</div>
    <div class="muted" style="margin-bottom:12px">この夜間取り込みが完了すると、保存済みURLは<b>使い切りとして自動的に削除</b>されます(1URL=1日分のデータのため)。<b>翌日以降も自動で取り込ませたい場合は、その日ごとに新しいURLを保存し直してください。</b>またR2台帳は<b>同じファイルの古いバージョンが削除され、最新版1件だけが残ります</b>。</div>
    <div class="form-grid" style="max-width:420px">
      <label>実行時刻</label>
      <select id="dr-hour" style="width:120px;max-width:100%">${Array.from({length:24},(_,i)=>`<option value="${i}" ${daichoReloadSettings&&daichoReloadSettings.hour===i?'selected':''}>${String(i).padStart(2,'0')}:00</option>`).join('')}</select>
    </div>
    <div class="row" style="margin-top:10px;gap:8px;align-items:center">
      <button class="btn gold sm" id="dr-save">保存</button>
      <span class="muted" id="dr-msg"></span>
    </div>
    <div id="daicho-reload-status" class="muted" style="margin-top:16px"><span class="spinner" style="width:13px;height:13px;border-width:2px;margin-right:5px"></span>読み込み中…</div>
    <div id="daicho-reload-urls" style="margin-top:12px"></div>
    <div id="dr-run-msg" class="muted" style="margin-top:8px"></div>
  </div>` : ''}
  ${canReloadSettings ? `
  <div class="card" style="margin-top:16px">
    <h3 style="margin-bottom:8px">${icon('fileText')} 台帳Excelファイルの取り込み</h3>
    <div class="muted" style="margin-bottom:12px">PCに保存してあるExcelファイル(手配管理表と同じ形式)を、直接アップロードして取り込みます。複数ファイルをまとめて選び、ファイルごとに対象日を指定できます(月をまたいだ一括取込も可能)。<b>この機能は深夜の自動再取り込みには含まれません。常に手動での実行です。</b></div>
    <input type="file" id="xl-file-input" multiple accept=".xlsx" style="margin-bottom:12px;width:100%;max-width:100%;box-sizing:border-box">
    <div id="xl-file-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px"></div>
    <label style="display:flex;align-items:flex-start;gap:7px;font-size:12.5px;margin-bottom:10px;padding:8px 10px;background:#faf9f6;border-radius:8px;border:1px solid var(--line)">
      <input type="checkbox" id="xl-check-absent" style="margin-top:2px">
      <span>選択した全ファイルのどれにも登場しない人を、休暇に変更する<br><span class="muted" style="font-size:11px">複数の日付をまたぐため、既定ではオフです。日ごとに対象者が異なる場合、意図せず休暇化されることがあります。</span></span>
    </label>
    <button class="btn gold sm" id="xl-import-btn" disabled>${icon('play',{size:'13px'})} 選択したファイルを取り込む</button>
    <div id="xl-import-msg" class="muted" style="margin-top:10px"></div>
  </div>` : ''}`;

  const renderNsk = (list) => {
    const el = $('#nsk-list'); if(!el) return;
    el.innerHTML = list.length ? `<div class="nsk-chips">
      ${list.map(k=>`<span class="nsk-chip">
        <b>${h(k.keyword)}</b><span class="muted" style="font-size:11.5px">(${h(NSK_TYPE_LABEL[k.type]||k.type)})</span>
        <button class="nsk-del" data-id="${k.id}" title="削除">${icon('x',{size:'12px'})}</button>
      </span>`).join('')}
    </div>` : '<div class="muted">登録されている文言はありません</div>';
    el.querySelectorAll('.nsk-del').forEach(b=>b.onclick=async()=>{
      if(!confirm('この文言を削除しますか？')) return;
      await withLoading(b, async () => {
        try{ await api(`/non-site-keywords/${b.dataset.id}`,{method:'DELETE'}); const d=await api('/non-site-keywords'); renderNsk(d); }
        catch(e){ popup(e.message,'error'); }
      });
    });
  };
  renderNsk(nskList);
  $('#nsk-add').onclick = async () => {
    const keyword = $('#nsk-keyword').value.trim();
    const type = $('#nsk-type').value;
    if(!keyword){ popup('文言を入力してください','error'); return; }
    await withLoading($('#nsk-add'), async () => {
      try{
        await api('/non-site-keywords',{method:'POST',body:{keyword,type}});
        $('#nsk-keyword').value='';
        const d = await api('/non-site-keywords'); renderNsk(d);
        popup('追加しました');
      }catch(e){ popup(e.message,'error'); }
    });
  };

  const showSaved = async () => {
    try{
      const d = await api('/import-urls');
      const el = $('#imp-saved'); if(!el) return;
      if(!d.urls.length){ el.innerHTML = '保存済みURLはありません'; return; }
      el.innerHTML = `<div style="margin-bottom:6px">保存済みURL (${d.urls.length}件): <button class="btn ghost xs" id="imp-clear-all" style="display:inline-block;width:auto">すべて削除</button></div>` +
        d.urls.map(u=>`<div class="imp-saved-row" style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap">
          <span style="flex:1 1 auto;min-width:0">
            <span style="font-weight:600">${h(u.sheetTitle || '(シート名不明)')}</span>
            <span class="muted" style="font-size:12px;display:block">登録日:${h(u.targetDate||'—')} / 読込:${h(u.savedAt||'—')}</span>
            <span class="muted" style="font-size:11px;font-family:monospace;display:block;word-break:break-all">${h(u.url)}</span>
          </span>
          <button class="btn ghost xs imp-del-one" data-url="${h(u.url)}" style="display:inline-block;width:auto">削除</button>
        </div>`).join('');
      const ca = $('#imp-clear-all');
      if(ca) ca.onclick = async () => {
        if(!confirm('保存済みURLをすべて削除しますか？\n\n※取り込み済みのスケジュール・給与データ・保管した台帳は残ります。次回また取り込む際にURLを貼り直す必要があるだけです。')) return;
        await withLoading(ca, async () => {
          try{ await api('/import-urls/delete',{method:'POST',body:{all:true}}); popup('保存済みURLをすべて削除しました'); showSaved(); }
          catch(e){ popup(e.message,'error'); }
        });
      };
      el.querySelectorAll('.imp-del-one').forEach(b => b.onclick = async () => {
        await withLoading(b, async () => {
          try{ await api('/import-urls/delete',{method:'POST',body:{url:b.dataset.url}}); popup('URLを削除しました'); showSaved(); }
          catch(e){ popup(e.message,'error'); }
        });
      });
    }catch(_){}
  };
  showSaved();
  $('#imp-run').onclick = async () => {
    const urls = $('#imp-urls').value.split(/\s+/).map(s=>s.trim()).filter(Boolean);
    if(!urls.length){ $('#imp-result').innerHTML='<span class="msg err">URLを入力してください</span>'; return; }
    $('#imp-result').innerHTML = '<span class="spinner" style="width:13px;height:13px;border-width:2px;margin-right:5px"></span><span class="muted">取り込み中…（全シートを読み込むため少し時間がかかります）</span>';
    await withLoading($('#imp-run'), async () => {
      try{
        const d = await api('/import-from-url', { method:'POST', body:{
          urls, month: $('#imp-month').value, date: $('#imp-date').value, format: $('#imp-format').value,
          add: $('#imp-add').checked, save: $('#imp-save').checked
        }});
        $('#imp-result').innerHTML = d.results.map(r=>{
          const short = r.url.length>60 ? r.url.slice(0,60)+'…' : r.url;
          if(!r.ok) return `<div class="imp-card imp-card-err">
            <div class="imp-card-url">${h(short)}</div>
            <div class="msg err" style="margin-top:4px">${h(r.error)}</div>
          </div>`;
          const errs = r.errors&&r.errors.length ? `<div class="muted" style="margin-top:4px">注意: ${r.errors.slice(0,5).map(h).join(' / ')}${r.errors.length>5?` ほか${r.errors.length-5}件`:''}</div>` : '';
          const arch = r.archived ? `<div class="muted" style="margin-top:4px">${icon('package')} 台帳をサーバーに保管しました</div>` : (r.archiveError?`<div class="muted" style="margin-top:4px">${icon('clockWarn')}保管失敗:${h(r.archiveError)}</div>`:'');
          const shList = r.sheets&&r.sheets.length ? `<div class="muted" style="margin-top:4px">シート: ${r.sheets.map(s=>`${h(s.name)}(${s.count})`).join(' / ')}</div>` : '';
          const skipDetail = (r.skippedUnregistered||r.skippedUnchanged||r.skippedInvalid) ? `<div class="muted" style="margin-top:4px">内訳: 未登録 ${r.skippedUnregistered||0}件 / 変更なし ${r.skippedUnchanged||0}件 / 不正な行 ${r.skippedInvalid||0}件</div>` : '';
          const otherOrgDetail = r.skippedOtherOrg ? `<div class="muted" style="margin-top:4px">対象外(登録番号が3から始まらない、または所属がRB以外): ${r.skippedOtherOrg}件</div>` : '';
          return `<div class="imp-card">
            <div class="imp-card-url">${h(short)}</div>
            <div class="msg ok" style="margin-top:4px">${r.sheetsRead||1}シート読込 / 反映 ${r.applied} / スキップ ${r.skipped}</div>
            ${skipDetail}${otherOrgDetail}${shList}${errs}${arch}
          </div>`;
        }).join('');
        showSaved();
      }catch(e){ $('#imp-result').innerHTML = `<span class="msg err">${h(e.message)}</span>`; }
    });
  };

  if(canReloadSettings){
    const dr = $('#dr-save');
    if(dr) dr.onclick = async () => {
      const hour = Number($('#dr-hour').value);
      $('#dr-msg').textContent='保存中…';
      await withLoading(dr, async () => {
        try{ await api('/daicho-reload-settings',{method:'PUT',body:{hour}});
          $('#dr-msg').textContent = `毎日 ${String(hour).padStart(2,'0')}:00 に自動再取り込み`;
          popup('設定を保存しました'); }
        catch(e){ $('#dr-msg').textContent=e.message; }
      });
    };
    // 台帳自動再取り込みの最終実行結果と保存済みURLの件数を表示
    const renderDrUrls = (urlList) => {
      const box = $('#daicho-reload-urls'); if(!box) return;
      if(!urlList.length){ box.innerHTML = ''; return; }
      box.innerHTML = `
        <div style="font-weight:700;font-size:13px;margin-bottom:6px">保存済みURLから、今すぐ手動で再取り込む</div>
        <div class="muted" style="font-size:11.5px;margin-bottom:8px">深夜の自動実行を待たずに、選んだURLだけ今すぐ再取り込みできます。<b>取り込んだURLは、成功・失敗にかかわらず保存済みリストから自動的に削除されます</b>(深夜の自動実行と同じ扱いです)。</div>
        <div style="max-height:220px;overflow-y:auto;border:1px solid var(--line);border-radius:8px;padding:6px 10px;margin-bottom:8px">
          ${urlList.map((u,i)=>`<label style="display:flex;align-items:flex-start;gap:7px;padding:5px 0;font-size:12.5px;border-bottom:1px solid var(--line)">
            <input type="checkbox" class="dr-url-chk" value="${h(u.url)}" checked style="margin-top:3px">
            <span style="min-width:0;word-break:break-all">${u.sheetTitle?`<b>${h(u.sheetTitle)}</b><br>`:''}<span class="muted">${h(u.url)}</span></span>
          </label>`).join('')}
        </div>
        <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px">
          <button class="btn ghost xs" id="dr-sel-all" style="display:inline-block;width:auto">全選択</button>
          <button class="btn ghost xs" id="dr-sel-none" style="display:inline-block;width:auto">全解除</button>
        </div>
        <label style="display:flex;align-items:flex-start;gap:7px;font-size:12.5px;margin-bottom:4px;padding:8px 10px;background:#faf9f6;border-radius:8px;border:1px solid var(--line)">
          <input type="checkbox" id="dr-check-absent" checked style="margin-top:2px">
          <span>選択したファイルのどれにも登場しない人を、休暇に変更する<br><span class="muted" id="dr-absent-warn"></span></span>
        </label>
        <button class="btn gold sm" id="dr-run-now" style="width:100%;margin-top:4px">${icon('play',{size:'13px'})} 選択したURLを今すぐ取り込む</button>
      `;
      const absentChk = $('#dr-check-absent');
      const warnEl = $('#dr-absent-warn');
      const updateAbsentWarn = () => {
        const selectedCount = box.querySelectorAll('.dr-url-chk:checked').length;
        const isAll = selectedCount === urlList.length && selectedCount > 0;
        // 一部のURLしか選んでいない状態でチェックが入っていると、選ばなかった他のファイルに
        // 載っている人まで誤って休暇にしてしまう恐れがあるため、その場合だけ警告する
        warnEl.innerHTML = (!isAll && absentChk.checked)
          ? `${icon('alertTriangle',{size:'11px'})} 一部のURLのみが対象です。選んでいない他のファイルに載っている人まで休暇にされる可能性があります`
          : '全てのファイルを対象にした場合に、より正確に判定できます';
        warnEl.style.color = (!isAll && absentChk.checked) ? 'var(--danger)' : '';
      };
      updateAbsentWarn();
      absentChk.onchange = updateAbsentWarn;
      box.querySelectorAll('.dr-url-chk').forEach(c => c.onchange = updateAbsentWarn);
      $('#dr-sel-all').onclick = () => { box.querySelectorAll('.dr-url-chk').forEach(c=>c.checked=true); updateAbsentWarn(); };
      $('#dr-sel-none').onclick = () => { box.querySelectorAll('.dr-url-chk').forEach(c=>c.checked=false); updateAbsentWarn(); };
      const runBtn = $('#dr-run-now');
      runBtn.onclick = async () => {
        const selected = [...box.querySelectorAll('.dr-url-chk:checked')].map(c=>c.value);
        if(!selected.length){ popup('取り込むURLを選んでください','error'); return; }
        const msgEl = $('#dr-run-msg'); // renderDrUrlsの外側の固定要素。一覧の再描画後も結果が消えない
        const isAll = selected.length === urlList.length;
        const checkAbsent = absentChk.checked;
        const absentNote = checkAbsent
          ? (isAll ? '\n\n選択した全ファイルのどれにも登場しない人を休暇にします。' : '\n\n⚠ 一部のURLのみですが、休暇化を行います。選んでいない他のファイルに載っている人まで休暇にされる可能性があります。')
          : '\n\n休暇化は行いません。';
        if(!confirm(`選択した${selected.length}件を今すぐ再取り込みします。${absentNote}\n\n取り込んだURLは保存済みリストから削除されます。シートの内容によっては時間がかかる場合があります。よろしいですか？`)) return;
        msgEl.textContent = '取り込み中…(内容によっては数十秒かかります)';
        await withLoading(runBtn, async () => {
          try{
            const r = await api('/daicho-reload-run-now', { method:'POST', body:{ urls: selected, checkAbsent } });
            const hasChanges = (r.results||[]).some(x => x.changes && x.changes.length);
            const skipNote = r.incomplete
              ? '<span class="muted" style="font-size:11px">⚠ 件数が多く時間の都合で一部は今回処理できませんでした。未処理分は今夜の深夜自動再取り込みで続けて処理されます。</span><br>'
              : '<span class="muted" style="font-size:11px">今夜の深夜自動再取り込みは、今回の手動実行分としてスキップされます。</span><br>';
            msgEl.innerHTML = `<b>${r.okCount}件成功(反映${r.totalApplied}件)</b>${r.ngCount?` / ${r.ngCount}件失敗`:''}${r.checkedAbsent?` / 不在者の休暇化 ${r.clearedAbsent}件`:''}${r.checkedAbsent&&r.clearedRegistrations?` / 台帳に見当たらない登録現場を削除 ${r.clearedRegistrations}件`:''} / 残りの保存済みURL ${r.remainingCount}件${hasChanges?` <button class="btn ghost xs" id="dr-run-show-changes" style="display:inline-block;width:auto">変更内容を見る</button>`:''}<br>${skipNote}`
              + r.results.map(x=>`${x.ok?icon('checkCircle',{size:'12px'}):icon('xCircle',{size:'12px'})} ${h((x.url||'').slice(0,60)+'…')} ${x.ok?`反映${x.applied}件`:`エラー:${h(x.error)}`}`).join('<br>');
            const showBtn2 = $('#dr-run-show-changes');
            if(showBtn2) showBtn2.onclick = () => showDaichoChanges({ ts: '今回の実行結果', results: r.results });
            popup(r.incomplete ? `一部処理しました(${r.okCount}件成功、残りは今夜の自動実行で継続)` : `取り込みが完了しました(${r.okCount}件成功)`);
            // 実際に処理できたURLだけを一覧から取り除く(incomplete時は選んだ全部が処理された
            // わけではないため、resultsに含まれるURLだけを対象にする。チェック状態を保つため
            // 一覧全体は再構築せず、対象の行だけをDOM上から削除する)
            const processedUrls = new Set((r.results||[]).map(x => x.url));
            box.querySelectorAll('.dr-url-chk').forEach(chk => {
              if(processedUrls.has(chk.value)){
                const label = chk.closest('label');
                if(label) label.remove();
              }
            });
            if(!box.querySelector('.dr-url-chk')){
              box.innerHTML = '<div class="muted" style="font-size:12.5px">保存済みのURLはありません。</div>';
            }
            loadStatus(true); // 最終実行結果・保存済み件数のみ更新(URL一覧は上で個別に更新済み)
          }catch(e){ msgEl.innerHTML = `<span class="msg err">${h(e.message)}</span>`; }
        });
      };
    };
    const showDaichoChanges = (r) => {
      const withChanges = (r.results || []).filter(x => x.changes && x.changes.length);
      const allChanges = withChanges.flatMap(x => x.changes.map(c => ({ ...c, _url: x.url, _ts: x.ts })));
      modal(`<h3>台帳再取り込みの変更内容</h3>
        <div class="muted" style="font-size:12px;margin-bottom:10px">最終実行: ${h(r.ts)} 時点の反映内容(${allChanges.length}件)</div>
        ${withChanges.length?`<div style="margin-bottom:10px;display:flex;flex-direction:column;gap:6px">
          ${withChanges.map(x=>`<button class="btn danger xs daicho-undo-one" data-ts="${h(x.ts)}">${icon('undo',{size:'12px'})} 「${h((x.url||'').slice(0,40))}…」の反映(${x.changes.length}件)を取り消す</button>`).join('')}
        </div>`:''}
        <div style="max-height:60vh;overflow-y:auto">
          <table class="list" style="font-size:12.5px">
            <tr><th>氏名</th><th>日付</th><th>変更前</th><th></th><th>変更後</th></tr>
            ${allChanges.map(c=>`<tr>
              <td class="nowrap">${h(c.name||'(氏名不明)')}</td>
              <td class="nowrap">${h(c.date)}</td>
              <td>${h(c.before)}</td>
              <td class="nowrap">${icon('arrowRight',{size:'11px'})}</td>
              <td><b>${h(c.after)}</b></td>
            </tr>`).join('') || '<tr><td colspan="5" class="muted">詳細データがありません</td></tr>'}
          </table>
        </div>`);
      document.querySelectorAll('.daicho-undo-one').forEach(btn => btn.onclick = async () => {
        const undoTs = btn.dataset.ts;
        if(!confirm('この分の反映を全て取り消し、取り込み前の状態に戻します。よろしいですか？\n\n※手配者モードが必要です。')) return;
        await withLoading(btn, async () => {
          try{
            const res = await api('/history/undo-by-ts', { method:'POST', body:{ ts: undoTs } });
            closeModal();
            popup(`${res.okCount}件を取り消しました${res.failed.length?`(${res.failed.length}件は失敗)`:''}`);
            loadStatus();
          }catch(e){ popup(e.message, 'error'); }
        });
      });
    };
    const loadStatus = (skipUrlsRerender) => {
      api('/import-urls').then(d => {
        const el = $('#daicho-reload-status'); if(!el) return;
        if(!skipUrlsRerender) renderDrUrls(d.urls);
        api('/settings/daicho-reload-result').then(res => {
          const savedCount = d.urls.length;
          const r = res && res.result;
          const hasChanges = r && (r.results||[]).some(x => x.changes && x.changes.length);
          el.innerHTML = `<div style="margin-bottom:6px">現在の保存済みURL: <b>${savedCount}件</b>${savedCount?` <span class="muted">(次回0:00に自動再取り込み後、削除されます)</span>`:' <span class="muted">(再取り込み対象なし)</span>'}</div>`
            + (r ? `<div class="muted" style="word-break:break-all">最終実行: ${h(r.ts)} / ${r.count}件のURLを再取り込み${r.clearedAbsent?` / ${icon('sun',{size:'12px'})} どのファイルにも登場しなかった人の現場を${r.clearedAbsent}件、休暇に変更`:''}${r.clearedRegistrations?` / 台帳に見当たらない登録現場を${r.clearedRegistrations}件削除`:''}${hasChanges?` <button class="btn ghost xs" id="daicho-show-changes">変更内容を見る</button>`:''}<br>${r.results.map(x=>`${x.ok?icon('checkCircle',{size:'12px'}):icon('xCircle',{size:'12px'})} ${h((x.url||'').slice(0,60)+'…')} ${x.ok?`反映${x.applied}件`:`エラー:${h(x.error)}`}`).join('<br>')}</div>` : '<div class="muted">まだ自動実行されていません</div>');
          const showBtn = $('#daicho-show-changes');
          if(showBtn) showBtn.onclick = () => showDaichoChanges(r);
          // 通知から「#/import?result=daicho」で遷移してきた場合、変更内容を自動で開く
          const resultParam = new URLSearchParams((hash||'').split('?')[1] || '').get('result');
          if(resultParam === 'daicho' && hasChanges) showDaichoChanges(r);
        }).catch(()=>{ el.textContent='設定を取得できませんでした'; });
      }).catch(()=>{});
    };
    loadStatus();

    // ---- 台帳Excelファイル取り込み(新規機能、深夜自動実行には含まれない) ----
    const xlState = { files: [] }; // { file: File, dateStr: string }[]
    const fileInput = $('#xl-file-input');
    const fileListEl = $('#xl-file-list');
    const importBtn = $('#xl-import-btn');

    // ファイル名から日付を推測する(例:「7月15日_台帳」「2026-07-15」「0715」等、よくある命名パターンに対応)
    // ファイル名から日付を推測する(グローバル関数guessDateFromNameを使用)

    const renderXlFileList = () => {
      fileListEl.innerHTML = xlState.files.map((f,i) => `
        <div class="row" style="gap:8px;align-items:center;padding:8px 10px;background:#faf9f6;border:1px solid var(--line);border-radius:8px;flex-wrap:wrap">
          <span style="flex:1;min-width:0;font-size:12.5px;word-break:break-all">${h(f.file.name)}</span>
          <label style="display:flex;align-items:center;gap:5px;font-size:12px;white-space:nowrap">対象日
            <input type="date" class="xl-date-input" data-idx="${i}" value="${h(f.dateStr)}" style="padding:4px 6px;border:1px solid var(--line);border-radius:6px">
          </label>
          <button type="button" class="btn ghost xs xl-remove" data-idx="${i}">${icon('x',{size:'11px'})}</button>
        </div>`).join('');
      fileListEl.querySelectorAll('.xl-date-input').forEach(inp => inp.onchange = (e) => {
        xlState.files[Number(e.target.dataset.idx)].dateStr = e.target.value;
        updateImportBtnState();
      });
      fileListEl.querySelectorAll('.xl-remove').forEach(btn => btn.onclick = () => {
        xlState.files.splice(Number(btn.dataset.idx), 1);
        renderXlFileList();
        updateImportBtnState();
      });
      updateImportBtnState();
    };
    const updateImportBtnState = () => { importBtn.disabled = xlState.files.length === 0; };

    if(fileInput) fileInput.onchange = () => {
      const newFiles = Array.from(fileInput.files || []);
      for(const file of newFiles){
        xlState.files.push({ file, dateStr: guessDateFromName(file.name) });
      }
      fileInput.value = ''; // 同じファイルを選び直せるようにリセット
      renderXlFileList();
    };

    const fileToBase64 = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]); // "data:...;base64,XXXX" のXXXX部分
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    if(importBtn) importBtn.onclick = async () => {
      if(!xlState.files.length){ popup('ファイルを選択してください','error'); return; }
      const checkAbsent = $('#xl-check-absent').checked;
      const missingDate = xlState.files.some(f => !f.dateStr);
      if(!confirm(`${xlState.files.length}件のExcelファイルを取り込みます。${checkAbsent?'\n\n選択した全ファイルのどれにも登場しない人を休暇にします。':''}${missingDate?'\n\n※対象日が未入力のファイルがあります。ファイル自身に年月の記載があればそちらが使われますが、無ければスキップされます。':''}\n\nファイルサイズによっては時間がかかる場合があります。よろしいですか？`)) return;
      const msgEl = $('#xl-import-msg');
      msgEl.textContent = '取り込み中…(ファイルサイズによっては数十秒かかります)';
      await withLoading(importBtn, async () => {
        try{
          const filesPayload = await Promise.all(xlState.files.map(async f => ({
            fileName: f.file.name,
            targetDate: f.dateStr || '',
            fileBase64: await fileToBase64(f.file),
          })));
          const r = await api('/import-excel-daicho', { method:'POST', body:{ files: filesPayload, checkAbsent } });
          msgEl.innerHTML = `<b>${r.okCount}件成功(反映${r.totalApplied}件)</b>${r.ngCount?` / ${r.ngCount}件失敗`:''}${checkAbsent&&r.clearedAbsent?` / 不在者の休暇化 ${r.clearedAbsent}件`:''}${checkAbsent&&r.clearedRegistrations?` / 台帳に見当たらない登録現場を削除 ${r.clearedRegistrations}件`:''}<br>`
            + r.results.map(x=>`${x.ok?icon('checkCircle',{size:'12px'}):icon('xCircle',{size:'12px'})} ${h(x.fileName)}${x.targetDate?` (${h(x.targetDate)})`:''} ${x.ok?`反映${x.applied}件`:`エラー:${h(x.error)}`}`).join('<br>');
          popup(`Excel取り込みが完了しました(${r.okCount}件成功)`);
          xlState.files = [];
          renderXlFileList();
        }catch(e){ msgEl.innerHTML = `<span class="msg err">${h(e.message)}</span>`; }
      });
    };
  }
}

/* ===== ログイン中メンバー・編集履歴(handler_tools権限・専用ページ) ===== */
/* ===== 現場変更報告の承認(手配担当者・管理者向け) ===== */
async function pageSelfReports(app){
  if(LV[ME.role] < 2){ notFound(app); return; }
  app.innerHTML = `<h2>${icon('mail')} 現場変更報告の承認</h2><div class="card"><div class="loading-box"><span class="spinner"></span>読み込み中…</div></div>`;
  let rows, typeOptions;
  try{ [rows, typeOptions] = await Promise.all([api('/self-reports'), api('/report-type-options').catch(()=>[])]); }
  catch(e){ app.innerHTML = `<h2>${icon('mail')} 現場変更報告の承認</h2><div class="card"><div class="msg err">${h(e.message)}</div></div>`; return; }

  const typeLabelMap = {}; typeOptions.forEach(o=>typeLabelMap[o.type]=o.label);
  const labelOf = r => r.type==='work' ? [r.site, r.venue].filter(Boolean).join('／') : (typeLabelMap[r.type] || r.type);

  app.innerHTML = `
  <h2 style="margin-bottom:8px">${icon('mail')} 現場変更報告の承認</h2>
  ${rows.length ? `
  <div class="row sticky-filters" id="sr-bulk-bar" style="margin-bottom:10px;gap:8px;align-items:center;flex-wrap:wrap">
    <button class="btn gold sm" id="sr-bulk-approve" disabled>選択した項目を承認(<span id="sr-sel-count">0</span>)</button>
    <button class="btn danger sm" id="sr-bulk-reject" disabled>選択した項目を見送る</button>
  </div>
  <div class="cards" style="display:flex">
    ${rows.map(r=>`<div class="dcard" data-id="${r.id}">
      <div class="dcard-head">
        <label style="display:flex;align-items:center;gap:8px;cursor:${r.type==='work'?'not-allowed':'pointer'}">
          <input type="checkbox" class="sr-check" data-id="${r.id}" data-type="${h(r.type)}" ${r.type==='work'?'disabled title="現場への変更は個別に承認してください"':''}>
          <span class="dcard-title">${h(r.user_name)}さん<span class="muted" style="font-size:12px"> (${h(r.user_regno)})</span></span>
        </label>
      </div>
      <div class="drow"><span class="dk">現場日</span><span class="dv">${h(r.date)}</span></div>
      <div class="drow"><span class="dk">変更内容</span><span class="dv"><b>${h(labelOf(r))}</b></span></div>
      <div class="drow"><span class="dk">伝えた人</span><span class="dv">${h(r.told_by)}</span></div>
      <div class="drow"><span class="dk">報告日時</span><span class="dv dcard-sub">${h(r.created_at)}</span></div>
      <div class="dcard-actions">
        <button class="btn gold sm sr-approve" data-id="${r.id}">${icon('checkCircle')} 承認する</button>
        <button class="btn danger sm sr-reject" data-id="${r.id}">${icon('xCircle')} 見送る</button>
      </div>
    </div>`).join('')}
  </div>
  ` : '<div class="card"><div class="muted" style="text-align:center;padding:20px 0">承認待ちの報告はありません</div></div>'}`;

  // 承認・却下は「手配モード」でのみ行える(通常の現場入力と同じ重みの操作のため)。
  // 手配モードでなければ、その場でPIN入力してから、元の操作をそのまま続行する。
  app.querySelectorAll('.sr-approve').forEach(b => b.onclick = () => {
    const r = rows.find(x => String(x.id) === b.dataset.id);
    if(!r) return;
    const proceed = () => {
      if(r.type !== 'work'){
        if(!confirm(`「${labelOf(r)}」として承認しますか？`)) return;
        api(`/self-reports/${r.id}/approve`, { method:'POST' })
          .then(()=>{ popup('承認しました'); pageSelfReports(app); })
          .catch(e=>popup(e.message,'error'));
        return;
      }
      openSelfReportApprove(r);
    };
    if(ME.handler !== 1 && ME.role !== 'admin'){ openHandlerPin(proceed); return; }
    proceed();
  });
  app.querySelectorAll('.sr-reject').forEach(b => b.onclick = () => {
    const proceed = async () => {
      if(!confirm('この報告を見送りますか？(スケジュールには反映されません)')) return;
      try{ await api(`/self-reports/${b.dataset.id}/reject`, { method:'POST' }); popup('見送りました'); pageSelfReports(app); }
      catch(e){ popup(e.message,'error'); }
    };
    if(ME.handler !== 1 && ME.role !== 'admin'){ openHandlerPin(proceed); return; }
    proceed();
  });

  // 複数選択・一括処理(承認は「現場への変更」以外のみ選択可能、却下は全件対象)
  const updateBulkBar = () => {
    const checked = app.querySelectorAll('.sr-check:checked');
    const cnt = $('#sr-sel-count'); if(cnt) cnt.textContent = checked.length;
    const ab = $('#sr-bulk-approve'); if(ab) ab.disabled = checked.length === 0;
    const rb = $('#sr-bulk-reject'); if(rb) rb.disabled = checked.length === 0;
  };
  app.querySelectorAll('.sr-check').forEach(cb => cb.onchange = updateBulkBar);
  const bulkProceed = async (action) => {
    const ids = [...app.querySelectorAll('.sr-check:checked')].map(cb => Number(cb.dataset.id));
    if(!ids.length) return;
    if(!confirm(`選択した${ids.length}件を${action==='approve'?'承認':'見送り'}します。よろしいですか？`)) return;
    try{
      const r = await api('/self-reports/bulk-decide', { method:'POST', body:{ ids, action } });
      if(r.failed && r.failed.length) popup(`${r.okCount}件処理しました(${r.failed.length}件は失敗: ${r.failed[0].error})`, 'error');
      else popup(`${r.okCount}件処理しました`);
      pageSelfReports(app);
    }catch(e){ popup(e.message,'error'); }
  };
  const bab = $('#sr-bulk-approve'); if(bab) bab.onclick = () => {
    if(ME.handler !== 1 && ME.role !== 'admin'){ openHandlerPin(() => bulkProceed('approve')); return; }
    bulkProceed('approve');
  };
  const brb = $('#sr-bulk-reject'); if(brb) brb.onclick = () => {
    if(ME.handler !== 1 && ME.role !== 'admin'){ openHandlerPin(() => bulkProceed('reject')); return; }
    bulkProceed('reject');
  };
}

// 現場変更報告の承認時に、通常の現場入力と同じ項目(現場名・会場・時刻・業務名など)を
// 入力・修正してから反映できるモーダル。現場名/会場名は報告内容を初期値にする。
// 報告の対象日は既に決まっているため、その日に既に登録されている現場があれば一覧から選んで
// 「既存の現場に追加」でき、新規入力(表記ゆれで別の現場として増えてしまうこと)を防げる。
async function openSelfReportApprove(r){
  let daySites = [];
  try{ daySites = (await api(`/sites?month=${r.date.slice(0,7)}`)).filter(s => s.date === r.date); }
  catch(e){}
  modal(`<h3>${h(r.user_name)} さん / ${h(r.date)} の報告を承認</h3>
    <div class="muted" style="margin-bottom:10px">伝えた人: ${h(r.told_by)}</div>
    <div class="form-grid" style="grid-template-columns:64px 1fr;gap:6px 8px">
      ${daySites.length ? `<label>既存の現場</label><select id="sra-existing">
        <option value="">— 新規入力 —</option>
        ${daySites.map((s,i)=>`<option value="${i}">${h(s.site)}${s.venue?`(${h(s.venue)})`:''} ・${s.cnt}名</option>`).join('')}
      </select>` : ''}
      <label>現場名</label><input id="sra-site" value="${h(r.site||'')}" placeholder="例:NiziU">
      <label>会場</label><input id="sra-venue" value="${h(r.venue||'')}" placeholder="例:京セラドーム大阪">
      <label>業務名</label><select id="sra-duty">${DUTIES.map(d=>`<option ${d==='案内'?'selected':''}>${d}</option>`).join('')}</select>
      <label>IN</label><input id="sra-in" placeholder="9:00">
      <label>OUT</label><input id="sra-out" placeholder="18:00">
      <label>搬入終了</label><input id="sra-le" placeholder="任意 例:10:30">
      <label>終演</label><input id="sra-se" placeholder="任意 例:20:00">
      <label>手当</label><label style="font-weight:400;font-size:13px;display:flex;align-items:center;gap:6px"><input type="checkbox" id="sra-multi" style="width:auto"> 2st(複数回公演 +¥500)</label>
      <label>備考</label><input id="sra-note" placeholder="例:物販頭">
    </div>
    <div class="row" style="margin-top:14px">
      <button class="btn gold" id="sra-save" style="flex:1">承認して反映する</button>
    </div>
`);

  const existingSel = $('#sra-existing');
  if(existingSel) existingSel.onchange = () => {
    const idx = existingSel.value;
    if(idx === '') return;
    const s = daySites[Number(idx)];
    if(!s) return;
    $('#sra-site').value = s.site;
    $('#sra-venue').value = s.venue || '';
  };

  $('#sra-save').onclick = async () => {
    const site = $('#sra-site').value.trim();
    const venue = $('#sra-venue').value.trim();
    if(!site && !venue){ popup('現場名か会場名を入力してください','error'); return; }
    const body = {
      site, venue,
      duty: $('#sra-duty').value,
      tin: $('#sra-in').value.trim(),
      tout: $('#sra-out').value.trim(),
      load_end: $('#sra-le').value.trim(),
      show_end: $('#sra-se').value.trim(),
      multi: $('#sra-multi').checked ? 1 : 0,
      note: $('#sra-note').value.trim(),
    };
    await withLoading($('#sra-save'), async () => {
      try{
        await api(`/self-reports/${r.id}/approve`, { method:'POST', body });
        closeModal(); popup('承認しました');
        if(location.hash === '#/self-reports') pageSelfReports(document.getElementById('app'));
      }catch(e){ popup(e.message,'error'); }
    });
  };
}

// スケジュール変更履歴の before_json/after_json を人間が読める短い文言に変換する。
// (編集履歴一覧・個人スケジュールの変更履歴の両方から使う共通ロジック)
function summarizeHistory(b, a){
  const p = j => {
    if (j == null) return {};
    if (typeof j === 'object') return j;
    try{ const v = JSON.parse(j); return (v && typeof v === 'object') ? v : {}; }catch(_){ return {}; }
  };
  const typeLabel = { off:'休暇', paid:'有給', ok:'1日OK', x:'×' };
  const descSlot = s => {
    if(!s || typeof s !== 'object') return '(空)';
    if(!s.type) return '(空)';
    if(s.type === 'work') return `現場「${String(s.site||'')}」${String(s.tin||'')}-${String(s.tout||'')}`;
    return typeLabel[s.type] || '(その他)';
  };
  const desc = o => {
    if(!o || typeof o !== 'object') return '(空)';
    if(o.plan!==undefined && o.type===undefined) return `育成計画「${String(o.plan||'(空)').slice(0,200)}」`;
    let slots = Array.isArray(o) ? o : (o.slots !== undefined ? (typeof o.slots==='string'?p(o.slots):o.slots) : (o.type?[o]:[]));
    if(!Array.isArray(slots)) slots = [];
    if(!slots.length) return '(空)';
    return slots.map(descSlot).join(' / ');
  };
  const ao = p(a);
  const src = (ao && typeof ao==='object' && ao._src) ? `[${String(ao._src).slice(0,60)}] ` : '';
  return src + `${desc(p(b))} → ${desc(ao)}`;
}

async function pageHandlerStatus(app){
  if(!has('handler_tools')){ notFound(app); return; }
  const stHs = PAGE_STATE.handlerStatus || (PAGE_STATE.handlerStatus = { open:{ online:true } });
  const openSet = stHs.open;
  const sec = (id,title,body)=>`<details class="adm-sec" id="hssec-${id}" data-sec="${id}" ${openSet[id]?'open':''}><summary><span class="adm-sec-title">${title}</span></summary><div class="adm-body">${body}</div></details>`;
  app.innerHTML = `
  <h2 style="margin-bottom:8px">ログイン中メンバー・編集履歴</h2>
  <div class="adm-nav sticky-filters">
    ${[['online',`${icon('circleFilled')} ログイン中`],['hist',`${icon('fileText')} 編集履歴`]].map(s=>`<button class="adm-chip" data-jump="${s[0]}">${s[1]}</button>`).join('')}
  </div>
  ${sec('online',`<span style="white-space:nowrap">${icon('circleFilled')} 現在ログイン中のメンバー</span> <span class="muted" style="font-weight:400">(10秒ごとに自動更新)</span>`, `<div id="hd-online" class="muted"><span class="spinner" style="width:13px;height:13px;border-width:2px;margin-right:5px"></span>読み込み中…</div>`)}
  ${sec('hist',`<span style="white-space:nowrap">${icon('fileText')} スケジュール編集履歴</span> <span class="muted" style="font-weight:400">(直近500件)</span>`, `<div id="hd-history" class="muted"><span class="spinner" style="width:13px;height:13px;border-width:2px;margin-right:5px"></span>読み込み中…</div>`)}`;

  app.querySelectorAll('.adm-sec').forEach(d => d.addEventListener('toggle', () => { stHs.open[d.dataset.sec] = d.open; }));
  app.querySelectorAll('[data-jump]').forEach(b => b.onclick = () => {
    const d = document.getElementById('hssec-'+b.dataset.jump);
    if(d){ d.open = true; stHs.open[b.dataset.jump] = true; d.scrollIntoView({behavior:'smooth', block:'start'}); }
  });

  const fmtAgo = ms => { const s = Math.floor((Date.now()-ms)/1000); return s<60?'たった今':Math.floor(s/60)+'分前'; };
  const summarize = summarizeHistory;
  const loadOnline = async () => {
    try{
      const rows = await api('/online');
      const el = $('#hd-online'); if(!el) return;
      const canSeeActivity = rows.length && rows[0].last_page !== undefined;
      el.innerHTML = rows.length ? `<table class="list pc-only"><tr><th></th><th>氏名</th><th>登録番号</th>${canSeeActivity?'<th>閲覧中</th>':''}<th>最終アクセス</th></tr>
        ${rows.map(r=>`<tr><td class="c"><span class="online-dot pulse"></span></td><td>${r.uid?`<span class="name-link" data-goto-uid="${r.uid}">${h(r.name)}</span>`:h(r.name)}${r.handler?' <span class="tag handler">手配モード中</span>':''}</td>
        <td>${h(r.regno)}</td>${canSeeActivity?`<td>${h(pageLabelFromHash(r.last_page))}</td>`:''}<td>${fmtAgo(r.last_seen)}</td></tr>`).join('')}</table>
        <div class="cards sp-only">${rows.map(r=>`<div class="dcard">
          <div class="dcard-head"><span class="dcard-title"><span class="online-dot pulse"></span> ${r.uid?`<span class="name-link" data-goto-uid="${r.uid}">${h(r.name)}</span>`:h(r.name)}</span></div>
          <div class="drow"><span class="dk">登録番号</span><span class="dv">${h(r.regno)}</span></div>
          ${canSeeActivity?`<div class="drow"><span class="dk">閲覧中</span><span class="dv">${h(pageLabelFromHash(r.last_page))}</span></div>`:''}
          <div class="drow"><span class="dk">最終アクセス</span><span class="dv">${fmtAgo(r.last_seen)}${r.handler?' / 手配モード中':''}</span></div>
        </div>`).join('')}</div>` : '<div class="muted">現在ログイン中のメンバーはいません</div>';
      wireNameLinks(el);
    }catch(_){}
  };
  loadOnline();
  timers.push(setInterval(loadOnline, 10000));

  const loadHistory = async () => {
    const hist = await api('/history');
    $('#hd-history').innerHTML = hist.length ? `
    <div class="row" id="hd-bulk-bar" style="margin-bottom:10px;gap:8px;align-items:center">
      <button class="btn danger sm" id="hd-bulk-undo" disabled>選択した項目を取り消す(<span id="hd-sel-count">0</span>)</button>
    </div>
    <div class="sched-wrap pc-only"><table class="list">
      <tr><th></th><th>日時</th><th>編集者</th><th>対象メンバー</th><th>対象日</th><th>変更内容</th><th></th></tr>
      ${hist.map(x=>`<tr><td><input type="checkbox" class="hd-check" data-id="${x.id}" data-date="${h(x.date)}"></td><td>${h(x.ts)}</td><td>${h(x.editor_name)}</td><td>${x.target_id?`<span class="name-link" data-goto-uid="${x.target_id}">${h(x.target_name)}</span>`:h(x.target_name)}</td><td>${h(x.date)}</td><td>${h(summarize(x.before_json, x.after_json))}</td><td><button class="btn ghost xs hd-undo" data-id="${x.id}" data-date="${h(x.date)}">${icon('undo',{size:'12px'})} 取り消す</button></td></tr>`).join('')}
    </table></div>
    <div class="cards sp-only">${hist.map(x=>`<div class="dcard">
      <div class="dcard-head">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" class="hd-check" data-id="${x.id}" data-date="${h(x.date)}">
          <span class="dcard-title">${x.target_id?`<span class="name-link" data-goto-uid="${x.target_id}">${h(x.target_name)}</span>`:h(x.target_name)} / ${h(x.date)}</span>
        </label>
        <span class="dcard-sub">${h(x.editor_name)}</span>
      </div>
      <div class="drow"><span class="dk">変更</span><span class="dv">${h(summarize(x.before_json, x.after_json))}</span></div>
      <div class="drow"><span class="dk">日時</span><span class="dv dcard-sub">${h(x.ts)}</span></div>
      <div class="row" style="margin-top:6px"><button class="btn ghost xs hd-undo" data-id="${x.id}" data-date="${h(x.date)}">${icon('undo',{size:'12px'})} この変更を取り消す</button></div>
    </div>`).join('')}</div>` : '<div class="muted">編集履歴はありません</div>';
    wireNameLinks($('#hd-history'));

    const updateBulkBar = () => {
      const checked = $('#hd-history').querySelectorAll('.hd-check:checked');
      const cnt = $('#hd-sel-count'), btn = $('#hd-bulk-undo');
      if(cnt) cnt.textContent = checked.length;
      if(btn) btn.disabled = checked.length === 0;
    };
    $('#hd-history').querySelectorAll('.hd-check').forEach(cb => cb.onchange = updateBulkBar);
    updateBulkBar();

    const undoIds = async (ids) => {
      try{
        const r = await api('/history/undo-batch', { method:'POST', body:{ ids } });
        if(r.failed && r.failed.length) popup(`${r.okCount}件を取り消しました(${r.failed.length}件は失敗)`, 'error');
        else popup(`${r.okCount}件を取り消しました`);
        loadHistory();
      }catch(e){ popup(e.message,'error'); }
    };

    $('#hd-history').querySelectorAll('.hd-undo').forEach(b => b.onclick = () => {
      const doUndo = () => {
        if(!confirm(`${b.dataset.date} の内容を、この変更が行われる前の状態に戻します。よろしいですか？`)) return;
        undoIds([Number(b.dataset.id)]);
      };
      if(ME.handler !== 1 && ME.role !== 'admin'){ openHandlerPin(doUndo); return; }
      doUndo();
    });
    const bulkBtn = $('#hd-bulk-undo');
    if(bulkBtn) bulkBtn.onclick = () => {
      const ids = [...$('#hd-history').querySelectorAll('.hd-check:checked')].map(cb => Number(cb.dataset.id));
      if(!ids.length) return;
      const doUndo = () => {
        if(!confirm(`選択した${ids.length}件の変更を、それぞれ行われる前の状態に戻します。よろしいですか？`)) return;
        undoIds(ids);
      };
      if(ME.handler !== 1 && ME.role !== 'admin'){ openHandlerPin(doUndo); return; }
      doUndo();
    };
  };
  loadHistory();
}

/* ===== ロール一括権限の編集(管理者のみ・専用ページ) ===== */
async function pageRolePermissions(app){
  if(!has('account_manage')){ notFound(app); return; }
  app.innerHTML = '<h2>権限の一括設定</h2><div class="card"><div class="loading-box"><span class="spinner"></span>読み込み中…</div></div>';
  let defs;
  try{ defs = await api('/perm-defs'); }
  catch(e){ app.innerHTML = `<h2>権限の一括設定</h2><div class="card"><div class="msg err">${h(e.message)}</div></div>`; return; }

  const roles = [
    { key:'member', label:'メンツ全員' },
    { key:'chief', label:'チーフ全員' },
    { key:'handler', label:'チーフ(手配者)全員' },
  ];
  app.innerHTML = `
  <div style="margin-bottom:14px"><a href="#/admin" class="btn ghost sm">← アカウント管理に戻る</a></div>
  <h2 style="margin-bottom:4px">権限の一括設定</h2>
  <div class="adm-nav sticky-filters">
    ${roles.map(r=>`<button class="adm-chip" data-jump="role-${r.key}">${r.label}</button>`).join('')}
  </div>
  ${roles.map(r=>`<details class="adm-sec" id="rsec-${r.key}" data-sec="${r.key}">
    <summary>${r.label}の追加権限</summary>
    <div class="adm-body">
      <div class="muted" style="margin-bottom:10px">対象: <span id="rcount-${r.key}">—</span></div>
      <div id="rlist-${r.key}"></div>
      <div class="row" style="margin-top:14px;gap:8px;align-items:center">
        <button class="btn gold sm" data-save="${r.key}">${r.label}に反映する</button>
        <span class="muted" id="rmsg-${r.key}"></span>
      </div>
    </div>
  </details>`).join('')}`;

  app.querySelectorAll('.adm-sec').forEach(d => { /* no persisted open-state needed here */ });
  app.querySelectorAll('[data-jump]').forEach(b => b.onclick = () => {
    const d = document.getElementById('rsec-'+b.dataset.jump);
    if(d){ d.open = true; d.scrollIntoView({behavior:'smooth', block:'start'}); }
  });

  for(const r of roles){
    let cur;
    try{ cur = await api(`/role-perms/${r.key}`); }
    catch(e){ $('#rlist-'+r.key).innerHTML = `<div class="msg err">${h(e.message)}</div>`; continue; }
    $('#rcount-'+r.key).textContent = `${cur.count}人`;
    const listEl = $('#rlist-'+r.key);
    const revokedSet = new Set(cur.revokedPerms || []);
    listEl.innerHTML = defs.perms.map(p=>{
      const already = p.baseLv <= LV[r.key]; // この役割の基本権限で既に使える機能
      const isRevoked = revokedSet.has(p.key);
      const checked = already ? !isRevoked : cur.perms.includes(p.key);
      return `<label class="perm-row" style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)">
        <input type="checkbox" class="rperm-cb-${r.key}" value="${p.key}" data-base="${already?'1':'0'}" ${checked?'checked':''} style="width:18px;height:18px">
        <span style="flex:1">${h(p.label)}</span>
        <span class="perm-tag muted" style="font-size:11px;white-space:nowrap"></span>
      </label>`;
    }).join('');
    const updateRPermTag = (cb) => {
      const tag = cb.closest('.perm-row').querySelector('.perm-tag');
      const isBase = cb.dataset.base === '1';
      if(isBase && !cb.checked){ tag.textContent = 'この役割は禁止'; tag.style.color = '#b23b3b'; }
      else if(isBase && cb.checked){ tag.textContent = '標準で利用可'; tag.style.color = ''; }
      else if(!isBase && cb.checked){ tag.textContent = 'この役割に追加'; tag.style.color = 'var(--gold)'; }
      else { tag.textContent = ''; tag.style.color = ''; }
    };
    listEl.querySelectorAll(`.rperm-cb-${r.key}`).forEach(cb => { updateRPermTag(cb); cb.onchange = () => updateRPermTag(cb); });
  }

  app.querySelectorAll('[data-save]').forEach(btn => btn.onclick = async () => {
    const role = btn.dataset.save;
    const extraKeys = [], revokedKeys = [];
    document.querySelectorAll(`.rperm-cb-${role}`).forEach(cb => {
      const isBase = cb.dataset.base === '1';
      if(isBase && !cb.checked) revokedKeys.push(cb.value);
      if(!isBase && cb.checked) extraKeys.push(cb.value);
    });
    const msgEl = $('#rmsg-'+role);
    msgEl.textContent = '保存中…';
    await withLoading(btn, async () => {
      try{
        const r = await api(`/role-perms/${role}`, { method:'PUT', body:{ perms: extraKeys, revokedPerms: revokedKeys } });
        msgEl.textContent = `${r.updated}人に反映しました`;
        popup('一括で権限を反映しました');
      }catch(e){ msgEl.textContent = e.message; }
    });
  });
}

/* ===== 個人の年間稼働サマリー・備考欄(member_summary_view権限があれば、対象が本人でも閲覧可) ===== */
/* ===== 個人の年間サマリーを、メンバーを検索して開くための入口画面(左メニュー用) ===== */
async function pageMemberSummarySearch(app){
  if(!has('member_summary_view')){ notFound(app); return; }
  app.innerHTML = `<h2>${icon('barChart')} 個人の年間サマリー</h2><div class="card"><div class="loading-box"><span class="spinner"></span>読み込み中…</div></div>`;
  const users = await getUsers();
  const list = users.sort((a,b) => String(a.regno||'').localeCompare(String(b.regno||''), undefined, {numeric:true}));
  app.innerHTML = `
  <h2>${icon('barChart')} 個人の年間サマリー</h2>
  <div class="card">
    <div class="muted" style="margin-bottom:10px;font-size:12.5px">対象のメンバーを選んでください</div>
    <input type="text" id="mss-q" placeholder="氏名・登録番号で検索" style="width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:8px;font-size:14px;margin-bottom:12px">
    <div id="mss-list" style="max-height:60vh;overflow-y:auto"></div>
  </div>`;
  const renderList = () => {
    const q = $('#mss-q').value.trim();
    const filtered = !q ? list : list.filter(u => (u.name||'').includes(q) || (u.regno||'').includes(q));
    $('#mss-list').innerHTML = filtered.map(u => `<button type="button" class="drawer-link" data-uid="${u.id}" style="border-radius:8px;margin-bottom:2px">
        <span class="drawer-label">${h(u.name)} <span class="muted" style="font-size:11.5px">${h(u.regno)} ${u.rank?h(u.rank)+'ランク':''}</span></span>
      </button>`).join('') || '<div class="muted" style="text-align:center;padding:16px">該当するメンバーがいません</div>';
    $('#mss-list').querySelectorAll('[data-uid]').forEach(b => b.onclick = () => { location.hash = '#/member-summary/' + b.dataset.uid; });
  };
  renderList();
  $('#mss-q').oninput = renderList;
}

// 年間サマリーのカード群(年間トータル・月別の内訳・備考欄)の共通HTML。マイスケジュール下部への
// 埋め込み(renderScheduleYearSummary)と、個人の年間サマリー単独ページ(pageMemberYearSummary)の
// 両方から使う。
function yearSummaryCardsHtml(data, notesData, canPay){
  const monthShort = ym => ym.slice(5,7) + '月';
  const maxHours = Math.max(1, ...data.months.map(m=>m.hours));
  const rankTrack = data.target ? renderRankTrack(data.target.rank) : '';
  return `
  <div class="card" style="margin-bottom:14px">
    <div style="text-align:center;font-size:15px;font-weight:700;margin-bottom:10px">${h(data.yearLabel)}</div>
    <div class="row" style="align-items:center;justify-content:center;flex-wrap:nowrap;gap:14px">
      <button class="btn ghost sm" id="ys-prev">${icon('arrowLeft',{size:'13px'})} 前年度</button>
      <button class="btn ghost sm" id="ys-next">次年度 ${icon('arrowRight',{size:'13px'})}</button>
    </div>
    ${rankTrack ? `<div class="muted" style="font-size:11px;text-align:center;margin-top:10px">現在のランク進捗</div>${rankTrack}` : ''}
  </div>

  <div class="card" style="margin-bottom:14px">
    <div class="card-t" style="font-weight:800;margin-bottom:10px">年間トータル</div>
    <div class="kpis" style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
      <div class="kpi" style="background:#faf9f6;border:1px solid var(--line);border-radius:11px;padding:11px 6px;text-align:center">
        <div style="font-size:20px;font-weight:800">${data.total.workDays}<span style="font-size:11px;color:var(--muted)">日</span></div>
        <div style="font-size:11px;color:var(--muted)">勤務日数</div>
      </div>
      <div class="kpi" style="background:#faf9f6;border:1px solid var(--line);border-radius:11px;padding:11px 6px;text-align:center">
        <div style="font-size:20px;font-weight:800">${data.total.hours}<span style="font-size:11px;color:var(--muted)">h</span></div>
        <div style="font-size:11px;color:var(--muted)">総勤務時間</div>
      </div>
      <div class="kpi" style="background:#faf9f6;border:1px solid var(--line);border-radius:11px;padding:11px 6px;text-align:center">
        <div style="font-size:20px;font-weight:800">${data.total.overtime}<span style="font-size:11px;color:var(--muted)">h</span></div>
        <div style="font-size:11px;color:var(--muted)">総残業時間</div>
      </div>
      <div class="kpi" style="background:#faf9f6;border:1px solid var(--line);border-radius:11px;padding:11px 6px;text-align:center">
        ${canPay?`<div style="font-size:20px;font-weight:800">${Math.round(data.total.pay/10000)}<span style="font-size:11px;color:var(--muted)">万円</span></div>`:'<div class="muted" style="font-size:12px">権限なし</div>'}
        <div style="font-size:11px;color:var(--muted)">給料合計</div>
      </div>
    </div>
  </div>

  <div class="card" style="margin-bottom:14px">
    <div class="card-t" style="font-weight:800;margin-bottom:10px">月別の内訳</div>
    <div class="list-scroll">
      <table class="list" style="min-width:760px">
        <tr><th>月</th>${data.months.map(m=>`<th class="nowrap">${monthShort(m.ym)}</th>`).join('')}</tr>
        <tr><td>勤務日数</td>${data.months.map(m=>`<td>${m.workDays}日</td>`).join('')}</tr>
        <tr><td>勤務時間</td>${data.months.map(m=>`<td>${m.hours}h</td>`).join('')}</tr>
        <tr><td>残業時間</td>${data.months.map(m=>`<td>${m.overtime}h</td>`).join('')}</tr>
        <tr><td>給料</td>${data.months.map(m=>`<td>${canPay?h(m.pay.toLocaleString())+'円':'—'}</td>`).join('')}</tr>
      </table>
    </div>
    <div class="muted" style="font-size:11px;margin-top:6px">${window.innerWidth<640?'横にスクロールできます':''}</div>
    <div style="margin-top:16px;display:flex;align-items:flex-end;gap:4px;height:120px;padding:0 4px">
      ${data.months.map(m=>`<div style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:4px">
        <div class="muted" style="font-size:10px">${m.hours}h</div>
        <div class="ys-bar" data-h="${Math.max(2, Math.round(m.hours/maxHours*90))}" style="width:100%;max-width:28px;height:2px;background:var(--gold);border-radius:3px 3px 0 0;transition:height .5s ease"></div>
        <div class="muted" style="font-size:10px">${m.ym.slice(5,7)}月</div>
      </div>`).join('')}
    </div>
  </div>

  <div class="card">
    <div class="card-t" style="font-weight:800;margin-bottom:10px">${icon('fileText',{size:'14px'})} 備考欄</div>
    <div class="muted" style="font-size:11.5px;margin-bottom:10px">自由に記入できます。誰が書いたかは全員に表示されます。</div>
    <textarea id="ys-note-input" rows="3" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:8px;font-size:13px" placeholder="気づいたこと・申し送り事項などを記入…"></textarea>
    <div class="row" style="margin-top:8px"><button class="btn gold sm" id="ys-note-add">${icon('plus',{size:'13px'})} 追加する</button></div>
    <div style="margin-top:14px">
      ${notesData.notes.map((n,i)=>{
        const colorCls = ['','pink','blue'][i%3];
        const long = (n.content||'').length > 140;
        return `<div class="fusen ${colorCls}">
          <div class="fusen-meta row" style="justify-content:space-between;align-items:center">
            <span>${h(n.author_name||'(不明)')} ・ ${h(n.ts)}</span>
            ${(n.author_id===ME.id || ME.role==='admin') ? `<button class="btn ghost xs ys-note-del" data-id="${n.id}" style="display:inline-flex;width:auto;flex:none">${icon('trash',{size:'11px'})}</button>` : ''}
          </div>
          <div class="fusen-body${long?' fusen-clamp':''}">${h(n.content)}</div>
          ${long ? `<span class="fusen-more">続きを読む</span>` : ''}
        </div>`;
      }).join('') || '<div class="muted" style="text-align:center;padding:14px 0">まだ記入はありません</div>'}
    </div>
  </div>`;
}
// 年間サマリーのカード群の共通イベント配線(年送り・備考の追加/削除)。呼び出し元がonYearDelta/onRerenderで
// 自分のstate更新・再描画方法を渡す(単独ページとマイスケジュール埋め込みでstateの持ち方が異なるため)。
function wireYearSummaryCards(uid, onYearDelta, onRerender){
  requestAnimationFrame(() => {
    document.querySelectorAll('.ys-bar').forEach(b => { b.style.height = b.dataset.h + 'px'; });
  });
  $('#ys-prev').onclick = () => onYearDelta(-1);
  $('#ys-next').onclick = () => onYearDelta(1);
  $('#ys-note-add').onclick = async () => {
    const content = $('#ys-note-input').value.trim();
    if(!content){ popup('内容を入力してください','error'); return; }
    await withLoading($('#ys-note-add'), async () => {
      try{
        await api('/member-notes', { method:'POST', body:{ uid, content } });
        popup('備考を追加しました');
        onRerender();
      }catch(e){ popup(e.message,'error'); }
    });
  };
  document.querySelectorAll('.ys-note-del').forEach(b => b.onclick = async () => {
    if(!confirm('この備考を削除しますか？')) return;
    await withLoading(b, async () => {
      try{
        await api(`/member-notes/${b.dataset.id}`, { method:'DELETE' });
        popup('削除しました');
        onRerender();
      }catch(e){ popup(e.message,'error'); }
    });
  });
  document.querySelectorAll('.fusen-more').forEach(el => el.onclick = () => {
    const body = el.previousElementSibling;
    const opening = body.classList.contains('fusen-clamp');
    body.classList.toggle('fusen-clamp');
    el.textContent = opening ? '閉じる' : '続きを読む';
  });
}

async function pageMemberYearSummary(app, hash){
  if(!has('member_summary_view')){ notFound(app); return; }
  const uid = Number(hash.split('/')[2]);
  if(!uid){ notFound(app); return; }

  const st = PAGE_STATE.memberSummary || (PAGE_STATE.memberSummary = {});
  if(st.uid !== uid){ st.uid = uid; st.year = Number(jstToday().slice(0,4)) - (Number(jstToday().slice(5,7)) < 12 ? 1 : 0); }

  app.innerHTML = `<h2>${icon('barChart')} 年間サマリー</h2><div class="card"><div class="loading-box"><span class="spinner"></span>読み込み中…</div></div>`;
  let data, notesData;
  try{
    [data, notesData] = await Promise.all([
      api(`/member-year-summary?uid=${uid}&year=${st.year}`),
      api(`/member-notes?uid=${uid}`),
    ]);
  }catch(e){ notFound(app); return; }

  const canPay = has('site_pay');
  app.innerHTML = `
  <h2 style="margin-bottom:4px">${icon('barChart')} ${h(data.target.name)} さんの年間サマリー</h2>
  <div class="muted" style="margin-bottom:14px">${h(data.target.regno)} ${data.target.rank?`/ ${h(data.target.rank)}ランク`:''} ${data.target.han?`/ ${h(data.target.han)}`:''}</div>
  ${yearSummaryCardsHtml(data, notesData, canPay)}`;

  wireYearSummaryCards(uid, (delta)=>{ st.year += delta; pageMemberYearSummary(app, hash); }, ()=>pageMemberYearSummary(app, hash));
}

/* ===== 個別権限の編集(管理者のみ・専用ページ) ===== */
async function pagePermissions(app, hash){
  const canPerms = has('account_manage');
  const canNotify = has('wage_settings');
  if(!canPerms && !canNotify){ notFound(app); return; }
  const uid = Number(hash.split('/')[2]);
  if(!uid){ notFound(app); return; }
  app.innerHTML = '<h2>権限編集</h2><div class="card"><div class="loading-box"><span class="spinner"></span>読み込み中…</div></div>';
  let data = null, defs = null, baseUser = null;
  try{
    const users = await getUsers();
    baseUser = users.find(u => u.id === uid);
    if(!baseUser) throw new Error('ユーザーが見つかりません');
    if(canPerms){
      [data, defs] = await Promise.all([ api(`/users/${uid}/perms`), api('/perm-defs') ]);
    }
  }catch(e){ app.innerHTML = `<h2>権限編集</h2><div class="card"><div class="msg err">${h(e.message)}</div></div>`; return; }
  const roleForDisplay = data ? data.role : baseUser.role;
  const baseLvOfMe = LV[roleForDisplay] ?? 0;
  app.innerHTML = `
  <div style="margin-bottom:14px"><a href="#/admin" class="btn ghost sm">← アカウント管理に戻る</a></div>
  <h2 style="margin-bottom:4px">権限編集</h2>
  <div class="muted" style="margin-bottom:16px">${h(baseUser.name)} さん（登録番号 ${h(baseUser.regno)}）の設定を行います。</div>

  ${canPerms ? `
  <div class="card" style="margin-bottom:16px">
    <h2 style="font-size:14px;margin-bottom:10px">追加権限</h2>
    <div id="perm-list"></div>
    <div class="row" style="margin-top:18px;gap:8px;align-items:center">
      <button class="btn gold" id="perm-save">保存する</button>
      <span id="perm-msg" class="muted"></span>
    </div>
  </div>` : ''}

  ${canNotify ? `
  <div class="card">
    <h2 style="font-size:14px;margin-bottom:10px">新人報告リマインドの個人設定</h2>
    <div class="form-grid" style="max-width:480px">
      <label>この人への送信</label>
      <select id="nr-select">
        <option value="">基本ルールに従う（役割で自動判定）</option>
        <option value="1">常に対象にする（役割に関わらず）</option>
        <option value="0">常に対象外にする（役割に関わらず）</option>
      </select>
    </div>
    <div class="row" style="margin-top:14px;gap:8px;align-items:center">
      <button class="btn gold sm" id="nr-save">保存する</button>
      <span id="nr-msg" class="muted"></span>
    </div>
  </div>` : ''}
  `;

  if(canPerms){
    const list = $('#perm-list');
    const revokedSet = new Set(data.revokedPerms || []);
    list.innerHTML = defs.perms.map(p => {
      const already = baseLvOfMe >= p.baseLv; // 基本権限で標準的に使える
      const isRevoked = revokedSet.has(p.key);
      const checked = already ? !isRevoked : data.extraPerms.includes(p.key);
      return `<label class="perm-row" style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)">
        <input type="checkbox" class="perm-cb" value="${p.key}" data-base="${already?'1':'0'}" ${checked?'checked':''} style="width:18px;height:18px">
        <span style="flex:1">${h(p.label)}</span>
        <span class="perm-tag muted" style="font-size:11px;white-space:nowrap"></span>
      </label>`;
    }).join('');
    const updatePermTag = (cb) => {
      const tag = cb.closest('.perm-row').querySelector('.perm-tag');
      const isBase = cb.dataset.base === '1';
      if(isBase && !cb.checked){ tag.textContent = 'この人だけ禁止'; tag.style.color = '#b23b3b'; }
      else if(isBase && cb.checked){ tag.textContent = '標準で利用可'; tag.style.color = ''; }
      else if(!isBase && cb.checked){ tag.textContent = 'この人だけ許可'; tag.style.color = 'var(--gold)'; }
      else { tag.textContent = ''; tag.style.color = ''; }
    };
    list.querySelectorAll('.perm-cb').forEach(cb => { updatePermTag(cb); cb.onchange = () => updatePermTag(cb); });
    $('#perm-save').onclick = async () => {
      const extraKeys = [], revokedKeys = [];
      list.querySelectorAll('.perm-cb').forEach(cb => {
        const isBase = cb.dataset.base === '1';
        if(isBase && !cb.checked) revokedKeys.push(cb.value); // 標準で使えるはずなのにOFF→この人だけ剥奪
        if(!isBase && cb.checked) extraKeys.push(cb.value); // 標準では使えないのにON→この人だけ追加
      });
      $('#perm-msg').textContent = '保存中…';
      await withLoading($('#perm-save'), async () => {
        try{ await api(`/users/${uid}/perms`, {method:'PUT', body:{perms:extraKeys, revokedPerms:revokedKeys}}); $('#perm-msg').textContent='保存しました'; popup('権限を保存しました'); }
        catch(e){ $('#perm-msg').textContent = e.message; }
      });
    };
  }

  if(canNotify){
    const sel = $('#nr-select');
    const cur = baseUser.notify_rookie;
    sel.value = cur === 1 ? '1' : cur === 0 ? '0' : '';
    $('#nr-save').onclick = async () => {
      const v = sel.value === '' ? null : Number(sel.value);
      $('#nr-msg').textContent = '保存中…';
      await withLoading($('#nr-save'), async () => {
        try{ await api(`/users/${uid}`, {method:'PATCH', body:{notify_rookie:v}}); $('#nr-msg').textContent='保存しました'; popup('通知設定を保存しました'); }
        catch(e){ $('#nr-msg').textContent = e.message; }
      });
    };
  }
}

/* ===== 台帳保管(管理者のみ) ===== */
/* ===== 予定表ソース管理(管理者・wage_settings権限のみ) ===== */
async function pageSchedSources(app, hash){
  if(!has('wage_settings')){ notFound(app); return; }
  app.innerHTML = `<h2>${icon('download')} 予定表ソース管理</h2><div class="card"><div class="loading-box"><span class="spinner"></span>読み込み中…</div></div>`;
  let data;
  try{ data = await api('/sched-sources'); }
  catch(e){ app.innerHTML = `<h2>${icon('download')} 予定表ソース管理</h2><div class="card"><div class="msg err">${h(e.message)}</div></div>`; return; }
  const sources = data.sources || [];

  const freqLabel = s => s.freqType==='daily' ? `毎日 ${String(s.hour).padStart(2,'0')}:00` : `${s.intervalHours}時間ごと`;

  app.innerHTML = `
  <h2 style="margin-bottom:4px">${icon('download')} 予定表ソース管理</h2>

  <div class="card" style="margin-bottom:16px">
    <h2 style="font-size:14px;margin-bottom:10px">＋ 新しい予定表ソースを追加</h2>
    <div class="form-grid" style="max-width:640px">
      <label>名前</label>
      <input id="ss-new-label" placeholder="例: 2課スケジュール表">
      <label>スプレッドシートURL</label>
      <input id="ss-new-url" placeholder="https://docs.google.com/spreadsheets/d/..." style="font-family:monospace;font-size:12px">
      <label>取り込み頻度</label>
      <select id="ss-new-freqtype" class="ss-new-freqtype">
        <option value="interval">N時間ごとにチェック</option>
        <option value="daily">1日1回、決まった時刻のみ</option>
      </select>
      <label class="ss-new-interval-row">間隔</label>
      <select id="ss-new-interval" class="ss-new-interval-row">
        <option value="1">1時間ごと</option>
        <option value="2">2時間ごと</option>
        <option value="3">3時間ごと</option>
        <option value="6">6時間ごと</option>
        <option value="12">12時間ごと</option>
        <option value="24">24時間ごと</option>
      </select>
      <label class="ss-new-hour-row" style="display:none">実行時刻</label>
      <select id="ss-new-hour" class="ss-new-hour-row" style="display:none">${Array.from({length:24},(_,i)=>`<option value="${i}">${String(i).padStart(2,'0')}:00</option>`).join('')}</select>
      <label>管理者へ通知</label>
      <label style="font-weight:400;display:flex;align-items:center;gap:8px"><input type="checkbox" id="ss-new-notify" checked style="width:auto"> 反映があった時に通知する</label>
      <label>担当手配者未設定の人</label>
      <div style="font-weight:400;display:flex;align-items:center;gap:8px"><label class="ios-toggle"><input type="checkbox" id="ss-new-exclude-unmanaged" checked><span class="ios-toggle-track"></span></label> このシートからは取り込まない(チーフ手配は別シートを優先する場合)</div>
    </div>
    <div class="row" style="margin-top:12px;gap:8px;align-items:center">
      <button class="btn gold sm" id="ss-add">追加する</button>
      <span class="muted" id="ss-add-msg"></span>
    </div>
  </div>

  ${sources.length ? sources.map(s => `
  <div class="card" style="margin-bottom:14px" data-id="${s.id}">
    <div class="row" style="justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
      <div style="flex:1;min-width:200px">
        <div style="font-weight:700;font-size:15px">${h(s.label)} ${s.enabled?'':'<span class="tag" style="font-size:11px">停止中</span>'}</div>
        <div class="muted" style="font-family:monospace;font-size:11px;margin-top:2px;overflow-wrap:break-word;word-break:break-all">${h(s.url)}</div>
      </div>
      <div class="row" style="gap:6px">
        <button class="btn ghost sm ss-edit-toggle" data-id="${s.id}">編集</button>
        <button class="btn ghost sm ss-run" data-id="${s.id}">今すぐ取り込む</button>
        <button class="btn danger sm ss-del" data-id="${s.id}">削除</button>
      </div>
    </div>
    <div class="muted" style="margin-top:8px">頻度: ${freqLabel(s)} / 通知: ${s.notifyAdmin?'する':'しない'}</div>
    <label class="muted" style="margin-top:6px;display:flex;align-items:center;gap:6px;font-size:12px">
      <input type="checkbox" class="ss-fullrange" data-id="${s.id}"> 「今すぐ取り込む」実行時、期間制限なしでシートの内容を全て反映する(過去日を含む)
    </label>
    <div class="muted" style="margin-top:4px">
      ${s.lastRun ? `最終実行: ${h(s.lastRun)}` : 'まだ実行されていません'}
      ${s.lastResult ? `<br>結果: 反映 ${s.lastResult.applied}件 / スキップ ${s.lastResult.skipped}件${s.lastResult.changedPeople!=null?` / 変更あり ${s.lastResult.changedPeople}人・変更なし ${s.lastResult.unchangedPeople}人`:''}${s.lastResult.error?` <span style="color:#b85042">エラー: ${h(s.lastResult.error)}</span>`:''}${s.lastResult.changes&&s.lastResult.changes.length?` <button class="btn ghost xs ss-show-changes" data-id="${s.id}" style="margin-left:6px">変更内容を見る</button>`:''}` : ''}
    </div>
    <span class="ss-msg muted" data-id="${s.id}" style="display:block;margin-top:6px"></span>

    <div class="ss-edit-form" data-id="${s.id}" style="display:none;margin-top:14px;border-top:1px solid var(--line);padding-top:14px">
      <div class="form-grid" style="max-width:640px">
        <label>名前</label>
        <input class="ss-e-label" data-id="${s.id}" value="${h(s.label)}">
        <label>スプレッドシートURL</label>
        <input class="ss-e-url" data-id="${s.id}" value="${h(s.url)}" style="font-family:monospace;font-size:12px">
        <label>有効</label>
        <label style="font-weight:400;display:flex;align-items:center;gap:8px"><input type="checkbox" class="ss-e-enabled" data-id="${s.id}" ${s.enabled?'checked':''} style="width:auto"> このソースを有効にする</label>
        <label>取り込み頻度</label>
        <select class="ss-e-freqtype" data-id="${s.id}">
          <option value="interval" ${s.freqType==='interval'?'selected':''}>N時間ごとにチェック</option>
          <option value="daily" ${s.freqType==='daily'?'selected':''}>1日1回、決まった時刻のみ</option>
        </select>
        <label class="ss-e-interval-row" data-id="${s.id}" style="${s.freqType==='daily'?'display:none':''}">間隔</label>
        <select class="ss-e-interval ss-e-interval-row" data-id="${s.id}" style="${s.freqType==='daily'?'display:none':''}">
          ${[1,2,3,6,12,24].map(n=>`<option value="${n}" ${s.intervalHours===n?'selected':''}>${n}時間ごと</option>`).join('')}
        </select>
        <label class="ss-e-hour-row" data-id="${s.id}" style="${s.freqType==='daily'?'':'display:none'}">実行時刻</label>
        <select class="ss-e-hour ss-e-hour-row" data-id="${s.id}" style="${s.freqType==='daily'?'':'display:none'}">${Array.from({length:24},(_,i)=>`<option value="${i}" ${s.hour===i?'selected':''}>${String(i).padStart(2,'0')}:00</option>`).join('')}</select>
        <label>管理者へ通知</label>
        <label style="font-weight:400;display:flex;align-items:center;gap:8px"><input type="checkbox" class="ss-e-notify" data-id="${s.id}" ${s.notifyAdmin?'checked':''} style="width:auto"> 反映があった時に通知する</label>
        <label>担当手配者未設定の人</label>
        <div style="font-weight:400;display:flex;align-items:center;gap:8px"><label class="ios-toggle"><input type="checkbox" class="ss-e-exclude-unmanaged" data-id="${s.id}" ${s.excludeUnmanaged?'checked':''}><span class="ios-toggle-track"></span></label> このシートからは取り込まない(チーフ手配は別シートを優先する場合)</div>
      </div>
      <div class="row" style="margin-top:10px"><button class="btn gold sm ss-save" data-id="${s.id}">保存する</button></div>
    </div>
  </div>`).join('') : '<div class="card"><div class="muted" style="text-align:center;padding:20px 0">まだ予定表ソースが登録されていません。上のフォームから追加してください。</div></div>'}
  `;

  // 新規追加フォームの頻度切替
  const newFreqSel = $('#ss-new-freqtype');
  if(newFreqSel) newFreqSel.onchange = () => {
    const daily = newFreqSel.value === 'daily';
    document.querySelectorAll('.ss-new-interval-row').forEach(el=>el.style.display = daily?'none':'');
    document.querySelectorAll('.ss-new-hour-row').forEach(el=>el.style.display = daily?'':'none');
  };

  // 新規追加
  const addBtn = $('#ss-add');
  if(addBtn) addBtn.onclick = async () => {
    const label = $('#ss-new-label').value.trim();
    const url = $('#ss-new-url').value.trim();
    const freqType = $('#ss-new-freqtype').value;
    const intervalHours = Number($('#ss-new-interval').value);
    const hour = Number($('#ss-new-hour').value);
    const notifyAdmin = $('#ss-new-notify').checked;
    const excludeUnmanaged = $('#ss-new-exclude-unmanaged').checked;
    if(!label || !url){ $('#ss-add-msg').textContent='名前とURLを入力してください'; return; }
    $('#ss-add-msg').textContent='追加中…';
    await withLoading(addBtn, async () => {
      try{
        await api('/sched-sources',{method:'POST',body:{label,url,freqType,intervalHours,hour,notifyAdmin,excludeUnmanaged}});
        popup('予定表ソースを追加しました');
        pageSchedSources(app);
      }catch(e){ $('#ss-add-msg').textContent = e.message; }
    });
  };

  // 編集フォームの開閉
  document.querySelectorAll('.ss-edit-toggle').forEach(btn => btn.onclick = () => {
    const id = btn.dataset.id;
    const form = document.querySelector(`.ss-edit-form[data-id="${id}"]`);
    if(form) form.style.display = form.style.display==='none' ? '' : 'none';
  });

  // 編集フォーム内の頻度切替
  document.querySelectorAll('.ss-e-freqtype').forEach(sel => sel.onchange = () => {
    const id = sel.dataset.id;
    const daily = sel.value === 'daily';
    document.querySelectorAll(`.ss-e-interval-row[data-id="${id}"]`).forEach(el=>el.style.display = daily?'none':'');
    document.querySelectorAll(`.ss-e-hour-row[data-id="${id}"]`).forEach(el=>el.style.display = daily?'':'none');
  });

  // 保存
  document.querySelectorAll('.ss-save').forEach(btn => btn.onclick = async () => {
    const id = btn.dataset.id;
    const label = document.querySelector(`.ss-e-label[data-id="${id}"]`).value.trim();
    const url = document.querySelector(`.ss-e-url[data-id="${id}"]`).value.trim();
    const enabled = document.querySelector(`.ss-e-enabled[data-id="${id}"]`).checked;
    const freqType = document.querySelector(`.ss-e-freqtype[data-id="${id}"]`).value;
    const intervalHours = Number(document.querySelector(`.ss-e-interval[data-id="${id}"]`).value);
    const hour = Number(document.querySelector(`.ss-e-hour[data-id="${id}"]`).value);
    const notifyAdmin = document.querySelector(`.ss-e-notify[data-id="${id}"]`).checked;
    const excludeUnmanaged = document.querySelector(`.ss-e-exclude-unmanaged[data-id="${id}"]`).checked;
    const msgEl = document.querySelector(`.ss-msg[data-id="${id}"]`);
    if(!label || !url){ if(msgEl) msgEl.textContent='名前とURLを入力してください'; return; }
    if(msgEl) msgEl.textContent='保存中…';
    await withLoading(btn, async () => {
      try{
        await api(`/sched-sources/${id}`,{method:'PUT',body:{label,url,enabled,freqType,intervalHours,hour,notifyAdmin,excludeUnmanaged}});
        popup('保存しました');
        pageSchedSources(app);
      }catch(e){ if(msgEl) msgEl.textContent = e.message; }
    });
  });

  // 今すぐ取り込む
  document.querySelectorAll('.ss-run').forEach(btn => btn.onclick = async () => {
    const id = btn.dataset.id;
    const msgEl = document.querySelector(`.ss-msg[data-id="${id}"]`);
    const fullRangeChk = document.querySelector(`.ss-fullrange[data-id="${id}"]`);
    const fullRange = fullRangeChk ? fullRangeChk.checked : false;
    if(fullRange && !confirm('期間制限なしで取り込みます。シートに含まれる過去の日付も含めて、まだ何も予定が入っていない日には反映されます(既に予定がある日は上書きしません)。よろしいですか？')) return;
    if(msgEl) msgEl.textContent='取り込み中…（少し時間がかかります）';
    await withLoading(btn, async () => {
      try{
        const r = await api(`/sched-sources/${id}/run`,{method:'POST', body:{ fullRange }});
        if(msgEl) msgEl.textContent = fullRange ? `期間制限なし: 反映 ${r.applied}件 / スキップ ${r.skipped}件` : `対象日 ${r.fromDate} 以降: 反映 ${r.applied}件 / スキップ ${r.skipped}件`;
        popup(`取り込みました(反映${r.applied}件)`);
        pageSchedSources(app);
      }catch(e){ if(msgEl) msgEl.textContent = e.message; }
    });
  });

  // 削除
  document.querySelectorAll('.ss-del').forEach(btn => btn.onclick = async () => {
    const id = btn.dataset.id;
    if(!confirm('この予定表ソースを削除しますか？\n\n※既に取り込まれたスケジュールデータは残ります。')) return;
    await withLoading(btn, async () => {
      try{ await api(`/sched-sources/${id}`,{method:'DELETE'}); popup('削除しました'); pageSchedSources(app); }
      catch(e){ popup(e.message,'error'); }
    });
  });

  // 変更内容の詳細表示(誰の・どの日が・どう変わったか)
  const showChanges = (s) => {
    const changes = (s.lastResult && s.lastResult.changes) || [];
    const ts = s.lastResult && s.lastResult.ts;
    modal(`<h3>${h(s.label)} の変更内容</h3>
      <div class="muted" style="font-size:12px;margin-bottom:10px">最終実行: ${h(s.lastRun)} 時点の反映内容(${changes.length}件)</div>
      ${ts?`<div style="margin-bottom:10px"><button class="btn danger sm" id="ss-undo-all">${icon('undo',{size:'13px'})} この取り込みで反映した内容を全て取り消す</button></div>`:''}
      <div style="max-height:60vh;overflow-y:auto">
        <table class="list" style="font-size:12.5px">
          <tr><th>氏名</th><th>日付</th><th>変更前</th><th></th><th>変更後</th></tr>
          ${changes.map(c=>`<tr>
            <td class="nowrap">${h(c.name||'(氏名不明)')}</td>
            <td class="nowrap">${h(c.date)}</td>
            <td>${h(c.before)}</td>
            <td class="nowrap">${icon('arrowRight',{size:'11px'})}</td>
            <td><b>${h(c.after)}</b></td>
          </tr>`).join('') || '<tr><td colspan="5" class="muted">詳細データがありません</td></tr>'}
        </table>
      </div>`);
    const undoBtn = $('#ss-undo-all');
    if(undoBtn) undoBtn.onclick = async () => {
      if(!confirm(`この取り込み(${changes.length}件の変更)を全て取り消し、取り込み前の状態に戻します。よろしいですか？\n\n※手配者モードが必要です。`)) return;
      await withLoading(undoBtn, async () => {
        try{
          const r = await api('/history/undo-by-ts', { method:'POST', body:{ ts } });
          closeModal();
          popup(`${r.okCount}件を取り消しました${r.failed.length?`(${r.failed.length}件は失敗)`:''}`);
          pageSchedSources(app, hash);
        }catch(e){ popup(e.message, 'error'); }
      });
    };
  };
  document.querySelectorAll('.ss-show-changes').forEach(btn => btn.onclick = () => {
    const s = sources.find(x => String(x.id) === String(btn.dataset.id));
    if(s) showChanges(s);
  });

  // 通知から「#/sched-sources?result=ID」で遷移してきた場合、該当ソースの変更内容を自動で開く
  const resultId = new URLSearchParams((hash||'').split('?')[1] || '').get('result');
  if(resultId){
    const target = sources.find(s => String(s.id) === String(resultId));
    if(target && target.lastResult && target.lastResult.changes && target.lastResult.changes.length) showChanges(target);
  }
}

// 過去データ取込確認: 手配帳から外部で再構築した2024〜2025年分の給与実績を、管理者だけが閲覧できる
// 「デモデータ」として月単位で確認し、OK(schedule本体へ反映)/NG(削除)を判断する。
const ymLabel = ym => `${ym.slice(0,4)}年${Number(ym.slice(5,7))}月`;
async function pageLegacyImport(app, hash){
  if(ME.role !== 'admin'){ notFound(app); return; }
  const seg = hash.replace(/^#\/legacy-import\/?/, '').trim();
  if(seg) return pageLegacyImportDetail(app, seg);
  app.innerHTML = `<h2>${icon('inbox')} 過去データ取込確認</h2><div class="card"><div class="loading-box"><span class="spinner"></span>読み込み中…</div></div>`;
  let months;
  try{ months = await api('/legacy-import/months'); }
  catch(e){ app.innerHTML = `<h2>${icon('inbox')} 過去データ取込確認</h2><div class="card"><div class="msg err">${h(e.message)}</div></div>`; return; }
  if(!months.length){
    app.innerHTML = `<h2>${icon('inbox')} 過去データ取込確認</h2><div class="card"><div class="muted" style="padding:20px 0;text-align:center">確認待ちのデータはありません。</div></div>`;
    return;
  }
  const stateInfo = mo => {
    if(mo.pendingCnt === mo.total) return { label:'未確認', cls:'li-pending' };
    if(mo.pendingCnt === 0) return { label:`確認済み(公開${mo.approvedCnt}件${mo.skippedCnt?` / スキップ${mo.skippedCnt}件`:''})`, cls:'li-done' };
    return { label:'一部確認済み', cls:'li-partial' };
  };
  const selected = new Set();
  app.innerHTML = `
  <h2>${icon('inbox')} 過去データ取込確認</h2>
  <div class="muted" style="margin-bottom:10px">手配帳から外部で再構築した過去の給与実績です。管理者だけが閲覧でき、月単位の内容を確認のうえ「公開する」か「削除する」かを決められます(まだ本番のスケジュールには一切反映されていません)。</div>
  <div class="card">
    <div class="row" id="li-bulk-bar" style="margin-bottom:0;gap:8px;align-items:center;flex-wrap:wrap"></div>
    <div id="li-list" style="display:flex;flex-direction:column;gap:10px;margin-top:10px"></div>
  </div>`;
  const listEl = $('#li-list');
  const renderBulkBar = () => {
    const bar = $('#li-bulk-bar');
    if(!bar) return;
    const pendingYms = months.filter(mo => mo.pendingCnt > 0).map(mo => mo.ym);
    bar.style.cssText = pendingYms.length ? 'margin-bottom:0;gap:8px;align-items:center;flex-wrap:wrap;background:#f7f5ef;border:1px solid var(--line);border-radius:8px;padding:8px 10px' : 'margin-bottom:0';
    bar.innerHTML = pendingYms.length ? `
      <button type="button" class="btn ghost sm" id="li-select-all">未確認の月をすべて選択(${pendingYms.length}件)</button>
      ${selected.size ? `<span class="muted" style="font-weight:600">${selected.size}件選択中</span>
      <button type="button" class="btn gold sm" id="li-bulk-approve">${icon('checkCircle',{size:'12px'})} まとめて公開する</button>
      <button type="button" class="btn ghost sm" id="li-bulk-clear">選択解除</button>` : ''}` : '';
    const sa = $('#li-select-all');
    if(sa) sa.onclick = () => { pendingYms.forEach(ym => selected.add(ym)); render(); renderBulkBar(); };
    const ba = $('#li-bulk-approve');
    if(ba) ba.onclick = async () => {
      const yms = [...selected];
      if(!confirm(`選択した${yms.length}件の月をまとめて公開します。一致した人のうち、既にその日にデータがある人はスキップされます。よろしいですか?`)) return;
      await withLoading(ba, async () => {
        try{
          const r = await api('/legacy-import/months/bulk-approve', { method:'POST', body:{ yms } });
          popup(`${yms.length}件の月をまとめて公開しました(反映${r.approved}件${r.skipped?` / 既存データによりスキップ${r.skipped}件`:''}${r.unmatched?` / 要確認(未一致)${r.unmatched}件は反映されていません`:''})`);
          selected.clear();
          const fresh = await api('/legacy-import/months');
          months.length = 0; months.push(...fresh);
          render(); renderBulkBar();
        }catch(e){ popup(e.message, 'error'); }
      });
    };
    const bc = $('#li-bulk-clear');
    if(bc) bc.onclick = () => { selected.clear(); render(); renderBulkBar(); };
  };
  const render = () => {
    listEl.innerHTML = months.map(mo => {
      const st = stateInfo(mo);
      return `<div class="li-month-row ${st.cls}">
        ${mo.pendingCnt>0 ? `<input type="checkbox" class="li-select" data-ym="${mo.ym}" ${selected.has(mo.ym)?'checked':''}>` : ''}
        <div style="flex:1;min-width:160px">
          <div style="font-weight:700;font-size:15px">${ymLabel(mo.ym)}</div>
          <div class="muted" style="font-size:12.5px;margin-top:2px">${mo.total}件(一致${mo.matched}件${mo.unmatched?` / <span style="color:#b03030;font-weight:700">要確認${mo.unmatched}件</span>`:''}) / 合計${yen(mo.totalPay)}</div>
          <div class="li-state-badge">${st.label}</div>
        </div>
        <div class="row" style="gap:6px;flex-wrap:wrap;justify-content:flex-end">
          <button type="button" class="btn ghost sm li-detail" data-ym="${mo.ym}">詳細を見る</button>
          ${mo.pendingCnt>0?`<button type="button" class="btn gold sm li-approve" data-ym="${mo.ym}">公開する</button>
          <button type="button" class="btn ghost sm li-reject" data-ym="${mo.ym}" style="color:#b03030;border-color:#e0b0b0">削除する</button>`:''}
        </div>
      </div>`;
    }).join('');
    listEl.querySelectorAll('.li-detail').forEach(b => b.onclick = () => goTo('#/legacy-import/' + b.dataset.ym));
    listEl.querySelectorAll('.li-approve').forEach(b => b.onclick = () => runLegacyApprove(b.dataset.ym, months, () => { render(); renderBulkBar(); }));
    listEl.querySelectorAll('.li-reject').forEach(b => b.onclick = () => runLegacyReject(b.dataset.ym, months, () => { render(); renderBulkBar(); }));
    listEl.querySelectorAll('.li-select').forEach(cb => cb.onclick = (e) => {
      e.stopPropagation();
      if(cb.checked) selected.add(cb.dataset.ym); else selected.delete(cb.dataset.ym);
      renderBulkBar();
    });
  };
  render();
  renderBulkBar();
}

async function runLegacyApprove(ym, months, onDone){
  if(!confirm(`${ymLabel(ym)}分を公開します。一致した人のうち、既にその日にデータがある人はスキップされます。よろしいですか?`)) return;
  try{
    const r = await api(`/legacy-import/months/${ym}/approve`, { method:'POST' });
    popup(`${r.approved}件を公開しました${r.skipped?`(${r.skipped}件は既存データがありスキップ)`:''}${r.unmatched?`。要確認(未一致)${r.unmatched}件は反映されていません`:''}。`);
    const fresh = await api('/legacy-import/months');
    months.length = 0; months.push(...fresh);
    onDone();
  }catch(e){ popup(e.message, 'error'); }
}
async function runLegacyReject(ym, months, onDone){
  if(!confirm(`${ymLabel(ym)}分のデータを削除します。この操作は元に戻せません。よろしいですか?`)) return;
  try{
    const r = await api(`/legacy-import/months/${ym}/reject`, { method:'POST' });
    popup(`${r.deleted}件を削除しました。`);
    const fresh = await api('/legacy-import/months');
    months.length = 0; months.push(...fresh);
    onDone();
  }catch(e){ popup(e.message, 'error'); }
}

async function pageLegacyImportDetail(app, ym){
  app.innerHTML = `<h2>${icon('inbox')} ${ymLabel(ym)}の過去データ</h2><div class="card"><div class="loading-box"><span class="spinner"></span>読み込み中…</div></div>`;
  let rows;
  try{ rows = await api(`/legacy-import/months/${ym}`); }
  catch(e){ app.innerHTML = `<h2>${icon('inbox')} ${ymLabel(ym)}の過去データ</h2><div class="card"><div class="msg err">${h(e.message)}</div></div>`; return; }
  const st = PAGE_STATE.legacyImportDetail || (PAGE_STATE.legacyImportDetail = { unmatchedOnly:false });
  const total = rows.length, unmatched = rows.filter(r => !r.user_id).length, pending = rows.filter(r => r.status==='pending').length;
  const totalPay = rows.reduce((s,r) => s + (r.pay||0), 0);
  const rowClass = r => !r.user_id ? 'li-row-unmatched' : (r.status==='approved' ? 'li-row-approved' : r.status==='skipped' ? 'li-row-skipped' : '');
  const rowStatusLabel = r => !r.user_id ? '要確認' : r.status==='approved' ? '公開済み' : r.status==='skipped' ? '既存データありスキップ' : '未確認';
  app.innerHTML = `
  <button type="button" class="btn ghost sm" id="li-back" style="margin-bottom:10px">${icon('arrowLeft',{size:'14px'})} 月一覧へ戻る</button>
  <h2>${icon('inbox')} ${ymLabel(ym)}の過去データ</h2>
  <div class="muted" style="margin-bottom:10px">${total}件(一致${total-unmatched}件 / 要確認${unmatched}件) / 合計${yen(totalPay)}</div>
  <div class="card">
    <div class="sticky-filters">
      <div class="row" style="gap:10px;flex-wrap:wrap;align-items:center">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
          <input type="checkbox" id="li-unmatched-only" ${st.unmatchedOnly?'checked':''}> 要確認のみ表示
        </label>
        <div style="flex:1"></div>
        ${pending>0?`<button type="button" class="btn gold sm" id="li-detail-approve">この月を公開する</button>
        <button type="button" class="btn ghost sm" id="li-detail-reject" style="color:#b03030;border-color:#e0b0b0">この月を削除する</button>`:''}
      </div>
    </div>
    <div style="overflow-x:auto">
      <table class="list li-table" id="li-table">
        <thead><tr>
          <th>日付</th><th>氏名(登録番号)</th><th>ランク</th><th>現場</th><th>会場</th><th>業務</th><th>IN〜OUT</th><th>時間</th><th>金額</th><th>状態</th>
        </tr></thead>
        <tbody id="li-tbody"></tbody>
      </table>
    </div>
  </div>`;
  $('#li-back').onclick = () => goTo('#/legacy-import');
  const renderRows = () => {
    const filtered = st.unmatchedOnly ? rows.filter(r => !r.user_id) : rows;
    $('#li-tbody').innerHTML = filtered.length ? filtered.map(r => `<tr class="${rowClass(r)}">
      <td>${h(r.date)}</td>
      <td>${h(r.matched_name || r.name)}${r.matched_name && r.matched_name!==r.name?` <span class="muted">(元データ:${h(r.name)})</span>`:''}<div class="muted" style="font-size:11px">${h(r.matched_regno || r.regno)}</div></td>
      <td>${h(r.rank)}</td>
      <td>${h(r.site)}</td>
      <td>${h(r.venue)}</td>
      <td>${h(r.duty)}</td>
      <td>${h(r.tin)}〜${h(r.tout)}</td>
      <td>${r.hours}h</td>
      <td>${yen(r.pay)}</td>
      <td>${rowStatusLabel(r)}</td>
    </tr>`).join('') : `<tr><td colspan="10" class="muted" style="text-align:center;padding:20px 0">該当する行がありません</td></tr>`;
  };
  renderRows();
  $('#li-unmatched-only').onchange = (e) => { st.unmatchedOnly = e.target.checked; renderRows(); };
  const appBtn = $('#li-detail-approve');
  if(appBtn) appBtn.onclick = () => runLegacyApprove(ym, [], () => pageLegacyImportDetail(app, ym));
  const rejBtn = $('#li-detail-reject');
  if(rejBtn) rejBtn.onclick = () => runLegacyReject(ym, [], () => goTo('#/legacy-import'));
}

// アプリ構造ビューア(管理者専用): このアプリ自身の画面・API・DB・権限モデル・ファイル構成を
// 一覧できる開発者向け診断画面。権限一覧・機能公開キー・DBテーブルの列構成は、リクエストのたびに
// PERMS/FEATURE_KEYS・実際のD1(sqlite_master)から取得するため、コード変更に自動追従する
// (schema.sqlと本番の食い違いにも気づける)。画面一覧・API一覧・ファイル説明はsrc/index.jsの
// APP_STRUCTURE_*静的データを返しているだけなので、新しい画面/APIを追加したらそちらに追記する。
function appStructureArchSvg(){
  const box = (x,y,w,bh,lines,cls) => `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${bh}" rx="8" class="as-arch-box ${cls||''}"/>
    <text x="${x+w/2}" y="${y+bh/2 - (lines.length-1)*7}" text-anchor="middle" class="as-arch-text">
      ${lines.map((l,i)=>`<tspan x="${x+w/2}" dy="${i===0?0:16}">${h(l)}</tspan>`).join('')}
    </text>
  </g>`;
  const arrow = (x1,y1,x2,y2,label) => `<g>
    <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="as-arch-line" marker-end="url(#as-arrow)"/>
    ${label ? `<text x="${(x1+x2)/2}" y="${(y1+y2)/2 - 6}" text-anchor="middle" class="as-arch-line-label">${h(label)}</text>` : ''}
  </g>`;
  return `
  <div class="as-svg-wrap">
  <svg viewBox="0 0 900 400" class="as-arch-svg" role="img" aria-label="システム構成図">
    <defs><marker id="as-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" class="as-arch-arrowhead"/></marker></defs>
    ${arrow(240,80,340,120)}
    ${arrow(560,150,650,120,'D1へ読み書き')}
    ${arrow(560,190,650,230,'R2へ保存/取得')}
    ${arrow(450,70,450,120,'毎時0分')}
    ${arrow(240,220,340,180,'GASからPOST')}
    ${arrow(560,180,240,300,'.ics配信')}
    ${box(20,50,220,60,['ブラウザ','public/app.js + style.css'],'as-arch-client')}
    ${box(340,120,220,80,['Cloudflare Worker','src/index.js (fetch/scheduled)'],'as-arch-worker')}
    ${box(650,90,220,60,['D1: schedule-db'],'as-arch-store')}
    ${box(650,200,220,60,['R2: 台帳ファイル保管'],'as-arch-store')}
    ${box(340,20,220,50,['Cron trigger','wrangler.toml crons'],'as-arch-ext')}
    ${box(20,180,220,60,['Googleスプレッドシート','(予定表ソース・台帳URL取込)'],'as-arch-ext')}
    ${box(20,290,220,60,['Googleカレンダー等','(.ics購読フィード)'],'as-arch-ext')}
  </svg>
  </div>
  <div class="muted as-svg-hint">◀ 画面が狭い場合は図を横にスクロールできます ▶</div>`;
}
function appStructureFileFlowHtml(){
  return `<div class="as-flow">
    <div class="as-flow-box">index.html</div><div class="as-flow-arrow">→</div>
    <div class="as-flow-box">app.js ⇄ style.css</div><div class="as-flow-arrow">→ api() →</div>
    <div class="as-flow-box strong">src/index.js</div><div class="as-flow-arrow">→</div>
    <div class="as-flow-box">D1 / R2</div>
  </div>
  <div class="muted" style="font-size:12px;margin-top:6px">上記はリクエスト単位の実行時の関係。schema.sql・migrate-*.sql・wrangler.tomlはデプロイ作業時にのみ関わり、Workerの実行中に読み込まれるものではない。</div>`;
}
async function pageAppStructure(app){
  if(ME.role !== 'admin'){ notFound(app); return; }
  app.innerHTML = `<h2>${icon('sitemap')} アプリ構造ビューア</h2><div class="card"><div class="loading-box"><span class="spinner"></span>読み込み中…</div></div>`;
  let data;
  try{ data = await api('/app-structure'); }
  catch(e){ app.innerHTML = `<h2>${icon('sitemap')} アプリ構造ビューア</h2><div class="card"><div class="msg err">${h(e.message)}</div></div>`; return; }

  const st = PAGE_STATE.appStructure || (PAGE_STATE.appStructure = { tab:'overview', pageQ:'', apiQ:'', dbQ:'', openTables:new Set() });
  const TABS = [
    ['overview','概要'], ['pages','画面一覧'], ['perms','権限モデル'], ['api','API仕様'],
    ['db','DB設計'], ['features','機能公開キー'], ['arch','ファイル構成・アーキテクチャ'],
  ];

  app.innerHTML = `
    <h2>${icon('sitemap')} アプリ構造ビューア</h2>
    <div class="muted" style="margin-bottom:12px">このアプリ自身の画面・API・DB・権限モデルの構造を確認できる管理者専用の開発者向け診断画面です。権限一覧・機能公開キー・DBテーブル構造は、今この瞬間の実際のコード・データベースから取得しています(取得日: ${h(data.meta.generated)})。</div>
    <div class="as-tabs" id="as-tabs">${TABS.map(([k,l])=>`<button type="button" class="as-tab ${st.tab===k?'on':''}" data-tab="${k}">${h(l)}</button>`).join('')}</div>
    <div id="as-panel"></div>`;
  const panel = $('#as-panel');

  function renderOverview(){
    const m = data.meta;
    const stats = [
      [data.pages.length,'画面'], [data.apiEndpointCount,'APIエンドポイント'], [data.db.tableCount,'DBテーブル'],
      [data.permissions.length,'個別権限'], [data.featureKeys.length,'機能公開キー'], [data.roles.length,'ロール階層'],
    ];
    panel.innerHTML = `
      <div class="as-stat-row">${stats.map(([n,l])=>`<div class="as-stat"><div class="as-stat-num">${n}</div><div class="as-stat-lbl">${h(l)}</div></div>`).join('')}</div>
      <div class="as-grid">
        <div class="card"><h3>構成ファイル</h3><ul>
          <li><b>バックエンド</b>: ${h(m.files.backend)}</li>
          <li><b>フロントエンド</b>: ${h(m.files.frontend)}</li>
          <li><b>スタイル</b>: ${h(m.files.css)}</li>
        </ul></div>
        <div class="card"><h3>技術スタック</h3><ul>${m.stack.map(s=>`<li>${h(s)}</li>`).join('')}</ul></div>
        <div class="card"><h3>定期実行(cron)</h3><ul class="as-cron-list">${data.cronJobs.map(c=>`<li><code>${h(c.name)}</code><span>${h(c.desc)}</span></li>`).join('')}</ul></div>
      </div>`;
  }

  function renderPages(){
    const draw = () => {
      const ql = st.pageQ.toLowerCase();
      const items = data.pages.filter(p => !ql || (p.name+p.hash+p.role+p.desc).toLowerCase().includes(ql));
      $('#as-page-count').textContent = `${items.length} / ${data.pages.length} 件`;
      $('#as-page-list').innerHTML = items.map(p => {
        // :uidのような動的パラメータを含むパスは実在するURLではないためリンクにしない
        const hashEl = p.hash.includes(':') ? `<span class="as-hash">${h(p.hash)}</span>` : `<a href="${h(p.hash)}" class="as-hash as-hash-link">${h(p.hash)} ${icon('arrowRight',{size:'10px'})}</a>`;
        return `
        <div class="as-page-card">
          <div class="as-page-hh"><span class="as-page-name">${h(p.name)}</span>${hashEl}<span class="as-role-pill">${h(p.role)}</span></div>
          <div class="as-desc">${h(p.desc)}</div>
        </div>`;
      }).join('') || '<p class="muted">該当する画面がありません。</p>';
    };
    panel.innerHTML = `
      <div class="as-searchbar"><input type="text" id="as-page-search" placeholder="画面名・パス・説明文で検索…" value="${h(st.pageQ)}"><span class="muted" id="as-page-count"></span></div>
      <div id="as-page-list"></div>`;
    draw();
    $('#as-page-search').addEventListener('input', e => { st.pageQ = e.target.value; draw(); });
  }

  function renderPerms(){
    const roleByLv = {1:'chief以上',2:'handler以上',3:'admin以上'};
    panel.innerHTML = `
      <div class="card" style="margin-bottom:16px">
        <h3>ロール階層(下から上へ包含)</h3>
        <div class="as-role-track">${data.roles.map(r=>`<div class="as-r${r.level}">${h(r.label)}</div>`).join('')}</div>
        <p class="muted" style="font-size:12.5px;margin-top:4px">4段階のロールに加え、ユーザーごとに個別権限(extra_perms/revoked_perms)を追加・剥奪できるハイブリッド方式。剥奪が最優先で判定される。</p>
      </div>
      <div class="card">
        <h3>個別追加権限 一覧(${data.permissions.length}件)</h3>
        <div class="as-table-scroll"><table class="list as-perm-table as-responsive"><tr><th>キー</th><th>説明</th><th>基準ロール</th></tr>
        ${data.permissions.map(p=>`<tr><td class="as-lvl${p.baseLv}"><code>${h(p.key)}</code></td><td data-label="説明">${h(p.label)}</td><td data-label="基準ロール"><span class="as-lvl-badge as-l${p.baseLv}">${h(roleByLv[p.baseLv]||p.baseLv)}</span></td></tr>`).join('')}
        </table></div>
      </div>`;
  }

  function methodBadges(m){ return m.split('/').map(x=>`<span class="as-method as-m-${h(x)}">${h(x)}</span>`).join(' '); }
  function renderApi(){
    const draw = () => {
      const ql = st.apiQ.toLowerCase();
      let shown = 0, html = '';
      for(const g of data.apiGroups){
        const rows = g.rows.filter(r => !ql || r.join(' ').toLowerCase().includes(ql));
        if(!rows.length) continue;
        shown += rows.length;
        html += `<div class="as-group-title">${h(g.title)}(${rows.length}件)</div>`;
        html += `<div class="as-table-scroll"><table class="list as-api-table as-responsive"><tr><th>Method</th><th>パス</th><th>概要</th></tr>${rows.map(r=>`<tr><td>${methodBadges(r[0])}</td><td data-label="パス"><code>${h(r[1])}</code></td><td data-label="概要">${h(r[2])}</td></tr>`).join('')}</table></div>`;
      }
      $('#as-api-count').textContent = `${shown} / ${data.apiEndpointCount} 件`;
      $('#as-api-groups').innerHTML = html || '<p class="muted">該当するAPIがありません。</p>';
    };
    panel.innerHTML = `
      <div class="as-searchbar"><input type="text" id="as-api-search" placeholder="パス・メソッド・説明文で検索…" value="${h(st.apiQ)}"><span class="muted" id="as-api-count"></span></div>
      <div id="as-api-groups"></div>`;
    draw();
    $('#as-api-search').addEventListener('input', e => { st.apiQ = e.target.value; draw(); });
  }

  function renderDb(){
    const draw = () => {
      const ql = st.dbQ.toLowerCase();
      const tables = data.db.tables.filter(t => {
        if(!ql) return true;
        const hay = t.name+' '+t.comment+' '+t.columns.map(c=>(c.name||'')+' '+c.note).join(' ');
        return hay.toLowerCase().includes(ql);
      });
      $('#as-db-count').textContent = `${tables.length} / ${data.db.tableCount} テーブル`;
      $('#as-db-list').innerHTML = tables.map(t => {
        const rows = t.columns.map(c => c.type==='CONSTRAINT'
          ? `<tr class="as-constraint-row"><td colspan="3">${h(c.note)}</td></tr>`
          : `<tr><td class="as-col-name">${h(c.name)}</td><td class="as-col-type" data-label="型">${h(c.type)}</td><td class="as-col-note" data-label="備考">${h(c.note)}</td></tr>`
        ).join('');
        const open = st.openTables.has(t.name);
        return `<div class="as-tbl-card ${open?'open':''}" data-table="${h(t.name)}">
          <div class="as-tbl-th">
            <span class="as-tname">${h(t.name)}</span>
            <span class="as-tcount">${t.columns.filter(c=>c.type!=='CONSTRAINT').length}列</span>
            <span class="as-tcomment">${h(t.comment)}</span>
            <span class="as-arrow">▸</span>
          </div>
          <div class="as-tbl-body"><div class="as-table-scroll"><table class="list as-responsive"><tr><th>列名</th><th>型</th><th>備考</th></tr>${rows}</table></div></div>
        </div>`;
      }).join('') || '<p class="muted">該当するテーブルがありません。</p>';
      $('#as-db-list').querySelectorAll('.as-tbl-th').forEach(th => {
        th.onclick = () => {
          const card = th.closest('.as-tbl-card');
          const name = card.dataset.table;
          if(st.openTables.has(name)) st.openTables.delete(name); else st.openTables.add(name);
          card.classList.toggle('open');
        };
      });
    };
    panel.innerHTML = `
      <div class="as-searchbar"><input type="text" id="as-db-search" placeholder="テーブル名・列名・コメントで検索…" value="${h(st.dbQ)}"><span class="muted" id="as-db-count"></span></div>
      <div class="muted" style="margin-bottom:8px;font-size:12px">テーブルの列構成は、このリクエストの時点で実際のデータベース(D1)から取得しています。schema.sqlと内容がずれていても、ここには常に本番の実態が表示されます。</div>
      <div id="as-db-list"></div>`;
    draw();
    $('#as-db-search').addEventListener('input', e => { st.dbQ = e.target.value; draw(); });
  }

  function renderFeatures(){
    panel.innerHTML = `<div class="card">
      <h3>機能公開設定キー(${data.featureKeys.length}件)</h3>
      <p class="muted" style="font-size:12.5px;margin-bottom:10px">システム設定 → 機能公開設定 で、それぞれ「公開中/準備中/メンテナンス中」を切り替えられる画面キー。</p>
      <div>${data.featureKeys.map(k=>`<span class="as-chip"><code>${h(k)}</code></span>`).join('')}</div>
    </div>`;
  }

  function renderArch(){
    panel.innerHTML = `
      <div class="card" style="margin-bottom:14px">
        <h3>システム構成図</h3>
        ${appStructureArchSvg()}
      </div>
      <div class="card">
        <h3>ファイル構成・依存関係</h3>
        ${appStructureFileFlowHtml()}
        <div class="as-table-scroll"><table class="list as-file-table as-responsive" style="margin-top:14px">
          <tr><th>ファイル</th><th>役割</th><th>説明</th></tr>
          ${data.files.map(f=>`<tr><td><code>${h(f.name)}</code></td><td data-label="役割">${h(f.role)}</td><td data-label="説明">${h(f.desc)}${f.dependsOn && f.dependsOn.length ? `<div class="muted" style="font-size:11.5px;margin-top:3px">依存先: ${f.dependsOn.map(d=>`<code>${h(d)}</code>`).join(', ')}</div>` : ''}</td></tr>`).join('')}
        </table></div>
      </div>`;
  }

  const RENDERERS = { overview:renderOverview, pages:renderPages, perms:renderPerms, api:renderApi, db:renderDb, features:renderFeatures, arch:renderArch };
  function switchTab(tab){
    st.tab = tab;
    $('#as-tabs').querySelectorAll('.as-tab').forEach(b => b.classList.toggle('on', b.dataset.tab===tab));
    RENDERERS[tab]();
  }
  $('#as-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.as-tab'); if(!btn) return;
    switchTab(btn.dataset.tab);
  });
  switchTab(st.tab);
}

async function pageDaicho(app){
  if(ME.role !== 'admin'){ notFound(app); return; }
  app.innerHTML = `<h2>${icon('package')} 台帳保管</h2><div class="card"><div class="loading-box"><span class="spinner"></span>読み込み中…</div></div>`;
  let data;
  try{ data = await api('/daicho'); }
  catch(e){ app.innerHTML = `<h2>${icon('package')} 台帳保管</h2><div class="card"><div class="msg err">${h(e.message)}</div></div>`; return; }
  const items = data.items || [];
  const fmtSize = n => { n=Number(n||0); if(n<1024) return n+'B'; if(n<1048576) return (n/1024).toFixed(0)+'KB'; return (n/1048576).toFixed(1)+'MB'; };
  const st = PAGE_STATE.daicho || (PAGE_STATE.daicho = { name:'', person:'', dateFrom:'', dateTo:'', sortCol:'ts', sortDir:-1 });
  const selected = new Set(); // チェックボックスで選択中のid(複数ダウンロード・削除用)
  const persons = [...new Set(items.map(it=>it.importer_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ja'));
  const hasFilterOn = () => !!(st.name || st.person || st.dateFrom || st.dateTo);
  const sortMark = col => st.sortCol===col ? (st.sortDir===1?'▲':'▼') : '<span class="muted">⇅</span>';
  const sortOptions = [
    ['ts',-1,'取り込み日時(新しい順)'], ['ts',1,'取り込み日時(古い順)'],
    ['file_name',1,'ファイル名(A→Z/あ→ん)'], ['file_name',-1,'ファイル名(Z→A/ん→あ)'],
    ['importer_name',1,'取り込んだ人(あ→ん)'], ['importer_name',-1,'取り込んだ人(ん→あ)'],
    ['size',-1,'サイズ(大きい順)'], ['size',1,'サイズ(小さい順)'],
    ['applied',-1,'反映件数(多い順)'], ['applied',1,'反映件数(少ない順)'],
    ['sheets',-1,'シート数(多い順)'], ['sheets',1,'シート数(少ない順)'],
  ];

  // リスト部分だけを再構築する。フィルタ入力欄・並び替えプルダウンはここでは一切触らない
  // (input/select要素をDOMから作り直すと、スマホでソフトウェアキーボードが閉じてしまうため)
  const renderList = () => {
    const nameQ = st.name.trim().toLowerCase();
    let filtered = items.filter(it => {
      if(nameQ && !(it.file_name||'').toLowerCase().includes(nameQ)) return false;
      if(st.person && it.importer_name !== st.person) return false;
      if(st.dateFrom && it.ts.slice(0,10) < st.dateFrom) return false;
      if(st.dateTo && it.ts.slice(0,10) > st.dateTo) return false;
      return true;
    });
    filtered = filtered.sort((a,b) => {
      const av = a[st.sortCol], bv = b[st.sortCol];
      if(av == null && bv == null) return 0;
      if(av == null) return -1*st.sortDir; if(bv == null) return 1*st.sortDir;
      if(typeof av === 'number' || typeof bv === 'number') return ((Number(av)||0)-(Number(bv)||0))*st.sortDir;
      return String(av).localeCompare(String(bv), 'ja') * st.sortDir;
    });
    // フィルタで隠れた項目の選択は解除しておく(見えていないものが選択されたままにならないように)
    const visibleIds = new Set(filtered.map(it=>it.id));
    for(const id of [...selected]) if(!visibleIds.has(id)) selected.delete(id);
    const area = $('#dc-list-area'); if(!area) return;
    const cb = $('#dc-clear'); if(cb) cb.style.display = hasFilterOn() ? '' : 'none';
    const bulkBar = selected.size ? `<div class="row" style="margin-bottom:8px;gap:8px;align-items:center;background:#f7f5ef;border:1px solid var(--line);border-radius:8px;padding:8px 10px;flex-wrap:wrap">
      <span class="muted" style="font-weight:600">${selected.size}件選択中</span>
      <button class="btn gold sm" id="dc-bulk-reimport">${icon('play',{size:'12px'})} 選択した${selected.size}件を取り込む</button>
      <button class="btn ghost sm" id="dc-bulk-dl">${icon('download')} まとめてダウンロード</button>
      <button class="btn danger sm" id="dc-bulk-del">選択した${selected.size}件を削除</button>
      <button class="btn ghost sm" id="dc-bulk-clear">選択解除</button>
    </div>` : '';
    area.innerHTML = `
      <div class="muted" style="margin-bottom:8px">${filtered.length}件 / 全${items.length}件${hasFilterOn()?' (絞り込み中)':''}</div>
      ${bulkBar}
      ${filtered.length ? `
      <div class="list-scroll pc-only">
        <table class="list">
          <tr>
            <th style="width:32px"><input type="checkbox" id="dc-check-all" ${filtered.length && filtered.every(it=>selected.has(it.id))?'checked':''}></th>
            <th class="dc-th" data-col="file_name" style="cursor:pointer;white-space:nowrap">ファイル名 ${sortMark('file_name')}</th>
            <th class="dc-th" data-col="ts" style="cursor:pointer;white-space:nowrap">取り込み日時 ${sortMark('ts')}</th>
            <th class="dc-th" data-col="importer_name" style="cursor:pointer;white-space:nowrap">取り込んだ人 ${sortMark('importer_name')}</th>
            <th class="dc-th" data-col="applied" style="cursor:pointer;white-space:nowrap">反映件数 ${sortMark('applied')}</th>
            <th class="dc-th" data-col="sheets" style="cursor:pointer;white-space:nowrap">シート数 ${sortMark('sheets')}</th>
            <th class="dc-th" data-col="size" style="cursor:pointer;white-space:nowrap">サイズ ${sortMark('size')}</th>
            <th></th><th></th>
          </tr>
          ${filtered.map(it=>`<tr>
            <td><input type="checkbox" class="dc-check" data-id="${it.id}" ${selected.has(it.id)?'checked':''}></td>
            <td style="font-weight:600;max-width:320px">${h(it.file_name||'(名称不明)')}</td>
            <td style="white-space:nowrap">${h(it.ts)}</td>
            <td style="white-space:nowrap">${h(it.importer_name||'—')}</td>
            <td>${it.applied!=null?it.applied+'件':'—'}</td>
            <td>${it.sheets!=null?it.sheets:'—'}</td>
            <td style="white-space:nowrap">${fmtSize(it.size)}</td>
            <td style="white-space:nowrap"><button class="btn ghost xs dc-dl" data-id="${it.id}" data-name="${h(it.file_name||'daicho.xlsx')}">${icon('download')} ダウンロード</button></td>
            <td style="white-space:nowrap"><button class="btn danger xs dc-del" data-id="${it.id}" data-ts="${h(it.ts)}">削除</button></td>
          </tr>`).join('')}
        </table>
      </div>
      <div class="cards sp-only">
        ${filtered.map(it=>`<div class="dcard">
          <div class="dcard-head">
            <label style="display:flex;align-items:center;gap:8px;flex:1">
              <input type="checkbox" class="dc-check" data-id="${it.id}" ${selected.has(it.id)?'checked':''}>
              <span class="dcard-title">${h(it.file_name||'(名称不明)')}</span>
            </label>
          </div>
          <div class="drow"><span class="dk">取り込み日時</span><span class="dv">${h(it.ts)}</span></div>
          <div class="drow"><span class="dk">取り込んだ人</span><span class="dv">${h(it.importer_name||'—')}</span></div>
          <div class="drow"><span class="dk">反映件数</span><span class="dv">${it.applied!=null?it.applied+'件':'—'} / シート${it.sheets!=null?it.sheets:'—'} / ${fmtSize(it.size)}</span></div>
          <div class="dcard-actions">
            <button class="btn ghost sm dc-dl" data-id="${it.id}" data-name="${h(it.file_name||'daicho.xlsx')}">${icon('download')} ダウンロード</button>
            <button class="btn danger sm dc-del" data-id="${it.id}" data-ts="${h(it.ts)}">削除</button>
          </div>
        </div>`).join('')}
      </div>
      ` : `<div class="muted" style="padding:24px 0;text-align:center">${hasFilterOn()?'条件に一致する台帳はありません':'まだ保管された台帳はありません。スプレッドシートを取り込むと、ここに元Excelが保管されます。'}</div>`}`;
    area.querySelectorAll('.dc-check').forEach(c => c.onchange = () => {
      const id = Number(c.dataset.id);
      if(c.checked) selected.add(id); else selected.delete(id);
      renderList();
    });
    const checkAll = $('#dc-check-all');
    if(checkAll) checkAll.onchange = () => {
      if(checkAll.checked) filtered.forEach(it=>selected.add(it.id));
      else filtered.forEach(it=>selected.delete(it.id));
      renderList();
    };
    const bulkClear = $('#dc-bulk-clear');
    if(bulkClear) bulkClear.onclick = () => { selected.clear(); renderList(); };
    const bulkReimport = $('#dc-bulk-reimport');
    if(bulkReimport) bulkReimport.onclick = () => {
      const targets = filtered.filter(it=>selected.has(it.id));
      modal(`<h3>${icon('play',{size:'14px'})} 選択した${targets.length}件を取り込む</h3>
        <div class="muted" style="font-size:12px;margin-bottom:10px">台帳保管に保存済みのファイルを、もう一度パースして反映します。ファイルごとに対象日を指定してください(ファイル名から推測できた場合は自動入力されています)。</div>
        <div style="max-height:50vh;overflow-y:auto;display:flex;flex-direction:column;gap:6px;margin-bottom:10px">
          ${targets.map(it=>`<div class="row" style="gap:8px;align-items:center;padding:7px 9px;background:#faf9f6;border:1px solid var(--line);border-radius:8px;flex-wrap:wrap">
            <span style="flex:1;min-width:0;font-size:12.5px;word-break:break-all">${h(it.file_name||'(名称不明)')}</span>
            <label style="display:flex;align-items:center;gap:5px;font-size:12px;white-space:nowrap">対象日
              <input type="date" class="dcr-date-input" data-id="${it.id}" value="${h(guessDateFromName(it.file_name||''))}" style="padding:4px 6px;border:1px solid var(--line);border-radius:6px">
            </label>
          </div>`).join('')}
        </div>
        <label style="display:flex;align-items:flex-start;gap:7px;font-size:12.5px;margin-bottom:10px;padding:8px 10px;background:#faf9f6;border-radius:8px;border:1px solid var(--line)">
          <input type="checkbox" id="dcr-check-absent" style="margin-top:2px">
          <span>選択した全ファイルのどれにも登場しない人を、休暇に変更する<br><span class="muted" style="font-size:11px">複数の日付をまたぐため、既定ではオフです。</span></span>
        </label>
        <button class="btn gold sm" id="dcr-run">${icon('play',{size:'13px'})} 取り込みを実行する</button>
        <div id="dcr-msg" class="muted" style="margin-top:10px"></div>`);
      const runBtn = $('#dcr-run');
      runBtn.onclick = async () => {
        const items = [...document.querySelectorAll('.dcr-date-input')].map(inp => ({
          archiveId: Number(inp.dataset.id), targetDate: inp.value || '',
        }));
        const checkAbsent = $('#dcr-check-absent').checked;
        if(!confirm(`${items.length}件を取り込みます。よろしいですか？`)) return;
        const msgEl = $('#dcr-msg');
        msgEl.textContent = '取り込み中…';
        await withLoading(runBtn, async () => {
          try{
            const r = await api('/daicho/reimport-from-archive', { method:'POST', body:{ items, checkAbsent } });
            msgEl.innerHTML = `<b>${r.okCount}件成功(反映${r.totalApplied}件)</b>${r.ngCount?` / ${r.ngCount}件失敗`:''}${checkAbsent&&r.clearedAbsent?` / 不在者の休暇化 ${r.clearedAbsent}件`:''}${checkAbsent&&r.clearedRegistrations?` / 台帳に見当たらない登録現場を削除 ${r.clearedRegistrations}件`:''}<br>`
              + r.results.map(x=>`${x.ok?icon('checkCircle',{size:'12px'}):icon('xCircle',{size:'12px'})} ${h(x.fileName)}${x.targetDate?` (${h(x.targetDate)})`:''} ${x.ok?`反映${x.applied}件`:`エラー:${h(x.error)}`}`).join('<br>');
            popup(`取り込みが完了しました(${r.okCount}件成功)`);
          }catch(e){ msgEl.innerHTML = `<span class="msg err">${h(e.message)}</span>`; }
        });
      };
    };
    const bulkDl = $('#dc-bulk-dl');
    if(bulkDl) bulkDl.onclick = async () => {
      const targets = filtered.filter(it=>selected.has(it.id));
      bulkDl.disabled = true; const old = bulkDl.textContent;
      for(const it of targets){
        bulkDl.textContent = `ダウンロード中…(${targets.indexOf(it)+1}/${targets.length})`;
        try{ await downloadFile(`/daicho/${it.id}/download`, it.file_name||'daicho.xlsx'); }
        catch(e){ popup(`${it.file_name}: ${e.message}`,'error'); }
      }
      bulkDl.disabled = false; bulkDl.textContent = old;
    };
    const bulkDel = $('#dc-bulk-del');
    if(bulkDel) bulkDel.onclick = async () => {
      const ids = [...selected];
      if(!confirm(`選択した${ids.length}件の台帳を削除しますか？\n\n※元Excelファイルが完全に削除されます。すでに登録済みのスケジュール・給与データは残ります。`)) return;
      await withLoading(bulkDel, async () => {
        try{
          await api('/daicho/bulk-delete', { method:'POST', body:{ ids } });
          popup(`${ids.length}件削除しました`);
          pageDaicho(app);
        }catch(e){ popup(e.message,'error'); }
      });
    };
    area.querySelectorAll('.dc-th').forEach(th => th.onclick = () => {
      const c = th.dataset.col;
      if(st.sortCol === c) st.sortDir *= -1;
      else { st.sortCol = c; st.sortDir = c==='file_name'||c==='importer_name' ? 1 : -1; }
      const sortSel = $('#dc-sort'); if(sortSel) sortSel.value = `${st.sortCol}:${st.sortDir}`;
      renderList();
    });
    area.querySelectorAll('.dc-dl').forEach(b => b.onclick = async () => {
      b.disabled=true; const old=b.textContent; b.textContent='取得中…';
      try{ await downloadFile(`/daicho/${b.dataset.id}/download`, b.dataset.name); }
      catch(e){ popup(e.message,'error'); }
      finally{ b.disabled=false; b.textContent=old; }
    });
    area.querySelectorAll('.dc-del').forEach(b => b.onclick = async () => {
      if(!confirm(`${b.dataset.ts} に取り込んだ台帳を削除しますか？\n\n※元Excelファイルが完全に削除されます。すでに登録済みのスケジュール・給与データは残ります。`)) return;
      await withLoading(b, async () => {
        try{ await api(`/daicho/${b.dataset.id}/delete`,{method:'POST'}); popup('削除しました'); pageDaicho(app); }
        catch(e){ popup(e.message,'error'); }
      });
    });
  };

  app.innerHTML = `
  <h2 style="margin-bottom:8px">${icon('package')} 台帳保管</h2>
  <div class="card">
    ${items.length ? `
    <div class="sticky-filters">
      <div class="filter-bar" style="flex-wrap:wrap;gap:8px">
        <input id="dc-name" class="search-input" placeholder="ファイル名で検索" value="${h(st.name)}" style="min-width:160px;flex:1 1 160px">
        <select id="dc-person" class="filter-select" style="flex:1 1 140px">
          <option value="">取り込んだ人:すべて</option>
          ${persons.map(p=>`<option value="${h(p)}" ${st.person===p?'selected':''}>${h(p)}</option>`).join('')}
        </select>
        <label class="muted" style="display:flex;align-items:center;gap:4px;font-size:13px;white-space:nowrap">開始<input type="date" id="dc-from" value="${h(st.dateFrom)}" style="max-width:150px"></label>
        <label class="muted" style="display:flex;align-items:center;gap:4px;font-size:13px;white-space:nowrap">終了<input type="date" id="dc-to" value="${h(st.dateTo)}" style="max-width:150px"></label>
        <button class="btn ghost sm" id="dc-clear" style="${hasFilterOn()?'':'display:none'}">クリア</button>
      </div>
      <div class="row" style="margin:8px 0 0;align-items:center;gap:6px">
        <label class="muted" style="font-size:13px;white-space:nowrap">並び替え</label>
        <select id="dc-sort" class="filter-select" style="flex:1 1 220px">
          ${sortOptions.map(([col,dir,label])=>`<option value="${col}:${dir}" ${st.sortCol===col&&st.sortDir===dir?'selected':''}>${label}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="dc-list-area"></div>
    ` : '<div class="muted" style="padding:24px 0;text-align:center">まだ保管された台帳はありません。スプレッドシートを取り込むと、ここに元Excelが保管されます。</div>'}
  </div>`;

  if(items.length){
    renderList();
    const dn = $('#dc-name');
    if(dn) dn.oninput = () => { st.name = dn.value; renderList(); }; // input要素自体には触れないのでキーボードは閉じない
    const dp = $('#dc-person');
    if(dp) dp.onchange = () => { st.person = dp.value; renderList(); };
    const df = $('#dc-from');
    if(df) df.onchange = () => { st.dateFrom = df.value; renderList(); };
    const dt = $('#dc-to');
    if(dt) dt.onchange = () => { st.dateTo = dt.value; renderList(); };
    const ds = $('#dc-sort');
    if(ds) ds.onchange = () => { const [col,dir] = ds.value.split(':'); st.sortCol = col; st.sortDir = Number(dir); renderList(); };
    const dc = $('#dc-clear');
    if(dc) dc.onclick = () => { st.name=''; st.person=''; st.dateFrom=''; st.dateTo=''; pageDaicho(app); };
  }
}

/* ===== アカウント管理(管理者)===== */
// アカウントの登録番号(ログインIDを兼ねる)を変更する。管理者のみ。
// 変更後は、本人が次回ログインする際に新しい登録番号を使う必要があるため、その旨を案内する。
function openRegnoEdit(uid, name, current, onDone){
  modal(`<h3>登録番号の変更</h3>
    <div class="form-grid" style="max-width:320px">
      <label>現在</label><span class="muted">${h(current)}</span>
      <label>新しい番号 *</label><input id="rn-new" value="${h(current)}">
    </div>
    <div class="row" style="margin-top:14px"><button class="btn gold" id="rn-save" style="flex:1">変更する</button></div>`);
  $('#rn-save').onclick = async () => {
    const v = $('#rn-new').value.trim();
    if(!v){ popup('登録番号を入力してください','error'); return; }
    if(v === current){ closeModal(); return; }
    if(!confirm(`登録番号を「${current}」→「${v}」に変更します。よろしいですか？`)) return;
    await withLoading($('#rn-save'), async () => {
      try{
        await api(`/users/${uid}`, { method:'PATCH', body:{ regno:v } });
        USERS_CACHE = null;
        closeModal(); popup('登録番号を変更しました');
        if(onDone) onDone();
      }catch(e){ popup(e.message,'error'); }
    });
  };
}

async function pageAdmin(app){
  if(!has('account_manage')){ notFound(app); return; }
  const users = await getUsers(true);
  const mgrs = await api('/managers');
  const optLists = await api('/option-lists').catch(()=>({ka:[],han:[]}));
  const st = PAGE_STATE.admin || (PAGE_STATE.admin = { q:'', mgr:'', sort:'regno', open:{ list:true } });
  const openSet = st.open;
  const sec = (id,title,body)=>`<details class="adm-sec" id="sec-${id}" data-sec="${id}" ${openSet[id]?'open':''}><summary><span class="adm-sec-title">${title}</span></summary><div class="adm-body">${body}</div></details>`;

  // アカウント一覧のリスト部分だけを再構築する。検索欄など入力要素はここでは触らない
  // (input要素をDOMから作り直すと、スマホでソフトウェアキーボードが閉じてしまうため)
  const acctSortOptions = { regno:'登録番号順', rank:'ランク順', name:'氏名順(あ→ん)', han:'班順' };
  const sortAcctList = (list) => {
    const sorted = [...list];
    if(st.sort === 'regno') sorted.sort((a,b) => String(a.regno||'').localeCompare(String(b.regno||''), undefined, {numeric:true}));
    else if(st.sort === 'rank') sorted.sort((a,b) => rankOrder(a.rank) - rankOrder(b.rank) || String(a.regno||'').localeCompare(String(b.regno||''), undefined, {numeric:true}));
    else if(st.sort === 'name') sorted.sort((a,b) => String(a.name||'').localeCompare(String(b.name||''), 'ja'));
    else if(st.sort === 'han') sorted.sort((a,b) => String(a.han||'').localeCompare(String(b.han||''), 'ja') || String(a.regno||'').localeCompare(String(b.regno||''), undefined, {numeric:true}));
    return sorted;
  };
  const renderAccountList = () => {
    const adq = st.q.trim(), admgr = st.mgr;
    const aList = sortAcctList(users.filter(u=>{
      const mq = !adq || (u.name||'').includes(adq) || (u.regno||'').includes(adq);
      const mm = !admgr || (admgr.startsWith('__chief:') ? (!u.manager_id && u.ka===admgr.slice(8)) : String(u.manager_id)===String(admgr));
      return mq && mm;
    }));
    const area = $('#ad-list-area'); if(!area) return;
    const countEl = $('#ad-count'); if(countEl) countEl.textContent = `(${aList.length}名)`;
    area.innerHTML = `
      <div class="row" id="ad-bulk-bar" style="margin:2px 0 10px;gap:8px;align-items:center;flex-wrap:wrap">
        <span class="muted">${aList.length}名 表示中</span>
        <label class="muted" style="font-size:12px;margin-left:10px">並び替え</label>
        <select id="ad-sort" style="font-size:12.5px;padding:5px 6px">
          ${Object.entries(acctSortOptions).map(([k,l])=>`<option value="${k}" ${k===st.sort?'selected':''}>${l}</option>`).join('')}
        </select>
        <span class="muted" style="margin-left:auto">選択中: <span id="ad-sel-count">0</span>件</span>
        <button class="btn ghost sm" id="ad-bulk-suspend" disabled>まとめて停止</button>
        <button class="btn ghost sm" id="ad-bulk-restore" disabled>まとめて復活</button>
      </div>
      <div class="sched-wrap pc-only"><table class="list">
      <tr><th><input type="checkbox" id="ad-check-all"></th><th>登録番号</th><th>氏名</th><th>役割(管理者のみ変更可)</th><th>担当手配者</th><th>ランク</th><th>班</th><th>駅</th><th>操作</th></tr>
      ${aList.map(u=>`<tr class="${u.suspended?'is-suspended':''}">
        <td>${u.id===ME.id?'':`<input type="checkbox" class="ad-check" data-id="${u.id}">`}</td>
        <td class="nowrap">${h(u.regno)}${baseFromRegno(u.regno)?` <span class="muted" style="font-size:11px">(${baseFromRegno(u.regno)})</span>`:''}${ME.role==='admin'?` <button class="btn ghost xs regno-edit" data-id="${u.id}" data-cur="${h(u.regno)}" data-name="${h(u.name)}" title="登録番号を変更">${icon('edit',{size:'12px'})}</button>`:''}</td><td class="nowrap">${h(u.name)}</td>
        <td><select data-role="${u.id}">${['member','chief','handler','admin'].map(r=>`<option value="${r}" ${u.role===r?'selected':''}>${ROLE_JP[r]}</option>`).join('')}</select></td>
        <td><select data-mgr="${u.id}"><option value="">(なし)</option>${mgrs.map(m=>`<option value="${m.id}" ${String(u.manager_id)===String(m.id)?'selected':''}>${h(m.name)}手配</option>`).join('')}</select></td>
        <td class="nowrap">${h(u.rank)}</td><td class="nowrap">${h(u.han)}</td><td class="nowrap">${h(u.station)}</td>
        <td class="nowrap"><a class="btn ghost sm" href="#/permissions/${u.id}" style="text-decoration:none;display:inline-block">権限</a>
            <button class="btn ghost sm" data-suspend="${u.id}" data-cur="${u.suspended?1:0}">${u.suspended?'復活':'停止'}</button>
            <button class="btn ghost sm" data-reset="${u.id}">PWリセット</button>
            <button class="btn danger sm" data-del="${u.id}">削除</button></td>
      </tr>`).join('') || '<tr><td colspan="9" class="muted" style="text-align:center;padding:16px">該当するアカウントはありません</td></tr>'}
      </table></div>
      <div class="cards sp-only">
      ${aList.map(u=>`<div class="dcard ${u.suspended?'is-suspended':''}">
        <div class="dcard-head">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            ${u.id===ME.id?'<span style="width:16px;display:inline-block"></span>':`<input type="checkbox" class="ad-check" data-id="${u.id}">`}
            <span class="dcard-title">${h(u.name)}</span>
          </label>
          <span class="dcard-sub">${h(u.regno)}${baseFromRegno(u.regno)?` (${baseFromRegno(u.regno)})`:''}${ME.role==='admin'?` <button class="btn ghost xs regno-edit" data-id="${u.id}" data-cur="${h(u.regno)}" data-name="${h(u.name)}" title="登録番号を変更">${icon('edit',{size:'12px'})}</button>`:''}</span>
        </div>
        <div class="drow"><span class="dk">役割</span><span class="dv"><select data-role="${u.id}">${['member','chief','handler','admin'].map(r=>`<option value="${r}" ${u.role===r?'selected':''}>${ROLE_JP[r]}</option>`).join('')}</select></span></div>
        <div class="drow"><span class="dk">担当手配</span><span class="dv"><select data-mgr="${u.id}"><option value="">(なし)</option>${mgrs.map(m=>`<option value="${m.id}" ${String(u.manager_id)===String(m.id)?'selected':''}>${h(m.name)}手配</option>`).join('')}</select></span></div>
        <div class="drow"><span class="dk">ランク/班</span><span class="dv">${h(u.rank)||'—'} / ${h(u.han)||'—'}</span></div>
        <div class="drow"><span class="dk">最寄駅</span><span class="dv">${h(u.station)||'—'}</span></div>
        <div class="dcard-actions"><a class="btn ghost sm" href="#/permissions/${u.id}" style="text-decoration:none;display:inline-block">権限</a><button class="btn ghost sm" data-suspend="${u.id}" data-cur="${u.suspended?1:0}">${u.suspended?'復活':'停止'}</button><button class="btn ghost sm" data-reset="${u.id}">PWリセット</button><button class="btn danger sm" data-del="${u.id}">削除</button></div>
      </div>`).join('') || '<div class="muted" style="text-align:center;padding:16px">該当するアカウントはありません</div>'}
      </div>
`;
    area.querySelectorAll('[data-role]').forEach(s => s.onchange = async () => {
      try{ await api('/users/'+s.dataset.role, { method:'PATCH', body:{ role:s.value } }); USERS_CACHE=null; }
      catch(e){ alert(e.message); render(); }
    });
    area.querySelectorAll('.regno-edit').forEach(b => b.onclick = () => openRegnoEdit(b.dataset.id, b.dataset.name, b.dataset.cur, () => pageAdmin(app)));
    area.querySelectorAll('[data-mgr]').forEach(s => s.onchange = async () => {
      try{ await api('/users/'+s.dataset.mgr, { method:'PATCH', body:{ manager_id: s.value?Number(s.value):null } }); USERS_CACHE=null; }
      catch(e){ alert(e.message); render(); }
    });
    area.querySelectorAll('[data-suspend]').forEach(b => b.onclick = async () => {
      const id = b.dataset.suspend, cur = b.dataset.cur === '1';
      if(!confirm(cur ? 'このアカウントを復活します(ログイン可)。よろしいですか?' : 'このアカウントを停止します(ログイン不可。一覧・スケジュール入力・現場一覧には引き続き表示)。よろしいですか?')) return;
      await withLoading(b, async () => {
        try{ await api(`/users/${id}`,{method:'PATCH',body:{suspended:cur?0:1}}); USERS_CACHE=null; popup(cur?'復活しました':'停止しました'); renderAccountList(); }
        catch(e){ popup(e.message,'error'); }
      });
    });
    area.querySelectorAll('[data-reset]').forEach(b => b.onclick = async () => {
      if(!confirm('パスワードを初期化しますか?(登録番号でログインできるようになります)')) return;
      await withLoading(b, async () => {
        await api(`/users/${b.dataset.reset}/resetpw`, { method:'POST' }); alert('初期化しました');
      });
    });
    area.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if(!confirm('このアカウントを削除しますか?スケジュールも削除されます。')) return;
      await withLoading(b, async () => {
        try{ await api('/users/'+b.dataset.del, { method:'DELETE' }); USERS_CACHE=null; render(); }
        catch(e){ alert(e.message); }
      });
    });

    // 複数選択・一括停止/復活
    const sortSel = $('#ad-sort'); if(sortSel) sortSel.onchange = (e) => { st.sort = e.target.value; renderAccountList(); };
    const updateBulkBar = () => {
      const checked = area.querySelectorAll('.ad-check:checked');
      const cnt = $('#ad-sel-count'), sb = $('#ad-bulk-suspend'), rb = $('#ad-bulk-restore');
      if(cnt) cnt.textContent = checked.length;
      if(sb) sb.disabled = checked.length === 0;
      if(rb) rb.disabled = checked.length === 0;
    };
    const checkAll = $('#ad-check-all');
    if(checkAll) checkAll.onchange = () => {
      area.querySelectorAll('.ad-check').forEach(cb => cb.checked = checkAll.checked);
      updateBulkBar();
    };
    area.querySelectorAll('.ad-check').forEach(cb => cb.onchange = updateBulkBar);
    updateBulkBar();

    const bulkAction = async (suspend) => {
      const ids = [...area.querySelectorAll('.ad-check:checked')].map(cb => Number(cb.dataset.id));
      if(!ids.length) return;
      const verb = suspend ? '停止' : '復活';
      if(!confirm(`選択した${ids.length}件のアカウントを、まとめて${verb}します。よろしいですか?`)) return;
      try{
        const r = await api('/users/bulk-suspend', { method:'POST', body:{ ids, suspended:suspend } });
        USERS_CACHE = null;
        popup(`${r.count}件を${verb}しました`);
        pageAdmin(app);
      }catch(e){ popup(e.message,'error'); }
    };
    const bsBtn = $('#ad-bulk-suspend'); if(bsBtn) bsBtn.onclick = () => bulkAction(true);
    const brBtn = $('#ad-bulk-restore'); if(brBtn) brBtn.onclick = () => bulkAction(false);
  };

  app.innerHTML = `
  <h2 style="margin-bottom:8px">アカウント管理</h2>
  <div class="adm-nav sticky-filters">
    ${[['data',`${icon('clipboardList')} 全データ`],['create',`${icon('plus')} 新規作成`],['list',`${icon('users')} アカウント一覧`]].map(s=>`<button class="adm-chip" data-jump="${s[0]}">${s[1]}</button>`).join('')}
    <a href="#/role-permissions" class="adm-chip" style="text-decoration:none;display:inline-block">${icon('shield')} 権限の一括設定</a>
    <a href="#/admin-settings" class="adm-chip" style="text-decoration:none;display:inline-block">${icon('wrench')} システム設定</a>
  </div>

  ${sec('data',`${icon('clipboardList')} 全データ閲覧`, `
    <div class="row" style="margin-bottom:10px">
      <select id="dv-table">
        <option value="users">アカウント一覧(パスワード状態を含む)</option>
        <option value="schedule">スケジュール全件</option>
        <option value="history">スケジュール編集履歴</option>
        <option value="reports">新人報告 全項目</option>
        <option value="blacklist">ブラックリスト</option>
        <option value="notifications">通知(全員分)</option>
        <option value="sessions">ログインセッション</option>
      </select>
      <button class="btn" id="dv-load">表示する</button>
    </div>
    <div id="dv-out" class="muted">テーブルを選んでください</div>`)}

  ${sec('create',`<span style="white-space:nowrap">${icon('plus')} 新規アカウント作成</span> <span class="muted" style="font-weight:400">(初期パスワード = 登録番号)</span>`, `
    <div class="form-grid" style="max-width:640px">
      <label>登録番号 *</label><input id="a-regno" placeholder="登録番号">
      <label>氏名 *</label><input id="a-name" placeholder="氏名">
      <label>ランク</label><select id="a-rank"><option value="">-</option>${['A','B','C','D','E'].map(r=>`<option>${r}</option>`).join('')}</select>
      <label>所属課</label><select id="a-ka"><option value="">-</option>${optLists.ka.map(o=>`<option value="${h(o.value)}">${h(o.value)}</option>`).join('')}</select>
      <label>班</label><select id="a-han"><option value="">-</option>${optLists.han.map(o=>`<option value="${h(o.value)}">${h(o.value)}</option>`).join('')}</select>
      <label>最寄駅</label><input id="a-station" placeholder="最寄駅">
      <label>役割</label><select id="a-role"><option value="member">メンツ</option><option value="chief">チーフ</option><option value="handler">チーフ(手配者)</option><option value="admin">チーフ(管理者)</option></select>
      <label>手配担当</label><select id="a-mgr"><option value="">チーフ手配</option>${mgrs.map(m=>`<option value="${m.id}">${h(m.name)}手配</option>`).join('')}</select>
    </div>
    <div class="row" style="margin-top:12px;gap:8px;align-items:center">
      <button class="btn gold" id="a-add">作成</button><span id="a-msg"></span>
    </div>
    <div style="margin-top:8px"><button class="btn ghost xs" id="a-opt-manage" type="button">所属課・班の選択肢を管理</button></div>
    <div id="a-opt-panel" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid var(--line)">
      <div class="row" style="gap:16px;flex-wrap:wrap;align-items:flex-start">
        <div>
          <div style="font-weight:700;margin-bottom:6px">所属課</div>
          ${optLists.ka.map(o=>`<div class="row" style="gap:6px;margin-bottom:4px;align-items:center"><span>${h(o.value)}</span><button class="btn ghost xs opt-del" data-id="${o.id}">削除</button></div>`).join('') || '<div class="muted">まだありません</div>'}
          <div class="row" style="margin-top:6px;gap:6px"><input id="a-ka-new" placeholder="新しい所属課" style="width:140px"><button class="btn ghost sm" id="a-ka-add">追加</button></div>
        </div>
        <div>
          <div style="font-weight:700;margin-bottom:6px">班</div>
          ${optLists.han.map(o=>`<div class="row" style="gap:6px;margin-bottom:4px;align-items:center"><span>${h(o.value)}</span><button class="btn ghost xs opt-del" data-id="${o.id}">削除</button></div>`).join('') || '<div class="muted">まだありません</div>'}
          <div class="row" style="margin-top:6px;gap:6px"><input id="a-han-new" placeholder="新しい班" style="width:140px"><button class="btn ghost sm" id="a-han-add">追加</button></div>
        </div>
      </div>
    </div>`)}

  ${sec('list',`<span style="white-space:nowrap">${icon('users')} アカウント一覧</span> <span class="muted" style="font-weight:400" id="ad-count">(${users.length}名)</span>`, `
    <div class="filter-bar">
      <input id="ad-search" class="search-input" placeholder="氏名・登録番号で検索" value="${h(st.q)}">
      <select id="ad-mgr" class="filter-select">
        <option value="">手配担当:すべて</option>
        ${mgrs.map(m=>`<option value="${m.id}" ${String(st.mgr)===String(m.id)?'selected':''}>${h(m.name)}手配</option>`).join('')}
        <option value="__chief:1課" ${st.mgr==='__chief:1課'?'selected':''}>チーフ手配(1課)</option>
        <option value="__chief:2課" ${st.mgr==='__chief:2課'?'selected':''}>チーフ手配(2課)</option>
      </select>
      <button class="btn ghost sm" id="ad-clear" style="${(st.q||st.mgr)?'':'display:none'}">クリア</button>
    </div>
    <div id="ad-list-area"></div>`)}`;

  renderAccountList();

  // 折りたたみの開閉状態を保持 / 目次ジャンプ
  app.querySelectorAll('.adm-sec').forEach(d => d.addEventListener('toggle', () => { st.open[d.dataset.sec] = d.open; }));
  app.querySelectorAll('[data-jump]').forEach(b => b.onclick = () => {
    const d = document.getElementById('sec-'+b.dataset.jump);
    if(d){ d.open = true; st.open[b.dataset.jump] = true; d.scrollIntoView({behavior:'smooth', block:'start'}); }
  });

  $('#dv-load').onclick = async () => {
    $('#dv-out').innerHTML = '<span class="spinner" style="width:13px;height:13px;border-width:2px;margin-right:5px"></span>読み込み中…';
    try{
      const rows = await api('/admin/data?table=' + $('#dv-table').value);
      if(!rows.length){ $('#dv-out').innerHTML = '<div class="muted">データはありません</div>'; return; }
      DV_STATE.rows = rows;
      DV_STATE.cols = Object.keys(rows[0]);
      DV_STATE.sortCol = null; DV_STATE.sortDir = 1; DV_STATE.filters = {};
      DV_STATE.tableName = $('#dv-table').value;
      renderDvTable();
    }catch(e){ $('#dv-out').innerHTML = `<div class="msg err">${h(e.message)}</div>`; }
  };
  $('#a-add').onclick = async () => {
    await withLoading($('#a-add'), async () => {
      try{
        await api('/users',{method:'POST',body:{
          regno:$('#a-regno').value, name:$('#a-name').value, rank:$('#a-rank').value,
          ka:$('#a-ka').value, han:$('#a-han').value, station:$('#a-station').value,
          role:$('#a-role').value, manager_id:$('#a-mgr').value ? Number($('#a-mgr').value) : null
        }});
        USERS_CACHE=null; render();
      }catch(e){ $('#a-msg').innerHTML = `<span class="msg err">${h(e.message)}</span>`; }
    });
  };
  const aom = $('#a-opt-manage');
  if(aom) aom.onclick = () => { const p=$('#a-opt-panel'); if(p) p.style.display = p.style.display==='none' ? '' : 'none'; };
  const akAdd = $('#a-ka-add');
  if(akAdd) akAdd.onclick = async () => {
    const v = $('#a-ka-new').value.trim(); if(!v) return;
    await withLoading(akAdd, async () => {
      try{ await api('/option-lists',{method:'POST',body:{category:'ka',value:v}}); pageAdmin(app); }
      catch(e){ popup(e.message,'error'); }
    });
  };
  const ahAdd = $('#a-han-add');
  if(ahAdd) ahAdd.onclick = async () => {
    const v = $('#a-han-new').value.trim(); if(!v) return;
    await withLoading(ahAdd, async () => {
      try{ await api('/option-lists',{method:'POST',body:{category:'han',value:v}}); pageAdmin(app); }
      catch(e){ popup(e.message,'error'); }
    });
  };
  app.querySelectorAll('.opt-del').forEach(b => b.onclick = async () => {
    if(!confirm('この選択肢を削除しますか？(既に設定されているメンバーの値はそのまま残ります)')) return;
    await withLoading(b, async () => {
      try{ await api(`/option-lists/${b.dataset.id}`,{method:'DELETE'}); pageAdmin(app); }
      catch(e){ popup(e.message,'error'); }
    });
  });
  const adS=$('#ad-search');
  if(adS){
    adS.oninput = () => {
      st.q = adS.value;
      const adC0 = $('#ad-clear'); if(adC0) adC0.style.display = (st.q||st.mgr) ? '' : 'none';
      renderAccountList(); // input要素自体には触れず、リストだけ更新するのでキーボードは閉じない
    };
  }
  const adM=$('#ad-mgr'); if(adM) adM.onchange=()=>{ st.mgr=adM.value; const adC0=$('#ad-clear'); if(adC0) adC0.style.display=(st.q||st.mgr)?'':'none'; renderAccountList(); };
  const adC=$('#ad-clear'); if(adC) adC.onclick=()=>{ st.q=''; st.mgr=''; pageAdmin(app); };
}

/* ===== システム設定(PIN・連携・通知・台帳夜間再取込・時給。wage_settings権限のみ・専用ページ) ===== */
async function pageAdminSettings(app){
  if(!has('wage_settings')){ notFound(app); return; }
  const pin = (await api('/settings/handler-pin')).pin;
  const importTok = (await api('/settings/import-token')).token;
  const wageData = await api('/wage-rates').catch(()=>null);
  const dutyMap = await api('/duty-map').catch(()=>({}));
  const notifyData = await api('/notify-settings').catch(()=>null);
  const lockData = await api('/lock-settings').catch(()=>null);
  const rtoList = await api('/report-type-options').catch(()=>[]);
  const maintenance = await api('/settings/maintenance').catch(()=>({enabled:false}));
  const featureStatus = await api('/settings/feature-status').catch(()=>({}));
  const stAs = PAGE_STATE.adminSettings || (PAGE_STATE.adminSettings = { open:{ pin:true } });
  const openSet = stAs.open;
  const sec = (id,title,body)=>`<details class="adm-sec" id="asec-${id}" data-sec="${id}" ${openSet[id]?'open':''}><summary><span class="adm-sec-title">${title}</span></summary><div class="adm-body">${body}</div></details>`;
  app.innerHTML = `
  <h2 style="margin-bottom:8px">${icon('wrench')} システム設定</h2>
  <div class="adm-nav sticky-filters">
    ${[['pin',`${icon('key')} PIN`],['link',`${icon('link')} 連携`],['features',`${icon('flask')} 機能公開`],['notify',`${icon('bell')} 通知`],['wage',`${icon('yen')} 時給`],['report-type',`${icon('fileText')} 報告選択肢`],['maintenance',`${icon('construction')} メンテナンス`]].map(s=>`<button class="adm-chip" data-jump="${s[0]}">${s[1]}</button>`).join('')}
  </div>

  ${sec('pin',`${icon('key')} 手配者専用パスワード(PIN)`, `
    <div class="row">
      <span>現在:<b id="pin-now">${h(pin)}</b></span>
      <input id="pin-new" placeholder="新しいPIN(4〜20文字)" style="width:180px">
      <button class="btn" id="pin-save">変更する</button><span id="pin-msg"></span>
    </div>
    <div class="muted" style="margin-top:6px">変更すると、手配モード中のメンバーは全員解除され、新しいPINの再入力が必要になります。</div>`)}

  ${sec('link',`${icon('link')} スプレッドシート連携(取り込みトークン)`, `
    <div class="row">
      <input id="imp-tok" value="${h(importTok)}" readonly style="flex:1;min-width:240px;font-family:monospace;font-size:12px">
      <button class="btn ghost" id="imp-copy">コピー</button>
      <button class="btn danger" id="imp-regen">再発行</button><span id="imp-msg"></span>
    </div>
`)}

  ${sec('notify',`<span style="white-space:nowrap">${icon('bell')} 通知設定</span> <span class="muted" style="font-weight:400">(新人報告リマインド)</span>`, notifyData ? `
    <div class="form-grid" style="grid-template-columns:120px 1fr;max-width:440px;gap:10px 12px;align-items:center">
      <label>通知</label>
      <label style="font-weight:400;display:flex;align-items:center;gap:8px"><input type="checkbox" id="nt-enabled" ${notifyData.enabled?'checked':''} style="width:auto"> 通知をオンにする</label>
      <label>送信時刻</label>
      <select id="nt-hour" style="width:120px">${Array.from({length:24},(_,i)=>`<option value="${i}" ${notifyData.hour===i?'selected':''}>${String(i).padStart(2,'0')}:00</option>`).join('')}</select>
      <label>送信対象</label>
      <select id="nt-target" style="width:auto">
        <option value="chiefs" ${notifyData.target==='chiefs'?'selected':''}>チーフ以上（チーフ・手配者・管理者）</option>
        <option value="handlers" ${notifyData.target==='handlers'?'selected':''}>手配者・管理者のみ</option>
        <option value="all" ${notifyData.target==='all'?'selected':''}>メンツを含む全員</option>
      </select>
    </div>
    <div class="row" style="margin-top:14px;gap:8px;align-items:center;flex-wrap:wrap">
      <button class="btn gold sm" id="nt-save">通知設定を保存</button>
      <button class="btn ghost sm" id="nt-test">今すぐテスト送信(自分だけに)</button>
      <button class="btn ghost sm" id="nt-run-now">本日分を今すぐ本番送信</button>
      <span id="nt-msg" class="muted"></span>
    </div>
    <div class="muted" style="margin-top:6px;font-size:12px">自動送信(毎日設定時刻)がうまく動いていない時は、「本日分を今すぐ本番送信」で、その場で対象者へ送信できます。</div>

  ` : '<div class="muted">通知設定を取得できませんでした</div>')}

  ${sec('wage',`<span style="white-space:nowrap">${icon('yen')} 時給設定</span> <span class="muted" style="font-weight:400">(ランク×時期)</span>`, wageData ? `
    <div class="muted" style="margin-bottom:8px">現場日に有効な時給が給与計算に使われます。<b>${h(wageData.lockBefore)}</b> 以前の現場は給与確定済み（時給を変えても再計算されません）。</div>
    ${lockData ? `
    <div style="background:#f7f5ef;border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin-bottom:12px">
      <div style="font-weight:700;margin-bottom:6px">${icon('lock')} 給与確定ロック期間</div>
      <div class="muted" style="margin-bottom:8px">現場日からこの日数を過ぎると、チーフ・手配者は編集できなくなります（管理者は常に編集可）。</div>
      <div class="row" style="align-items:center;gap:8px;flex-wrap:wrap">
        <span>現場日から</span>
        <input type="number" id="lock-days" value="${lockData.days}" min="0" max="3650" style="width:90px">
        <span>日後に確定</span>
        <button class="btn gold sm" id="lock-save">保存</button>
        <span id="lock-msg" class="muted"></span>
      </div>
      <div class="muted" style="margin-top:6px;font-size:12px">現在の設定では <b>${h(lockData.lockBefore)}</b> 以前が確定済みです。0にすると当日以降すべて編集可、長くすると過去まで編集可になります。</div>
    </div>` : ''}
    <div id="wage-periods"></div>
    <div class="row" style="margin:10px 0;gap:8px;align-items:center;flex-wrap:wrap;background:#f7f5ef;border:1px solid var(--line);border-radius:8px;padding:8px 10px">
      <span class="muted" style="font-size:12.5px">新しい改定の適用開始日</span>
      <input type="date" id="wage-new-ef" style="width:150px">
      <button class="btn ghost sm" id="wage-new-add">${icon('plus',{size:'12px'})} 改定を追加</button>
      <span id="wage-new-msg" class="muted"></span>
    </div>
    <div class="row" style="margin-top:12px;gap:8px;align-items:center">
      <button class="btn gold sm" id="wage-save">時給を保存</button>
      <span id="wage-msg" class="muted"></span>
    </div>

    <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--line)">
      <div style="font-weight:700;margin-bottom:8px">${icon('clipboardList')} 業務名 → 料金区分の対応表</div>
      <div class="muted" style="margin-bottom:8px">台帳の「業務名」列に入っている値ごとに、どの料金で計算されるかを設定します。ここに無い業務名は「対象外(給与計算なし)」として扱われます。</div>
      <table class="wage-tbl" style="max-width:640px">
        <tr><th>業務名</th><th>料金区分</th><th></th></tr>
        ${Object.entries(dutyMap).map(([duty,seg])=>`<tr>
          <td>${h(duty)}</td>
          <td><select class="duty-seg-select" data-duty="${h(duty)}">${Object.entries(DUTY_SEG_LABELS).map(([k,l])=>`<option value="${k}" ${k===seg?'selected':''}>${h(l)}</option>`).join('')}</select></td>
          <td><button class="btn ghost xs duty-del" data-duty="${h(duty)}">削除</button></td>
        </tr>`).join('') || '<tr><td colspan="3" class="muted">登録されていません</td></tr>'}
      </table>
      <div class="row" style="margin-top:10px;gap:6px;align-items:center;flex-wrap:wrap">
        <input id="duty-new-name" placeholder="新しい業務名(例:誘導)" style="flex:1;min-width:140px">
        <select id="duty-new-seg">${Object.entries(DUTY_SEG_LABELS).map(([k,l])=>`<option value="${k}">${h(l)}</option>`).join('')}</select>
        <button class="btn gold sm" id="duty-add">追加</button>
      </div>
      <div class="muted" id="duty-msg" style="margin-top:6px"></div>
    </div>
    <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line)">
      <button class="btn ghost sm" id="recalc-btn">過去データの給与・残業を再計算</button>
      <span id="recalc-msg" class="muted"></span>
      <div class="muted" style="margin-top:6px">取り込み済みの全現場を、現在の時給・新ルール（残業9h／業務名）で計算し直します。確定ロックに関わらず再計算し、手動入力した給与も上書きされます。</div>
    </div>
  ` : '<div class="muted">時給データを取得できませんでした</div>')}

  ${sec('report-type',`${icon('fileText')} 「現場変更の報告」の選択肢`, `
    <div id="rto-list"></div>
    <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap;align-items:center">
      <select id="rto-type"><option value="off">休暇</option><option value="ok">1日OK</option><option value="paid">有給</option><option value="x">×</option></select>
      <input id="rto-label" placeholder="表示ラベル(例:1日OKに変更)" style="width:200px">
      <button class="btn gold sm" id="rto-add">追加</button>
    </div>`)}

  ${sec('features',`${icon('flask')} 機能公開設定`, `
    <div class="muted" style="margin-bottom:10px">各画面を「公開中」「準備中(まだ誰にも見せない)」「メンテナンス中(一時的に使えなくする)」から選べます。メニュー自体は誰でも見えますが、開くとそれぞれの状態に応じたメッセージが表示されます。管理者本人には、この設定に関わらず常に通常通り表示されます。</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${FEATURE_KEYS.map(key=>{
        const st = featureStatus[key] || 'ready';
        const feature = FEATURE_LABELS[key];
        const tagCls = st==='ready' ? 'checked' : st==='maintenance' ? 'pending' : 'suspended';
        const tagText = st==='ready' ? `${icon('circleFilled',{size:'10px'})} 公開中` : st==='maintenance' ? `${icon('construction',{size:'10px'})} メンテナンス中` : `${icon('clock',{size:'10px'})} 準備中`;
        return `
      <div class="row" style="gap:10px;align-items:center;justify-content:space-between;padding:8px 10px;background:#f7f5ef;border-radius:8px;flex-wrap:wrap">
        <span>${icon(feature.icon)} ${h(feature.label)}</span>
        <div class="row" style="gap:8px;align-items:center">
          <span class="tag ${tagCls}" id="feat-status-${key}">${tagText}</span>
          <select class="feat-select" data-key="${key}" style="font-size:12.5px;padding:5px 6px">
            <option value="ready" ${st==='ready'?'selected':''}>公開中</option>
            <option value="hidden" ${st==='hidden'?'selected':''}>準備中</option>
            <option value="maintenance" ${st==='maintenance'?'selected':''}>メンテナンス中</option>
          </select>
        </div>
      </div>`;
      }).join('')}
    </div>`)}

  ${sec('maintenance',`${icon('construction')} メンテナンスモード`, `
    <div class="muted" style="margin-bottom:10px">有効にすると、<b>管理者以外の全員が即座に強制ログアウト</b>され、メンテナンスを終了するまで管理者以外はログインできなくなります(ログイン画面に「現在メンテナンス中です」と表示されます)。管理者は引き続きログイン・操作できます。</div>
    <div class="row" style="gap:10px;align-items:center;margin-bottom:12px">
      <span>現在の状態:</span>
      <span class="tag ${maintenance.enabled?'pending':'checked'}" id="maint-status">${maintenance.enabled?`${icon('construction',{size:'10px'})} メンテナンス中`:`${icon('circleFilled',{size:'10px'})} 通常稼働中`}</span>
    </div>
    <button class="btn ${maintenance.enabled?'gold':'danger'}" id="maint-toggle">${maintenance.enabled?'メンテナンスを終了する':'メンテナンスを開始する(全員強制ログアウト)'}</button>
    <span class="muted" id="maint-msg" style="margin-left:8px"></span>`)}`;

  app.querySelectorAll('.adm-sec').forEach(d => d.addEventListener('toggle', () => { stAs.open[d.dataset.sec] = d.open; }));
  app.querySelectorAll('[data-jump]').forEach(b => b.onclick = () => {
    const d = document.getElementById('asec-'+b.dataset.jump);
    if(d){ d.open = true; stAs.open[b.dataset.jump] = true; d.scrollIntoView({behavior:'smooth', block:'start'}); }
  });

  const renderRto = (list) => {
    const el = $('#rto-list'); if(!el) return;
    el.innerHTML = list.map(o=>`<div class="rto-row">
      <span class="rto-type-badge">${h(o.type)}</span>
      <input class="rto-label-edit" data-id="${o.id}" value="${h(o.label)}">
      ${o.type==='work'?'<span class="muted" style="font-size:12px;white-space:nowrap">(必須)</span>':`<button class="btn ghost xs rto-del" data-id="${o.id}">削除</button>`}
    </div>`).join('');
    el.querySelectorAll('.rto-label-edit').forEach(inp => inp.onchange = async () => {
      try{ await api(`/report-type-options/${inp.dataset.id}`,{method:'PUT',body:{label:inp.value.trim()}}); popup('更新しました'); }
      catch(e){ popup(e.message,'error'); }
    });
    el.querySelectorAll('.rto-del').forEach(b => b.onclick = async () => {
      if(!confirm('この選択肢を削除しますか？')) return;
      await withLoading(b, async () => {
        try{ await api(`/report-type-options/${b.dataset.id}`,{method:'DELETE'}); const d=await api('/report-type-options'); renderRto(d); }
        catch(e){ popup(e.message,'error'); }
      });
    });
  };
  renderRto(rtoList);
  { const rb = $('#rto-add'); if(rb) rb.onclick = async () => {
      const type = $('#rto-type').value;
      const label = $('#rto-label').value.trim();
      if(!label){ popup('表示ラベルを入力してください','error'); return; }
      await withLoading(rb, async () => {
        try{
          await api('/report-type-options',{method:'POST',body:{type,label}});
          $('#rto-label').value='';
          const d = await api('/report-type-options'); renderRto(d);
          popup('追加しました');
        }catch(e){ popup(e.message,'error'); }
      });
  }; }

  const renderWagePeriods = () => {
    const el = $('#wage-periods'); if(!el || !wageData) return;
    const sorted = [...wageData.periods].sort((a,b)=>a.effective_from.localeCompare(b.effective_from));
    el.innerHTML = sorted.map(p=>`
      <div class="row" style="align-items:center;gap:8px;margin:10px 0 4px">
        <div style="font-weight:700;flex:1">${p.effective_from==='1900-01-01'?'旧時給（〜2025/9）':h(p.effective_from)+' 〜（改定）'}</div>
        ${sorted.length>1?`<button type="button" class="btn ghost xs wage-period-del" data-ef="${h(p.effective_from)}">削除</button>`:''}
      </div>
      <table class="wage-tbl">
        <tr><th>ランク</th><th>案内料金</th><th>搬入出料金</th></tr>
        ${['A','B','C','D','E'].map(rk=>{const g=(p.rates[rk]||{}).guide||0,l=(p.rates[rk]||{}).load||0;return `<tr><td>${rk}</td>
          <td><input type="number" class="wage-in" data-ef="${h(p.effective_from)}" data-rank="${rk}" data-kind="guide" value="${g}"></td>
          <td><input type="number" class="wage-in" data-ef="${h(p.effective_from)}" data-rank="${rk}" data-kind="load" value="${l}"></td></tr>`;}).join('')}
      </table>`).join('');
    el.querySelectorAll('.wage-period-del').forEach(b => b.onclick = async () => {
      const ef = b.dataset.ef;
      if(!confirm(`${ef} 〜 の改定を削除します。この期間に該当する現場の給与は、次に古い改定の時給で計算されるようになります。よろしいですか？`)) return;
      await withLoading(b, async () => {
        try{
          await api('/wage-rates/delete',{method:'POST',body:{effective_from:ef}});
          wageData.periods = wageData.periods.filter(p=>p.effective_from!==ef);
          renderWagePeriods();
          popup('削除しました');
        }catch(e){ popup(e.message,'error'); }
      });
    });
  };
  renderWagePeriods();
  { const wa = $('#wage-new-add'); if(wa) wa.onclick = () => {
      const ef = $('#wage-new-ef').value;
      const msg = $('#wage-new-msg');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(ef)){ msg.textContent = '日付を選択してください'; return; }
      if(wageData.periods.some(p=>p.effective_from===ef)){ msg.textContent = 'その日付は既に登録されています'; return; }
      const base = [...wageData.periods].sort((a,b)=>a.effective_from.localeCompare(b.effective_from)).pop();
      const rates = {};
      for(const rk of ['A','B','C','D','E']) rates[rk] = { guide:(base&&base.rates[rk]||{}).guide||0, load:(base&&base.rates[rk]||{}).load||0 };
      wageData.periods.push({ effective_from: ef, rates });
      msg.textContent = '';
      $('#wage-new-ef').value = '';
      renderWagePeriods();
      popup('入力欄を追加しました。金額を確認のうえ「時給を保存」を押してください');
  }; }
  { const ws = $('#wage-save'); if(ws) ws.onclick = async () => {
      const rates = [...document.querySelectorAll('.wage-in')].map(i=>({effective_from:i.dataset.ef,rank:i.dataset.rank,kind:i.dataset.kind,amount:Number(i.value)})).filter(r=>Number.isFinite(r.amount)&&r.amount>=0);
      $('#wage-msg').textContent='保存中…';
      await withLoading(ws, async () => {
        try{ const r=await api('/wage-rates',{method:'PUT',body:{rates}}); $('#wage-msg').textContent=`${r.updated}件 保存しました`; popup('時給を更新しました'); }
        catch(e){ $('#wage-msg').textContent=e.message; }
      });
  }; }
  { const ls = $('#lock-save'); if(ls) ls.onclick = async () => {
      const days = Number($('#lock-days').value);
      $('#lock-msg').textContent='保存中…';
      await withLoading(ls, async () => {
        try{ const r=await api('/lock-settings',{method:'PUT',body:{days}});
          $('#lock-msg').textContent=`${r.lockBefore} 以前を確定`; popup('ロック期間を保存しました'); pageAdminSettings(app); }
        catch(e){ $('#lock-msg').textContent=e.message; }
      });
  }; }
  { const rb = $('#recalc-btn'); if(rb) rb.onclick = async () => {
      if(!confirm('取り込み済みの全現場の給与・残業を、現在の時給・新ルールで再計算します。手動入力した給与も上書きされます。よろしいですか？')) return;
      $('#recalc-msg').textContent='再計算中…（件数が多いと数十秒かかります）';
      await withLoading(rb, async () => {
        try{ const r=await api('/recalc',{method:'POST'}); $('#recalc-msg').textContent=`${r.updated}件 再計算しました`; popup(`${r.updated}件を再計算しました`); }
        catch(e){ $('#recalc-msg').textContent=e.message; }
      });
  }; }
  app.querySelectorAll('.duty-seg-select').forEach(sel => sel.onchange = async () => {
    const duty = sel.dataset.duty;
    try{
      await api('/duty-map/'+encodeURIComponent(duty), { method:'PATCH', body:{ seg: sel.value } });
      $('#duty-msg').textContent = `「${duty}」を更新しました`;
    }catch(e){ $('#duty-msg').textContent = e.message; }
  });
  app.querySelectorAll('.duty-del').forEach(b => b.onclick = async () => {
    const duty = b.dataset.duty;
    if(!confirm(`「${duty}」を対応表から削除します。以後この業務名は「対象外」として扱われます。よろしいですか？`)) return;
    await withLoading(b, async () => {
      try{
        await api('/duty-map/'+encodeURIComponent(duty), { method:'DELETE' });
        popup('削除しました'); pageAdminSettings(app);
      }catch(e){ popup(e.message,'error'); }
    });
  });
  { const da = $('#duty-add'); if(da) da.onclick = async () => {
      const duty = $('#duty-new-name').value.trim();
      const seg = $('#duty-new-seg').value;
      if(!duty){ $('#duty-msg').textContent = '業務名を入力してください'; return; }
      await withLoading(da, async () => {
        try{
          await api('/duty-map', { method:'POST', body:{ duty, seg } });
          popup('追加しました'); pageAdminSettings(app);
        }catch(e){ $('#duty-msg').textContent = e.message; }
      });
  }; }
  { const ns = $('#nt-save'); if(ns) ns.onclick = async () => {
      const enabled = $('#nt-enabled').checked;
      const hour = Number($('#nt-hour').value);
      const target = $('#nt-target').value;
      $('#nt-msg').textContent='保存中…';
      await withLoading(ns, async () => {
        try{ const r=await api('/notify-settings',{method:'PUT',body:{enabled,hour,target}});
          $('#nt-msg').textContent = r.enabled ? `毎日 ${String(r.hour).padStart(2,'0')}:00 に送信` : '通知オフ';
          popup('通知設定を保存しました'); }
        catch(e){ $('#nt-msg').textContent=e.message; }
      });
  }; }
  { const nt = $('#nt-test'); if(nt) nt.onclick = async () => {
      $('#nt-msg').textContent='送信中…';
      await withLoading(nt, async () => {
        try{ await api('/notify-test',{method:'POST'}); $('#nt-msg').textContent='テスト通知を送りました(画面上部の通知アイコンを確認)'; popup('テスト通知を送信しました。画面上部の通知アイコンを確認してください'); }
        catch(e){ $('#nt-msg').textContent=e.message; }
      });
  }; }
  { const nr = $('#nt-run-now'); if(nr) nr.onclick = async () => {
      $('#nt-msg').textContent='送信中…';
      await withLoading(nr, async () => {
        try{
          const r = await api('/notify-run-now',{method:'POST'});
          if(r.sent > 0){ $('#nt-msg').textContent = `${r.sent}人に送信しました`; popup(`${r.sent}人に本日分のリマインドを送信しました`); }
          else { $('#nt-msg').textContent = r.reason || '送信対象がいませんでした'; popup(r.reason || '送信対象がいませんでした(既に送信済み、または対象者0人)'); }
        }
        catch(e){ $('#nt-msg').textContent=e.message; popup(e.message,'error'); }
      });
  }; }

  $('#pin-save').onclick = async () => {
    const v = $('#pin-new').value.trim();
    if(!confirm(`手配者専用パスワードを「${v}」に変更しますか?`)) return;
    await withLoading($('#pin-save'), async () => {
      try{
        await api('/settings/handler-pin', { method:'POST', body:{ pin:v } });
        $('#pin-now').textContent = v; $('#pin-new').value='';
        $('#pin-msg').innerHTML = '<span class="msg ok">変更しました</span>';
      }catch(e){ $('#pin-msg').innerHTML = `<span class="msg err">${h(e.message)}</span>`; }
    });
  };
  $('#imp-copy').onclick = () => {
    const el = $('#imp-tok'); el.select();
    navigator.clipboard?.writeText(el.value).then(
      () => $('#imp-msg').innerHTML = '<span class="msg ok">コピーしました</span>',
      () => { try{ document.execCommand('copy'); $('#imp-msg').innerHTML='<span class="msg ok">コピーしました</span>'; }catch(_){} }
    );
  };
  $('#imp-regen').onclick = async () => {
    if(!confirm('取り込みトークンを再発行しますか?古いトークンは使えなくなります(シート側のスクリプトの貼り替えが必要です)')) return;
    await withLoading($('#imp-regen'), async () => {
      try{
        const d = await api('/settings/import-token', { method:'POST' });
        $('#imp-tok').value = d.token;
        $('#imp-msg').innerHTML = '<span class="msg ok">再発行しました</span>';
      }catch(e){ $('#imp-msg').innerHTML = `<span class="msg err">${h(e.message)}</span>`; }
    });
  };
  app.querySelectorAll('.feat-select').forEach(sel => sel.onchange = async () => {
    const key = sel.dataset.key;
    const status = sel.value;
    try{
      await api('/settings/feature-status', { method:'POST', body:{ key, status } });
      featureStatus[key] = status;
      const tagCls = status==='ready' ? 'checked' : status==='maintenance' ? 'pending' : 'suspended';
      const tagText = status==='ready' ? `${icon('circleFilled',{size:'10px'})} 公開中` : status==='maintenance' ? `${icon('construction',{size:'10px'})} メンテナンス中` : `${icon('clock',{size:'10px'})} 準備中`;
      const st = $(`#feat-status-${key}`);
      st.className = `tag ${tagCls}`;
      st.innerHTML = tagText;
      popup('変更しました');
    }catch(e){ popup(e.message,'error'); }
  });
  $('#maint-toggle').onclick = async () => {
    const nextEnable = !maintenance.enabled;
    const msg = nextEnable
      ? '管理者以外の全員を今すぐ強制ログアウトし、メンテナンスを終了するまでログインできなくします。よろしいですか?'
      : 'メンテナンスを終了し、全員が通常通りログインできるようにします。よろしいですか?';
    if(!confirm(msg)) return;
    await withLoading($('#maint-toggle'), async () => {
      try{
        const r = await api('/settings/maintenance', { method:'POST', body:{ enabled:nextEnable } });
        maintenance.enabled = r.enabled;
        $('#maint-status').className = `tag ${r.enabled?'pending':'checked'}`;
        $('#maint-status').innerHTML = r.enabled ? `${icon('construction',{size:'10px'})} メンテナンス中` : `${icon('circleFilled',{size:'10px'})} 通常稼働中`;
        $('#maint-toggle').className = `btn ${r.enabled?'gold':'danger'}`;
        $('#maint-toggle').textContent = r.enabled ? 'メンテナンスを終了する' : 'メンテナンスを開始する(全員強制ログアウト)';
        $('#maint-msg').textContent = r.enabled ? `メンテナンスを開始しました(${r.loggedOut}人を強制ログアウトしました)` : 'メンテナンスを終了しました';
        popup(r.enabled ? 'メンテナンスモードを有効にしました' : 'メンテナンスモードを解除しました');
      }catch(e){ $('#maint-msg').textContent = e.message; }
    });
  };
}

/* ===== パスワード変更 ===== */
function pagePassword(app){
  app.innerHTML = `
  <h2>パスワード変更</h2>
  <div class="card"><div class="form-grid">
    <label>現在のパスワード</label><input type="password" id="p-old">
    <label>新しいパスワード</label><input type="password" id="p-new">
    <label>新しいパスワード(確認)</label><input type="password" id="p-new2">
  </div>
  <div class="row" style="margin-top:16px"><button class="btn gold" id="p-save">変更する</button><span id="p-msg"></span></div></div>`;
  $('#p-save').onclick = async () => {
    if($('#p-new').value !== $('#p-new2').value){ $('#p-msg').innerHTML='<span class="msg err">確認用パスワードが一致しません</span>'; return; }
    await withLoading($('#p-save'), async () => {
      try{
        await api('/password',{method:'POST',body:{oldpw:$('#p-old').value,newpw:$('#p-new').value}});
        $('#p-msg').innerHTML='<span class="msg ok">変更しました</span>';
        $('#p-old').value=$('#p-new').value=$('#p-new2').value='';
      }catch(e){ $('#p-msg').innerHTML=`<span class="msg err">${h(e.message)}</span>`; }
    });
  };
}
