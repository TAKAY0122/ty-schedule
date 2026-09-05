// RB事業2課 スケジュール管理 - Cloudflare Worker (API + 静的配信 + Cron)
// xlsxのバイト列パース(zip展開・XML解析)は src/lib/xlsxParser.ts に切り出している
// (env/DBに依存しない純粋なロジックのみ。2026年8月、バックエンド部分TypeScript化の第一弾)。
import { parseXlsxBuffer } from './lib/xlsxParser.ts';

interface Env {
  DB: D1Database;
  DAICHO: R2Bucket;
  MANUALS: R2Bucket;
  ASSETS: Fetcher;
}

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
  activity_view:   { label: 'ログイン中メンバーの閲覧中ページの確認', baseLv: 3 },
};
// 各権限の「基準レベル」は上のPERMSがコード上の既定値だが、権限マトリクス(アプリ構造ビューア)から
// 管理者が変更でき、その上書き分は settings.perm_base_overrides にJSONで保存される。
// この値はユーザーごとではなく全体で共通の設定なので、モジュール変数に置いて使い回してよい
// (同じisolate上の別リクエストと共有されるが、内容はどのリクエストでも同一のため問題にならない)。
// リクエストのたびに loadPermBaseOverrides() で読み直すので、変更は即座に全体へ反映される。
let PERM_BASE_OVERRIDES = {};
async function loadPermBaseOverrides(env) {
  try {
    const raw = await getSetting(env, 'perm_base_overrides', '');
    const obj = raw ? JSON.parse(raw) : {};
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const n = Number(v);
      if (PERMS[k] && Number.isInteger(n) && n >= 0 && n <= 4) out[k] = n;
    }
    PERM_BASE_OVERRIDES = out;
  } catch (e) { PERM_BASE_OVERRIDES = {}; }
  return PERM_BASE_OVERRIDES;
}
// 実際に適用される基準レベル(上書きがあればそれ、無ければコード上の既定値)。
// 4 は「どのロールも標準では持たない(個別付与のみ)」を表す。
function effBaseLv(key) {
  const p = PERMS[key];
  if (!p) return 99;
  const o = PERM_BASE_OVERRIDES[key];
  return o === undefined ? p.baseLv : o;
}
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
  if (lv(u) >= effBaseLv(key)) return true;
  return getPerms(u).includes(key);
}

// ===== アプリ構造ビューア(#/app-structure、管理者専用)向けの静的データ =====
// 画面一覧・APIエンドポイント一覧・テーブルの説明文は、コードから完全自動導出はできない
// (説明文は人が書く必要があるため)。新しい画面/APIを追加したら、PERMS/FEATURE_KEYSと
// 同様にここへも1件追記すること。権限一覧・機能公開キー・DBテーブル構造そのものは
// PERMS/FEATURE_KEYS/実DBスキーマ(sqlite_master)から実行時に自動導出するため、
// これらは追記不要で常に最新の状態を保つ。
const APP_STRUCTURE_ROLES = [
  { key: 'member', label: 'メンツ', level: 0 },
  { key: 'chief', label: 'チーフ', level: 1 },
  { key: 'handler', label: 'チーフ/手配者', level: 2 },
  { key: 'admin', label: 'チーフ/管理者', level: 3 },
];
const APP_STRUCTURE_CRON = [
  { name: 'cronDaichoReload', desc: '台帳再取込(深夜)' },
  { name: 'cronScheduleSources', desc: '予定表ソース取込(深夜/ソースごとの指定時刻)' },
  { name: 'cronRankPromotion', desc: 'ランク昇格の適用(D→C自動昇格の予約日到来分)' },
  { name: 'cronNotify', desc: '新人報告リマインド' },
  { name: 'cronRankCache', desc: '「行った会場/公演」ランキング全員分集計のキャッシュ更新' },
];
const APP_STRUCTURE_PAGES = [
  { hash: '#/home', name: 'ホーム', role: '全員', desc: 'ログイン後の最初の画面。今日から1週間分の予定をスワイプで確認でき、未読通知・承認待ち件数、権限に応じたメニューショートカットを表示する。' },
  { hash: '#/chat', name: 'チャット', role: '全員', desc: 'チャット一覧(全体・課・手配チーム・個人)と、選んだルームのメッセージ画面(#/chat/:id)。ポーリング方式で新着メッセージを取得する。現場ごとのチャットは現場詳細モーダルから、個人チャット(DM)は一覧の「新しいメッセージ」から開始する。チーフ以上は現場詳細モーダルから招待URL/QR(#/g/:token)を発行できる。' },
  { hash: '#/g/:token', name: '現場チャットのゲスト招待ページ', role: '全員(未ログインでも可)', desc: '現場ごとのチャットへの招待URL/QRの遷移先。アプリのログイン状態に関わらず動く専用の入口画面(render()内でTOKEN有無チェックより前に振り分ける)。ログイン中なら通常のアカウントでそのままチャットへ、未ログインならログインするか、名前を入力してゲストとして参加できる。現場当日(JST)以外は利用不可。' },
  { hash: '#/dashboard', name: '管理者ダッシュボード', role: 'dashboard_view権限者', desc: '定期処理(台帳再取込・予定表ソース取込・ランク昇格適用・新人報告リマインド)の最終実行日時、予定表ソースのエラー詳細等、システム状態を一覧表示する。' },
  { hash: '#/schedule', name: 'マイスケジュール', role: '全員', desc: '月間カレンダーで自身(または閲覧権限のある他者)のスケジュールを表示する。日付タップで現場変更報告・休み希望の入力モーダルを開く。member_summary_view権限があれば画面末尾に個人の年間サマリーを表示。「行った会場」「行った公演」ボタン(全員の中での順位表示含む)は誰でも見られるが、そこから会場/公演詳細への遷移と、現場検索バーの利用はsites_view権限(チーフ以上)に限る。月見出しタップで年月を直接選択できる。' },
  { hash: '#/edit', name: 'スケジュール入力', role: '手配者(手配モード中)', desc: '現場へのメンバー一括登録、個人ごとの詳細編集(時刻・業務・休憩等)を行う。' },
  { hash: '#/self-reports', name: '現場変更報告の承認', role: 'handler以上', desc: 'メンツからの現場変更報告を確認し、承認(現場への変更は個別入力/休暇等は一括可)・却下する。現場への変更の承認画面では、対象日に既に登録されている現場があれば一覧から選んで入力を省略できる。' },
  { hash: '#/availability', name: '休み希望・稼働時間の提出', role: '全員', desc: '月間カレンダー形式で、日ごとに休み希望・稼働可能時間(開始/終了/出発地点)を入力する。' },
  { hash: '#/availability-team', name: 'チームの希望一覧', role: 'handler以上', desc: '担当メンバー(管理者は全員)の休み希望・稼働時間の提出状況を日付ごとに確認する。' },
  { hash: '#/nominate', name: 'メンバーを希望する', role: 'chief以上', desc: '自身の現場に、希望するメンバーを選んで指名を送信する。' },
  { hash: '#/nominations', name: 'メンバー指名の承認', role: 'handler以上', desc: '受け取った指名を確認し、承認(スケジュールへ自動追加)・見送りを行う。複数選択して一括処理可能。' },
  { hash: '#/sites', name: '現場一覧', role: 'chief以上', desc: '月間の現場を日付ごとに一覧表示。新人共有🔰・要注意共有⚠️のマークを表示。現場詳細モーダルから、複数日にわたる現場の稼働表、同会場・同アーティストの過去/今後の公演参照を開ける。site_manage権限(手配者以上)があれば現場名・会場の一括改名、まだ配置されていない現場の手動登録・削除ができる(手配モード中)。過去/今後の公演一覧には本人の訪問済みマーカーが付く。「新人リスト」タブでは、台帳取込で見つかった未登録の新人(regnoは3始まりだがusers未登録)を一覧表示し、軽い評価→新人報告への引き上げができる。' },
  { hash: '#/venues', name: '会場一覧', role: 'chief以上', desc: '会場名で検索できる一覧。会場をタップするとその会場の過去/今後の現場を確認でき、現場をタップすると現場詳細が開く。「会場マニュアル」ボタンから#/venue-manualへ遷移する(機能公開設定は既定で準備中のため、通常は管理者のみ到達できる)。site_manage権限があれば会場名の一括改名、マニュアル有無フラグの設定、メンバーリスト(経験者一覧、並び替え対応)の閲覧、グループ分けによる絞り込みができる。' },
  { hash: '#/venue-manual/:venue', name: '会場マニュアル', role: 'sites_view権限者(チーフ以上)', desc: '会場ごとのマニュアルを、テキスト/写真/動画のブロックを自由な位置・サイズで配置して作成する自由配置キャンバス方式の画面。基準幅1000pxの仮想キャンバスに絶対座標で保存し、画面幅に応じてtransform:scale()で一括拡大縮小することでPC/スマホ双方に対応する。追加・移動・リサイズ・削除・保存はsites_view権限者なら誰でも可能(site_manage等の追加権限は不要)。保存操作ごとに、実際に変化したブロックだけ更新履歴(誰が・いつ・何を)に記録される。機能公開設定は既定で「準備中」のため、通常ユーザーには表示されず管理者のみプレビュー・編集できる(2026年8月時点、内容は試作段階)。' },
  { hash: '#/artists', name: '公演一覧(準備中)', role: 'chief以上', desc: '会場一覧と同じ操作感で、現場名から本体名を集計する一覧。フリーワード検索・並び替え、過去/今後の公演参照、メンバーリストに対応。site_manage権限があれば公演名の一括改名・部分置換、グループ分け、フォルダ(複数公演を1件に集約表示)の作成ができる。実運用未確定のため機能公開設定で準備中。' },
  { hash: '#/members', name: 'メンバー一覧', role: 'chief以上', desc: '課・班・手配担当で絞り込んだメンバー一覧。役割・担当手配者等をインライン編集できる。' },
  { hash: '#/summary', name: '稼働サマリー', role: 'chief以上', desc: '出勤日数・連勤・時間の集計。働きすぎ・機会少・同じ現場ばかり等の統計カードをタップしてフィルタできる。' },
  { hash: '#/member-stats', name: 'メンバー分析', role: 'member_stats_view権限者', desc: '拠点・課・班・ランクの構成を、全体・課ごとにリアルタイムで確認する。手配担当ごとの内訳も表示。' },
  { hash: '#/training-status', name: '研修未受講リスト', role: 'member_stats_view権限者', desc: 'マナー研修/チーム研修(2部)/ステージアップ研修(SU)ごとに、まだ受講済みフラグが立っていない人を一覧表示する。停止中アカウントも育成対象として含む(表示上は薄く区別)。' },
  { hash: '#/day-schedule', name: 'スケジュール一覧', role: 'day_schedule_view権限者', desc: '全メンバーの1週間分の予定を、日付×人のマトリックス表(チーフ予定表のような形式)で確認する。' },
  { hash: '#/member-summary/search', name: '個人の年間サマリー(検索)', role: 'member_summary_view権限者(手配者以上)', desc: 'メンバー一覧・氏名/登録番号検索から、年間サマリーを見たい対象を選ぶ入口画面。' },
  { hash: '#/member-summary/:uid', name: '個人の年間サマリー', role: 'member_summary_view権限者(手配者以上)', desc: '対象メンバーの、年度単位(12月始まり〜翌年11月)の月別勤務日数・勤務時間・残業時間・給料(site_pay権限がある場合のみ)の推移とランク進捗を表示。自由記述の備考欄を時系列で確認・追記できる。' },
  { hash: '#/report', name: '新人報告', role: '全員', desc: '新人の1次報告(印象・所感等)を提出する。' },
  { hash: '#/reports', name: '報告一覧', role: '全員', desc: '提出済みの新人報告一覧。獲得課バッジを表示。' },
  { hash: '#/draft', name: 'ドラフト', role: '2次チェック権限者', desc: '2次チェックで「あげる」判定された新人の一覧。' },
  { hash: '#/blacklist', name: 'ブラックリスト', role: 'ブラックリスト管理権限者', desc: '要注意人物の登録・評価一覧。登録済みバッジを表示。' },
  { hash: '#/report-export', name: 'スプレッドシート貼付用コピー', role: 'admin', desc: '新人報告・ブラックリストを期間指定してタブ区切りテキストでコピーする。' },
  { hash: '#/admin', name: 'アカウント管理', role: 'account_manage権限者', desc: 'アカウントの新規作成・編集・停止・削除。複数選択して一括停止/復活が可能。全データ閲覧(users/schedule/history/reports/blacklist/notifications)は件数上限なしの全件を表示・CSV出力する。ログインセッションの一覧は#/handler-statusへ移設した。' },
  { hash: '#/admin-settings', name: 'システム設定', role: 'system_settings権限者', desc: 'PIN、GAS連携トークン、通知設定、時給設定、メンテナンスモード等の各種設定。' },
  { hash: '#/role-permissions', name: '権限の一括設定', role: 'admin', desc: '役割ごとの個別権限をまとめて付与・削除する。役割が標準で持つ権限を個別に剥奪する設定にも対応。' },
  { hash: '#/perm-matrix', name: '個別権限マトリクス', role: 'account_manage権限者', desc: '権限を1つ選ぶと、誰が個別に許可/禁止されているかが一覧できる。チェックボックスで複数人を選び、選んだ人だけまとめて許可・剥奪・個別設定の解除(標準に戻す)ができる(他の個別権限には影響しない)。役割の一括設定(#/role-permissions)が「役割全体」向けなのに対し、こちらは「特定の複数人」向け。' },
  { hash: '#/handler-status', name: 'ログイン中・編集履歴', role: 'handler_tools権限者', desc: '現在ログイン中のメンバー一覧と、スケジュール編集履歴(取り消し操作含む)を確認する。activity_view権限があれば各メンバーが今どの画面を見ているかも確認できる。管理者(role===admin)だけ「全ログインセッション」セクションが追加表示され、稼働中かどうかに関わらず全セッションと最後に見ていたページを、全データ閲覧と同じソート・絞り込み・CSV出力つきの表で確認できる(元は全データ閲覧側にあった機能をこちらへ統合)。' },
  { hash: '#/import', name: 'スプレッドシート取込', role: 'import_data権限者', desc: '台帳・予定表のURLを登録して取込を実行する。台帳ExcelファイルをPCから直接アップロードして取り込むカードもある(常に手動実行、複数ファイル一括・ファイルごとの対象日指定に対応)。' },
  { hash: '#/sched-sources', name: '予定表ソース管理', role: '設定権限者', desc: 'チーフ予定表専用フォーマットの自動取込設定。「担当手配者未設定(チーフ手配)の人はこのソースから取り込まない」オプションを持つ。' },
  { hash: '#/daicho', name: '台帳保管', role: '台帳管理権限者', desc: '取込済みExcelファイルの保管・ダウンロード・削除(複数選択対応)。保存済みファイルを選択して再取込(再アップロード不要)する機能もある。「過去分を新人リストへ反映」ボタン(管理者専用)から、保管済みの全ファイルを読み直して新人リスト(rookie_candidates)へバックフィルできる(scheduleへは書き込まない)。' },
  { hash: '#/calendar-guide', name: 'カレンダー連携のやり方', role: '全員', desc: 'Google/Outlook/Appleカレンダーへの連携手順を案内する専用ページ。' },
  { hash: '#/legacy-import', name: '過去データ取込確認', role: 'admin', desc: '手配帳から外部で再構築した過去の給与実績(2021年6月〜2025年12月分、計55ヶ月)を、管理者だけが閲覧できるデモデータとして月単位で確認する画面。「公開する」でスケジュール本体へ反映、「削除する」で取り消せる。複数月をまとめて公開する機能もある。' },
  { hash: '#/system', name: 'システム管理(ハブ)', role: '管理系のいずれかの権限を持つ人', desc: '管理・運用まわりの入口をまとめた一覧画面。アカウント/権限・運用状況・データ取込/保管・システム設定の4グループに分け、各画面が何をするものかを1行説明つきで並べる。ドロワーの「システム管理」からここに入る(以前は6項目がドロワーに直接並んでいた)。権限が無い項目は表示されない。' },
  { hash: '#/app-structure', name: 'アプリ構造ビューア', role: 'admin', desc: 'このアプリの画面・API・DB・権限モデルの全体構造を確認する開発者向け診断画面。DBテーブル構造は実際のD1から都度取得するため、schema.sqlと本番の食い違い(過去に実際に発生した事故)にも気づける。' },
];
const APP_STRUCTURE_API_GROUPS = [
  { title: '認証・アカウント', rows: [
    ['POST', '/login', '登録番号+パスワードでログイン。ブルートフォース対策(5回失敗で15分ロック)あり'],
    ['POST', '/logout', 'ログアウト(セッション削除)'],
    ['GET', '/me', 'ログイン中ユーザー情報取得(needsUpdateNotice・currentUpdateVersion含む)'],
    ['POST', '/password', 'パスワード変更'],
    ['POST', '/handler-mode', 'PIN照合、手配者モードへ切替'],
    ['DELETE', '/handler-mode', '手配者モード終了'],
    ['GET/POST', '/users', 'アカウント一覧取得・新規作成'],
    ['PATCH', '/users/:id', 'アカウント情報の更新(役割・停止・登録番号・手配グループの有無is_manager等)。役割を下位に変更、またはアカウント停止した場合、対象者を強制ログアウトする'],
    ['DELETE', '/users/:id', 'アカウント削除(管理者のみ)'],
    ['POST', '/users/bulk-suspend', 'アカウントの一括停止/復活'],
    ['GET/PUT', '/users/:id/perms', '個別権限(追加extraPerms・剥奪revokedPerms)の取得・更新'],
    ['GET/PUT', '/role-perms/:role', 'ロール単位の一括権限設定(追加perms・剥奪revokedPerms)'],
    ['GET', '/perm-matrix', '全ユーザーの個別権限(追加/剥奪)一覧を一括取得。個別権限マトリクス画面から使う'],
    ['PUT', '/users/perms/bulk', 'チェックボックスで選んだ複数ユーザーに対し、1つの権限キーだけをまとめて許可/剥奪/解除する(他の個別権限には触れない)'],
    ['PUT', '/perm-base', '権限の基準レベル(どのロールから標準で使えるか)の変更。アプリ構造ビューアの権限マトリクスから使う(管理者専用)'],
    ['POST', '/users/:id/resetpw', 'パスワードの初期化'],
    ['POST', '/users/:id/assess', '査定によるランク変更(C→B/C→A/B→A、即時反映・当月給与も再計算)'],
    ['GET', '/users/:id/rank-history', 'ランク変更履歴の取得(自動昇格・査定・手動変更)'],
  ]},
  { title: 'スケジュール', rows: [
    ['GET', '/schedule', '指定ユーザー・月のスケジュール取得(休憩不足フラグ等も付与、権限により給与情報をマスク)'],
    ['PUT', '/schedule', '1人分のスケジュール保存(手配モード必須)'],
    ['PUT', '/schedule-bulk', '複数人への一括登録'],
    ['PUT', '/site-edit', '既存の現場登録メンバーの一括編集'],
    ['PUT', '/schedule-plan', '育成計画の記入(記入時に本人へ通知)'],
    ['POST', '/schedule-self-report', '本人による現場変更報告(役割により即時反映/承認待ちに分岐)'],
    ['GET', '/self-reports', '承認待ち報告の一覧取得(handler以上)'],
    ['POST', '/self-reports/:id/approve', '承認(現場への変更は詳細入力必須)、本人へ通知'],
    ['POST', '/self-reports/:id/reject', '見送り、本人へ通知'],
    ['POST', '/self-reports/bulk-decide', '複数報告の一括承認/却下(現場への変更は対象外)'],
  ]},
  { title: '休み希望・メンバー指名', rows: [
    ['GET/PUT/DELETE', '/availability', '休み希望・稼働可能時間の取得・保存・削除(本人)'],
    ['GET', '/availability/team', '担当メンバーの希望一覧取得(handler以上)'],
    ['POST', '/site-nominations', 'メンバー指名の送信(chief以上)'],
    ['GET', '/site-nominations', '承認待ちの指名一覧取得(handler以上)'],
    ['POST', '/site-nominations/:id/approve', '指名の承認、対象者のスケジュールに追加'],
    ['POST', '/site-nominations/:id/reject', '指名の見送り'],
    ['POST', '/site-nominations/bulk-decide', '複数指名の一括承認/却下'],
  ]},
  { title: '現場・記録・サマリー', rows: [
    ['GET', '/sites', '月間の現場一覧(新人共有・要注意共有マーク付き。実績が無く手動登録のみの現場も未配置として合わせて返す)'],
    ['GET', '/rookie-candidates', '台帳(実績)取込で見つかった未登録の新人(新人リスト)を取得(sites_view権限)。現場詳細の「新人」ボタンから使うdate+site指定、ダッシュボードの「未評価」から使うpending=1指定、指定が無ければ月単位(既定は当月)の3通り。regnoごとに登場現場・評価履歴をまとめ、除外設定(rookie_excluded)に含まれる人は常に除く'],
    ['POST', '/rookie-candidates/eval', '新人リストの候補者への軽い評価を登録(sites_view権限)。新人報告(POST /reports)への引き上げ前の下書き的な位置づけ'],
    ['POST', '/rookie-candidates/backfill', '保管済みの過去の台帳ファイルをすべて読み直し、新人リストへ反映するバックフィル処理(管理者専用)。scheduleへは書き込まない。body.cursorを使い、done:trueになるまでループ呼び出しする'],
    ['GET', '/rookie-excluded', '新人リストの除外設定(登録番号の一覧)を取得(システム設定、wage_settings権限)'],
    ['POST', '/rookie-excluded', '新人リストの除外設定に登録番号を追加(wage_settings権限)。以後の台帳取込・一覧表示から除外される'],
    ['DELETE', '/rookie-excluded/:regno', '新人リストの除外設定から登録番号を1件解除(wage_settings権限)'],
    ['GET', '/site-members', '指定現場・日のメンバー一覧({list,venue}形式。実績0件の場合はvenueに手動登録側の会場を返す)'],
    ['GET/PUT', '/site-record', '個人の現場記録(配置・休憩・自由記入)の取得・保存'],
    ['GET', '/site-record-breaks', '指定現場・日の全員分の休憩合計(チーフ以上)'],
    ['GET', '/site-roster', '複数日現場の稼働表。同じ現場(または会場)が連続する日程を自動判定し、その期間の人だけを日付×人のマトリックス形式で返す(チーフ以上)'],
    ['GET', '/site-history', '過去/今後の公演一覧(チーフ以上)。currentフィールドで現在閲覧中の現場自体も返す。過去は現場名・会場名の完全一致のみ、今後は同会場・同アーティストのどちらか一致で結合。各行にvisitedを付与'],
    ['GET', '/venues', '会場名の一覧(使用回数・使用日数・最初/最後に使った日付・hasManual。チーフ以上)'],
    ['GET', '/venue-history', '指定した会場の現場一覧を今日を境に過去/今後に分けて返す(チーフ以上)。hasManual・visitedも返す'],
    ['POST', '/venues/bulk-rename', 'チェックした複数の会場名をまとめて統一名称に変更(手配者以上)。site_registry.venue・venue_manuals・site_group_membersも引き継ぐ'],
    ['POST', '/venues/manual-flag', '会場マニュアルの有無フラグを設定(手配者以上)'],
    ['GET', '/venue-manual', '会場マニュアル本文(自由配置キャンバス方式)のブロック一覧・更新履歴を取得(準備中機能、チーフ以上)。ブロック種別はtext/photo/video/shape(図形)/table(簡易表)'],
    ['PUT', '/venue-manual', '会場マニュアル本文を差分保存(追加/変更/削除を判定し、変化したブロックだけ履歴に記録。追加・保存・編集はチーフ以上)。style列(JSON)で文字装飾・図形の塗り/線・表の色等を保持'],
    ['POST', '/venue-manual/upload', '会場マニュアル用の写真/動画をR2(MANUALSバケット)へアップロードしキーを返す(チーフ以上)'],
    ['GET', '/venue-manual/media/:key', '会場マニュアルの写真/動画配信。<img>/<video>から直接読み込むため、セッショントークンをクエリ文字列(?t=)で受け取る専用経路'],
    ['GET', '/venue-members', '指定した会場を経験したことのあるメンバー一覧(チーフ以上)。sortパラメータでcnt/recent/rankに切替可能。停止中アカウントも含む'],
    ['GET', '/member-venues', '指定したメンバーが行ったことのある会場一覧(使用回数・使用日数・最終日。全員が閲覧可能)。各行に、その会場を経験した全員の中での順位(rank/total)と、あと何回で1つ上の順位に並べるか(nextRank/gap)を付与。一覧のタップ先(会場詳細)はsites_view権限(チーフ以上)に限る'],
    ['GET/POST', '/site-groups', '会場・公演のグループ一覧取得・新規作成(kindでvenue/artistを指定)。GETはチーフ以上、POSTは手配者以上'],
    ['PUT/DELETE', '/site-groups/:id', 'グループ名・所属メンバーの更新、グループ自体の削除(手配者以上)'],
    ['GET', '/artists', '公演一覧(準備中、チーフ以上)。現場名から【セクション等】を除いた本体名で集計。グループ・フォルダ所属情報を付与'],
    ['GET', '/artist-history', '指定した公演の現場一覧を過去/今後に分けて返す(準備中、チーフ以上)。対象は本体名一致の表記ゆれ全て。visitedを付与'],
    ['GET', '/artist-members', '指定した公演を経験したことのあるメンバー一覧(準備中、チーフ以上)。sortパラメータ対応'],
    ['GET', '/member-artists', '指定したメンバーが行ったことのある公演一覧(準備中、全員が閲覧可能)。/member-venuesと同様、その公演を経験した全員の中での順位(rank/total)・あと何回で1つ上の順位か(nextRank/gap)を付与。一覧のタップ先(公演詳細)はsites_view権限(チーフ以上)に限る'],
    ['GET', '/member-site-log', '指定したメンバーの現場ログ(1稼働=1行、日付降順。チーフ以上)。集計はせず生ログを返す'],
    ['GET', '/name-site-log', '新人報告・ブラックリスト・新人リストの氏名と同じ名前の過去の現場ログを返す(手配者以上)。アプリ登録済みユーザーはschedule実績から、未登録者はrookie_candidatesから拾い、取込のたびに最新化される。同姓同名は全員分を返す'],
    ['POST', '/artists/bulk-rename', 'チェックした複数の公演名をまとめて統一名称に変更(準備中、手配者以上)。【セクション等】表記は維持'],
    ['POST', '/artists/find-replace', '公演名(本体部分)に含まれる文字列の一部だけを一括置換(準備中、手配者以上)。body.preview=trueでプレビューのみ。body.artistsで対象を絞り込み可(フォルダ内実行時の誤爆防止)'],
    ['GET/POST', '/artist-folders', '公演フォルダの一覧取得・新規作成(準備中)。GETはチーフ以上、POSTは手配者以上'],
    ['PUT/DELETE', '/artist-folders/:id', 'フォルダ名・所属公演の更新、フォルダ自体の削除(手配者以上)'],
    ['POST', '/sites/bulk-rename', 'チェックした複数の(日付,現場名,会場)をまとめて統一名称に変更(手配者以上)'],
    ['POST', '/sites/register', 'まだ誰も配置されていない現場の情報を先に登録し現場一覧に表示させる(手配者以上・手配モード中のみ)'],
    ['DELETE', '/sites/register/:id', '手動登録した現場情報の削除(手配者以上・手配モード中のみ)。台帳取込時、条件を満たせば自動でも削除'],
    ['GET', '/summary', '月間稼働サマリー(同じ現場ばかり検知含む)'],
    ['GET', '/member-year-summary', '個人の年間稼働サマリー(12月始まり〜翌年11月、月別勤務日数・時間・給料。member_summary_view権限)'],
    ['GET/POST', '/member-notes', '個人の備考欄の取得・追加(自由記述、時系列。member_summary_view権限)'],
    ['DELETE', '/member-notes/:id', '備考欄1件の削除(記入者本人または管理者のみ)'],
    ['GET', '/training-status', '研修(マナー研修/チーム研修(2部)/ステージアップ研修)ごとの未受講者一覧(member_stats_view権限)。停止中アカウントも含む'],
  ]},
  { title: 'データ連携', rows: [
    ['POST', '/import-from-url', '台帳スプレッドシートの手動取込。新人報告/ブラックリストとの氏名照合も実行'],
    ['GET/POST', '/import-urls', '保存済み取込先URLの取得・保存'],
    ['GET/PUT/POST', '/sched-sources', '予定表ソースの一覧・追加・個別実行(excludeUnmanagedオプション対応。上書き判定は日単位のスプレッドシート差分ベース)'],
    ['POST', '/import-schedule', 'GAS連携による取込(トークン認証)'],
    ['GET', '/daicho', '台帳保管一覧'],
    ['GET', '/daicho/:id/download', '台帳原本ダウンロード'],
    ['POST', '/daicho/bulk-download', '台帳の一括ダウンロード'],
    ['POST', '/daicho/bulk-delete', '台帳の一括削除'],
    ['POST', '/import-excel-daicho', '台帳ExcelファイルをPCから直接アップロードして取込(複数ファイル一括、ファイルごとに対象日指定可。常に手動実行)'],
    ['POST', '/daicho/reimport-from-archive', '台帳保管に保存済みのファイルから再取込(再アップロード不要。常に手動実行)'],
  ]},
  { title: '新人報告・ブラックリスト', rows: [
    ['POST/GET', '/reports', '新人報告の提出・一覧取得(acquired_ka含む)。POST時にrookie_eval_idを渡すと、新人リストの評価(rookie_quick_evals)にreport_idを紐付ける'],
    ['PATCH', '/reports/:id', '2次チェックの記入'],
    ['DELETE', '/reports/:id', '新人報告の削除(手配者以上)'],
    ['GET/POST', '/blacklist', 'ブラックリストの取得・登録(matched_ka含む)'],
  ]},
  { title: 'システム設定・通知', rows: [
    ['GET', '/dashboard', '管理者ダッシュボード(#/dashboard)の全データ。cron4種の最終実行日、承認待ち件数(新人リストの未評価件数を含む)、当月実績と前月比、直近6ヶ月の推移、当月の日別配置人数、ランク構成、気になる人、データの不備、給与確定状況をまとめて返す'],
    ['GET/PUT', '/wage-rates', '時給テーブルの取得・更新(PUTは新しいeffective_fromの追加も可)'],
    ['POST', '/wage-rates/delete', '時給改定(effective_from)をまるごと削除'],
    ['GET/PUT', '/notify-settings', '新人報告リマインドの設定'],
    ['GET/PUT', '/lock-settings', '給与確定ロックの設定'],
    ['GET/POST', '/settings/maintenance', 'メンテナンスモードの状態取得・切替(切替時に対象者を強制ログアウト)'],
    ['GET/POST', '/settings/feature-status', '画面ごとの公開状態(公開中/準備中/メンテナンス中)の取得・切替(管理者)'],
    ['GET', '/notifications', 'アプリ内通知一覧'],
    ['POST', '/notifications/:id/read', '個別既読化'],
    ['POST/DELETE', '/push-token', 'プッシュ通知トークンの登録・削除'],
    ['GET', '/online', 'ログイン中メンバー一覧。activity_view権限があれば各メンバーの閲覧中ページ(last_page)も含む'],
    ['GET', '/history', 'スケジュール編集履歴(uid指定で個人分のみ取得可、上限500件)'],
    ['POST', '/history/:id/undo', '編集履歴1件の取り消し'],
    ['POST', '/history/undo-batch', '編集履歴の複数一括取り消し(新しい順に処理)'],
    ['POST', '/history/undo-by-ts', '同じ取込実行(タイムスタンプ)で反映された変更をまとめて取り消し'],
    ['GET', '/admin/data', '全テーブルの生データ閲覧(管理者)。件数上限なし(全件返す)。sessionsは「ログイン中・編集履歴」画面(#/handler-status)から呼ばれる(閲覧は管理者のみ)'],
    ['GET', '/legacy-import/months', '過去データ取込確認の月別集計(管理者)'],
    ['GET', '/legacy-import/months/:ym', '過去データ取込確認の月別明細(管理者)'],
    ['POST', '/legacy-import/months/:ym/approve', '過去データを公開(管理者)。名簿と一致した行のみ対象、既存データがある人はスキップ'],
    ['POST', '/legacy-import/months/:ym/reject', '過去データを削除(管理者)。未確認(pending)の行のみ'],
    ['POST', '/legacy-import/months/bulk-approve', '複数月をまとめて公開(管理者)'],
    ['GET/POST/PUT/DELETE', '/non-site-keywords', '非現場キーワードの取得・追加・変更・削除'],
    ['GET/POST/PUT/DELETE', '/report-type-options', '現場変更報告の選択肢の取得・追加・変更・削除'],
    ['POST', '/update-notice/seen', 'アップデートのお知らせを既読にする'],
    ['GET', '/app-structure', 'このアプリ自身の構造データ取得(管理者専用、#/app-structure用)'],
  ]},
  { title: 'チャット', rows: [
    ['GET', '/chat/user-search', '個人チャット(dm)の相手を検索(全員可)。/usersと違いmembers_view権限は不要で、氏名・登録番号のみ返す軽量版'],
    ['GET', '/chat/rooms', '参加中ルーム一覧(全体・課・手配チーム・個人)と各ルームの未読件数を取得(全員可)。ensure=1で課・手配チームルームを未作成でも作成してから返す(#/chat表示時のみ使用。ポーリングでは既存ルームのみ返す軽量版)'],
    ['POST', '/chat/rooms/open', '現場ごと(site)・個人(dm)のルームを開く(無ければ作成)。siteは当日その現場に配置されている本人または管理者のみ、dmは相手ユーザーを指定するだけで開ける'],
    ['GET', '/chat/room', 'ルーム1件の情報(種別・表示名)を取得。アクセス権が無ければ404'],
    ['GET', '/chat/messages', '指定ルームのメッセージ取得。after_id指定でポーリング差分取得、無指定なら最新50件(ルームへのアクセス権が必要)'],
    ['POST', '/chat/messages', 'メッセージ送信(ルームへのアクセス権が必要、2000字まで)'],
    ['POST', '/chat/read', '既読位置(last_read_message_id)の更新(ルームへのアクセス権が必要)'],
    ['POST', '/chat/rooms/guest-link', '現場ごとのチャットに、アプリアカウントを持たない人が参加できる招待URL/QR用のトークンを発行(無ければ作成、あれば既存を返す)。チーフ以上かつそのルームへのアクセス権がある人のみ'],
    ['GET', '/guest-chat/:token', '招待トークンからルーム情報(現場名・日付・当日かどうか)を取得(認証不要)'],
    ['POST', '/guest-chat/:token/join', 'ゲストとして参加し、device_tokenを発行(認証不要)。現場当日(JST)以外は404/403'],
    ['GET', '/guest-chat/:token/messages', 'ゲストとしてメッセージ取得。after_id指定でポーリング差分取得(認証不要、device_tokenで本人確認)'],
    ['POST', '/guest-chat/:token/messages', 'ゲストとしてメッセージ送信(認証不要、device_tokenで本人確認、2000字まで)'],
  ]},
  { title: 'Googleカレンダー連携', rows: [
    ['GET/POST', '/calendar-token', 'カレンダー購読トークンの取得・発行'],
    ['POST', '/calendar-token/regenerate', 'カレンダー購読トークンの再発行(旧URL無効化)'],
    ['GET', '/calendar/:token.ics', 'iCalendar形式のスケジュール配信(認証不要・トークンで本人確認)'],
  ]},
];
// テーブル名 → 用途の一言説明(schema.sql冒頭コメントの要約。列自体はsqlite_masterから自動取得するため
// ここでは概要のみを持たせる。新しいテーブルを追加したら1行追記する)
const APP_STRUCTURE_TABLE_COMMENTS = {
  users: 'ユーザーアカウント(基本情報・権限・ランク・研修状況)',
  sessions: 'ログインセッション(手配モード状態・最終アクセス・閲覧中ページ)',
  schedule: 'スケジュール本体。1日に複数現場を持てる(id採番+slotで同日内の順番)',
  dev_plan: '育成計画(人×日単位、現場が複数でも1日1つ)',
  member_notes: 'メンバーごとの備考欄(自由記述、時系列、記入者付き)',
  schedule_history: 'スケジュール編集履歴(取り消し機能の元データ)',
  reports: '新人報告(1次所感・2次チェック)',
  blacklist: 'ブラックリスト(要注意人物の登録・評価)',
  notifications: 'アプリ内通知',
  push_tokens: 'プッシュ通知用デバイストークン(アプリ版・ブラウザ版共通管理)',
  self_reports: '本人による現場変更の報告(メンツは承認必要、チーフ以上は即時反映)',
  settings: '汎用キー・バリュー設定',
  wage_rates: '時給テーブル(効力発生日つき・編集可)',
  duty_map: '業務名→料金区分の対応表(編集可)',
  daicho_archive: '取り込んだ台帳(元Excel)の保管インデックス。実ファイルはR2、ここはメタ情報のみ',
  import_snapshots: '予定表自動取込の前回内容スナップショット(差分判定用)',
  sched_sources: '予定表の自動取り込みソース管理',
  site_records: '現場記録(個人が自分の現場ごとに残す配置・休憩・自由記入)',
  option_lists: 'スタッフ登録時のプルダウン選択肢(所属課・班)',
  non_site_keywords: '台帳・予定表取込時に「現場名」ではなく特別な状態として扱う文言(×・休暇・1日OK等)',
  report_type_options: '現場変更報告モーダルの変更内容プルダウン選択肢',
  availability_requests: '休み希望・稼働可能時間の提出',
  site_nominations: 'チーフ以上による現場メンバー指名',
  rookie_site_matches: '台帳取込時、新人報告/ブラックリスト対象者と同姓同名が現場に入っていた検知記録',
  rookie_candidates: '新人リスト。台帳(実績)取込時、登録番号は3始まり(RB管轄)なのにusersに存在しない未登録の新人を拾い上げたもの',
  rookie_quick_evals: '新人リストの候補者への軽い評価(新人報告の2次チェックと同じ尺度)。新人報告へ引き上げた場合report_idを記録',
  site_registry: '現場一覧に未配置のまま表示するための現場情報の手動登録',
  venue_manuals: '会場マニュアルの有無フラグ(会場一覧のバッジ表示用。実際の本文はvenue_manual_blocksが持つ数から自動同期される)',
  venue_manual_blocks: '会場マニュアル本文の各ブロック(テキスト/写真/動画/図形/表)。x/y/w/hは基準幅1000pxの仮想キャンバスに対する絶対座標・サイズで自由配置レイアウトを表現。styleに文字装飾・図形の塗り/線・表の色等をJSONで保持',
  venue_manual_history: '会場マニュアルの更新履歴(誰が・いつ・どのブロックに何をしたか)',
  login_attempts: 'ログイン失敗回数の記録(ブルートフォース対策)',
  rank_history: 'ランク変更履歴(自動昇格・査定・手動変更)',
  legacy_import_shifts: '過去データ(手配帳から外部で再構築した給与実績)の取込ステージング',
  site_groups: '会場一覧・公演一覧共通のグループ機能',
  site_group_members: 'site_groupsの所属メンバー(会場名/公演名)',
  artist_folders: '公演一覧限定のフォルダ機能(複数公演を1件に集約表示)',
  artist_folder_members: 'artist_foldersの所属公演',
  chat_rooms: 'チャットルーム。typeで種別(all=全体/manager=手配チーム/ka=課/site=現場ごと/dm=個人)を区別し、ref_keyで種別内の対象を特定する。site種別はguest_tokenを発行するとゲスト招待URL/QRの識別子になる',
  chat_messages: 'チャットメッセージ本体。guest_idが設定されていればゲスト送信(sender_idはNULL)',
  chat_reads: 'ユーザーごとのルーム別既読位置(未読件数の算出に使用)',
  chat_guests: '現場ごとのチャットにアプリアカウント無しで参加する人のゲスト識別子。device_tokenをブラウザに保存し、以後の閲覧・投稿を紐付ける',
};
// ファイル構成・依存関係(#/app-structureの「ファイル構成」タブ用。静的な説明文)
const APP_STRUCTURE_FILES = [
  { name: 'public/index.html', role: 'エントリーポイント', desc: 'app.js・style.cssを読み込むだけの最小限のHTML。画面自体はapp.jsが全て動的に生成する。', dependsOn: [] },
  { name: 'public/app.js', role: 'フロントエンド本体', desc: '全画面(page関数)・全モーダル(open関数)・ルーティング(location.hashの監視)を含む単一ファイル。共通api()関数経由でsrc/index.tsの全APIを呼び出す。PERM_BASE_LV/FEATURE_LABELSはsrc/index.tsのPERMS/FEATURE_KEYSと対になっており、両方に追記しないと権限判定がフロント/バックエンドで食い違う。', dependsOn: ['public/index.html', 'public/style.css'] },
  { name: 'public/style.css', role: '見た目(CSS)', desc: 'app.jsが生成するHTML全体のスタイル。ビルド工程が無いため、app.jsのクラス名と1対1で対応させる必要がある。', dependsOn: [] },
  { name: 'src/index.ts', role: 'バックエンド本体(Cloudflare Worker)', desc: 'fetch()ハンドラでAPIルーティングと静的ファイル配信、scheduled()ハンドラで4種類のcron処理を行う単一ファイル。D1(env.DB)・R2(ファイル保管用バケット)にアクセスする。2026年8月にJavaScriptからTypeScript化(拡張子.js→.ts)。tsconfig.jsonはstrict:false/noImplicitAny:falseの緩い設定にしており、既存コードの動作を変えない範囲で型付けしている(全面的な厳密型付けは目的にしていない)。', dependsOn: ['src/lib/xlsxParser.ts'] },
  { name: 'src/lib/xlsxParser.ts', role: 'xlsxバイト列パーサー', desc: 'xlsx(zip化されたOffice Open XML)をバイト列から直接パースする、env/DBに依存しない純粋なロジックだけを切り出したファイル。2026年8月、バックエンド部分TypeScript化の第一弾として、後発のsrc/index.tsのTypeScript化に先行して型付けされた。フォーマットC/AB/D固有の業務ルールはsrc/index.ts側が担う。', dependsOn: [] },
  { name: 'schema.sql', role: '新規DB構築用スキーマ', desc: 'D1データベースを新規構築する際に一度だけ流し込む、全テーブル分の完全なCREATE TABLE定義(テーブル数は上記「DB」タブの実データ参照)。デプロイのたびに自動実行されるものではない(本番は既に構築済み)。', dependsOn: [] },
  { name: 'migrate-*.sql', role: '既存環境向けマイグレーション', desc: '機能追加のたびに作成する差分SQL(ALTER TABLE等)。コードのデプロイより先に本番D1へ手動実行する運用。1機能=1ファイル。', dependsOn: ['schema.sql'] },
  { name: 'wrangler.toml', role: 'Cloudflare設定', desc: 'D1(schedule-db)・R2バインディング、Cron実行スケジュール(毎時0分)を定義する。src/index.tsのenv.DB/env経由のアクセス先を決めている。mainフィールドがsrc/index.tsを指し、wranglerが内蔵のesbuildでTypeScriptを直接バンドルする(別途ビルドコマンドは不要)。', dependsOn: [] },
];

