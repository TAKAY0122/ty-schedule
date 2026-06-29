-- 既存DBに給与計算カラム/テーブルを追加するマイグレーション
-- 適用: npx wrangler d1 execute <DB名> --file=migrate-wage.sql --remote
-- (本番DBに1回だけ実行。schema.sqlを新規適用する場合は不要)

ALTER TABLE schedule ADD COLUMN duty TEXT DEFAULT '';
ALTER TABLE schedule ADD COLUMN load_end TEXT DEFAULT '';
ALTER TABLE schedule ADD COLUMN show_end TEXT DEFAULT '';
ALTER TABLE schedule ADD COLUMN multi INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS wage_rates(
  effective_from TEXT NOT NULL,
  rank TEXT NOT NULL,
  kind TEXT NOT NULL,
  amount INTEGER NOT NULL,
  PRIMARY KEY(effective_from, rank, kind)
);
INSERT OR IGNORE INTO wage_rates(effective_from,rank,kind,amount) VALUES
 ('1900-01-01','A','guide',1160),('1900-01-01','A','load',1260),
 ('1900-01-01','B','guide',1150),('1900-01-01','B','load',1250),
 ('1900-01-01','C','guide',1140),('1900-01-01','C','load',1240),
 ('1900-01-01','D','guide',1130),('1900-01-01','D','load',1230),
 ('1900-01-01','E','guide',1120),('1900-01-01','E','load',1120),
 ('2025-10-01','A','guide',1220),('2025-10-01','A','load',1320),
 ('2025-10-01','B','guide',1210),('2025-10-01','B','load',1310),
 ('2025-10-01','C','guide',1200),('2025-10-01','C','load',1300),
 ('2025-10-01','D','guide',1190),('2025-10-01','D','load',1290),
 ('2025-10-01','E','guide',1180),('2025-10-01','E','load',1280);
