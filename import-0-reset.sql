-- 既存の壊れたスケジュールと重複ユーザーを削除してからやり直す
DELETE FROM schedule;
DELETE FROM users WHERE regno != '323331';
