-- 現場一覧: まだ誰も配置されていない現場を、手配者以上が手配モード中に手動登録できるようにする機能。
-- 同じ(date,site)にscheduleの実績ができた時点で、一覧側の表示はそちらに切り替わる(GET /sites参照)。
CREATE TABLE IF NOT EXISTS site_registry(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  site TEXT NOT NULL,
  venue TEXT DEFAULT '',
  created_by INTEGER,
  created_at TEXT,
  UNIQUE(date, site)
);
CREATE INDEX IF NOT EXISTS idx_site_registry_date ON site_registry(date);
