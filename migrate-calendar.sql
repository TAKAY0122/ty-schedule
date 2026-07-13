-- Googleカレンダー等への購読フィード連携機能を追加
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-calendar.sql

ALTER TABLE users ADD COLUMN calendar_token TEXT DEFAULT NULL;
