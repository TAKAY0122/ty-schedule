-- 「手配者ロール」と「手配グループを持つこと」を切り離す。
--
-- 経緯: これまでは role が handler / admin であれば自動的に「手配グループ」の持ち主として扱われ、
-- 担当手配者のプルダウンやメンバー分析のグループ欄に必ず出ていた。そのため
-- 「手配者の権限だけ与えたいが、自分のグループは持たせたくない」という運用ができなかった。
--
-- 今後は users.is_manager が 1 の人だけが手配グループを持つ(＝担当手配者として選べる)。
-- ロールと権限の判定はこれまで通り role で行うため、is_manager はグループの有無だけに影響する。
--
-- 既存の動作を変えないため、現在 handler / admin の人には一律で 1 を立てる。
-- グループを持たせたくない人は、この後メンバー編集画面のチェックを外して調整する。
-- 以降に新しく手配者にした人は、既定では 0(グループなし)になる。

ALTER TABLE users ADD COLUMN is_manager INTEGER DEFAULT 0;

UPDATE users SET is_manager = 1 WHERE role IN ('handler', 'admin');

-- 念のため、既に誰かの担当手配者として紐付いている人は、ロールに関わらずグループ持ちにしておく
-- (紐付いたメンバーが宙に浮かないようにするため)
UPDATE users SET is_manager = 1
WHERE id IN (SELECT DISTINCT manager_id FROM users WHERE manager_id IS NOT NULL);
