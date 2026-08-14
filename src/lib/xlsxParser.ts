// xlsx(zipで圧縮されたOffice Open XML)を、外部ライブラリなしでバイト列から直接パースする層。
// src/index.js の巨大化を緩和するため、DB(env)に一切依存しない純粋な「バイト列 → シート内容」の
// 変換ロジックだけをこのファイルに切り出した(2026年8月、バックエンド部分TypeScript化の第一弾)。
// フォーマットC/AB/D固有の業務ルール(現場名・時刻の解釈など)は含まない。それらは
// src/index.js 側の parseFormatC/parseFormatAB/parseFormatD が、ここで作った grid を受け取って行う。

export interface XlsxSheet {
  name: string;
  grid: string[][];
}

export interface ParsedXlsx {
  sheets: XlsxSheet[];
  raw: Uint8Array;
  fileTitle: string;
}

/** "B12" のような列+行参照から、0始まりの列インデックスを求める("B12" → 1) */
export function colToIdx(ref: string): number {
  const m = String(ref).match(/^([A-Z]+)/);
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function unescapeXml(s: string): string {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, '&');
}

export function parseSharedStrings(xml: string): string[] {
  const arr: string[] = [];
  for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let s = '';
    for (const t of si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) s += t[1];
    arr.push(unescapeXml(s));
  }
  return arr;
}

export function parseSheetXml(xml: string, sst: string[]): string[][] {
  const grid: string[][] = [];
  for (const rowm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowAttrs = rowm[1] || '';
    const rowContent = rowm[2] || '';
    // Excelは完全に空の行のXMLタグ自体を省略することがある。単純に<row>の出現順で
    // grid配列に詰めると、その分だけ以降の全ての行が1行以上ズレてしまう
    // (=年月・ヘッダー行の位置がタブごとに不揃いになり、正しく取り込めない原因になっていた)。
    // 必ずrow自身のr属性(実際の行番号、1始まり)を読み、その位置に配置する。
    const rNum = (rowAttrs.match(/r="(\d+)"/) || [])[1];
    const ri = rNum ? (parseInt(rNum, 10) - 1) : grid.length;

    const cells: string[] = [];
    for (const cm of rowContent.matchAll(/<c\b([^>]*?)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cm[1] || cm[2] || '';
      const inner = cm[3] || '';
      const rref = (attrs.match(/r="([A-Z]+\d+)"/) || [])[1] || '';
      const ci = rref ? colToIdx(rref) : cells.length;
      const t = (attrs.match(/t="([^"]+)"/) || [])[1] || '';
      let val = '';
      const vm = inner.match(/<v>([\s\S]*?)<\/v>/);
      const isuf = inner.match(/<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/);
      if (t === 's' && vm) val = sst[+vm[1]] || '';
      else if (t === 'inlineStr' && isuf) val = unescapeXml(isuf[1]);
      else if (vm) val = unescapeXml(vm[1]);
      while (cells.length < ci) cells.push('');
      cells[ci] = val;
    }
    while (grid.length < ri) grid.push([]);
    grid[ri] = cells;
  }
  return grid;
}

/** 最小限のZIP展開(method 0=store, 8=deflate)。DecompressionStreamでinflate。 */
export async function unzip(buf: Uint8Array): Promise<Record<string, Uint8Array>> {
  const files: Record<string, Uint8Array> = {};
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // End of Central Directory を末尾から探す
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('zip構造が不正');
  const cdOffset = dv.getUint32(eocd + 16, true);
  const cdCount = dv.getUint16(eocd + 10, true);
  let p = cdOffset;
  for (let n = 0; n < cdCount; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const lhOffset = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
    // ローカルヘッダから実データ開始位置
    const lhNameLen = dv.getUint16(lhOffset + 26, true);
    const lhExtraLen = dv.getUint16(lhOffset + 28, true);
    const dataStart = lhOffset + 30 + lhNameLen + lhExtraLen;
    const comp = buf.subarray(dataStart, dataStart + compSize);
    if (/(sharedStrings|workbook)\.xml$|worksheets\/sheet\d+\.xml$|workbook\.xml\.rels$|docProps\/core\.xml$/.test(name)) {
      files[name] = method === 0 ? comp : await inflateRaw(comp);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

export async function inflateRaw(comp: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Response(comp).body!.pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// xlsxのバイナリデータ(Uint8Array)から、シート情報を抽出する共通ロジック。
// Googleスプレッドシートのエクスポート(fetchXlsxSheets)、ユーザーが直接アップロードした
// Excelファイル(台帳Excel取込)の両方から共通で呼ばれる。
export async function parseXlsxBuffer(buf: Uint8Array, headerTitle: string): Promise<ParsedXlsx> {
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) {
    throw new Error('xlsxファイルとして認識できませんでした(拡張子やファイル形式をご確認ください)');
  }
  const files = await unzip(buf);
  // 共有文字列
  const sstXml = files['xl/sharedStrings.xml'] ? new TextDecoder().decode(files['xl/sharedStrings.xml']) : '';
  const sst = parseSharedStrings(sstXml);
  // workbook.xml でシート名と r:id、_rels で r:id→ファイル名 の対応を取る
  const wbXml = files['xl/workbook.xml'] ? new TextDecoder().decode(files['xl/workbook.xml']) : '';
  const relsXml = files['xl/_rels/workbook.xml.rels'] ? new TextDecoder().decode(files['xl/_rels/workbook.xml.rels']) : '';
  const relMap: Record<string, string> = {};
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*\/?>/g)) {
    const tag = m[0];
    const id2 = (tag.match(/Id="([^"]+)"/) || [])[1];
    const target = (tag.match(/Target="([^"]+)"/) || [])[1];
    if (id2 && target) relMap[id2] = target;
  }
  const norm = (t: string | undefined): string => {
    if (!t) return '';
    let s = t.replace(/^\//, '');
    if (s.startsWith('xl/')) return s;
    return 'xl/' + s;
  };
  const sheets: XlsxSheet[] = [];
  for (const m of wbXml.matchAll(/<sheet\b[^>]*\/?>/g)) {
    const tag = m[0];
    const name = (tag.match(/name="([^"]+)"/) || [])[1];
    const rid = (tag.match(/r:id="([^"]+)"/) || [])[1];
    if (!name || !rid) continue;
    const key = norm(relMap[rid]);
    const xml = files[key];
    if (xml) sheets.push({ name: unescapeXml(name), grid: parseSheetXml(new TextDecoder().decode(xml), sst) });
  }
  // ファイルタイトル(Driveのファイル名がそのまま入る。例:「6/30(火)_BP現場台帳」)。
  // レスポンスヘッダー(Content-Disposition)から取れればそれを優先し、
  // 取れなければ docProps/core.xml の dc:title を予備として使う。
  const coreXml = files['docProps/core.xml'] ? new TextDecoder().decode(files['docProps/core.xml']) : '';
  const titleMatch = coreXml.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/);
  const coreTitle = titleMatch ? unescapeXml(titleMatch[1]) : '';
  const fileTitle = headerTitle || coreTitle || '';
  return { sheets, raw: buf, fileTitle };   // raw = 元xlsxバイト列(R2保管用)
}
