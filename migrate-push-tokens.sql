-- プッシュ通知用デバイストークンの管理テーブルを追加
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-push-tokens.sql

CREATE TABLE IF NOT EXISTS push_tokens(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL,
  platform TEXT NOT NULL,
  created_at TEXT,
  UNIQUE(user_id, token)
);
