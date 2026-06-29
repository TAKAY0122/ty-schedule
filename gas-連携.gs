/**
 * RB事業2課 スケジュール管理アプリ — スプレッドシート連携スクリプト(GAS)
 *
 * ■ これは何?
 *   Googleスプレッドシートに入力したスケジュールを、アプリ側に自動で取り込むためのスクリプトです。
 *   シートを編集して保存すると、その内容がアプリのスケジュールに反映されます。
 *
 * ■ 導入手順
 *   1. スケジュールを入力するGoogleスプレッドシートを開く
 *   2. 上部メニュー「拡張機能」→「Apps Script」を開く
 *   3. 既定のコードを消して、このファイルの中身を全部貼り付ける
 *   4. 下の CONFIG の APP_URL と IMPORT_TOKEN を自分の値に書き換える
 *      - APP_URL    : アプリのURL(例 https://ty-schedule.xxxx.workers.dev)
 *      - IMPORT_TOKEN: アプリの「アカウント管理 → スプレッドシート連携」に表示されるトークン
 *   5. 保存し、関数 `setup` を一度だけ実行(初回は権限の許可を求められるので承認)
 *      → これで「保存時に自動送信」と、メニュー「アプリ連携 → 今すぐ全部送信」が使えるようになります
 *
 * ■ シートの形式(1行目はヘッダー。2行目以降にデータ)
 *   A:登録番号  B:日付(2026-06-15 等)  C:種別(現場/休暇/有給/×)  D:現場名  E:会場  F:IN(10:15)  G:OUT(19:45)  H:給与(空欄なら自動計算)  I:備考
 *   ※ 種別は「現場・休暇・有給・×」の日本語、または work/off/paid/x のどちらでもOK
 *   ※ 登録番号と日付が空の行はスキップされます
 *   ※ シートが複数ある場合、SHEET_NAME で対象シートを指定できます(空なら全シート対象)
 */

const CONFIG = {
  APP_URL: 'https://ここにアプリのURLを貼り付け.workers.dev',
  IMPORT_TOKEN: 'ここにアプリで発行された取り込みトークンを貼り付け',
  SHEET_NAME: '', // 例: 'スケジュール' 。空なら全シートが対象
};

// 種別の日本語 → コード変換
function normType_(v) {
  const s = String(v || '').trim();
  if (['work', 'off', 'paid', 'x'].includes(s)) return s;
  if (s === '現場' || s === '出勤') return 'work';
  if (s === '休暇' || s === '休み' || s === 'お休み') return 'off';
  if (s === '有給' || s === '有給休暇') return 'paid';
  if (s === '×' || s === '✕' || s === 'x' || s === 'X') return 'x';
  return s ? 'work' : '';
}

// 日付を YYYY-MM-DD に整形
function normDate_(v) {
  if (v instanceof Date) {
    const y = v.getFullYear(), m = ('0' + (v.getMonth() + 1)).slice(-2), d = ('0' + v.getDate()).slice(-2);
    return `${y}-${m}-${d}`;
  }
  return String(v || '').trim();
}

// 時刻を HH:MM に整形(Dateで入っている場合に対応)
function normTime_(v) {
  if (v instanceof Date) {
    const hh = ('0' + v.getHours()).slice(-2), mm = ('0' + v.getMinutes()).slice(-2);
    return `${hh}:${mm}`;
  }
  return String(v || '').trim();
}

// 対象シートからデータ行を集める
function collectRows_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = CONFIG.SHEET_NAME ? [ss.getSheetByName(CONFIG.SHEET_NAME)] : ss.getSheets();
  const rows = [];
  for (const sh of sheets) {
    if (!sh) continue;
    const values = sh.getDataRange().getValues();
    for (let i = 1; i < values.length; i++) { // 0行目はヘッダー
      const r = values[i];
      const regno = String(r[0] || '').trim();
      const date = normDate_(r[1]);
      if (!regno || !date) continue;
      rows.push({
        regno: regno,
        date: date,
        type: normType_(r[2]),
        site: String(r[3] || '').trim(),
        venue: String(r[4] || '').trim(),
        tin: normTime_(r[5]),
        tout: normTime_(r[6]),
        pay: (r[7] === '' || r[7] == null) ? '' : r[7],
        note: String(r[8] || '').trim(),
      });
    }
  }
  return rows;
}

// アプリへ送信
function pushToApp_(rows) {
  if (!rows.length) return { applied: 0, skipped: 0, errors: [] };
  const res = UrlFetchApp.fetch(CONFIG.APP_URL.replace(/\/$/, '') + '/api/import-schedule', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ token: CONFIG.IMPORT_TOKEN, rows: rows }),
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  const text = res.getContentText();
  if (code !== 200) throw new Error('送信エラー(' + code + '): ' + text);
  return JSON.parse(text);
}

// メニューから「今すぐ全部送信」
function sendAll() {
  const rows = collectRows_();
  const result = pushToApp_(rows);
  SpreadsheetApp.getActiveSpreadsheet().toast(
    `送信完了:反映 ${result.applied} 件 / スキップ ${result.skipped} 件` +
    (result.errors && result.errors.length ? `\n注意: ${result.errors.join(' / ')}` : ''),
    'アプリ連携', 8
  );
}

// シート編集時に自動送信(onEditトリガーから呼ばれる)
function onEditPush(e) {
  try {
    const rows = collectRows_();
    pushToApp_(rows);
  } catch (err) {
    // 失敗してもシート操作は止めない。必要ならログを確認
    console.error(err);
  }
}

// 初回セットアップ:メニュー追加 + onEditトリガー登録
function setup() {
  // 既存の同名トリガーを掃除
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'onEditPush') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onEditPush')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onEdit()
    .create();
  onOpen();
  SpreadsheetApp.getActiveSpreadsheet().toast('セットアップ完了。これ以降、編集すると自動でアプリに反映されます。', 'アプリ連携', 6);
}

// メニュー追加(シートを開いたとき)
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('アプリ連携')
    .addItem('今すぐ全部送信', 'sendAll')
    .addToMenu();
}
