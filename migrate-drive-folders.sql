-- 共有ドライブフォルダからの台帳スプレッドシート自動取込(深夜1時ポーリング)機能の追加
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-drive-folders.sql

CREATE TABLE IF NOT EXISTS drive_folders(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  label TEXT DEFAULT '',
  last_cursor_time TEXT DEFAULT '',
  created_at TEXT
);

-- 2026年10月、ユーザーより指定された3つの共有ドライブフォルダを初期登録。
-- last_cursor_timeは空のままにしておく(cronDrivePollの初回実行時に、既存ファイルを
-- 誤って一括取込しないよう、その時点の最新ファイルをベースラインとして記録するだけになる)。
INSERT INTO drive_folders(url, folder_id, label, last_cursor_time, created_at) VALUES
('https://drive.google.com/drive/folders/1pT1_aOX9dKma50Yww7tid4TLwjTLU-xh?usp=drive_link','1pT1_aOX9dKma50Yww7tid4TLwjTLU-xh','','',strftime('%Y-%m-%d %H:%M:%S','now','+9 hours')),
('https://drive.google.com/drive/folders/1e4VKwcYB-NUqtIdV4ZD0y0gaF02XWNmf?usp=drive_link','1e4VKwcYB-NUqtIdV4ZD0y0gaF02XWNmf','','',strftime('%Y-%m-%d %H:%M:%S','now','+9 hours')),
('https://drive.google.com/drive/folders/19OmDD_uSOwF97b693qh7NZJmPr2Z4bJO?usp=drive_link','19OmDD_uSOwF97b693qh7NZJmPr2Z4bJO','','',strftime('%Y-%m-%d %H:%M:%S','now','+9 hours'));

-- 台帳の深夜自動再取り込みの実行時刻を、深夜0時→朝7時に変更。
-- (新設の共有ドライブポーリング[深夜1時]が前日分の台帳URLを登録し終えた後、確定版として
-- 取り込むタイミングへずらすため。既存の設定値を上書きする)
REPLACE INTO settings(key,value) VALUES('daicho_reload_hour','7');
