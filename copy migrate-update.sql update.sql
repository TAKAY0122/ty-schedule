-- ===== 今回のアップデート用マイグレーション =====
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-update.sql
-- ※ "Ok to proceed?" には yes と答えてください

-- ① 台帳保管(元Excelの保管インデックス)
CREATE TABLE IF NOT EXISTS daicho_archive(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  importer_id INTEGER,
  importer_name TEXT,
  source_url TEXT,
  file_id TEXT,
  r2_key TEXT NOT NULL,
  file_name TEXT,
  size INTEGER,
  applied INTEGER,
  sheets INTEGER
);

-- ② 初回ログイン時の強制パスワード変更フラグ
ALTER TABLE users ADD COLUMN must_change INTEGER DEFAULT 0;
