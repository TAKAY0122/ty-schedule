/**
 * 【RB事業2課】新人報告・ブラックリスト 自動転記用スクリプト
 *
 * 使い方:
 * 1. 下の REPORT_SHEET_ID / BLACKLIST_SHEET_ID を、実際のスプレッドシートIDに書き換える
 *    (スプレッドシートのURL中の /d/ と /edit の間の文字列)
 * 2. Google Apps Script のプロジェクトを新規作成し、このファイルの内容を貼り付ける
 *    (どちらか一方のスプレッドシートの「拡張機能」→「Apps Script」から作成すればOK。
 *     スクリプト自体はスプレッドシートIDを指定して両方に書き込むので、URLを1つだけ発行すれば足りる)
 * 3. 「デプロイ」→「新しいデプロイ」→種類「ウェブアプリ」を選択
 *    - 実行するユーザー:自分
 *    - アクセスできるユーザー:全員
 *    でデプロイし、発行された「ウェブアプリのURL」をコピーする
 * 4. アプリの「システム設定」→「スプレッドシート連携」に、そのURLを貼り付けて保存する
 *    (新人報告・ブラックリストどちらも、同じこのURLを設定すればOK。type で自動的に振り分けられる)
 *
 * 注意:
 * - 新人報告シート側の列C(記入者所属手配)・D(ステータス:未獲得/1課獲得/2課獲得)・F(ドラフト担当)・
 *   I(現場回数)・J(現状手配社員)・K(発見現場・会場)・L(チームの説明)は、アプリ側にデータが無いため
 *   空欄で追記されます。これらは今まで通り手動で追記してください。
 * - 1次報告の提出時と、2次チェック完了時それぞれで、別々の行として追記されます
 *   (既存の運用と同じく、同じ人物が複数行に分かれて記録される形です)。
 */

const REPORT_SHEET_ID = '1TLHCtNOY0SMSvnIBnP8_GRVBYZJo-wsZBXao9MKWIKQ';       // 例: 1TLHCtNOY0SMSvnIBnP8_GRVBYZJo-wsZBXao9MKWIKQ
const REPORT_SHEET_NAME = '新人報告';                                // 追記先のタブ名(必要に応じて変更)
const BLACKLIST_SHEET_ID = '18msUtthaWs0H3h31BmZF5MwBC4E4craHJE21iZhmN-M'; // 例: 18msUtthaWs0H3h31BmZF5MwBC4E4craHJE21iZhmN-M

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    if (data.type === 'report') appendReport(data);
    else if (data.type === 'blacklist') appendBlacklist(data);
    return ContentService.createTextOutput(JSON.stringify({ ok: 1 })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: 0, error: String(err) })).setMimeType(ContentService.MimeType.JSON);
  }
}

function appendReport(data) {
  const ss = SpreadsheetApp.openById(REPORT_SHEET_ID);
  const sheet = ss.getSheetByName(REPORT_SHEET_NAME) || ss.getSheets()[0];
  // A:タイムスタンプ B:記入者名 C:記入者所属手配 D:ステータス E:提出確認 F:ドラフト担当
  // G:獲得候補者名 H:学年 I:現場回数 J:現状手配社員 K:発見現場・会場 L:チームの説明
  // M:今後の現場予定 N:連絡したチーフ O:良かった点・悪かった点 P:やる気・表情
  // Q,R,S:(未使用) T:総合点 U:ドラフト承認 V:今後の育成計画 W:チーフチェック者
  sheet.appendRow([
    data.ts || '', data.reporterName || '', '', '', data.stage || '', '',
    data.candidateName || '', data.grade || '', '', '', '', '',
    data.nextSite || '', data.firstChief || '', data.firstNote || '',
    (data.motivation != null ? data.motivation : '') + (data.response != null ? ('/' + data.response) : ''),
    '', '', '',
    data.total != null ? data.total : '', data.draft || '', data.plan || '', data.checker || '',
  ]);
}

function appendBlacklist(data) {
  const ss = SpreadsheetApp.openById(BLACKLIST_SHEET_ID);
  const sheet = ss.getSheets()[0];
  // A:日付 B:報告者 C:名前 D:①会話 E:②服装 F:③身なり G:④遅刻 H:⑤業務 I:理由
  sheet.appendRow([
    data.date || '', data.reporter || '', data.name || '',
    data.talkMark || '', data.dressMark || '', data.groomMark || '', data.lateMark || '', data.workMark || '',
    data.reason || '',
  ]);
}
