-- 今回の一括アップデート用マイグレーション
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-bigupdate.sql

-- 通知クリック時の遷移先
ALTER TABLE notifications ADD COLUMN link TEXT DEFAULT '';

-- 現場記録(配置・休憩時間・自由記入欄)
CREATE TABLE IF NOT EXISTS site_records(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  site TEXT NOT NULL,
  placement TEXT DEFAULT '',
  breaks TEXT DEFAULT '[]',
  memo TEXT DEFAULT '',
  updated_at TEXT,
  UNIQUE(user_id, date, site)
);

-- スタッフ登録のプルダウン選択肢(所属課・班)
CREATE TABLE IF NOT EXISTS option_lists(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  value TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  UNIQUE(category, value)
);
INSERT OR IGNORE INTO option_lists(category, value, sort_order) VALUES
 ('ka','1課',1), ('ka','2課',2),
 ('han','コンサート班',1), ('han','サンガ班',2);

-- 既存データに実際に使われている課・班も選択肢に取り込む(表記ゆれはそのまま個別の選択肢として追加される)
INSERT OR IGNORE INTO option_lists(category, value, sort_order)
  SELECT 'ka', ka, 100 FROM (SELECT DISTINCT ka FROM users WHERE ka IS NOT NULL AND ka!='') WHERE ka NOT IN (SELECT value FROM option_lists WHERE category='ka');
INSERT OR IGNORE INTO option_lists(category, value, sort_order)
  SELECT 'han', han, 100 FROM (SELECT DISTINCT han FROM users WHERE han IS NOT NULL AND han!='') WHERE han NOT IN (SELECT value FROM option_lists WHERE category='han');
