-- GET /name-site-logがrookie_candidates全件をフルスキャンしないよう、空白除去済みの氏名列を
-- 追加してインデックスを張る(会場一覧・編集履歴検索で過去に発生した「テーブルが育つほど重くなる
-- フルスキャン」の再発防止。詳細はschema.sqlのコメント参照)。
ALTER TABLE rookie_candidates ADD COLUMN name_norm TEXT DEFAULT '';
UPDATE rookie_candidates SET name_norm = REPLACE(REPLACE(name, ' ', ''), '　', '');
CREATE INDEX IF NOT EXISTS idx_rookie_candidates_name_norm ON rookie_candidates(name_norm);
