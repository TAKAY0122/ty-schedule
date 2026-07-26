-- 手配管理表フォーマット(D)の取り込みに対応するための、非現場キーワード追加
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-format-d-keywords.sql
--
-- 手配管理表では、既存の「○」「〇」とは別の丸記号(⚪︎ = U+26AA)が「1日OK」の意味で使われている。
-- また「休暇希望」は、現場名ではなく休みの意思表示として使われている。
-- ※「休暇希望」を休暇(off)ではなく別の扱いにしたい場合は、
--   システム設定 →「現場名ではない文言」の一覧から、いつでも変更・削除できる。

INSERT OR IGNORE INTO non_site_keywords(keyword, type, sort_order) VALUES
 ('休暇希望','off',11),
 ('⚪︎','ok',23),
 ('⚪','ok',24);
