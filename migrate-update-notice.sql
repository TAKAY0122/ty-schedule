-- アップデートのお知らせ機能を追加
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-update-notice.sql

ALTER TABLE users ADD COLUMN seen_update_version INTEGER DEFAULT 0;
