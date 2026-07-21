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
  stadium:'<ellipse cx="12" cy="12" rx="9" ry="6"/><ellipse cx="12" cy="12" rx="4" ry="2.5"/>',
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
  arrowRight:'<path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
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
};
// icon('home')のように呼び、絵文字の代わりに使える線画SVGを返す。sizeとcolorは省略可(currentColorを継承)
function icon(name, opt={}){
  const size = opt.size || '1em';
  const path = ICONS[name];
  if(!path) return '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${opt.strokeWidth||2}" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-.15em;flex:none" aria-hidden="true">${path}</svg>`;
}
// <input type="time">はHH:MM(2桁ゼロ埋め)でないと値を認識しないため、DBの値をこの形式に正規化する
const timeInputVal = t => { const m = String(t||'').match(/^(\d{1,2}):(\d{2})$/); return m ? `${m[1].padStart(2,'0')}:${m[2]}` : ''; };
const pad = n => String(n).padStart(2, '0');
const WD = ['日','月','火','水','木','金','土'];
const ROLE_JP = { admin:'チーフ(管理者)', handler:'チーフ(手配者)', chief:'チーフ', member:'メンツ' };
function roleLabel(u){ if(u && u.suspended) return (u.role==='member'?'メンツ':'チーフ')+'(アカウント停止)'; return ROLE_JP[u.role]||u.role; }
const LV = { member:0, chief:1, handler:2, admin:3 };
// 個別追加権限の基準レベル(バックエンドのPERMSと対応)
const PERM_BASE_LV = { report_check:1, blacklist_manage:1, summary_view:1, day_schedule_view:1, member_stats_view:1, sites_view:1, members_view:1, site_pay:2, site_manage:2, import_data:2, handler_tools:2, wage_settings:3, account_manage:3, daicho_manage:3 };
// has(key): MEがその機能を使えるか(基本権限を満たす、または個別に追加権限がある)
function has(key){
  if(!ME) return false;
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
// 追記し、CURRENT_UPDATE_VERSION(この下)をインクリメントする。過去の項目はそのまま残しておいてよい
// (各ユーザーは自分がまだ見ていないバージョン分の項目だけを見るため、勝手に重複表示されることはない)。
const CURRENT_UPDATE_VERSION = 2;
const UPDATE_ITEMS = [
  { v:1, icon:'🏠', title:'ホーム画面を追加', desc:'ログイン後、今日・明日の現場や通知が一目で見られるようになりました。', show: () => true },
  { v:1, icon:'🙋', title:'休み希望・稼働時間の提出', desc:'マイスケジュールから、休み希望や「この時間なら動ける」を手配担当者に伝えられます。', show: () => true },
  { v:1, icon:'👤', title:'メンバーを希望する機能', desc:'チーフ以上が「この現場にこの人が欲しい」と指名し、手配担当者の承認で反映できます。', show: () => LV[ME.role] >= 1 },
  { v:1, icon:'📊', title:'稼働サマリーを強化', desc:'「同じ現場ばかり任されている人」を自動で検知するようになりました。', show: () => LV[ME.role] >= 1 },
  { v:1, icon:'📅', title:'Googleカレンダー連携', desc:'自分のスケジュールを普段使いのカレンダーアプリに自動反映できます。', link:'#/calendar-guide', linkLabel:'やり方を見る', show: () => true },
  { v:2, icon:'📊', title:'稼働サマリーをリニューアル', desc:'月100時間超・6連勤以上・同じ現場ばかりなど、気になる状況をひと目で確認できるようになりました。並び替えも自由に変更できます。', show: () => LV[ME.role] >= 1 },
  { v:2, icon:'🗂️', title:'スケジュール一覧を追加', desc:'全メンバーの1週間分の予定を、チーフ予定表のような一覧(日付×人のマトリックス表)で確認できます。', show: () => LV[ME.role] >= 1 },
  { v:2, icon:'📈', title:'メンバー分析を追加', desc:'拠点・課・班・ランクの構成を、全体・課ごとにリアルタイムで確認できます。手配担当ごとの内訳も見られます。', show: () => LV[ME.role] >= 1 },
  { v:2, icon:'🏠', title:'ホーム画面を自由にカスタマイズ', desc:'ホーム画面の「編集」から、ショートカットの並び替え・非表示・追加ができるようになりました(iPhoneのホーム画面のような感覚で使えます)。', show: () => true },
];
// 機能公開設定の対象画面。バックエンドのFEATURE_KEYSと必ず一致させる。
// 新しい画面を追加したら、ここと src/index.js の FEATURE_KEYS の両方に追記する。
const FEATURE_LABELS = {
  'edit': '✏️ スケジュール入力',
  'self-reports': '📮 現場変更報告の承認',
  'availability': '🙋 休み希望・稼働時間の提出',
  'availability-team': '🗓️ チームの希望一覧',
  'nominate': '👤 メンバーを希望する',
  'nominations': '✅ メンバー指名の承認',
  'sites': '🏟️ 現場一覧',
  'members': '👥 メンバー一覧',
  'summary': '📊 稼働サマリー',
  'member-stats': '📈 メンバー分析',
  'day-schedule': '🗂️ スケジュール一覧',
  'report': '📝 新人報告',
  'reports': '📋 報告一覧',
  'draft': '⭐ ドラフト',
  'blacklist': '🚫 ブラックリスト',
  'report-export': '📎 スプレッドシート貼り付け用コピー',
  'admin': '🔐 アカウント管理',
  'admin-settings': '🔧 システム設定',
  'role-permissions': '🛡️ 権限の一括設定',
  'handler-status': '🟢 ログイン中・編集履歴',
  'import': '📥 スプレッドシート取り込み',
  'sched-sources': '📡 予定表ソース管理',
  'daicho': '📦 台帳保管',
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
function renderFeatureBlocked(app, status, label){
  const msg = status === 'maintenance'
    ? 'この機能は現在メンテナンス中です。<br>しばらくしてから再度お試しください。'
    : 'この機能は現在準備中です。<br>もうしばらくお待ちください。';
  app.innerHTML = `<h2>${h(label)}</h2><div class="card"><div class="muted" style="text-align:center;padding:30px 0">${msg}</div></div>`;
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
      <button class="btn ghost xs" id="dv-export">📥 Excel(CSV)でダウンロード</button>
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
      headers: { 'content-type':'application/json', ...(TOKEN ? { authorization:'Bearer '+TOKEN } : {}) },
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
function logoutLocal(){ TOKEN=''; ME=null; localStorage.removeItem('tk'); location.hash='#/login'; render(); }
function clearTimers(){ timers.forEach(clearInterval); timers=[]; }
function shiftMonth(m, d){ const [y,mm]=m.split('-').map(Number); const dt=new Date(y, mm-1+d, 1); return dt.getFullYear()+'-'+pad(dt.getMonth()+1); }
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
  $('#modal-layer').innerHTML = `<div class="modal-bg"><div class="modal"><button class="close-x">✕</button>${html}</div></div>`;
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

// 保存・更新などの完了をOKボタン付きポップアップで知らせる
function popup(message, kind){
  const isError = kind==='error';
  const iconHtml = isError
    ? `<div class="popup-icon popup-shake" style="color:#b23b3b">⚠️</div>`
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
      <div class="cf-title">⚠️ コンフリクトを検知しました</div>
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
    it.v > (ME.seenUpdateVersion || 0) && it.v <= CURRENT_UPDATE_VERSION && (!it.show || it.show())
  );
  const markSeen = async () => {
    ME.needsUpdateNotice = false;
    ME.seenUpdateVersion = CURRENT_UPDATE_VERSION;
    try{ await api('/update-notice/seen', { method:'POST' }); }catch(e){}
  };
  if(!items.length){ markSeen(); return; } // 表示すべき新項目が無ければ、既読化だけして何も出さない
  modal(`<h3>🎉 アップデートのお知らせ</h3>
    <div class="upd-list">
      ${items.map((it,i) => `<div class="upd-item"><span class="upd-icon">${it.icon}</span><div><b>${h(it.title)}</b><div class="muted">${h(it.desc)}${it.link?` <a href="${h(it.link)}" class="upd-link" data-idx="${i}">${h(it.linkLabel||'見る')}</a>`:''}</div></div></div>`).join('')}
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
      `<div class="upd-item"><span class="upd-icon">${it.icon}</span><div><b>${h(it.title)}</b><div class="muted">${h(it.desc)}</div></div></div>`
    ).join('') + (hiddenCount > 0 ? `<div class="upd-item"><span class="upd-icon">🔧</span><div><b>細かな修正・改善</b></div></div>` : '');
    const isLatest = v === CURRENT_UPDATE_VERSION;
    return `<div class="card" style="margin-bottom:14px">
      <h3 style="margin-bottom:10px">v${v}${isLatest?' <span class="tag checked">最新</span>':''}</h3>
      <div class="upd-list">${itemsHtml || '<div class="muted">細かな修正・改善</div>'}</div>
    </div>`;
  }).join('');
  app.innerHTML = `
    <h2 style="margin-bottom:4px">📜 バージョン履歴</h2>
    <div class="muted" style="margin-bottom:16px">現在のバージョン: <b>v${CURRENT_UPDATE_VERSION}</b></div>
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
  const list = await api(`/site-members?date=${date}&site=${encodeURIComponent(site)}`);
  // 休憩時間の合計(チーフ以上に公開。6h超45分/8h超60分の目安に届いていない場合だけ軽く表示)
  const breaksArr = canViewSched ? await api(`/site-record-breaks?date=${date}&site=${encodeURIComponent(site)}`).catch(()=>[]) : [];
  const breakByUid = {}; breaksArr.forEach(b => breakByUid[b.uid] = b);
  const venue = (list.find(p => p.venue) || {}).venue || '';
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
    const label = b.short ? `⚠️${b.breakMinutes}/${b.requiredMinutes}分` : `休憩${b.breakMinutes}分`;
    const tip = b.short ? `休憩不足の目安: ${b.breakMinutes}分(必要${b.requiredMinutes}分以上)` : `休憩${b.breakMinutes}分`;
    return `<span class="break-tag ${cls}" title="${h(tip)}">${label}</span>`;
  };
  const card = p => `<div class="dcard ka-${p.ka==='1課'?'1':'2'} ${editable?'sm-edit':''}" ${editable?`data-uid="${p.uid}"`:''}>
    <div class="dcard-head"><span class="dcard-title">${nameHtml(p)} ${kaTag(p)}</span><span class="tag ${p.role}">${roleLabel(p)}</span></div>
    <div class="drow"><span class="dk">ランク/班</span><span class="dv">${h(p.rank)||'—'} / ${h(p.han)||'—'}</span></div>
    ${canPay&&(p.tin||p.tout)?`<div class="drow"><span class="dk">IN/OUT</span><span class="dv">${h(p.tin)}〜${h(p.tout)}</span></div>`:''}
    ${breakHtml(p)?`<div class="drow"><span class="dk">休憩</span><span class="dv">${breakHtml(p)}</span></div>`:''}
    ${p.note?`<div class="drow"><span class="dk">備考</span><span class="dv">${h(p.note)}</span></div>`:''}
    ${editable?'<div class="sm-edit-hint">タップして編集 ✏️</div>':''}
  </div>`;
  const row = p => `<tr class="ka-row-${p.ka==='1課'?'1':'2'} ${editable?'sm-edit':''}" ${editable?`data-uid="${p.uid}"`:''}><td style="white-space:nowrap">${nameHtml(p)} ${kaTag(p)}</td><td style="white-space:nowrap"><span class="tag ${p.role}">${roleLabel(p)}</span></td><td style="white-space:nowrap">${h(p.rank)}</td><td style="white-space:nowrap">${h(p.han)}</td>${canPay?`<td style="white-space:nowrap">${h(p.tin)}</td><td style="white-space:nowrap">${h(p.tout)}</td>`:''}<td style="white-space:nowrap">${breakHtml(p)||''}</td><td style="min-width:150px">${h(p.note)}</td>${editable?'<td class="sm-edit-cell">✏️</td>':''}</tr>`;
  const tbl = arr => `<table class="list pc-only"><tr><th>氏名</th><th>役割</th><th>ランク</th><th>班</th>${canPay?'<th>IN</th><th>OUT</th>':''}<th>休憩</th><th>備考</th>${editable?'<th></th>':''}</tr>${arr.map(row).join('')}</table>
    <div class="cards sp-only">${arr.map(card).join('')}</div>`;
  modal(`<h3>現場情報</h3>
    <dl class="kv">
      <dt>現場名</dt><dd><b>${h(site)}</b></dd>
      <dt>会場</dt><dd>${venue ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}" target="_blank">${h(venue)}</a>` : '<span class="muted">未登録</span>'}</dd>
      ${loadEnd?`<dt>搬入終了</dt><dd>${h(loadEnd)}</dd>`:''}
      ${showEnd?`<dt>終演</dt><dd>${h(showEnd)}</dd>`:''}
      <dt>日付</dt><dd>${h(date)}</dd>
      <dt>人数</dt><dd>チーフ・手配 ${chiefs.length}名 / メンツ ${members.length}名(計${list.length}名)</dd>
    </dl>
    ${list.length ? `
      <div class="section-label" style="margin-top:6px">チーフ・手配チーム</div>
      ${chiefs.length ? tbl(chiefs) : '<div class="muted" style="padding:4px 2px">登録されていません</div>'}
      <div class="section-label" style="margin-top:12px">メンツ</div>
      ${members.length ? tbl(members) : '<div class="muted" style="padding:4px 2px">登録されていません</div>'}
    ` : '<div class="muted">この日・この現場に入っているメンバーはいません</div>'}
    ${canAdd ? `<div id="site-add-wrap" style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn gold" id="site-add-btn">＋ メンバーを追加</button>
      ${list.length?`<button class="btn ghost" id="site-edit-btn">✏️ 全員まとめて一括編集</button>`:''}
    </div>` : ''}`);
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

// 現場記録(配置・休憩時間・自由記入欄)。本人と管理者のみ閲覧・編集可。育成計画・備考もあわせて表示。
async function openSiteRecord(uid, uname, date, site){
  let data;
  try{ data = await api(`/site-record?uid=${uid}&date=${date}&site=${encodeURIComponent(site)}`); }
  catch(e){ popup(e.message,'error'); return; }

  const breakRow = (b={}, i=0) => `<div class="sr-break" data-i="${i}">
    <input type="time" class="sr-break-start" value="${timeInputVal(b.start)}">
    <span class="sr-break-sep">〜</span>
    <input type="time" class="sr-break-end" value="${timeInputVal(b.end)}">
    <button class="btn ghost xs sr-break-del" type="button">✕</button>
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
    try{
      await api('/site-record', { method:'PUT', body:{ uid, date, site, placement: $('#sr-placement').value, breaks, memo: $('#sr-memo').value } });
      closeModal(); popup('現場記録を保存しました');
    }catch(e){ popup(e.message,'error'); }
  };
}

// 現場の既存メンバーを一括編集(IN/OUT/会場/備考をまとめて変更、個別に外す)
async function openSiteBulkEdit(date, site, venue, list){
  const def = { tin:(list.find(p=>p.tin)||{}).tin||'', tout:(list.find(p=>p.tout)||{}).tout||'' };
  modal(`<h3>既存メンバーを一括編集</h3>
    <div class="muted" style="margin-bottom:8px"><b>${h(site)}</b>${venue?` / ${h(venue)}`:''} / ${h(date)}</div>
    <div class="be-note muted" style="margin-bottom:10px">空欄の項目は変更しません。チェックを外した人はこの現場から削除します。</div>
    <div class="form-grid" style="grid-template-columns:70px 1fr;max-width:420px">
      <label>現場名</label><input id="be-site" value="${h(site)}" placeholder="変更する場合のみ">
      <label>会場</label><input id="be-venue" value="${h(venue)}" placeholder="変更する場合のみ">
      <label>IN</label><input id="be-in" value="${h(def.tin)}" placeholder="例:9:00(全員に適用)">
      <label>OUT</label><input id="be-out" value="${h(def.tout)}" placeholder="例:18:00(全員に適用)">
    </div>
    <div class="section-label" style="margin-top:12px">対象メンバー(${list.length}名)</div>
    <div id="be-list" style="max-height:46vh;overflow:auto;margin-top:6px">
      ${list.map((p,i)=>`<label class="be-item ka-${p.ka==='1課'?'1':'2'}" style="display:flex;align-items:center;gap:8px;padding:7px 8px;border:1px solid var(--line);border-radius:8px;margin-bottom:6px">
        <input type="checkbox" class="be-chk" data-uid="${p.uid}" checked>
        <span style="flex:1"><b>${h(p.name)}</b> ${p.ka?`<span class="ka-pill ka-${p.ka==='1課'?'1':'2'}">${p.ka}</span>`:''} <span class="muted">${h(p.rank)} ${h(p.han)}</span></span>
        <span class="muted" style="font-size:12px">${h(p.tin)||'—'}〜${h(p.tout)||'—'}</span>
      </label>`).join('')}
    </div>
    <div class="row" style="margin-top:14px"><button class="btn gold" id="be-save" style="flex:1">変更を保存</button></div>`);
  $('#be-save').onclick = async () => {
    const siteNew=$('#be-site').value.trim();
    const venueNew=$('#be-venue').value.trim(), tin=$('#be-in').value.trim(), tout=$('#be-out').value.trim();
    const keep=[], remove=[];
    document.querySelectorAll('.be-chk').forEach(c=>{ (c.checked?keep:remove).push(Number(c.dataset.uid)); });
    if(!siteNew){ popup('現場名は空にできません','error'); return; }
    try{
      const r = await api('/site-edit',{method:'PUT',body:{ date, site, keepUids:keep, removeUids:remove,
        newSite:siteNew, venue:venueNew, tin, tout }});
      closeModal();
      popup(`${r.updated||0}名を更新${r.removed?` / ${r.removed}名を削除`:''}しました。`);
      if(typeof pageSites==='function' && location.hash.startsWith('#/sites')){ const app=document.getElementById('app'); pageSites(app); }
      else render();
    }catch(e){ popup(e.message,'error'); }
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
      <div class="bulk-chips" style="margin-top:6px">${a.dates.map((d,di)=>`<span class="chip">${d}<button data-ai="${ai}" data-di="${di}">✕</button></span>`).join('')||'<span class="muted">日付未選択</span>'}</div>
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
// (ベル・ドロップダウン自体の内側クリックは、それぞれ個別のonclickで処理されるので対象外)
document.addEventListener('click', (e) => {
  const dd = document.getElementById('dd');
  const bell = document.getElementById('bell');
  if(dd && dd.innerHTML && bell && !dd.contains(e.target) && !bell.contains(e.target)){
    dd.innerHTML = '';
  }
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
    else if(hash === '#/availability') await pageAvailability(app);
    else if(hash === '#/availability-team') await pageAvailabilityTeam(app);
    else if(hash === '#/nominate') await pageNominate(app);
    else if(hash === '#/nominations') await pageNominationsApprove(app);
    else if(hash.startsWith('#/schedule')) await pageSchedule(app, hash);
    else if(hash === '#/members') await pageMembers(app);
    else if(hash === '#/sites') await pageSites(app);
    else if(hash === '#/day-schedule') await pageDaySchedule(app);
    else if(hash === '#/summary') await pageSummary(app);
    else if(hash === '#/member-stats') await pageMemberStats(app);
    else if(hash === '#/edit') await pageEdit(app);
    else if(hash.startsWith('#/edit/')) await pageEdit(app, hash.slice('#/edit/'.length));
    else if(hash === '#/members/mine'){ const st0 = PAGE_STATE.members || (PAGE_STATE.members = { tab:'2課', q:'', mgr:'' }); st0.mgr = String(ME.id); await pageMembers(app); }
    else if(hash === '#/report') pageReportForm(app);
    else if(hash === '#/reports') await pageReports(app);
    else if(hash === '#/draft') await pageDraft(app);
    else if(hash === '#/blacklist') await pageBlacklist(app);
    else if(hash === '#/report-export') await pageReportExport(app);
    else if(hash === '#/import') await pageImport(app);
    else if(hash === '#/handler-status') await pageHandlerStatus(app);
    else if(hash === '#/self-reports') await pageSelfReports(app);
    else if(hash === '#/admin') await pageAdmin(app);
    else if(hash === '#/admin-settings') await pageAdminSettings(app);
    else if(hash === '#/daicho') await pageDaicho(app);
    else if(hash === '#/sched-sources') await pageSchedSources(app);
    else if(hash.startsWith('#/permissions/')) await pagePermissions(app, hash);
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
    <button class="btn ghost sm" id="l-refresh" style="width:100%;margin-top:14px">🔄 最新版に更新(表示がおかしい時)</button>
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
  const showSystemGroup = canAccountAdmin || canSystemSettings || canRolePerm || canHandlerStatus;
  const showSpreadGroup = canImport || canSchedSrc || canDaicho;
  const canSummaryView = has('summary_view');
  const canDayScheduleView = has('day_schedule_view');
  const canMemberStatsView = has('member_stats_view');
  const canSitesView = has('sites_view');
  const canMembersView = has('members_view');
  const showMemberGroup = isChief || canSummaryView || canDayScheduleView || canMemberStatsView || canMembersView;

  // ナビゲーション構造。children を持つ項目はグループ(タップでサブメニューに切り替わる)、
  // 持たない項目は単独ページへのリンク。権限がない機能は、グループ内の子としても一切出現しない
  // (グループ自体も、中身が1つも無ければ表示されない)。
  const nav = [
    { path:'#/home', icon:'home', label:'ホーム', show:true },
    { icon:'calendar', label:'スケジュール', show:true, children:[
      { path:'#/schedule', icon:'calendar', label:'マイスケジュール' },
      ...(canEdit ? [{ path:'#/edit', icon:'edit', label:'スケジュール入力' }] : []),
      ...(isHandlerRole ? [{ path:'#/self-reports', icon:'mail', label:'現場変更報告の承認' }] : []),
    ]},
    { icon:'handRaise', label:'希望', show:true, children:[
      { path:'#/availability', icon:'handRaise', label:'休み希望・稼働時間の提出' },
      ...(isHandlerRole ? [{ path:'#/availability-team', icon:'calendarDays', label:'チームの希望一覧' }] : []),
      ...(isChief ? [{ path:'#/nominate', icon:'user', label:'メンバーを希望する' }] : []),
      ...(isHandlerRole ? [{ path:'#/nominations', icon:'checkCircle', label:'メンバー指名の承認' }] : []),
    ]},
    { path:'#/sites', icon:'stadium', label:'現場一覧', show:canSitesView },
    { icon:'users', label:'メンバー', show:showMemberGroup, children:[
      ...(isHandlerRole ? [{ path:'#/members/mine', icon:'briefcase', label:`${ME.name}手配` }] : []),
      ...(canMembersView ? [{ path:'#/members', icon:'users', label:'メンバー一覧' }] : []),
      ...(canSummaryView ? [{ path:'#/summary', icon:'barChart', label:'稼働サマリー' }] : []),
      ...(canMemberStatsView ? [{ path:'#/member-stats', icon:'trendingUp', label:'メンバー分析' }] : []),
      ...(canDayScheduleView ? [{ path:'#/day-schedule', icon:'layoutGrid', label:'スケジュール一覧' }] : []),
    ]},
    { icon:'sparkles', label:'新人報告', show:true, children:[
      { path:'#/report', icon:'fileText', label:'新人報告' },
      { path:'#/reports', icon:'clipboardList', label:'報告一覧' },
      ...(canDraft ? [{ path:'#/draft', icon:'star', label:'ドラフト' }] : []),
      ...(canBlacklist ? [{ path:'#/blacklist', icon:'ban', label:'ブラックリスト' }] : []),
      ...(ME.role==='admin' ? [{ path:'#/report-export', icon:'paperclip', label:'スプレッドシート貼り付け用コピー' }] : []),
    ]},
    { icon:'settings', label:'システム管理', show: showSystemGroup, children:[
      ...(canAccountAdmin ? [{ path:'#/admin', icon:'shieldCheck', label:'アカウント管理' }] : []),
      ...(canSystemSettings ? [{ path:'#/admin-settings', icon:'wrench', label:'システム設定' }] : []),
      ...(canRolePerm ? [{ path:'#/role-permissions', icon:'shield', label:'権限の一括設定' }] : []),
      ...(canHandlerStatus ? [{ path:'#/handler-status', icon:'circleFilled', label:'ログイン中・編集履歴' }] : []),
    ]},
    { icon:'upload', label:'スプレッド読み込み', show: showSpreadGroup, children:[
      ...(canImport ? [{ path:'#/import', icon:'download', label:'スプレッドシート取り込み' }] : []),
      ...(canSchedSrc ? [{ path:'#/sched-sources', icon:'rss', label:'予定表ソース管理' }] : []),
      ...(canDaicho ? [{ path:'#/daicho', icon:'package', label:'台帳保管' }] : []),
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
  document.getElementById('root').innerHTML = `
  <header>
    <button class="menu-btn" id="menu-btn" aria-label="メニュー">☰</button>
    <div class="brand">RB事業2課<small>SCHEDULE</small></div>
    <div class="cur-page">${h(curName)}</div>
    <div class="hright">
      <button class="pin-btn ${ME.handler===1?'active':''}" id="pin-btn" title="${ME.handler===1?'手配者モードを終了':'手配者モードに入る'}">${ME.handler===1?'🔓':'🔑'}</button>
      <button class="bell" id="bell">🔔<span class="badge" id="bcount" style="display:none"></span></button>
      <span class="uname">${h(ME.name)}<br><span style="color:var(--gold)">${roleLabel(ME)}${ME.handler?'(手配モード)':''}</span></span>
    </div>
  </header>
  <main id="app"><div class="loading-box"><span class="spinner"></span>読み込み中…</div></main>
  <div id="dd"></div>
  <div id="menu-drawer"></div>`;

  const pinBtn = $('#pin-btn');
  if(pinBtn) pinBtn.onclick = async () => {
    if(ME.handler === 1){
      if(!confirm('手配者モードを終了しますか?')) return;
      await api('/handler-mode',{method:'DELETE'}); ME.handler=0; render();
    } else {
      openHandlerPin();
    }
  };

  const footerLinks = `
    <div class="drawer-sep"></div>
    <button type="button" class="drawer-link" data-go="#/password">🔑 パスワード変更</button>
    <button type="button" class="drawer-link" data-go="#/version-history">📜 バージョン履歴</button>
    <button type="button" class="drawer-link" id="dd-refresh">🔄 最新版に更新</button>
    <button type="button" class="drawer-link danger" id="dd-logout">↩️ ログアウト</button>`;

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
            return `<button type="button" class="drawer-link ${hashIs(hash, item.path)?'active':''}" data-go="${item.path}">${icon(item.icon)} ${h(item.label)}</button>`;
          }
          const isOpen = !!stMenu.open[i];
          return `<button type="button" class="drawer-link drawer-group" data-toggle="${i}">${icon(item.icon)} ${h(item.label)}<span class="drawer-arrow ${isOpen?'open':''}">›</span></button>
            <div class="drawer-sub ${isOpen?'':'collapsed'}">
              ${item.children.map(c => `<button type="button" class="drawer-link drawer-sublink ${hashIs(hash,c.path)?'active':''}" data-go="${c.path}">${icon(c.icon)} ${h(c.label)}</button>`).join('')}
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

  $('#bell').onclick = async () => {
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
  };
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
        <div class="row" style="margin-top:6px"><button class="btn ghost xs sh-undo" data-id="${x.id}" data-date="${h(x.date)}">↩️ この変更を取り消す</button></div>
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
  modal(`<h3>📅 カレンダー連携</h3><div class="loading-box"><span class="spinner"></span>読み込み中…</div>`);
  const render2 = async () => {
    let token = null;
    try{ const r = await api('/calendar-token'); token = r.token; }catch(e){}
    const box = document.querySelector('.modal');
    if(!box) return;
    if(!token){
      box.innerHTML = `<button class="close-x">✕</button><h3>📅 カレンダー連携</h3>
        <button class="btn gold" id="cs-start" style="width:100%">連携を開始する</button>`;
      $('#cs-start').onclick = async () => {
        try{ await api('/calendar-token', { method:'POST' }); render2(); }
        catch(e){ popup(e.message,'error'); }
      };
      box.querySelector('.close-x').onclick = closeModal;
      return;
    }
    const url = `${location.origin}/api/calendar/${token}.ics`;
    box.innerHTML = `<button class="close-x">✕</button><h3>📅 カレンダー連携</h3>
      <div class="row" style="gap:6px;margin-bottom:14px">
        <input id="cs-url" readonly value="${h(url)}" style="flex:1;min-width:0;font-family:monospace;font-size:12px">
        <button class="btn ghost sm" id="cs-copy">コピー</button>
      </div>
      <div class="muted" style="margin-bottom:14px;font-size:12.5px">
        <b>Googleカレンダーの場合:</b> 左メニュー「他のカレンダー」の＋ →「URLで追加」に、このURLを貼り付けてください。<br>
        <a href="#/calendar-guide" id="cs-guide-link">📖 画像付きの詳しいやり方を見る(Google/Outlook/Apple対応)</a>
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
      try{ await api('/calendar-token/regenerate', { method:'POST' }); popup('再発行しました'); render2(); }
      catch(e){ popup(e.message,'error'); }
    };
  };
  render2();
}

/* ===== ホーム画面(ログイン後の最初の画面) ===== */
/* ===== 休み希望・稼働可能時間の提出(本人用) ===== */
async function pageAvailability(app){
  app.innerHTML = '<h2>🙋 休み希望・稼働可能時間の提出</h2><div class="card"><div class="loading-box"><span class="spinner"></span>読み込み中…</div></div>';
  let rows;
  try{ rows = await api(`/availability?month=${MONTH}`); }
  catch(e){ app.innerHTML = `<h2>🙋 休み希望・稼働可能時間の提出</h2><div class="card"><div class="msg err">${h(e.message)}</div></div>`; return; }
  const byDate = {}; rows.forEach(r => byDate[r.date] = r);

  const [y, mo] = MONTH.split('-').map(Number);
  const days = new Date(y, mo, 0).getDate();
  const dateList = Array.from({length:days}, (_,i) => `${MONTH}-${pad(i+1)}`);
  const wd = d => '日月火水木金土'[new Date(d+'T00:00:00+09:00').getDay()];

  app.innerHTML = `
  <h2 style="margin-bottom:4px">🙋 休み希望・稼働可能時間の提出</h2>
  <div class="card" style="margin-bottom:14px">
    <div class="row" style="align-items:center;gap:10px">
      <button class="btn ghost sm" id="av-prev">◀</button>
      <div class="mtitle" style="margin:0">${y}年 ${mo}月</div>
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
}

/* ===== チームの休み希望・稼働可能時間の一覧(手配担当者向け) ===== */
async function pageAvailabilityTeam(app){
  if(LV[ME.role] < 2){ notFound(app); return; }
  app.innerHTML = '<h2>🙋 チームの希望一覧</h2><div class="card"><div class="loading-box"><span class="spinner"></span>読み込み中…</div></div>';
  let rows;
  try{ rows = await api(`/availability/team?month=${MONTH}`); }
  catch(e){ app.innerHTML = `<h2>🙋 チームの希望一覧</h2><div class="card"><div class="msg err">${h(e.message)}</div></div>`; return; }

  const byDate = {};
  rows.forEach(r => { (byDate[r.date] ||= []).push(r); });
  const dates = Object.keys(byDate).sort();
  const [y, mo] = MONTH.split('-').map(Number);
  const wd = d => '日月火水木金土'[new Date(d+'T00:00:00+09:00').getDay()];

  app.innerHTML = `
  <h2 style="margin-bottom:4px">🗓️ チームの希望一覧</h2>
  <div class="card" style="margin-bottom:14px">
    <div class="row" style="align-items:center;gap:10px">
      <button class="btn ghost sm" id="avt-prev">◀</button>
      <div class="mtitle" style="margin:0">${y}年 ${mo}月</div>
      <button class="btn ghost sm" id="avt-next">▶</button>
    </div>
  </div>
  ${dates.length ? dates.map(d => `<div class="card" style="margin-bottom:10px">
    <div style="font-weight:700;margin-bottom:8px">${h(d)} <span class="muted">(${wd(d)})</span></div>
    ${byDate[d].map(r => `<div class="drow">
      <span class="dk name-link" data-goto-uid="${r.user_id}">${h(r.user_name)}</span>
      <span class="dv">${r.type==='off' ? '🙅 休み希望' : `🙆 稼働可能 ${h(r.from_time||'?')}〜${h(r.to_time||'?')}${r.departure?`<span class="muted">(${h(r.departure)}発)</span>`:''}`}</span>
    </div>`).join('')}
  </div>`).join('') : '<div class="card"><div class="muted" style="text-align:center;padding:20px 0">この月の希望はまだ提出されていません</div></div>'}`;
  wireNameLinks(app);

  $('#avt-prev').onclick = () => { MONTH = shiftMonth(MONTH,-1); pageAvailabilityTeam(app); };
  $('#avt-next').onclick = () => { MONTH = shiftMonth(MONTH, 1); pageAvailabilityTeam(app); };
}

/* ===== メンバーを希望する(チーフ以上) ===== */
async function pageNominate(app){
  if(LV[ME.role] < 1){ notFound(app); return; }
  app.innerHTML = '<h2>🙋 メンバーを希望する</h2><div class="card"><div class="loading-box"><span class="spinner"></span>読み込み中…</div></div>';
  let schedData, users;
  try{
    [schedData, users] = await Promise.all([
      api(`/schedule?uid=${ME.id}&month=${MONTH}`),
      getUsers(true),
    ]);
  }catch(e){ app.innerHTML = `<h2>🙋 メンバーを希望する</h2><div class="card"><div class="msg err">${h(e.message)}</div></div>`; return; }

  const entries = (schedData && schedData.entries) || {};
  const mySites = [];
  Object.keys(entries).sort().forEach(d => {
    (entries[d]||[]).forEach(e => { if(e.type==='work') mySites.push({date:d, site:e.site, venue:e.venue}); });
  });
  const others = users.filter(u=>u.id!==ME.id).sort((a,b)=>(a.regno||'').localeCompare(b.regno||''));

  app.innerHTML = `
  <h2 style="margin-bottom:4px">🙋 メンバーを希望する</h2>
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
    try{
      await api('/site-nominations', { method:'POST', body:{ date:s.date, site:s.site, venue:s.venue, targetId:Number(targetId) } });
      popup('希望を送りました。手配担当者に通知が届きます');
      $('#nm-site').value=''; $('#nm-target').value='';
    }catch(e){ popup(e.message,'error'); }
  };
}

/* ===== メンバー指名の承認(手配担当者向け) ===== */
async function pageNominationsApprove(app){
  if(LV[ME.role] < 2){ notFound(app); return; }
  app.innerHTML = '<h2>🙋 メンバー指名の承認</h2><div class="card"><div class="loading-box"><span class="spinner"></span>読み込み中…</div></div>';
  let rows;
  try{ rows = await api('/site-nominations'); }
  catch(e){ app.innerHTML = `<h2>🙋 メンバー指名の承認</h2><div class="card"><div class="msg err">${h(e.message)}</div></div>`; return; }

  app.innerHTML = `
  <h2 style="margin-bottom:8px">🙋 メンバー指名の承認</h2>
  ${rows.length ? `
  <div class="row" id="sn-bulk-bar" style="margin-bottom:10px;gap:8px;align-items:center">
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
        <button class="btn gold sm sn-approve" data-id="${r.id}">✅ 承認する</button>
        <button class="btn danger sm sn-reject" data-id="${r.id}">❌ 見送る</button>
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
  <h2 style="margin-bottom:4px">📅 カレンダー連携のやり方</h2>

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
      <div class="cg-step-title">🟢 Googleカレンダーの場合</div>
      <div class="muted" style="margin-bottom:6px">⚠️ この設定は<b>パソコンのブラウザ</b>からのみ行えます(スマホアプリからは登録できません)。一度パソコンで登録すれば、以降はスマホのGoogleカレンダーアプリにも自動的に表示されます。</div>
      <ol class="cg-ol">
        <li>パソコンのブラウザで <a href="https://calendar.google.com" target="_blank" rel="noopener">Googleカレンダー</a> を開く</li>
        <li>画面左側「他のカレンダー」の横にある <b>＋</b> をクリック</li>
        <li>「<b>URLで追加</b>」を選択</li>
        <li>①で発行したURLを貼り付けて「<b>カレンダーを追加</b>」をクリック</li>
        <li>数分〜数時間後、左側の「他のカレンダー」に表示されます</li>
      </ol>
    </div>

    <div class="cg-step">
      <div class="cg-step-title">🔵 Outlookの場合</div>
      <ol class="cg-ol">
        <li>Outlook(Web版またはアプリ)を開く</li>
        <li>カレンダー画面で「<b>カレンダーの追加</b>」→「<b>インターネットから購読</b>」を選択</li>
        <li>①で発行したURLを貼り付けて「<b>インポート</b>」をクリック</li>
      </ol>
    </div>

    <div class="cg-step">
      <div class="cg-step-title">⚪ Apple カレンダー(iPhone/iPad)の場合</div>
      <ol class="cg-ol">
        <li>「設定」アプリを開く</li>
        <li>「<b>カレンダー</b>」→「<b>アカウント</b>」→「<b>アカウントを追加</b>」</li>
        <li>「<b>その他</b>」→「<b>購読カレンダーを追加</b>」</li>
        <li>①で発行したURLを貼り付けて「<b>次へ</b>」をタップ</li>
      </ol>
    </div>

    <div class="cg-step">
      <div class="cg-step-title">⚪ Apple カレンダー(Mac)の場合</div>
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
      try{ await api('/calendar-token/regenerate', { method:'POST' }); popup('再発行しました'); pageCalendarGuide(app); }
      catch(e){ popup(e.message,'error'); }
    };
  };
  const st = $('#cg-start');
  if(st) st.onclick = async () => {
    try{ await api('/calendar-token', { method:'POST' }); pageCalendarGuide(app); }
    catch(e){ popup(e.message,'error'); }
  };
  wireCopy();
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

  const allMenuItems = [
    ['#/schedule','calendar','マイスケジュール', true],
    ['#/availability','handRaise','休み希望', true],
    ['#/edit','edit','スケジュール入力', ME.handler===1],
    ['#/availability-team','calendarDays','チーム希望一覧', isHandlerRole],
    ['#/nominate','user','メンバー指名', isChief],
    ['#/nominations','checkCircle','指名の承認', isHandlerRole],
    ['#/sites','stadium','現場一覧', has('sites_view')],
    ['#/members/mine','briefcase',`${h(ME.name)}手配`, isHandlerRole],
    ['#/members','users','メンバー一覧', has('members_view')],
    ['#/summary','barChart','稼働サマリー', has('summary_view')],
    ['#/member-stats','trendingUp','メンバー分析', has('member_stats_view')],
    ['#/day-schedule','layoutGrid','スケジュール一覧', has('day_schedule_view')],
    ['#/self-reports','mail','変更報告承認', isHandlerRole],
    ['#/report','fileText','新人報告', true],
    ['#/reports','clipboardList','報告一覧', true],
    ['#/import','download','スプレッド取込', has('import_data')],
    ['#/admin','shieldCheck','アカウント管理', has('account_manage')],
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
        <a href="#/schedule" class="home-stat">
          <span class="home-stat-num">${unreadCount}</span><span class="home-stat-label">${icon('bell',{size:'13px'})} 未読の通知</span>
        </a>
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
      ${menuItems.map(([hash,iconName,label])=>`<a href="${homeEditing?'javascript:void(0)':hash}" class="home-menu-btn ${homeEditing?'editing':''}" data-hash="${hash}">
        ${homeEditing?`<button class="home-menu-remove" data-hash="${hash}" type="button">${icon('x',{size:'12px'})}</button>`:''}
        <span class="home-menu-icon">${icon(iconName,{size:'22px'})}</span><span>${h(label)}</span>
      </a>`).join('')}
      ${homeEditing?`<button class="home-menu-btn home-menu-add" id="home-menu-add-btn" type="button"><span class="home-menu-icon">${icon('plus',{size:'22px'})}</span><span>追加</span></button>`:''}
    </div>`;

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
  // 0へアニメーションさせることで、瞬間移動(ジャンプ)ではなく滑らかな移動に見せる
  const playFlip = (before) => {
    items().forEach(el => {
      if(el === dragEl) return;
      const b = before.get(el);
      if(!b) return;
      const a = el.getBoundingClientRect();
      const dx = b.left - a.left, dy = b.top - a.top;
      if(!dx && !dy) return;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px,${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = 'transform .32s cubic-bezier(.16,1,.3,1)';
        el.style.transform = '';
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
      setHomeOrder(items().map(x => x.dataset.hash));
      setTimeout(() => { el.style.transition = ''; el.style.animation = ''; }, 420);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
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
    return `<td class="plan-cell${longCls(pv,15)}" data-date="${date}" data-plan="${h(pv)}" title="${canPlan?'タップで育成計画を編集':''}">${h(pv)}${canPlan?' <span class="plan-edit">✎</span>':''}</td>`;
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
        const rk = (LV[ME.role]>=1 ? (rookieMap[date+'|'+e.site]||[]) : []).map(n=>`<span class="rookie-badge">🔰${h(n)}</span>`).join('');
        sites.push(`<span class="site-cell${longCls(e.site,10)}" data-date="${date}" data-site="${h(e.site)}" title="タップで同じ現場のメンバーを表示">${h(e.site)}${rk}</span>${canRecord?` <span class="rec-btn" data-date="${date}" data-site="${h(e.site)}" title="現場記録を記入${e.breakShort?'(休憩時間が目安に届いていません)':''}">📝${e.breakShort?'⚠️':''}</span>`:''}`);
        venues.push(`<span class="venue-cell${longCls(e.venue,12)}" data-venue="${h(e.venue)}" title="タップでGoogleマップ${(e.load_end||e.show_end)?` ／ 搬入終了${h(e.load_end)||'—'} ／ 終演${h(e.show_end)||'—'}`:''}">${h(e.venue)}</span>${(e.load_end||e.show_end)?`<span class="loadshow-tag" title="搬入終了${h(e.load_end)||'—'} ／ 終演${h(e.show_end)||'—'}">🕐</span>`:''}`);
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
          <div class="m-sitename${longCls(e.site,14)}"><span class="site-cell" data-date="${date}" data-site="${h(e.site)}">${h(e.site)}</span>${rk}${canRecord?` <span class="rec-btn" data-date="${date}" data-site="${h(e.site)}">📝記録${e.breakShort?' ⚠️':''}</span>`:''}</div>
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
    const planM = showPlan ? `<div class="m-line m-plan" data-date="${date}" data-plan="${h(planVal)}"><span class="m-k">育成</span><span class="m-v">${h(planVal)||'<span class="muted">（未入力）</span>'}${canPlan?' <span class="plan-edit">✎</span>':''}</span></div>` : '';
    mrows += `<div class="m-day ${mCls} ${date===today?'is-today':''}">
      <div class="m-date ${wdCls}"><span class="m-dnum">${i}</span><span class="m-dwd">${WD[w]}</span>${date===today?'<span class="today-pill">今日</span>':''}</div>
      <div class="m-content">${mBody}${planM}</div>
    </div>`;
  }

  const others = LV[ME.role]>=1 ? `<button class="btn ghost sm" id="pick-user">他のメンバーを見る ▾</button>` : '';
  const histBtn = LV[ME.role]>=2 ? `<button class="btn ghost sm" id="view-history">📝 変更履歴</button>` : '';
  const calSyncBtn = uid===ME.id ? `<button class="btn ghost sm" id="cal-sync">📅 カレンダー連携</button>` : '';
  app.innerHTML = `
  <h2>${h(u.name)} のスケジュール ${uid!==ME.id?'<span class="muted">(閲覧中)</span>':''}</h2>
  <div class="card">
    <div class="row" style="justify-content:space-between">
      <div class="month-nav">
        <button class="btn ghost sm" id="prev-m">◀</button>
        <div class="mtitle">${y}年 ${mo}月</div>
        <button class="btn ghost sm" id="next-m">▶</button>
      </div>
      <div class="muted">${h(u.regno)} / ${h(u.rank)} / ${h(u.han)} / ${h(u.station)}</div>
      ${others}
      ${histBtn}
      ${calSyncBtn}
    </div>
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

  </div>`;

  $('#prev-m').onclick = () => { MONTH = shiftMonth(MONTH,-1); render(); };
  $('#next-m').onclick = () => { MONTH = shiftMonth(MONTH, 1); render(); };
  const vh = $('#view-history');
  if(vh) vh.onclick = () => openScheduleHistory(uid, u.name);
  const cs = $('#cal-sync');
  if(cs) cs.onclick = () => openCalendarSync();
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
    app.querySelectorAll('.plan-cell, .m-plan').forEach(td => td.onclick = async (ev) => {
      ev.stopPropagation();
      const v = prompt(`${u.name} さん ${td.dataset.date} の育成計画`, td.dataset.plan || '');
      if(v==null) return;
      try{
        await api('/schedule-plan', { method:'PUT', body:{ uid, date: td.dataset.date, plan: v } });
        render();
      }catch(e){ alert(e.message); }
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
    hint.innerHTML='🛠 手配者モード:日付の行をタップ → この人のその日の現場を追加・編集できます';
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
    hint.innerHTML='💬 日付をタップ → 手配担当者以外から言われた現場変更を報告できます(自動で手配担当者に通知されます)';
    app.querySelector('.card').appendChild(hint);
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
      <button class="btn gold sm" id="sr-tab-report" style="flex:1">📢 現場変更を報告</button>
      <button class="btn ghost sm" id="sr-tab-avail" style="flex:1">🙋 休み希望・稼働時間</button>
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
      try{
        const r = await api('/schedule-self-report', { method:'POST', body:{ date:date2, toldBy, type, site, venue } });
        closeModal();
        popup(r.needsApproval ? '報告しました。手配担当者の承認後にスケジュールへ反映されます' : '報告しました。手配担当者に通知が届きます');
        render();
      }catch(e){ popup(e.message,'error'); }
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
      try{
        await api('/availability', { method:'PUT', body:{ date, type, fromTime, toTime, departure } });
        closeModal();
        popup('休み希望・稼働時間を保存しました');
      }catch(e){ popup(e.message,'error'); }
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
    try{
      let r = await api('/schedule',{method:'PUT',body:{uid,date,slots}});
      if(r.ok===0 && r.conflicts){
        if(!(await conflictModal(r.conflicts))) return;
        r = await api('/schedule',{method:'PUT',body:{uid,date,slots,force:true}});
      }
      closeModal(); popup(withWarnNote('保存しました', r));
      if(location.hash.startsWith('#/sites')){ pageSites(document.getElementById('app')); } else render();
    }catch(e){ popup(e.message,'error'); }
  };
  document.querySelectorAll('.md-status').forEach(b=>b.onclick = async () => {
    const t=b.dataset.t, lbl={ok:'1日OK',off:'休暇',paid:'有給',x:'×'}[t];
    try{
      await api('/schedule',{method:'PUT',body:{uid,date,slots:[{type:t}]}});
      closeModal(); popup(lbl+'に設定しました');
      if(location.hash.startsWith('#/sites')){ pageSites(document.getElementById('app')); } else render();
    }catch(e){ popup(e.message,'error'); }
  });
}

/* ===== 現場一覧(チーフ以上)===== */
async function pageSites(app){
  if(!has('sites_view')){ notFound(app); return; }
  const stSites = PAGE_STATE.sites || (PAGE_STATE.sites = { month: MONTH });
  const month = stSites.month;
  const sites = await api(`/sites?month=${month}`);
  // 日付ごとにグループ化
  const byDate = {};
  for(const s of sites){ (byDate[s.date] ||= []).push(s); }
  const dates = Object.keys(byDate).sort();
  const [y,mo] = month.split('-').map(Number);
  app.innerHTML = `
  <h2>現場一覧</h2>
  <div class="card">
    <div class="row" style="margin-bottom:12px;align-items:center">
      <button class="btn ghost sm" id="st-prev">◀</button>
      <b style="min-width:110px;text-align:center">${y}年 ${mo}月</b>
      <button class="btn ghost sm" id="st-next">▶</button>
      ${ME.handler===1 ? '<span class="muted" style="margin-left:auto">現場をタップ → メンバー確認・追加</span>' : '<span class="muted" style="margin-left:auto">現場をタップ → メンバー確認</span>'}
    </div>
    ${dates.length ? dates.map(date=>{
      const w = new Date(date.slice(0,4), Number(date.slice(5,7))-1, Number(date.slice(8,10))).getDay();
      return `<details class="st-day">
        <summary class="st-date ${w===0?'sun':w===6?'sat':''}">${Number(date.slice(8,10))}日(${WD[w]}) <span class="muted" style="font-weight:400;font-size:12px">(${byDate[date].length}件)</span></summary>
        <div class="st-sites">
          ${byDate[date].map(s=>`<button class="st-site" data-date="${s.date}" data-site="${h(s.site)}">
            <span class="st-site-name">${h(s.site)}</span>
            ${s.venue?`<span class="st-site-venue">${h(s.venue)}</span>`:''}
            <span class="st-site-cnt">${s.cnt}名</span>
            ${(s.rookieNames&&s.rookieNames.length)?`<span class="st-share rookie" title="新人報告あり:${s.rookieNames.map(h).join('、')}">🔰 ${s.rookieNames.length}</span>`:''}
            ${(s.blacklistNames&&s.blacklistNames.length)?`<span class="st-share blacklist" title="ブラックリスト登録あり:${s.blacklistNames.map(h).join('、')}">⚠️ ${s.blacklistNames.length}</span>`:''}
          </button>`).join('')}
        </div>
      </details>`;
    }).join('') : '<div class="muted" style="padding:20px 0;text-align:center">この月に登録された現場はありません</div>'}
  </div>`;
  $('#st-prev').onclick = () => { stSites.month = shiftMonth(month,-1); pageSites(app); };
  $('#st-next').onclick = () => { stSites.month = shiftMonth(month, 1); pageSites(app); };
  app.querySelectorAll('.st-site').forEach(b => b.onclick = () => openSiteModal(b.dataset.date, b.dataset.site));
}
// 開発中の機能ページを「準備中」として表示する共通ヘルパー。
// 管理者には、システム設定からON/OFFを切り替えられる旨のリンクも案内する。
async function renderFeaturePending(app, icon, title){
  app.innerHTML = `<h2>${icon} ${title}</h2><div class="card"><div class="muted" style="text-align:center;padding:30px 0">この機能は現在準備中です。<br>もうしばらくお待ちください。${has('account_manage')?'<br><br><a href="#/admin-settings">システム設定</a>から表示のON/OFFを切り替えられます。':''}</div></div>`;
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
  const listSortOptions = { regno:'登録番号順', workDays:'稼働日数順', shifts:'稼働数順', maxStreak:'連勤数順', ...(canPay?{hours:'時間順', overtime:'残業順'}:{}) };
  const listSort = listSortOptions[st.sort] ? st.sort : 'regno';
  if(listSort === 'regno') list = [...list].sort((a,b) => String(a.regno||'').localeCompare(String(b.regno||''), undefined, {numeric:true}));
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
  <div class="sum-head">
    <h2 style="margin-bottom:0">📊 稼働サマリー</h2>
    <div class="row" style="gap:8px;align-items:center">
      <button class="btn ghost sm" id="sum-prev">◀</button>
      <b>${y}年${mo}月</b>
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

  ${(st.stat||st.mgr) ? `<div class="sum-filter"><b>絞り込み中</b>${st.stat?` / ${({overtotal:'月100h超',streak:'6連勤以上',few:'稼働少なめ',samesite:'同じ現場ばかり',over:'残業50h+'})[st.stat]}`:''}${st.mgr?` / ${h((data.managers.find(m=>m.key===st.mgr)||{}).name||'')}`:''}<button class="sum-clear" id="sum-clear">✕ 解除</button></div>` : ''}

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
}
/* ===== スケジュール一覧(準備中) ===== */
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

  const statusInfo = {
    off:  { label:'休', cls:'cell-off' },
    x:    { label:'NG', cls:'cell-x' },
    ok:   { label:'OK', cls:'cell-ok' },
    paid: { label:'有', cls:'cell-paid' },
    none: { label:'', cls:'cell-none' },
  };
  const today = jstToday();
  const dateHead = data.dates.map(d => {
    const [,mo,da] = d.split('-').map(Number);
    const wd = new Date(d+'T00:00:00+09:00').getDay();
    return { d, mo, da, wd, isToday: d===today };
  });

  // 現場に入っている人は、そのセルをタップすると現場の詳細(メンバー一覧)を開ける。
  // 掛け持ちで複数現場ある場合は、最初の現場を開く。
  const cellHtml = (cell, isToday, date) => {
    const todayCls = isToday ? ' matrix-today' : '';
    if(cell.status === 'work'){
      const firstSite = (cell.sites && cell.sites[0]) || '';
      return `<td class="matrix-cell cell-work${todayCls} cell-site-link" title="${h(cell.detail)}" data-date="${date}" data-site="${h(firstSite)}">${h(cell.detail)}</td>`;
    }
    const info = statusInfo[cell.status] || statusInfo.none;
    return `<td class="matrix-cell ${info.cls}${todayCls}">${info.label}</td>`;
  };

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
  // ソート適用(登録番号は数値として、それ以外は日本語として比較する)
  list = [...list].sort((a,b) => {
    if(st.sort === 'regno') return String(a.regno||'').localeCompare(String(b.regno||''), undefined, {numeric:true});
    const av = a[st.sort] || '', bv = b[st.sort] || '';
    return String(av).localeCompare(String(bv), 'ja') || String(a.regno||'').localeCompare(String(b.regno||''), undefined, {numeric:true});
  });

  const opt = (val, label, cur) => `<option value="${h(val)}" ${cur===val?'selected':''}>${h(label)}</option>`;

  app.innerHTML = `
  <h2 style="margin-bottom:4px">🗂️ スケジュール一覧</h2>
  <div class="card" style="margin-bottom:14px">
    <div class="row" style="align-items:center;gap:10px">
      <button class="btn ghost sm" id="ds-prev">◀ 前の${st.days}日間</button>
      <b style="min-width:120px;text-align:center">${dateHead[0].mo}/${dateHead[0].da} 〜 ${dateHead[dateHead.length-1].mo}/${dateHead[dateHead.length-1].da}</b>
      <button class="btn ghost sm" id="ds-next">次の${st.days}日間 ▶</button>
      ${st.from!==today?'<button class="btn ghost sm" id="ds-today">今日に戻る</button>':''}
    </div>
  </div>
  <div class="card" style="margin-bottom:14px">
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
      ${(st.ka||st.han||st.mgr)?'<button class="btn ghost sm" id="ds-clear">✕ 絞り込み解除</button>':''}
    </div>
  </div>
  <div class="card" style="padding:0">
    <div class="sched-wrap">
      <table class="matrix-table">
        <tr>
          <th class="matrix-name-col">氏名</th>
          ${dateHead.map(dh=>`<th class="${dh.isToday?'matrix-today':''}">${dh.mo}/${dh.da}<br><span class="muted" style="font-weight:400">(${WD[dh.wd]})</span></th>`).join('')}
        </tr>
        ${list.map(r=>`<tr>
          <td class="matrix-name-col"><a href="#/schedule/${r.id}">${h(r.name)}</a><br><span class="muted" style="font-size:11px">${h(r.regno)} ${r.rank?h(r.rank)+'ランク':''}</span><br><span class="muted" style="font-size:10.5px">${h(r.managerName)}</span></td>
          ${r.days.map((cell,i)=>cellHtml(cell, dateHead[i].isToday, dateHead[i].d)).join('')}
        </tr>`).join('') || `<tr><td colspan="${st.days+1}" class="muted" style="text-align:center;padding:16px">該当するメンバーはいません</td></tr>`}
      </table>
    </div>
  </div>
  <div class="muted" style="margin-top:8px;font-size:12px">${list.length}人 表示中(全${data.rows.length}人)</div>`;

  $('#ds-prev').onclick = () => { st.from = shiftDate(st.from,-st.days); pageDaySchedule(app); };
  $('#ds-next').onclick = () => { st.from = shiftDate(st.from, st.days); pageDaySchedule(app); };
  const tb = $('#ds-today'); if(tb) tb.onclick = () => { st.from = jstToday(); pageDaySchedule(app); };
  $('#ds-sort').onchange = (e) => { st.sort = e.target.value; localStorage.setItem('ds-sort', st.sort); pageDaySchedule(app); };
  $('#ds-ka').onchange = (e) => { st.ka = e.target.value; pageDaySchedule(app); };
  $('#ds-han').onchange = (e) => { st.han = e.target.value; pageDaySchedule(app); };
  $('#ds-mgr').onchange = (e) => { st.mgr = e.target.value; pageDaySchedule(app); };
  const cb = $('#ds-clear'); if(cb) cb.onclick = () => { st.ka=''; st.han=''; st.mgr=''; pageDaySchedule(app); };
  app.querySelectorAll('.cell-site-link').forEach(td => td.onclick = () => {
    if(td.dataset.site) openSiteModal(td.dataset.date, td.dataset.site);
  });
}

/* ===== メンバー分析(準備中) ===== */
/* ===== メンバー分析(チーフ以上)。拠点・課・班・ランクの構成を、全体・課ごとの両方で確認できる。
   手配担当ごとの内訳(拠点・班・ランク)も見られる。カードをタップするとメンバー一覧に絞り込める。 ===== */
async function pageMemberStats(app){
  if(!has('member_stats_view')){ notFound(app); return; }
  const st = PAGE_STATE.memberStats || (PAGE_STATE.memberStats = { tab:'全体', filter:null, mgrOpen:null });
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
  <h2 style="margin-bottom:4px">📈 メンバー分析</h2>

  <div class="ka-tabs">
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
      <button class="btn ghost sm" id="ms-filter-clear">✕ フィルタ解除</button>
    </div>
    <div id="ms-filter-body"></div>
  </div>`;

  const renderFilterResult = () => {
    const box = $('#ms-filter-result');
    if(!st.filter){ box.style.display='none'; return; }
    box.style.display = '';
    const list = filteredMembers();
    const catLabels = { base:'拠点', ka:'課', han:'班', rank:'ランク', manager:'手配担当' };
    const displayValue = st.filter.category === 'manager' ? st.filter.label : st.filter.value;
    $('#ms-filter-title').textContent = `${catLabels[st.filter.category]}: ${displayValue} (${list.length}人)`;
    $('#ms-filter-body').innerHTML = `
      <table class="list pc-only">
        <tr><th>氏名</th><th>登録番号</th><th>ランク</th><th>拠点</th><th>課</th><th>班</th><th>手配担当</th><th></th></tr>
        ${list.map(m=>`<tr>
          <td>${h(m.name)}</td><td>${h(m.regno)}</td><td>${m.rank?h(m.rank)+'ランク':'—'}</td>
          <td>${h(m.base)||'—'}</td><td>${h(m.ka)||'—'}</td><td>${h(m.han)||'—'}</td><td>${h(m.managerName)||'—'}</td>
          <td class="nowrap">
            <button class="btn ghost xs ms-sched" data-id="${m.id}">📅予定</button>
            ${canEdit?`<button class="btn ghost xs ms-edit" data-id="${m.id}">✏️編集</button>`:''}
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
            <button class="btn ghost sm ms-sched" data-id="${m.id}">📅 予定を見る</button>
            ${canEdit?`<button class="btn ghost sm ms-edit" data-id="${m.id}">✏️ 編集</button>`:''}
          </div>
        </div>`).join('') || '<div class="muted">該当なし</div>'}
      </div>`;
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
  const st = PAGE_STATE.members || (PAGE_STATE.members = { tab:'2課', q:'', mgr:'' }); // 既定は2課(主に2課が使うため)
  const kaOf = u => u.ka || '未設定';
  const cnt2 = users.filter(u=>kaOf(u)==='2課').length;
  const cnt1 = users.filter(u=>kaOf(u)==='1課').length;
  const cntX = users.filter(u=>!u.ka).length;

  const isHandler = has('site_manage') || has('account_manage');
  const skillBtn = u => `<button class="btn ghost sm" data-skill="${u.id}">編集</button>`;
  const editBtn = u => isHandler
    ? `<button class="btn ghost sm" data-edit="${u.id}">✏️ 編集</button>`
    : `<button class="btn ghost sm" data-skill="${u.id}">できること編集</button>`;
  const schedBtn = (u,cls='gold') => `<button class="btn ${cls} sm go-sched" data-uid="${u.id}">📅 スケジュール</button>`;
  const goEditBtn = u => isHandler ? `<button class="btn ghost sm go-edit" data-uid="${u.id}">✏️ 現場入力</button>` : '';

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
    const list = users.filter(u=>inTab(u)&&matchQ(u)&&matchMgr(u));
    const area = $('#m-list-area'); if(!area) return;
    area.innerHTML = `
      <div class="muted" style="margin:2px 0 10px">${list.length}名 表示中</div>
      ${isHandler?`<div class="row" id="m-bulk-bar" style="margin:2px 0 10px;gap:8px;align-items:center">
        <span class="muted">選択中: <span id="m-sel-count">0</span>件</span>
        <button class="btn ghost sm" id="m-bulk-mgr" disabled>選択した人の手配担当を変更</button>
      </div>`:''}
      <div class="list-scroll pc-only">
      <table class="list ka-table ka-${tab==='1課'?'1':'2'}">
      <tr>${isHandler?'<th><input type="checkbox" id="m-check-all"></th>':''}<th>登録番号</th><th>氏名</th><th>役割</th><th>ランク</th><th>班</th><th>手配担当</th><th>最寄駅</th><th>できること</th><th></th></tr>
      ${list.map(u=>`<tr>
        ${isHandler?(u.id===ME.id?'<td></td>':`<td><input type="checkbox" class="m-check" data-id="${u.id}"></td>`):''}
        <td>${h(u.regno)}${baseFromRegno(u.regno)?` <span class="muted" style="font-size:11px">(${baseFromRegno(u.regno)})</span>`:''}</td><td><b class="name-link" data-goto-uid="${u.id}">${h(u.name)}</b></td>
        <td><span class="tag ${u.role}">${roleLabel(u)}</span></td>
        <td>${h(u.rank)}</td><td>${h(u.han)}</td><td>${h(managerName(u,users))}</td><td>${h(u.station)}</td>
        <td class="wrapcell">${h(u.skills)}</td>
        <td>${editBtn(u)} ${schedBtn(u,'ghost')} ${goEditBtn(u)}</td>
      </tr>`).join('') || `<tr><td colspan="${isHandler?9:8}" class="muted" style="text-align:center;padding:16px">該当するメンバーはいません</td></tr>`}
      </table>
      </div>
      <div class="cards sp-only">
      ${list.map(u=>`<div class="dcard ka-${kaOf(u)==='1課'?'1':'2'}">
        <div class="dcard-head">${isHandler&&u.id!==ME.id?`<input type="checkbox" class="m-check" data-id="${u.id}" style="margin-right:8px">`:''}<span class="dcard-title name-link" data-goto-uid="${u.id}">${h(u.name)}</span><span class="tag ${u.role}">${roleLabel(u)}</span></div>
        <div class="drow"><span class="dk">登録番号</span><span class="dv">${h(u.regno)}${baseFromRegno(u.regno)?` (${baseFromRegno(u.regno)})`:''}</span></div>
        <div class="drow"><span class="dk">ランク / 班</span><span class="dv">${h(u.rank)||'—'} / ${h(u.han)||'—'}</span></div>
        <div class="drow"><span class="dk">手配担当</span><span class="dv">${h(managerName(u,users))}</span></div>
        <div class="drow"><span class="dk">最寄駅</span><span class="dv">${h(u.station)||'—'}</span></div>
        <div class="drow"><span class="dk">できること</span><span class="dv">${h(u.skills)||'<span class="muted">（未設定）</span>'}</span></div>
        <div class="dcard-actions">
          ${editBtn(u)}
          ${schedBtn(u)}
          ${goEditBtn(u)}
        </div>
      </div>`).join('') || '<div class="muted" style="text-align:center;padding:16px">該当するメンバーはいません</div>'}
      </div>
`;
    wireNameLinks(area);
    area.querySelectorAll('.go-sched').forEach(b=>b.onclick=()=>{ location.hash='#/schedule/'+b.dataset.uid; });
    area.querySelectorAll('.go-edit').forEach(b=>b.onclick=()=>{
      const uid = b.dataset.uid;
      const proceed = () => { location.hash = '#/edit/' + uid; render(); };
      if(ME.handler !== 1 && ME.role !== 'admin'){ openHandlerPin(proceed); return; }
      proceed();
    });
    area.querySelectorAll('[data-skill]').forEach(b => b.onclick = async () => {
      const u = users.find(x=>x.id==b.dataset.skill);
      const v = prompt(`${u.name} のできることリスト(カンマ区切り)`, u.skills||'');
      if(v==null) return;
      await api('/users/'+u.id, { method:'PATCH', body:{ skills:v } });
      USERS_CACHE = null; render();
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
          try{
            const r = await api('/users/bulk-manager', { method:'POST', body:{ ids, manager_id: mgrId ? Number(mgrId) : null } });
            USERS_CACHE = null; closeModal(); popup(`${r.count}件の手配担当を変更しました`); render();
          }catch(e){ popup(e.message,'error'); }
        };
      };
    }
  };

  app.innerHTML = `
  <h2>メンバー一覧 <span class="ka-badge ka-${st.tab==='1課'?'1':'2'}">${st.tab}</span></h2>
  <div class="card">
    <div class="ka-tabs">
      <button class="ka-tab ka2 ${st.tab==='2課'?'on':''}" data-tab="2課">2課 (${cnt2}名)</button>
      <button class="ka-tab ka1 ${st.tab==='1課'?'on':''}" data-tab="1課">1課 (${cnt1}名)</button>
      ${cntX?`<button class="ka-tab ${st.tab==='未設定'?'on':''}" data-tab="未設定">未設定 (${cntX}名)</button>`:''}
    </div>
    <div class="filter-bar">
      <input id="m-search" class="search-input" placeholder="🔍 氏名・登録番号・班・駅で検索" value="${h(st.q)}">
      <select id="m-mgr" class="filter-select">
        <option value="">手配担当:すべて</option>
        ${managers.map(m=>`<option value="${m.id}" ${String(st.mgr)===String(m.id)?'selected':''}>${h(m.name)}手配</option>`).join('')}
        <option value="__chief" ${st.mgr==='__chief'?'selected':''}>チーフ手配</option>
      </select>
      <button class="btn ghost sm" id="m-clear" style="${(st.q||st.mgr)?'':'display:none'}">クリア</button>
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
    <button class="btn gold" id="ue-save" style="width:100%;margin-top:14px">保存する</button>
    `);
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
      <span><b>📋 複数人に一括登録</b>(同じ現場を、同じ手配担当の複数メンバーへ)</span>
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
          <div class="bulk-chips" style="margin-top:6px">${a.dates.map((d,di)=>`<span class="chip">${d}<button data-ai="${ai}" data-di="${di}">✕</button></span>`).join('')||'<span class="muted">日付未選択</span>'}</div>
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
    try{
      let r = await api('/schedule', { method:'PUT', body:{ uid, entries } });
      if(r.ok===0 && r.conflicts){
        if(!(await conflictModal(r.conflicts))){ return; }
        r = await api('/schedule', { method:'PUT', body:{ uid, entries, force:true } });
      }
      load();
      popup(withWarnNote('スケジュールを保存しました。', r));
    }catch(e){ popup(e.message, 'error'); }
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
    try{
      await api('/reports', { method:'POST', body });
      $('#r-cand').value=''; $('#r-fnote').value='';
      popup('新人報告を提出しました。チーフ全員に通知されます。');
    }catch(e){ popup(e.message, 'error'); }
  };
}

