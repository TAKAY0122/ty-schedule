-- duty_mapに登録のない業務名を案内料金(g5)扱いにする変更(2026年10月、ユーザーより指示)に伴い、
-- これまで未登録だった「楽屋受付」を明示的にg5として登録する。
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-duty-fallback-guide.sql
--
-- フォールバック挙動自体(duty_mapに無い業務名→g5)はsrc/index.tsのcalcPay()側の変更のみで、
-- DB側の変更は不要(対象外にしたい業務名だけをskipとして明示登録する方針に変わったため)。

INSERT INTO duty_map(duty,seg) VALUES ('楽屋受付','g5')
  ON CONFLICT(duty) DO UPDATE SET seg='g5';
