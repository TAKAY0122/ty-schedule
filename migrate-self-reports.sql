-- 本人による現場変更報告(承認フロー)用テーブルを追加
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-self-reports.sql

CREATE TABLE IF NOT EXISTS self_reports(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  told_by TEXT NOT NULL,
  type TEXT NOT NULL,
  site TEXT DEFAULT '',
  venue TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  created_at TEXT,
  decided_at TEXT,
  decided_by INTEGER
);
