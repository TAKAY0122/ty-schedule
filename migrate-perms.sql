-- 個別追加権限(extra_perms)カラムを追加
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-perms.sql
ALTER TABLE users ADD COLUMN extra_perms TEXT DEFAULT '[]';
