-- 新人報告リマインドの個人設定用カラムが、実際のデータベースに追加されていなかったため、
-- 通知処理がSQLエラー(no such column: u.notify_rookie)で毎回失敗していた。これを追加する。
-- NULL=役割の基本ルールに従う(既定) / 1=常に対象 / 0=常に対象外
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-add-notify-rookie.sql

ALTER TABLE users ADD COLUMN notify_rookie INTEGER DEFAULT NULL;
