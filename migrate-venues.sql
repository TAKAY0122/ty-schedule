-- 会場一覧・会場マニュアルの追加。会場マニュアルはまだ中身が無いため、機能公開設定を
-- 「準備中」で初期登録しておく(未設定時の既定は「公開中」のため、明示的に登録する必要がある)。
INSERT OR IGNORE INTO settings(key,value) VALUES('feature_status_venue-manual','hidden');
