-- 個別に権限を「剥奪」できるようにするカラムを追加
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-revoked-perms.sql

ALTER TABLE users ADD COLUMN revoked_perms TEXT DEFAULT '[]';
