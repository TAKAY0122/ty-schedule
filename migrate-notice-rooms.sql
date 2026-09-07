-- v1〜v13のアップデートのお知らせを、ロール階層に応じたお知らせルームへ過去分として一括投稿する
-- (2026年9月、既存アカウント・新規アカウントどちらでも全体チャットのお知らせルームから過去の
-- お知らせを確認できるようにするための一回限りの遡及投稿)。
-- 実行: npx wrangler d1 execute schedule-db --remote --file=migrate-notice-rooms.sql

INSERT OR IGNORE INTO chat_rooms(type, ref_key, name) VALUES
  ('notice', 'all', 'お知らせ(全体)'),
  ('notice', 'chief', 'お知らせ(チーフ以上)'),
  ('notice', 'handler', 'お知らせ(手配担当以上)'),
  ('notice', 'admin', 'お知らせ(管理者)');

INSERT INTO chat_messages(room_id, sender_id, sender_name, guest_id, body, ts)
  SELECT id, NULL, 'お知らせ', NULL, '【v1】アップデートのお知らせ

◆ ホーム画面を追加
ログイン後、今日・明日の現場や通知が一目で見られるようになりました。

◆ 休み希望・稼働時間の提出
マイスケジュールから、休み希望や「この時間なら動ける」を手配担当者に伝えられます。

◆ Googleカレンダー連携
自分のスケジュールを普段使いのカレンダーアプリに自動反映できます。', datetime('now')
  FROM chat_rooms WHERE type='notice' AND ref_key='all';

INSERT INTO chat_messages(room_id, sender_id, sender_name, guest_id, body, ts)
  SELECT id, NULL, 'お知らせ', NULL, '【v1】アップデートのお知らせ

◆ メンバーを希望する機能
チーフ以上が「この現場にこの人が欲しい」と指名し、手配担当者の承認で反映できます。

◆ 稼働サマリーを強化
「同じ現場ばかり任されている人」を自動で検知するようになりました。', datetime('now')
  FROM chat_rooms WHERE type='notice' AND ref_key='chief';

INSERT INTO chat_messages(room_id, sender_id, sender_name, guest_id, body, ts)
  SELECT id, NULL, 'お知らせ', NULL, '【v2】アップデートのお知らせ

◆ 稼働サマリーをリニューアル
月100時間超・6連勤以上・同じ現場ばかりなど、気になる状況をひと目で確認できるようになりました。並び替えも自由に変更できます。

◆ スケジュール一覧を追加
全メンバーの1週間分の予定を、チーフ予定表のような一覧(日付×人のマトリックス表)で確認できます。

◆ メンバー分析を追加
拠点・課・班・ランクの構成を、全体・課ごとにリアルタイムで確認できます。手配担当ごとの内訳も見られます。', datetime('now')
  FROM chat_rooms WHERE type='notice' AND ref_key='chief';

INSERT INTO chat_messages(room_id, sender_id, sender_name, guest_id, body, ts)
  SELECT id, NULL, 'お知らせ', NULL, '【v2】アップデートのお知らせ

◆ ホーム画面を自由にカスタマイズ
ホーム画面の「編集」から、ショートカットの並び替え・非表示・追加ができるようになりました(iPhoneのホーム画面のような感覚で使えます)。', datetime('now')
  FROM chat_rooms WHERE type='notice' AND ref_key='all';

INSERT INTO chat_messages(room_id, sender_id, sender_name, guest_id, body, ts)
  SELECT id, NULL, 'お知らせ', NULL, '【v3】アップデートのお知らせ

◆ ランクの自動昇格・査定
マナー研修を受けると翌日にDランク、チーム研修(2部)とステージアップ研修(SU)の両方を受けると翌月1日にCランクへ自動で昇格します。C→B、B→Aは査定ボタンで昇格でき、昇格した月の給与は月初に遡って新しいランクで再計算されます。いつ・誰が・どんな理由でランクを変更したかは、メンバー編集画面から履歴を確認できます。', datetime('now')
  FROM chat_rooms WHERE type='notice' AND ref_key='all';

INSERT INTO chat_messages(room_id, sender_id, sender_name, guest_id, body, ts)
  SELECT id, NULL, 'お知らせ', NULL, '【v4】アップデートのお知らせ

◆ 個人の年間サマリー・備考欄を追加
メンバーごとの月別稼働日数・時間・給料の年間推移や、申し送り事項を記録する備考欄を確認できるようになりました(手配担当者以上)。

◆ 台帳Excelファイルの直接取り込みに対応
手配管理表のExcelファイルをPCから直接アップロードして取り込めるようになりました。複数ファイルの一括取込や、台帳保管に保存済みのファイルからの再取込にも対応しています(常に手動実行)。', datetime('now')
  FROM chat_rooms WHERE type='notice' AND ref_key='handler';

