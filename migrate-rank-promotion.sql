-- ランク自動昇格・査定機能(v2.2)のためのマイグレーション
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-rank-promotion.sql
--
-- 【前提】以下は migrate-rank-system.sql で適用済みのため、ここでは追加しません。
--   users: grade / base / manner_done / team2_done / su_done / promotion_pending_date / graduate_flag
--   rank_history テーブル
-- 本ファイルで追加するのは promotion_pending_rank の1列のみです。

-- 昇格予約時に、切り替える先のランク(D または C)を保持する列
ALTER TABLE users ADD COLUMN promotion_pending_rank TEXT DEFAULT NULL;

-- 万一 rank_history が未作成の環境向け(作成済みなら何も起きません)
CREATE TABLE IF NOT EXISTS rank_history(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  before_rank TEXT DEFAULT '',
  after_rank TEXT NOT NULL,
  reason TEXT NOT NULL,
  changed_by INTEGER,
  ts TEXT
);
CREATE INDEX IF NOT EXISTS idx_rank_history_user ON rank_history(user_id);
