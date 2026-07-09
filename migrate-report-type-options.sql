-- 現場変更報告モーダルの「変更内容」選択肢管理テーブルを追加
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-report-type-options.sql

CREATE TABLE IF NOT EXISTS report_type_options(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);
INSERT OR IGNORE INTO report_type_options(type, label, sort_order) VALUES
 ('work','現場に変更',1), ('off','休暇に変更',2);