/* ===== 報告一覧・2次チェック ===== */
async function pageReports(app){
  const rows = await api('/reports');
  const acqBadge = ka => ka ? `<span class="tag acquired" title="既にアプリに登録済み">✅ ${h(ka)}獲得</span>` : '';
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
}

function openReport(r){
  const pending = r.status === 'pending';
  const canCheck = has('report_check'); // 2次チェックの記入・修正
  const canBlacklist = has('blacklist_manage'); // ブラックリスト登録
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
  ${canBlacklist ? `<div class="row" style="margin-top:14px"><button class="btn danger sm" id="bl-add">ブラックリストに登録</button></div>` : ''}`);

  const cs = $('#c-save');
  if(cs) cs.onclick = async () => {
    const wasPending = pending;
    try{
      await api('/reports/'+r.id, { method:'PATCH', body:{
        s_motivation:$('#c-mot').value, s_response:$('#c-res').value, s_total:$('#c-tot').value,
        draft:$('#c-draft').value, plan:$('#c-plan').value, checker:$('#c-checker').value
      }});
      const draftMsg = $('#c-draft').value==='OK' ? 'ドラフト一覧に追加されました。' : '';
      closeModal(); render();
      popup((wasPending?'2次チェックを完了しました。':'2次チェックを更新しました。')+draftMsg);
    }catch(e){ popup(e.message, 'error'); }
  };
  const blAdd = $('#bl-add');
  if(blAdd) blAdd.onclick = async () => {
    if(!confirm(`「${r.candidate_name}」をブラックリストに登録しますか?(5段階評価・詳細はブラックリスト画面で追記できます)`)) return;
    try{
      await api('/blacklist', { method:'POST', body:{ name:r.candidate_name, reporter:r.reporter_name, reason:'' } });
      closeModal();
      popup('ブラックリストに登録しました。');
    }catch(e){ popup(e.message, 'error'); }
  };
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
async function pageBlacklist(app){
  if(!has('blacklist_manage')){ notFound(app); return; }
  const rows = await api('/blacklist');
  const sc = id => `<select id="${id}" style="width:64px"><option value="">-</option>${[1,2,3,4,5].map(n=>`<option>${n}</option>`).join('')}</select>`;
  const scTh = ['会話','服装','身なり','遅刻','業務'];
  const matchedBadge = ka => ka ? `<span class="tag matched" title="既にアプリに登録されています">⚠️ 登録済(${h(ka)})</span>` : '';
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
    <tr><th>提出日時</th><th>日付</th><th>報告者</th><th>名前</th>${scTh.map(t=>`<th>${t}</th>`).join('')}<th>理由</th><th>登録者</th><th>状態</th></tr>
    ${rows.map(r=>`<tr>
      <td>${h(r.ts)}</td><td>${h(r.date)}</td><td>${h(r.reporter)}</td><td><b>${h(r.name)}</b></td>
      <td class="c">${r.s_talk??''}</td><td class="c">${r.s_dress??''}</td><td class="c">${r.s_groom??''}</td><td class="c">${r.s_late??''}</td><td class="c">${r.s_work??''}</td>
      <td>${h(r.reason)}</td><td>${h(r.added_by)}</td><td>${matchedBadge(r.matched_ka)}</td></tr>`).join('') || '<tr><td colspan="12" class="muted">登録はありません</td></tr>'}
    </table></div>
    <div class="cards sp-only">
    ${rows.map(r=>{
      const sc2 = [['会話',r.s_talk],['服装',r.s_dress],['身なり',r.s_groom],['遅刻',r.s_late],['業務',r.s_work]].filter(x=>x[1]!=null);
      return `<div class="dcard">
      <div class="dcard-head"><span class="dcard-title">${h(r.name)}</span><span class="dcard-sub">${h(r.date)}</span></div>
      ${r.matched_ka?`<div class="drow"><span class="dk">状態</span><span class="dv">${matchedBadge(r.matched_ka)}</span></div>`:''}
      <div class="drow"><span class="dk">報告者</span><span class="dv">${h(r.reporter)}</span></div>
      ${sc2.length?`<div class="drow"><span class="dk">評価</span><span class="dv"><div class="dscore">${sc2.map(x=>`<span>${x[0]} ${x[1]}</span>`).join('')}</div></span></div>`:''}
      ${r.reason?`<div class="drow"><span class="dk">理由</span><span class="dv">${h(r.reason)}</span></div>`:''}
      <div class="drow"><span class="dk">登録者</span><span class="dv dcard-sub">${h(r.added_by)} / ${h(r.ts)}</span></div>
    </div>`;}).join('') || '<div class="muted">登録はありません</div>'}
    </div>
  </div>`;
  $('#b-add').onclick = async () => {
    const name = $('#b-name').value.trim();
    if(!name){ popup('名前は必須です', 'error'); return; }
    try{
      await api('/blacklist',{method:'POST',body:{
        date:$('#b-date').value, reporter:$('#b-reporter').value.trim(), name,
        s_talk:$('#b-talk').value, s_dress:$('#b-dress').value, s_groom:$('#b-groom').value,
        s_late:$('#b-late').value, s_work:$('#b-work').value, reason:$('#b-reason').value
      }});
      render();
      popup('ブラックリストに登録しました。');
    }catch(e){ popup(e.message, 'error'); }
  };
}

