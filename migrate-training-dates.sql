-- 研修未受講リストの改善。詳細はschema.sqlのコメント参照。
ALTER TABLE users ADD COLUMN manner_date TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN team2_date TEXT DEFAULT NULL;
ALTER TABLE users ADD COLUMN su_date TEXT DEFAULT NULL;

-- 既存データの補正: ランクが既にD以上/C以上なのに研修フラグがfalseのままの人は、
-- 過去の昇格実績そのものが「研修は済んでいる」ことの証拠になるため、フラグを立て直す
-- (研修未受講リスト機能の追加より前から在籍していたベテランは、フラグが導入時点で
--  一律0のまま残っていたため、ランクだけ上がっているのに未受講扱いされてしまっていた)。
UPDATE users SET manner_done=1
  WHERE manner_done=0 AND rank IN ('D','C','B','A');
UPDATE users SET team2_done=1, su_done=1
  WHERE (team2_done=0 OR su_done=0) AND rank IN ('C','B','A');

-- 研修日は、rank_historyに残っている自動昇格の記録(manner_auto/promotion_auto)があれば
-- そこから遡って埋める(正確な受講日そのものではなく昇格適用日だが、目安としては十分)。
-- 記録が無いベテランはNULLのままとなり、フロント側では「—」として表示される。
UPDATE users SET manner_date = (
  SELECT MIN(ts) FROM rank_history WHERE user_id = users.id AND reason = 'manner_auto'
) WHERE manner_done=1 AND manner_date IS NULL;
UPDATE users SET team2_date = (
  SELECT MIN(ts) FROM rank_history WHERE user_id = users.id AND reason = 'promotion_auto'
) WHERE team2_done=1 AND team2_date IS NULL;
UPDATE users SET su_date = (
  SELECT MIN(ts) FROM rank_history WHERE user_id = users.id AND reason = 'promotion_auto'
) WHERE su_done=1 AND su_date IS NULL;
