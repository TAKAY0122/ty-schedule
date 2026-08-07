-- 過去データ(2024〜2025年分の給与実績再構築)取込のステージングテーブル
CREATE TABLE IF NOT EXISTS legacy_import_shifts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ym TEXT NOT NULL,
  date TEXT NOT NULL,
  user_id INTEGER,
  regno TEXT DEFAULT '',
  name TEXT DEFAULT '',
  rank TEXT DEFAULT '',
  site TEXT DEFAULT '',
  venue TEXT DEFAULT '',
  duty TEXT DEFAULT '',
  tin TEXT DEFAULT '',
  tout TEXT DEFAULT '',
  hours REAL DEFAULT 0,
  pay INTEGER DEFAULT 0,
  note TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
);
CREATE INDEX IF NOT EXISTS idx_legacy_import_ym ON legacy_import_shifts(ym);
CREATE INDEX IF NOT EXISTS idx_legacy_import_user_date ON legacy_import_shifts(user_id, date);
