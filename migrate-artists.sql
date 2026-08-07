-- アーティスト一覧の追加。会場一覧・会場マニュアルと同じ考え方で、まだ本当に必要かどうか
-- 未確定の機能のため、機能公開設定を「準備中」で初期登録しておく
-- (未設定時の既定は「公開中」のため、明示的に登録する必要がある)。
INSERT OR IGNORE INTO settings(key,value) VALUES('feature_status_artists','hidden');
