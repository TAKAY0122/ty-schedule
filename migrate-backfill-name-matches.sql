-- 新人報告・ブラックリストの氏名照合を、これまでの全期間のscheduleデータに対して
-- 一度だけ遡って実行する(既存のmatchRookieAndBlacklist()は、以後の新規取込行にしか
-- 効かず、今回追加したmatchNameAgainstFullHistory()も新規提出時のみ動くため、
-- 過去に登録済みの新人報告・ブラックリストの中には、現場一覧にまだ一度も
-- 現れていない対象者が残っている状態だった)。
--
-- 通知(notify)は送らない。過去日付を大量に通知しても実害が無いのに大量に飛ぶだけのため。
-- UNIQUE(kind, matched_name, date, site) により、既に記録済みの組み合わせは
-- INSERT OR IGNORE で自然にスキップされるので、何度実行しても安全(冪等)。

INSERT OR IGNORE INTO rookie_site_matches(kind, matched_name, report_id, blacklist_id, date, site, venue, created_at)
SELECT 'blacklist', u.name, NULL, b.id, s.date, s.site, s.venue, datetime('now')
FROM blacklist b
JOIN users u
  ON REPLACE(REPLACE(u.name, ' ', ''), '　', '') = REPLACE(REPLACE(b.name, ' ', ''), '　', '')
JOIN schedule s ON s.user_id = u.id AND s.type = 'work' AND s.site <> ''
WHERE COALESCE(b.matched_ka, '') = '';

INSERT OR IGNORE INTO rookie_site_matches(kind, matched_name, report_id, blacklist_id, date, site, venue, created_at)
SELECT 'report', u.name, r.id, NULL, s.date, s.site, s.venue, datetime('now')
FROM reports r
JOIN users u
  ON REPLACE(REPLACE(u.name, ' ', ''), '　', '') = REPLACE(REPLACE(r.candidate_name, ' ', ''), '　', '')
JOIN schedule s ON s.user_id = u.id AND s.type = 'work' AND s.site <> ''
WHERE COALESCE(r.acquired_ka, '') = '';
