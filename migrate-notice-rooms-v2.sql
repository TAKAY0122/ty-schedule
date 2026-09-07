-- お知らせチャットの設計変更(2026年9月、ユーザーの指示): 「お知らせ専用」の別ルームにするのをやめ、
-- チーフ以上/手配担当以上/管理者向けの通常の会話も可能なチャットルーム(役職チャット)に変更する。
-- 'all'ロール向けの内容は専用ルームを持たず、既存の全体チャットへ直接投稿する方式に変更したため、
-- migrate-notice-rooms.sqlで作成した「お知らせ(全体)」ルームは不要になる。
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-notice-rooms-v2.sql

-- 1. 「お知らせ(全体)」ルームに投稿済みのメッセージを、既存の全体チャットへ移す
UPDATE chat_messages SET room_id = (SELECT id FROM chat_rooms WHERE type='all')
WHERE room_id = (SELECT id FROM chat_rooms WHERE type='notice' AND ref_key='all');

-- 2. 「お知らせ(全体)」ルーム自体と、そのルームに対する既読位置を削除する
DELETE FROM chat_reads WHERE room_id = (SELECT id FROM chat_rooms WHERE type='notice' AND ref_key='all');
DELETE FROM chat_rooms WHERE type='notice' AND ref_key='all';

-- 3. 残る3ルームの表示名を「お知らせ」ブランドから「役職チャット」の名称へ変更する
UPDATE chat_rooms SET name='チーフ以上チャット' WHERE type='notice' AND ref_key='chief';
UPDATE chat_rooms SET name='手配担当以上チャット' WHERE type='notice' AND ref_key='handler';
UPDATE chat_rooms SET name='管理者チャット' WHERE type='notice' AND ref_key='admin';
