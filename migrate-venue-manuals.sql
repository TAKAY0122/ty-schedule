-- 会場マニュアルの有無フラグ。行の存在=あり、として扱う。
CREATE TABLE IF NOT EXISTS venue_manuals(
  venue TEXT PRIMARY KEY,
  updated_by INTEGER,
  updated_at TEXT
);
