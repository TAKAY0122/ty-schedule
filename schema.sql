-- RB事業2課 スケジュール管理アプリ D1スキーマ
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  regno TEXT UNIQUE NOT NULL,            -- 登録番号
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',   -- member / chief / handler / admin
  rank TEXT DEFAULT '',                  -- Bランク など
  ka TEXT DEFAULT '',                    -- 課(1課/2課)
  han TEXT DEFAULT '',                   -- S班&C班 など
  station TEXT DEFAULT '',               -- 最寄駅
  skills TEXT DEFAULT '',                -- できることリスト(進行、買い出し など)
  manager_id INTEGER DEFAULT NULL,       -- 担当手配者(handlerのuser_id)
  pass_hash TEXT,                        -- NULL = 初期PW(登録番号)で初回ログイン
  salt TEXT,
  suspended INTEGER DEFAULT 0,           -- 1 = アカウント停止(ログイン不可・一覧等には表示)
  must_change INTEGER DEFAULT 0,         -- 1 = 次回ログイン時にパスワード変更を強制
  extra_perms TEXT DEFAULT '[]',         -- 基本権限とは別に個別付与された追加権限(JSON配列)
  created TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  handler INTEGER DEFAULT 0,             -- 手配者モード(PIN 111111入力済み)
  last_seen INTEGER,
  created INTEGER
);

-- スケジュール:1日に複数現場を持てる(id採番 + slotで同日内の順番)
CREATE TABLE IF NOT EXISTS schedule(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,                    -- YYYY-MM-DD
  slot INTEGER NOT NULL DEFAULT 0,       -- 同じ日の中での通し番号(0,1,2...)
  type TEXT NOT NULL DEFAULT 'work',     -- work / off / paid / x
  site TEXT DEFAULT '',                  -- 現場名
  venue TEXT DEFAULT '',                 -- 会場
  tin TEXT DEFAULT '',                   -- IN  HH:MM
  tout TEXT DEFAULT '',                  -- OUT HH:MM
  hours REAL DEFAULT 0,
  overtime REAL DEFAULT 0,
  pay INTEGER DEFAULT 0,
  note TEXT DEFAULT '',                  -- 現場備考(手配担当が入力)
  duty TEXT DEFAULT '',                  -- 業務名(案内/搬入/パッケージ 等)
  load_end TEXT DEFAULT '',              -- 搬入終了 HH:MM
  show_end TEXT DEFAULT '',              -- 終演時間 HH:MM
  multi INTEGER DEFAULT 0,               -- 複数回公演(2st)=1
  UNIQUE(user_id, date, slot)
);
CREATE INDEX IF NOT EXISTS idx_sched_user_date ON schedule(user_id, date);
CREATE INDEX IF NOT EXISTS idx_sched_date_site ON schedule(date, site);

-- 育成計画は「人×日」単位(現場が複数でも1日1つ)
CREATE TABLE IF NOT EXISTS dev_plan(
  user_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  plan TEXT DEFAULT '',
  PRIMARY KEY(user_id, date)
);

CREATE TABLE IF NOT EXISTS schedule_history(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT,
  editor_id INTEGER,
  target_id INTEGER,
  date TEXT,
  before_json TEXT,
  after_json TEXT
);

CREATE TABLE IF NOT EXISTS reports(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT,
  reporter_id INTEGER,
  reporter_name TEXT,
  candidate_name TEXT,
  candidate_grade TEXT,
  first_chief TEXT DEFAULT '',           -- 1次 連絡したチーフ
  first_note TEXT DEFAULT '',            -- 1次 所感
  s_motivation INTEGER,                  -- 2次 やる気・表情(1-5)
  s_response INTEGER,                    -- 2次 受け答え(1-5)
  s_total INTEGER,                       -- 2次 総合点(1-10)
  draft TEXT DEFAULT '',                 -- 2次 ドラフト承認 OK/不可/様子見
  plan TEXT DEFAULT '',                  -- 2次 今後の育成計画
  checker TEXT DEFAULT '',               -- チーフチェック者
  next_site TEXT DEFAULT '',             -- 次回現場名(任意)
  next_date TEXT DEFAULT '',             -- 次回日付(任意)
  status TEXT DEFAULT 'pending'          -- pending(2次未) / checked
);

