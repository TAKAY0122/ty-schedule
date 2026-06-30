-- 予定表自動取り込み用の人単位スナップショットテーブルを追加
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-snapshot.sql
CREATE TABLE IF NOT EXISTS import_snapshots(
  source TEXT NOT NULL,
  regno TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT,
  PRIMARY KEY(source, regno)
);
