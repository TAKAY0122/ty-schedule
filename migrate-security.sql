-- セキュリティ強化: ログイン試行回数制限を追加
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-security.sql

CREATE TABLE IF NOT EXISTS login_attempts(
  regno TEXT PRIMARY KEY,
  fail_count INTEGER DEFAULT 0,
  locked_until INTEGER DEFAULT 0,
  last_attempt INTEGER DEFAULT 0
);
