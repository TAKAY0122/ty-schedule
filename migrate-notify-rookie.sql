-- 新人報告リマインドの個人設定カラムを追加
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-notify-rookie.sql
ALTER TABLE users ADD COLUMN notify_rookie INTEGER DEFAULT NULL;
