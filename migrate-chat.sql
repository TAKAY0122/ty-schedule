-- 全体チャット(第1弾)。詳細はschema.sqlのコメント参照。
CREATE TABLE IF NOT EXISTS chat_rooms(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  ref_key TEXT DEFAULT '',
  name TEXT DEFAULT '',
  created TEXT DEFAULT (datetime('now')),
  UNIQUE(type, ref_key)
);
CREATE TABLE IF NOT EXISTS chat_messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  sender_name TEXT DEFAULT '',
  body TEXT NOT NULL,
  ts TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_ts ON chat_messages(room_id, ts);
CREATE TABLE IF NOT EXISTS chat_reads(
  room_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  last_read_message_id INTEGER DEFAULT 0,
  PRIMARY KEY(room_id, user_id)
);
INSERT OR IGNORE INTO chat_rooms(type, ref_key, name) VALUES ('all', '', '全体チャット');
