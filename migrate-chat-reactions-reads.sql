-- チャットに既読(誰が読んだか)・絵文字リアクション(LINE風)を追加。
-- 既読自体は既存のchat_readsで足りており、新規テーブルはリアクション用のみ。
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-chat-reactions-reads.sql

CREATE TABLE IF NOT EXISTS chat_reactions(
  message_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  emoji TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY(message_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_reactions_message ON chat_reactions(message_id);
