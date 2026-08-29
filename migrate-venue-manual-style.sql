-- 会場マニュアル本文の自由配置キャンバスに、文字装飾(サイズ・色・太字等)・図形(四角/円/線/矢印。
-- 塗り色・線色)・簡易表(行×列のグリッド)を追加するための拡張(2026年8月)。
-- style列(JSON文字列)にtype別の見た目設定を保持する。妥当性はサーバー側sanitizeStyle()で検証する。
-- typeには新たに'shape'(図形)・'table'(表)が加わる('table'のcontentは行列データのJSON)。
ALTER TABLE venue_manual_blocks ADD COLUMN style TEXT DEFAULT '{}';
