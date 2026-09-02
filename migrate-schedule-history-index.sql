-- schedule_history.target_id にインデックスが無く、個人の編集履歴取得(GET /history?uid=)の
-- たびにschedule_history全件(5万行超)をフルスキャンしていたための追加。
CREATE INDEX IF NOT EXISTS idx_schedule_history_target ON schedule_history(target_id);
