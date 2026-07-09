-- 台帳・予定表取り込み時の「非現場キーワード」管理テーブルを追加
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-non-site-keywords.sql

CREATE TABLE IF NOT EXISTS non_site_keywords(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);
INSERT OR IGNORE INTO non_site_keywords(keyword, type, sort_order) VALUES
 ('×','x',1), ('✕','x',2), ('x','x',3), ('X','x',4),
 ('休暇','off',10),
 ('1日OK','ok',20), ('○','ok',21), ('〇','ok',22),
 ('未定','ignore',30), ('手配','ignore',31);
