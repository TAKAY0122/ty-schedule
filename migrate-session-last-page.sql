-- ログイン中メンバーが今何を見ているか・セッションが何を見ていたかを、管理者以上が確認できるようにする。
ALTER TABLE sessions ADD COLUMN last_page TEXT DEFAULT '';
