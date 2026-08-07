-- 会場一覧・公演一覧共通のグループ機能、公演一覧限定のフォルダ機能の追加
CREATE TABLE IF NOT EXISTS site_groups(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  created_by INTEGER,
  created_at TEXT,
  UNIQUE(kind, name)
);
CREATE TABLE IF NOT EXISTS site_group_members(
  group_id INTEGER NOT NULL,
  member TEXT NOT NULL,
  UNIQUE(group_id, member)
);
CREATE INDEX IF NOT EXISTS idx_site_group_members_group ON site_group_members(group_id);

CREATE TABLE IF NOT EXISTS artist_folders(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_by INTEGER,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS artist_folder_members(
  folder_id INTEGER NOT NULL,
  artist TEXT NOT NULL,
  UNIQUE(folder_id, artist)
);
CREATE INDEX IF NOT EXISTS idx_artist_folder_members_folder ON artist_folder_members(folder_id);