INSERT INTO chat_messages(room_id, sender_id, sender_name, guest_id, body, ts)
  SELECT id, NULL, 'お知らせ', NULL, '【v5】アップデートのお知らせ

◆ 複数日の現場に「稼働表」を追加
現場一覧の現場詳細から「稼働表」を押すと、その現場が行われている期間(前後の連続した日程を自動判定)に入っている人だけを、日付×人の一覧で確認できるようになりました。現場に入っていない日も、休暇・NG・別の現場のどれかが分かります。

◆ 現場詳細に「過去・今後の公演」を追加
現場詳細画面に、同じ会場・同じアーティスト(現場名)の過去と今後の公演一覧を追加しました。押すとその公演の詳細(入っていた人・時間等)がすぐに確認できます。', datetime('now')
  FROM chat_rooms WHERE type='notice' AND ref_key='chief';

INSERT INTO chat_messages(room_id, sender_id, sender_name, guest_id, body, ts)
  SELECT id, NULL, 'お知らせ', NULL, '【v6】アップデートのお知らせ

◆ 現場一覧で現場名・会場をまとめて変更できるように
入力者によってバラバラになりがちな現場名・会場の表記を、現場一覧でチェックを入れて選び、まとめて統一名称に変更できるようになりました(手配者以上)。', datetime('now')
  FROM chat_rooms WHERE type='notice' AND ref_key='handler';

INSERT INTO chat_messages(room_id, sender_id, sender_name, guest_id, body, ts)
  SELECT id, NULL, 'お知らせ', NULL, '【v7】アップデートのお知らせ

◆ 現場一覧に、現場情報を先に登録できるように
これまで現場一覧はメンバーが配置された現場だけを表示していましたが、まだ誰も配置していない現場も先に登録して表示しておけるようになりました(手配者以上・手配モード中)。登録後は他の現場と同じようにタップしてメンバーを追加でき、不要になれば削除もできます。台帳取込で「登場しない人を休暇に変更する」にチェックを入れた際、その現場が台帳に見当たらなくなっていれば自動的に削除されます。', datetime('now')
  FROM chat_rooms WHERE type='notice' AND ref_key='handler';

INSERT INTO chat_messages(room_id, sender_id, sender_name, guest_id, body, ts)
  SELECT id, NULL, 'お知らせ', NULL, '【v8】アップデートのお知らせ

◆ ログイン中メンバーの閲覧中ページを確認できるように
「ログイン中・編集履歴」画面で、ログイン中の各メンバーが今どの画面を見ているかを確認できるようになりました(管理者以上)。あわせて、アカウント管理の全データ閲覧「ログインセッション」にも、そのセッションが最後に見ていたページを表示するようになりました。', datetime('now')
  FROM chat_rooms WHERE type='notice' AND ref_key='admin';

INSERT INTO chat_messages(room_id, sender_id, sender_name, guest_id, body, ts)
  SELECT id, NULL, 'お知らせ', NULL, '【v9】アップデートのお知らせ

◆ 現場詳細画面から、同会場・同アーティストの公演をまとめて編集できるように
現場詳細画面の「同会場の公演」「同アーティストの公演」一覧から、それぞれ「まとめて編集」で一覧全体をまとめて変更できるようになりました(手配者以上)。「同会場の公演」は会場のみ、「同アーティストの公演」は現場名のみが対象で、一覧内の他の項目まで誤って書き換わることはありません。', datetime('now')
  FROM chat_rooms WHERE type='notice' AND ref_key='handler';

INSERT INTO chat_messages(room_id, sender_id, sender_name, guest_id, body, ts)
  SELECT id, NULL, 'お知らせ', NULL, '【v10】アップデートのお知らせ

◆ 会場一覧を追加
現場一覧と同じ感覚で使える「会場一覧」を追加しました。会場ごとに、過去・今後どちらもまとめてその会場の現場を確認でき、タップすると現場の詳細も見られます。手配者以上であれば、会場名をまとめて変更したり、関連する会場をグループにまとめて絞り込んだりもできます。

◆ マイスケジュールから「行った会場」「行った公演」を確認できるように
マイスケジュール画面から「行った会場」「行った公演」ボタンを押すと、実際に行ったことのある会場・公演の一覧と回数を確認できます。会場・公演・現場の詳細画面でも、自分が行ったことのある項目に金色の丸マークが付き、検索バーで現場名・会場名・公演名・日付から探すこともできるようになりました。', datetime('now')
  FROM chat_rooms WHERE type='notice' AND ref_key='chief';

