-- 無効になった昇格予約(promotion_pending_date / promotion_pending_rank)を一括で取り消す。
--
-- 経緯: ランクの手動変更(PATCH /users/:id)と査定(POST /users/:id/assess)が、rank を更新する際に
-- 研修による昇格予約をクリアしていなかった。そのため「研修で D→C の予約が入っていた人を、
-- 先に査定で B に上げた」といった場合に予約だけが残り続け、管理者ダッシュボードの「昇格予定」に
-- 既に無効な予定(例: B ランクの人が「→ C」)が出続けていた。
-- コード側は修正済み(以後は残らない)。このSQLは既にDBへ入ってしまっている分の後始末。
--
-- 消す対象は「予約先ランクが空」または「予約先が現在のランク以下(＝もう上がる必要がない)」のもの。
-- まだ有効な予約(現ランクより上位への予約)は消さない。

UPDATE users
SET promotion_pending_date = NULL,
    promotion_pending_rank = NULL
WHERE promotion_pending_date IS NOT NULL
  AND (
    promotion_pending_rank IS NULL
    OR TRIM(promotion_pending_rank) = ''
    OR CASE UPPER(TRIM(promotion_pending_rank))
         WHEN 'E' THEN 0 WHEN 'D' THEN 1 WHEN 'C' THEN 2 WHEN 'B' THEN 3 WHEN 'A' THEN 4 ELSE -1 END
       <=
       CASE UPPER(SUBSTR(TRIM(COALESCE(rank, '')), 1, 1))
         WHEN 'E' THEN 0 WHEN 'D' THEN 1 WHEN 'C' THEN 2 WHEN 'B' THEN 3 WHEN 'A' THEN 4 ELSE -1 END
  );