/* ===== 新人報告・ブラックリストのスプレッドシート貼り付け用エクスポート(管理者専用) ===== */
async function pageReportExport(app){
  if(ME.role !== 'admin'){ notFound(app); return; }
  app.innerHTML = '<h2>📎 スプレッドシート貼り付け用にコピー</h2><div class="card"><div class="loading-box"><span class="spinner"></span>読み込み中…</div></div>';
  let reports, blacklist;
  try{
    [reports, blacklist] = await Promise.all([api('/reports'), api('/blacklist')]);
  }catch(e){ app.innerHTML = `<h2>📎 スプレッドシート貼り付け用にコピー</h2><div class="card"><div class="msg err">${h(e.message)}</div></div>`; return; }

  const st = PAGE_STATE.reportExport || (PAGE_STATE.reportExport = { rFrom:'', rTo:'', bFrom:'', bTo:'' });

  app.innerHTML = `
  <h2 style="margin-bottom:4px">📎 スプレッドシート貼り付け用にコピー</h2>

  <div class="card" style="margin-bottom:14px">
    <h3 style="margin-bottom:8px">🆕 新人報告</h3>
    <div class="row" style="gap:10px;flex-wrap:wrap;align-items:center">
      <label>開始日 <input type="date" id="rex-from" value="${h(st.rFrom)}"></label>
      <label>終了日 <input type="date" id="rex-to" value="${h(st.rTo)}"></label>
      <button class="btn gold sm" id="rex-copy">コピーする</button>
      <span class="muted" id="rex-msg"></span>
    </div>
  </div>

  <div class="card">
    <h3 style="margin-bottom:8px">⚠️ ブラックリスト</h3>
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
async function pageImport(app){
  if(!has('import_data')){ notFound(app); return; }
  const canReloadSettings = has('wage_settings');
  const daichoReloadSettings = canReloadSettings ? await api('/daicho-reload-settings').catch(()=>null) : null;
  const nskList = await api('/non-site-keywords').catch(()=>[]);
  const NSK_TYPE_LABEL = { x:'×(欠勤)', off:'休暇', ok:'1日OK', paid:'有給', ignore:'無視する(現場にも状態にもしない)' };
  app.innerHTML = `
  <h2 style="margin-bottom:8px">📥 スプレッドシートから取り込み <span class="muted" style="font-weight:400;font-size:13px">(IN/OUT・現場・会場)</span></h2>
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
    <h3 style="margin-bottom:8px">🏷️ 現場として認識しない文言</h3>
    <div id="nsk-list"></div>
    <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap;align-items:center">
      <input id="nsk-keyword" placeholder="文言(例:公休)" style="width:140px;max-width:100%">
      <select id="nsk-type" style="max-width:100%">${Object.entries(NSK_TYPE_LABEL).map(([k,l])=>`<option value="${k}">${h(l)}</option>`).join('')}</select>
      <button class="btn gold sm" id="nsk-add">追加</button>
    </div>
  </div>
  ${canReloadSettings ? `
  <div class="card" style="margin-top:16px">
    <h3 style="margin-bottom:8px">🌙 台帳の深夜自動再取り込み</h3>
    <div class="muted" style="margin-bottom:10px">上記で「URLを保存する」にチェックして取り込んだ台帳URLを、<b>設定した時刻に毎日自動で再取り込み</b>します。手動取り込みが「事前の仮確認」、この自動処理が「その日の夜に確定版で上書き」という運用です。</div>
    <div class="muted" style="margin-bottom:12px">実行後、保存済みURLは自動的に削除されます。またR2台帳は<b>同じファイルの古いバージョンが削除され、最新版1件だけが残ります</b>。</div>
    <div class="form-grid" style="max-width:420px">
      <label>実行時刻</label>
      <select id="dr-hour" style="width:120px;max-width:100%">${Array.from({length:24},(_,i)=>`<option value="${i}" ${daichoReloadSettings&&daichoReloadSettings.hour===i?'selected':''}>${String(i).padStart(2,'0')}:00</option>`).join('')}</select>
    </div>
    <div class="row" style="margin-top:10px;gap:8px;align-items:center">
      <button class="btn gold sm" id="dr-save">保存</button>
      <span class="muted" id="dr-msg"></span>
    </div>
    <div id="daicho-reload-status" class="muted" style="margin-top:16px"><span class="spinner" style="width:13px;height:13px;border-width:2px;margin-right:5px"></span>読み込み中…</div>
  </div>` : ''}`;

  const renderNsk = (list) => {
    const el = $('#nsk-list'); if(!el) return;
    el.innerHTML = list.length ? `<div class="nsk-chips">
      ${list.map(k=>`<span class="nsk-chip">
        <b>${h(k.keyword)}</b><span class="muted" style="font-size:11.5px">(${h(NSK_TYPE_LABEL[k.type]||k.type)})</span>
        <button class="nsk-del" data-id="${k.id}" title="削除">✕</button>
      </span>`).join('')}
    </div>` : '<div class="muted">登録されている文言はありません</div>';
    el.querySelectorAll('.nsk-del').forEach(b=>b.onclick=async()=>{
      if(!confirm('この文言を削除しますか？')) return;
      try{ await api(`/non-site-keywords/${b.dataset.id}`,{method:'DELETE'}); const d=await api('/non-site-keywords'); renderNsk(d); }
      catch(e){ popup(e.message,'error'); }
    });
  };
  renderNsk(nskList);
  $('#nsk-add').onclick = async () => {
    const keyword = $('#nsk-keyword').value.trim();
    const type = $('#nsk-type').value;
    if(!keyword){ popup('文言を入力してください','error'); return; }
    try{
      await api('/non-site-keywords',{method:'POST',body:{keyword,type}});
      $('#nsk-keyword').value='';
      const d = await api('/non-site-keywords'); renderNsk(d);
      popup('追加しました');
    }catch(e){ popup(e.message,'error'); }
  };

  const showSaved = async () => {
    try{
      const d = await api('/import-urls');
      const el = $('#imp-saved'); if(!el) return;
      if(!d.urls.length){ el.innerHTML = '保存済みURLはありません'; return; }
      el.innerHTML = `<div style="margin-bottom:6px">保存済みURL (${d.urls.length}件): <button class="btn ghost xs" id="imp-clear-all">すべて削除</button></div>` +
        d.urls.map(u=>`<div class="imp-saved-row" style="display:flex;align-items:center;gap:6px;margin-bottom:4px;flex-wrap:wrap">
          <span style="flex:1 1 auto;min-width:0">
            <span style="font-weight:600">${h(u.sheetTitle || '(シート名不明)')}</span>
            <span class="muted" style="font-size:12px;display:block">登録日:${h(u.targetDate||'—')} / 読込:${h(u.savedAt||'—')}</span>
            <span class="muted" style="font-size:11px;font-family:monospace;display:block;word-break:break-all">${h(u.url)}</span>
          </span>
          <button class="btn ghost xs imp-del-one" data-url="${h(u.url)}">削除</button>
        </div>`).join('');
      const ca = $('#imp-clear-all');
      if(ca) ca.onclick = async () => {
        if(!confirm('保存済みURLをすべて削除しますか？\n\n※取り込み済みのスケジュール・給与データ・保管した台帳は残ります。次回また取り込む際にURLを貼り直す必要があるだけです。')) return;
        try{ await api('/import-urls/delete',{method:'POST',body:{all:true}}); popup('保存済みURLをすべて削除しました'); showSaved(); }
        catch(e){ popup(e.message,'error'); }
      };
      el.querySelectorAll('.imp-del-one').forEach(b => b.onclick = async () => {
        try{ await api('/import-urls/delete',{method:'POST',body:{url:b.dataset.url}}); popup('URLを削除しました'); showSaved(); }
        catch(e){ popup(e.message,'error'); }
      });
    }catch(_){}
  };
  showSaved();
  $('#imp-run').onclick = async () => {
    const urls = $('#imp-urls').value.split(/\s+/).map(s=>s.trim()).filter(Boolean);
    if(!urls.length){ $('#imp-result').innerHTML='<span class="msg err">URLを入力してください</span>'; return; }
    $('#imp-run').disabled = true; $('#imp-result').innerHTML = '<span class="spinner" style="width:13px;height:13px;border-width:2px;margin-right:5px"></span><span class="muted">取り込み中…（全シートを読み込むため少し時間がかかります）</span>';
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
        const arch = r.archived ? '<div class="muted" style="margin-top:4px">📦 台帳をサーバーに保管しました</div>' : (r.archiveError?`<div class="muted" style="margin-top:4px">⚠️保管失敗:${h(r.archiveError)}</div>`:'');
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
    $('#imp-run').disabled = false;
  };

  if(canReloadSettings){
    const dr = $('#dr-save');
    if(dr) dr.onclick = async () => {
      const hour = Number($('#dr-hour').value);
      $('#dr-msg').textContent='保存中…';
      try{ await api('/daicho-reload-settings',{method:'PUT',body:{hour}});
        $('#dr-msg').textContent = `毎日 ${String(hour).padStart(2,'0')}:00 に自動再取り込み`;
        popup('設定を保存しました'); }
      catch(e){ $('#dr-msg').textContent=e.message; }
    };
    // 台帳自動再取り込みの最終実行結果と保存済みURLの件数を表示
    api('/import-urls').then(d => {
      const el = $('#daicho-reload-status'); if(!el) return;
      api('/settings/daicho-reload-result').then(res => {
        const savedCount = d.urls.length;
        const r = res && res.result;
        el.innerHTML = `<div style="margin-bottom:6px">現在の保存済みURL: <b>${savedCount}件</b>${savedCount?` <span class="muted">(次回0:00に自動再取り込み後、削除されます)</span>`:' <span class="muted">(再取り込み対象なし)</span>'}</div>`
          + (r ? `<div class="muted" style="word-break:break-all">最終実行: ${h(r.ts)} / ${r.count}件のURLを再取り込み${r.clearedAbsent?` / 🏖️ どのファイルにも登場しなかった人の現場を${r.clearedAbsent}件、休暇に変更`:''}<br>${r.results.map(x=>`${x.ok?'✓':'✗'} ${h((x.url||'').slice(0,60)+'…')} ${x.ok?`反映${x.applied}件`:`エラー:${h(x.error)}`}`).join('<br>')}</div>` : '<div class="muted">まだ自動実行されていません</div>');
      }).catch(()=>{ el.textContent='設定を取得できませんでした'; });
    }).catch(()=>{});
  }
}

/* ===== ログイン中メンバー・編集履歴(handler_tools権限・専用ページ) ===== */
/* ===== 現場変更報告の承認(手配担当者・管理者向け) ===== */
async function pageSelfReports(app){
  if(LV[ME.role] < 2){ notFound(app); return; }
  app.innerHTML = '<h2>📮 現場変更報告の承認</h2><div class="card"><div class="loading-box"><span class="spinner"></span>読み込み中…</div></div>';
  let rows, typeOptions;
  try{ [rows, typeOptions] = await Promise.all([api('/self-reports'), api('/report-type-options').catch(()=>[])]); }
  catch(e){ app.innerHTML = `<h2>📮 現場変更報告の承認</h2><div class="card"><div class="msg err">${h(e.message)}</div></div>`; return; }

  const typeLabelMap = {}; typeOptions.forEach(o=>typeLabelMap[o.type]=o.label);
  const labelOf = r => r.type==='work' ? [r.site, r.venue].filter(Boolean).join('／') : (typeLabelMap[r.type] || r.type);

  app.innerHTML = `
  <h2 style="margin-bottom:8px">📮 現場変更報告の承認</h2>
  ${rows.length ? `
  <div class="row" id="sr-bulk-bar" style="margin-bottom:10px;gap:8px;align-items:center;flex-wrap:wrap">
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
        <button class="btn gold sm sr-approve" data-id="${r.id}">✅ 承認する</button>
        <button class="btn danger sm sr-reject" data-id="${r.id}">❌ 見送る</button>
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
function openSelfReportApprove(r){
  modal(`<h3>${h(r.user_name)} さん / ${h(r.date)} の報告を承認</h3>
    <div class="muted" style="margin-bottom:10px">伝えた人: ${h(r.told_by)}</div>
    <div class="form-grid" style="grid-template-columns:64px 1fr;gap:6px 8px">
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
    try{
      await api(`/self-reports/${r.id}/approve`, { method:'POST', body });
      closeModal(); popup('承認しました');
      if(location.hash === '#/self-reports') pageSelfReports(document.getElementById('app'));
    }catch(e){ popup(e.message,'error'); }
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
  const sec = (id,title,body)=>`<details class="adm-sec" id="hssec-${id}" data-sec="${id}" ${openSet[id]?'open':''}><summary>${title}</summary><div class="adm-body">${body}</div></details>`;
  app.innerHTML = `
  <h2 style="margin-bottom:8px">ログイン中メンバー・編集履歴</h2>
  <div class="adm-nav">
    ${[['online','🟢 ログイン中'],['hist','📝 編集履歴']].map(s=>`<button class="adm-chip" data-jump="${s[0]}">${s[1]}</button>`).join('')}
  </div>
  ${sec('online','🟢 現在ログイン中のメンバー <span class="muted" style="font-weight:400">(10秒ごとに自動更新)</span>', `<div id="hd-online" class="muted"><span class="spinner" style="width:13px;height:13px;border-width:2px;margin-right:5px"></span>読み込み中…</div>`)}
  ${sec('hist','📝 スケジュール編集履歴 <span class="muted" style="font-weight:400">(直近500件)</span>', `<div id="hd-history" class="muted"><span class="spinner" style="width:13px;height:13px;border-width:2px;margin-right:5px"></span>読み込み中…</div>`)}`;

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
      el.innerHTML = rows.length ? `<table class="list pc-only"><tr><th></th><th>氏名</th><th>役割</th><th>登録番号</th><th>最終アクセス</th></tr>
        ${rows.map(r=>`<tr><td class="c"><span class="online-dot pulse"></span></td><td>${r.uid?`<span class="name-link" data-goto-uid="${r.uid}">${h(r.name)}</span>`:h(r.name)}</td>
        <td><span class="tag ${r.role}">${roleLabel(r)}</span>${r.handler?' <span class="tag handler">手配モード中</span>':''}</td>
        <td>${h(r.regno)}</td><td>${fmtAgo(r.last_seen)}</td></tr>`).join('')}</table>
        <div class="cards sp-only">${rows.map(r=>`<div class="dcard">
          <div class="dcard-head"><span class="dcard-title"><span class="online-dot pulse"></span> ${r.uid?`<span class="name-link" data-goto-uid="${r.uid}">${h(r.name)}</span>`:h(r.name)}</span><span class="tag ${r.role}">${roleLabel(r)}</span></div>
          <div class="drow"><span class="dk">登録番号</span><span class="dv">${h(r.regno)}</span></div>
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
      ${hist.map(x=>`<tr><td><input type="checkbox" class="hd-check" data-id="${x.id}" data-date="${h(x.date)}"></td><td>${h(x.ts)}</td><td>${h(x.editor_name)}</td><td>${x.target_id?`<span class="name-link" data-goto-uid="${x.target_id}">${h(x.target_name)}</span>`:h(x.target_name)}</td><td>${h(x.date)}</td><td>${h(summarize(x.before_json, x.after_json))}</td><td><button class="btn ghost xs hd-undo" data-id="${x.id}" data-date="${h(x.date)}">↩️ 取り消す</button></td></tr>`).join('')}
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
      <div class="row" style="margin-top:6px"><button class="btn ghost xs hd-undo" data-id="${x.id}" data-date="${h(x.date)}">↩️ この変更を取り消す</button></div>
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
  <div class="adm-nav">
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
    listEl.innerHTML = defs.perms.map(p=>{
      const already = p.baseLv <= LV[r.key]; // この役割の基本権限で既に使える機能
      const checked = already || cur.perms.includes(p.key);
      return `<label style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);${already?'opacity:.5':''}">
        <input type="checkbox" class="rperm-cb-${r.key}" value="${p.key}" ${checked?'checked':''} ${already?'disabled':''} style="width:18px;height:18px">
        <span style="flex:1">${h(p.label)}</span>
        ${already?'<span class="tag" style="font-size:11px">標準で利用可</span>':''}
      </label>`;
    }).join('');
  }

  app.querySelectorAll('[data-save]').forEach(btn => btn.onclick = async () => {
    const role = btn.dataset.save;
    const keys = [...document.querySelectorAll(`.rperm-cb-${role}:not(:disabled)`)].filter(c=>c.checked).map(c=>c.value);
    const msgEl = $('#rmsg-'+role);
    msgEl.textContent = '保存中…';
    try{
      const r = await api(`/role-perms/${role}`, { method:'PUT', body:{ perms: keys } });
      msgEl.textContent = `${r.updated}人に反映しました`;
      popup('一括で権限を反映しました');
    }catch(e){ msgEl.textContent = e.message; }
  });
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
  <div class="muted" style="margin-bottom:16px">${h(baseUser.name)} さん（登録番号 ${h(baseUser.regno)} / ${h(roleLabel({role:roleForDisplay}))}）の設定を行います。</div>

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
    list.innerHTML = defs.perms.map(p => {
      const already = baseLvOfMe >= p.baseLv; // 基本権限で既に使える
      const checked = already || data.extraPerms.includes(p.key);
      return `<label style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line);${already?'opacity:.5':''}">
        <input type="checkbox" class="perm-cb" value="${p.key}" ${checked?'checked':''} ${already?'disabled':''} style="width:18px;height:18px">
        <span style="flex:1">${h(p.label)}</span>
        ${already?'<span class="tag" style="font-size:11px">標準で利用可</span>':''}
      </label>`;
    }).join('');
    $('#perm-save').onclick = async () => {
      const keys = [...document.querySelectorAll('.perm-cb:not(:disabled)')].filter(c=>c.checked).map(c=>c.value);
      $('#perm-msg').textContent = '保存中…';
      try{ await api(`/users/${uid}/perms`, {method:'PUT', body:{perms:keys}}); $('#perm-msg').textContent='保存しました'; popup('権限を保存しました'); }
      catch(e){ $('#perm-msg').textContent = e.message; }
    };
  }

  if(canNotify){
    const sel = $('#nr-select');
    const cur = baseUser.notify_rookie;
    sel.value = cur === 1 ? '1' : cur === 0 ? '0' : '';
    $('#nr-save').onclick = async () => {
      const v = sel.value === '' ? null : Number(sel.value);
      $('#nr-msg').textContent = '保存中…';
      try{ await api(`/users/${uid}`, {method:'PATCH', body:{notify_rookie:v}}); $('#nr-msg').textContent='保存しました'; popup('通知設定を保存しました'); }
      catch(e){ $('#nr-msg').textContent = e.message; }
    };
  }
}