INSERT INTO chat_messages(room_id, sender_id, sender_name, guest_id, body, ts)
  SELECT id, NULL, 'お知らせ', NULL, '【v10】アップデートのお知らせ

◆ マイスケジュールの下部に個人の年間サマリーを表示
個人の年間サマリーを閲覧できる方(手配担当者以上)は、マイスケジュール画面をスクロールした一番下でも、その人の年間の稼働状況・備考欄をそのまま確認できるようになりました。', datetime('now')
  FROM chat_rooms WHERE type='notice' AND ref_key='handler';

INSERT INTO chat_messages(room_id, sender_id, sender_name, guest_id, body, ts)
  SELECT id, NULL, 'お知らせ', NULL, '【v10】アップデートのお知らせ

◆ マイスケジュールで表示する年月を直接選べるように
月の見出し部分をタップすると、カレンダーから年月を直接選んで一気に移動できるようになりました(◀▶ボタンでの1ヶ月ずつの移動も引き続き使えます)。', datetime('now')
  FROM chat_rooms WHERE type='notice' AND ref_key='all';

INSERT INTO chat_messages(room_id, sender_id, sender_name, guest_id, body, ts)
  SELECT id, NULL, 'お知らせ', NULL, '【v11】アップデートのお知らせ

◆ アプリ構造ビューアを追加
このアプリの画面・API・DB・権限モデルの全体構造を確認できる開発者向け診断画面「アプリ構造ビューア」を追加しました(管理者専用)。DBテーブルの構造は都度実際のデータベースから取得するため、常に本番の実態が反映されます。', datetime('now')
  FROM chat_rooms WHERE type='notice' AND ref_key='admin';

INSERT INTO chat_messages(room_id, sender_id, sender_name, guest_id, body, ts)
  SELECT id, NULL, 'お知らせ', NULL, '【v12】アップデートのお知らせ

◆ ダークモードに対応
ドロワーメニュー最下部の「ダークモードに切替」から、アプリ全体を暗い配色に切り替えられるようになりました。設定は端末ごとに保存され、次回以降も自動で適用されます。

◆ 現場名・会場を一覧から選べるように
現場変更の報告・承認や、手配チームのスケジュール入力で、現場名の隣の虫めがねボタンから公演一覧を、会場の隣から会場一覧を検索して選べるようになりました。選ばずに直接入力する使い方もこれまで通りできます。

◆ モーダルをキーボードだけで操作できるように
入力・確認用のポップアップ画面で、Enterキーで決定・Escapeキーで閉じる・Tabキーで画面内の項目だけを巡回する、といった操作がキーボードだけでできるようになりました(Windows/Mac共通)。

◆ システム管理メニューを1クリックで開けるように
これまで「システム管理」を開いてから個別の画面を選ぶ2段階の操作が必要でしたが、ドロワーメニューからその場で開く一覧に変わり、1クリックで各画面へ移動できるようになりました。

◆ ダッシュボードの「気になる人」から直接絞り込めるように
ダッシュボードの「気になる人」カードをタップすると、稼働サマリーの該当する絞り込み条件が最初から適用された状態で開くようになりました。', datetime('now')
  FROM chat_rooms WHERE type='notice' AND ref_key='admin';

INSERT INTO chat_messages(room_id, sender_id, sender_name, guest_id, body, ts)
  SELECT id, NULL, 'お知らせ', NULL, '【v13】アップデートのお知らせ

◆ チャットを追加
メニューの「チャット」から、全員が参加する全体チャットでやり取りできるようになりました。未読があるとメニューに件数が表示されます。現場ごと・手配ごと・課ごとのグループチャットや個人チャットは今後追加予定です。', datetime('now')
  FROM chat_rooms WHERE type='notice' AND ref_key='all';

INSERT INTO chat_messages(room_id, sender_id, sender_name, guest_id, body, ts)
  SELECT id, NULL, 'お知らせ', NULL, '【v13】アップデートのお知らせ

◆ 現場詳細に「新人」ボタンを追加
現場一覧で現場を開くと出てくる「新人」ボタンから、その現場の台帳の取り込みで見つかった、まだアプリに登録されていない新人を確認できるようになりました。「評価する」で軽い評価を記録すると、「新人報告する」ボタンから候補者名・所感・点数を入力済みの状態で新人報告フォームを開けます。

◆ 研修未受講リストを追加
マナー研修・チーム研修(2部)・ステージアップ研修(SU)ごとに、まだ受講していない人を一覧で確認できるようになりました(メニューの「メンバー」から)。', datetime('now')
  FROM chat_rooms WHERE type='notice' AND ref_key='chief';
