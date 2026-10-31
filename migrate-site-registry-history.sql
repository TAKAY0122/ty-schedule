-- site_registryの自動削除(台帳照合で「見当たらない」と判定された登録現場の削除)を
-- 永続的に記録する履歴テーブル。従来はclearAbsentSiteRegistry()が削除するだけで記録を
-- 残しておらず、「daicho_reload_last_result」設定(直近1回分のみ保持)が次の取込で
-- 上書きされると、何が消えたのか二度と確認できなくなっていた(2026年10月、実際に発生)。
CREATE TABLE IF NOT EXISTS site_registry_history(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  date TEXT NOT NULL,
  site TEXT NOT NULL,
  venue TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_site_registry_history_ts ON site_registry_history(ts);
