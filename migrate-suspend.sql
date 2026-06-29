-- 既存DBに「アカウント停止」機能を追加するマイグレーション
-- 適用: npx wrangler d1 execute schedule-db --remote --file=migrate-suspend.sql
-- (新規にschema.sqlで作る場合は不要・最初から入っています)

ALTER TABLE users ADD COLUMN suspended INTEGER DEFAULT 0;

-- 【任意】1課(Nチーム)のメンバーを全員アカウント停止にする場合は次の行のコメントを外して実行
-- (kaが'1課'に設定済みであることが前提。設定していない場合は管理画面の「停止」ボタンで個別に)
-- UPDATE users SET suspended=1 WHERE ka='1課';
