-- 新人報告リマインドの自動送信が「今日は既に実行済み」と誤って記録されている可能性があるため、
-- リセットする。これにより、今日以降、正しいタイミングで再度送信されるようになる。
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-reset-notify.sql

DELETE FROM settings WHERE key = 'notify_last_run';
