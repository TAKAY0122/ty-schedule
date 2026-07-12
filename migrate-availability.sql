-- 本人によるスケジュール提出(休み希望・稼働可能時間)機能を追加
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-availability.sql

CREATE TABLE IF NOT EXISTS availability_requests(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  from_time TEXT DEFAULT '',
  to_time TEXT DEFAULT '',
  departure TEXT DEFAULT '',
  note TEXT DEFAULT '',
  updated_at TEXT,
  UNIQUE(user_id, date)
);
