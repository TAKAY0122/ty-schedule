-- 現場ごとのチャットへの、アプリアカウントを持たない人向けゲスト参加機能。詳細はschema.sqlのコメント参照。
ALTER TABLE chat_rooms ADD COLUMN guest_token TEXT DEFAULT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_rooms_guest_token ON chat_rooms(guest_token);

CREATE TABLE IF NOT EXISTS chat_guests(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  device_token TEXT NOT NULL UNIQUE,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_chat_guests_room ON chat_guests(room_id);

-- chat_messages.sender_idをNOT NULL→NULL許容に変更し、guest_id列を追加するためのテーブル再構築
-- (SQLiteはNOT NULL制約の直接変更に対応していないため、作り直して既存データを移し替える)。
ALTER TABLE chat_messages RENAME TO chat_messages_old;
CREATE TABLE chat_messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL,
  sender_id INTEGER,
  sender_name TEXT DEFAULT '',
  guest_id INTEGER DEFAULT NULL,
  body TEXT NOT NULL,
  ts TEXT DEFAULT (datetime('now'))
);
INSERT INTO chat_messages(id, room_id, sender_id, sender_name, guest_id, body, ts)
  SELECT id, room_id, sender_id, sender_name, NULL, body, ts FROM chat_messages_old;
DROP TABLE chat_messages_old;
CREATE INDEX IF NOT EXISTS idx_chat_messages_room_ts ON chat_messages(room_id, ts);
