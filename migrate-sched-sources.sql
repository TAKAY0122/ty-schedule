-- 予定表ソース管理テーブルを追加
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-sched-sources.sql

CREATE TABLE IF NOT EXISTS sched_sources(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  url TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  freq_type TEXT DEFAULT 'interval',
  interval_hours INTEGER DEFAULT 1,
  hour INTEGER DEFAULT 6,
  notify_admin INTEGER DEFAULT 1,
  last_run TEXT DEFAULT '',
  last_result TEXT DEFAULT '',
  created_at TEXT,
  created_by INTEGER
);

-- 既存の「チーフ予定取込」「1課予定取込」の設定(settingsテーブルに保存されていたもの)を
-- 新しいsched_sourcesテーブルに引き継ぐ。URLが設定されていない場合は何も作成されない。
INSERT INTO sched_sources(label, url, enabled, freq_type, interval_hours, hour, notify_admin, last_run, last_result, created_at)
SELECT
  'チーフスケジュール表',
  (SELECT value FROM settings WHERE key='sched_chief_url'),
  CASE WHEN (SELECT value FROM settings WHERE key='sched_chief_enabled')='1' THEN 1 ELSE 0 END,
  CASE WHEN (SELECT value FROM settings WHERE key='sched_chief_freq')='hourly' THEN 'interval' ELSE 'daily' END,
  1,
  COALESCE((SELECT CAST(value AS INTEGER) FROM settings WHERE key='sched_chief_hour'), 6),
  1,
  COALESCE((SELECT value FROM settings WHERE key='sched_chief_last_run'), ''),
  COALESCE((SELECT value FROM settings WHERE key='sched_chief_last_result'), ''),
  datetime('now')
WHERE EXISTS (SELECT 1 FROM settings WHERE key='sched_chief_url' AND value!='');

INSERT INTO sched_sources(label, url, enabled, freq_type, interval_hours, hour, notify_admin, last_run, last_result, created_at)
SELECT
  '1課スケジュール表',
  (SELECT value FROM settings WHERE key='sched_ka1_url'),
  CASE WHEN (SELECT value FROM settings WHERE key='sched_ka1_enabled')='1' THEN 1 ELSE 0 END,
  'interval',
  1,
  6,
  1,
  COALESCE((SELECT value FROM settings WHERE key='sched_ka1_last_run'), ''),
  COALESCE((SELECT value FROM settings WHERE key='sched_ka1_last_result'), ''),
  datetime('now')
WHERE EXISTS (SELECT 1 FROM settings WHERE key='sched_ka1_url' AND value!='');
