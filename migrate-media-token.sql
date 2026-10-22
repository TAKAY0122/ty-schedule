-- 会場マニュアルの写真/動画配信を、長命のセッショントークンをURLに平文で載せる方式から、
-- 短命(発行から2時間)の専用トークン方式に変更する。
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-media-token.sql

ALTER TABLE sessions ADD COLUMN media_token TEXT;
ALTER TABLE sessions ADD COLUMN media_token_exp INTEGER;
CREATE INDEX IF NOT EXISTS idx_sessions_media_token ON sessions(media_token);
