-- 以前(撤去済みのランク管理機能があった頃)にアップデートのお知らせを見たことで、
-- seen_update_versionが既に2以上になってしまっている人がいると、今回追加したv2の
-- お知らせ(稼働サマリーリニューアル・スケジュール一覧・メンバー分析・ホーム画面カスタマイズ)が
-- 表示されないままになってしまう。全員を1にリセットし、v2のお知らせを再度見られるようにする。
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-reset-update-version.sql

UPDATE users SET seen_update_version = 1 WHERE seen_update_version > 1;
