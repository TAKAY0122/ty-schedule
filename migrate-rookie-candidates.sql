-- 新人リスト(台帳取込時に見つかる未登録の新人)。詳細はschema.sqlのコメント参照。
CREATE TABLE IF NOT EXISTS rookie_candidates(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  regno TEXT NOT NULL,
  name TEXT DEFAULT '',
  date TEXT NOT NULL,
  site TEXT DEFAULT '',
  venue TEXT DEFAULT '',
  first_seen_ts TEXT,
  last_seen_ts TEXT,
  UNIQUE(regno, date, site)
);
CREATE INDEX IF NOT EXISTS idx_rookie_candidates_regno ON rookie_candidates(regno);

CREATE TABLE IF NOT EXISTS rookie_quick_evals(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  regno TEXT NOT NULL,
  candidate_name TEXT DEFAULT '',
  date TEXT DEFAULT '',
  site TEXT DEFAULT '',
  evaluator_id INTEGER,
  evaluator_name TEXT DEFAULT '',
  s_motivation INTEGER,
  s_response INTEGER,
  s_total INTEGER,
  note TEXT DEFAULT '',
  report_id INTEGER DEFAULT NULL,
  ts TEXT
);
CREATE INDEX IF NOT EXISTS idx_rookie_quick_evals_regno ON rookie_quick_evals(regno);