/* ===== 台帳保管(管理者のみ) ===== */
/* ===== 予定表ソース管理(管理者・wage_settings権限のみ) ===== */
async function pageSchedSources(app){
  if(!has('wage_settings')){ notFound(app); return; }
  app.innerHTML = '<h2>📥 予定表ソース管理</h2><div class="card"><div class="loading-box"><span class="spinner"></span>読み込み中…</div></div>';
  let data;
  try{ data = await api('/sched-sources'); }
  catch(e){ app.innerHTML = `<h2>📥 予定表ソース管理</h2><div class="card"><div class="msg err">${h(e.message)}</div></div>`; return; }
  const sources = data.sources || [];

  const freqLabel = s => s.freqType==='daily' ? `毎日 ${String(s.hour).padStart(2,'0')}:00` : `${s.intervalHours}時間ごと`;

  app.innerHTML = `
  <h2 style="margin-bottom:4px">📥 予定表ソース管理</h2>

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
    <div class="muted" style="margin-top:4px">
      ${s.lastRun ? `最終実行: ${h(s.lastRun)}` : 'まだ実行されていません'}
      ${s.lastResult ? `<br>結果: 反映 ${s.lastResult.applied}件 / スキップ ${s.lastResult.skipped}件${s.lastResult.changedPeople!=null?` / 変更あり ${s.lastResult.changedPeople}人・変更なし ${s.lastResult.unchangedPeople}人`:''}${s.lastResult.error?` <span style="color:#b85042">エラー: ${h(s.lastResult.error)}</span>`:''}` : ''}
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
    if(!label || !url){ $('#ss-add-msg').textContent='名前とURLを入力してください'; return; }
    $('#ss-add-msg').textContent='追加中…';
    try{
      await api('/sched-sources',{method:'POST',body:{label,url,freqType,intervalHours,hour,notifyAdmin}});
      popup('予定表ソースを追加しました');
      pageSchedSources(app);
    }catch(e){ $('#ss-add-msg').textContent = e.message; }
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
    const msgEl = document.querySelector(`.ss-msg[data-id="${id}"]`);
    if(!label || !url){ if(msgEl) msgEl.textContent='名前とURLを入力してください'; return; }
    if(msgEl) msgEl.textContent='保存中…';
    try{
      await api(`/sched-sources/${id}`,{method:'PUT',body:{label,url,enabled,freqType,intervalHours,hour,notifyAdmin}});
      popup('保存しました');
      pageSchedSources(app);
    }catch(e){ if(msgEl) msgEl.textContent = e.message; }
  });

  // 今すぐ取り込む
  document.querySelectorAll('.ss-run').forEach(btn => btn.onclick = async () => {
    const id = btn.dataset.id;
    const msgEl = document.querySelector(`.ss-msg[data-id="${id}"]`);
    btn.disabled = true; if(msgEl) msgEl.textContent='取り込み中…（少し時間がかかります）';
    try{
      const r = await api(`/sched-sources/${id}/run`,{method:'POST'});
      if(msgEl) msgEl.textContent = `対象日 ${r.fromDate} 以降: 反映 ${r.applied}件 / スキップ ${r.skipped}件`;
      popup(`取り込みました(反映${r.applied}件)`);
      pageSchedSources(app);
    }catch(e){ if(msgEl) msgEl.textContent = e.message; }
    finally{ btn.disabled = false; }
  });

  // 削除
  document.querySelectorAll('.ss-del').forEach(btn => btn.onclick = async () => {
    const id = btn.dataset.id;
    if(!confirm('この予定表ソースを削除しますか？\n\n※既に取り込まれたスケジュールデータは残ります。')) return;
    try{ await api(`/sched-sources/${id}`,{method:'DELETE'}); popup('削除しました'); pageSchedSources(app); }
    catch(e){ popup(e.message,'error'); }
  });
}

async function pageDaicho(app){
  if(ME.role !== 'admin'){ notFound(app); return; }
  app.innerHTML = '<h2>📦 台帳保管</h2><div class="card"><div class="loading-box"><span class="spinner"></span>読み込み中…</div></div>';
  let data;
  try{ data = await api('/daicho'); }
  catch(e){ app.innerHTML = `<h2>📦 台帳保管</h2><div class="card"><div class="msg err">${h(e.message)}</div></div>`; return; }
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
    const bulkBar = selected.size ? `<div class="row" style="margin-bottom:8px;gap:8px;align-items:center;background:#f7f5ef;border:1px solid var(--line);border-radius:8px;padding:8px 10px">
      <span class="muted" style="font-weight:600">${selected.size}件選択中</span>
      <button class="btn ghost sm" id="dc-bulk-dl">⬇️ まとめてダウンロード</button>
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
            <td style="white-space:nowrap;font-weight:600">${h(it.file_name||'(名称不明)')}</td>
            <td style="white-space:nowrap">${h(it.ts)}</td>
            <td style="white-space:nowrap">${h(it.importer_name||'—')}</td>
            <td>${it.applied!=null?it.applied+'件':'—'}</td>
            <td>${it.sheets!=null?it.sheets:'—'}</td>
            <td style="white-space:nowrap">${fmtSize(it.size)}</td>
            <td style="white-space:nowrap"><button class="btn ghost xs dc-dl" data-id="${it.id}" data-name="${h(it.file_name||'daicho.xlsx')}">⬇️ ダウンロード</button></td>
            <td><button class="btn danger xs dc-del" data-id="${it.id}" data-ts="${h(it.ts)}">削除</button></td>
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
            <button class="btn ghost sm dc-dl" data-id="${it.id}" data-name="${h(it.file_name||'daicho.xlsx')}">⬇️ ダウンロード</button>
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
      try{
        await api('/daicho/bulk-delete', { method:'POST', body:{ ids } });
        popup(`${ids.length}件削除しました`);
        pageDaicho(app);
      }catch(e){ popup(e.message,'error'); }
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
      try{ await api(`/daicho/${b.dataset.id}/delete`,{method:'POST'}); popup('削除しました'); pageDaicho(app); }
      catch(e){ popup(e.message,'error'); }
    });
  };

  app.innerHTML = `
  <h2 style="margin-bottom:8px">📦 台帳保管</h2>
  <div class="card">
    ${items.length ? `
    <div class="filter-bar" style="flex-wrap:wrap;gap:8px">
      <input id="dc-name" class="search-input" placeholder="🔍 ファイル名で検索" value="${h(st.name)}" style="min-width:160px;flex:1 1 160px">
      <select id="dc-person" class="filter-select" style="flex:1 1 140px">
        <option value="">取り込んだ人:すべて</option>
        ${persons.map(p=>`<option value="${h(p)}" ${st.person===p?'selected':''}>${h(p)}</option>`).join('')}
      </select>
      <label class="muted" style="display:flex;align-items:center;gap:4px;font-size:13px;white-space:nowrap">開始<input type="date" id="dc-from" value="${h(st.dateFrom)}" style="max-width:150px"></label>
      <label class="muted" style="display:flex;align-items:center;gap:4px;font-size:13px;white-space:nowrap">終了<input type="date" id="dc-to" value="${h(st.dateTo)}" style="max-width:150px"></label>
      <button class="btn ghost sm" id="dc-clear" style="${hasFilterOn()?'':'display:none'}">クリア</button>
    </div>
    <div class="row" style="margin:8px 0;align-items:center;gap:6px">
      <label class="muted" style="font-size:13px;white-space:nowrap">並び替え</label>
      <select id="dc-sort" class="filter-select" style="flex:1 1 220px">
        ${sortOptions.map(([col,dir,label])=>`<option value="${col}:${dir}" ${st.sortCol===col&&st.sortDir===dir?'selected':''}>${label}</option>`).join('')}
      </select>
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
    try{
      await api(`/users/${uid}`, { method:'PATCH', body:{ regno:v } });
      USERS_CACHE = null;
      closeModal(); popup('登録番号を変更しました');
      if(onDone) onDone();
    }catch(e){ popup(e.message,'error'); }
  };
}