async function getSetting(env, key, def) {
  const r = await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(key).first().catch(() => null);
  return r ? r.value : def;
}

// 保存済み取り込みURL(import_urls)から、指定したURL群を取り除いて保存し直す。
// 台帳の深夜自動再取り込み完了後の使い捨て削除(cronDaichoReload)と、
// 手動削除(POST /import-urls/delete)の両方から使う共通処理。
async function removeImportUrls(env, urlsToRemove) {
  if (!urlsToRemove || !urlsToRemove.length) return;
  const savedRaw = JSON.parse(await getSetting(env, 'import_urls', '[]') || '[]');
  const saved = savedRaw.map(x => typeof x === 'string' ? { url: x, sheetTitle: '', savedAt: '', targetDate: '' } : x);
  const next = saved.filter(x => !urlsToRemove.includes(x.url));
  await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('import_urls',?)").bind(JSON.stringify(next)).run();
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
// ゲスト招待リンク(#/g/:token)専用の短いトークン(32桁16進、128bit)。QRコードに収まる長さに保つため
// rnd()(128桁)より短くしている。URLに載せて共有する用途のため、単独では推測困難な長さを確保しつつ
// 短くする、というトレードオフ。
const rndShort = () => crypto.randomUUID().replace(/-/g, '');

async function pbkdf2(pw, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// アプリの機能アップデートのお知らせに使うバージョン番号。新しいお知らせを追加したら値を増やし、
// updateNoticeContent()にも内容を追記する。既にパスワードを変更済み(must_change=0)の既存ユーザーが
// ログインした際、seen_update_version がこれより小さければ「アップデートのお知らせ」を表示する。
const CURRENT_UPDATE_VERSION = 13;

const pub = u => ({ id: u.id, regno: u.regno, name: u.name, role: u.role, rank: u.rank, ka: u.ka, han: u.han, station: u.station, skills: u.skills, manager_id: u.manager_id, suspended: u.suspended ? 1 : 0, must_change: u.must_change ? 1 : 0, extra_perms: getPerms(u), revoked_perms: getRevokedPerms(u), notify_rookie: u.notify_rookie === null || u.notify_rookie === undefined ? null : (u.notify_rookie ? 1 : 0), is_manager: u.is_manager ? 1 : 0, manner_done: u.manner_done ? 1 : 0, team2_done: u.team2_done ? 1 : 0, su_done: u.su_done ? 1 : 0, graduate_flag: u.graduate_flag ? 1 : 0, promotion_pending_date: u.promotion_pending_date || null, promotion_pending_rank: u.promotion_pending_rank || null, needsUpdateNotice: !u.must_change && (u.seen_update_version || 0) < CURRENT_UPDATE_VERSION, seenUpdateVersion: u.seen_update_version || 0, currentUpdateVersion: CURRENT_UPDATE_VERSION });

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
  const byRegno: Record<string, any> = {}; // regno -> { manner?: date, team2?: date, su?: date }(同一取込内では最新日を残す)
  for (const r of rows) {
    const training = detectTraining(r.site);
    if (!training) continue;
    const regno = normRegno(r.regno);
    if (!regno) continue;
    const date = String(r.date || '').trim();
    const g = byRegno[regno] ||= {};
    if (date && (!g[training] || date > g[training])) g[training] = date;
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

  for (const u of users as any[]) {
    const trainings = byRegno[normRegno(u.regno)];
    if (!trainings) continue;
    const R = rankLetter(u.rank);
    // マナー研修: Eランクの人のみ対象。受講したら、翌日からDランクへ昇格予約
    if (trainings.manner && !u.manner_done && R === 'E') {
      await env.DB.prepare('UPDATE users SET manner_done=1, manner_date=?, promotion_pending_date=?, promotion_pending_rank=? WHERE id=?')
        .bind(trainings.manner, tomorrow, 'D', u.id).run();
      continue; // マナー研修とチーム研修/SUは対象ランクが異なるため、同時該当は通常ない
    }
    // チーム研修(2部)・ステージアップ研修(SU): Dランクの人のみ対象。両方受講したら、翌月1日にCランクへ昇格予約
    if (R === 'D') {
      const team2Done = trainings.team2 ? 1 : u.team2_done;
      const suDone = trainings.su ? 1 : u.su_done;
      if (team2Done !== u.team2_done || suDone !== u.su_done) {
        if (team2Done && suDone) {
          await env.DB.prepare('UPDATE users SET team2_done=?, su_done=?, team2_date=COALESCE(?,team2_date), su_date=COALESCE(?,su_date), promotion_pending_date=?, promotion_pending_rank=? WHERE id=?')
            .bind(team2Done, suDone, trainings.team2 || null, trainings.su || null, nextMonth1st, 'C', u.id).run();
        } else {
          await env.DB.prepare('UPDATE users SET team2_done=?, su_done=?, team2_date=COALESCE(?,team2_date), su_date=COALESCE(?,su_date) WHERE id=?')
            .bind(team2Done, suDone, trainings.team2 || null, trainings.su || null, u.id).run();
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
async function importScheduleSheet(env, source, url, editorId, fromDate, opt: any = {}) {
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

// 会場詳細・現場詳細・公演詳細の履歴一覧に、閲覧中の本人が実際に行ったことのある(date,site)かどうかの
// visitedフラグを付与する。同じ会場・アーティストでも、その日その現場に本人が入っていなければ対象外。
async function markVisited(env, meId, rows) {
  if (!rows.length) return rows;
  // 対象行のdateをIN句で1件ずつ列挙すると、行数(=会場履歴等ではLIMIT 200まで)がそのまま
  // バインド変数の数になり、D1のバインド変数上限を超えてサーバーエラーになる事故があった。
  // 対象はどうせ1人分のscheduleかつ日付範囲は連続しているとは限らないが件数自体は少ないため、
  // 最小日付〜最大日付の範囲(BETWEEN、常に2変数)で取得してからJS側で絞り込む方式に変更した。
  let minDate = rows[0].date, maxDate = rows[0].date;
  for (const r of rows) { if (r.date < minDate) minDate = r.date; if (r.date > maxDate) maxDate = r.date; }
  const myRows = (await env.DB.prepare("SELECT DISTINCT date, site FROM schedule WHERE user_id=? AND type='work' AND date>=? AND date<=?").bind(meId, minDate, maxDate).all()).results;
  const mySet = new Set(myRows.map(r => r.date + '|' + r.site));
  return rows.map(r => ({ ...r, visited: mySet.has(r.date + '|' + r.site) }));
}

// 過去データ取込確認の「公開する」1ヶ月分の処理。単一月のPOST /legacy-import/months/:ym/approveと、
// まとめて公開するPOST /legacy-import/months/bulk-approveの両方から呼ばれる共通処理。
// (user_id,date)単位でグルーピングし、既にその日にscheduleがあればスキップ、無ければ挿入してschedule_historyに記録する。
async function approveLegacyMonth(env, me, ym) {
  const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
  const rows = (await env.DB.prepare("SELECT * FROM legacy_import_shifts WHERE ym=? AND status='pending' ORDER BY user_id, date, id").bind(ym).all()).results;
  const ts = jstTs();
  const groups = {};
  let unmatched = 0;
  for (const r of rows) {
    if (!r.user_id) { unmatched++; continue; }
    (groups[r.user_id + '|' + r.date] ||= []).push(r);
  }
  const batch = [];
  let approved = 0, skipped = 0;
  for (const key in groups) {
    const grp = groups[key];
    const [uidStr, date] = key.split('|');
    const uid = Number(uidStr);
    const existing = await env.DB.prepare('SELECT COUNT(*) AS c FROM schedule WHERE user_id=? AND date=?').bind(uid, date).first();
    if (existing.c > 0) {
      for (const r of grp) batch.push(env.DB.prepare("UPDATE legacy_import_shifts SET status='skipped' WHERE id=?").bind(r.id));
      skipped += grp.length;
      continue;
    }
    let slot = 0;
    const afterSlots = [];
    for (const r of grp) {
      const slotData = { type: 'work', site: r.site || '', venue: r.venue || '', tin: r.tin || '', tout: r.tout || '', hours: r.hours || 0, overtime: 0, pay: r.pay || 0, note: r.note || '', duty: r.duty || '', load_end: '', show_end: '', multi: 0 };
      batch.push(env.DB.prepare('INSERT INTO schedule(user_id,date,slot,type,site,venue,tin,tout,hours,overtime,pay,note,duty,load_end,show_end,multi) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(uid, date, slot, slotData.type, slotData.site, slotData.venue, slotData.tin, slotData.tout, slotData.hours, slotData.overtime, slotData.pay, slotData.note, slotData.duty, slotData.load_end, slotData.show_end, slotData.multi));
      batch.push(env.DB.prepare("UPDATE legacy_import_shifts SET status='approved' WHERE id=?").bind(r.id));
      afterSlots.push(stripRow(slotData));
      slot++;
    }
    batch.push(env.DB.prepare('INSERT INTO schedule_history(ts,editor_id,target_id,date,before_json,after_json) VALUES(?,?,?,?,?,?)')
      .bind(ts, me.id, uid, date, JSON.stringify([]), JSON.stringify({ slots: afterSlots, _src: `過去データ取込確認(${ym}を公開)` })));
    approved += grp.length;
  }
  if (batch.length) for (const part of chunk(batch, 100)) await env.DB.batch(part);
  return { approved, skipped, unmatched };
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
  // 当日(JST)はまだ台帳の入力が完了していない(その日の勤務がまさに進行中)ため、
  // 「台帳に載っていない=不在」とは判定できない。判定対象は「完全に終わった過去の日」に限定する
  // (深夜0時台に自動実行される際、日付が変わった直後は取り込んだ行に新しい当日分がまだ僅かしか
  // 含まれておらず、これから出勤する人まで誤って休暇化してしまう事故が実際に起きたため)。
  const today = jstDate();
  const dates = Object.keys(datesRegnos).filter(d => d < today);
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
  // clearAbsentFromDaicho と同じ理由(当日はまだ台帳の入力が完了していない)で、当日(JST)は対象外とする。
  const today = jstDate();
  const dates = Object.keys(datesSites).filter(d => d < today);
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

// 新人リストから除外する登録番号の一覧(誤検知の恒久的な除外用、settingsテーブルに保存)。
// 台帳に載っているが実際は新人ではない人(表記の都合等)を、管理者がシステム設定から個別に除外できる。
async function getRookieExcluded(env) {
  return JSON.parse(await getSetting(env, 'rookie_excluded', '[]') || '[]');
}

// 台帳(実績)取込時、登録番号が3から始まる6桁(RB管轄)のに users に存在しない=まだアプリ未登録の
// 新人が現場に入っていた行を rookie_candidates へ拾い上げる(applyImportRows は本来この行を
// 未登録エラーとして捨てるだけだった)。現場詳細の「新人」ボタン(GET /rookie-candidates)用。
async function upsertRookieCandidates(env, rows, userByRegno) {
  const excluded = new Set((await getRookieExcluded(env)).map((x: any) => x.regno));
  const seen = {}; // (regno,date,site) 単位で1回だけ処理すれば十分
  const ts = jstTs();
  const batch = [];
  for (const r of rows) {
    const regno = normRegno(r.regno);
    const date = String(r.date || '').trim();
    if (!regno || !date || !/^3\d{5}$/.test(regno) || excluded.has(regno)) continue;
    if (r.org !== undefined && r.org !== '' && !/^RB/i.test(r.org)) continue;
    if (userByRegno[regno]) continue; // 既にアプリ登録済みなら対象外
    const site = String(r.site || '').trim();
    const key = regno + '|' + date + '|' + site;
    if (seen[key]) continue; seen[key] = 1;
    // r.name(parseFormatD)/r.personName(parseFormatC)のどちらかに氏名が入る。parseFormatAB(手配管理表)は
    // 登録番号列しか持たないため、その場合は空文字のまま(評価・新人報告画面で手入力してもらう)。
    const personName = String(r.name || r.personName || '').trim();
    // name_norm(空白除去済みの氏名)を併せて保存し、GET /name-site-logがrookie_candidates全件を
    // フルスキャンせずインデックスで絞り込めるようにする(name自体は空白の入り方が人によって
    // バラバラなため、素のnameへの索引だけでは同一人物の表記ゆれを拾えない)。
    batch.push(env.DB.prepare(
      `INSERT INTO rookie_candidates(regno,name,name_norm,date,site,venue,first_seen_ts,last_seen_ts) VALUES(?,?,?,?,?,?,?,?)
       ON CONFLICT(regno,date,site) DO UPDATE SET
         name=COALESCE(NULLIF(excluded.name,''),name),
         name_norm=COALESCE(NULLIF(excluded.name_norm,''),name_norm),
         venue=excluded.venue, last_seen_ts=excluded.last_seen_ts`
    ).bind(regno, personName, normName(personName), date, site, String(r.venue || '').trim(), ts, ts));
  }
  if (batch.length) {
    const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
    for (const part of chunk(batch, 200)) await env.DB.batch(part);
  }
  return batch.length;
}

async function applyImportRows(env, rows, editorId, mode = 'replace-person-day', srcLabel = 'spreadsheet', isDaicho = false, opt: any = {}) {
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
    // 1日に入れられる現場の数は、取込元によって前提が異なる。
    //  ・台帳(実績、isDaicho=true): 掛け持ちが実際に起こりうるため複数の現場を許容する。
    //    ただし「複数日・複数タブのデータが誤って1日に混入した」パース事故を検知する安全網は残し、
    //    現実的にありえない件数を超えた場合だけスキップする(過去に実際に起きた事故のため)。
    //  ・予定表ソース取込(isDaicho=false): 予定表は1日1現場で運用されているため、
    //    2件以上検出された時点でパースミスの兆候とみなし、従来どおり書き込まずスキップする。
    // 誤ったデータをDBに書き込む方が実害が大きいので、超過時は安全側に倒してこの日は一切触らない。
    const MAX_WORK_PER_DAY = isDaicho ? 4 : 1;   // 掛け持ちは多くても3〜4件。これを超えたら異常とみなす
    const MAX_ITEMS_PER_DAY = isDaicho ? 8 : 5;  // 休暇・×等も含めた1日あたりの総件数の上限
    const workItems = mergedItems.filter(m => m.type === 'work');
    if (workItems.length > MAX_WORK_PER_DAY || mergedItems.length >= MAX_ITEMS_PER_DAY) {
      const preview = mergedItems.slice(0, 4).map(m => m.type === 'work' ? (m.site || '(現場名なし)') : m.type).join('/');
      errors.push(`${name || uid}さん ${date}: 1日に${workItems.length}件の現場データが検出されました。${isDaicho ? `掛け持ちの上限(${MAX_WORK_PER_DAY}件)を超えており` : '予定表は1日1現場が前提のため'}、データ異常の可能性があるとしてスキップしました(例: ${preview}${mergedItems.length > 4 ? '...' : ''})`);
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
  // 台帳(実績)取込の場合のみ、未登録の新人を新人リストへ拾い上げる(予定表ソース取込では対象外)。
  if (isDaicho) { try { await upsertRookieCandidates(env, rows, userByRegno); } catch (e) { errors.push('新人リストの更新でエラー: ' + e.message); } }
  return { applied, skipped, skippedUnregistered, skippedUnchanged, skippedInvalid, skippedOtherOrg, skippedUnassigned, errors, changes, ts };
}

// 氏名比較用の正規化(空白除去のみ)。新人報告・ブラックリストの氏名(自由記述)を、
// users.nameや他の氏名と突き合わせる箇所で共通して使う。
const normName = s => String(s || '').replace(/[\s　]/g, '');

// 新しくアカウントが作成された時、氏名が一致する新人報告・ブラックリストのレコードに
// 所属課を記録する(「新人報告→ドラフト→登録」を飛ばして直接登録された場合の後追い対応)。
// これにより、該当レコードは新人共有・ブラックリスト共有(matchRookieAndBlacklist)の対象から外れる。
async function markAcquiredByName(env, name, ka) {
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

// 新人報告・ブラックリストが新規登録された直後、これまでの全期間のscheduleデータに対して
// 即座に氏名照合を行う。matchRookieAndBlacklist()は以後の新規取込行にしか反応しないため、
// これを呼ばないと「提出時点で既に過去の実績がある対象者」が現場一覧に一切出てこない
// (次に何かインポートが走るまで気づけない)ことになるため、提出APIから都度呼び出す。
async function matchNameAgainstFullHistory(env, name) {
  const key = normName(name);
  if (!key) return;
  const users = (await env.DB.prepare('SELECT id, name FROM users').all()).results;
  const matchedUsers = users.filter(u => normName(u.name) === key);
  if (!matchedUsers.length) return;
  const ids = matchedUsers.map(u => u.id);
  const ph = ids.map(() => '?').join(',');
  const rows = (await env.DB.prepare(
    `SELECT date, site, venue FROM schedule WHERE type='work' AND user_id IN (${ph}) AND site<>''`
  ).bind(...ids).all()).results;
  await matchRookieAndBlacklist(env, rows.map(r => ({ personName: name, date: r.date, site: r.site, venue: r.venue })));
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
// (実体は src/lib/xlsxParser.ts の parseXlsxBuffer。ここでは冒頭でimportしたものを使う)

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

// 台帳Excel(xlsxバイナリ)を解析し、パース結果(全シート分の行・シートごとの読み取り件数)を返す。
// DBへの反映(applyImportRows/upsertRookieCandidates)は行わない純粋なパース処理で、
// processDaichoExcelBuffer(通常取込)とbackfillRookieCandidatesFromArchive(過去分の
// 新人リスト反映)の両方から共通で呼ばれる。
async function parseDaichoExcelBuffer(env, buf, fileName, targetDate, keywordMap) {
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
  return { allRows, sheetReport };
}

// 台帳Excel(xlsxバイナリ)を解析し、DBへ反映する共通処理。
// アップロードされたファイル(POST /import-excel-daicho)、台帳保管から再取込するファイル
// (POST /daicho/reimport-from-archive)、両方から共通で呼ばれる。
// R2への保存や通知等、呼び出し元ごとに異なる後処理は、この関数の外側で行う。
async function processDaichoExcelBuffer(env, buf, fileName, targetDate, editorId, keywordMap) {
  const { allRows, sheetReport } = await parseDaichoExcelBuffer(env, buf, fileName, targetDate, keywordMap);
  if (!allRows.length) return { ok: false, error: 'データを読み取れませんでした', sheetReport };
  const r = await applyImportRows(env, allRows, editorId, 'replace-person-day', `台帳Excel取込(${fileName})`, true);
  return { ok: true, applied: r.applied, changes: r.changes || [], ts: r.ts, allRows, sheetReport };
}

// parseSharedStrings/colToIdx/parseSheetXml/unescapeXml/unzip/inflateRaw は
// src/lib/xlsxParser.ts に切り出した(parseXlsxBuffer内部でのみ使われていたため)。

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

// 公演一覧(旧アーティスト一覧)用: 現場名を「本体(公演名)」と「【セクション等】表記」に分解する。
// 末尾「〇〇【△△】」・先頭「【△△】〇〇」のどちらの表記にも対応する(表記統一前のデータもあるため)。
// どちらでもない場合はbracket=''。extractArtistName()とrebuildSiteName()はこれを介した逆関係にある
// (rebuildSiteName(site, extractArtistName(site)) === site が常に成り立つ)。
function splitSiteBracket(site) {
  const s = String(site || '').trim();
  let m = s.match(/^(.*?)\s*(【[^】]*】)\s*$/); // 末尾の「【...】」を検出
  if (m && m[1].trim()) return { base: m[1].trim(), bracket: m[2], pos: 'suffix' };
  m = s.match(/^(【[^】]*】)\s*(.*)$/); // 先頭の「【...】」を検出
  if (m && m[2].trim()) return { base: m[2].trim(), bracket: m[1], pos: 'prefix' };
  return { base: s, bracket: '', pos: 'none' };
}
// 現場名から【】部分を除いた本体名(公演名)を抽出する。除去結果が空文字になる場合
// (現場名自体が【】だけ等)は元の文字列を返す(安全策)。
function extractArtistName(site) {
  const s = String(site || '').trim();
  if (!s) return s;
  return splitSiteBracket(s).base || s;
}
// 公演名(本体名)が一致する現場名の表記ゆれ一覧を返す(/artist-history・/artist-membersで使用)。
// 以前は毎回SELECT DISTINCT siteでschedule全件をスキャンして絞り込んでいたが、
// 1時間おきのcron(cronRankCache)が事前計算したキャッシュ(settings)を使うよう変更した。
// キャッシュがまだ無い場合(デプロイ直後等)だけ、その場でスキャンする。
async function siteVariantsForArtist(env, artist) {
  const cached = await getSetting(env, 'site_variants_cache', '');
  if (cached) {
    try {
      const map = JSON.parse(cached);
      if (Object.keys(map).length) return map[artist] || [];
    } catch (e) {}
  }
  const siteRows = (await env.DB.prepare("SELECT DISTINCT site FROM schedule WHERE type='work' AND site<>''").all()).results;
  return siteRows.map(r => r.site).filter(s => extractArtistName(s) === artist);
}
// 「行った会場/公演」一覧の各行に添える順位情報。valuesは同じ会場/公演を経験した全員の回数一覧、
// myValueは対象者本人の回数。rankは同数タイは同順位、次はタイ人数分飛ぶ標準的な順位付け
// (例: [10,10,8,5]で8の人は3位)。gapは「あと何回で1つ上の順位に並べるか」(タイで足りるため+1しない)。
function rankInfo(values, myValue) {
  let greater = 0, nextCnt = null;
  for (const v of values) {
    if (v > myValue) { greater++; if (nextCnt === null || v < nextCnt) nextCnt = v; }
  }
  const rank = greater + 1;
  const total = values.length;
  const nextRank = nextCnt !== null ? values.filter(v => v > nextCnt).length + 1 : null;
  const gap = nextCnt !== null ? nextCnt - myValue : null;
  return { rank, total, nextRank, gap };
}
// 現場名の本体名(公演名)だけを新しい名前に差し替え、【セクション等】表記はそのまま維持する。
function rebuildSiteName(site, newArtist) {
  const { bracket, pos } = splitSiteBracket(site);
  if (pos === 'suffix') return `${newArtist}${bracket}`;
  if (pos === 'prefix') return `${bracket}${newArtist}`;
  return newArtist;
}

// 公演一覧の一括改名・一部置換の共通適用処理。renameMap(旧site→新site)を受け取り、
// 該当する(user_id,date)ごとに全スロットを取得してDELETE→INSERTし直し、schedule_historyに記録する。
// site_registryのsite列も同時に更新する。venues/bulk-renameと同じ手順だが、venue列ではなくsite列、
// かつ「複数の旧名→1つの新名」ではなく「複数の旧site→それぞれ異なる新site」という1対1マッピングを扱う点が異なる。
// artistRenameMap(旧公演名→新公演名)を渡すと、その公演名をメンバーに含むグループ(site_group_members、
// kind='artist')・フォルダ(artist_folder_members)のメンバー名も同時に付け替える(渡さなければスキップ)。
async function applyArtistRenameMap(env, me, renameMap, srcLabel, artistRenameMap) {
  const oldSites = Object.keys(renameMap);
  if (!oldSites.length) return { updatedDays: 0 };

  const ts = jstTs();
  const batch = [];
  const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
  // 「公演名の一部を置換」は、対象の公演名を含む現場名(【セクション等】表記違いを全部含む)を
  // 丸ごとrenameMapに詰めるため、ヒットする公演によってはoldSitesが100件を超えうる。
  // 1回のIN句に全件を渡すとD1のバインド変数上限を超えてサーバーエラーになる事故が過去にあった
  // (markVisitedと同じ問題)ため、安全なサイズにチャンク化して取得する。
  const targetKeys = new Set();
  const targets = [];
  for (const part of chunk(oldSites, 50)) {
    const ph = part.map(() => '?').join(',');
    const rows = (await env.DB.prepare(
      `SELECT DISTINCT user_id, date FROM schedule WHERE type='work' AND site IN (${ph})`
    ).bind(...part).all()).results;
    // チャンクを跨いで同じ(user_id,date)が重複しうる(異なる旧site名が同じ日に一致する場合)ため、
    // 元の単一クエリのDISTINCTと同じ結果になるようここで重複除去する。
    for (const r of rows) {
      const key = r.user_id + '|' + r.date;
      if (targetKeys.has(key)) continue;
      targetKeys.add(key);
      targets.push(r);
    }
  }

  // targets 1件ごとに個別SELECTすると(applyImportRowsが以前そうしていたのと同じ理由で)、
  // 対象が数百件規模になった際に逐次awaitの待ち時間が積み上がりCPU/実行時間の上限に達して
  // サーバーエラーになる。user_id・dateをそれぞれチャンク化した上でのIN×IN(直積)で
  // まとめて1回で取得し、以降はメモリ上のMapから引く方式に統一する。
  const beforeMap = {}; // key "uid|date" -> rows[]
  if (targets.length) {
    const uidsAll = [...new Set(targets.map(t => t.user_id))];
    const datesAll = [...new Set(targets.map(t => t.date))];
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

  let updatedDays = 0;
  for (const { user_id, date } of targets) {
    const before = beforeMap[user_id + '|' + date] || [];
    const beforeJson = JSON.stringify(before.map(stripRow));
    const afterRows = before.map(r => (r.type === 'work' && renameMap[r.site]) ? { ...r, site: renameMap[r.site] } : r);
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
      .bind(ts, me.id, user_id, date, beforeJson, JSON.stringify({ slots: afterRows.map(stripRow), _src: srcLabel })));
    updatedDays++;
  }
  if (batch.length) for (const part of chunk(batch, 200)) await env.DB.batch(part);

  // oldSitesが多い(数百件)場合、1件ずつawaitで直列実行すると往復回数がそのまま積み上がって
  // 遅くなるため、batch()にまとめて送る(内容が1件ごとに異なるUPDATEなのでSQL自体はまとめられないが、
  // 送信は一括化できる)。
  const registryBatch = oldSites.map(oldSite => env.DB.prepare('UPDATE site_registry SET site=? WHERE site=?').bind(renameMap[oldSite], oldSite));
  for (const part of chunk(registryBatch, 200)) await env.DB.batch(part);
  if (artistRenameMap) {
    for (const oldArtist of Object.keys(artistRenameMap)) {
      const newArtist = artistRenameMap[oldArtist];
      if (!newArtist || newArtist === oldArtist) continue;
      // OR IGNOREで、同じグループ/フォルダに既に新名が存在する場合(まれ)は静かにスキップする
      await env.DB.prepare("UPDATE OR IGNORE site_group_members SET member=? WHERE member=? AND group_id IN (SELECT id FROM site_groups WHERE kind='artist')").bind(newArtist, oldArtist).run();
      await env.DB.prepare('UPDATE OR IGNORE artist_folder_members SET artist=? WHERE artist=?').bind(newArtist, oldArtist).run();
    }
  }
  return { updatedDays, ts };
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
function parseFormatD(grid, ym, keywordMap, fromDate = null) {
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
      if (kw) { if (kw !== 'ignore') out.push({ regno: b.regno, date, type: kw, site: '', venue: '', note: '', name: b.name }); continue; }
      const venue = b.venueCol >= 0 ? cell(r, b.venueCol) : '';
      out.push({ regno: b.regno, date, type: 'work', site, venue, note: '', name: b.name });
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
  const data: any = await res.json();
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
  // フロントエンドがX-Pageヘッダーで現在の画面(location.hash)を送ってくるので、
  // last_seenの更新と同じタイミングでlast_pageも記録しておく(管理者以上が
  // 「ログイン中メンバーが何を見ているか」「セッションが何を見ていたか」を確認できるようにするため)。
  const page = (req.headers.get('x-page') || '').slice(0, 100);
  if (page) await env.DB.prepare('UPDATE sessions SET last_seen=?, last_page=? WHERE token=?').bind(now, page, t).run();
  else await env.DB.prepare('UPDATE sessions SET last_seen=? WHERE token=?').bind(now, t).run();
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
    // 手配グループを持つ人だけ(ロールが handler/admin でも is_manager=0 ならグループを持たない)
    env.DB.prepare("SELECT id, name FROM users WHERE COALESCE(is_manager,0)=1").all(),
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

// 現場名を軸に、指定日を含む「連続した日程」の範囲を求める。複数日にわたる現場
// (仕込み〜本番〜バラシ等)を、暦日の連続性から機械的に推定するためのヘルパー。
// 既定では現場名の完全一致のみで判定する(会場が同じでも現場名が違えば別の現場とみなす。
// 会場だけが同じ別公演を誤って同一期間に取り込んでいた不具合を修正)。現場の合間
// (その現場が入っていない中日)は最大3日までまたいで連続とみなし、それを超えて
// 現場が入っていない日が続く場合はそこで期間を打ち切る(合間が無く連続している限り、
// 期間の長さ自体に上限は無い)。
// opts.groupByArtist を渡すと、現場名の完全一致ではなく extractArtistName()(【セクション等】
// 表記を除いた本体名)での一致に切り替わる。1つの公演を「【物販】〇〇」「【設営】〇〇」のように
// セクションごとに現場名を分けて入力している場合でも、構造的には同じ現場として日程を通しで
// 拾いたい用途(現場の稼働表)のためのオプション。現場一覧・現場情報の「同アーティストの公演」等、
// 【】表記ごとに別項目として扱いたい既存の呼び出し元には影響しない(既定はfalseのまま)。
async function findGigDateRange(env, date, site, opts: any = {}) {
  const groupByArtist = !!opts.groupByArtist;
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
  let matchDates;
  if (groupByArtist) {
    const artist = extractArtistName(site);
    const rangeRows = (await env.DB.prepare(
      "SELECT DISTINCT date, site FROM schedule WHERE type='work' AND date>=? AND date<=?"
    ).bind(winFrom, winTo).all()).results;
    matchDates = new Set(rangeRows.filter(r => extractArtistName(r.site) === artist).map(r => r.date));
  } else {
    const matchRows = (await env.DB.prepare(
      "SELECT DISTINCT date FROM schedule WHERE type='work' AND date>=? AND date<=? AND site=?"
    ).bind(winFrom, winTo, site).all()).results;
    matchDates = new Set(matchRows.map(r => r.date));
  }

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
  // multipart/form-data(会場マニュアルの写真/動画アップロード等)はここでJSONとして読み込んで
  // しまうとリクエストボディが消費され、各ルート側でreq.formData()を呼んでも空になってしまうため、
  // Content-Typeで判定して読み飛ばす(該当ルート側で改めてreq.formData()を呼ぶ)。
  const isMultipart = (req.headers.get('content-type') || '').includes('multipart/form-data');
  const body = method === 'GET' || isMultipart ? {} : await req.json().catch(() => ({}));

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
    const loginPermBaseLv = {};
    for (const k of Object.keys(PERMS)) loginPermBaseLv[k] = effBaseLv(k);
    return J({ token, user: { ...pub(u), handler: 0, permBaseLv: loginPermBaseLv } });
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

  // ---- 会場マニュアルの写真/動画配信(準備中機能)。<img>/<video>のsrcはAuthorizationヘッダーを
  //      送れないため、この経路だけ例外的に、共通のセッショントークンをクエリ文字列(?t=)で受け取って
  //      本人確認する(/calendar/:token.icsと同じ「認証不要ブロックでの専用トークン確認」方式)。
  //      動画のシーク操作に対応するため、Rangeリクエストにも対応する。 ----
  if (method === 'GET' && path.startsWith('/venue-manual/media/')) {
    const qtoken = url.searchParams.get('t') || '';
    const s = qtoken ? await env.DB.prepare(
      'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token=?'
    ).bind(qtoken).first() : null;
    if (!s || !has(s, 'sites_view')) return new Response('Not Found', { status: 404 });
    if (!env.MANUALS) return ERR('R2が未設定です', 500);
    // キーはPOST /venue-manual/uploadでencodeURIComponent(venue)を含む形でR2に保存しているため、
    // URLのpathnameはWorkersがパーセントエンコードを保持したまま渡してくる(自動デコードしない)
    // ことを利用し、ここではデコードせずそのままR2のキーとして使う(decodeURIComponentすると
    // 元のキーと文字列が一致しなくなり404になってしまう)。
    const key = path.slice('/venue-manual/media/'.length);
    const rangeHeader = req.headers.get('range');
    let range = null;
    if (rangeHeader) {
      const m = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (m) range = { offset: Number(m[1]), length: m[2] ? Number(m[2]) - Number(m[1]) + 1 : undefined };
    }
    const obj = await env.MANUALS.get(key, range ? { range } : undefined);
    if (!obj) return new Response('Not Found', { status: 404 });
    const contentType = obj.httpMetadata?.contentType || 'application/octet-stream';
    if (range) {
      const length = range.length ?? (obj.size - range.offset);
      return new Response(obj.body, {
        status: 206,
        headers: {
          'Content-Type': contentType,
          'Content-Range': `bytes ${range.offset}-${range.offset + length - 1}/${obj.size}`,
          'Content-Length': String(length),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'private, max-age=3600',
        }
      });
    }
    return new Response(obj.body, {
      headers: { 'Content-Type': contentType, 'Content-Length': String(obj.size), 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600' }
    });
  }

  // ---- 現場ごとのチャットへの、アプリアカウントを持たない人向けゲスト参加(認証不要・招待URLのトークンで
  //      本人確認する。/calendar/:token.icsと同じ「認証不要ブロックでの専用トークン確認」方式)。
  //      現場の当日(JST)以外はguestTokenが有効でも参加・閲覧・投稿のいずれもできない
  //      (ユーザーの明示的な指示。アプリアカウント保持者は通常のログイン経由でいつでも見返せる)。
  let gcm;
  if (method === 'GET' && (gcm = path.match(/^\/guest-chat\/([a-zA-Z0-9]+)$/))) {
    const room = await env.DB.prepare("SELECT * FROM chat_rooms WHERE guest_token=? AND type='site'").bind(gcm[1]).first();
    if (!room) return ERR('リンクが無効です', 404);
    const sep = String(room.ref_key).indexOf('|');
    const date = String(room.ref_key).slice(0, sep), site = String(room.ref_key).slice(sep + 1);
    return J({ valid: date === jstDate(), date, site, roomId: room.id });
  }
  if (method === 'POST' && (gcm = path.match(/^\/guest-chat\/([a-zA-Z0-9]+)\/join$/))) {
    const room = await env.DB.prepare("SELECT * FROM chat_rooms WHERE guest_token=? AND type='site'").bind(gcm[1]).first();
    if (!room) return ERR('リンクが無効です', 404);
    const sep = String(room.ref_key).indexOf('|');
    const date = String(room.ref_key).slice(0, sep), site = String(room.ref_key).slice(sep + 1);
    if (date !== jstDate()) return ERR('このリンクは現場当日のみご利用いただけます', 403);
    const name = String(body.name || '').trim().slice(0, 40);
    if (!name) return ERR('お名前を入力してください');
    const deviceToken = rnd();
    await env.DB.prepare('INSERT INTO chat_guests(room_id,name,device_token,created_at) VALUES(?,?,?,?)')
      .bind(room.id, name, deviceToken, jstTs()).run();
    return J({ deviceToken, name, roomId: room.id, date, site });
  }
  if ((gcm = path.match(/^\/guest-chat\/([a-zA-Z0-9]+)\/messages$/))) {
    const room = await env.DB.prepare("SELECT * FROM chat_rooms WHERE guest_token=? AND type='site'").bind(gcm[1]).first();
    if (!room) return ERR('リンクが無効です', 404);
    const sep = String(room.ref_key).indexOf('|');
    const date = String(room.ref_key).slice(0, sep);
    if (date !== jstDate()) return ERR('このリンクは現場当日のみご利用いただけます', 403);
    const deviceToken = method === 'GET' ? (url.searchParams.get('device_token') || '') : String(body.device_token || '');
    const guest = deviceToken ? await env.DB.prepare('SELECT * FROM chat_guests WHERE device_token=? AND room_id=?').bind(deviceToken, room.id).first() : null;
    if (!guest) return ERR('参加情報が確認できません。もう一度お名前の入力からやり直してください。', 403);
    if (method === 'GET') {
      const afterId = Number(url.searchParams.get('after_id')) || 0;
      let rows;
      if (afterId) {
        rows = (await env.DB.prepare('SELECT * FROM chat_messages WHERE room_id=? AND id>? ORDER BY id ASC LIMIT 200').bind(room.id, afterId).all()).results;
      } else {
        const desc = (await env.DB.prepare('SELECT * FROM chat_messages WHERE room_id=? ORDER BY id DESC LIMIT 50').bind(room.id).all()).results;
        rows = (desc as any[]).slice().reverse();
      }
      return J((rows as any[]).map(r => ({
        id: r.id, senderName: r.sender_name, body: r.body, ts: r.ts,
        isGuest: r.guest_id !== null, mine: r.guest_id === guest.id,
      })));
    }
    if (method === 'POST') {
      const text = String(body.body || '').trim().slice(0, 2000);
      if (!text) return ERR('メッセージを入力してください');
      const ins = await env.DB.prepare('INSERT INTO chat_messages(room_id,sender_id,sender_name,guest_id,body,ts) VALUES(?,NULL,?,?,?,?)')
        .bind(room.id, guest.name, guest.id, text, jstTs()).run();
      return J({ ok: 1, id: ins.meta && ins.meta.last_row_id });
    }
    return ERR('不正なリクエストです');
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

  await loadPermBaseOverrides(env); // 権限の基準レベルの上書き設定を反映してから権限判定に入る
  const me = await auth(req, env);
  if (!me) return ERR('ログインしてください', 401);
  if (me.suspended) { await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(me.id).run(); return ERR('このアカウントは停止されています', 403); }
  const handlerMode = me._handler === 1 && has(me, 'site_manage');

  if (method === 'POST' && path === '/logout') {
    await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(me._tk).run();
    return J({ ok: 1 });
  }
  if (method === 'GET' && path === '/me') {
    // フロント側のhas()も同じ基準で判定できるよう、実効の基準レベル表を一緒に返す
    const permBaseLv = {};
    for (const k of Object.keys(PERMS)) permBaseLv[k] = effBaseLv(k);
    return J({ ...pub(me), handler: handlerMode ? 1 : 0, permBaseLv });
  }

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
    'admin', 'admin-settings', 'role-permissions', 'perm-matrix', 'handler-status',
    'import', 'sched-sources', 'daicho', 'member-summary',
    'venues', 'venue-manual', 'legacy-import', 'artists', 'app-structure', 'system',
    'training-status', 'chat', 'rookie-list',
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
    return J({ perms: Object.entries(PERMS).map(([key, p]) => ({ key, label: p.label, baseLv: effBaseLv(key), defaultBaseLv: p.baseLv })) });
  }
  // 権限の「基準レベル」を変更する(アプリ構造ビューアの権限マトリクスから使う、管理者専用)。
  // baseLv: 0=メンツ以上 / 1=チーフ以上 / 2=手配者以上 / 3=管理者のみ / 4=どのロールも標準では持たない。
  // ロールは上位が下位を包含するため、あるロールにチェックを入れると、それより上位のロールにも自動的に付く。
  if (method === 'PUT' && path === '/perm-base') {
    if (!has(me, 'account_manage')) return ERR('権限がありません', 403);
    const key = String(body.key || '');
    const baseLv = Number(body.baseLv);
    if (!PERMS[key]) return ERR('不明な権限キーです');
    if (!Number.isInteger(baseLv) || baseLv < 0 || baseLv > 4) return ERR('基準レベルの指定が不正です');
    const cur = { ...PERM_BASE_OVERRIDES };
    // コード上の既定値に戻す場合は、上書きを持たせず削除しておく(既定値を後から変えた時に追随させるため)
    if (baseLv === PERMS[key].baseLv) delete cur[key]; else cur[key] = baseLv;
    await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('perm_base_overrides',?)").bind(JSON.stringify(cur)).run();
    PERM_BASE_OVERRIDES = cur;
    return J({ ok: 1, key, baseLv: effBaseLv(key), defaultBaseLv: PERMS[key].baseLv });
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

  // 個別権限マトリクス(全ユーザーの追加extra_perms・剥奪revoked_perms状況を一度に取得。
  // 「誰がどの個別権限を持っているか」を一覧できる画面、チェックボックス一括付与画面から使う)
  if (method === 'GET' && path === '/perm-matrix') {
    if (!has(me, 'account_manage')) return ERR('ページが見つかりません', 404);
    const rows = (await env.DB.prepare('SELECT id,name,regno,role,rank,han,suspended,extra_perms,revoked_perms FROM users ORDER BY regno').all()).results;
    return J({ users: rows.map(u => ({ id: u.id, name: u.name, regno: u.regno, role: u.role, rank: u.rank, han: u.han, suspended: !!u.suspended, extraPerms: getPerms(u), revokedPerms: getRevokedPerms(u) })) });
  }
  // 個別権限の一括付与/剥奪/解除。チェックボックスで選んだ複数人に対し、1つの権限キーだけを
  // まとめて変更する(/role-perms/:role と違い、対象は「特定の複数人」で、他の個別権限キーには触れない)
  if (method === 'PUT' && path === '/users/perms/bulk') {
    if (!has(me, 'account_manage')) return ERR('権限がありません', 403);
    const key = String(body.key || '');
    if (!PERMS[key]) return ERR('不明な権限キーです');
    const action = String(body.action || '');
    if (!['grant', 'revoke', 'clear'].includes(action)) return ERR('不正な操作です');
    const uids = Array.isArray(body.uids) ? [...new Set(body.uids.map(Number).filter(n => Number.isInteger(n) && n > 0))] : [];
    if (!uids.length) return ERR('対象を選択してください');
    const rows = (await env.DB.prepare(`SELECT id, extra_perms, revoked_perms FROM users WHERE id IN (${uids.map(() => '?').join(',')})`).bind(...uids).all()).results;
    for (const r of rows) {
      const extra = getPerms(r).filter(k => k !== key);
      const revoked = getRevokedPerms(r).filter(k => k !== key);
      if (action === 'grant') extra.push(key);
      else if (action === 'revoke') revoked.push(key);
      await env.DB.prepare('UPDATE users SET extra_perms=?, revoked_perms=? WHERE id=?').bind(JSON.stringify(extra), JSON.stringify(revoked), r.id).run();
    }
    return J({ ok: 1, updated: rows.length });
  }

  // 手配担当の一覧(担当グループのプルダウン用)
  if (method === 'GET' && path === '/managers') {
    if (lv(me) < 1) return ERR('ページが見つかりません', 404);
    // 手配グループを持つ人だけを担当手配者の候補として返す(is_manager=0 の手配者は出さない)
    const rows = (await env.DB.prepare("SELECT * FROM users WHERE COALESCE(is_manager,0)=1 ORDER BY regno").all()).results;
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
    // 全件(数万行規模になりうる)を1件ずつawaitで更新すると、逐次の待ち時間が積み上がり
    // CPU/実行時間の上限に達して途中で失敗する(markVisited等と同じ既知の問題)。
    // 更新内容はDB呼び出し無しで計算できるため、まとめてbatchで実行する。
    const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
    const stmts = [];
    for (const r of rows) {
      const c = calcPay({ rank: rankMap[r.user_id], date: r.date, tin: r.tin, tout: r.tout, duty: r.duty, loadEnd: r.load_end, showEnd: r.show_end, multi: r.multi }, resolve, dutyMap);
      if (!c) continue;
      stmts.push(env.DB.prepare('UPDATE schedule SET hours=?, overtime=?, pay=? WHERE id=?').bind(c.hours, c.overtime, c.pay, r.id));
    }
    for (const part of chunk(stmts, 200)) if (part.length) await env.DB.batch(part);
    return J({ ok: 1, updated: stmts.length });
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
      const r: any = await importScheduleSheet(env, 'sched_src_' + id, src.url, me.id, fromDate, { excludeUnmanaged: !!src.exclude_unmanaged });
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
      // 進捗の保存先(import_urls_progress)は cronDaichoReload と共用のキーなので、手動実行では
      // 触らない(opt.progressKeyを渡さない)。以前は runDaichoReload の内部で import_urls
      // (保存済みURL設定そのもの)へ進捗として直接書き戻しており、完了後に元へ戻す処理も無かった
      // ため、手動実行するたびに保存済みURLのリストが空になってしまい、以後の自動取込が何日も
      // 止まる不具合があった(2026年8月修正)。今はimport_urlsを進捗の一時置き場としては使わず、
      // 実際に処理を終えたURLだけを、下のremoveImportUrls()で使い捨て削除する(1URL=1日分の
      // データという運用のため。時間予算切れで手をつけられなかった分は残る)。
      const r = await runDaichoReload(env, targetUrls, { checkAbsent, sourceLabel: '台帳手動再取り込み' });
      // 手配担当者向けの管理者ダッシュボード「システム状態」が古い結果のまま表示され続けないよう、
      // 手動実行の場合も深夜自動実行(cronDaichoReload)と同じ内容をdaicho_reload_last_resultへ
      // 保存する(以前はdaicho_reload_last_runのみ更新しており、last_resultが前回の深夜実行分の
      // まま古くなる不具合があった)。
      await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('daicho_reload_last_result',?)").bind(
        JSON.stringify({ ts: jstTs(), count: targetUrls.length, results: r.results, clearedAbsent: r.absentResult.clearedPeople, clearedRegistrations: r.registryResult.clearedRegistrations })
      ).run();
      // 実際に取り込みを試みたURL(成功・失敗どちらも)は使い捨てで保存済みリストから削除する
      // (深夜自動実行と同じ扱い。1URL=1日分のデータという運用のため)。時間予算切れで
      // 手をつけられなかった分(r.results に含まれない)は削除しない。
      try { await removeImportUrls(env, r.results.map(x => x.url)); } catch (e) {}
      // 「本日実行済み」フラグは、保存済み全URLを対象にした手動実行が時間予算切れなく完了した
      // 場合のみ立てる。一部URLだけを選んだ手動実行(動作確認等)でこのフラグを立ててしまうと、
      // その夜のcronDaichoReloadが「今日はもう実行済み」とみなして他の未選択URLを一切自動取込
      // しなくなり、台帳が何日も更新されない不具合の原因になっていた(2026年8月修正)。
      if (isFullSet && !r.incomplete) {
        // 手動で今すぐ全件取り込んだ場合、同じ内容がその夜また自動的に取り込まれて二重に処理される
        // (通知が2回来る、differenceの検出が乱れる等)のを避けるため、深夜自動実行の「本日実行済み」
        // フラグも合わせて更新しておく。これにより、その夜のcronDaichoReloadは通常通りスキップされる。
        await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('daicho_reload_last_run',?)").bind(jstDate()).run();
      }
      return J({
        ok: 1, okCount: r.okCount, ngCount: r.ngCount, totalApplied: r.totalApplied,
        results: r.results, clearedAbsent: r.absentResult.clearedPeople, clearedRegistrations: r.registryResult.clearedRegistrations, checkedAbsent: checkAbsent,
        remainingCount: r.incomplete ? Math.max(0, targetUrls.length - r.results.length) : 0, incomplete: !!r.incomplete,
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
        const before = await env.DB.prepare('SELECT role FROM users WHERE id=?').bind(uid).first();
        await env.DB.prepare('UPDATE users SET role=? WHERE id=?').bind(body.role, uid).run();
        // 権限レベルを下げた場合、手配モードに入ったままのセッションが残り続けることを防ぐため、
        // 強制ログアウトする(次回ログイン時に新しい役割で入り直してもらう)
        if (before && LV[body.role] < LV[before.role]) {
          await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(uid).run();
        }
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
      if (body.is_manager !== undefined) {
        // 手配グループを持たせるかどうか。ロール(権限)とは独立した設定で、
        // 1 の人だけが「担当手配者」のプルダウンやメンバー分析のグループ欄に現れる。
        if (!has(me, 'account_manage')) return ERR('権限がありません', 403);
        const want = body.is_manager ? 1 : 0;
        if (!want) {
          // まだメンバーが紐付いているグループは、外すとそのメンバーの担当が宙に浮くため止める
          const n = await env.DB.prepare('SELECT COUNT(*) AS c FROM users WHERE manager_id=?').bind(uid).first();
          if (n && n.c > 0) return ERR(`このグループにはまだ${n.c}人が所属しています。先に担当手配者を変更してください`);
        }
        await env.DB.prepare('UPDATE users SET is_manager=? WHERE id=?').bind(want, uid).run();
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
          // 手動でランクを変えた時点で、研修による昇格予約は意味を失うため一緒に取り消す。
          // (残したままだとダッシュボードの「昇格予定」に、既に済んだ古い予定が出続ける)
          await env.DB.prepare('UPDATE users SET rank=?, promotion_pending_date=NULL, promotion_pending_rank=NULL WHERE id=?').bind(body.rank, uid).run();
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
    // 査定で上がった時点で、研修による昇格予約(D→C等)は不要になるため一緒に取り消す
    await env.DB.prepare('UPDATE users SET rank=?, promotion_pending_date=NULL, promotion_pending_rank=NULL WHERE id=?').bind(target, uid).run();
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
    const notifyTargets = new Set<any>(); // 手配チーム通知の対象(uid)を、変更があった人だけ集めて最後にまとめて送る
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
    const offUids = Array.isArray(body.offUids) ? body.offUids.map(Number).filter(Boolean) : [];
    const keepUids = Array.isArray(body.keepUids) ? body.keepUids.map(Number).filter(Boolean) : [];
    const ts = jstTs();
    let updated = 0, off = 0;
    if (isLocked(date, me, await getLockDays(env))) return ERR('給与確定済みのため編集できません（確定期間を過ぎています）', 409);
    const resolve = await loadWageResolver(env);
    const dutyMap = await loadDutyMap(env);
    // 休暇に変更する対象
    for (const uid of offUids) {
      const before = (await env.DB.prepare('SELECT * FROM schedule WHERE user_id=? AND date=? ORDER BY slot').bind(uid, date).all()).results;
      if (!before.some(b => b.site === site)) continue;
      const beforeJson = JSON.stringify(before.map(stripRow));
      const afterJson = JSON.stringify([stripRow({ type: 'off', site: '', venue: '', tin: '', tout: '', pay: 0, note: '', duty: '', load_end: '', show_end: '', multi: 0 })]);
      await env.DB.prepare('DELETE FROM schedule WHERE user_id=? AND date=?').bind(uid, date).run();
      await env.DB.prepare('INSERT INTO schedule(user_id,date,slot,type,site,venue,tin,tout,hours,overtime,pay,note,duty,load_end,show_end,multi) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(uid, date, 0, 'off', '', '', '', '', 0, 0, 0, '', '', '', '', 0).run();
      // 現場に入る予定だった人を休暇に変更する重要な操作のため、休暇のみへの変更を除外する通常のルールに関わらず必ず履歴に記録する
      await env.DB.prepare('INSERT INTO schedule_history(ts,editor_id,target_id,date,before_json,after_json) VALUES(?,?,?,?,?,?)')
        .bind(ts, me.id, uid, date, beforeJson, JSON.stringify({ slots: JSON.parse(afterJson), _src: `現場一覧の一括編集(${site}を休暇に変更)` })).run();
      off++;
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
    // 手配チーム通知: 更新・休暇化された対象者の手配担当が自分以外なら知らせる(本人による自己更新は対象外)
    const touchedUids = [...new Set([...offUids, ...keepUids])];
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
    return J({ ok: 1, updated, off });
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
      `SELECT m.kind, m.date, m.site, m.matched_name, m.report_id, m.blacklist_id, r.reporter_name
       FROM rookie_site_matches m LEFT JOIN reports r ON m.report_id = r.id
       WHERE m.date LIKE ?`
    ).bind(month + '%').all()).results;
    const rookieMap = {}, blacklistMap = {};
    for (const m of matches) {
      const key = m.date + '|' + m.site;
      if (m.kind === 'report') (rookieMap[key] ||= []).push({ name: m.matched_name, reportId: m.report_id, reporterName: m.reporter_name || '' });
      else (blacklistMap[key] ||= []).push({ name: m.matched_name, blacklistId: m.blacklist_id });
    }
    for (const r of rows) {
      const key = r.date + '|' + r.site;
      r.rookies = rookieMap[key] || [];
      r.blacklistNames = blacklistMap[key] || [];
    }
    return J(rows);
  }

  // ---- 新人リスト: 台帳(実績)取込で見つかった未登録の新人一覧(sites_view権限、チーフ以上)。
  //      現場詳細の「新人」ボタンから、その日・その現場に絞って取得する(date+site指定)のが基本。
  //      pending=1なら、ダッシュボードの「対応が必要」から、まだ誰も評価していない人だけを
  //      日付を問わず横断的に返す(現場ごとに開いて回らなくても一箇所で確認・評価できるようにするため)。
  //      どちらの指定も無ければ月単位(既定は当月)で全件返す。regnoごとにグループ化し、登場した現場・
  //      評価履歴をまとめて返す。除外設定(rookie_excluded)に含まれるregnoは常に除く。
  if (method === 'GET' && path === '/rookie-candidates') {
    if (!has(me, 'sites_view')) return ERR('ページが見つかりません', 404);
    const dateParam = url.searchParams.get('date');
    const siteParam = url.searchParams.get('site');
    let cands;
    if (dateParam && siteParam) {
      cands = (await env.DB.prepare(
        'SELECT * FROM rookie_candidates WHERE date=? AND site=? ORDER BY regno'
      ).bind(dateParam, siteParam).all()).results;
    } else if (url.searchParams.get('pending') === '1') {
      cands = (await env.DB.prepare(
        `SELECT rc.* FROM rookie_candidates rc
         WHERE NOT EXISTS (SELECT 1 FROM rookie_quick_evals e WHERE e.regno = rc.regno)
         ORDER BY rc.regno, rc.date`
      ).all()).results;
    } else {
      const month = url.searchParams.get('month') || jstDate().slice(0, 7);
      cands = (await env.DB.prepare(
        'SELECT * FROM rookie_candidates WHERE date LIKE ? ORDER BY regno, date'
      ).bind(month + '%').all()).results;
    }
    const excluded = new Set((await getRookieExcluded(env)).map((x: any) => x.regno));
    // 6桁チェックは取込時(upsertRookieCandidates)で行っているが、過去の不具合で紛れ込んだ
    // 5桁データ等が残っていても一覧に出さないよう、表示側でも念のため防御的に絞り込む
    cands = cands.filter((c: any) => !excluded.has(c.regno) && /^3\d{5}$/.test(c.regno));
    const regnos = [...new Set(cands.map((c: any) => c.regno))];
    let evals: any[] = [];
    if (regnos.length) {
      const ph = regnos.map(() => '?').join(',');
      evals = (await env.DB.prepare(`SELECT * FROM rookie_quick_evals WHERE regno IN (${ph}) ORDER BY id DESC`).bind(...regnos).all()).results;
    }
    const byRegno: Record<string, any> = {};
    for (const c of cands as any[]) {
      const g = byRegno[c.regno] ||= { regno: c.regno, name: c.name, sites: [], evals: [] };
      if (c.name) g.name = c.name; // 最新の氏名を優先(取込順=id昇順のため後勝ちでよい)
      g.sites.push({ date: c.date, site: c.site, venue: c.venue });
    }
    for (const ev of evals as any[]) {
      const g = byRegno[ev.regno];
      if (g) g.evals.push(ev);
    }
    const lastDate = (g: any) => g.sites.length ? g.sites[g.sites.length - 1].date : '';
    return J(Object.values(byRegno).sort((a: any, b: any) => lastDate(b).localeCompare(lastDate(a))));
  }

  // ---- 新人リスト: 軽い評価の登録(sites_view権限、チーフ以上)。新人報告への引き上げ前段階。
  if (method === 'POST' && path === '/rookie-candidates/eval') {
    if (!has(me, 'sites_view')) return ERR('ページが見つかりません', 404);
    const regno = normRegno(body.regno);
    if (!regno) return ERR('不正なリクエストです');
    const ins = await env.DB.prepare(
      `INSERT INTO rookie_quick_evals(regno,candidate_name,date,site,evaluator_id,evaluator_name,s_motivation,s_response,s_total,note,ts)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(regno, String(body.candidate_name || '').trim(), body.date || '', body.site || '', me.id, me.name,
      Number(body.s_motivation) || null, Number(body.s_response) || null, Number(body.s_total) || null,
      String(body.note || ''), jstTs()).run();
    return J({ ok: 1, id: ins.meta && ins.meta.last_row_id });
  }

  // ---- 新人リストの除外設定(システム設定、wage_settings権限)。台帳に載っているが実際は
  //      新人ではない人(登録番号の帯だけ一致してしまう等)を、今後の取込・一覧表示の両方から除く。
  if (method === 'GET' && path === '/rookie-excluded') {
    if (!has(me, 'wage_settings')) return ERR('ページが見つかりません', 404);
    return J(await getRookieExcluded(env));
  }
  if (method === 'POST' && path === '/rookie-excluded') {
    if (!has(me, 'wage_settings')) return ERR('権限がありません', 403);
    const regno = normRegno(body.regno);
    if (!regno) return ERR('登録番号を入力してください');
    const list = await getRookieExcluded(env);
    if (!list.some((x: any) => x.regno === regno)) {
      list.push({ regno, name: String(body.name || '').trim(), addedAt: jstTs() });
      await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('rookie_excluded',?)").bind(JSON.stringify(list)).run();
    }
    return J({ ok: 1 });
  }
  let rkxm;
  if (method === 'DELETE' && (rkxm = path.match(/^\/rookie-excluded\/([^/]+)$/))) {
    if (!has(me, 'wage_settings')) return ERR('権限がありません', 403);
    const regno = normRegno(decodeURIComponent(rkxm[1]));
    const list = (await getRookieExcluded(env)).filter((x: any) => x.regno !== regno);
    await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('rookie_excluded',?)").bind(JSON.stringify(list)).run();
    return J({ ok: 1 });
  }
  // 保管済みの過去の台帳ファイル(daicho_archive、R2)をすべて読み直し、rookie_candidatesへ
  // 反映するバックフィル処理。新人リスト機能の追加より前に取り込まれたファイルは対象外だったため、
  // 過去分も遡って拾えるようにする(2026年9月、ユーザーからの要望)。scheduleへは一切書き込まない
  // (applyImportRowsではなくparseDaichoExcelBuffer+upsertRookieCandidatesのみを呼ぶ)。
  // 件数が多いと1リクエストで終わらないため、時間予算内で処理できた分だけ進め、続きは
  // body.cursor(処理済み最大id)を使って呼び出し側がdone:trueになるまでループ呼び出しする。
  // 過去データの一括操作という性質上、legacy-import(過去データ取込確認)と同様に
  // 管理者専用の固定チェックで保護し、PERMSによる個別権限付与の対象にはしない。
  if (method === 'POST' && path === '/rookie-candidates/backfill') {
    if (me.role !== 'admin') return ERR('権限がありません', 403);
    if (!env.DAICHO) return ERR('R2が未設定のため使用できません', 500);
    const cursor = Number(body.cursor) || 0;
    const OVERALL_BUDGET_MS = 20000;
    const startedAt = Date.now();
    const keywordMap = await loadNonSiteKeywords(env);
    const allUsers = (await env.DB.prepare('SELECT id, regno FROM users').all()).results;
    const userByRegno = {}; for (const u of allUsers as any[]) userByRegno[normRegno(u.regno)] = u;

    const files = (await env.DB.prepare(
      'SELECT id, r2_key, file_name FROM daicho_archive WHERE id>? ORDER BY id ASC LIMIT 500'
    ).bind(cursor).all()).results;

    let processedCount = 0, lastId = cursor;
    const errors: any[] = [];
    for (const f of files as any[]) {
      if (Date.now() - startedAt > OVERALL_BUDGET_MS) break;
      lastId = f.id;
      processedCount++;
      try {
        const obj = await env.DAICHO.get(f.r2_key);
        if (!obj) { errors.push({ id: f.id, fileName: f.file_name, error: 'ファイル本体が見つかりません(削除済みの可能性)' }); continue; }
        const buf = new Uint8Array(await obj.arrayBuffer());
        const { allRows } = await parseDaichoExcelBuffer(env, buf, f.file_name || `台帳_${f.id}.xlsx`, null, keywordMap);
        if (allRows.length) await upsertRookieCandidates(env, allRows, userByRegno);
      } catch (e) {
        errors.push({ id: f.id, fileName: f.file_name, error: e.message });
      }
    }
    const remaining = (await env.DB.prepare('SELECT COUNT(*) AS c FROM daicho_archive WHERE id>?').bind(lastId).first()).c;
    return J({ done: remaining === 0, nextCursor: lastId, processedCount, remaining, errors: errors.slice(0, 10) });
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
  //      期間(findGigDateRangeで算出)を対象に、実際にその現場へ入っている人だけを
  //      抜き出して、スケジュール一覧と同じマトリックス形式で返す。
  //      「【物販】〇〇」「【設営】〇〇」のようにセクションごとに現場名を分けて入力していても
  //      構造的には同じ現場なので、findGigDateRangeにgroupByArtistを渡し、本体名(extractArtistName)
  //      が一致する【】表記違いをまとめて1つの現場として扱う(日程の連続判定・対象メンバーの
  //      抽出の両方)。現場一覧側は現場名の完全一致のまま(【】表記ごとに別項目)で、この画面には
  //      影響しない。 ----
  if (method === 'GET' && path === '/site-roster') {
    if (!has(me, 'sites_view')) return ERR('ページが見つかりません', 404);
    const date = url.searchParams.get('date'), site = url.searchParams.get('site');
    if (!date || !site) return ERR('date/site が必要です');
    const { venue, dates } = await findGigDateRange(env, date, site, { groupByArtist: true });

    const ph = dates.map(() => '?').join(',');
    const artist = extractArtistName(site);
    const siteRowsInRange = (await env.DB.prepare(`SELECT DISTINCT site FROM schedule WHERE type='work' AND date IN (${ph})`).bind(...dates).all()).results;
    const targetSites = siteRowsInRange.map(r => r.site).filter(s => extractArtistName(s) === artist);
    if (!targetSites.length) targetSites.push(site);
    const sph = targetSites.map(() => '?').join(',');
    const relevantRows = (await env.DB.prepare(`SELECT DISTINCT user_id FROM schedule WHERE type='work' AND date IN (${ph}) AND site IN (${sph})`).bind(...dates, ...targetSites).all()).results;
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

    // 過去(このデータより前)は、現場名・会場名の表記ゆれで誤って別公演を結合しないよう、
    // 完全一致(site AND venue)でのみ1つの公演として結合する(2026年8月、過去データ取込に伴い変更)。
    // 未来は入力者がまだ自由に表記を統一していない段階のため、従来通り現場名/会場名どちらかの
    // 一致で緩く候補を拾う(同会場の公演/同アーティストの公演の2系統のまま)。
    const [samePastRes, sameVenueFutureRes, sameSiteFutureRes, currentRes] = await Promise.all([
      env.DB.prepare("SELECT date, site, venue, COUNT(*) AS cnt FROM schedule WHERE type='work' AND site=? AND venue=? AND date<? GROUP BY date, site, venue ORDER BY date DESC LIMIT 15").bind(site, venue, from).all(),
      venue
        ? env.DB.prepare("SELECT date, site, venue, COUNT(*) AS cnt FROM schedule WHERE type='work' AND venue=? AND date>? GROUP BY date, site, venue ORDER BY date ASC LIMIT 15").bind(venue, to).all()
        : Promise.resolve({ results: [] }),
      env.DB.prepare("SELECT date, site, venue, COUNT(*) AS cnt FROM schedule WHERE type='work' AND site=? AND date>? GROUP BY date, site, venue ORDER BY date ASC LIMIT 15").bind(site, to).all(),
      // 現在閲覧中の現場自体(from〜to、この現場名の日すべて)。同会場・同アーティストの一覧は
      // これを意図的に除外しているため、一括編集の対象に含めたい場合はここから取得する。
      env.DB.prepare("SELECT date, site, venue, COUNT(*) AS cnt FROM schedule WHERE type='work' AND site=? AND date>=? AND date<=? GROUP BY date, site, venue ORDER BY date").bind(site, from, to).all(),
    ]);
    return J({
      site, venue, from, to,
      samePast: await markVisited(env, me.id, samePastRes.results),
      sameVenueFuture: await markVisited(env, me.id, sameVenueFutureRes.results), sameSiteFuture: await markVisited(env, me.id, sameSiteFutureRes.results),
      current: currentRes.results,
    });
  }

  // ---- 会場一覧(チーフ以上)。scheduleに実績のある会場名をすべて抽出し、使用回数・
  //      最初/最後に使った日をあわせて返す。現場一覧と違って月では区切らない
  //      (会場は特定の月に紐づく概念ではなく、過去〜未来にわたって繰り返し使われるため)。 ----
  if (method === 'GET' && path === '/venues') {
    if (!has(me, 'sites_view')) return ERR('ページが見つかりません', 404);
    // schedule全件(会場一覧は月で区切らないため常に全期間)の集計は重いので、
    // 1時間おきのcron(cronRankCache)が事前計算したキャッシュ(settings)を使う。
    // キャッシュがまだ無い場合(デプロイ直後等)だけ、その場で計算する。
    let rows = null;
    const cachedVenues = await getSetting(env, 'venues_cache', '');
    if (cachedVenues) { try { rows = JSON.parse(cachedVenues); } catch (e) {} }
    if (!rows || !rows.length) {
      rows = (await env.DB.prepare(
        "SELECT venue, COUNT(*) AS cnt, COUNT(DISTINCT date) AS dateCnt, MIN(date) AS firstDate, MAX(date) AS lastDate FROM schedule WHERE type='work' AND venue<>'' GROUP BY venue ORDER BY venue"
      ).all()).results;
    }
    const manualRows = (await env.DB.prepare('SELECT venue FROM venue_manuals').all()).results;
    const manualSet = new Set(manualRows.map(r => r.venue));
    for (const r of rows) r.hasManual = manualSet.has(r.venue);
    return J(rows);
  }

  // ---- 会場ごとの現場一覧(チーフ以上)。その会場で行われた/行われる現場を、今日を境に
  //      過去・今後に分けて返す。同じ会場に対する現場名の表記ゆれは意図的に統合しない
  //      (統合したい場合は現場一覧の一括改名・現場詳細のまとめて編集を使う)。 ----
  if (method === 'GET' && path === '/venue-history') {
    if (!has(me, 'sites_view')) return ERR('ページが見つかりません', 404);
    const venue = url.searchParams.get('venue');
    if (!venue) return ERR('venue が必要です');
    const today = jstDate();
    const [pastRes, futureRes, manualRow] = await Promise.all([
      env.DB.prepare("SELECT date, site, venue, COUNT(*) AS cnt FROM schedule WHERE type='work' AND venue=? AND date<? GROUP BY date, site, venue ORDER BY date DESC LIMIT 200").bind(venue, today).all(),
      env.DB.prepare("SELECT date, site, venue, COUNT(*) AS cnt FROM schedule WHERE type='work' AND venue=? AND date>=? GROUP BY date, site, venue ORDER BY date ASC LIMIT 200").bind(venue, today).all(),
      env.DB.prepare('SELECT 1 FROM venue_manuals WHERE venue=?').bind(venue).first(),
    ]);
    return J({ venue, past: await markVisited(env, me.id, pastRes.results), future: await markVisited(env, me.id, futureRes.results), hasManual: !!manualRow });
  }

  // ---- 会場・公演のメンバー一覧の並び替え。回数順(既定)/最近行った順/ランク順(A→E)の3種。
  //      ランクはA〜Eの1文字表記のため、文字列としての昇順ソートがそのままA→Eの順になる。 ----
  const memberSortClause = (sort) => sort === 'recent' ? 'ORDER BY lastDate DESC, u.regno'
    : sort === 'rank' ? 'ORDER BY (u.rank IS NULL OR u.rank=\'\'), u.rank ASC, cnt DESC'
    : 'ORDER BY cnt DESC, u.regno';

  // ---- 会場を経験したことのあるメンバー一覧(チーフ以上)。この会場でtype='work'の実績が
  //      1件でもある人を、経験回数の多い順に抽出する。停止中アカウントも含む(過去の実績のため)。 ----
  if (method === 'GET' && path === '/venue-members') {
    if (!has(me, 'sites_view')) return ERR('ページが見つかりません', 404);
    const venue = url.searchParams.get('venue');
    if (!venue) return ERR('venue が必要です');
    const rows = (await env.DB.prepare(
      `SELECT u.id, u.name, u.regno, u.rank, u.role, u.suspended, COUNT(*) AS cnt, MAX(s.date) AS lastDate
       FROM schedule s JOIN users u ON u.id = s.user_id
       WHERE s.type='work' AND s.venue=?
       GROUP BY u.id ${memberSortClause(url.searchParams.get('sort'))}`
    ).bind(venue).all()).results;
    return J(rows);
  }

  // ---- 公演を経験したことのあるメンバー一覧(準備中、チーフ以上)。会場版と同じ形式だが、
  //      対象は公演名(本体名)が一致する現場名の表記ゆれ全てを含む(artist-historyと同じ絞り込み)。 ----
  if (method === 'GET' && path === '/artist-members') {
    if (!has(me, 'sites_view')) return ERR('ページが見つかりません', 404);
    const artist = url.searchParams.get('artist');
    if (!artist) return ERR('artist が必要です');
    const variants = await siteVariantsForArtist(env, artist);
    if (!variants.length) return J([]);
    const ph = variants.map(() => '?').join(',');
    const rows = (await env.DB.prepare(
      `SELECT u.id, u.name, u.regno, u.rank, u.role, u.suspended, COUNT(*) AS cnt, MAX(s.date) AS lastDate
       FROM schedule s JOIN users u ON u.id = s.user_id
       WHERE s.type='work' AND s.site IN (${ph})
       GROUP BY u.id ${memberSortClause(url.searchParams.get('sort'))}`
    ).bind(...variants).all()).results;
    return J(rows);
  }

  // ---- 個人が行ったことのある会場一覧(全員)。個人スケジュール画面のボタンから開く。
  //      一覧・順位の閲覧は誰でもできる(タップ先の会場詳細だけがsites_view権限=チーフ以上)。
  //      使用回数の多い順に返す(並び替えはフロント側で行う)。 ----
  if (method === 'GET' && path === '/member-venues') {
    const uid = Number(url.searchParams.get('uid'));
    if (!uid) return ERR('uid が必要です');
    const rows = (await env.DB.prepare(
      "SELECT venue, COUNT(*) AS cnt, COUNT(DISTINCT date) AS dateCnt, MAX(date) AS lastDate FROM schedule WHERE type='work' AND user_id=? AND venue<>'' GROUP BY venue ORDER BY cnt DESC"
    ).bind(uid).all()).results;
    // 全員分の(会場,人)ごとの回数は、毎リクエストでschedule全件を集計し直すと重すぎるため
    // 1時間おきのcron(cronRankCache)が事前計算したキャッシュ(settings)を使う。
    // キャッシュがまだ無い場合(デプロイ直後等)だけ、その場で計算する。
    let byVenueUsers: Record<string, number[]> = {};
    const cached = await getSetting(env, 'venue_rank_cache', '');
    if (cached) { try { byVenueUsers = JSON.parse(cached); } catch (e) {} }
    if (!Object.keys(byVenueUsers).length) {
      const allRows = (await env.DB.prepare(
        "SELECT venue, user_id, COUNT(*) AS cnt FROM schedule WHERE type='work' AND venue<>'' GROUP BY venue, user_id"
      ).all()).results;
      for (const r of allRows) (byVenueUsers[r.venue] ||= []).push(r.cnt);
    }
    const result = rows.map(r => ({ ...r, ...rankInfo(byVenueUsers[r.venue] || [r.cnt], r.cnt) }));
    return J(result);
  }

  // ---- 個人が行ったことのある公演一覧(準備中、全員)。GET /artistsと同じく(現場名,日付)単位で
  //      取得し、Worker側で公演名(本体名)ごとに再集計する。個人スケジュール画面のボタンから開く。
  //      一覧・順位の閲覧は誰でもできる(タップ先の公演詳細だけがsites_view権限=チーフ以上)。 ----
  if (method === 'GET' && path === '/member-artists') {
    const uid = Number(url.searchParams.get('uid'));
    if (!uid) return ERR('uid が必要です');
    const rows = (await env.DB.prepare(
      "SELECT site, date, COUNT(*) AS cnt FROM schedule WHERE type='work' AND user_id=? AND site<>'' GROUP BY site, date"
    ).bind(uid).all()).results;
    const byArtist: Record<string, any> = {};
    for (const r of rows) {
      const artist = extractArtistName(r.site);
      (byArtist[artist] ||= { artist, cnt: 0, dates: new Set() });
      byArtist[artist].cnt += r.cnt;
      byArtist[artist].dates.add(r.date);
    }
    const myArtistRows = Object.values(byArtist).map(a => {
      const sorted = [...a.dates].sort();
      return { artist: a.artist, cnt: a.cnt, dateCnt: a.dates.size, lastDate: sorted[sorted.length - 1] };
    }).sort((x, y) => y.cnt - x.cnt);
    // 全員分の(公演,人)ごとの回数も、venueと同様に1時間おきのcron(cronRankCache)が
    // 事前計算したキャッシュ(settings)を使う。無い場合だけその場で計算する
    // (公演名は現場名から都度抽出する値のためSQLでは集計できず、Worker側で再集計する)。
    let byArtistUsers: Record<string, number[]> = {};
    const cachedArtist = await getSetting(env, 'artist_rank_cache', '');
    if (cachedArtist) { try { byArtistUsers = JSON.parse(cachedArtist); } catch (e) {} }
    if (!Object.keys(byArtistUsers).length) {
      const allRows = (await env.DB.prepare(
        "SELECT user_id, site, date, COUNT(*) AS cnt FROM schedule WHERE type='work' AND site<>'' GROUP BY user_id, site, date"
      ).all()).results;
      const byArtistUserTotals: Record<string, Record<string, number>> = {};
      for (const r of allRows) {
        const artist = extractArtistName(r.site);
        const bucket = byArtistUserTotals[artist] ||= {};
        bucket[r.user_id] = (bucket[r.user_id] || 0) + r.cnt;
      }
      for (const artist of Object.keys(byArtistUserTotals)) byArtistUsers[artist] = Object.values(byArtistUserTotals[artist]);
    }
    const result = myArtistRows.map(a => ({ ...a, ...rankInfo(byArtistUsers[a.artist] || [a.cnt], a.cnt) }));
    return J(result);
  }

  // ---- 個人専用の現場ログ検索(チーフ以上)。マイスケジュール画面内の検索バーから使う。
  //      集計はせず、1回の稼働=1行のまま日付降順で返し、日付・現場名・会場名・公演名(本体名)の
  //      いずれかの部分一致で絞り込めるようフロント側にそのまま渡す(件数が個人単位で少ないため)。 ----
  if (method === 'GET' && path === '/member-site-log') {
    if (!has(me, 'sites_view')) return ERR('ページが見つかりません', 404);
    const uid = Number(url.searchParams.get('uid'));
    if (!uid) return ERR('uid が必要です');
    const rows = (await env.DB.prepare(
      "SELECT date, site, venue FROM schedule WHERE type='work' AND user_id=? AND site<>'' ORDER BY date DESC"
    ).bind(uid).all()).results;
    const result = rows.map(r => ({ date: r.date, site: r.site, venue: r.venue, artist: extractArtistName(r.site) }));
    return J(result);
  }

  // ---- 新人報告・ブラックリストの氏名(自由記述)から、同じ名前のアプリ登録者を探し、
  //      その人の過去の現場ログを返す(新人報告・ブラックリストの権限者向け)。氏名の一致判定は
  //      markAcquiredByName/matchRookieAndBlacklistと同じnormName()を使い、表記の扱いを揃える。
  //      同姓同名が複数いる場合は全員分をまとめて返す(誰の記録か取り違えるより、多めに見せる方が安全)。 ----
  // 新人報告・ブラックリストの氏名一致検索、および新人リスト(rookie_candidates)の候補者名一致の
  // 両方をまとめて「過去の現場」として返す。アプリ登録済みの人はschedule実績から、未登録の人は
  // 台帳取込のたびに更新されるrookie_candidatesから拾うため、取込のたびに自動的に最新化される。
  // 閲覧は手配者以上に限定(2026年9月、ユーザーの明示的な指示。report_check/blacklist_manage
  // 権限者(チーフ以上)向けの他の操作より一段厳しい設定のため、あえて別のlv()判定にしている)。
  if (method === 'GET' && path === '/name-site-log') {
    if (lv(me) < 2) return ERR('ページが見つかりません', 404);
    const name = (url.searchParams.get('name') || '').trim();
    if (!name) return ERR('name が必要です');
    const key = normName(name);
    const users = (await env.DB.prepare('SELECT id, name FROM users').all()).results;
    const matchedUsers = (users as any[]).filter(u => normName(u.name) === key);
    let rows: any[] = [];
    if (matchedUsers.length) {
      const ids = matchedUsers.map(u => u.id);
      const ph = ids.map(() => '?').join(',');
      rows = (await env.DB.prepare(
        `SELECT date, site, venue FROM schedule WHERE type='work' AND user_id IN (${ph}) AND site<>'' ORDER BY date DESC LIMIT 200`
      ).bind(...ids).all()).results;
    }
    // name_normにインデックスがあるため、rookie_candidates全件をスキャンせず絞り込める
    // (会場一覧・編集履歴検索で過去に発生した「テーブルが育つほど重くなるフルスキャン」を
    // 未然に防ぐため、2026年9月時点で最初からインデックス付きの列で検索するようにしている)。
    const rookieMatches = (await env.DB.prepare('SELECT date, site, venue FROM rookie_candidates WHERE name_norm=?').bind(key).all()).results;
    const combined = [
      ...rows.map((r: any) => ({ date: r.date, site: r.site, venue: r.venue, source: 'registered' })),
      ...rookieMatches.map((r: any) => ({ date: r.date, site: r.site, venue: r.venue, source: 'rookie' })),
    ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200);
    return J({ matchedUsers: matchedUsers.map(u => ({ id: u.id, name: u.name })), rows: combined });
  }

  // ---- アーティスト一覧(準備中、chief以上)。現場名から「【セクション等】」を除いた本体名を
  //      アーティスト名とみなして集計する。1つの現場名に対応するSQL列が無いため、
  //      (現場名,日付)単位で取得しWorker側でアーティスト名ごとに再集計する。 ----
  if (method === 'GET' && path === '/artists') {
    if (!has(me, 'sites_view')) return ERR('ページが見つかりません', 404);
    // schedule全件の集計は重いので、1時間おきのcron(cronRankCache)が事前計算した
    // キャッシュ(settings)を使う。キャッシュがまだ無い場合だけその場で計算する。
    let result = null;
    const cachedArtists = await getSetting(env, 'artists_cache', '');
    if (cachedArtists) { try { result = JSON.parse(cachedArtists); } catch (e) {} }
    if (!result || !result.length) {
      const rows = (await env.DB.prepare(
        "SELECT site, date, COUNT(*) AS cnt FROM schedule WHERE type='work' AND site<>'' GROUP BY site, date"
      ).all()).results;
      const byArtist: Record<string, any> = {};
      for (const r of rows) {
        const artist = extractArtistName(r.site);
        (byArtist[artist] ||= { artist, cnt: 0, dates: new Set() });
        byArtist[artist].cnt += r.cnt;
        byArtist[artist].dates.add(r.date);
      }
      result = Object.values(byArtist).map((a: any) => {
        const sorted = [...a.dates].sort();
        return { artist: a.artist, cnt: a.cnt, dateCnt: a.dates.size, firstDate: sorted[0], lastDate: sorted[sorted.length - 1] };
      }).sort((x: any, y: any) => x.artist.localeCompare(y.artist, 'ja'));
    }
    return J(result);
  }

  // ---- アーティストごとの現場一覧(準備中、chief以上)。会場一覧のGET /venue-historyと同じ形式で、
  //      今日を境に過去・今後に分けて返す。対象の現場名は、アーティスト名が一致する全ての表記ゆれ
  //      (【セクション】の有無・前後違い)を含める。 ----
  if (method === 'GET' && path === '/artist-history') {
    if (!has(me, 'sites_view')) return ERR('ページが見つかりません', 404);
    const artist = url.searchParams.get('artist');
    if (!artist) return ERR('artist が必要です');
    const variants = await siteVariantsForArtist(env, artist);
    if (!variants.length) return J({ artist, past: [], future: [] });
    const ph = variants.map(() => '?').join(',');
    const today = jstDate();
    const [pastRes, futureRes] = await Promise.all([
      env.DB.prepare(`SELECT date, site, venue, COUNT(*) AS cnt FROM schedule WHERE type='work' AND site IN (${ph}) AND date<? GROUP BY date, site, venue ORDER BY date DESC LIMIT 200`).bind(...variants, today).all(),
      env.DB.prepare(`SELECT date, site, venue, COUNT(*) AS cnt FROM schedule WHERE type='work' AND site IN (${ph}) AND date>=? GROUP BY date, site, venue ORDER BY date ASC LIMIT 200`).bind(...variants, today).all(),
    ]);
    return J({ artist, past: await markVisited(env, me.id, pastRes.results), future: await markVisited(env, me.id, futureRes.results) });
  }

  // ---- 公演一覧(旧アーティスト一覧、準備中)の一括改名(手配者以上)。会場一覧の一括改名と違い、
  //      対象は「公演名(本体名)が一致する現場名」の集合で、改名後も各行の【セクション等】表記は
  //      そのまま維持する(rebuildSiteName)。複数の旧公演名を1つの新しい公演名にまとめられる。 ----
  if (method === 'POST' && path === '/artists/bulk-rename') {
    if (!has(me, 'site_manage')) return ERR('権限がありません', 403);
    const artists = Array.isArray(body.artists) ? [...new Set(body.artists.map(a => String(a || '').trim()).filter(Boolean))] : [];
    const newArtist = typeof body.newArtist === 'string' ? body.newArtist.trim() : '';
    if (!artists.length) return ERR('対象の公演が選択されていません');
    if (!newArtist) return ERR('新しい名前を入力してください');

    const siteRows = (await env.DB.prepare("SELECT DISTINCT site FROM schedule WHERE type='work' AND site<>''").all()).results;
    const renameMap = {};
    for (const r of siteRows) {
      if (artists.includes(extractArtistName(r.site))) {
        const newSite = rebuildSiteName(r.site, newArtist);
        if (newSite && newSite !== r.site) renameMap[r.site] = newSite;
      }
    }
    const artistRenameMap = Object.fromEntries(artists.map(a => [a, newArtist]));
    const result = await applyArtistRenameMap(env, me, renameMap, `公演一覧の一括変更(→${newArtist})`, artistRenameMap);
    return J({ ok: 1, ...result });
  }

  // ---- 公演一覧限定: 公演名の一部を置換(手配者以上)。例:「vs」→「VS」のような表記統一。
  //      preview=trueの場合はDBを変更せず、変更対象の一覧(旧名→新名)だけを返す。
  //      body.artistsを指定すると、その公演名(本体名)の集合だけを対象にする(フォルダを開いた
  //      状態で実行した場合、フォルダ内の公演だけに絞り込むため)。省略時は全公演が対象。 ----
  if (method === 'POST' && path === '/artists/find-replace') {
    if (!has(me, 'site_manage')) return ERR('権限がありません', 403);
    const find = typeof body.find === 'string' ? body.find : '';
    const replace = typeof body.replace === 'string' ? body.replace : '';
    if (!find) return ERR('置換前の文字列を入力してください');
    const scopeArtists = Array.isArray(body.artists) ? new Set(body.artists.map(a => String(a || '').trim()).filter(Boolean)) : null;

    const siteRows = (await env.DB.prepare("SELECT DISTINCT site FROM schedule WHERE type='work' AND site<>''").all()).results;
    const renameMap = {};
    const artistChanges = {};
    for (const r of siteRows) {
      const artist = extractArtistName(r.site);
      if (scopeArtists && !scopeArtists.has(artist)) continue;
      if (!artist.includes(find)) continue;
      const newArtist = artist.split(find).join(replace);
      if (newArtist === artist) continue;
      artistChanges[artist] = newArtist;
      const newSite = rebuildSiteName(r.site, newArtist);
      if (newSite && newSite !== r.site) renameMap[r.site] = newSite;
    }
    if (body.preview) {
      return J({ ok: 1, changes: Object.entries(artistChanges).map(([from, to]) => ({ from, to })) });
    }
    const result = await applyArtistRenameMap(env, me, renameMap, `公演一覧の一部置換(${find}→${replace})`, artistChanges);
    return J({ ok: 1, ...result });
  }

  // ---- グループ(会場一覧・公演一覧共通)。手配者以上(site_manage)が自由に作成し、
  //      一覧のフィルタに使う。閲覧(GET)はsites_view権限があれば誰でも可。 ----
  if (method === 'GET' && path === '/site-groups') {
    if (!has(me, 'sites_view')) return ERR('ページが見つかりません', 404);
    const kind = url.searchParams.get('kind');
    if (!['venue', 'artist'].includes(kind)) return ERR('不正なkindです');
    const groups = (await env.DB.prepare('SELECT id,name FROM site_groups WHERE kind=? ORDER BY name').bind(kind).all()).results;
    const members = (await env.DB.prepare(
      `SELECT gm.group_id, gm.member FROM site_group_members gm JOIN site_groups g ON g.id=gm.group_id WHERE g.kind=?`
    ).bind(kind).all()).results;
    const byGroup = {};
    for (const m of members) (byGroup[m.group_id] ||= []).push(m.member);
    return J(groups.map(g => ({ id: g.id, name: g.name, members: byGroup[g.id] || [] })));
  }
  if (method === 'POST' && path === '/site-groups') {
    if (!has(me, 'site_manage')) return ERR('権限がありません', 403);
    const kind = String(body.kind || '');
    if (!['venue', 'artist'].includes(kind)) return ERR('不正なkindです');
    const name = String(body.name || '').trim();
    if (!name) return ERR('グループ名を入力してください');
    const members = Array.isArray(body.members) ? [...new Set(body.members.map(m => String(m || '').trim()).filter(Boolean))] : [];
    let groupId;
    try {
      const r = await env.DB.prepare('INSERT INTO site_groups(kind,name,created_by,created_at) VALUES(?,?,?,?)').bind(kind, name, me.id, jstTs()).run();
      groupId = r.meta.last_row_id;
    } catch (e) { return ERR('同じ名前のグループが既に存在します'); }
    for (const m of members) await env.DB.prepare('INSERT OR IGNORE INTO site_group_members(group_id,member) VALUES(?,?)').bind(groupId, m).run();
    return J({ ok: 1, id: groupId });
  }
  let sgm;
  if (method === 'PUT' && (sgm = path.match(/^\/site-groups\/(\d+)$/))) {
    if (!has(me, 'site_manage')) return ERR('権限がありません', 403);
    const id = Number(sgm[1]);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const members = Array.isArray(body.members) ? [...new Set(body.members.map(m => String(m || '').trim()).filter(Boolean))] : null;
    if (name) {
      try { await env.DB.prepare('UPDATE site_groups SET name=? WHERE id=?').bind(name, id).run(); }
      catch (e) { return ERR('同じ名前のグループが既に存在します'); }
    }
    if (members) {
      await env.DB.prepare('DELETE FROM site_group_members WHERE group_id=?').bind(id).run();
      for (const m of members) await env.DB.prepare('INSERT OR IGNORE INTO site_group_members(group_id,member) VALUES(?,?)').bind(id, m).run();
    }
    return J({ ok: 1 });
  }
  if (method === 'DELETE' && (sgm = path.match(/^\/site-groups\/(\d+)$/))) {
    if (!has(me, 'site_manage')) return ERR('権限がありません', 403);
    const id = Number(sgm[1]);
    await env.DB.prepare('DELETE FROM site_group_members WHERE group_id=?').bind(id).run();
    await env.DB.prepare('DELETE FROM site_groups WHERE id=?').bind(id).run();
    return J({ ok: 1 });
  }

  // ---- フォルダ(公演一覧限定)。グループより大きな括りで、複数の公演を1つの見出しにまとめて
  //      表示する。作成は手配者以上(site_manage)、閲覧はsites_view権限があれば誰でも可。 ----
  if (method === 'GET' && path === '/artist-folders') {
    if (!has(me, 'sites_view')) return ERR('ページが見つかりません', 404);
    const folders = (await env.DB.prepare('SELECT id,name FROM artist_folders ORDER BY name').all()).results;
    const members = (await env.DB.prepare('SELECT folder_id, artist FROM artist_folder_members').all()).results;
    const byFolder = {};
    for (const m of members) (byFolder[m.folder_id] ||= []).push(m.artist);
    return J(folders.map(f => ({ id: f.id, name: f.name, members: byFolder[f.id] || [] })));
  }
  if (method === 'POST' && path === '/artist-folders') {
    if (!has(me, 'site_manage')) return ERR('権限がありません', 403);
    const name = String(body.name || '').trim();
    if (!name) return ERR('フォルダ名を入力してください');
    const members = Array.isArray(body.members) ? [...new Set(body.members.map(m => String(m || '').trim()).filter(Boolean))] : [];
    let folderId;
    try {
      const r = await env.DB.prepare('INSERT INTO artist_folders(name,created_by,created_at) VALUES(?,?,?)').bind(name, me.id, jstTs()).run();
      folderId = r.meta.last_row_id;
    } catch (e) { return ERR('同じ名前のフォルダが既に存在します'); }
    for (const m of members) await env.DB.prepare('INSERT OR IGNORE INTO artist_folder_members(folder_id,artist) VALUES(?,?)').bind(folderId, m).run();
    return J({ ok: 1, id: folderId });
  }
  let afm;
  if (method === 'PUT' && (afm = path.match(/^\/artist-folders\/(\d+)$/))) {
    if (!has(me, 'site_manage')) return ERR('権限がありません', 403);
    const id = Number(afm[1]);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const members = Array.isArray(body.members) ? [...new Set(body.members.map(m => String(m || '').trim()).filter(Boolean))] : null;
    if (name) {
      try { await env.DB.prepare('UPDATE artist_folders SET name=? WHERE id=?').bind(name, id).run(); }
      catch (e) { return ERR('同じ名前のフォルダが既に存在します'); }
    }
    if (members) {
      await env.DB.prepare('DELETE FROM artist_folder_members WHERE folder_id=?').bind(id).run();
      for (const m of members) await env.DB.prepare('INSERT OR IGNORE INTO artist_folder_members(folder_id,artist) VALUES(?,?)').bind(id, m).run();
    }
    return J({ ok: 1 });
  }
  if (method === 'DELETE' && (afm = path.match(/^\/artist-folders\/(\d+)$/))) {
    if (!has(me, 'site_manage')) return ERR('権限がありません', 403);
    const id = Number(afm[1]);
    await env.DB.prepare('DELETE FROM artist_folder_members WHERE folder_id=?').bind(id).run();
    await env.DB.prepare('DELETE FROM artist_folders WHERE id=?').bind(id).run();
    return J({ ok: 1 });
  }

  // ---- 会場マニュアルの有無フラグの手動設定(手配者以上)。「この会場は既にマニュアルを
  //      用意済みか」を会場一覧で一目で分かるようにするための機能。行の存在=あり、として扱う
  //      (venue_manualsに行が無ければ「なし」)。本文(venue_manual_blocks)が実際に1件以上あれば
  //      PUT /venue-manual側で自動的にこのフラグも同期されるため、通常はここを手動で操作する
  //      必要はない(本文が無いままフラグだけ立てたい場合等の補助的な経路として残している)。 ----
  if (method === 'POST' && path === '/venues/manual-flag') {
    if (!has(me, 'site_manage')) return ERR('権限がありません', 403);
    const venue = typeof body.venue === 'string' ? body.venue.trim() : '';
    if (!venue) return ERR('会場名が必要です');
    if (body.hasManual) {
      await env.DB.prepare('INSERT OR REPLACE INTO venue_manuals(venue,updated_by,updated_at) VALUES(?,?,?)').bind(venue, me.id, jstTs()).run();
    } else {
      await env.DB.prepare('DELETE FROM venue_manuals WHERE venue=?').bind(venue).run();
    }
    return J({ ok: 1 });
  }

  // ---- 会場マニュアル本文(準備中機能、機能公開設定で通常は非表示)。自由配置キャンバス方式で、
  //      テキスト/写真/動画のブロックをx/y/w/h(基準幅1000pxの仮想キャンバスに対する絶対座標・
  //      サイズ。高さ方向は内容に応じて自由に伸ばせる)で保持する。フロント側はコンテナの実際の
  //      幅÷1000を拡大率としてtransform:scale()で一括縮小/拡大し、PC/スマホどちらでも同じ
  //      レイアウトに見せる。閲覧はsites_view、編集はsite_manage(手配者以上)。 ----
  if (method === 'GET' && path === '/venue-manual') {
    if (!has(me, 'sites_view')) return ERR('ページが見つかりません', 404);
    const venue = (url.searchParams.get('venue') || '').trim();
    if (!venue) return ERR('会場名が必要です');
    const [blocksRes, historyRes] = await Promise.all([
      env.DB.prepare('SELECT * FROM venue_manual_blocks WHERE venue=? ORDER BY z ASC, id ASC').bind(venue).all(),
      env.DB.prepare('SELECT * FROM venue_manual_history WHERE venue=? ORDER BY id DESC LIMIT 100').bind(venue).all(),
    ]);
    return J({ venue, blocks: blocksRes.results, history: historyRes.results });
  }

  // ---- 会場マニュアル本文の一括保存(sites_view、チーフ以上。マニュアルの追加・保存・編集は
  //      現場名一括改名等より対象を広く取り、チーフ以上なら誰でも書き込める)。フロントから現在の
  //      全ブロックを配列で受け取り、DB側の現在の内容とid単位で突き合わせて追加/変更/削除を判定する
  //      (差分diff方式)。ドラッグ中の中間状態は送られてこない(フロント側が「保存」操作単位で
  //      まとめて呼ぶ設計)ため、履歴には実際に変化したブロックの分だけ1行ずつ記録される。 ----
  if (method === 'PUT' && path === '/venue-manual') {
    if (!has(me, 'sites_view')) return ERR('権限がありません', 403);
    const venue = typeof body.venue === 'string' ? body.venue.trim() : '';
    if (!venue) return ERR('会場名が必要です');
    const MANUAL_TYPES = ['text', 'photo', 'video', 'shape', 'table'];
    const MANUAL_MAX_BLOCKS = 300; // 暴走防止の安全網(1会場あたり)
    const MANUAL_CANVAS_W = 1000; // 仮想キャンバスの基準幅(px相当)。高さは内容に応じて自由に伸ばせる
    const typeLabelOf = (t) => t === 'text' ? 'テキスト' : t === 'photo' ? '写真' : t === 'video' ? '動画' : t === 'shape' ? '図形' : '表';
    const clampNum = (n, def, min, max) => { const v = Number(n); return Number.isFinite(v) ? Math.round(Math.max(min, Math.min(max, v)) * 100) / 100 : def; };

    // 自由装飾(文字サイズ・色・図形の塗り/線・表の色等)の値を、type別に許可された範囲・形式だけ
    // 通すサニタイズ。フロントは<input type="color">等のUI部品からしか値を渡してこない前提だが、
    // 不正なJSONが送られてもCSS注入(styleクエリ文字列への攻撃)にならないよう、サーバー側でも
    // 16進カラーコード・enum・数値範囲を必ず検証してから保存する。
    const SHAPE_KINDS = ['rect', 'ellipse', 'line', 'arrow'];
    const TEXT_ALIGNS = ['left', 'center', 'right'];
    const isColor = (v) => typeof v === 'string' && (v === 'transparent' || /^#[0-9a-fA-F]{6}$/.test(v));
    const numIn = (v, def, min, max) => { const n = Number(v); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def; };
    const sanitizeStyle = (type, raw) => {
      const s = raw && typeof raw === 'object' ? raw : {};
      if (type === 'text') return {
        fontSize: numIn(s.fontSize, 15, 10, 96),
        color: isColor(s.color) ? s.color : '#1b2333',
        bg: isColor(s.bg) ? s.bg : '#fffdf4',
        bold: !!s.bold, italic: !!s.italic, underline: !!s.underline,
        align: TEXT_ALIGNS.includes(s.align) ? s.align : 'left',
        rotation: numIn(s.rotation, 0, -180, 180),
      };
      if (type === 'shape') return {
        shape: SHAPE_KINDS.includes(s.shape) ? s.shape : 'rect',
        fill: isColor(s.fill) ? s.fill : '#f5e9b8',
        stroke: isColor(s.stroke) ? s.stroke : '#c9a227',
        strokeWidth: numIn(s.strokeWidth, 2, 0, 20),
        rotation: numIn(s.rotation, 0, -180, 180),
        opacity: numIn(s.opacity, 1, 0.1, 1),
      };
      if (type === 'table') return {
        headerBg: isColor(s.headerBg) ? s.headerBg : '#f5e9b8',
        borderColor: isColor(s.borderColor) ? s.borderColor : '#d8cfa8',
        fontSize: numIn(s.fontSize, 13, 10, 40),
      };
      // photo / video
      return { rotation: numIn(s.rotation, 0, -180, 180), opacity: numIn(s.opacity, 1, 0.1, 1) };
    };
    // 表ブロックのcontent(行列データ)。行数・列数・セル文字数に上限を設け、
    // 全行の列数を最大列数にそろえる(不揃いだと表示側で崩れるため)。
    const TABLE_MAX_ROWS = 30, TABLE_MAX_COLS = 12, TABLE_MAX_CELL = 500;
    const sanitizeTableContent = (raw) => {
      let obj; try { obj = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { obj = null; }
      let cells = (obj && Array.isArray(obj.cells) && obj.cells.length) ? obj.cells : [['', '']];
      cells = cells.slice(0, TABLE_MAX_ROWS).map(row => (Array.isArray(row) ? row : ['']).slice(0, TABLE_MAX_COLS).map(c => String(c ?? '').slice(0, TABLE_MAX_CELL)));
      const cols = Math.max(1, ...cells.map(r => r.length));
      cells = cells.map(r => { while (r.length < cols) r.push(''); return r; });
      return JSON.stringify({ cells, header: !!(obj && obj.header) });
    };

    const incoming = Array.isArray(body.blocks) ? body.blocks : [];
    if (incoming.length > MANUAL_MAX_BLOCKS) return ERR(`ブロック数が多すぎます(1会場あたり上限${MANUAL_MAX_BLOCKS}件)`);

    const existing: any[] = (await env.DB.prepare('SELECT * FROM venue_manual_blocks WHERE venue=?').bind(venue).all()).results;
    const existingById: Map<number, any> = new Map(existing.map(b => [b.id, b]));
    const ts = jstTs();
    const historyRows = [];
    const seenIds = new Set();

    for (const raw of incoming) {
      const type = MANUAL_TYPES.includes(raw && raw.type) ? raw.type : null;
      if (!type) continue; // 不正な種別のブロックは無視し、他の正常なブロックの保存は継続する
      const content = type === 'table' ? sanitizeTableContent(raw.content) : (typeof raw.content === 'string' ? raw.content : '');
      const style = JSON.stringify(sanitizeStyle(type, raw.style));
      const x = clampNum(raw.x, 0, 0, MANUAL_CANVAS_W);
      const y = clampNum(raw.y, 0, 0, 20000);
      const w = clampNum(raw.w, 300, 10, MANUAL_CANVAS_W);
      const h = clampNum(raw.h, 150, 10, 20000);
      const z = Number.isFinite(Number(raw.z)) ? Math.trunc(Number(raw.z)) : 0;
      const id = Number(raw.id);

      if (raw.id && existingById.has(id)) {
        seenIds.add(id);
        const cur = existingById.get(id);
        const contentChanged = cur.content !== content;
        const styleChanged = (cur.style || '{}') !== style;
        const posChanged = cur.x !== x || cur.y !== y || cur.w !== w || cur.h !== h || cur.z !== z;
        if (!contentChanged && !styleChanged && !posChanged) continue;
        // 差し替えられた写真/動画は、古いR2オブジェクトを削除する(孤児化防止)
        if (contentChanged && (cur.type === 'photo' || cur.type === 'video') && cur.content && env.MANUALS) {
          try { await env.MANUALS.delete(cur.content); } catch (e) {}
        }
        await env.DB.prepare('UPDATE venue_manual_blocks SET content=?,style=?,x=?,y=?,w=?,h=?,z=?,updated_by=?,updated_at=? WHERE id=?')
          .bind(content, style, x, y, w, h, z, me.id, ts, id).run();
        const parts = [];
        if (contentChanged) parts.push('内容');
        if (styleChanged) parts.push('見た目');
        if (posChanged) parts.push('配置');
        historyRows.push([venue, id, 'edit', `${typeLabelOf(type)}ブロックの${parts.join('・')}を変更`, me.id, me.name, ts]);
      } else {
        const ins = await env.DB.prepare(
          'INSERT INTO venue_manual_blocks(venue,type,content,style,x,y,w,h,z,created_by,created_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)'
        ).bind(venue, type, content, style, x, y, w, h, z, me.id, ts, me.id, ts).run();
        historyRows.push([venue, ins.meta.last_row_id, 'add', `${typeLabelOf(type)}ブロックを追加`, me.id, me.name, ts]);
      }
    }

    for (const b of existing) {
      if (seenIds.has(b.id)) continue;
      if ((b.type === 'photo' || b.type === 'video') && b.content && env.MANUALS) {
        try { await env.MANUALS.delete(b.content); } catch (e) {}
      }
      await env.DB.prepare('DELETE FROM venue_manual_blocks WHERE id=?').bind(b.id).run();
      historyRows.push([venue, b.id, 'delete', `${typeLabelOf(b.type)}ブロックを削除`, me.id, me.name, ts]);
    }

    if (historyRows.length) {
      await env.DB.batch(historyRows.map(row => env.DB.prepare(
        'INSERT INTO venue_manual_history(venue,block_id,action,summary,user_id,user_name,created_at) VALUES(?,?,?,?,?,?,?)'
      ).bind(...row)));
    }

    // 実際にブロックが残っているかどうかで、会場一覧の「マニュアルあり」フラグを自動的に同期する
    const remain = await env.DB.prepare('SELECT COUNT(*) AS c FROM venue_manual_blocks WHERE venue=?').bind(venue).first();
    if ((remain.c || 0) > 0) {
      await env.DB.prepare('INSERT OR REPLACE INTO venue_manuals(venue,updated_by,updated_at) VALUES(?,?,?)').bind(venue, me.id, ts).run();
    } else {
      await env.DB.prepare('DELETE FROM venue_manuals WHERE venue=?').bind(venue).run();
    }

    const blocks = (await env.DB.prepare('SELECT * FROM venue_manual_blocks WHERE venue=? ORDER BY z ASC, id ASC').bind(venue).all()).results;
    const history = (await env.DB.prepare('SELECT * FROM venue_manual_history WHERE venue=? ORDER BY id DESC LIMIT 100').bind(venue).all()).results;
    return J({ ok: 1, blocks, history });
  }

  // ---- 会場マニュアルの写真/動画アップロード(sites_view、チーフ以上。PUT /venue-manualと同じ
  //      対象範囲)。multipart/form-dataでvenue・kind('photo'|'video')・fileを受け取り、
  //      R2(MANUALSバケット)へ保存してキーを返す。返されたキーを、PUT /venue-manualの
  //      ブロックcontentとして使う。 ----
  if (method === 'POST' && path === '/venue-manual/upload') {
    if (!has(me, 'sites_view')) return ERR('権限がありません', 403);
    if (!env.MANUALS) return ERR('R2が未設定です', 500);
    let form;
    try { form = await req.formData(); } catch (e) { return ERR('アップロード形式が不正です'); }
    const venue = String(form.get('venue') || '').trim();
    const kind = String(form.get('kind') || '');
    const file = form.get('file');
    if (!venue) return ERR('会場名が必要です');
    if (kind !== 'photo' && kind !== 'video') return ERR('種別が不正です');
    if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') return ERR('ファイルが指定されていません');
    const contentType = file.type || '';
    if (kind === 'photo' && !contentType.startsWith('image/')) return ERR('画像ファイルを選択してください');
    if (kind === 'video' && !contentType.startsWith('video/')) return ERR('動画ファイルを選択してください');
    const MAX = kind === 'photo' ? 8 * 1024 * 1024 : 80 * 1024 * 1024;
    if (file.size > MAX) return ERR(`ファイルが大きすぎます(上限${Math.round(MAX / 1024 / 1024)}MB)`);
    const ext = (String(file.name || '').match(/\.[a-zA-Z0-9]+$/) || [''])[0] || (kind === 'photo' ? '.jpg' : '.mp4');
    const key = `manuals/${encodeURIComponent(venue)}/${jstTs().replace(/[: ]/g, '-')}_${rnd().slice(0, 10)}${ext}`;
    await env.MANUALS.put(key, await file.arrayBuffer(), { httpMetadata: { contentType } });
    return J({ key });
  }

  // ---- 会場一覧: 選択した複数の会場名を、まとめて統一名称に変更(手配者以上)。
  //      現場一覧の一括改名と違い、対象は(日付,現場名,会場)の組ではなく会場名そのもの。
  //      選択した会場名のどれかに一致するscheduleの全行(過去・未来・全期間)が対象になる。 ----
  if (method === 'POST' && path === '/venues/bulk-rename') {
    if (!has(me, 'site_manage')) return ERR('権限がありません', 403);
    const venues = Array.isArray(body.venues) ? [...new Set(body.venues.map(v => String(v || '').trim()).filter(Boolean))] : [];
    const newVenue = typeof body.newVenue === 'string' ? body.newVenue.trim() : '';
    if (!venues.length) return ERR('対象の会場が選択されていません');
    if (!newVenue) return ERR('新しい会場名を入力してください');

    const ts = jstTs();
    const batch = [];
    const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
    const ph = venues.map(() => '?').join(',');

    const targets = (await env.DB.prepare(
      `SELECT DISTINCT user_id, date FROM schedule WHERE type='work' AND venue IN (${ph})`
    ).bind(...venues).all()).results;

    let updatedDays = 0;
    for (const { user_id, date } of targets) {
      // その人・その日の全スロットを取得し、対象の会場と一致するスロットだけ改名する
      // (同じ日に他の予定が混在していても、それらは変更しない)
      const before = (await env.DB.prepare('SELECT * FROM schedule WHERE user_id=? AND date=? ORDER BY slot').bind(user_id, date).all()).results;
      const beforeJson = JSON.stringify(before.map(stripRow));
      const afterRows = before.map(r => (r.type === 'work' && venues.includes(r.venue)) ? { ...r, venue: newVenue } : r);
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
        .bind(ts, me.id, user_id, date, beforeJson, JSON.stringify({ slots: afterRows.map(stripRow), _src: `会場一覧の一括変更(→${newVenue})` })));
      updatedDays++;
    }
    if (batch.length) for (const part of chunk(batch, 200)) await env.DB.batch(part);

    // 未配置のまま登録だけされている現場(site_registry)が旧会場名を参照していれば、あわせて更新する
    await env.DB.prepare(`UPDATE site_registry SET venue=? WHERE venue IN (${ph})`).bind(newVenue, ...venues).run();

    // 会場マニュアルの有無フラグも、統合後の新しい会場名に引き継ぐ(元のいずれかが「あり」なら引き継ぐ)
    const hadManual = await env.DB.prepare(`SELECT 1 FROM venue_manuals WHERE venue IN (${ph}) LIMIT 1`).bind(...venues).first();
    await env.DB.prepare(`DELETE FROM venue_manuals WHERE venue IN (${ph})`).bind(...venues).run();
    if (hadManual) await env.DB.prepare('INSERT OR REPLACE INTO venue_manuals(venue,updated_by,updated_at) VALUES(?,?,?)').bind(newVenue, me.id, ts).run();
    // 会場マニュアルの本文・更新履歴も、統合後の新しい会場名にそのまま付け替える
    // (両方に本文がある場合は単純に合算されるため、必要なら手動で位置を整理し直す想定)
    await env.DB.prepare(`UPDATE venue_manual_blocks SET venue=? WHERE venue IN (${ph})`).bind(newVenue, ...venues).run();
    await env.DB.prepare(`UPDATE venue_manual_history SET venue=? WHERE venue IN (${ph})`).bind(newVenue, ...venues).run();

    // 会場グループのメンバー名も、統合後の新しい会場名に付け替える(OR IGNOREで、同じグループに
    // 既に新名が存在する場合はそのまま=静かにスキップする)
    for (const oldVenue of venues) {
      if (oldVenue === newVenue) continue;
      await env.DB.prepare("UPDATE OR IGNORE site_group_members SET member=? WHERE member=? AND group_id IN (SELECT id FROM site_groups WHERE kind='venue')").bind(newVenue, oldVenue).run();
    }

    return J({ ok: 1, updatedDays, ts });
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
      // グループ内訳を出す対象は「手配グループを持つ人」
      env.DB.prepare("SELECT id, name, ka FROM users WHERE COALESCE(is_manager,0)=1").all(),
    ]);
    const members = membersRes.results;
    for (const m of members) m.base = baseFromRegno(m.regno); // 都度計算(DB保存はしない)

    const managers = managersRes.results;
    const mgrName = {}; for (const m of managers) mgrName[m.id] = m.name;
    const chiefLabel = m => m.ka === '1課' ? 'チーフ手配(1課)' : m.ka === '2課' ? 'チーフ手配(2課)' : 'チーフ手配';

    const groupBy = (rows, keyFn) => {
      const map: Record<string, any[]> = {};
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
    const byManagerMap: Record<string, any> = {};
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

  // ---- 研修ごとの未受講者リスト(マナー研修/チーム研修(2部)/ステージアップ研修)。
  //      停止中アカウントも育成対象として含める(scheduling-domain.mdの原則どおりsuspendedで絞らない)。
  if (method === 'GET' && path === '/training-status') {
    if (!has(me, 'member_stats_view')) return ERR('ページが見つかりません', 404);
    const rows = (await env.DB.prepare(
      "SELECT id, name, rank, ka, han, manager_id, suspended, manner_done, team2_done, su_done, manner_date, team2_date, su_date FROM users ORDER BY rank, id"
    ).all()).results;
    const managers = (await env.DB.prepare("SELECT id, name FROM users WHERE COALESCE(is_manager,0)=1").all()).results;
    const mgrName: Record<string, string> = {}; for (const m of managers as any[]) mgrName[m.id] = m.name;
    // ランクが既にD以上/C以上なら、過去の昇格実績自体が受講済みの証拠になるため、
    // 何らかの理由でフラグがfalseのまま残っていても表示上は受講済みとみなす(防御的措置。
    // 既存データはmigrate-training-dates.sqlで補正済みだが、手動のランク変更等で今後も
    // フラグとランクがずれた場合に、見た目だけでも矛盾しないようにする)。
    const RANK_LV: Record<string, number> = { E: 0, D: 1, C: 2, B: 3, A: 4 };
    const lv = (r: any) => RANK_LV[rankLetter(r.rank)] ?? -1;
    const effManner = (r: any) => !!r.manner_done || lv(r) >= RANK_LV.D;
    const effTeam2 = (r: any) => !!r.team2_done || lv(r) >= RANK_LV.C;
    const effSu = (r: any) => !!r.su_done || lv(r) >= RANK_LV.C;
    const lastTrainingDate = (r: any) => [r.manner_date, r.team2_date, r.su_date].filter(Boolean).sort().pop() || '';
    const pubRow = (r: any) => ({
      id: r.id, name: r.name, rank: r.rank, ka: r.ka, han: r.han,
      lastTrainingDate: lastTrainingDate(r),
      suspended: r.suspended ? 1 : 0,
      managerName: r.manager_id ? (mgrName[r.manager_id] || '') : (r.ka === '1課' ? 'チーフ手配(1課)' : r.ka === '2課' ? 'チーフ手配(2課)' : 'チーフ手配'),
    });
    return J({
      manner: (rows as any[]).filter(r => !effManner(r)).map(pubRow),
      team2: (rows as any[]).filter(r => !effTeam2(r)).map(pubRow),
      su: (rows as any[]).filter(r => !effSu(r)).map(pubRow),
    });
  }

  // ---- 管理者ダッシュボード。複数の集計を1画面にまとめて返す ----
  if (method === 'GET' && path === '/dashboard') {
    if (!has(me, 'dashboard_view')) return ERR('ページが見つかりません', 404);
    const canPay = has(me, 'site_pay'); // 給与見込みを見せるかどうか
    const today = jstDate();
    const month = today.slice(0, 7);
    const prevMonth = (() => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCMonth(d.getUTCMonth() - 1, 1); return d.toISOString().slice(0, 7); })();
    // 直近6ヶ月(当月含む)の推移グラフ用。5ヶ月前の月初を下限にする
    const trendStart = (() => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCMonth(d.getUTCMonth() - 5, 1); return d.toISOString().slice(0, 10); })();
    // cronが「今日」「昨日」のいずれでもない日付なら、実行が滞っているとみなす
    const yesterday = (() => { const d = new Date(Date.now() + 9 * 3600e3); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
    const isStale = (d) => !d || (d !== today && d !== yesterday);

    // 個々のクエリでエラーが起きても、ダッシュボード全体を落とさず「取得できなかった」扱いにする。
    // (例:マイグレーション未適用で新しい列が本番DBに存在しない場合など)
    const safe = (p, fallback) => p.catch(e => { console.error('[dashboard] query failed:', e); return fallback; });
    const emptyAll = { results: [] };

    const [
      daichoLastRun, rankLastRun, notifyLastRun, rankCacheLastRun, schedSourcesRes,
      selfReportsRes, nominationsRes, reportsRes, rookieUnevaluatedRes,
      monthRowsRes, prevMonthRowsRes, usersRes, lockDays, trendRes,
    ] = await Promise.all([
      safe(getSetting(env, 'daicho_reload_last_run', ''), ''),
      safe(getSetting(env, 'rank_promotion_last_run', ''), ''),
      safe(getSetting(env, 'notify_last_run', ''), ''),
      safe(getSetting(env, 'rank_cache_last_run', ''), ''),
      safe(env.DB.prepare("SELECT label, last_run, last_result, freq_type, interval_hours, hour FROM sched_sources WHERE enabled=1 ORDER BY last_run ASC").all(), emptyAll),
      safe(env.DB.prepare("SELECT created_at FROM self_reports WHERE status='pending'").all(), emptyAll),
      safe(env.DB.prepare("SELECT created_at FROM site_nominations WHERE status='pending'").all(), emptyAll),
      safe(env.DB.prepare("SELECT id FROM reports WHERE status='pending'").all(), emptyAll),
      safe(env.DB.prepare(
        `SELECT rc.regno, MIN(rc.first_seen_ts) AS created_at FROM rookie_candidates rc
         WHERE NOT EXISTS (SELECT 1 FROM rookie_quick_evals e WHERE e.regno = rc.regno)
         GROUP BY rc.regno`
      ).all(), emptyAll),
      safe(env.DB.prepare("SELECT user_id, site, hours, overtime, pay FROM schedule WHERE type='work' AND site<>'' AND date LIKE ?").bind(month + '%').all(), emptyAll),
      safe(env.DB.prepare("SELECT hours, overtime, pay FROM schedule WHERE type='work' AND site<>'' AND date LIKE ?").bind(prevMonth + '%').all(), emptyAll),
      safe(env.DB.prepare("SELECT id, name, regno, rank, manager_id, suspended, manner_done, team2_done, su_done, promotion_pending_date, promotion_pending_rank FROM users").all(), emptyAll),
      safe(getLockDays(env), 14),
      safe(env.DB.prepare("SELECT substr(date,1,7) AS ym, COUNT(*) AS headcount, COUNT(DISTINCT site) AS sites, SUM(hours) AS hours, SUM(pay) AS pay FROM schedule WHERE type='work' AND site<>'' AND date>=? GROUP BY ym ORDER BY ym").bind(trendStart).all(), emptyAll),
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
      { key: 'rankCache', label: '会場/公演ランキングのキャッシュ更新', lastRun: rankCacheLastRun, bad: isStale(rankCacheLastRun) },
    ];
    const systemStatus = { jobs, hasIssue: jobs.some(j => j.bad) };

    // ② 対応が必要(滞留日数も一緒に返す)
    const daysSince = (ts) => { if (!ts) return 0; const d = Math.floor((Date.now() - Date.parse(ts.replace(' ', 'T') + '+09:00')) / 86400000); return Math.max(0, d); };
    const maxDays = (rows) => rows.reduce((m, r) => Math.max(m, daysSince(r.created_at)), 0);
    const rookieExcludedSet = new Set((await getRookieExcluded(env)).map((x: any) => x.regno));
    const rookieUnevaluatedRows = (rookieUnevaluatedRes.results as any[]).filter(r => !rookieExcludedSet.has(r.regno));
    const todo = {
      selfReports: { count: selfReportsRes.results.length, maxDays: maxDays(selfReportsRes.results) },
      nominations: { count: nominationsRes.results.length, maxDays: maxDays(nominationsRes.results) },
      reportChecks: { count: reportsRes.results.length },
      rookieUnevaluated: { count: rookieUnevaluatedRows.length, maxDays: maxDays(rookieUnevaluatedRows) },
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
    const byUser: Record<string, any> = {};
    for (const r of monthRowsRes.results) {
      const a = byUser[r.user_id] ||= { dates: new Set(), hours: 0, overtime: 0, siteCounts: {} };
      a.hours += r.hours || 0; a.overtime += r.overtime || 0;
      if (r.site) a.siteCounts[r.site] = (a.siteCounts[r.site] || 0) + 1;
    }
    // maxStreakの計算にはdate列も要るため、別途取得(user_id, dateのみ、軽量)
    const dateRows = (await safe(env.DB.prepare("SELECT user_id, date FROM schedule WHERE type='work' AND site<>'' AND date LIKE ?").bind(month + '%').all(), emptyAll)).results;
    const datesByUser: Record<string, any[]> = {};
    for (const r of dateRows) (datesByUser[r.user_id] ||= []).push(r.date);
    let overTotal = 0, streak = 0, few = 0, samesite = 0, overtimeCnt = 0;
    for (const [uid, a] of Object.entries(byUser)) {
      const workDays = new Set(dateRows.filter(r => String(r.user_id) === uid).map(r => r.date)).size;
      const ms = longestStreak(datesByUser[uid] || []);
      let topCnt = 0; for (const c of Object.values(a.siteCounts) as number[]) if (c > topCnt) topCnt = c;
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
    // 「昇格予定」は、実際にこれから上がる人だけを出す。過去に手動変更・査定で先にランクが上がった等の
    // 理由で無効になった予約がDBに残っていることがあるため、以下を満たすものだけに絞る:
    //   ・予約先ランクが入っている ・停止中でない ・予約先が現在のランクより上位(＝まだ上がっていない)
    const RANK_ORDER = { E: 0, D: 1, C: 2, B: 3, A: 4 };
    const upcoming = users
      .filter(u => {
        if (!u.promotion_pending_date || !u.promotion_pending_rank) return false;
        if (u.promotion_pending_date > nextMonthEnd) return false;
        const from = RANK_ORDER[rankLetter(u.rank)];
        const to = RANK_ORDER[String(u.promotion_pending_rank).toUpperCase()];
        if (to === undefined) return false;
        return from === undefined || to > from; // 現ランク未設定なら予約を尊重、そうでなければ上位への予約のみ
      })
      .sort((a, b) => a.promotion_pending_date.localeCompare(b.promotion_pending_date))
      .slice(0, 10)
      .map(u => ({ name: u.name, from: rankLetter(u.rank) || '未設定', to: u.promotion_pending_rank, date: u.promotion_pending_date }));
    const waitingTeam2Only = users.filter(u => rankLetter(u.rank) === 'D' && u.team2_done && !u.su_done).length;
    const waitingSuOnly = users.filter(u => rankLetter(u.rank) === 'D' && u.su_done && !u.team2_done).length;
    const promotions = { upcoming, waitingTeam2Only, waitingSuOnly };

    // ⑥ データの不備
    // 停止中のアカウントも対象に含める(停止はログインを止める措置であり、データ整備の対象からは外さない)
    const noRank = users.filter(u => !String(u.rank || '').trim()).length;
    const noManager = users.filter(u => !u.manager_id).length; // チーフ手配として意図的に空の場合も含む参考値
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

    // ⑧ 直近6ヶ月の推移(折れ線グラフ用)。実績が無い月も0で埋め、必ず6件返す
    const trendMap = {};
    for (const r of (trendRes.results || [])) trendMap[r.ym] = r;
    const trend = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(Date.now() + 9 * 3600e3);
      d.setUTCMonth(d.getUTCMonth() - i, 1);
      const ym = d.toISOString().slice(0, 7);
      const r = trendMap[ym];
      trend.push({
        ym,
        sites: r ? r.sites : 0,
        headcount: r ? r.headcount : 0,
        hours: r ? Math.round(r.hours || 0) : 0,
        pay: canPay ? (r ? Math.round(r.pay || 0) : 0) : null,
      });
    }

    // ⑨ 当月の日別の配置人数(棒グラフ用)。月末までの全日を0埋めして返す
    const daysInMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
    const dailyCount = {};
    for (const r of dateRows) dailyCount[r.date] = (dailyCount[r.date] || 0) + 1;
    const daily = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${month}-${String(d).padStart(2, '0')}`;
      daily.push({ date: ds, count: dailyCount[ds] || 0 });
    }

    // ⑩ ランク構成(ドーナツグラフ用)。停止中のアカウントも含める
    //(停止はアプリへのログインを止めるだけの措置で、在籍・集計の対象からは外さない運用のため)
    const rankDist = ['A', 'B', 'C', 'D', 'E'].map(letter => ({ rank: letter, count: users.filter(u => rankLetter(u.rank) === letter).length }));
    const rankNone = users.filter(u => !rankLetter(u.rank)).length;

    return J({ systemStatus, todo, monthly, attention, promotions, dataIssues, payLock, canPay, trend, daily, rankDist, rankNone, today });
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
    const umap: Record<string, any> = {}; for (const u of users) umap[u.id] = u;
    const agg: Record<string, any> = {};
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
      for (const [site, cnt] of Object.entries(a.siteCounts) as [string, number][]) { if (cnt > topSiteCount) { topSite = site; topSiteCount = cnt; } }
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
    const byMgr: Record<string, any> = {};
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
    if (body.all) {
      await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('import_urls',?)").bind('[]').run();
      return J({ ok: 1, urls: [] });
    }
    const toRemove = body.url ? [body.url] : (Array.isArray(body.urls) ? body.urls : []);
    await removeImportUrls(env, toRemove);
    const raw = JSON.parse(await getSetting(env, 'import_urls', '[]') || '[]');
    return J({ ok: 1, urls: raw.map(x => typeof x === 'string' ? { url: x, sheetTitle: '', savedAt: '', targetDate: '' } : x) });
  }

  // ---- 手配者専用 ----
  if (method === 'GET' && path === '/online') {
    if (!handlerMode && !has(me, 'handler_tools')) return ERR('ページが見つかりません', 404);
    // 「今どのページを見ているか」はactivity_view権限(管理者以上)を持つ人にだけ含める
    const canSeeActivity = has(me, 'activity_view');
    const rows = (await env.DB.prepare(
      `SELECT u.id AS uid,u.name,u.role,u.regno,MAX(s.last_seen) AS last_seen,MAX(s.handler) AS handler
       ${canSeeActivity ? ",(SELECT s2.last_page FROM sessions s2 WHERE s2.user_id=u.id ORDER BY s2.last_seen DESC LIMIT 1) AS last_page" : ''}
       FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.last_seen>? GROUP BY u.id ORDER BY last_seen DESC`
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
    const ids: number[] = Array.isArray(body.ids) ? body.ids.map(Number).filter(n => n > 0) : [];
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
    // 新人リストの軽い評価から引き上げた場合、その評価にreport_idを紐付ける(遡り確認用)
    if (body.rookie_eval_id && newReportId) {
      await env.DB.prepare('UPDATE rookie_quick_evals SET report_id=? WHERE id=?').bind(newReportId, Number(body.rookie_eval_id)).run();
    }
    await notifyChiefs(env, 'report', `📝 新人報告:${r.candidate_name}(報告者:${me.name})${r.status === 'pending' ? ' — 2次チェックをお願いします' : ''}`, newReportId ? `#/reports?open=${newReportId}` : '');
    await rookieNotify(env, r);
    try { await matchNameAgainstFullHistory(env, r.candidate_name); } catch (e) {}
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
    try { await matchNameAgainstFullHistory(env, body.name); } catch (e) {}
    return J({ ok: 1 });
  }

  // ---- 管理者:全データ閲覧 ----
  if (method === 'GET' && path === '/admin/data') {
    if (me.role !== 'admin') return ERR('ページが見つかりません', 404);
    const Q = {
      users: "SELECT regno AS 登録番号, name AS 氏名, role AS 役割, rank AS ランク, han AS 班, station AS 最寄駅, skills AS できること, CASE WHEN pass_hash IS NULL THEN '初期PW(登録番号のまま)' ELSE '本人が変更済み' END AS パスワード状態, created AS 作成日 FROM users ORDER BY regno",
      // 「全データ閲覧」は名前のとおり全件を返す(以前はschedule/history/notificationsだけ件数上限が
      // あり、ダウンロードしても一部しか出てこなかった。本番で計15万行程度あるが、D1のクエリ自体は
      // 500ms前後で終わるため上限を設けない。sessionsは「ログイン中・編集履歴」画面へ移設した)。
      schedule: "SELECT u.name AS 氏名, s.date AS 日付, s.slot AS 枠, s.type AS 種別, s.site AS 現場名, s.venue AS 会場, s.tin AS 'IN', s.tout AS 'OUT', s.hours AS 時間, s.overtime AS 時間外, s.pay AS 給与, s.note AS 備考, COALESCE(d.plan,'') AS 育成計画 FROM schedule s JOIN users u ON u.id=s.user_id LEFT JOIN dev_plan d ON d.user_id=s.user_id AND d.date=s.date ORDER BY s.date DESC, s.slot",
      history: "SELECT h.ts AS 日時, COALESCE(e.name, CASE WHEN h.editor_id=0 THEN 'スプレッドシート' ELSE '不明' END) AS 編集者, t.name AS 対象, h.date AS 対象日, h.before_json AS 変更前, h.after_json AS 変更後 FROM schedule_history h LEFT JOIN users e ON e.id=h.editor_id LEFT JOIN users t ON t.id=h.target_id ORDER BY h.id DESC",
      reports: "SELECT ts AS 日時, reporter_name AS 報告者, candidate_name AS 候補者, candidate_grade AS 学年, first_chief AS '1次_連絡チーフ', first_note AS '1次_所感', s_motivation AS やる気, s_response AS 受け答え, s_total AS 総合点, draft AS ドラフト, plan AS 育成計画, checker AS チェック者, next_site AS 次回現場, next_date AS 次回日付, status AS 状態 FROM reports ORDER BY id DESC",
      blacklist: "SELECT ts AS 登録日時, date AS 日付, reporter AS 報告者, name AS 名前, s_talk AS 会話, s_dress AS 服装, s_groom AS 身なり, s_late AS 遅刻, s_work AS 業務, reason AS 理由, added_by AS 登録者 FROM blacklist ORDER BY id DESC",
      notifications: "SELECT n.ts AS 日時, u.name AS 宛先, n.message AS 内容, CASE n.read WHEN 1 THEN '既読' ELSE '未読' END AS 状態 FROM notifications n JOIN users u ON u.id=n.user_id ORDER BY n.id DESC",
      sessions: "SELECT u.name AS 氏名, u.regno AS 登録番号, CASE s.handler WHEN 1 THEN '手配モード中' ELSE '' END AS 手配, s.last_page AS 最後に見ていたページ, datetime(s.last_seen/1000,'unixepoch','+9 hours') AS 最終アクセス, datetime(s.created/1000,'unixepoch','+9 hours') AS ログイン日時 FROM sessions s JOIN users u ON u.id=s.user_id ORDER BY s.last_seen DESC"
    };
    const sql = Q[url.searchParams.get('table')];
    if (!sql) return ERR('不正なテーブル名です');
    return J((await env.DB.prepare(sql).all()).results);
  }

  // ---- アプリ構造ビューア(#/app-structure、管理者専用) ----
  // 権限一覧・機能公開キーはPERMS/FEATURE_KEYSから、DBテーブル構造は実際のD1(sqlite_master)から
  // 都度取得するため、コード変更に自動追従する(schema.sqlとの食い違いにも気づける)。
  // 画面一覧・APIエンドポイント一覧・ファイル構成の説明文はAPP_STRUCTURE_*の静的データを返す。
  if (method === 'GET' && path === '/app-structure') {
    if (me.role !== 'admin') return ERR('ページが見つかりません', 404);
    const tableRows = (await env.DB.prepare(
      "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\' ORDER BY name"
    ).all()).results;
    const parseCreateTableSql = (sqlText) => {
      const openIdx = sqlText.indexOf('(');
      const closeIdx = sqlText.lastIndexOf(')');
      if (openIdx < 0 || closeIdx < 0) return [];
      const body = sqlText.slice(openIdx + 1, closeIdx);
      const cols = [];
      for (const raw of body.split(/\r?\n/)) {
        const t = raw.trim();
        if (!t) continue;
        if (/^(UNIQUE|PRIMARY KEY)\s*\(/i.test(t)) { cols.push({ name: null, type: 'CONSTRAINT', note: t.replace(/,$/, '') }); continue; }
        const cm = t.match(/^(\w+)\s+([A-Z]+(?:\([^)]*\))?)([\s\S]*)$/);
        if (!cm) continue;
        let rest = cm[3], note = '';
        const cIdx = rest.indexOf('--');
        if (cIdx >= 0) { note = rest.slice(cIdx + 2).trim(); rest = rest.slice(0, cIdx); }
        rest = rest.trim().replace(/,$/, '').trim();
        cols.push({ name: cm[1], type: cm[2] + (rest ? ' ' + rest : ''), note });
      }
      return cols;
    };
    // 各テーブルの行数(どこにデータが溜まっているかの可視化用)。テーブル名はsqlite_master由来の
    // 実在する識別子なのでSQLに直接埋めてよい。UNION ALLでまとめようとするとD1の
    // 「too many terms in compound SELECT」制限に掛かるため、1テーブル=1文のままbatch()に渡して
    // 1往復で取得する。
    const rowCounts = {};
    try {
      const stmts = tableRows.map(t => env.DB.prepare(`SELECT COUNT(*) AS c FROM "${t.name}"`));
      if (stmts.length) {
        const res = await env.DB.batch(stmts);
        res.forEach((r, i) => {
          const c = (r.results || [])[0];
          if (c) rowCounts[tableRows[i].name] = c.c;
        });
      }
    } catch (e) { console.error('[app-structure] row count failed:', e); }
    const tables = tableRows.map(t => ({
      name: t.name,
      comment: APP_STRUCTURE_TABLE_COMMENTS[t.name] || '',
      columns: parseCreateTableSql(t.sql || ''),
      rows: rowCounts[t.name] ?? null,
    }));
    const permissions = Object.entries(PERMS).map(([key, p]) => ({ key, label: p.label, baseLv: effBaseLv(key), defaultBaseLv: p.baseLv }));
    const apiEndpointCount = APP_STRUCTURE_API_GROUPS.reduce((n, g) => n + g.rows.length, 0);
    const jst = new Date(Date.now() + 9 * 3600 * 1000);
    return J({
      meta: {
        title: 'RB事業2課 スケジュール管理システム',
        generated: jst.toISOString().slice(0, 10),
        stack: ['Cloudflare Workers', 'D1 (SQLite互換)', 'R2', 'バックエンド: TypeScript(wrangler内蔵esbuildでビルド)', 'フロントエンド: Vanilla JavaScript(ビルド不要・単一ファイル構成)'],
        files: {
          backend: `src/index.ts (API・cron処理を含む単一ファイル)`,
          frontend: `public/app.js (全画面・全モーダルを含む単一ファイル)`,
          css: `public/style.css`,
        },
      },
      roles: APP_STRUCTURE_ROLES,
      permissions,
      featureKeys: FEATURE_KEYS,
      cronJobs: APP_STRUCTURE_CRON,
      pages: APP_STRUCTURE_PAGES,
      apiGroups: APP_STRUCTURE_API_GROUPS,
      apiEndpointCount,
      files: APP_STRUCTURE_FILES,
      db: { tableCount: tables.length, tables },
    });
  }

  // ---- 過去データ取込確認(管理者だけ閲覧可能なデモデータ。月単位でOK(公開)/NG(削除)) ----
  if (method === 'GET' && path === '/legacy-import/months') {
    if (me.role !== 'admin') return ERR('ページが見つかりません', 404);
    const rows = (await env.DB.prepare(
      `SELECT ym,
        COUNT(*) AS total,
        SUM(CASE WHEN user_id IS NOT NULL THEN 1 ELSE 0 END) AS matched,
        SUM(CASE WHEN user_id IS NULL THEN 1 ELSE 0 END) AS unmatched,
        SUM(pay) AS totalPay,
        SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) AS approvedCnt,
        SUM(CASE WHEN status='skipped' THEN 1 ELSE 0 END) AS skippedCnt,
        SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pendingCnt
       FROM legacy_import_shifts GROUP BY ym ORDER BY ym`
    ).all()).results;
    return J(rows);
  }
  let lim;
  if (method === 'GET' && (lim = path.match(/^\/legacy-import\/months\/([\d-]+)$/))) {
    if (me.role !== 'admin') return ERR('ページが見つかりません', 404);
    const ym = lim[1];
    const rows = (await env.DB.prepare(
      `SELECT s.id, s.date, s.user_id, s.regno, s.name, s.rank, s.site, s.venue, s.duty, s.tin, s.tout, s.hours, s.pay, s.note, s.status,
        u.name AS matched_name, u.regno AS matched_regno
       FROM legacy_import_shifts s LEFT JOIN users u ON u.id = s.user_id
       WHERE s.ym=? ORDER BY s.date, s.name`
    ).bind(ym).all()).results;
    return J(rows);
  }
  if (method === 'POST' && (lim = path.match(/^\/legacy-import\/months\/([\d-]+)\/approve$/))) {
    if (me.role !== 'admin') return ERR('ページが見つかりません', 404);
    const result = await approveLegacyMonth(env, me, lim[1]);
    return J({ ok: 1, ...result });
  }
  if (method === 'POST' && (lim = path.match(/^\/legacy-import\/months\/([\d-]+)\/reject$/))) {
    if (me.role !== 'admin') return ERR('ページが見つかりません', 404);
    const ym = lim[1];
    const r = await env.DB.prepare("DELETE FROM legacy_import_shifts WHERE ym=? AND status='pending'").bind(ym).run();
    return J({ ok: 1, deleted: r.meta.changes });
  }
  // ---- 過去データ取込確認のまとめて公開(管理者)。指定した複数の月を、1ヶ月ずつ順番にapproveLegacyMonth()で
  //      処理する(1回のトランザクションにまとめると対象月数によってはD1のバッチ上限に達するため、月ごとに分ける)。 ----
  if (method === 'POST' && path === '/legacy-import/months/bulk-approve') {
    if (me.role !== 'admin') return ERR('ページが見つかりません', 404);
    const yms = Array.isArray(body.yms) ? [...new Set(body.yms.map(y => String(y || '')).filter(Boolean))].sort() : [];
    if (!yms.length) return ERR('対象の月が選択されていません');
    let approved = 0, skipped = 0, unmatched = 0;
    const perMonth = [];
    for (const ym of yms) {
      const r = await approveLegacyMonth(env, me, ym);
      approved += r.approved; skipped += r.skipped; unmatched += r.unmatched;
      perMonth.push({ ym, ...r });
    }
    return J({ ok: 1, approved, skipped, unmatched, months: perMonth });
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

  // ---- チャット(ポーリング方式) ----
  // ルーム種別ごとのアクセス可否判定。'all'は全員、'ka'は同じ課、'manager'は本人+その手配担当の
  // チーム(manager_id未設定者はka単位の仮想チーム'ka:<課>')、'dm'は当事者2名、'site'は当日その
  // 現場に配置されている本人、またはsite_manage権限者・管理者(手配管理のため)。
  async function chatRoomAuthorized(env, me, room) {
    if (room.type === 'all') return true;
    if (room.type === 'ka') return room.ref_key === (me.ka || '未設定');
    if (room.type === 'manager') {
      if (String(room.ref_key).startsWith('ka:')) return !me.manager_id && room.ref_key === 'ka:' + (me.ka || '未設定');
      return String(me.id) === room.ref_key || String(me.manager_id || '') === room.ref_key;
    }
    if (room.type === 'dm') {
      const [a, b] = String(room.ref_key).split('-');
      return String(me.id) === a || String(me.id) === b;
    }
    if (room.type === 'site') {
      // 現場チャットの閲覧は、現場に入っている本人と管理者のみに限定する(2026年9月、ユーザーの
      // 明示的な指示。site_manage権限(手配者以上)であっても、その現場に自身が配置されていなければ
      // 閲覧できない)。
      if (me.role === 'admin') return true;
      const sep = String(room.ref_key).indexOf('|');
      const date = String(room.ref_key).slice(0, sep), site = String(room.ref_key).slice(sep + 1);
      const row = await env.DB.prepare("SELECT 1 FROM schedule WHERE user_id=? AND date=? AND site=? AND type='work'").bind(me.id, date, site).first();
      return !!row;
    }
    return false;
  }
  // ルームが無ければ作成し、既存ならそれを返す(type,ref_keyの複合UNIQUEにより二重作成しない)
  async function getOrCreateChatRoom(env, type, refKey, name) {
    let room = await env.DB.prepare('SELECT * FROM chat_rooms WHERE type=? AND ref_key=?').bind(type, refKey).first();
    if (!room) {
      await env.DB.prepare('INSERT INTO chat_rooms(type,ref_key,name,created) VALUES(?,?,?,?) ON CONFLICT(type,ref_key) DO NOTHING')
        .bind(type, refKey, name, jstTs()).run();
      room = await env.DB.prepare('SELECT * FROM chat_rooms WHERE type=? AND ref_key=?').bind(type, refKey).first();
    }
    return room;
  }
  // 本人が所属する「手配チーム」ルームの仕様一覧(通常1件。自身が手配グループを持つ場合は
  // 自分が管理するチームも加わり2件になりうる)
  async function myTeamRoomSpecs(env, me) {
    const specs: any[] = [];
    if (me.manager_id) {
      const mgr = await env.DB.prepare('SELECT name FROM users WHERE id=?').bind(me.manager_id).first();
      specs.push({ type: 'manager', refKey: String(me.manager_id), name: `${mgr ? mgr.name : ''}手配チーム` });
    } else {
      const ka = me.ka || '未設定';
      specs.push({ type: 'manager', refKey: 'ka:' + ka, name: `チーフ手配(${ka})チーム` });
    }
    if (me.is_manager) {
      const mine = String(me.id);
      if (!specs.some(s => s.refKey === mine)) specs.push({ type: 'manager', refKey: mine, name: `${me.name}手配チーム` });
    }
    return specs;
  }
  // DMルームのref_keyから、閲覧者本人から見た相手の表示名を解決する
  async function chatDmPeerName(env, me, refKey) {
    const [a, b] = String(refKey).split('-').map(Number);
    const otherId = a === me.id ? b : a;
    const other = await env.DB.prepare('SELECT name FROM users WHERE id=?').bind(otherId).first();
    return other ? other.name : '(退会済みユーザー)';
  }

  // 個人チャット(dm)の相手を選ぶための検索。/usersはmembers_view権限が必要だが、
  // チャットは全員が使う機能のため、氏名・登録番号のみを返す専用の軽量エンドポイントを設ける。
  if (method === 'GET' && path === '/chat/user-search') {
    const q = String(url.searchParams.get('q') || '').trim();
    if (!q) return J([]);
    const rows = (await env.DB.prepare(
      "SELECT id, name, regno FROM users WHERE suspended=0 AND id<>? AND (name LIKE ? OR regno LIKE ?) ORDER BY name LIMIT 20"
    ).bind(me.id, `%${q}%`, `%${q}%`).all()).results;
    return J(rows);
  }

  // 参加中ルーム一覧。ensure=1の時のみ「課チャット」「手配チーム」を未作成でも作成する
  // (ポーリングでの未読確認は既存ルームのSELECTのみに留め、都度のINSERT試行を避けるため)
  if (method === 'GET' && path === '/chat/rooms') {
    const ensure = url.searchParams.get('ensure') === '1';
    const roomRows: any[] = [];
    const allRoom = await env.DB.prepare("SELECT * FROM chat_rooms WHERE type='all'").first();
    if (allRoom) roomRows.push(allRoom);
    const kaKey = me.ka || '未設定';
    if (ensure) roomRows.push(await getOrCreateChatRoom(env, 'ka', kaKey, `${kaKey}チャット`));
    else { const r = await env.DB.prepare("SELECT * FROM chat_rooms WHERE type='ka' AND ref_key=?").bind(kaKey).first(); if (r) roomRows.push(r); }
    for (const s of await myTeamRoomSpecs(env, me)) {
      if (ensure) roomRows.push(await getOrCreateChatRoom(env, s.type, s.refKey, s.name));
      else { const r = await env.DB.prepare('SELECT * FROM chat_rooms WHERE type=? AND ref_key=?').bind(s.type, s.refKey).first(); if (r) roomRows.push(r); }
    }
    const dmRows = (await env.DB.prepare(
      "SELECT * FROM chat_rooms WHERE type='dm' AND (ref_key LIKE ? OR ref_key LIKE ?)"
    ).bind(me.id + '-%', '%-' + me.id).all()).results;
    for (const r of dmRows as any[]) roomRows.push(r);

    const reads = (await env.DB.prepare('SELECT room_id, last_read_message_id FROM chat_reads WHERE user_id=?').bind(me.id).all()).results;
    const lastReadByRoom: Record<number, number> = {}; for (const r of reads as any[]) lastReadByRoom[r.room_id] = r.last_read_message_id;
    const out = [];
    for (const r of roomRows) {
      const lastRead = lastReadByRoom[r.id] || 0;
      const unread = (await env.DB.prepare(
        'SELECT COUNT(*) AS c FROM chat_messages WHERE room_id=? AND id>? AND sender_id<>?'
      ).bind(r.id, lastRead, me.id).first()).c;
      const name = r.type === 'dm' ? await chatDmPeerName(env, me, r.ref_key) : r.name;
      out.push({ id: r.id, type: r.type, name, unread });
    }
    return J(out);
  }
  // 現場ごと('site')・個人('dm')のルームは、一覧には出さずこのエンドポイントで都度開く。
  // 現場は当日配置されている本人またはsite_manage権限者/管理者のみ、個人は相手を指定するだけで開ける。
  if (method === 'POST' && path === '/chat/rooms/open') {
    const type = String(body.type || '');
    if (type === 'site') {
      const date = String(body.date || '').trim();
      const site = String(body.site || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !site) return ERR('不正なリクエストです');
      const refKey = `${date}|${site}`;
      const authorized = me.role === 'admin'
        || !!(await env.DB.prepare("SELECT 1 FROM schedule WHERE user_id=? AND date=? AND site=? AND type='work'").bind(me.id, date, site).first());
      if (!authorized) return ERR('この現場のチャットには参加できません', 403);
      const room = await getOrCreateChatRoom(env, 'site', refKey, `${site}(${date})`);
      return J({ id: room.id, type: room.type, name: room.name });
    }
    if (type === 'dm') {
      const targetId = Number(body.userId);
      if (!targetId || targetId === me.id) return ERR('不正なリクエストです');
      const target = await env.DB.prepare('SELECT id, name FROM users WHERE id=?').bind(targetId).first();
      if (!target) return ERR('ユーザーが見つかりません', 404);
      const [a, b] = [me.id, targetId].sort((x, y) => x - y);
      const room = await getOrCreateChatRoom(env, 'dm', `${a}-${b}`, '');
      return J({ id: room.id, type: room.type, name: target.name });
    }
    return ERR('不正なリクエストです');
  }
  // 現場チャットの招待URL/QR用トークンを発行(既に無ければ)。作成できるのはチーフ以上、かつ
  // 元々その現場チャットを見られる人(=配置されている本人または管理者)に限る。
  if (method === 'POST' && path === '/chat/rooms/guest-link') {
    const roomId = Number(body.room_id);
    if (!roomId) return ERR('不正なリクエストです');
    const room = await env.DB.prepare('SELECT * FROM chat_rooms WHERE id=?').bind(roomId).first();
    if (!room || room.type !== 'site') return ERR('この操作はできません');
    if (lv(me) < 1 || !(await chatRoomAuthorized(env, me, room))) return ERR('権限がありません', 403);
    let token = room.guest_token;
    if (!token) {
      token = rndShort();
      await env.DB.prepare('UPDATE chat_rooms SET guest_token=? WHERE id=?').bind(token, roomId).run();
    }
    return J({ token, url: `${url.origin}/#/g/${token}` });
  }
  // ルーム1件の情報取得(直接のURL遷移・再読み込み時に、名前・種別を都度取得するため)
  if (method === 'GET' && path === '/chat/room') {
    const roomId = Number(url.searchParams.get('id'));
    if (!roomId) return ERR('不正なリクエストです');
    const room = await env.DB.prepare('SELECT * FROM chat_rooms WHERE id=?').bind(roomId).first();
    if (!room || !(await chatRoomAuthorized(env, me, room))) return ERR('ページが見つかりません', 404);
    const name = room.type === 'dm' ? await chatDmPeerName(env, me, room.ref_key) : room.name;
    return J({ id: room.id, type: room.type, name });
  }
  if (method === 'GET' && path === '/chat/messages') {
    const roomId = Number(url.searchParams.get('room_id'));
    if (!roomId) return ERR('不正なリクエストです');
    const room = await env.DB.prepare('SELECT * FROM chat_rooms WHERE id=?').bind(roomId).first();
    if (!room || !(await chatRoomAuthorized(env, me, room))) return ERR('ページが見つかりません', 404);
    const afterId = Number(url.searchParams.get('after_id')) || 0;
    let rows;
    if (afterId) {
      rows = (await env.DB.prepare('SELECT * FROM chat_messages WHERE room_id=? AND id>? ORDER BY id ASC LIMIT 200').bind(roomId, afterId).all()).results;
    } else {
      const desc = (await env.DB.prepare('SELECT * FROM chat_messages WHERE room_id=? ORDER BY id DESC LIMIT 50').bind(roomId).all()).results;
      rows = (desc as any[]).slice().reverse();
    }
    return J((rows as any[]).map(r => ({ id: r.id, senderId: r.sender_id, senderName: r.sender_name, body: r.body, ts: r.ts, isGuest: r.guest_id !== null, mine: r.sender_id === me.id })));
  }
  if (method === 'POST' && path === '/chat/messages') {
    const roomId = Number(body.room_id);
    const text = String(body.body || '').trim().slice(0, 2000);
    if (!roomId || !text) return ERR('メッセージを入力してください');
    const room = await env.DB.prepare('SELECT * FROM chat_rooms WHERE id=?').bind(roomId).first();
    if (!room || !(await chatRoomAuthorized(env, me, room))) return ERR('ページが見つかりません', 404);
    const ins = await env.DB.prepare('INSERT INTO chat_messages(room_id,sender_id,sender_name,body,ts) VALUES(?,?,?,?,?)')
      .bind(roomId, me.id, me.name, text, jstTs()).run();
    return J({ ok: 1, id: ins.meta && ins.meta.last_row_id });
  }
  if (method === 'POST' && path === '/chat/read') {
    const roomId = Number(body.room_id);
    const lastId = Number(body.last_read_message_id) || 0;
    if (!roomId) return ERR('不正なリクエストです');
    const room = await env.DB.prepare('SELECT * FROM chat_rooms WHERE id=?').bind(roomId).first();
    if (!room || !(await chatRoomAuthorized(env, me, room))) return ERR('ページが見つかりません', 404);
    await env.DB.prepare(
      `INSERT INTO chat_reads(room_id,user_id,last_read_message_id) VALUES(?,?,?)
       ON CONFLICT(room_id,user_id) DO UPDATE SET last_read_message_id=MAX(last_read_message_id,excluded.last_read_message_id)`
    ).bind(roomId, me.id, lastId).run();
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
// opt.progressKey: 指定した場合、1件処理し終えるたびに「そのキー名の」設定へ残りURLを保存する
//   (cron実行中の途中終了への耐性のため)。過去に import_urls(保存済みURL設定そのもの)へ
//   直接書き戻していたことがあり、完了後に元へ戻す処理が無かったため、実行するたびに
//   保存済みURLリストが空になって以後の自動取込が止まる不具合があった(2026年8月修正)。
//   進捗は必ず import_urls とは別のキーに保存し、完了時はそのキーを削除すること。
// opt.checkAbsent: true の場合のみ、対象ファイルに登場しない人を休暇化する。一部のURLだけを
//   対象にした手動実行では、他の未選択ファイルに載っている人まで誤って休暇にしてしまうため、
//   「保存済み全URL」を対象にした場合のみ true にすること。
// opt.sourceLabel: daicho_archive に残す取込元ラベル。
async function runDaichoReload(env, urls, opt: any = {}) {
  const sourceLabel = opt.sourceLabel || '台帳再取り込み';
  if (!urls.length) return { okCount: 0, ngCount: 0, totalApplied: 0, results: [], absentResult: { clearedPeople: 0, clearedDays: 0 }, incomplete: false };

  // この起動全体で使ってよい時間の目安(保険的な安全策。専用cronトリガーに分離した後は
  // 他のcron処理を巻き込む心配は無いが、URL件数が多い日でも1回の起動が際限なく
  // 長引かないようにする)。超過した場合は残りのURLを処理せず、incomplete=trueを返す。
  // 呼び出し元(cronDaichoReload)はincompleteの場合、当日分の「実行済み」フラグを立てない。
  const invocationStart = Date.now();
  const OVERALL_BUDGET_MS = 120000;
  let incomplete = false;

  const adminUser = await env.DB.prepare("SELECT id, name FROM users WHERE role='admin' LIMIT 1").first();
  const editorId = adminUser ? adminUser.id : 0;
  const editorName = adminUser ? adminUser.name : '自動';
  const results = [];
  const allRowsCombined = []; // 対象URL(全ファイル)を横断して集める。不在者判定はこれを使って最後にまとめて行う。
  const keywordMap = await loadNonSiteKeywords(env);

  // 処理中に残っているURL一覧。1件処理し終えるたびに、ここから取り除いて都度保存する。
  // (今回渡された urls パラメータそのものが処理対象の全件なので、これをコピーして使う。
  //  import_urls (保存済みURL設定)は絶対に参照・書き換えしない)
  let remainingUrls = opt.progressKey ? [...urls] : null;

  for (const rawUrl of urls) {
    if (Date.now() - invocationStart > OVERALL_BUDGET_MS) {
      console.log(`[runDaichoReload] time budget (${OVERALL_BUDGET_MS}ms) exceeded, deferring remaining URLs to next run`);
      incomplete = true;
      break;
    }
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
            ).bind(ts, editorId, editorName + (opt.progressKey ? '(自動)' : '(手動)'), rawUrl, meta.id, r2key, fname, got.raw.length, r.applied, sheetReport.length).run();

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
    if (opt.progressKey) {
      remainingUrls = remainingUrls.filter(u => u !== rawUrl);
      try {
        await env.DB.prepare("REPLACE INTO settings(key,value) VALUES(?,?)")
          .bind(opt.progressKey, JSON.stringify({ date: jstDate(), remaining: remainingUrls })).run();
      } catch (e) {}
    }
  }

  // 全件処理し終えた(incompleteでない)場合は、進捗を消して次回はまっさらな状態から始める。
  if (opt.progressKey && !incomplete) {
    try { await env.DB.prepare('DELETE FROM settings WHERE key=?').bind(opt.progressKey).run(); } catch (e) {}
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
    // incomplete(時間予算切れで一部URL未処理)の場合、allRowsCombinedは対象ファイルの一部でしか
    // ないため、不在者判定は行わない(未処理ファイルに載っている人まで誤って休暇化してしまうため)。
    // 残りのURLは次回の起動で処理され、その時点で全ファイル分が揃ってから不在者判定される。
    if (opt.checkAbsent && !incomplete) {
      try { absentResult = await clearAbsentFromDaicho(env, allRowsCombined, editorId); }
      catch (e) { console.error('clearAbsentFromDaicho failed:', e); }
      try { registryResult = await clearAbsentSiteRegistry(env, allRowsCombined); }
      catch (e) { console.error('clearAbsentSiteRegistry failed:', e); }
    }
    try { await matchRookieAndBlacklist(env, allRowsCombined); }
    catch (e) { console.error('matchRookieAndBlacklist failed:', e); }
  }

  return { okCount, ngCount, totalApplied, results, absentResult, registryResult, editorId, incomplete, remainingUrls };
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

  // 前回の起動が時間予算切れで未完了(incomplete)だった場合、その続きから再開する。
  // 進捗は import_urls とは別の import_urls_progress に保持しており、当日分の記録だけを使う
  // (import_urls 自体は保存済みURL設定そのものなので、絶対に書き換えない)。
  let resumeUrls = urls;
  try {
    const progress = JSON.parse(await getSetting(env, 'import_urls_progress', 'null') || 'null');
    if (progress && progress.date === today && Array.isArray(progress.remaining) && progress.remaining.length) {
      resumeUrls = progress.remaining.filter(u => urls.includes(u));
      if (!resumeUrls.length) resumeUrls = urls;
    }
  } catch (e) {}

  const r = await runDaichoReload(env, resumeUrls, { progressKey: 'import_urls_progress', checkAbsent: true, sourceLabel: '台帳自動再取り込み' });

  // 時間予算切れで一部URLが未処理(incomplete)の場合、「本日実行済み」フラグは立てない。
  // import_urls_progressには処理済み分を除いた残りが保存されているため、次回の起動では
  // 残りのURLだけを対象に自動的に再開される(import_urls自体は無傷のまま)。
  if (r.incomplete) {
    console.log('[cronDaichoReload] incomplete this run, will resume remaining URLs on next invocation');
    return;
  }

  // 全URLの取込を終えてからフラグを立てる(途中で予期せぬ例外が起きても、その日のうちに再試行できるようにするため)
  await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('daicho_reload_last_run',?)").bind(today).run();

  // 保存済みURLは、その日の深夜取り込み(確定版の上書き)を終えたら使い捨てで削除する
  // (1URL=1日分のデータという運用のため。「毎日自動で」は、翌日以降は新しいURLを
  // 保存し直すことで続けられる、という前提)。ここに到達した時点でincomplete=falseが
  // 確定しているため、削除しても「時間切れで一部だけ処理した回に消してしまう」事故は起きない。
  try { await removeImportUrls(env, urls); } catch (e) { console.error('[cronDaichoReload] failed to remove processed import_urls:', e); }

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
    // 停止中のアカウントも対象に含める。停止はアプリへのログインを止めるための措置であり、
    // ランクの進行のような内部的な処理まで止めるものではない(復帰時に手動で直す手間をなくす)。
    "SELECT id, rank, promotion_pending_rank FROM users WHERE promotion_pending_date IS NOT NULL AND promotion_pending_date <= ?"
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

// 「行った会場/公演」ランキング(全員が閲覧可能、GET /member-venues・/member-artists)の
// 「対象の会場/公演を経験した全員の回数一覧」、および会場一覧・公演一覧(GET /venues・/artists、
// チーフ以上)は、いずれも以前は毎リクエストごとにschedule全件を集計し直しており、
// 「行った会場/公演」が全メンバーに公開された直後(2026年8月)にD1の1日あたり行読み取り
// 無料枠を使い切る事故が本番で実際に発生した。1時間おきに全員分をまとめて計算し直し、
// settingsにJSONでキャッシュしておく方式に変更した(自分自身の回数・一覧は各リクエストで
// 引き続きライブ計算するため、自分の最新の実績は即座に反映される。他人との順位比較・
// 会場/公演一覧全体だけが最大1時間程度遅れる)。GET /artist-history・/artist-membersが
// 公演名の表記ゆれ一覧を求めるために都度行っていたSELECT DISTINCT siteも、ここで一緒に
// 事前計算しキャッシュする(site_variants_cache: 公演名→現場名表記ゆれ一覧)。
async function cronRankCache(env) {
  const venueUserRows = (await env.DB.prepare(
    "SELECT venue, user_id, COUNT(*) AS cnt FROM schedule WHERE type='work' AND venue<>'' GROUP BY venue, user_id"
  ).all()).results;
  const byVenueUsers = {};
  for (const r of venueUserRows) (byVenueUsers[r.venue] ||= []).push(r.cnt);

  const venueRows = (await env.DB.prepare(
    "SELECT venue, COUNT(*) AS cnt, COUNT(DISTINCT date) AS dateCnt, MIN(date) AS firstDate, MAX(date) AS lastDate FROM schedule WHERE type='work' AND venue<>'' GROUP BY venue ORDER BY venue"
  ).all()).results;

  const siteDateUserRows = (await env.DB.prepare(
    "SELECT user_id, site, date, COUNT(*) AS cnt FROM schedule WHERE type='work' AND site<>'' GROUP BY user_id, site, date"
  ).all()).results;
  const byArtistUserTotals = {};
  const bySiteDate = {}; // key: "site|date" -> {site,date,cnt}(全ユーザー合算)
  const siteVariantSets = {}; // artist -> Set(site表記ゆれ)
  for (const r of siteDateUserRows) {
    const artist = extractArtistName(r.site);
    const userBucket = byArtistUserTotals[artist] ||= {};
    userBucket[r.user_id] = (userBucket[r.user_id] || 0) + r.cnt;
    const key = r.site + '|' + r.date;
    (bySiteDate[key] ||= { site: r.site, date: r.date, cnt: 0 }).cnt += r.cnt;
    (siteVariantSets[artist] ||= new Set()).add(r.site);
  }
  const byArtistUsers = {};
  for (const artist of Object.keys(byArtistUserTotals)) byArtistUsers[artist] = Object.values(byArtistUserTotals[artist]);

  const byArtist: Record<string, any> = {};
  for (const r of Object.values(bySiteDate) as any[]) {
    const artist = extractArtistName(r.site);
    (byArtist[artist] ||= { artist, cnt: 0, dates: new Set() });
    byArtist[artist].cnt += r.cnt;
    byArtist[artist].dates.add(r.date);
  }
  const artistRows = (Object.values(byArtist) as any[]).map(a => {
    const sorted = [...a.dates].sort();
    return { artist: a.artist, cnt: a.cnt, dateCnt: a.dates.size, firstDate: sorted[0], lastDate: sorted[sorted.length - 1] };
  }).sort((x, y) => x.artist.localeCompare(y.artist, 'ja'));

  const siteVariants = {};
  for (const artist of Object.keys(siteVariantSets)) siteVariants[artist] = [...siteVariantSets[artist]];

  await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('venue_rank_cache',?)").bind(JSON.stringify(byVenueUsers)).run();
  await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('artist_rank_cache',?)").bind(JSON.stringify(byArtistUsers)).run();
  await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('venues_cache',?)").bind(JSON.stringify(venueRows)).run();
  await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('artists_cache',?)").bind(JSON.stringify(artistRows)).run();
  await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('site_variants_cache',?)").bind(JSON.stringify(siteVariants)).run();
  await env.DB.prepare("REPLACE INTO settings(key,value) VALUES('rank_cache_last_run',?)").bind(jstDate()).run();
  console.log('[cronRankCache] venues', venueRows.length, 'artists', artistRows.length);
}

async function cronNotify(env, opt: any = {}) {
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
  const invocationStart = Date.now();
  // この起動全体で使ってよい時間の目安(ソースごとの28秒タイムアウトとは別に、
  // 全ソース合計でも上限を設ける安全策)。専用cronトリガーに分離したことで他の
  // cron処理を巻き込む心配は無くなったが、ソース数が今後増えた場合の保険として残す。
  // 超過した場合、残りのソースはlast_runが更新されないため、次回の起動で処理される。
  const OVERALL_BUDGET_MS = 90000;
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
    if (Date.now() - invocationStart > OVERALL_BUDGET_MS) {
      console.log(`[cronScheduleSources] time budget (${OVERALL_BUDGET_MS}ms) exceeded, deferring remaining sources to next run`);
      break;
    }
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
      const r: any = await Promise.race([
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
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(req.url);
    const withSecurityHeaders = (resp: Response) => {
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
  // 4つのcron処理は、それぞれ専用のcronスケジュール(wrangler.toml参照)を持ち、
  // 別々の起動(=別々のCPU時間・実行時間の予算)で実行される。以前は1本のcronの中で
  // 順番に全部実行していたが、台帳・予定表の取込が重くなった際に1回の起動に処理が
  // 集中し、Cloudflare側の自動リトライで数十分後にようやく完了する遅延が本番で
  // 実際に発生したため、この構成に変更した(2026年8月)。
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const startTs = jstTs();
    console.log(`[scheduled] cron=${event.cron} start at ${startTs}`);
    try {
      if (event.cron === '0 * * * *') await cronDaichoReload(env);
      else if (event.cron === '5 * * * *') await cronScheduleSources(env);
      else if (event.cron === '10 * * * *') await cronRankPromotion(env);
      else if (event.cron === '15 * * * *') await cronNotify(env);
      else if (event.cron === '20 * * * *') await cronRankCache(env);
    } catch (e) { console.error(`[scheduled] cron=${event.cron} failed:`, e); }
    console.log(`[scheduled] end (cron=${event.cron}, started at ${startTs})`);
  }
};
