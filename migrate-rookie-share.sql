-- 新人報告/ブラックリストの「獲得課」記録、台帳連携による現場共有機能を追加
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-rookie-share.sql

ALTER TABLE reports ADD COLUMN acquired_ka TEXT DEFAULT '';
ALTER TABLE blacklist ADD COLUMN matched_ka TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS rookie_site_matches(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  matched_name TEXT NOT NULL,
  report_id INTEGER,
  blacklist_id INTEGER,
  date TEXT NOT NULL,
  site TEXT NOT NULL,
  venue TEXT DEFAULT '',
  created_at TEXT,
  UNIQUE(kind, matched_name, date, site)
);
