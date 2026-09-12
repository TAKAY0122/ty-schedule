-- 現場情報モーダルに「配置表」タブを追加。1行=1人、1列=1時間帯のクロス表(参考: 現場配置表
-- スプレッドシート)。列(時間帯)は現場ごとに自由に追加・削除・改名できる。
-- 氏名はusers登録の有無に関わらずname(表示名)を正とする(台帳には登録番号が「3」始まりでない
-- 他拠点・外部委託スタッフも載っているため)。uidは実際にアプリ登録メンバーと一致する場合のみ設定。
-- guest_tokenは現場チャットのゲスト招待と同じ、当日限定の閲覧専用共有URL/QR用。
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-haichi-hyo.sql
CREATE TABLE IF NOT EXISTS haichi_columns(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  site TEXT NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_haichi_columns_site ON haichi_columns(date, site);

CREATE TABLE IF NOT EXISTS haichi_rows(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  site TEXT NOT NULL,
  seq INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL DEFAULT '',
  uid INTEGER,
  wireless INTEGER NOT NULL DEFAULT 0,
  meal INTEGER NOT NULL DEFAULT 0,
  job1st TEXT DEFAULT '',
  note TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_haichi_rows_site ON haichi_rows(date, site);

CREATE TABLE IF NOT EXISTS haichi_cells(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  row_id INTEGER NOT NULL,
  column_id INTEGER NOT NULL,
  content TEXT DEFAULT '',
  tag TEXT,
  UNIQUE(row_id, column_id)
);
CREATE INDEX IF NOT EXISTS idx_haichi_cells_row ON haichi_cells(row_id);

CREATE TABLE IF NOT EXISTS haichi_meta(
  date TEXT NOT NULL,
  site TEXT NOT NULL,
  updated_by INTEGER,
  updated_at TEXT,
  guest_token TEXT,
  guest_can_edit INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(date, site)
);
CREATE INDEX IF NOT EXISTS idx_haichi_meta_guest_token ON haichi_meta(guest_token);

-- 動作確認が済むまで一般公開しない(未設定時の既定は「公開中」のため明示的に登録する)。
INSERT OR IGNORE INTO settings(key,value) VALUES('feature_status_haichi-hyo','hidden');