async function pageAdmin(app){
  if(!has('account_manage')){ notFound(app); return; }
  const users = await getUsers(true);
  const mgrs = await api('/managers');
  const optLists = await api('/option-lists').catch(()=>({ka:[],han:[]}));
  const st = PAGE_STATE.admin || (PAGE_STATE.admin = { q:'', mgr:'', open:{ list:true } });
  const openSet = st.open;
  const sec = (id,title,body)=>`<details class="adm-sec" id="sec-${id}" data-sec="${id}" ${openSet[id]?'open':''}><summary>${title}</summary><div class="adm-body">${body}</div></details>`;

  // アカウント一覧のリスト部分だけを再構築する。検索欄など入力要素はここでは触らない
  // (input要素をDOMから作り直すと、スマホでソフトウェアキーボードが閉じてしまうため)
  const renderAccountList = () => {
    const adq = st.q.trim(), admgr = st.mgr;
    const aList = users.filter(u=>{
      const mq = !adq || (u.name||'').includes(adq) || (u.regno||'').includes(adq);
      const mm = !admgr || (admgr.startsWith('__chief:') ? (!u.manager_id && u.ka===admgr.slice(8)) : String(u.manager_id)===String(admgr));
      return mq && mm;
    });
    const area = $('#ad-list-area'); if(!area) return;
    const countEl = $('#ad-count'); if(countEl) countEl.textContent = `(${aList.length}名)`;
    area.innerHTML = `
      <div class="row" id="ad-bulk-bar" style="margin:2px 0 10px;gap:8px;align-items:center">
        <span class="muted">${aList.length}名 表示中</span>
        <span class="muted" style="margin-left:auto">選択中: <span id="ad-sel-count">0</span>件</span>
        <button class="btn ghost sm" id="ad-bulk-suspend" disabled>まとめて停止</button>
        <button class="btn ghost sm" id="ad-bulk-restore" disabled>まとめて復活</button>
      </div>
      <div class="sched-wrap pc-only"><table class="list">
      <tr><th><input type="checkbox" id="ad-check-all"></th><th>登録番号</th><th>氏名</th><th>役割(管理者のみ変更可)</th><th>担当手配者</th><th>ランク</th><th>班</th><th>駅</th><th>操作</th></tr>
      ${aList.map(u=>`<tr class="${u.suspended?'is-suspended':''}">
        <td>${u.id===ME.id?'':`<input type="checkbox" class="ad-check" data-id="${u.id}">`}</td>
        <td class="nowrap">${h(u.regno)}${baseFromRegno(u.regno)?` <span class="muted" style="font-size:11px">(${baseFromRegno(u.regno)})</span>`:''}${ME.role==='admin'?` <button class="btn ghost xs regno-edit" data-id="${u.id}" data-cur="${h(u.regno)}" data-name="${h(u.name)}" title="登録番号を変更">✏️</button>`:''}</td><td class="nowrap">${h(u.name)}${u.suspended?' <span class="susp-tag">停止</span>':''}</td>
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
            <span class="dcard-title">${h(u.name)}${u.suspended?' <span class="susp-tag">停止</span>':''}</span>
          </label>
          <span class="dcard-sub">${h(u.regno)}${baseFromRegno(u.regno)?` (${baseFromRegno(u.regno)})`:''}${ME.role==='admin'?` <button class="btn ghost xs regno-edit" data-id="${u.id}" data-cur="${h(u.regno)}" data-name="${h(u.name)}" title="登録番号を変更">✏️</button>`:''}</span>
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
      try{ await api(`/users/${id}`,{method:'PATCH',body:{suspended:cur?0:1}}); USERS_CACHE=null; popup(cur?'復活しました':'停止しました'); renderAccountList(); }
      catch(e){ popup(e.message,'error'); }
    });
    area.querySelectorAll('[data-reset]').forEach(b => b.onclick = async () => {
      if(!confirm('パスワードを初期化しますか?(登録番号でログインできるようになります)')) return;
      await api(`/users/${b.dataset.reset}/resetpw`, { method:'POST' }); alert('初期化しました');
    });
    area.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if(!confirm('このアカウントを削除しますか?スケジュールも削除されます。')) return;
      try{ await api('/users/'+b.dataset.del, { method:'DELETE' }); USERS_CACHE=null; render(); }
      catch(e){ alert(e.message); }
    });

    // 複数選択・一括停止/復活
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
  <div class="adm-nav">
    ${[['data','📋 全データ'],['create','➕ 新規作成'],['list','👥 アカウント一覧']].map(s=>`<button class="adm-chip" data-jump="${s[0]}">${s[1]}</button>`).join('')}
    <a href="#/role-permissions" class="adm-chip" style="text-decoration:none;display:inline-block">🛡️ 権限の一括設定</a>
    <a href="#/admin-settings" class="adm-chip" style="text-decoration:none;display:inline-block">🔧 システム設定</a>
  </div>

  ${sec('data','📋 全データ閲覧', `
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

  ${sec('create','➕ 新規アカウント作成 <span class="muted" style="font-weight:400">(初期パスワード = 登録番号)</span>', `
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

  ${sec('list',`👥 アカウント一覧 <span class="muted" style="font-weight:400" id="ad-count">(${users.length}名)</span>`, `
    <div class="filter-bar">
      <input id="ad-search" class="search-input" placeholder="🔍 氏名・登録番号で検索" value="${h(st.q)}">
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
    try{
      await api('/users',{method:'POST',body:{
        regno:$('#a-regno').value, name:$('#a-name').value, rank:$('#a-rank').value,
        ka:$('#a-ka').value, han:$('#a-han').value, station:$('#a-station').value,
        role:$('#a-role').value, manager_id:$('#a-mgr').value ? Number($('#a-mgr').value) : null
      }});
      USERS_CACHE=null; render();
    }catch(e){ $('#a-msg').innerHTML = `<span class="msg err">${h(e.message)}</span>`; }
  };
  const aom = $('#a-opt-manage');
  if(aom) aom.onclick = () => { const p=$('#a-opt-panel'); if(p) p.style.display = p.style.display==='none' ? '' : 'none'; };
  const akAdd = $('#a-ka-add');
  if(akAdd) akAdd.onclick = async () => {
    const v = $('#a-ka-new').value.trim(); if(!v) return;
    try{ await api('/option-lists',{method:'POST',body:{category:'ka',value:v}}); pageAdmin(app); }
    catch(e){ popup(e.message,'error'); }
  };
  const ahAdd = $('#a-han-add');
  if(ahAdd) ahAdd.onclick = async () => {
    const v = $('#a-han-new').value.trim(); if(!v) return;
    try{ await api('/option-lists',{method:'POST',body:{category:'han',value:v}}); pageAdmin(app); }
    catch(e){ popup(e.message,'error'); }
  };
  app.querySelectorAll('.opt-del').forEach(b => b.onclick = async () => {
    if(!confirm('この選択肢を削除しますか？(既に設定されているメンバーの値はそのまま残ります)')) return;
    try{ await api(`/option-lists/${b.dataset.id}`,{method:'DELETE'}); pageAdmin(app); }
    catch(e){ popup(e.message,'error'); }
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
  const sec = (id,title,body)=>`<details class="adm-sec" id="asec-${id}" data-sec="${id}" ${openSet[id]?'open':''}><summary>${title}</summary><div class="adm-body">${body}</div></details>`;
  app.innerHTML = `
  <h2 style="margin-bottom:8px">🔧 システム設定</h2>
  <div class="adm-nav">
    ${[['pin','🔑 PIN'],['link','🔗 連携'],['features','🧪 機能公開'],['notify','🔔 通知'],['wage','💴 時給'],['report-type','📝 報告選択肢'],['maintenance','🚧 メンテナンス']].map(s=>`<button class="adm-chip" data-jump="${s[0]}">${s[1]}</button>`).join('')}
  </div>

  ${sec('pin','🔑 手配者専用パスワード(PIN)', `
    <div class="row">
      <span>現在:<b id="pin-now">${h(pin)}</b></span>
      <input id="pin-new" placeholder="新しいPIN(4〜20文字)" style="width:180px">
      <button class="btn" id="pin-save">変更する</button><span id="pin-msg"></span>
    </div>
    <div class="muted" style="margin-top:6px">変更すると、手配モード中のメンバーは全員解除され、新しいPINの再入力が必要になります。</div>`)}

  ${sec('link','🔗 スプレッドシート連携(取り込みトークン)', `
    <div class="row">
      <input id="imp-tok" value="${h(importTok)}" readonly style="flex:1;min-width:240px;font-family:monospace;font-size:12px">
      <button class="btn ghost" id="imp-copy">コピー</button>
      <button class="btn danger" id="imp-regen">再発行</button><span id="imp-msg"></span>
    </div>
`)}

  ${sec('notify','🔔 通知設定 <span class="muted" style="font-weight:400">(新人報告リマインド)</span>', notifyData ? `
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
    <div class="row" style="margin-top:14px;gap:8px;align-items:center">
      <button class="btn gold sm" id="nt-save">通知設定を保存</button>
      <button class="btn ghost sm" id="nt-test">今すぐテスト送信</button>
      <span id="nt-msg" class="muted"></span>
    </div>

  ` : '<div class="muted">通知設定を取得できませんでした</div>')}

  ${sec('wage','💴 時給設定 <span class="muted" style="font-weight:400">(ランク×時期)</span>', wageData ? `
    <div class="muted" style="margin-bottom:8px">現場日に有効な時給が給与計算に使われます。<b>${h(wageData.lockBefore)}</b> 以前の現場は給与確定済み（時給を変えても再計算されません）。</div>
    ${lockData ? `
    <div style="background:#f7f5ef;border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin-bottom:12px">
      <div style="font-weight:700;margin-bottom:6px">🔒 給与確定ロック期間</div>
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
    ${wageData.periods.map(p=>`
      <div style="font-weight:700;margin:10px 0 4px">${p.effective_from==='1900-01-01'?'旧時給（〜2025/9）':h(p.effective_from)+' 〜（改定）'}</div>
      <table class="wage-tbl">
        <tr><th>ランク</th><th>案内料金</th><th>搬入出料金</th></tr>
        ${['A','B','C','D','E'].map(rk=>{const g=(p.rates[rk]||{}).guide||0,l=(p.rates[rk]||{}).load||0;return `<tr><td>${rk}</td>
          <td><input type="number" class="wage-in" data-ef="${h(p.effective_from)}" data-rank="${rk}" data-kind="guide" value="${g}"></td>
          <td><input type="number" class="wage-in" data-ef="${h(p.effective_from)}" data-rank="${rk}" data-kind="load" value="${l}"></td></tr>`;}).join('')}
      </table>`).join('')}
    <div class="row" style="margin-top:12px;gap:8px;align-items:center">
      <button class="btn gold sm" id="wage-save">時給を保存</button>
      <span id="wage-msg" class="muted"></span>
    </div>

    <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--line)">
      <div style="font-weight:700;margin-bottom:8px">📋 業務名 → 料金区分の対応表</div>
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

  ${sec('report-type','📝 「現場変更の報告」の選択肢', `
    <div id="rto-list"></div>
    <div class="row" style="margin-top:10px;gap:8px;flex-wrap:wrap;align-items:center">
      <select id="rto-type"><option value="off">休暇</option><option value="ok">1日OK</option><option value="paid">有給</option><option value="x">×</option></select>
      <input id="rto-label" placeholder="表示ラベル(例:1日OKに変更)" style="width:200px">
      <button class="btn gold sm" id="rto-add">追加</button>
    </div>`)}

  ${sec('features','🧪 機能公開設定', `
    <div class="muted" style="margin-bottom:10px">各画面を「公開中」「準備中(まだ誰にも見せない)」「メンテナンス中(一時的に使えなくする)」から選べます。メニュー自体は誰でも見えますが、開くとそれぞれの状態に応じたメッセージが表示されます。管理者本人には、この設定に関わらず常に通常通り表示されます。</div>
    <div style="display:flex;flex-direction:column;gap:8px">
      ${FEATURE_KEYS.map(key=>{
        const st = featureStatus[key] || 'ready';
        const label = FEATURE_LABELS[key];
        const tagCls = st==='ready' ? 'checked' : st==='maintenance' ? 'pending' : 'suspended';
        const tagText = st==='ready' ? '🟢 公開中' : st==='maintenance' ? '🚧 メンテナンス中' : '⏳ 準備中';
        return `
      <div class="row" style="gap:10px;align-items:center;justify-content:space-between;padding:8px 10px;background:#f7f5ef;border-radius:8px;flex-wrap:wrap">
        <span>${label}</span>
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

  ${sec('maintenance','🚧 メンテナンスモード', `
    <div class="muted" style="margin-bottom:10px">有効にすると、<b>管理者以外の全員が即座に強制ログアウト</b>され、メンテナンスを終了するまで管理者以外はログインできなくなります(ログイン画面に「現在メンテナンス中です」と表示されます)。管理者は引き続きログイン・操作できます。</div>
    <div class="row" style="gap:10px;align-items:center;margin-bottom:12px">
      <span>現在の状態:</span>
      <span class="tag ${maintenance.enabled?'pending':'checked'}" id="maint-status">${maintenance.enabled?'🚧 メンテナンス中':'🟢 通常稼働中'}</span>
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
      try{ await api(`/report-type-options/${b.dataset.id}`,{method:'DELETE'}); const d=await api('/report-type-options'); renderRto(d); }
      catch(e){ popup(e.message,'error'); }
    });
  };
  renderRto(rtoList);
  { const rb = $('#rto-add'); if(rb) rb.onclick = async () => {
      const type = $('#rto-type').value;
      const label = $('#rto-label').value.trim();
      if(!label){ popup('表示ラベルを入力してください','error'); return; }
      try{
        await api('/report-type-options',{method:'POST',body:{type,label}});
        $('#rto-label').value='';
        const d = await api('/report-type-options'); renderRto(d);
        popup('追加しました');
      }catch(e){ popup(e.message,'error'); }
  }; }

  { const ws = $('#wage-save'); if(ws) ws.onclick = async () => {
      const rates = [...document.querySelectorAll('.wage-in')].map(i=>({effective_from:i.dataset.ef,rank:i.dataset.rank,kind:i.dataset.kind,amount:Number(i.value)})).filter(r=>Number.isFinite(r.amount)&&r.amount>=0);
      $('#wage-msg').textContent='保存中…';
      try{ const r=await api('/wage-rates',{method:'PUT',body:{rates}}); $('#wage-msg').textContent=`${r.updated}件 保存しました`; popup('時給を更新しました'); }
      catch(e){ $('#wage-msg').textContent=e.message; }
  }; }
  { const ls = $('#lock-save'); if(ls) ls.onclick = async () => {
      const days = Number($('#lock-days').value);
      $('#lock-msg').textContent='保存中…';
      try{ const r=await api('/lock-settings',{method:'PUT',body:{days}});
        $('#lock-msg').textContent=`${r.lockBefore} 以前を確定`; popup('ロック期間を保存しました'); pageAdminSettings(app); }
      catch(e){ $('#lock-msg').textContent=e.message; }
  }; }
  { const rb = $('#recalc-btn'); if(rb) rb.onclick = async () => {
      if(!confirm('取り込み済みの全現場の給与・残業を、現在の時給・新ルールで再計算します。手動入力した給与も上書きされます。よろしいですか？')) return;
      rb.disabled=true; $('#recalc-msg').textContent='再計算中…（件数が多いと数十秒かかります）';
      try{ const r=await api('/recalc',{method:'POST'}); $('#recalc-msg').textContent=`${r.updated}件 再計算しました`; popup(`${r.updated}件を再計算しました`); }
      catch(e){ $('#recalc-msg').textContent=e.message; }
      finally{ rb.disabled=false; }
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
    try{
      await api('/duty-map/'+encodeURIComponent(duty), { method:'DELETE' });
      popup('削除しました'); pageAdminSettings(app);
    }catch(e){ popup(e.message,'error'); }
  });
  { const da = $('#duty-add'); if(da) da.onclick = async () => {
      const duty = $('#duty-new-name').value.trim();
      const seg = $('#duty-new-seg').value;
      if(!duty){ $('#duty-msg').textContent = '業務名を入力してください'; return; }
      try{
        await api('/duty-map', { method:'POST', body:{ duty, seg } });
        popup('追加しました'); pageAdminSettings(app);
      }catch(e){ $('#duty-msg').textContent = e.message; }
  }; }
  { const ns = $('#nt-save'); if(ns) ns.onclick = async () => {
      const enabled = $('#nt-enabled').checked;
      const hour = Number($('#nt-hour').value);
      const target = $('#nt-target').value;
      $('#nt-msg').textContent='保存中…';
      try{ const r=await api('/notify-settings',{method:'PUT',body:{enabled,hour,target}});
        $('#nt-msg').textContent = r.enabled ? `毎日 ${String(r.hour).padStart(2,'0')}:00 に送信` : '通知オフ';
        popup('通知設定を保存しました'); }
      catch(e){ $('#nt-msg').textContent=e.message; }
  }; }
  { const nt = $('#nt-test'); if(nt) nt.onclick = async () => {
      $('#nt-msg').textContent='送信中…';
      try{ await api('/notify-test',{method:'POST'}); $('#nt-msg').textContent='テスト通知を送りました（🔔を確認）'; popup('テスト通知を送信しました。画面上部の🔔を確認してください'); }
      catch(e){ $('#nt-msg').textContent=e.message; }
  }; }

  $('#pin-save').onclick = async () => {
    const v = $('#pin-new').value.trim();
    if(!confirm(`手配者専用パスワードを「${v}」に変更しますか?`)) return;
    try{
      await api('/settings/handler-pin', { method:'POST', body:{ pin:v } });
      $('#pin-now').textContent = v; $('#pin-new').value='';
      $('#pin-msg').innerHTML = '<span class="msg ok">変更しました</span>';
    }catch(e){ $('#pin-msg').innerHTML = `<span class="msg err">${h(e.message)}</span>`; }
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
    try{
      const d = await api('/settings/import-token', { method:'POST' });
      $('#imp-tok').value = d.token;
      $('#imp-msg').innerHTML = '<span class="msg ok">再発行しました</span>';
    }catch(e){ $('#imp-msg').innerHTML = `<span class="msg err">${h(e.message)}</span>`; }
  };
  app.querySelectorAll('.feat-select').forEach(sel => sel.onchange = async () => {
    const key = sel.dataset.key;
    const status = sel.value;
    try{
      await api('/settings/feature-status', { method:'POST', body:{ key, status } });
      featureStatus[key] = status;
      const tagCls = status==='ready' ? 'checked' : status==='maintenance' ? 'pending' : 'suspended';
      const tagText = status==='ready' ? '🟢 公開中' : status==='maintenance' ? '🚧 メンテナンス中' : '⏳ 準備中';
      const st = $(`#feat-status-${key}`);
      st.className = `tag ${tagCls}`;
      st.textContent = tagText;
      popup('変更しました');
    }catch(e){ popup(e.message,'error'); }
  });
  $('#maint-toggle').onclick = async () => {
    const nextEnable = !maintenance.enabled;
    const msg = nextEnable
      ? '管理者以外の全員を今すぐ強制ログアウトし、メンテナンスを終了するまでログインできなくします。よろしいですか?'
      : 'メンテナンスを終了し、全員が通常通りログインできるようにします。よろしいですか?';
    if(!confirm(msg)) return;
    try{
      const r = await api('/settings/maintenance', { method:'POST', body:{ enabled:nextEnable } });
      maintenance.enabled = r.enabled;
      $('#maint-status').className = `tag ${r.enabled?'pending':'checked'}`;
      $('#maint-status').textContent = r.enabled ? '🚧 メンテナンス中' : '🟢 通常稼働中';
      $('#maint-toggle').className = `btn ${r.enabled?'gold':'danger'}`;
      $('#maint-toggle').textContent = r.enabled ? 'メンテナンスを終了する' : 'メンテナンスを開始する(全員強制ログアウト)';
      $('#maint-msg').textContent = r.enabled ? `メンテナンスを開始しました(${r.loggedOut}人を強制ログアウトしました)` : 'メンテナンスを終了しました';
      popup(r.enabled ? 'メンテナンスモードを有効にしました' : 'メンテナンスモードを解除しました');
    }catch(e){ $('#maint-msg').textContent = e.message; }
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
    try{
      await api('/password',{method:'POST',body:{oldpw:$('#p-old').value,newpw:$('#p-new').value}});
      $('#p-msg').innerHTML='<span class="msg ok">変更しました</span>';
      $('#p-old').value=$('#p-new').value=$('#p-new2').value='';
    }catch(e){ $('#p-msg').innerHTML=`<span class="msg err">${h(e.message)}</span>`; }
  };
}
