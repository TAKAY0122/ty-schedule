-- 業務名 → 料金区分の対応表を追加(管理画面から編集可能にする)
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-duty-map.sql

CREATE TABLE IF NOT EXISTS duty_map(
  duty TEXT PRIMARY KEY,
  seg TEXT NOT NULL
);

INSERT OR IGNORE INTO duty_map(duty,seg) VALUES
 ('案内','g5'),('受付・案内','g5'),('準備','g5'),('本部付','g5'),('制作補助','g5'),('運営補助','g5'),('雑務','g5'),
 ('準備・設営','l3'),('搬入','l3'),('搬出','l3'),('機材搬入','l3'),('機材搬出','l3'),('ステージハンド','l3'),
 ('搬入・案内','lg'),('案内・搬出','gl'),('パッケージ','lgl'),
 ('ケータリング','skip'),('物品販売','skip');
