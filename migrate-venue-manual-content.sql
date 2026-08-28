-- 会場マニュアル本文(自由配置キャンバス方式)。venue_manuals(既存)は「マニュアルの有無フラグ」のみを
-- 管理するテーブルのため、本文(テキスト/写真/動画のブロック)は別テーブルで管理する。
-- x/y/w/h は基準幅1000pxの仮想キャンバスに対する絶対座標・サイズ(px相当)。高さ方向は内容に応じて
-- 自由に伸ばせる。フロント側でコンテナの実際の幅÷1000を拡大率としてtransform:scale()で一括
-- 縮小/拡大することで、PC(1280px)・スマホ(375px)どちらでも同じレイアウトに見せる。
CREATE TABLE IF NOT EXISTS venue_manual_blocks(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue TEXT NOT NULL,
  type TEXT NOT NULL,           -- 'text' | 'photo' | 'video'
  content TEXT,                 -- text: 本文そのもの。photo/video: R2キー(MANUALSバケット)
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  w REAL NOT NULL DEFAULT 20,
  h REAL NOT NULL DEFAULT 10,
  z INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT,
  updated_by INTEGER,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_venue_manual_blocks_venue ON venue_manual_blocks(venue);

-- 会場マニュアルの更新履歴(誰が・いつ・どのブロックに何をしたか)。「保存」操作1回につき、
-- 実際に変化した(追加・編集・削除された)ブロックの数だけ1行ずつ記録する
-- (ドラッグ中の中間状態や、変更が無かったブロックは記録しない)。
CREATE TABLE IF NOT EXISTS venue_manual_history(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  venue TEXT NOT NULL,
  block_id INTEGER,
  action TEXT NOT NULL,         -- 'add' | 'edit' | 'delete'
  summary TEXT,
  user_id INTEGER,
  user_name TEXT,               -- 表示用に氏名を非正規化して保存(退職・改名後も履歴が読めるように)
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_venue_manual_history_venue ON venue_manual_history(venue, created_at DESC);