CREATE TABLE IF NOT EXISTS blacklist(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT,                               -- 提出日時
  date TEXT DEFAULT '',                  -- 日付
  reporter TEXT DEFAULT '',              -- 報告者
  name TEXT,                             -- 名前
  s_talk INTEGER,                        -- 会話(1-5)
  s_dress INTEGER,                       -- 服装(1-5)
  s_groom INTEGER,                       -- 身なり(1-5)
  s_late INTEGER,                        -- 遅刻(1-5)
  s_work INTEGER,                        -- 業務(1-5)
  reason TEXT DEFAULT '',                -- 理由
  added_by TEXT DEFAULT ''               -- 登録者(ログインユーザー)
);

CREATE TABLE IF NOT EXISTS notifications(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  ts TEXT,
  type TEXT DEFAULT '',
  message TEXT,
  read INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings(
  key TEXT PRIMARY KEY,
  value TEXT
);

-- 手配者専用パスワードの初期値(管理者画面で変更可能)
INSERT OR IGNORE INTO settings(key, value) VALUES('handler_pin', '111111');

-- スプレッドシート連携(GAS)用の取り込みトークン。管理者画面で再発行可能
INSERT OR IGNORE INTO settings(key, value) VALUES('import_token', 'CHANGE-ME-IMPORT-TOKEN-0001');

-- 時給テーブル(効力発生日つき・編集可)。kind: guide=案内料金 / load=搬入出料金
CREATE TABLE IF NOT EXISTS wage_rates(
  effective_from TEXT NOT NULL,   -- この日以降に適用(YYYY-MM-DD)
  rank TEXT NOT NULL,             -- A〜E
  kind TEXT NOT NULL,             -- guide / load
  amount INTEGER NOT NULL,
  PRIMARY KEY(effective_from, rank, kind)
);
-- 旧時給(〜2025/9)
INSERT OR IGNORE INTO wage_rates(effective_from,rank,kind,amount) VALUES
 ('1900-01-01','A','guide',1160),('1900-01-01','A','load',1260),
 ('1900-01-01','B','guide',1150),('1900-01-01','B','load',1250),
 ('1900-01-01','C','guide',1140),('1900-01-01','C','load',1240),
 ('1900-01-01','D','guide',1130),('1900-01-01','D','load',1230),
 ('1900-01-01','E','guide',1120),('1900-01-01','E','load',1120);
-- 改定時給(2025/10〜)
INSERT OR IGNORE INTO wage_rates(effective_from,rank,kind,amount) VALUES
 ('2025-10-01','A','guide',1220),('2025-10-01','A','load',1320),
 ('2025-10-01','B','guide',1210),('2025-10-01','B','load',1310),
 ('2025-10-01','C','guide',1200),('2025-10-01','C','load',1300),
 ('2025-10-01','D','guide',1190),('2025-10-01','D','load',1290),
 ('2025-10-01','E','guide',1180),('2025-10-01','E','load',1280);

-- 取り込んだ台帳(元Excel)の保管インデックス。実ファイルはR2に保存し、ここはメタ情報のみ。
CREATE TABLE IF NOT EXISTS daicho_archive(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,            -- 取り込み日時(JST)
  importer_id INTEGER,        -- 取り込んだ人のユーザーID
  importer_name TEXT,         -- 取り込んだ人の氏名(削除耐性のため文字列でも保持)
  source_url TEXT,            -- 取り込み元のスプレッドシートURL
  file_id TEXT,               -- スプレッドシートのファイルID
  r2_key TEXT NOT NULL,       -- R2上の保存キー(=ダウンロード識別子)
  file_name TEXT,             -- 元ファイル名(表示用)
  size INTEGER,               -- バイトサイズ
  applied INTEGER,            -- このとき反映された件数
  sheets INTEGER              -- 読み取ったシート数
);

-- 予定表(チーフ/手配者スケジュール表など)を自動取り込みする際、人単位で「前回取り込んだ内容」を
-- 保存しておき、変わっていない人はスケジュールDBへの書き込みをスキップするためのテーブル。
CREATE TABLE IF NOT EXISTS import_snapshots(
  source TEXT NOT NULL,   -- 取り込み元を識別するキー(例: 'chief_sched', 'ka1_sched')
  regno TEXT NOT NULL,
  data TEXT NOT NULL,     -- その人の対象期間分のデータをJSON化したもの
  updated_at TEXT,
  PRIMARY KEY(source, regno)
);

-- 初期管理者(初期パスワードは登録番号と同じ: 323331)
INSERT OR IGNORE INTO users(regno, name, role) VALUES('323331', '管理者', 'admin');
