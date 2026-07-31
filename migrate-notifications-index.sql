-- notificationsテーブルは user_id での絞り込み(通知ベルのポーリング、notify()の重複送信防止チェック)が
-- 最も頻繁に行われるが、インデックスが無かったため追加する。
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-notifications-index.sql

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
