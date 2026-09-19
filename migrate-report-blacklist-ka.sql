-- 新人報告・ブラックリストを1課/2課で分ける。提出者/登録者の所属課をkaに記録し、
-- 閲覧時にその課の人(と管理者)だけに絞り込めるようにする。
ALTER TABLE reports ADD COLUMN ka TEXT DEFAULT '';
ALTER TABLE blacklist ADD COLUMN ka TEXT DEFAULT '';

-- 既存データの後追い(ベストエフォート): reportsはreporter_idから、blacklistはadded_by(氏名)から
-- 所属課を引けるものだけ埋める。引けなかった行はka=''のままとし、GET /reports・GET /blacklistの
-- 絞り込みロジック上「空なら誰でも閲覧可」として扱う(過去データを誤って非表示にしないため)。
UPDATE reports SET ka = (SELECT u.ka FROM users u WHERE u.id = reports.reporter_id)
WHERE COALESCE(ka,'') = '' AND EXISTS (SELECT 1 FROM users u WHERE u.id = reports.reporter_id AND COALESCE(u.ka,'') != '');

UPDATE blacklist SET ka = (SELECT u.ka FROM users u WHERE u.name = blacklist.added_by LIMIT 1)
WHERE COALESCE(ka,'') = '' AND EXISTS (SELECT 1 FROM users u WHERE u.name = blacklist.added_by AND COALESCE(u.ka,'') != '');
