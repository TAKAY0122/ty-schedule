-- 予定表ソースに「担当手配者未設定(チーフ手配)の人を除外する」設定を追加
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-exclude-unmanaged-and-notes.sql

ALTER TABLE sched_sources ADD COLUMN exclude_unmanaged INTEGER DEFAULT 0;

-- メンバーごとの備考欄(自由記述、時系列で複数件積み重ねる)
CREATE TABLE IF NOT EXISTS member_notes(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_id INTEGER NOT NULL,
  author_id INTEGER,
  author_name TEXT DEFAULT '',
  content TEXT NOT NULL,
  ts TEXT
);
CREATE INDEX IF NOT EXISTS idx_member_notes_target ON member_notes(target_id);
