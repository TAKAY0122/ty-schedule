-- チーフによるメンバー指名機能を追加
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-nominations.sql

CREATE TABLE IF NOT EXISTS site_nominations(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nominator_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  site TEXT NOT NULL,
  venue TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  created_at TEXT,
  decided_at TEXT,
  decided_by INTEGER
);
