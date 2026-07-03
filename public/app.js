/* RB事業2課 スケジュール管理 SPA */
'use strict';
const $ = s => document.querySelector(s);
const h = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
const WD = ['日','月','火','水','木','金','土'];
const ROLE_JP = { admin:'チーフ(管理者)', handler:'チーフ(手配者)', chief:'チーフ', member:'メンツ' };
function roleLabel(u){ if(u && u.suspended) return (u.role==='member'?'メンツ':'チーフ')+'(アカウント停止)'; return ROLE_JP[u.role]||u.role; }
const LV = { member:0, chief:1, handler:2, admin:3 };
// 個別追加権限の基準レベル(バックエンドのPERMSと対応)
const PERM_BASE_LV = { report_check:1, blacklist_manage:1, site_pay:2, site_manage:2, import_data:2, handler_tools:2, wage_settings:3, account_manage:3, daicho_manage:3 };
// has(key): MEがその機能を使えるか(基本権限を満たす、または個別に追加権限がある)
function has(key){
  if(!ME) return false;
  const base = PERM_BASE_LV[key] ?? 99;
  if((LV[ME.role] ?? 0) >= base) return true;
  return Array.isArray(ME.extra_perms) && ME.extra_perms.includes(key);
}
const yen = n => '¥' + Number(n||0).toLocaleString();
const jstToday = () => new Date(Date.now()+9*3600e3).toISOString().slice(0,10);
// 権限不足・存在しないページの共通表示(機能名を一切見せない)
function notFound(app){ app.innerHTML = '<div class="card" style="text-align:center;padding:40px"><h2 style="border:none">ページが見つかりません</h2><div class="muted">お探しのページは存在しないか、移動した可能性があります。</div><div style="margin-top:16px"><a href="#/schedule" class="btn gold">マイスケジュールへ戻る</a></div></div>'; }

let TOKEN = localStorage.getItem('tk') || '';
let ME = null;
let MONTH = new Date(Date.now()+9*3600e3).toISOString().slice(0,7);
// ページ遷移をまたいで保持したいフィルタ・タブ・検索語などの状態。
// #app要素はページ遷移のたびに作り直されるため、そこに状態を持たせると戻った時に消えてしまう。
// このオブジェクトはセッション中ずっと保持されるので、ここに保存する。
const PAGE_STATE = {};
// 検索欄などで、入力のたびに画面を再描画すると(内容によっては入力欄ごと作り直されるため)
// スマホでソフトウェアキーボードが閉じてしまう。入力が止まってから実行することでこれを防ぐ。
function debounce(fn, wait=350){
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(()=>fn(...args), wait); };
}
// setIntervalなどで動的に再描画される領域は、renderのグローバル自動ワイヤリングの対象外になるため、
// 個別にこの関数を呼んでname-linkを有効化する。
function wireNameLinks(container){
  if(!container) return;
  container.querySelectorAll('.name-link[data-goto-uid]').forEach(el => {
    el.onclick = (e) => { e.stopPropagation(); location.hash = '#/schedule/' + el.dataset.gotoUid; };
  });
}
// ドロワー(左メニュー)を閉じる際、スライドアウト+フェードアウトのアニメーションを再生してから
// 中身を空にする(即座に消すとカクついて見えるため)。
function closeDrawerAnimated(dr){
  if(!dr) return;
  const bg = dr.querySelector('.drawer-bg');
  const nav = dr.querySelector('.drawer');
  if(!bg && !nav){ dr.innerHTML=''; return; }
  if(bg) bg.classList.add('closing');
  if(nav) nav.classList.add('closing');
  setTimeout(() => { dr.innerHTML=''; }, 180);
}
// 全データ閲覧(システム設定): テーブル表示・ソート・フィルタ・CSVダウンロードの状態
const DV_STATE = { rows:[], cols:[], sortCol:null, sortDir:1, filters:{}, tableName:'' };
function renderDvTable(){
  const { cols, tableName } = DV_STATE;
  const out = $('#dv-out'); if(!out) return;
  out.innerHTML = `
    <div class="row" style="margin-bottom:8px;gap:8px;align-items:center">
      <span class="muted" id="dv-summary"></span>
      <button class="btn ghost xs" id="dv-clear-filter" style="display:none">絞り込み解除</button>
      <button class="btn ghost xs" id="dv-export">📥 Excel(CSV)でダウンロード</button>
    </div>
    <div class="sched-wrap"><table class="list dv-table">
      <thead>
        <tr>${cols.map(c=>`<th class="dv-th" data-col="${h(c)}" style="cursor:pointer;white-space:nowrap">${h(c)} <span class="dv-sort-mark muted" data-col="${h(c)}">⇅</span></th>`).join('')}</tr>
        <tr class="dv-filter-row">${cols.map(c=>`<td><input class="dv-filter" data-col="${h(c)}" placeholder="絞り込み" style="width:100%;font-size:11px;box-sizing:border-box"></td>`).join('')}</tr>
      </thead>
      <tbody id="dv-tbody"></tbody>
    </table></div>`;
  out.querySelectorAll('.dv-th').forEach(th => th.onclick = () => {
    const c = th.dataset.col;
    if(DV_STATE.sortCol === c) DV_STATE.sortDir *= -1;
    else { DV_STATE.sortCol = c; DV_STATE.sortDir = 1; }
    renderDvBody(); // ソートはtbodyだけ更新すればよい(フィルタ入力欄はそのまま)
  });
  out.querySelectorAll('.dv-filter').forEach(inp => inp.oninput = () => {
    DV_STATE.filters[inp.dataset.col] = inp.value;
    renderDvBody(); // input要素自体には触れないのでキーボードは閉じない
  });
  const cf = $('#dv-clear-filter');
  if(cf) cf.onclick = () => {
    DV_STATE.filters = {};
    out.querySelectorAll('.dv-filter').forEach(inp => inp.value = '');
    renderDvBody();
  };
  renderDvBody();
}
// 全データ閲覧: フィルタ・ソート結果に応じて<tbody>部分だけを再構築する(フィルタ入力欄はそのまま保持)
function renderDvBody(){
  const { rows, cols, sortCol, sortDir, filters, tableName } = DV_STATE;
  let filtered = rows.filter(r => cols.every(c => !filters[c] || String(r[c]??'').toLowerCase().includes(filters[c].toLowerCase())));
  if(sortCol){
    filtered = [...filtered].sort((a,b) => {
      const av = a[sortCol], bv = b[sortCol];
      if(av == null && bv == null) return 0;
      if(av == null) return -1*sortDir; if(bv == null) return 1*sortDir;
      if(av!=='' && bv!=='' && !isNaN(av) && !isNaN(bv)) return (Number(av)-Number(bv))*sortDir;
      return String(av).localeCompare(String(bv), 'ja') * sortDir;
    });
  }
  const tbody = $('#dv-tbody'); if(!tbody) return;
  tbody.innerHTML = filtered.map(r=>`<tr>${cols.map(c=>`<td>${h(r[c])}</td>`).join('')}</tr>`).join('');
  const hasFilter = Object.values(filters).some(v=>v);
  const summary = $('#dv-summary'); if(summary) summary.textContent = `${filtered.length}件 / 全${rows.length}件${hasFilter?' (絞り込み中)':''}`;
  const cf = $('#dv-clear-filter'); if(cf) cf.style.display = hasFilter ? '' : 'none';
  document.querySelectorAll('.dv-sort-mark').forEach(m => { m.textContent = m.dataset.col===sortCol ? (sortDir===1?'▲':'▼') : '⇅'; });
  const exp = $('#dv-export'); if(exp) exp.onclick = () => exportRowsToCsv(filtered, cols, tableName);
}
// テーブルデータをCSV(Excelで直接開ける形式)としてダウンロードする
function exportRowsToCsv(rows, cols, tableName){
  const esc = v => { const s = String(v??''); return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; };
  const lines = [cols.map(esc).join(',')].concat(rows.map(r => cols.map(c=>esc(r[c])).join(',')));
  const csv = '\uFEFF' + lines.join('\r\n'); // BOM付きでExcelでの文字化けを防ぐ
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${tableName || 'data'}_${jstToday()}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
let USERS_CACHE = null;
let LOCK_DAYS = 14;   // 給与確定ロック日数(管理者設定。render時にサーバーから取得)
let timers = [];

async function api(path, opt = {}) {
  const res = await fetch('/api' + path, {
    method: opt.method || 'GET',
    headers: { 'content-type':'application/json', ...(TOKEN ? { authorization:'Bearer '+TOKEN } : {}) },
    body: opt.body ? JSON.stringify(opt.body) : undefined
  });
  const d = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') { logoutLocal(); throw new Error(d.error || '再ログインしてください'); }
  if (!res.ok) throw new Error(d.error || 'エラーが発生しました');
  return d;
}
function logoutLocal(){ TOKEN=''; ME=null; localStorage.removeItem('tk'); location.hash='#/login'; render(); }
function clearTimers(){ timers.forEach(clearInterval); timers=[]; }
function shiftMonth(m, d){ const [y,mm]=m.split('-').map(Number); const dt=new Date(y, mm-1+d, 1); return dt.getFullYear()+'-'+pad(dt.getMonth()+1); }
async function getUsers(force){ if(!USERS_CACHE||force) USERS_CACHE = await api('/users'); return USERS_CACHE; }

// 認証ヘッダ付きでファイルを取得しブラウザにダウンロードさせる
async function downloadFile(path, filename){
  const res = await fetch('/api'+path, { headers: TOKEN ? { authorization:'Bearer '+TOKEN } : {} });
  if(!res.ok){ const d=await res.json().catch(()=>({})); throw new Error(d.error || 'ダウンロードに失敗しました'); }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=filename||'download'; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 1000);
}

/* ===== モーダル ===== */
function modal(html){
  $('#modal-layer').innerHTML = `<div class="modal-bg"><div class="modal"><button class="close-x">✕</button>${html}</div></div>`;
  $('#modal-layer .close-x').onclick = closeModal;
  $('#modal-layer .modal-bg').onclick = e => { if(e.target.classList.contains('modal-bg')) closeModal(); };
}
// モーダルを閉じる際、フェードアウト+スケールダウンのアニメーションを再生してから中身を空にする
function closeModal(){
  const layer = $('#modal-layer');
  if(!layer) return;
  const bg = layer.querySelector('.modal-bg');
  const box = layer.querySelector('.modal');
  if(!bg && !box){ layer.innerHTML=''; return; }
  if(bg) bg.classList.add('closing');
  if(box) box.classList.add('closing');
  setTimeout(() => { layer.innerHTML=''; }, 160);
}

// 保存・更新などの完了をOKボタン付きポップアップで知らせる
function popup(message, kind){
  const icon = kind==='error' ? '⚠️' : '✅';
  const color = kind==='error' ? '#b23b3b' : '#1c7a45';
  $('#modal-layer').innerHTML = `<div class="modal-bg"><div class="modal popup-modal">
    <div class="popup-icon" style="color:${color}">${icon}</div>
    <div class="popup-msg">${h(message)}</div>
    <button class="btn gold" id="popup-ok" style="width:100%;margin-top:14px">OK</button>
  </div></div>`;
  const ok = $('#popup-ok');
  ok.focus();
  ok.onclick = closeModal;
  $('#modal-layer .modal-bg').onclick = e => { if(e.target.classList.contains('modal-bg')) closeModal(); };
}

// コンフリクト検知の確認モーダル。block(ダブルブッキング)がある場合に表示。
// 「強行して保存」=true / 「キャンセル」=false を返す Promise
// 警告(warn)件数を完了メッセージに付記
function withWarnNote(msg, r){ const w=((r&&r.conflicts)||[]).filter(c=>c.level==='warn'); return w.length ? `${msg}(注意:同日複数現場 ${w.length}件)` : msg; }
// 一括登録の保存。block(時間重複)があれば確認 → 強行時に再送して合算。キャンセルは null
async function bulkSaveWithConflicts(body){
  const r = await api('/schedule-bulk', { method:'PUT', body });
  if((r.conflicts||[]).some(c=>c.level==='block')){
    if(!(await conflictModal(r.conflicts))) return null;
    const r2 = await api('/schedule-bulk', { method:'PUT', body:{ ...body, force:true } });
    r2.added = (r.added||0) + (r2.added||0);
    return r2;
  }
  return r;
}
function conflictLine(c){
  if(c.kind==='overlap') return `<b>${h(c.name||'')}</b> <span class="cf-date">${h(c.date||'')}</span> 「${h(c.a)}」(${h(c.atime)}) と 「${h(c.b)}」(${h(c.btime)}) の<b>時間が重複</b>しています`;
  if(c.kind==='duplicate') return `<b>${h(c.name||'')}</b> <span class="cf-date">${h(c.date||'')}</span> 「${h(c.site)}」が<b>二重</b>に入っています`;
  if(c.kind==='multi') return `<b>${h(c.name||'')}</b> <span class="cf-date">${h(c.date||'')}</span> 同じ日に <b>${c.count}現場</b>(${(c.sites||[]).map(h).join('・')})`;
  return h(JSON.stringify(c));
}
function conflictModal(conflicts){
  return new Promise(resolve=>{
    const block = conflicts.filter(c=>c.level==='block');
    const warn = conflicts.filter(c=>c.level==='warn');
    const lay = document.createElement('div');
    lay.className = 'cf-layer';
    lay.innerHTML = `<div class="cf-box">
      <div class="cf-title">⚠️ コンフリクトを検知しました</div>
      ${block.length?`<div class="cf-sec"><div class="cf-h block">このまま保存するとダブルブッキングになります(${block.length}件)</div>${block.map(c=>`<div class="cf-row block">${conflictLine(c)}</div>`).join('')}</div>`:''}
      ${warn.length?`<div class="cf-sec"><div class="cf-h warn">念のため確認(${warn.length}件)</div>${warn.map(c=>`<div class="cf-row warn">${conflictLine(c)}</div>`).join('')}</div>`:''}
      <div class="cf-actions">
        <button class="btn ghost" id="cf-cancel">修正する</button>
        <button class="btn ${block.length?'danger':'gold'}" id="cf-force">${block.length?'承知のうえ強行保存':'このまま保存'}</button>
      </div></div>`;
    document.body.appendChild(lay);
    const done = v => { lay.remove(); resolve(v); };
    lay.querySelector('#cf-cancel').onclick = () => done(false);
    lay.querySelector('#cf-force').onclick = () => done(true);
    lay.addEventListener('click', e => { if(e.target===lay) done(false); });
  });
}

// 手配者モードのPIN入力(prompt()はスマホで不安定なため自前モーダル)
function openHandlerPin(){
  modal(`<h3>手配者モードに切り替え</h3>
    <div class="muted" style="margin-bottom:10px">手配者専用パスワード(PIN)を入力してください。</div>
    <input id="hp-pin" type="tel" inputmode="numeric" autocomplete="off" placeholder="PIN" style="width:100%;font-size:18px;letter-spacing:4px;text-align:center;padding:12px">
    <div id="hp-err"></div>
    <div class="row" style="margin-top:14px"><button class="btn gold" id="hp-go" style="flex:1">切り替える</button></div>`);
  const pin = $('#hp-pin'); if(pin) pin.focus();
  const go = async () => {
    const v = $('#hp-pin').value.trim();
    if(!v){ $('#hp-err').innerHTML='<div class="msg err">PINを入力してください</div>'; return; }
    try{
      await api('/handler-mode',{method:'POST',body:{pin:v}});
      ME.handler=1; closeModal(); location.hash='#/edit'; render();
    }catch(e){ $('#hp-err').innerHTML=`<div class="msg err">${h(e.message)}</div>`; }
  };
  $('#hp-go').onclick = go;
  $('#hp-pin').onkeydown = e => { if(e.key==='Enter') go(); };
}

// 現場情報モーダル(チーフ以上が閲覧、手配担当以上はメンバー追加・一括編集可)
async function openSiteModal(date, site){
  const canPay = LV[ME.role] >= 2;
  const canAdd = ME.handler === 1; // 手配者モードのときメンバー追加・編集可
  const canViewSched = LV[ME.role] >= 1; // 名前タップでスケジュールへ遷移できるか(チーフ以上)
  const list = await api(`/site-members?date=${date}&site=${encodeURIComponent(site)}`);
  // 休憩時間の合計(チーフ以上に公開。6h超45分/8h超60分の目安に届いていない場合だけ軽く表示)
  const breaksArr = canViewSched ? await api(`/site-record-breaks?date=${date}&site=${encodeURIComponent(site)}`).catch(()=>[]) : [];
  const breakByUid = {}; breaksArr.forEach(b => breakByUid[b.uid] = b);
  const venue = (list.find(p => p.venue) || {}).venue || '';
  const chiefs = list.filter(p => p.role !== 'member');
  const members = list.filter(p => p.role === 'member');
  const kaTag = p => p.ka ? `<span class="ka-pill ka-${p.ka==='1課'?'1':'2'}">${p.ka}</span>` : '';
  const editable = canAdd; // 手配者モードなら個人編集可
  const nameHtml = p => canViewSched ? `<span class="name-link" data-goto-uid="${p.uid}">${h(p.name)}</span>` : h(p.name);
  const breakHtml = p => {
    const b = breakByUid[p.uid];
    if(!b || b.workMinutes <= 0) return '';
    const cls = b.short ? 'break-short' : 'break-ok';
    const label = b.short ? `休憩${b.breakMinutes}分(目安${b.requiredMinutes}分未満)` : `休憩${b.breakMinutes}分`;
    return `<span class="break-tag ${cls}">${b.short?'⚠️ ':''}${label}</span>`;
  };
  const card = p => `<div class="dcard ka-${p.ka==='1課'?'1':'2'} ${editable?'sm-edit':''}" ${editable?`data-uid="${p.uid}"`:''}>
    <div class="dcard-head"><span class="dcard-title">${nameHtml(p)} ${kaTag(p)}</span><span class="tag ${p.role}">${roleLabel(p)}</span></div>
    <div class="drow"><span class="dk">ランク/班</span><span class="dv">${h(p.rank)||'—'} / ${h(p.han)||'—'}</span></div>
    ${canPay&&(p.tin||p.tout)?`<div class="drow"><span class="dk">IN/OUT</span><span class="dv">${h(p.tin)}〜${h(p.tout)}</span></div>`:''}
    ${breakHtml(p)?`<div class="drow"><span class="dk">休憩</span><span class="dv">${breakHtml(p)}</span></div>`:''}
    ${p.note?`<div class="drow"><span class="dk">備考</span><span class="dv">${h(p.note)}</span></div>`:''}
    ${editable?'<div class="sm-edit-hint">タップして編集 ✏️</div>':''}
  </div>`;
  const row = p => `<tr class="ka-row-${p.ka==='1課'?'1':'2'} ${editable?'sm-edit':''}" ${editable?`data-uid="${p.uid}"`:''}><td>${nameHtml(p)} ${kaTag(p)}</td><td><span class="tag ${p.role}">${roleLabel(p)}</span></td><td>${h(p.rank)}</td><td>${h(p.han)}</td>${canPay?`<td>${h(p.tin)}</td><td>${h(p.tout)}</td>`:''}<td>${breakHtml(p)||''}</td><td>${h(p.note)}</td>${editable?'<td class="sm-edit-cell">✏️</td>':''}</tr>`;
  const tbl = arr => `<table class="list pc-only"><tr><th>氏名</th><th>役割</th><th>ランク</th><th>班</th>${canPay?'<th>IN</th><th>OUT</th>':''}<th>休憩</th><th>備考</th>${editable?'<th></th>':''}</tr>${arr.map(row).join('')}</table>
    <div class="cards sp-only">${arr.map(card).join('')}</div>`;
  modal(`<h3>現場情報</h3>
    <dl class="kv">
      <dt>現場名</dt><dd><b>${h(site)}</b></dd>
      <dt>会場</dt><dd>${venue ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}" target="_blank">${h(venue)}</a>` : '<span class="muted">未登録</span>'}</dd>
      <dt>日付</dt><dd>${h(date)}</dd>
      <dt>人数</dt><dd>チーフ・手配 ${chiefs.length}名 / メンツ ${members.length}名(計${list.length}名)</dd>
    </dl>
    ${list.length ? `
      <div class="section-label" style="margin-top:6px">チーフ・手配チーム</div>
      ${chiefs.length ? tbl(chiefs) : '<div class="muted" style="padding:4px 2px">登録されていません</div>'}
      <div class="section-label" style="margin-top:12px">メンツ</div>
      ${members.length ? tbl(members) : '<div class="muted" style="padding:4px 2px">登録されていません</div>'}
    ` : '<div class="muted">この日・この現場に入っているメンバーはいません</div>'}
    ${canAdd && list.length ? `<div class="muted" style="margin-top:8px;font-size:12px">💡 氏名をタップするとスケジュールに移動、それ以外の部分をタップするとIN/OUT・業務名などを編集できます。</div>` : (canViewSched && list.length ? `<div class="muted" style="margin-top:8px;font-size:12px">💡 氏名をタップすると、その人のスケジュールに移動します。</div>` : '')}
    ${canAdd ? `<div id="site-add-wrap" style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn gold" id="site-add-btn">＋ メンバーを追加</button>
      ${list.length?`<button class="btn ghost" id="site-edit-btn">✏️ 全員まとめて一括編集</button>`:''}
    </div>` : ''}`);
  // 氏名タップ → スケジュールへ遷移(編集モーダルより優先。行/カード全体のクリックとは独立させる)
  if(canViewSched){
    document.querySelectorAll('#modal-layer .name-link[data-goto-uid]').forEach(el => {
      el.onclick = (e) => {
        e.stopPropagation();
        closeModal();
        location.hash = '#/schedule/' + el.dataset.gotoUid;
      };
    });
  }
  if(canAdd){
    $('#site-add-btn').onclick = () => openSiteAdd(date, site, venue, (list.find(p=>p.tin)||{}).tin || '', (list.find(p=>p.tout)||{}).tout || '');
    const eb = $('#site-edit-btn');
    if(eb) eb.onclick = () => openSiteBulkEdit(date, site, venue, list);
    // 各メンバー行/カードをタップ → 個人のその日の編集モーダルへ(氏名タップ時は上のハンドラでstopPropagation済み)
    const byUid = {}; list.forEach(p => byUid[p.uid] = p);
    document.querySelectorAll('.sm-edit[data-uid]').forEach(el => {
      el.style.cursor = 'pointer';
      el.onclick = () => {
        const uid = Number(el.dataset.uid);
        const p = byUid[uid];
        if(!p) return;
        openMemberDayEdit(uid, { name:p.name, role:p.role, rank:p.rank, ka:p.ka, han:p.han }, date);
      };
    });
  }
}

// 現場記録(配置・休憩時間・自由記入欄)。本人と管理者のみ閲覧・編集可。育成計画・備考もあわせて表示。
async function openSiteRecord(uid, uname, date, site){
  let data;
  try{ data = await api(`/site-record?uid=${uid}&date=${date}&site=${encodeURIComponent(site)}`); }
  catch(e){ popup(e.message,'error'); return; }

  const breakRow = (b={}, i=0) => `<div class="sr-break" data-i="${i}">
    <input type="time" class="sr-break-start" value="${h(b.start||'')}">
    <span>〜</span>
    <input type="time" class="sr-break-end" value="${h(b.end||'')}">
    <button class="btn ghost xs sr-break-del" type="button">✕</button>
  </div>`;

  modal(`<h3>現場記録</h3>
    <div class="muted" style="margin-bottom:10px">${h(uname)} さん / ${h(date)} / ${h(site)}</div>
    ${data.plan ? `<div class="sr-info"><b>育成計画</b><div>${h(data.plan)}</div></div>` : ''}
    ${data.note ? `<div class="sr-info"><b>備考</b><div>${h(data.note)}</div></div>` : ''}
    <div class="form-grid" style="grid-template-columns:80px 1fr;margin-top:10px">
      <label>配置</label><input id="sr-placement" value="${h(data.placement)}" placeholder="例:入口案内">
    </div>
    <div style="margin-top:12px">
      <label style="font-weight:700;font-size:13px">休憩時間 <span class="muted" id="sr-break-total">(合計 ${data.breakMinutes}分)</span></label>
      <div id="sr-breaks" style="margin-top:6px">${(data.breaks.length?data.breaks:[{}]).map((b,i)=>breakRow(b,i)).join('')}</div>
      <button class="btn ghost xs" id="sr-break-add" type="button" style="margin-top:6px">＋ 休憩を追加</button>
    </div>
    <div style="margin-top:12px">
      <label style="font-weight:700;font-size:13px">自由記入欄</label>
      <textarea id="sr-memo" style="width:100%;min-height:110px;margin-top:6px;box-sizing:border-box">${h(data.memo)}</textarea>
    </div>
    <div class="row" style="margin-top:14px">
      <button class="btn gold" id="sr-save" style="flex:1">保存する</button>
    </div>
    <div class="muted" style="margin-top:8px">この記録は本人と管理者だけが閲覧できます。休憩時間の合計は現場一覧でチーフ以上に表示されます(勤務時間に対して不足がないかの目安として)。</div>`);

  let idx = data.breaks.length || 1;
  const recalcTotal = () => {
    let total = 0;
    document.querySelectorAll('.sr-break').forEach(row => {
      const s = row.querySelector('.sr-break-start').value;
      const e = row.querySelector('.sr-break-end').value;
      if(s && e){
        const [sh,sm] = s.split(':').map(Number), [eh,em] = e.split(':').map(Number);
        let diff = (eh*60+em) - (sh*60+sm);
        if(diff < 0) diff += 1440;
        total += diff;
      }
    });
    const el = $('#sr-break-total');
    if(el) el.textContent = `(合計 ${total}分)`;
  };
  const bind = () => {
    document.querySelectorAll('.sr-break-del').forEach(b => b.onclick = () => {
      const rows = document.querySelectorAll('.sr-break');
      if(rows.length<=1){ b.closest('.sr-break').querySelectorAll('input').forEach(i=>i.value=''); recalcTotal(); return; }
      b.closest('.sr-break').remove();
      recalcTotal();
    });
    document.querySelectorAll('.sr-break-start, .sr-break-end').forEach(i => i.oninput = recalcTotal);
  };
  bind();
  $('#sr-break-add').onclick = () => {
    const div = document.createElement('div');
    div.innerHTML = breakRow({}, idx++);
    $('#sr-breaks').appendChild(div.firstElementChild);
    bind();
  };
  $('#sr-save').onclick = async () => {
    const breaks = [];
    document.querySelectorAll('.sr-break').forEach(row => {
      const s = row.querySelector('.sr-break-start').value;
      const e = row.querySelector('.sr-break-end').value;
      if(s || e) breaks.push({start:s, end:e});
    });
    try{
      await api('/site-record', { method:'PUT', body:{ uid, date, site, placement: $('#sr-placement').value, breaks, memo: $('#sr-memo').value } });
      closeModal(); popup('現場記録を保存しました');
    }catch(e){ popup(e.message,'error'); }
  };
}

// 現場の既存メンバーを一括編集(IN/OUT/会場/備考をまとめて変更、個別に外す)
async function openSiteBulkEdit(date, site, venue, list){
  const def = { tin:(list.find(p=>p.tin)||{}).tin||'', tout:(list.find(p=>p.tout)||{}).tout||'' };
  modal(`<h3>既存メンバーを一括編集</h3>
    <div class="muted" style="margin-bottom:8px"><b>${h(site)}</b>${venue?` / ${h(venue)}`:''} / ${h(date)}</div>
    <div class="be-note muted" style="margin-bottom:10px">空欄の項目は変更しません。チェックを外した人はこの現場から削除します。</div>
    <div class="form-grid" style="grid-template-columns:70px 1fr;max-width:420px">
      <label>現場名</label><input id="be-site" value="${h(site)}" placeholder="変更する場合のみ">
      <label>会場</label><input id="be-venue" value="${h(venue)}" placeholder="変更する場合のみ">
      <label>IN</label><input id="be-in" value="${h(def.tin)}" placeholder="例:9:00(全員に適用)">
      <label>OUT</label><input id="be-out" value="${h(def.tout)}" placeholder="例:18:00(全員に適用)">
    </div>
    <div class="section-label" style="margin-top:12px">対象メンバー(${list.length}名)</div>
    <div id="be-list" style="max-height:46vh;overflow:auto;margin-top:6px">
      ${list.map((p,i)=>`<label class="be-item ka-${p.ka==='1課'?'1':'2'}" style="display:flex;align-items:center;gap:8px;padding:7px 8px;border:1px solid var(--line);border-radius:8px;margin-bottom:6px">
        <input type="checkbox" class="be-chk" data-uid="${p.uid}" checked>
        <span style="flex:1"><b>${h(p.name)}</b> ${p.ka?`<span class="ka-pill ka-${p.ka==='1課'?'1':'2'}">${p.ka}</span>`:''} <span class="muted">${h(p.rank)} ${h(p.han)}</span></span>
        <span class="muted" style="font-size:12px">${h(p.tin)||'—'}〜${h(p.tout)||'—'}</span>
      </label>`).join('')}
    </div>
    <div class="row" style="margin-top:14px"><button class="btn gold" id="be-save" style="flex:1">変更を保存</button></div>`);
  $('#be-save').onclick = async () => {
    const siteNew=$('#be-site').value.trim();
    const venueNew=$('#be-venue').value.trim(), tin=$('#be-in').value.trim(), tout=$('#be-out').value.trim();
    const keep=[], remove=[];
    document.querySelectorAll('.be-chk').forEach(c=>{ (c.checked?keep:remove).push(Number(c.dataset.uid)); });
    if(!siteNew){ popup('現場名は空にできません','error'); return; }
    try{
      const r = await api('/site-edit',{method:'PUT',body:{ date, site, keepUids:keep, removeUids:remove,
        newSite:siteNew, venue:venueNew, tin, tout }});
      closeModal();
      popup(`${r.updated||0}名を更新${r.removed?` / ${r.removed}名を削除`:''}しました。`);
      if(typeof pageSites==='function' && location.hash.startsWith('#/sites')){ const app=document.getElementById('app'); pageSites(app); }
      else render();
    }catch(e){ popup(e.message,'error'); }
  };
}

// 現場にメンバー追加(一括登録と同じ:複数人・人ごとに複数日)
async function openSiteAdd(date, site, venue, tin, tout){
  const [users, managers] = await Promise.all([getUsers(true), api('/managers')]);
  modal(`<h3>現場にメンバーを追加</h3>
    <div class="muted" style="margin-bottom:8px"><b>${h(site)}</b>${venue?` / ${h(venue)}`:''}</div>
    <div class="form-grid" style="grid-template-columns:70px 1fr">
      <label>IN</label><input id="sa-in" value="${h(tin)}" placeholder="9:00">
      <label>OUT</label><input id="sa-out" value="${h(tout)}" placeholder="18:00">
    </div>
    <div style="margin-top:12px">
      <label class="bulk-label">① メンバーを追加(同じ手配担当だけ)</label>
      <div class="row" style="gap:6px;margin:6px 0">
        <select id="sa-mgr" class="nowrap" style="flex:1"><option value="">▼ 担当手配者</option>
          ${managers.map(m=>`<option value="${m.id}">${h(m.name)}手配(${m.count}名)</option>`).join('')}
          <option value="__none">チーフ手配</option></select>
        <select id="sa-memsel" class="nowrap" style="flex:1"><option value="">担当を選択</option></select>
        <button class="btn ghost sm" id="sa-mem-add">＋追加</button>
      </div>
    </div>
    <div style="margin-top:8px"><label class="bulk-label">② メンバーごとに日付・備考</label>
      <div id="sa-assign" style="margin-top:6px"><div class="muted">メンバーを追加してください</div></div></div>
    <div class="row" style="margin-top:14px"><button class="btn gold" id="sa-save">追加する</button></div>`);
  let asg = [];
  const def1 = date;
  $('#sa-mgr').onchange = () => {
    const mid = $('#sa-mgr').value; let list=[];
    if(mid==='__none') list=users.filter(u=>!u.manager_id);
    else if(mid) list=users.filter(u=>String(u.manager_id)===String(mid));
    $('#sa-memsel').innerHTML = list.length ? '<option value="">メンバー選択</option>'+list.map(u=>`<option value="${u.id}">${h(u.name)}(${h(u.regno)})</option>`).join('') : '<option value="">該当なし</option>';
  };
  const sync = () => { document.querySelectorAll('#sa-assign .bk-note-input').forEach(inp=>{ const ai=Number(inp.dataset.ai); if(asg[ai]) asg[ai].note=inp.value; }); };
  const renderA = () => {
    const box=$('#sa-assign');
    if(!asg.length){ box.innerHTML='<div class="muted">メンバーを追加してください</div>'; return; }
    box.innerHTML = asg.map((a,ai)=>`<div class="bk-person" data-ai="${ai}">
      <div class="bk-person-head"><b>${h(a.name)}</b><span class="bulk-sub">${h(a.regno)}</span><button class="bk-person-del" data-ai="${ai}">削除</button></div>
      <div class="row" style="gap:6px"><input type="date" class="bk-d-input" data-ai="${ai}"><button class="btn ghost xs bk-d-add" data-ai="${ai}">＋日付</button></div>
      <div class="bulk-chips" style="margin-top:6px">${a.dates.map((d,di)=>`<span class="chip">${d}<button data-ai="${ai}" data-di="${di}">✕</button></span>`).join('')||'<span class="muted">日付未選択</span>'}</div>
      <div class="row" style="margin-top:6px"><label style="flex:0 0 44px;font-size:13px;color:#555">備考</label><input class="bk-note-input" data-ai="${ai}" value="${h(a.note)}" placeholder="備考(例:物販頭)" style="flex:1"></div>
    </div>`).join('');
    box.querySelectorAll('.bk-d-add').forEach(btn=>btn.onclick=()=>{ const ai=Number(btn.dataset.ai),inp=box.querySelector(`.bk-d-input[data-ai="${ai}"]`); const v=inp.value; if(!v)return; if(!asg[ai].dates.includes(v)){asg[ai].dates.push(v);asg[ai].dates.sort();} sync(); renderA(); });
    box.querySelectorAll('.chip button').forEach(b=>b.onclick=()=>{ sync(); asg[Number(b.dataset.ai)].dates.splice(Number(b.dataset.di),1); renderA(); });
    box.querySelectorAll('.bk-person-del').forEach(b=>b.onclick=()=>{ sync(); asg.splice(Number(b.dataset.ai),1); renderA(); });
  };
  $('#sa-mem-add').onclick = () => {
    const v=$('#sa-memsel').value; if(!v) return;
    if(asg.some(a=>a.uid===Number(v))){ popup('既に追加されています','error'); return; }
    const u=users.find(x=>x.id===Number(v)); if(!u) return;
    sync(); asg.push({uid:u.id,name:u.name,regno:u.regno,dates:[def1],note:''}); renderA();
  };
  $('#sa-save').onclick = async () => {
    sync();
    const assignments = asg.filter(a=>a.dates.length).map(a=>({uid:a.uid,dates:a.dates,note:a.note}));
    if(!assignments.length){ popup('メンバーと日付を指定してください','error'); return; }
    try{
      const r = await bulkSaveWithConflicts({ assignments, site, venue, tin:$('#sa-in').value.trim(), tout:$('#sa-out').value.trim() });
      if(!r) return;
      popup(withWarnNote(`${r.added}名分を現場に追加しました${r.skipped?`(${r.skipped}件はスキップ)`:''}。`, r));
    }catch(e){ popup(e.message,'error'); }
  };
  renderA();
}

/* ===== ルーティング ===== */
window.addEventListener('hashchange', () => {
  // マイ/他メンバーのスケジュールを開いたときは常に今月から表示(月送りは画面内で行うため hashchange は発火しない)
  if((location.hash||'').startsWith('#/schedule')) MONTH = jstToday().slice(0,7);
  render();
});
window.addEventListener('load', render);

async function render(){
  clearTimers(); closeModal();
  if(!TOKEN){ renderLogin(); return; }
  if(!ME){
    try{ ME = await api('/me'); } catch(e){ renderLogin(e.message); return; }
  }
  // 初期パスワードのまま or 強制変更フラグが立っている場合は、変更するまで他を使えない
  if(ME.must_change){ renderForcedPassword(); return; }
  // 給与ロック日数を取得(手配者以上のみ。表示用の目安。最終判定はサーバー側)
  if(LV[ME.role] >= 2){ try{ const ls = await api('/lock-settings'); if(ls && typeof ls.days==='number') LOCK_DAYS = ls.days; }catch(_){} }
  const hash = location.hash || '#/schedule';
  renderShell(hash);
  const app = $('#app');
  try{
    if(hash.startsWith('#/schedule')) await pageSchedule(app, hash);
    else if(hash === '#/members') await pageMembers(app);
    else if(hash === '#/sites') await pageSites(app);
    else if(hash === '#/summary') await pageSummary(app);
    else if(hash === '#/edit') await pageEdit(app);
    else if(hash === '#/report') pageReportForm(app);
    else if(hash === '#/reports') await pageReports(app);
    else if(hash === '#/draft') await pageDraft(app);
    else if(hash === '#/blacklist') await pageBlacklist(app);
    else if(hash === '#/import') await pageImport(app);
    else if(hash === '#/handler-status') await pageHandlerStatus(app);
    else if(hash === '#/admin') await pageAdmin(app);
    else if(hash === '#/admin-settings') await pageAdminSettings(app);
    else if(hash === '#/daicho') await pageDaicho(app);
    else if(hash === '#/sched-sources') await pageSchedSources(app);
    else if(hash.startsWith('#/permissions/')) await pagePermissions(app, hash);
    else if(hash === '#/role-permissions') await pageRolePermissions(app);
    else if(hash === '#/password') pagePassword(app);
    else { location.hash='#/schedule'; }
  }catch(e){ app.innerHTML = `<div class="msg err">${h(e.message)}</div>`; }
  // 「氏名をタップ→スケジュールへ」を全ページ共通で有効化(各ページが個別にワイヤリングする必要はない)
  app.querySelectorAll('.name-link[data-goto-uid]').forEach(el => {
    if(el.dataset.wired) return; el.dataset.wired = '1';
    el.onclick = (e) => { e.stopPropagation(); location.hash = '#/schedule/' + el.dataset.gotoUid; };
  });
  pollBell();
}

/* ===== ログイン ===== */
function renderLogin(err){
  clearTimers();
  document.getElementById('root').innerHTML = `
  <div class="login-wrap"><div class="login-card">
    <h1>RB事業2課</h1><div class="sub">SCHEDULE MANAGEMENT</div>
    ${err?`<div class="msg err">${h(err)}</div>`:''}
    <input id="l-regno" placeholder="登録番号" autocomplete="username">
    <input id="l-pw" type="password" placeholder="パスワード" autocomplete="current-password">
    <button class="btn gold" id="l-btn">ログイン</button>
    <div id="l-err"></div>
    <div class="hint">初期パスワードは登録番号と同じです</div>
  </div></div>`;
  const go = async () => {
    try{
      const d = await api('/login', { method:'POST', body:{ regno:$('#l-regno').value.trim(), password:$('#l-pw').value } });
      TOKEN = d.token; localStorage.setItem('tk', TOKEN); ME = d.user;
      location.hash = '#/schedule'; render();
    }catch(e){ $('#l-err').innerHTML = `<div class="msg err">${h(e.message)}</div>`; }
  };
  $('#l-btn').onclick = go;
  $('#l-pw').onkeydown = e => { if(e.key==='Enter') go(); };
}

/* ===== 初回ログイン時の強制パスワード変更 ===== */
function renderForcedPassword(){
  clearTimers();
  document.getElementById('root').innerHTML = `
  <div class="login-wrap"><div class="login-card">
    <h1>パスワードの変更</h1>
    <div class="sub" style="margin-bottom:14px">安全のため、初回ログイン時はパスワードの変更が必要です</div>
    <div class="msg" style="background:#fff6e5;border:1px solid #f0dca8;color:#8a5a00;padding:10px;border-radius:8px;margin-bottom:12px;font-size:13px;text-align:left">
      初期パスワード（登録番号と同じ）は他人に推測されやすく危険です。あなただけが分かる新しいパスワードを設定してください。
    </div>
    <input id="fp-old" type="password" placeholder="現在のパスワード（登録番号）" autocomplete="current-password">
    <input id="fp-new" type="password" placeholder="新しいパスワード（4文字以上）" autocomplete="new-password">
    <input id="fp-new2" type="password" placeholder="新しいパスワード（確認）" autocomplete="new-password">
    <button class="btn gold" id="fp-btn">変更して続ける</button>
    <div id="fp-err" style="margin-top:8px"></div>
    <div class="hint" style="margin-top:12px"><a href="#" id="fp-logout">別のアカウントでログイン</a></div>
  </div></div>`;
  const go = async () => {
    const oldpw = $('#fp-old').value, newpw = $('#fp-new').value, newpw2 = $('#fp-new2').value;
    const err = m => $('#fp-err').innerHTML = `<div class="msg err">${h(m)}</div>`;
    if(newpw.length < 4){ err('新しいパスワードは4文字以上にしてください'); return; }
    if(newpw !== newpw2){ err('確認用パスワードが一致しません'); return; }
    if(newpw === ME.regno){ err('登録番号と同じパスワードは使えません'); return; }
    try{
      await api('/password', { method:'POST', body:{ oldpw, newpw } });
      ME.must_change = 0;
      popup('パスワードを変更しました');
      location.hash = '#/schedule'; render();
    }catch(e){ err(e.message); }
  };
  $('#fp-btn').onclick = go;
  $('#fp-new2').onkeydown = e => { if(e.key==='Enter') go(); };
  $('#fp-logout').onclick = (e) => { e.preventDefault(); api('/logout',{method:'POST'}).catch(()=>{}); logoutLocal(); };
}

/* ===== シェル(ヘッダー)===== */
function renderShell(hash){
  // hashが指定パスと同一、またはパス配下(パス+'/'で始まる)かを正確に判定する。
  // 単純な startsWith だと "#/admin-settings" が "#/admin" にマッチしてしまう等の誤爆が起きるため使用。
  const hashIs = (h, p) => h === p || h.startsWith(p + '/');
  const isChief = LV[ME.role] >= 1;
  const canEdit = ME.handler === 1;
  const canDraft = has('report_check');
  const canBlacklist = has('blacklist_manage');
  const canAccountAdmin = has('account_manage');
  const canSystemSettings = has('wage_settings');
  const canRolePerm = has('account_manage');
  const canHandlerStatus = has('handler_tools');
  const canImport = has('import_data');
  const canSchedSrc = has('wage_settings');
  const canDaicho = has('daicho_manage');
  const showSystemGroup = canAccountAdmin || canSystemSettings || canRolePerm || canHandlerStatus;
  const showSpreadGroup = canImport || canSchedSrc || canDaicho;

  // ナビゲーション構造。children を持つ項目はグループ(タップでサブメニューに切り替わる)、
  // 持たない項目は単独ページへのリンク。権限がない機能は、グループ内の子としても一切出現しない
  // (グループ自体も、中身が1つも無ければ表示されない)。
  const nav = [
    { label:'📅 スケジュール', show:true, children:[
      ['#/schedule','📅 マイスケジュール'],
      ...(canEdit ? [['#/edit','✏️ スケジュール入力']] : []),
    ]},
    { path:'#/sites', label:'🏟️ 現場一覧', show:isChief },
    { label:'👥 メンバー', show:isChief, children:[
      ['#/members','👥 メンバー一覧'],
      ['#/summary','📊 稼働サマリー'],
    ]},
    { label:'🆕 新人報告', show:true, children:[
      ['#/report','📝 新人報告'],
      ['#/reports','📋 報告一覧'],
      ...(canDraft ? [['#/draft','⭐ ドラフト']] : []),
      ...(canBlacklist ? [['#/blacklist','🚫 ブラックリスト']] : []),
    ]},
    { label:'⚙️ システム管理', show: showSystemGroup, children:[
      ...(canAccountAdmin ? [['#/admin','👥 アカウント管理']] : []),
      ...(canSystemSettings ? [['#/admin-settings','🔧 システム設定']] : []),
      ...(canRolePerm ? [['#/role-permissions','🛡️ 権限の一括設定']] : []),
      ...(canHandlerStatus ? [['#/handler-status','🟢 ログイン中・編集履歴']] : []),
    ]},
    { label:'📤 スプレッド読み込み', show: showSpreadGroup, children:[
      ...(canImport ? [['#/import','📥 スプレッドシート取り込み']] : []),
      ...(canSchedSrc ? [['#/sched-sources','📡 予定表ソース管理']] : []),
      ...(canDaicho ? [['#/daicho','🗂️ 台帳保管']] : []),
    ]},
  ].filter(n => n.show);

  // 現在ページ名(ヘッダー中央に表示)。グループ内の子ページも探索する。
  let curName = '';
  outer: for(const item of nav){
    if(item.path && hashIs(hash, item.path)){ curName = item.label.replace(/^\S+\s/,''); break; }
    if(item.children){
      for(const [p,l] of item.children){ if(hashIs(hash, p)){ curName = l.replace(/^\S+\s/,''); break outer; } }
    }
  }
  document.getElementById('root').innerHTML = `
  <header>
    <button class="menu-btn" id="menu-btn" aria-label="メニュー">☰</button>
    <div class="brand">RB事業2課<small>SCHEDULE</small></div>
    <div class="cur-page">${h(curName)}</div>
    <div class="hright">
      <button class="pin-btn ${ME.handler===1?'active':''}" id="pin-btn" title="${ME.handler===1?'手配者モードを終了':'手配者モードに入る'}">${ME.handler===1?'🔓':'🔑'}</button>
      <button class="bell" id="bell">🔔<span class="badge" id="bcount" style="display:none"></span></button>
      <span class="uname">${h(ME.name)}<br><span style="color:var(--gold)">${roleLabel(ME)}${ME.handler?'(手配モード)':''}</span></span>
    </div>
  </header>
  <main id="app"><div class="muted">読み込み中…</div></main>
  <div id="dd"></div>
  <div id="menu-drawer"></div>`;

  const pinBtn = $('#pin-btn');
  if(pinBtn) pinBtn.onclick = async () => {
    if(ME.handler === 1){
      if(!confirm('手配者モードを終了しますか?')) return;
      await api('/handler-mode',{method:'DELETE'}); ME.handler=0; render();
    } else {
      openHandlerPin();
    }
  };

  const footerLinks = `
    <div class="drawer-sep"></div>
    <button type="button" class="drawer-link" data-go="#/password">🔑 パスワード変更</button>
    <button type="button" class="drawer-link danger" id="dd-logout">↩️ ログアウト</button>`;

  const wireFooter = (dr, close) => {
    dr.querySelectorAll('.drawer-link[data-go]').forEach(btn => btn.onclick = () => {
      const to = btn.dataset.go;
      close();
      if(location.hash === to){ render(); } else { location.hash = to; }
    });
    const dl = dr.querySelector('#dd-logout');
    if(dl) dl.onclick = async () => { try{ await api('/logout',{method:'POST'}); }catch(_){} logoutLocal(); };
  };

  const stMenu = PAGE_STATE.menu || (PAGE_STATE.menu = { open:{} });
  // 現在地が属するグループは、初回だけ自動的に開いておく(以降はユーザーの開閉操作を優先)
  nav.forEach((item,i) => {
    if(item.children && item.children.some(([p]) => hashIs(hash,p)) && stMenu.open[i]===undefined) stMenu.open[i] = true;
  });

  const renderDrawer = () => {
    const dr = $('#menu-drawer');
    const close = () => closeDrawerAnimated(dr);
    dr.innerHTML = `<div class="drawer-bg" id="drawer-bg"></div>
      <nav class="drawer">
        <div class="drawer-head">メニュー</div>
        ${nav.map((item,i) => {
          if(!item.children){
            return `<button type="button" class="drawer-link ${hashIs(hash, item.path)?'active':''}" data-go="${item.path}">${item.label}</button>`;
          }
          const isOpen = !!stMenu.open[i];
          return `<button type="button" class="drawer-link drawer-group" data-toggle="${i}">${item.label}<span class="drawer-arrow ${isOpen?'open':''}">›</span></button>
            <div class="drawer-sub ${isOpen?'':'collapsed'}">
              ${item.children.map(([p,l]) => `<button type="button" class="drawer-link drawer-sublink ${hashIs(hash,p)?'active':''}" data-go="${p}">${l}</button>`).join('')}
            </div>`;
        }).join('')}
        ${footerLinks}
      </nav>`;
    dr.querySelector('#drawer-bg').onclick = close;
    dr.querySelectorAll('.drawer-group').forEach(btn => btn.onclick = () => {
      const i = Number(btn.dataset.toggle);
      stMenu.open[i] = !stMenu.open[i];
      renderDrawer();
    });
    wireFooter(dr, close);
  };

  $('#menu-btn').onclick = () => {
    const dr = $('#menu-drawer');
    if(dr.innerHTML){ closeDrawerAnimated(dr); return; }
    renderDrawer();
  };

  $('#bell').onclick = async () => {
    if($('#dd').innerHTML){ $('#dd').innerHTML=''; return; }
    const d = await api('/notifications');
    $('#dd').innerHTML = `<div class="dropdown" style="min-width:300px">
      <div class="notif-list">${d.items.length ? d.items.map(n=>`
        <div class="notif-item ${n.read?'':'unread'} ${n.link?'notif-clickable':''}" data-id="${n.id}" ${n.link?`data-link="${h(n.link)}"`:''}><time>${h(n.ts)}</time>${h(n.message)}</div>`).join('') : '<div class="notif-item muted">通知はありません</div>'}</div>
      ${d.unread ? '<button id="dd-read" class="sep">すべて既読にする</button>' : ''}
    </div>`;
    const dr2 = $('#dd-read');
    if(dr2) dr2.onclick = async () => { await api('/notifications/read',{method:'POST'}); $('#dd').innerHTML=''; pollBell(); };
    $('#dd').querySelectorAll('.notif-clickable').forEach(el => el.onclick = async () => {
      const link = el.dataset.link;
      if(!link) return;
      try{ await api(`/notifications/${el.dataset.id}/read`,{method:'POST'}); }catch(_){}
      $('#dd').innerHTML = ''; pollBell();
      const [hashPart, query] = link.split('?');
      if(query){ const m = new URLSearchParams(query).get('month'); if(m) MONTH = m; }
      if(location.hash === hashPart){ render(); } else { location.hash = hashPart; }
    });
  };
}

async function pollBell(){
  const upd = async () => {
    try{ const d = await api('/notifications'); const b = $('#bcount');
      if(!b) return;
      b.style.display = d.unread ? '' : 'none'; b.textContent = d.unread;
    }catch(_){}
  };
  upd();
  timers.push(setInterval(upd, 45000));
}

/* ===== スケジュール表(写真風)===== */
async function pageSchedule(app, hash){
  const m = hash.match(/^#\/schedule\/(\d+)/);
  const uid = m ? Number(m[1]) : ME.id;
  const d = await api(`/schedule?uid=${uid}&month=${MONTH}`);
  const u = d.user;
  const [y, mo] = MONTH.split('-').map(Number);
  const days = new Date(y, mo, 0).getDate();
  const rookieMap = {};
  for(const r of d.rookies||[]) (rookieMap[r.next_date+'|'+r.next_site] ||= []).push(r.candidate_name);

  let workDays=0, offDays=0, sumH=0, sumOT=0, sumPay=0, rows='', mrows='';
  const today = jstToday(); // 今日(YYYY-MM-DD)。該当日を強調表示する
  const canPlan = LV[ME.role] >= 1; // チーフ以上は育成計画を編集可
  const canPay = d.canSeePay;       // 手配担当以上のみ 時間・給与・IN・OUT を閲覧可
  const canRecord = (uid === ME.id) || ME.role === 'admin'; // 現場記録は本人と管理者のみ閲覧・編集可
  const plans = d.plans || {};
  const multi = arr => arr.map(x=>h(x||'')||'&nbsp;').join('<br>'); // 複数現場を改行で重ねる
  // 育成計画セル(日単位)
  const planCell = (date) => {
    const pv = plans[date] || '';
    return `<td class="plan-cell" data-date="${date}" data-plan="${h(pv)}" title="${canPlan?'タップで育成計画を編集':''}">${h(pv)}${canPlan?' <span class="plan-edit">✎</span>':''}</td>`;
  };
  for(let i=1;i<=days;i++){
    const date = `${MONTH}-${pad(i)}`;
    const w = new Date(y, mo-1, i).getDay();
    const list = d.entries[date]; // 配列 or undefined
    const wdCls = w===0?'sun':w===6?'sat':'';
    const planVal = plans[date] || '';
    let cells, mBody='', mCls='';   // mBody=スマホ用の内容, mCls=行の種別クラス
    if(!list || !list.length){
      cells = `<td></td><td></td>${canPay?'<td></td><td></td><td></td><td></td><td></td>':''}<td></td>${planCell(date)}`;
      mCls = 'm-empty';
      mBody = `<span class="m-none">予定なし</span>`;
    } else if(list[0].type==='work'){
      // 現場(複数可)
      workDays++;
      const sites=[], venues=[], dutys=[], tins=[], touts=[], hrs=[], ots=[], pays=[], notes=[];
      const mSites=[];
      for(const e of list){
        sumH+=e.hours; sumOT+=e.overtime; sumPay+=e.pay;
        const rk = (LV[ME.role]>=1 ? (rookieMap[date+'|'+e.site]||[]) : []).map(n=>`<span class="rookie-badge">🔰${h(n)}</span>`).join('');
        sites.push(`<span class="site-cell" data-date="${date}" data-site="${h(e.site)}" title="タップで同じ現場のメンバーを表示">${h(e.site)}${rk}</span>${canRecord?` <span class="rec-btn" data-date="${date}" data-site="${h(e.site)}" title="現場記録を記入${e.breakShort?'(休憩時間が目安に届いていません)':''}">📝${e.breakShort?'⚠️':''}</span>`:''}`);
        venues.push(`<span class="venue-cell" data-venue="${h(e.venue)}" title="タップでGoogleマップ">${h(e.venue)}</span>`);
        dutys.push(e.duty?h(e.duty):'<span class="muted">—</span>');
        tins.push(h(e.tin)); touts.push(h(e.tout));
        hrs.push(e.hours?e.hours.toFixed(2):''); ots.push(e.overtime?e.overtime.toFixed(2):'');
        pays.push(e.pay?e.pay.toLocaleString():''); if(e.note) notes.push(e.note);
        // スマホ用:1現場ぶんのブロック
        const dutyPart = canPay && e.duty ? `<div class="m-line"><span class="m-k">業務</span><span class="m-v">${h(e.duty)}</span></div>` : '';
        const timePart = canPay && (e.tin||e.tout) ? `<div class="m-line"><span class="m-k">時間</span><span class="m-v">${h(e.tin)}〜${h(e.tout)}${e.hours?`(${e.hours.toFixed(1)}h)`:''}</span></div>` : '';
        const payPart = canPay && e.pay ? `<div class="m-line"><span class="m-k">給与</span><span class="m-v">${yen(e.pay)}${e.overtime?` / 残業${e.overtime.toFixed(2)}h`:''}</span></div>` : '';
        const notePart = e.note ? `<div class="m-line"><span class="m-k">備考</span><span class="m-v">${h(e.note)}</span></div>` : '';
        mSites.push(`<div class="m-site">
          <div class="m-sitename"><span class="site-cell" data-date="${date}" data-site="${h(e.site)}">${h(e.site)}</span>${rk}${canRecord?` <span class="rec-btn" data-date="${date}" data-site="${h(e.site)}">📝記録${e.breakShort?' ⚠️':''}</span>`:''}</div>
          ${e.venue?`<div class="m-line"><span class="m-k">会場</span><span class="m-v"><span class="venue-cell" data-venue="${h(e.venue)}">${h(e.venue)}</span></span></div>`:''}
          ${dutyPart}${timePart}${payPart}${notePart}
        </div>`);
      }
      const payPart = canPay ? `<td class="c duty-col">${dutys.join('<br>')}</td><td class="c">${tins.join('<br>')}</td><td class="c">${touts.join('<br>')}</td>
        <td class="r">${hrs.join('<br>')}</td><td class="r">${ots.join('<br>')}</td><td class="r">${pays.join('<br>')}</td>` : '';
      cells = `<td class="site-multi">${sites.join('<br>')}</td><td class="venue-multi">${venues.join('<br>')}</td>
        ${payPart}<td class="note-cell">${multi(notes.length?notes:[''])}</td>${planCell(date)}`;
      mCls = 'm-work';
      mBody = mSites.join('');
    } else {
      const e = list[0];
      const label = e.type==='off'?'休暇':e.type==='paid'?'有給休暇':e.type==='ok'?'1日OK':'×';
      if(e.type==='off'||e.type==='paid') offDays++;
      sumH+=e.hours||0; sumPay+=e.pay||0;
      const payPart = canPay ? `<td></td><td class="c">${h(e.tin)}</td><td class="c">${h(e.tout)}</td>
        <td class="r">${e.hours?e.hours.toFixed(2):''}</td><td></td><td class="r">${e.pay?e.pay.toLocaleString():''}</td>` : '';
      cells = `<td class="off-cell off-${e.type}">${label}</td><td></td>${payPart}<td class="note-cell">${h(e.note||'')}</td>${planCell(date)}`;
      mCls = 'm-off m-'+e.type;
      mBody = `<span class="m-off-label">${label}</span>${e.note?`<div class="m-line"><span class="m-k">備考</span><span class="m-v">${h(e.note)}</span></div>`:''}`;
    }
    rows += `<tr class="${date===today?'is-today':''}"><td class="day">${i}${date===today?'<span class="today-pill">今日</span>':''}</td><td class="wd ${wdCls}">${WD[w]}</td>${cells}</tr>`;
    // スマホ用 日リスト行(育成は:予定がある日、または既に入力済みの日のみ表示)
    const hasContent = !!(list && list.length);
    const showPlan = canPlan && (hasContent || planVal);
    const planM = showPlan ? `<div class="m-line m-plan" data-date="${date}" data-plan="${h(planVal)}"><span class="m-k">育成</span><span class="m-v">${h(planVal)||'<span class="muted">（未入力）</span>'}${canPlan?' <span class="plan-edit">✎</span>':''}</span></div>` : '';
    mrows += `<div class="m-day ${mCls} ${date===today?'is-today':''}">
      <div class="m-date ${wdCls}"><span class="m-dnum">${i}</span><span class="m-dwd">${WD[w]}</span>${date===today?'<span class="today-pill">今日</span>':''}</div>
      <div class="m-content">${mBody}${planM}</div>
    </div>`;
  }

  const others = LV[ME.role]>=1 ? `<button class="btn ghost sm" id="pick-user">他のメンバーを見る ▾</button>` : '';
  app.innerHTML = `
  <h2>${h(u.name)} のスケジュール ${uid!==ME.id?'<span class="muted">(閲覧中)</span>':''}</h2>
  <div class="card">
    <div class="row" style="justify-content:space-between">
      <div class="month-nav">
        <button class="btn ghost sm" id="prev-m">◀</button>
        <div class="mtitle">${y}年 ${mo}月</div>
        <button class="btn ghost sm" id="next-m">▶</button>
      </div>
      <div class="muted">${h(u.regno)} / ${h(u.rank)} / ${h(u.han)} / ${h(u.station)}</div>
      ${others}
    </div>
    <div class="sched-wrap pc-only">
      <table class="sched">
        <thead><tr><th>日</th><th>曜</th><th>現場名</th><th>会場</th>${canPay?'<th>業務</th><th>IN</th><th>OUT</th><th>時間</th><th>時間外</th><th>給与</th>':''}<th>備考</th><th>育成計画</th></tr></thead>
        <tbody>${rows}
        <tr class="total-row">
          <td colspan="2" class="c">合計</td>
          <td>現場日数 ${workDays}日</td>
          <td>休暇日数 ${offDays}日</td>
          ${canPay?`<td></td><td colspan="2" class="c red-num">${sumH.toFixed(1)}時間</td>
          <td class="c red-num">残業${sumOT.toFixed(2)}h</td>
          <td colspan="2" class="r red-num">${yen(sumPay)}</td>`:''}
          <td></td><td></td>
        </tr></tbody>
      </table>
    </div>
    <div class="sched-mobile sp-only">
      ${mrows}
      <div class="m-total">
        <div>現場 <b>${workDays}</b>日 / 休暇 <b>${offDays}</b>日</div>
        ${canPay?`<div>合計 <b class="red-num">${sumH.toFixed(1)}時間</b>(残業${sumOT.toFixed(2)}h)</div><div>給与 <b class="red-num">${yen(sumPay)}</b></div>`:''}
      </div>
    </div>
    <div class="muted" style="margin-top:8px">${canPay?'現場名タップ → 同じ現場のメンバー・備考':'現場名タップ → 同じ現場のメンバー'} / 会場タップ → Googleマップ${canPlan?' / 育成計画をタップ → 編集(チーフ以上)':''}</div>
  </div>`;

  $('#prev-m').onclick = () => { MONTH = shiftMonth(MONTH,-1); render(); };
  $('#next-m').onclick = () => { MONTH = shiftMonth(MONTH, 1); render(); };
  const pk = $('#pick-user');
  if(pk) pk.onclick = async () => {
    const [users, managers] = await Promise.all([getUsers(true), api('/managers')]);
    modal(`<h3>メンバーを選択</h3>
      <div class="form-grid" style="grid-template-columns:120px 1fr;max-width:460px">
        <label>担当手配者</label>
        <select id="mp-mgr"><option value="">▼ 選択してください</option>
          ${managers.map(m=>`<option value="${m.id}">${h(m.name)}手配(${m.count}名)</option>`).join('')}
          <option value="__none">チーフ手配</option>
          <option value="__all">全員から選ぶ</option>
        </select>
        <label>メンバー</label>
        <select id="mp-mem" disabled><option>担当手配者を選んでください</option></select>
      </div>
      <div class="row" style="margin-top:14px"><button class="btn gold" id="mp-go" disabled>表示する</button></div>`);
    const fill = () => {
      const mid = $('#mp-mgr').value;
      let list;
      if(mid==='') { $('#mp-mem').innerHTML='<option>担当手配者を選んでください</option>'; $('#mp-mem').disabled=true; $('#mp-go').disabled=true; return; }
      if(mid==='__all') list = users;
      else if(mid==='__none') list = users.filter(u=>!u.manager_id);
      else list = users.filter(u=>String(u.manager_id)===String(mid));
      if(!list.length){ $('#mp-mem').innerHTML='<option value="">(該当メンバーなし)</option>'; $('#mp-mem').disabled=true; $('#mp-go').disabled=true; return; }
      $('#mp-mem').disabled=false; $('#mp-go').disabled=false;
      $('#mp-mem').innerHTML = list.map(u=>`<option value="${u.id}">${h(u.name)}(${h(u.regno)})</option>`).join('');
    };
    $('#mp-mgr').onchange = fill;
    $('#mp-go').onclick = () => { const v=$('#mp-mem').value; if(v){ closeModal(); location.hash='#/schedule/'+v; } };
  };

  app.querySelectorAll('.venue-cell').forEach(td => td.onclick = () => {
    if(td.dataset.venue) window.open('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(td.dataset.venue),'_blank');
  });
  if(canPlan){
    app.querySelectorAll('.plan-cell, .m-plan').forEach(td => td.onclick = async (ev) => {
      ev.stopPropagation();
      const v = prompt(`${u.name} さん ${td.dataset.date} の育成計画`, td.dataset.plan || '');
      if(v==null) return;
      try{
        await api('/schedule-plan', { method:'PUT', body:{ uid, date: td.dataset.date, plan: v } });
        render();
      }catch(e){ alert(e.message); }
    });
  }
  app.querySelectorAll('.site-cell').forEach(td => td.onclick = (ev) => { ev.stopPropagation(); openSiteModal(td.dataset.date, td.dataset.site); });
  if(canRecord){
    app.querySelectorAll('.rec-btn').forEach(td => td.onclick = (ev) => { ev.stopPropagation(); openSiteRecord(uid, u.name, td.dataset.date, td.dataset.site); });
  }

  // 手配者モード中:日付(行)タップで、このメンバーのその日に現場を追加/編集
  if(ME.handler === 1){
    const openDayEdit = (date) => openMemberDayEdit(uid, u, date);
    // PC:行の日・曜・備考など(現場名セル以外)をタップ
    app.querySelectorAll('table.sched tbody tr').forEach(tr => {
      if(tr.classList.contains('total-row')) return;
      const dcell = tr.querySelector('td.day');
      if(!dcell) return;
      const dnum = dcell.textContent.trim();
      const date = `${MONTH}-${pad(Number(dnum))}`;
      tr.classList.add('editable-row');
      tr.querySelectorAll('td').forEach(td => {
        if(td.classList.contains('site-multi')||td.classList.contains('plan-cell')) return;
        td.style.cursor='pointer';
        td.addEventListener('click', (ev)=>{ if(ev.target.closest('.venue-cell'))return; openDayEdit(date); });
      });
    });
    // スマホ:日カードタップ
    app.querySelectorAll('.sched-mobile .m-day').forEach((md,idx) => {
      const date = `${MONTH}-${pad(idx+1)}`;
      md.classList.add('editable-row');
      md.addEventListener('click', (ev)=>{
        if(ev.target.closest('.site-cell')||ev.target.closest('.venue-cell')||ev.target.closest('.m-plan'))return;
        openDayEdit(date);
      });
    });
    const hint = document.createElement('div');
    hint.className='muted'; hint.style.marginTop='6px';
    hint.innerHTML='🛠 手配者モード:日付の行をタップ → この人のその日の現場を追加・編集できます';
    app.querySelector('.card').appendChild(hint);
  }
}

// 手配者モード:特定メンバーの特定日の現場を追加・編集
const DUTIES = ['案内','受付・案内','準備','本部付','制作補助','運営補助','雑務','準備・設営','搬入','搬出','機材搬入','機材搬出','ステージハンド','搬入・案内','案内・搬出','パッケージ','ケータリング','物品販売'];
function isLockedDate(date){ const d=new Date(Date.now()+9*3600e3); d.setDate(d.getDate()-LOCK_DAYS); return String(date) <= d.toISOString().slice(0,10); }

async function openMemberDayEdit(uid, u, date){
  if(ME.handler !== 1){ return; }
  if(isLockedDate(date) && ME.role !== 'admin'){ modal(`<h3>${h(u.name)} さん / ${h(date)}</h3><div class="msg" style="background:#fff6e5;border:1px solid #f0dca8;color:#8a5a00;padding:12px;border-radius:8px">この日は<b>給与確定済み</b>（現場日から2週間経過）のため編集できません。</div><div class="row" style="margin-top:12px"><button class="btn ghost" onclick="closeModal()">閉じる</button></div>`); return; }
  // その日の既存スロットを取得
  let existing = [];
  try{
    const d = await api(`/schedule?uid=${uid}&month=${date.slice(0,7)}`);
    existing = (d.entries && d.entries[date]) ? d.entries[date].filter(e=>e.type==='work') : [];
  }catch(e){}
  const slotRow = (s={}, i=0) => `<div class="md-slot" data-i="${i}">
    <div class="form-grid" style="grid-template-columns:64px 1fr;gap:6px 8px">
      <label>現場名</label><input class="md-site" value="${h(s.site||'')}" placeholder="例:NiziU">
      <label>会場</label><input class="md-venue" value="${h(s.venue||'')}" placeholder="例:京セラドーム大阪">
      <label>業務名</label><select class="md-duty">${DUTIES.map(d=>`<option ${String(s.duty||'案内')===d?'selected':''}>${d}</option>`).join('')}</select>
      <label>IN</label><input class="md-in" value="${h(s.tin||'')}" placeholder="9:00">
      <label>OUT</label><input class="md-out" value="${h(s.tout||'')}" placeholder="18:00">
      <label>搬入終了</label><input class="md-le" value="${h(s.load_end||'')}" placeholder="任意 例:10:30">
      <label>終演</label><input class="md-se" value="${h(s.show_end||'')}" placeholder="任意 例:20:00">
      <label>手当</label><label style="font-weight:400;font-size:13px;display:flex;align-items:center;gap:6px"><input type="checkbox" class="md-multi" ${s.multi?'checked':''} style="width:auto"> 2st(複数回公演 +¥500)</label>
      <label>備考</label><input class="md-note" value="${h(s.note||'')}" placeholder="例:物販頭">
    </div>
    <button class="btn ghost xs md-del" data-i="${i}">この現場を削除</button>
  </div>`;
  modal(`<h3>${h(u.name)} さん / ${h(date)}</h3>
    <div class="muted" style="margin-bottom:8px">この日の現場を追加・編集します(複数可)。業務名で給与が自動計算されます。</div>
    <div id="md-slots">${(existing.length?existing:[{}]).map((s,i)=>slotRow(s,i)).join('')}</div>
    <button class="btn ghost sm" id="md-add" style="margin-top:8px">＋ 現場をもう一つ追加</button>
    <div class="row" style="margin-top:14px;gap:8px">
      <button class="btn gold" id="md-save" style="flex:1">保存する</button>
    </div>
    <div class="row" style="margin-top:8px;gap:6px;align-items:center;flex-wrap:wrap">
      <span class="muted" style="font-size:12px">またはこの日を:</span>
      <button class="btn ghost sm md-status" data-t="ok">1日OK</button>
      <button class="btn ghost sm md-status" data-t="off">休暇</button>
      ${has('site_manage') ? `<button class="btn ghost sm md-status" data-t="paid">有給</button>` : ''}
      <button class="btn ghost sm md-status" data-t="x">×</button>
    </div>`);
  let idx = existing.length || 1;
  const bind = () => {
    document.querySelectorAll('#md-slots .md-del').forEach(b=>b.onclick=()=>{
      const slots=document.querySelectorAll('#md-slots .md-slot');
      if(slots.length<=1){ b.closest('.md-slot').querySelectorAll('input').forEach(i=>i.value=''); return; }
      b.closest('.md-slot').remove();
    });
  };
  bind();
  $('#md-add').onclick = () => { const div=document.createElement('div'); div.innerHTML=slotRow({},idx++); $('#md-slots').appendChild(div.firstElementChild); bind(); };
  $('#md-save').onclick = async () => {
    const slots=[];
    document.querySelectorAll('#md-slots .md-slot').forEach(s=>{
      const site=s.querySelector('.md-site').value.trim();
      if(!site) return;
      slots.push({type:'work',site,venue:s.querySelector('.md-venue').value.trim(),
        tin:s.querySelector('.md-in').value.trim(),tout:s.querySelector('.md-out').value.trim(),
        duty:s.querySelector('.md-duty').value,
        load_end:s.querySelector('.md-le').value.trim(),
        show_end:s.querySelector('.md-se').value.trim(),
        multi:s.querySelector('.md-multi').checked?1:0,
        note:s.querySelector('.md-note').value.trim()});
    });
    if(!slots.length){ popup('現場名を入力してください','error'); return; }
    try{
      let r = await api('/schedule',{method:'PUT',body:{uid,date,slots}});
      if(r.ok===0 && r.conflicts){
        if(!(await conflictModal(r.conflicts))) return;
        r = await api('/schedule',{method:'PUT',body:{uid,date,slots,force:true}});
      }
      closeModal(); popup(withWarnNote('保存しました', r));
      if(location.hash.startsWith('#/sites')){ pageSites(document.getElementById('app')); } else render();
    }catch(e){ popup(e.message,'error'); }
  };
  document.querySelectorAll('.md-status').forEach(b=>b.onclick = async () => {
    const t=b.dataset.t, lbl={ok:'1日OK',off:'休暇',paid:'有給',x:'×'}[t];
    try{
      await api('/schedule',{method:'PUT',body:{uid,date,slots:[{type:t}]}});
      closeModal(); popup(lbl+'に設定しました');
      if(location.hash.startsWith('#/sites')){ pageSites(document.getElementById('app')); } else render();
    }catch(e){ popup(e.message,'error'); }
  });
}

/* ===== 現場一覧(チーフ以上)===== */
async function pageSites(app){
  if(LV[ME.role] < 1){ notFound(app); return; }
  const stSites = PAGE_STATE.sites || (PAGE_STATE.sites = { month: MONTH });
  const month = stSites.month;
  const sites = await api(`/sites?month=${month}`);
  // 日付ごとにグループ化
  const byDate = {};
  for(const s of sites){ (byDate[s.date] ||= []).push(s); }
  const dates = Object.keys(byDate).sort();
  const [y,mo] = month.split('-').map(Number);
  app.innerHTML = `
  <h2>現場一覧</h2>
  <div class="card">
    <div class="row" style="margin-bottom:12px;align-items:center">
      <button class="btn ghost sm" id="st-prev">◀</button>
      <b style="min-width:110px;text-align:center">${y}年 ${mo}月</b>
      <button class="btn ghost sm" id="st-next">▶</button>
      ${ME.handler===1 ? '<span class="muted" style="margin-left:auto">現場をタップ → メンバー確認・追加</span>' : '<span class="muted" style="margin-left:auto">現場をタップ → メンバー確認</span>'}
    </div>
    ${dates.length ? dates.map(date=>{
      const w = new Date(date.slice(0,4), Number(date.slice(5,7))-1, Number(date.slice(8,10))).getDay();
      return `<div class="st-day">
        <div class="st-date ${w===0?'sun':w===6?'sat':''}">${Number(date.slice(8,10))}日(${WD[w]})</div>
        <div class="st-sites">
          ${byDate[date].map(s=>`<button class="st-site" data-date="${s.date}" data-site="${h(s.site)}">
            <span class="st-site-name">${h(s.site)}</span>
            ${s.venue?`<span class="st-site-venue">${h(s.venue)}</span>`:''}
            <span class="st-site-cnt">${s.cnt}名</span>
          </button>`).join('')}
        </div>
      </div>`;
    }).join('') : '<div class="muted" style="padding:20px 0;text-align:center">この月に登録された現場はありません</div>'}
  </div>`;
  $('#st-prev').onclick = () => { stSites.month = shiftMonth(month,-1); pageSites(app); };
  $('#st-next').onclick = () => { stSites.month = shiftMonth(month, 1); pageSites(app); };
  app.querySelectorAll('.st-site').forEach(b => b.onclick = () => openSiteModal(b.dataset.date, b.dataset.site));
}
function shiftMonth(m, d){
  let [y,mo] = m.split('-').map(Number); mo += d;
  if(mo<1){ mo=12; y--; } if(mo>12){ mo=1; y++; }
  return `${y}-${String(mo).padStart(2,'0')}`;
}

/* ===== 稼働サマリー(チーフ以上)。月間の出勤数・現場数・最長連勤と手配偏りを可視化 ===== */
// しきい値(運用に合わせて調整可)
const SUM_TH = { over: 18, streak: 6, few: 3 }; // 出勤18日以上=働きすぎ / 連勤6日以上=注意 / 出勤3日以下=機会少
let SUMMARY_SORT = 'workDays';
let SUMMARY_MEMBERS_ONLY = false;
let SUMMARY_MGR = null; // 選択中の手配担当(絞り込み)。null=全体
async function pageSummary(app){
  if(LV[ME.role] < 1){ notFound(app); return; }
  const stSummary = PAGE_STATE.summary || (PAGE_STATE.summary = { month: jstToday().slice(0,7) });
  const month = stSummary.month;
  app.innerHTML = `<div class="muted">集計中…</div>`;
  let data;
  try{ data = await api(`/summary?month=${month}`); }
  catch(e){ app.innerHTML = `<div class="msg err">${h(e.message)}</div>`; return; }

  const badge = it => {
    const b=[];
    if(it.maxStreak>=SUM_TH.streak) b.push(`<span class="sum-badge streak">連勤${it.maxStreak}</span>`);
    if(it.workDays>=SUM_TH.over) b.push(`<span class="sum-badge over">働きすぎ</span>`);
    if(it.workDays<=SUM_TH.few && it.workDays>0) b.push(`<span class="sum-badge few">機会少</span>`);
    if(it.workDays===0) b.push(`<span class="sum-badge zero">稼働なし</span>`);
    return b.join(' ');
  };
  const rowcls = it => it.workDays>=SUM_TH.over?'r-over':it.maxStreak>=SUM_TH.streak?'r-streak':it.workDays<=SUM_TH.few?'r-few':'';

  let items = data.items.slice();
  if(SUMMARY_MEMBERS_ONLY) items = items.filter(it=>it.role==='member');
  // 選択中の手配担当が現データに無ければ解除
  if(SUMMARY_MGR && !data.managers.some(m=>m.name===SUMMARY_MGR)) SUMMARY_MGR = null;
  const view = SUMMARY_MGR ? items.filter(it=>it.manager_name===SUMMARY_MGR) : items;

  const sorters = {
    workDays:(a,b)=>b.workDays-a.workDays || b.shifts-a.shifts,
    shifts:(a,b)=>b.shifts-a.shifts,
    streak:(a,b)=>b.maxStreak-a.maxStreak,
    name:(a,b)=>String(a.regno).localeCompare(String(b.regno)),
  };
  view.sort(sorters[SUMMARY_SORT]||sorters.workDays);

  // 統計(絞り込み中はその手配担当のチーム)
  const active = view.filter(it=>it.workDays>0);
  const avg = active.length ? (active.reduce((s,it)=>s+it.workDays,0)/active.length) : 0;
  const overN = view.filter(it=>it.workDays>=SUM_TH.over).length;
  const streakN = view.filter(it=>it.maxStreak>=SUM_TH.streak).length;
  const fewN = view.filter(it=>it.workDays<=SUM_TH.few && it.workDays>0).length;

  // 手配の偏り(タップで絞り込み)。ランキング順=現場数降順は維持
  const maxShifts = Math.max(1, ...data.managers.map(m=>m.shifts));
  const mgrBars = data.managers.map(m=>`
    <div class="mgr-row ${SUMMARY_MGR===m.name?'sel':''}" data-mgr="${h(m.name)}" role="button" tabindex="0">
      <div class="mgr-name">${h(m.name)} <span class="muted">${m.activeMembers}/${m.members}名稼働 ・ ${m.shifts}現場</span></div>
      <div class="mgr-bar-wrap"><div class="mgr-bar" style="width:${Math.round(m.shifts/maxShifts*100)}%"></div></div>
    </div>`).join('');

  const canPay = data.items.some(it=>it.hours!==null);
  // PC表
  const trows = view.map(it=>`
    <tr class="${rowcls(it)} sum-link" data-uid="${it.uid}" title="個人スケジュールを開く">
      <td class="s-name">${h(it.name)} ${it.rank?`<span class="muted">${h(it.rank)}</span>`:''} <span class="sum-go">📅</span></td>
      <td class="c">${h(it.manager_name||'—')}</td>
      <td class="c num">${it.workDays}</td>
      <td class="c num">${it.shifts}</td>
      <td class="c num ${it.maxStreak>=SUM_TH.streak?'hot':''}">${it.maxStreak}</td>
      ${canPay?`<td class="c num">${it.hours!=null?it.hours:'—'}</td>`:''}
      <td>${badge(it)}</td>
    </tr>`).join('');
  // スマホカード
  const cards = view.map(it=>`
    <div class="sum-card ${rowcls(it)} sum-link" data-uid="${it.uid}">
      <div class="sc-top"><span class="sc-name">${h(it.name)}</span>${it.rank?`<span class="sc-rank">${h(it.rank)}</span>`:''}<span class="sc-go">📅 スケジュール</span></div>
      <div class="sc-mgr">${h(it.manager_name||'—')}</div>
      <div class="sc-stats">
        <div class="sc-stat"><b>${it.workDays}</b><span>出勤日</span></div>
        <div class="sc-stat"><b>${it.shifts}</b><span>現場</span></div>
        <div class="sc-stat ${it.maxStreak>=SUM_TH.streak?'hot':''}"><b>${it.maxStreak}</b><span>連勤</span></div>
        ${canPay?`<div class="sc-stat"><b>${it.hours!=null?it.hours:'—'}</b><span>時間</span></div>`:''}
      </div>
      ${badge(it)?`<div class="sc-badges">${badge(it)}</div>`:''}
    </div>`).join('');

  app.innerHTML = `
  <div class="sum-head">
    <div class="row" style="gap:6px;align-items:center">
      <button class="btn ghost sm" id="sm-prev">◀</button>
      <b style="font-size:16px">${month.replace('-','年')}月</b>
      <button class="btn ghost sm" id="sm-next">▶</button>
    </div>
    <label class="row" style="gap:6px;align-items:center;font-size:13px;cursor:pointer">
      <input type="checkbox" id="sm-mem" ${SUMMARY_MEMBERS_ONLY?'checked':''}> メンツのみ
    </label>
  </div>
  ${SUMMARY_MGR?`<div class="sum-filter">絞り込み中：<b>${h(SUMMARY_MGR)}</b><button class="sum-clear" id="sm-clear">✕ 全体に戻す</button></div>`:''}

  <div class="sum-stats">
    <div class="sum-stat"><div class="sum-num">${active.length}</div><div class="sum-lbl">稼働人数</div></div>
    <div class="sum-stat"><div class="sum-num">${avg.toFixed(1)}</div><div class="sum-lbl">平均出勤日</div></div>
    <div class="sum-stat ${overN?'st-over':''}"><div class="sum-num">${overN}</div><div class="sum-lbl">働きすぎ</div></div>
    <div class="sum-stat ${streakN?'st-streak':''}"><div class="sum-num">${streakN}</div><div class="sum-lbl">連勤注意</div></div>
    <div class="sum-stat ${fewN?'st-few':''}"><div class="sum-num">${fewN}</div><div class="sum-lbl">機会少</div></div>
  </div>

  <div class="card" style="margin-top:12px">
    <h3 style="margin-bottom:4px">手配の偏り（タップで絞り込み）</h3>
    <div class="muted" style="font-size:11px;margin-bottom:8px">現場数の多い順。担当をタップすると、その手配のメンバーだけ表示します。</div>
    ${mgrBars || '<div class="muted">データなし</div>'}
  </div>

  <div class="card" style="margin-top:12px">
    <div class="row" style="gap:6px;margin-bottom:8px;flex-wrap:wrap;align-items:center">
      <span class="muted" style="font-size:12px">並び替え:</span>
      ${[['workDays','出勤日'],['shifts','現場数'],['streak','連勤'],['name','番号']].map(s=>`<button class="btn ghost xs sm-sort ${SUMMARY_SORT===s[0]?'on':''}" data-s="${s[0]}">${s[1]}</button>`).join('')}
      <span class="muted" style="font-size:11px;margin-left:auto">${view.length}名</span>
    </div>
    <div class="sum-table-wrap">
      <table class="sum-table">
        <thead><tr><th>氏名</th><th>担当</th><th>出勤日</th><th>現場数</th><th>最長連勤</th>${canPay?'<th>時間</th>':''}<th>状態</th></tr></thead>
        <tbody>${trows || `<tr><td colspan="${canPay?7:6}" class="muted c">該当者なし</td></tr>`}</tbody>
      </table>
    </div>
    <div class="sum-cards">${cards || '<div class="muted c">該当者なし</div>'}</div>
    <div class="muted" style="font-size:11px;margin-top:8px">※ 出勤日=現場のあった日数 / 現場数=のべ割当数(同日2現場は2) / 最長連勤=連続して現場が入った最大日数(当月内)</div>
  </div>`;

  $('#sm-prev').onclick = () => { stSummary.month = shiftMonth(month,-1); pageSummary(app); };
  $('#sm-next').onclick = () => { stSummary.month = shiftMonth(month, 1); pageSummary(app); };
  $('#sm-mem').onchange = e => { SUMMARY_MEMBERS_ONLY = e.target.checked; pageSummary(app); };
  const clr = $('#sm-clear'); if(clr) clr.onclick = () => { SUMMARY_MGR = null; pageSummary(app); };
  app.querySelectorAll('.sm-sort').forEach(b => b.onclick = () => { SUMMARY_SORT = b.dataset.s; pageSummary(app); });
  app.querySelectorAll('.mgr-row').forEach(b => b.onclick = () => {
    SUMMARY_MGR = (SUMMARY_MGR===b.dataset.mgr) ? null : b.dataset.mgr; pageSummary(app);
  });
  app.querySelectorAll('.sum-link').forEach(b => b.onclick = () => { location.hash = '#/schedule/'+b.dataset.uid; });
}

/* ===== メンバー一覧(チーフ以上)。1課/2課タブ。2課優先表示 ===== */
async function pageMembers(app){
  if(LV[ME.role] < 1){ notFound(app); return; }
  const users = await getUsers(true);
  const managers = await api('/managers');
  const st = PAGE_STATE.members || (PAGE_STATE.members = { tab:'2課', q:'', mgr:'' }); // 既定は2課(主に2課が使うため)
  const kaOf = u => u.ka || '未設定';
  const cnt2 = users.filter(u=>kaOf(u)==='2課').length;
  const cnt1 = users.filter(u=>kaOf(u)==='1課').length;
  const cntX = users.filter(u=>!u.ka).length;

  const isHandler = has('site_manage') || has('account_manage');
  const skillBtn = u => `<button class="btn ghost sm" data-skill="${u.id}">編集</button>`;
  const editBtn = u => isHandler
    ? `<button class="btn ghost sm" data-edit="${u.id}">✏️ 編集</button>`
    : `<button class="btn ghost sm" data-skill="${u.id}">できること編集</button>`;
  const schedBtn = (u,cls='gold') => `<button class="btn ${cls} sm go-sched" data-uid="${u.id}">📅 スケジュール</button>`;

  // リスト部分だけを再構築する。検索欄などフォームのinput要素はここでは一切触らない
  // (input要素をDOMから作り直すと、スマホでソフトウェアキーボードが閉じてしまうため)
  const renderList = () => {
    const tab = st.tab, q = st.q.trim(), fmgr = st.mgr;
    const inTab = u => tab==='未設定' ? !u.ka : kaOf(u)===tab;
    const matchQ = u => !q || (u.name||'').includes(q) || (u.regno||'').includes(q) || (u.han||'').includes(q) || (u.station||'').includes(q);
    const matchMgr = u => {
      if(!fmgr) return true;
      if(fmgr==='__chief') return !u.manager_id;     // チーフ手配
      return String(u.manager_id)===String(fmgr);
    };
    const list = users.filter(u=>inTab(u)&&matchQ(u)&&matchMgr(u));
    const area = $('#m-list-area'); if(!area) return;
    area.innerHTML = `
      <div class="muted" style="margin:2px 0 10px">${list.length}名 表示中</div>
      <div class="list-scroll pc-only">
      <table class="list ka-table ka-${tab==='1課'?'1':'2'}">
      <tr><th>登録番号</th><th>氏名</th><th>役割</th><th>ランク</th><th>班</th><th>手配担当</th><th>最寄駅</th><th>できること</th><th></th></tr>
      ${list.map(u=>`<tr>
        <td>${h(u.regno)}</td><td><b class="name-link" data-goto-uid="${u.id}">${h(u.name)}</b></td>
        <td><span class="tag ${u.role}">${roleLabel(u)}</span></td>
        <td>${h(u.rank)}</td><td>${h(u.han)}</td><td>${h(managerName(u,users))}</td><td>${h(u.station)}</td>
        <td class="wrapcell">${h(u.skills)}</td>
        <td>${editBtn(u)} ${schedBtn(u,'ghost')}</td>
      </tr>`).join('') || '<tr><td colspan="9" class="muted" style="text-align:center;padding:16px">該当するメンバーはいません</td></tr>'}
      </table>
      </div>
      <div class="cards sp-only">
      ${list.map(u=>`<div class="dcard ka-${kaOf(u)==='1課'?'1':'2'}">
        <div class="dcard-head"><span class="dcard-title name-link" data-goto-uid="${u.id}">${h(u.name)}</span><span class="tag ${u.role}">${roleLabel(u)}</span></div>
        <div class="drow"><span class="dk">登録番号</span><span class="dv">${h(u.regno)}</span></div>
        <div class="drow"><span class="dk">ランク / 班</span><span class="dv">${h(u.rank)||'—'} / ${h(u.han)||'—'}</span></div>
        <div class="drow"><span class="dk">手配担当</span><span class="dv">${h(managerName(u,users))}</span></div>
        <div class="drow"><span class="dk">最寄駅</span><span class="dv">${h(u.station)||'—'}</span></div>
        <div class="drow"><span class="dk">できること</span><span class="dv">${h(u.skills)||'<span class="muted">（未設定）</span>'}</span></div>
        <div class="dcard-actions">
          ${editBtn(u)}
          ${schedBtn(u)}
        </div>
      </div>`).join('') || '<div class="muted" style="text-align:center;padding:16px">該当するメンバーはいません</div>'}
      </div>
      <div class="muted" style="margin-top:8px">「できること」= 配置以外にできる業務(進行、買い出し など)</div>`;
    wireNameLinks(area);
    area.querySelectorAll('.go-sched').forEach(b=>b.onclick=()=>{ location.hash='#/schedule/'+b.dataset.uid; });
    area.querySelectorAll('[data-skill]').forEach(b => b.onclick = async () => {
      const u = users.find(x=>x.id==b.dataset.skill);
      const v = prompt(`${u.name} のできることリスト(カンマ区切り)`, u.skills||'');
      if(v==null) return;
      await api('/users/'+u.id, { method:'PATCH', body:{ skills:v } });
      USERS_CACHE = null; render();
    });
    area.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
      openMemberEdit(users.find(x=>x.id==b.dataset.edit), users, managers);
    });
  };

  app.innerHTML = `
  <h2>メンバー一覧 <span class="ka-badge ka-${st.tab==='1課'?'1':'2'}">${st.tab}</span></h2>
  <div class="card">
    <div class="ka-tabs">
      <button class="ka-tab ka2 ${st.tab==='2課'?'on':''}" data-tab="2課">2課 (${cnt2}名)</button>
      <button class="ka-tab ka1 ${st.tab==='1課'?'on':''}" data-tab="1課">1課 (${cnt1}名)</button>
      ${cntX?`<button class="ka-tab ${st.tab==='未設定'?'on':''}" data-tab="未設定">未設定 (${cntX}名)</button>`:''}
    </div>
    <div class="filter-bar">
      <input id="m-search" class="search-input" placeholder="🔍 氏名・登録番号・班・駅で検索" value="${h(st.q)}">
      <select id="m-mgr" class="filter-select">
        <option value="">手配担当:すべて</option>
        ${managers.map(m=>`<option value="${m.id}" ${String(st.mgr)===String(m.id)?'selected':''}>${h(m.name)}手配</option>`).join('')}
        <option value="__chief" ${st.mgr==='__chief'?'selected':''}>チーフ手配</option>
      </select>
      <button class="btn ghost sm" id="m-clear" style="${(st.q||st.mgr)?'':'display:none'}">クリア</button>
    </div>
    <div id="m-list-area"></div>
  </div>`;

  renderList();

  app.querySelectorAll('.ka-tab').forEach(b=>b.onclick=()=>{ st.tab=b.dataset.tab; pageMembers(app); });
  const si = $('#m-search');
  if(si){
    si.oninput = () => {
      st.q = si.value;
      const mc = $('#m-clear'); if(mc) mc.style.display = (st.q||st.mgr) ? '' : 'none';
      renderList(); // input要素自体には触れず、リストだけ更新するのでキーボードは閉じない
    };
  }
  const mm = $('#m-mgr'); if(mm) mm.onchange = () => { st.mgr = mm.value; const mc=$('#m-clear'); if(mc) mc.style.display=(st.q||st.mgr)?'':'none'; renderList(); };
  const mc = $('#m-clear'); if(mc) mc.onclick = () => { st.q=''; st.mgr=''; pageMembers(app); };
}

// メンバー情報の編集(手配者以上、または個別権限あり)。ランク・課・班・最寄駅・できること・担当手配者(役割の変更はaccount_manage権限のみ)
function openMemberEdit(u, users, managers){
  if(!has('site_manage') && !has('account_manage')){ return; }
  const isAdmin = has('account_manage');
  const ranks = [...new Set(users.map(x=>x.rank).filter(Boolean))].sort();
  modal(`<h3>${h(u.name)} の情報を編集</h3>
    <div class="form-grid" style="grid-template-columns:84px 1fr;gap:8px 10px;align-items:center">
      <label>氏名</label><input id="ue-name" value="${h(u.name)}">
      <label>ランク</label><input id="ue-rank" list="ue-ranks" value="${h(u.rank||'')}" placeholder="例:Aランク">
      <label>課</label><select id="ue-ka">
        <option value="" ${!u.ka?'selected':''}>未設定</option>
        <option value="1課" ${u.ka==='1課'?'selected':''}>1課</option>
        <option value="2課" ${u.ka==='2課'?'selected':''}>2課</option></select>
      <label>班</label><input id="ue-han" value="${h(u.han||'')}" placeholder="例:S班">
      <label>最寄駅</label><input id="ue-station" value="${h(u.station||'')}">
      <label>できること</label><input id="ue-skills" value="${h(u.skills||'')}" placeholder="進行, 買い出し など">
      <label>手配担当</label><select id="ue-mgr">
        <option value="">チーフ手配(未設定)</option>
        ${managers.map(m=>`<option value="${m.id}" ${String(u.manager_id)===String(m.id)?'selected':''}>${h(m.name)}手配</option>`).join('')}</select>
      ${isAdmin?`<label>役割</label><select id="ue-role">${Object.keys(LV).map(r=>`<option value="${r}" ${u.role===r?'selected':''}>${ROLE_JP[r]}</option>`).join('')}</select>`:''}
    </div>
    <datalist id="ue-ranks">${ranks.map(r=>`<option value="${h(r)}"></option>`).join('')}</datalist>
    <button class="btn gold" id="ue-save" style="width:100%;margin-top:14px">保存する</button>
    <div class="muted" style="font-size:11px;margin-top:8px">登録番号(${h(u.regno)})は変更できません。${isAdmin?'':'役割の変更は管理者のみ可能です。'}</div>`);
  $('#ue-save').onclick = async () => {
    const name = $('#ue-name').value.trim();
    if(!name){ popup('氏名は必須です','error'); return; }
    const body = {
      name,
      rank: $('#ue-rank').value.trim(),
      ka: $('#ue-ka').value,
      han: $('#ue-han').value.trim(),
      station: $('#ue-station').value.trim(),
      skills: $('#ue-skills').value.trim(),
      manager_id: $('#ue-mgr').value ? Number($('#ue-mgr').value) : null,
    };
    if(isAdmin){ const r=$('#ue-role'); if(r) body.role = r.value; }
    try{
      await api('/users/'+u.id, { method:'PATCH', body });
      USERS_CACHE = null; closeModal(); popup('保存しました'); render();
    }catch(e){ popup(e.message,'error'); }
  };
}
// 手配担当の表示名(担当未設定 → チーフ手配)
function managerName(u, users){
  if(!u.manager_id){
    return u.ka==='1課' ? 'チーフ手配(1課)' : u.ka==='2課' ? 'チーフ手配(2課)' : 'チーフ手配';
  }
  const mgr = users.find(x=>String(x.id)===String(u.manager_id));
  return mgr ? mgr.name+'手配' : 'チーフ手配';
}

/* ===== スケジュール入力(手配者モード)===== */
async function pageEdit(app){
  if(ME.handler !== 1){ notFound(app); return; }
  const [users, managers] = await Promise.all([getUsers(true), api('/managers')]);
  app.innerHTML = `
  <h2>スケジュール入力(手配チーム専用)</h2>

  <div class="card" style="margin-bottom:14px">
    <div class="bulk-head" id="bulk-toggle">
      <span><b>📋 複数人に一括登録</b>(同じ現場を、同じ手配担当の複数メンバーへ)</span>
      <span id="bulk-arrow">▼</span>
    </div>
    <div id="bulk-body" style="display:none;margin-top:12px">
      <div class="form-grid" style="grid-template-columns:90px 1fr;max-width:560px">
        <label>現場名 *</label><input id="bk-site" placeholder="例:NiziU 大阪公演">
        <label>会場</label><input id="bk-venue" placeholder="例:京セラドーム大阪">
        <label>IN</label><input id="bk-in" placeholder="例:9:00">
        <label>OUT</label><input id="bk-out" placeholder="例:18:00">
        <label>給与(手動)</label><input id="bk-pay" placeholder="空欄=自動計算">
      </div>
      <div style="margin-top:14px">
        <label class="bulk-label">① メンバーを追加(同じ手配担当だけ)</label>
        <div class="row" style="gap:6px;margin:6px 0">
          <select id="bk-mgr" class="nowrap" style="flex:1">
            <option value="">▼ 担当手配者を選択</option>
            ${managers.map(m=>`<option value="${m.id}">${h(m.name)}手配(${m.count}名)</option>`).join('')}
            <option value="__none">チーフ手配</option>
          </select>
          <select id="bk-memsel" class="nowrap" style="flex:1"><option value="">担当手配者を選択</option></select>
          <button class="btn ghost sm" id="bk-mem-add">＋追加</button>
        </div>
      </div>
      <div style="margin-top:10px">
        <label class="bulk-label">② メンバーごとに日付と備考を入力</label>
        <div id="bk-assign" style="margin-top:6px"><div class="muted">上でメンバーを追加してください</div></div>
      </div>
      <div class="row" style="margin-top:14px"><button class="btn gold" id="bk-save">一括登録する</button></div>
      <div class="muted" style="margin-top:8px">現場名・会場・時間は全員共通です。日付と備考はメンバーごとに指定できます(例:Aさんは6/1・6/5 / Bさんは6/1・6/8)。既存の予定は消えません。同じ現場名が既にある日はスキップします。</div>
    </div>
  </div>

  <div class="card">
    <h3 style="margin:0 0 10px">1人ずつ入力</h3>
    <div class="form-grid" style="grid-template-columns:90px 1fr;max-width:520px;margin-bottom:8px">
      <label>担当手配者</label>
      <select id="e-mgr" class="nowrap">
        <option value="__all">全員</option>
        ${managers.map(m=>`<option value="${m.id}">${h(m.name)}手配(${m.count}名)</option>`).join('')}
        <option value="__none">チーフ手配</option>
      </select>
      <label>メンバー</label>
      <select id="e-user" class="nowrap">${users.map(u=>`<option value="${u.id}">${h(u.name)}(${h(u.regno)})</option>`).join('')}</select>
      <label>対象月</label>
      <input type="month" id="e-month" value="${MONTH}">
    </div>
    <div class="row" style="margin-bottom:12px">
      <button class="btn" id="e-load">読み込み</button>
      <button class="btn gold pc-only" id="e-save" style="display:inline-block">月をまとめて保存</button>
      <span id="e-msg"></span>
    </div>
    <div id="e-grid" class="pc-only"></div>
    <div id="e-mobile" class="sp-only"></div>
    <div class="muted" style="margin-top:8px">給与は自動計算(時給¥1,150 / 13時間超 +25% / 22:00〜5:00 +25%)。「給与(手動)」に数値を入れた場合はその金額を優先します。種別を「-」にすると削除されます。<br>1日に複数の現場がある場合は「＋現場」で追加できます。「備考」は本人のスケジュール表と現場情報の両方に表示され、入力者の名前が自動で付きます(例:物販頭(吉崎))。</div>
  </div>`;

  // ---- 一括登録(メンバーごとに日付・備考)----
  $('#bulk-toggle').onclick = () => {
    const body = $('#bulk-body'), open = body.style.display==='none';
    body.style.display = open ? 'block' : 'none';
    $('#bulk-arrow').textContent = open ? '▲' : '▼';
  };
  let bkAssign = []; // [{uid, name, regno, dates:[], note}]
  // 担当手配者を選ぶと、その担当のメンバーが2つ目のプルダウンに出る
  $('#bk-mgr').onchange = () => {
    const mid = $('#bk-mgr').value;
    let list = [];
    if(mid==='__none') list = users.filter(u=>!u.manager_id);
    else if(mid) list = users.filter(u=>String(u.manager_id)===String(mid));
    $('#bk-memsel').innerHTML = list.length
      ? '<option value="">メンバーを選択</option>'+list.map(u=>`<option value="${u.id}">${h(u.name)}(${h(u.regno)})</option>`).join('')
      : '<option value="">該当メンバーなし</option>';
  };
  const renderAssign = () => {
    const box = $('#bk-assign');
    if(!bkAssign.length){ box.innerHTML='<div class="muted">上でメンバーを追加してください</div>'; return; }
    box.innerHTML = bkAssign.map((a,ai)=>`
      <div class="bk-person" data-ai="${ai}">
        <div class="bk-person-head"><b>${h(a.name)}</b><span class="bulk-sub">${h(a.regno)}</span><button class="bk-person-del" data-ai="${ai}">削除</button></div>
        <div class="bk-person-dates">
          <div class="row" style="gap:6px"><input type="date" class="bk-d-input" data-ai="${ai}"><button class="btn ghost xs bk-d-add" data-ai="${ai}">＋日付</button></div>
          <div class="bulk-chips" style="margin-top:6px">${a.dates.map((d,di)=>`<span class="chip">${d}<button data-ai="${ai}" data-di="${di}">✕</button></span>`).join('')||'<span class="muted">日付未選択</span>'}</div>
        </div>
        <div class="row" style="margin-top:6px"><label style="flex:0 0 44px;font-size:13px;color:#555">備考</label><input class="bk-note-input" data-ai="${ai}" value="${h(a.note)}" placeholder="この人の備考(例:物販頭)" style="flex:1"></div>
      </div>`).join('');
    // 日付追加
    box.querySelectorAll('.bk-d-add').forEach(btn=>btn.onclick=()=>{
      const ai=Number(btn.dataset.ai), inp=box.querySelector(`.bk-d-input[data-ai="${ai}"]`);
      const v=inp.value; if(!v) return;
      if(!bkAssign[ai].dates.includes(v)){ bkAssign[ai].dates.push(v); bkAssign[ai].dates.sort(); }
      syncNotes(); renderAssign();
    });
    // 日付削除
    box.querySelectorAll('.chip button').forEach(b=>b.onclick=()=>{
      syncNotes(); bkAssign[Number(b.dataset.ai)].dates.splice(Number(b.dataset.di),1); renderAssign();
    });
    // メンバー削除
    box.querySelectorAll('.bk-person-del').forEach(b=>b.onclick=()=>{
      syncNotes(); bkAssign.splice(Number(b.dataset.ai),1); renderAssign();
    });
  };
  // 入力中の備考を配列に退避(再描画で消えないように)
  const syncNotes = () => {
    document.querySelectorAll('#bk-assign .bk-note-input').forEach(inp=>{ const ai=Number(inp.dataset.ai); if(bkAssign[ai]) bkAssign[ai].note=inp.value; });
  };
  $('#bk-mem-add').onclick = () => {
    const v = $('#bk-memsel').value; if(!v) return;
    if(bkAssign.some(a=>a.uid===Number(v))){ popup('そのメンバーは既に追加されています','error'); return; }
    const u = users.find(x=>x.id===Number(v)); if(!u) return;
    syncNotes();
    bkAssign.push({ uid:u.id, name:u.name, regno:u.regno, dates:[], note: $('#bk-note-default')?$('#bk-note-default').value:'' });
    renderAssign();
  };
  $('#bk-save').onclick = async () => {
    syncNotes();
    const site = $('#bk-site').value.trim();
    if(!site){ popup('現場名を入力してください', 'error'); return; }
    const assignments = bkAssign.filter(a=>a.dates.length).map(a=>({uid:a.uid, dates:a.dates, note:a.note}));
    if(!assignments.length){ popup('メンバーを追加し、それぞれに日付を1つ以上入れてください', 'error'); return; }
    try{
      const r = await bulkSaveWithConflicts({
        assignments, site, venue:$('#bk-venue').value.trim(),
        tin:$('#bk-in').value.trim(), tout:$('#bk-out').value.trim(), pay:$('#bk-pay').value.trim()
      });
      if(!r) return;
      popup(withWarnNote(`一括登録しました(${r.added}件追加${r.skipped?` / ${r.skipped}件スキップ`:''})。`, r));
      ['bk-site','bk-venue','bk-in','bk-out','bk-pay'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
      bkAssign=[]; renderAssign();
    }catch(e){ popup(e.message, 'error'); }
  };
  renderAssign();

  // 担当手配者で対象メンバーを絞り込む
  $('#e-mgr').onchange = () => {
    const mid = $('#e-mgr').value;
    let list;
    if(mid==='__all') list = users;
    else if(mid==='__none') list = users.filter(u=>!u.manager_id);
    else list = users.filter(u=>String(u.manager_id)===String(mid));
    $('#e-user').innerHTML = (list.length?list:users).map(u=>`<option value="${u.id}">${h(u.name)}(${h(u.regno)})</option>`).join('');
  };

  // 1現場分の入力行(セル群)を作る
  function slotCells(e){
    e = e || {};
    const sel = v => e.type===v?'selected':'';
    return `<td class="type-col"><select class="etype"><option value="">-</option>
        <option value="work" ${sel('work')}>現場</option><option value="off" ${sel('off')}>休暇</option>
        <option value="paid" ${sel('paid')}>有給</option><option value="ok" ${sel('ok')}>1日OK</option><option value="x" ${sel('x')}>×</option></select></td>
      <td><input class="esite" value="${h(e.site||'')}" placeholder="現場名"></td>
      <td><input class="evenue" value="${h(e.venue||'')}" placeholder="会場"></td>
      <td class="tin-col"><input class="ein" value="${h(e.tin||'')}" placeholder="10:15"></td>
      <td class="tin-col"><input class="eout" value="${h(e.tout||'')}" placeholder="19:45"></td>
      <td class="pay-col"><input class="epay" placeholder="自動" value=""></td>
      <td><input class="enote" value="${h(e.note||'')}" placeholder="備考"></td>
      <td class="c" style="width:54px"><button class="btn ghost xs add-slot" title="この日に現場を追加">＋現場</button><button class="btn danger xs del-slot" title="この行を削除" style="margin-top:2px">削除</button></td>`;
  }

  let MONTH_DATA = {}; // date -> slots[](スマホ用に保持)

  async function load(){
    const uid = $('#e-user').value, m = $('#e-month').value;
    const d = await api(`/schedule?uid=${uid}&month=${m}`);
    const [y,mo] = m.split('-').map(Number);
    const days = new Date(y,mo,0).getDate();
    MONTH_DATA = {};
    let rows='';
    for(let i=1;i<=days;i++){
      const date = `${m}-${pad(i)}`, w = new Date(y,mo-1,i).getDay();
      MONTH_DATA[date] = (d.entries[date] && d.entries[date].length) ? d.entries[date].map(e=>({...e})) : [];
      const list = (d.entries[date] && d.entries[date].length) ? d.entries[date] : [null];
      list.forEach((e, idx) => {
        rows += `<tr data-date="${date}" ${idx===0?`data-first="1" data-rows="${list.length}"`:''} class="${idx>0?'slot-extra':''}">
          ${idx===0 ? `<td class="c" rowspan-day style="width:30px">${i}</td><td class="c wd ${w===0?'sun':w===6?'sat':''}" style="width:28px">${WD[w]}</td>` : `<td class="c slot-cont" style="width:30px"></td><td class="c slot-cont" style="width:28px">〃</td>`}
          ${slotCells(e)}
        </tr>`;
      });
    }
    $('#e-grid').innerHTML = `<div class="sched-wrap"><table class="egrid">
      <tr><th>日</th><th>曜</th><th>種別</th><th>現場名</th><th>会場</th><th>IN</th><th>OUT</th><th>給与(手動)</th><th>備考</th><th></th></tr>${rows}</table></div>`;
    bindRowButtons();
    buildMobile(m, y, mo, days);
  }

  // スマホ用:日付セレクタ + 1日ぶんの縦フォーム
  function buildMobile(m, y, mo, days){
    const el = $('#e-mobile'); if(!el) return;
    let opts='';
    for(let i=1;i<=days;i++){
      const date=`${m}-${pad(i)}`, w=new Date(y,mo-1,i).getDay();
      const cnt=(MONTH_DATA[date]||[]).length;
      const mark = cnt? (MONTH_DATA[date][0].type==='work'?`● ${MONTH_DATA[date].map(s=>s.site||'現場').join('・')}`:'休') : '';
      opts+=`<option value="${date}">${mo}/${i}(${WD[w]}) ${mark}</option>`;
    }
    el.innerHTML = `<div class="me-pick"><label>日付</label><select id="me-date">${opts}</select></div>
      <div id="me-day"></div>`;
    $('#me-date').onchange = () => renderDay($('#me-date').value);
    renderDay($('#me-date').value);
  }

  // スマホ:選んだ日のフォームを描画
  function renderDay(date){
    const slots = MONTH_DATA[date] || [];
    const view = slots.length ? slots : [{type:''}];
    const block = (e,idx) => {
      const sel = v => e.type===v?'selected':'';
      return `<div class="me-slot" data-idx="${idx}">
        <div class="me-row"><label>種別</label>
          <select class="metype"><option value="">-(なし)</option>
            <option value="work" ${sel('work')}>現場</option><option value="off" ${sel('off')}>休暇</option>
            <option value="paid" ${sel('paid')}>有給</option><option value="ok" ${sel('ok')}>1日OK</option><option value="x" ${sel('x')}>×</option></select></div>
        <div class="me-fields">
          <div class="me-row"><label>現場名</label><input class="mesite" value="${h(e.site||'')}" placeholder="現場名"></div>
          <div class="me-row"><label>会場</label><input class="mevenue" value="${h(e.venue||'')}" placeholder="会場"></div>
          <div class="me-row"><label>IN</label><input class="mein" value="${h(e.tin||'')}" placeholder="10:15"></div>
          <div class="me-row"><label>OUT</label><input class="meout" value="${h(e.tout||'')}" placeholder="19:45"></div>
          <div class="me-row"><label>給与(手動)</label><input class="mepay" value="" placeholder="空欄=自動計算"></div>
          <div class="me-row"><label>備考</label><input class="menote" value="${h((e.note||'').replace(/\s*[（(][^（）()]*[）)]\s*$/,''))}" placeholder="物販頭 など"></div>
        </div>
        ${view.length>1?`<button class="btn danger xs me-del">この現場を削除</button>`:''}
      </div>`;
    };
    $('#me-day').innerHTML = `
      <div class="me-slots">${view.map(block).join('')}</div>
      <button class="btn ghost sm" id="me-add" style="margin-top:8px">＋ この日に現場を追加</button>
      <div class="row" style="margin-top:12px"><button class="btn gold" id="me-save">この日を保存</button><span id="me-msg"></span></div>`;
    bindDayForm(date);
  }

  function readDaySlots(){
    const out=[];
    document.querySelectorAll('#me-day .me-slot').forEach(s=>{
      out.push({
        type: s.querySelector('.metype').value,
        site: s.querySelector('.mesite').value.trim(),
        venue: s.querySelector('.mevenue').value.trim(),
        tin: s.querySelector('.mein').value.trim(),
        tout: s.querySelector('.meout').value.trim(),
        pay: s.querySelector('.mepay').value.trim(),
        note: s.querySelector('.menote').value.trim(),
      });
    });
    return out;
  }

  function bindDayForm(date){
    // 種別で現場欄の表示切替
    document.querySelectorAll('#me-day .me-slot').forEach(s=>{
      const t=s.querySelector('.metype'), f=s.querySelector('.me-fields');
      const upd=()=>{ f.style.display = (t.value==='work') ? 'block' : 'none'; };
      upd(); t.onchange=upd;
      const del=s.querySelector('.me-del'); if(del) del.onclick=()=>{ MONTH_DATA[date]=readDaySlots().filter((_,i)=>i!==Number(s.dataset.idx)); renderDay(date); };
    });
    $('#me-add').onclick=()=>{ MONTH_DATA[date]=[...readDaySlots(), {type:'work'}]; renderDay(date); };
    $('#me-save').onclick=async()=>{
      const uid=Number($('#e-user').value);
      const slots=readDaySlots();
      MONTH_DATA[date]=slots;
      try{
        let r = await api('/schedule',{method:'PUT',body:{uid,date,slots}});
        if(r.ok===0 && r.conflicts){
          if(!(await conflictModal(r.conflicts))) return;
          r = await api('/schedule',{method:'PUT',body:{uid,date,slots,force:true}});
        }
        // 保存後に再読込してマークを更新
        const m=$('#e-month').value; const d=await api(`/schedule?uid=${uid}&month=${m}`);
        MONTH_DATA[date]=(d.entries[date]||[]).map(e=>({...e}));
        const [y,mo]=m.split('-').map(Number); buildMobile(m,y,mo,new Date(y,mo,0).getDate());
        $('#me-date').value=date; renderDay(date);
        const uname=(USERS_CACHE||[]).find(u=>u.id===uid);
        popup(withWarnNote(`${uname?uname.name+' さんの ':''}${date} を保存しました。`, r));
      }catch(e){ popup(e.message, 'error'); }
    };
  }

  function bindRowButtons(){
    // ＋現場:同じ日の最後にスロット行を追加
    $('#e-grid').querySelectorAll('.add-slot').forEach(b => b.onclick = () => {
      const tr = b.closest('tr'); const date = tr.dataset.date;
      // その日の最後の行を探す
      const sameDay = [...$('#e-grid').querySelectorAll(`tr[data-date="${date}"]`)];
      const last = sameDay[sameDay.length-1];
      const nr = document.createElement('tr');
      nr.dataset.date = date; nr.className = 'slot-extra';
      nr.innerHTML = `<td class="c slot-cont" style="width:30px"></td><td class="c slot-cont" style="width:28px">〃</td>${slotCells({type:'work'})}`;
      last.after(nr); bindRowButtons();
    });
    // 削除:その行を消す(その日最後の1行なら空に戻す)
    $('#e-grid').querySelectorAll('.del-slot').forEach(b => b.onclick = () => {
      const tr = b.closest('tr'); const date = tr.dataset.date;
      const sameDay = [...$('#e-grid').querySelectorAll(`tr[data-date="${date}"]`)];
      if(sameDay.length<=1){ // 最後の1行 → 種別を「-」にしてクリア
        tr.querySelector('.etype').value=''; tr.querySelector('.esite').value='';
        tr.querySelector('.evenue').value=''; tr.querySelector('.ein').value='';
        tr.querySelector('.eout').value=''; tr.querySelector('.epay').value=''; tr.querySelector('.enote').value='';
      } else { tr.remove(); }
    });
  }

  $('#e-load').onclick = load;
  $('#e-user').onchange = load;
  $('#e-save').onclick = async () => {
    const uid = Number($('#e-user').value);
    const byDate = {};
    document.querySelectorAll('#e-grid tr[data-date]').forEach(tr => {
      const type = tr.querySelector('.etype').value;
      const date = tr.dataset.date;
      (byDate[date] ||= []).push({
        date, type,
        site: tr.querySelector('.esite').value.trim(),
        venue: tr.querySelector('.evenue').value.trim(),
        tin: tr.querySelector('.ein').value.trim(),
        tout: tr.querySelector('.eout').value.trim(),
        pay: tr.querySelector('.epay').value.trim(),
        note: tr.querySelector('.enote').value.trim()
      });
    });
    // entries形式(同日複数行)でまとめて送る
    const entries = [];
    for(const date of Object.keys(byDate)) for(const e of byDate[date]) entries.push(e);
    try{
      let r = await api('/schedule', { method:'PUT', body:{ uid, entries } });
      if(r.ok===0 && r.conflicts){
        if(!(await conflictModal(r.conflicts))){ return; }
        r = await api('/schedule', { method:'PUT', body:{ uid, entries, force:true } });
      }
      load();
      popup(withWarnNote('スケジュールを保存しました。', r));
    }catch(e){ popup(e.message, 'error'); }
  };
  load();
}

/* ===== 新人報告フォーム ===== */
function pageReportForm(app){
  const isChief = has('report_check');
  app.innerHTML = `
  <h2>新人報告</h2>
  <div class="card"><div class="form-grid">
    <div class="section-label">基本情報</div>
    <label>報告者名</label><input id="r-name" value="${h(ME.name)}" readonly style="background:#f0efe9">
    <label>獲得候補者名 *</label><input id="r-cand">
    <label>獲得候補者学年</label><select id="r-grade"><option></option>${['高1','高2','高3','大1','大2','大3','大4','専門','社会人','その他'].map(g=>`<option>${g}</option>`).join('')}</select>
    <label>次回現場名(分かれば)</label><input id="r-nsite" placeholder="スケジュールと一致すると現場メンバーに通知">
    <label>次回日付(分かれば)</label><input id="r-ndate" type="date">
    ${isChief ? '<div class="section-label">1次</div>' : '<div class="section-label">報告内容</div>'}
    <label>連絡したチーフ</label><input id="r-fchief">
    <label>所感(良かった点・課題点)</label><textarea id="r-fnote"></textarea>
    ${isChief ? `
    <div class="section-label">2次</div>
    <label>やる気・表情(5段階)</label><select id="r-mot">${[1,2,3,4,5].map(n=>`<option ${n===3?'selected':''}>${n}</option>`).join('')}</select>
    <label>受け答え(5段階)</label><select id="r-res">${[1,2,3,4,5].map(n=>`<option ${n===3?'selected':''}>${n}</option>`).join('')}</select>
    <label>総合点(10段階)</label><select id="r-tot">${[1,2,3,4,5,6,7,8,9,10].map(n=>`<option ${n===5?'selected':''}>${n}</option>`).join('')}</select>
    <label>ドラフト承認</label><select id="r-draft"><option>OK</option><option>不可</option><option selected>様子見</option></select>
    <label>今後の育成計画</label><textarea id="r-plan"></textarea>` : ''}
  </div>
  <div class="row" style="margin-top:16px"><button class="btn gold" id="r-submit">提出する</button><span id="r-msg"></span></div></div>`;
  $('#r-submit').onclick = async () => {
    const body = {
      candidate_name: $('#r-cand').value, candidate_grade: $('#r-grade').value,
      next_site: $('#r-nsite').value.trim(), next_date: $('#r-ndate').value,
      first_chief: $('#r-fchief').value, first_note: $('#r-fnote').value
    };
    if(isChief) Object.assign(body, { s_motivation:$('#r-mot').value, s_response:$('#r-res').value, s_total:$('#r-tot').value, draft:$('#r-draft').value, plan:$('#r-plan').value });
    try{
      await api('/reports', { method:'POST', body });
      $('#r-cand').value=''; $('#r-fnote').value='';
      popup('新人報告を提出しました。チーフ全員に通知されます。');
    }catch(e){ popup(e.message, 'error'); }
  };
}

/* ===== 報告一覧・2次チェック ===== */
async function pageReports(app){
  const rows = await api('/reports');
  app.innerHTML = `
  <h2>新人報告一覧</h2>
  <div class="card">
    <table class="list pc-only">
    <tr><th>日時</th><th>報告者</th><th>候補者</th><th>学年</th><th>状態</th><th>ドラフト</th><th>チェック者</th></tr>
    ${rows.map(r=>`<tr class="click" data-id="${r.id}">
      <td>${h(r.ts)}</td><td>${h(r.reporter_name)}</td><td><b>${h(r.candidate_name)}</b></td><td>${h(r.candidate_grade)}</td>
      <td><span class="tag ${r.status}">${r.status==='pending'?'2次未チェック':'チェック済'}</span></td>
      <td>${h(r.draft)}</td><td>${h(r.checker)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">報告はまだありません</td></tr>'}
    </table>
    <div class="cards sp-only">
    ${rows.map(r=>`<div class="dcard clickable" data-id="${r.id}">
      <div class="dcard-head"><span class="dcard-title">${h(r.candidate_name)}</span><span class="tag ${r.status}">${r.status==='pending'?'2次未チェック':'チェック済'}</span></div>
      <div class="drow"><span class="dk">報告者</span><span class="dv">${h(r.reporter_name)}</span></div>
      <div class="drow"><span class="dk">学年</span><span class="dv">${h(r.candidate_grade)||'—'}</span></div>
      ${r.draft?`<div class="drow"><span class="dk">ドラフト</span><span class="dv">${h(r.draft)}</span></div>`:''}
      ${r.checker?`<div class="drow"><span class="dk">チェック者</span><span class="dv">${h(r.checker)}</span></div>`:''}
      <div class="drow"><span class="dk">日時</span><span class="dv dcard-sub">${h(r.ts)}</span></div>
    </div>`).join('') || '<div class="muted">報告はまだありません</div>'}
    </div>
  </div>`;
  app.querySelectorAll('[data-id]').forEach(el => el.onclick = () => openReport(rows.find(r=>r.id==el.dataset.id)));
}

function openReport(r){
  const pending = r.status === 'pending';
  const canCheck = has('report_check'); // 2次チェックの記入・修正
  const canBlacklist = has('blacklist_manage'); // ブラックリスト登録
  modal(`<h3>新人報告 #${r.id} ${pending?'<span class="tag pending">2次未チェック</span>':'<span class="tag checked">チェック済</span>'}</h3>
  <dl class="kv">
    <dt>タイムスタンプ</dt><dd>${h(r.ts)}</dd>
    <dt>報告者名</dt><dd>${h(r.reporter_name)}</dd>
    <dt>獲得候補者名</dt><dd><b>${h(r.candidate_name)}</b></dd>
    <dt>学年</dt><dd>${h(r.candidate_grade)}</dd>
    <dt>次回現場</dt><dd>${h(r.next_date)} ${h(r.next_site)}</dd>
    <dt>1次 連絡したチーフ</dt><dd>${h(r.first_chief)}</dd>
    <dt>1次 所感</dt><dd>${h(r.first_note)}</dd>
    ${!pending ? `
    <dt>2次 やる気・表情</dt><dd>${r.s_motivation??''} / 5</dd>
    <dt>2次 受け答え</dt><dd>${r.s_response??''} / 5</dd>
    <dt>2次 総合点</dt><dd>${r.s_total??''} / 10</dd>
    <dt>2次 ドラフト承認</dt><dd><b>${h(r.draft)||'—'}</b></dd>
    <dt>2次 育成計画</dt><dd>${h(r.plan)}</dd>
    <dt>チーフチェック者</dt><dd>${h(r.checker)}</dd>` : ''}
  </dl>
  ${canCheck ? `
  <h3 style="margin-top:14px">${pending ? '2次チェックを入力' : '2次チェックを修正'}</h3>
  <div class="form-grid">
    <label>やる気・表情(5段階)</label><select id="c-mot">${[1,2,3,4,5].map(n=>`<option ${n===(r.s_motivation??3)?'selected':''}>${n}</option>`).join('')}</select>
    <label>受け答え(5段階)</label><select id="c-res">${[1,2,3,4,5].map(n=>`<option ${n===(r.s_response??3)?'selected':''}>${n}</option>`).join('')}</select>
    <label>総合点(10段階)</label><select id="c-tot">${[1,2,3,4,5,6,7,8,9,10].map(n=>`<option ${n===(r.s_total??5)?'selected':''}>${n}</option>`).join('')}</select>
    <label>ドラフト承認</label><select id="c-draft">${['OK','不可','様子見'].map(o=>`<option ${o===(r.draft||'様子見')?'selected':''}>${o}</option>`).join('')}</select>
    <label>今後の育成計画</label><textarea id="c-plan">${h(r.plan||'')}</textarea>
    <label>チーフチェック者名</label><input id="c-checker" value="${h(r.checker||ME.name)}">
  </div>
  <div class="row" style="margin-top:12px"><button class="btn gold" id="c-save">${pending ? 'チェック完了' : '修正を保存'}</button>${!pending?'<span class="muted" style="font-size:12px">※ ドラフト承認を「OK」にするとドラフト一覧に表示されます</span>':''}</div>`
  : (pending ? `<div class="msg" style="background:#f0efe9;padding:12px;border-radius:8px;margin-top:14px;font-size:13px">2次チェックはまだ行われていません。</div>` : '')}
  ${canBlacklist ? `<div class="row" style="margin-top:14px"><button class="btn danger sm" id="bl-add">ブラックリストに登録</button></div>` : ''}`);

  const cs = $('#c-save');
  if(cs) cs.onclick = async () => {
    const wasPending = pending;
    try{
      await api('/reports/'+r.id, { method:'PATCH', body:{
        s_motivation:$('#c-mot').value, s_response:$('#c-res').value, s_total:$('#c-tot').value,
        draft:$('#c-draft').value, plan:$('#c-plan').value, checker:$('#c-checker').value
      }});
      const draftMsg = $('#c-draft').value==='OK' ? 'ドラフト一覧に追加されました。' : '';
      closeModal(); render();
      popup((wasPending?'2次チェックを完了しました。':'2次チェックを更新しました。')+draftMsg);
    }catch(e){ popup(e.message, 'error'); }
  };
  const blAdd = $('#bl-add');
  if(blAdd) blAdd.onclick = async () => {
    if(!confirm(`「${r.candidate_name}」をブラックリストに登録しますか?(5段階評価・詳細はブラックリスト画面で追記できます)`)) return;
    try{
      await api('/blacklist', { method:'POST', body:{ name:r.candidate_name, reporter:r.reporter_name, reason:'' } });
      closeModal();
      popup('ブラックリストに登録しました。');
    }catch(e){ popup(e.message, 'error'); }
  };
}

/* ===== ドラフトリスト ===== */
async function pageDraft(app){
  if(!has('report_check')){ notFound(app); return; }
  const rows = (await api('/reports')).filter(r => r.draft === 'OK');
  app.innerHTML = `
  <h2>ドラフトあげる人リスト(新人報告で承認OK)</h2>
  <div class="card">
    <table class="list pc-only">
    <tr><th>候補者名</th><th>学年</th><th>総合点</th><th>報告者</th><th>チェック者</th><th>報告日時</th></tr>
    ${rows.map(r=>`<tr><td><b>${h(r.candidate_name)}</b></td><td>${h(r.candidate_grade)}</td><td>${r.s_total??''} / 10</td><td>${h(r.reporter_name)}</td><td>${h(r.checker)}</td><td>${h(r.ts)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">該当者はいません</td></tr>'}
    </table>
    <div class="cards sp-only">
    ${rows.map(r=>`<div class="dcard">
      <div class="dcard-head"><span class="dcard-title">${h(r.candidate_name)}</span><span class="tag checked">総合 ${r.s_total??'—'}/10</span></div>
      <div class="drow"><span class="dk">学年</span><span class="dv">${h(r.candidate_grade)||'—'}</span></div>
      <div class="drow"><span class="dk">報告者</span><span class="dv">${h(r.reporter_name)}</span></div>
      <div class="drow"><span class="dk">チェック者</span><span class="dv">${h(r.checker)}</span></div>
      <div class="drow"><span class="dk">報告日時</span><span class="dv dcard-sub">${h(r.ts)}</span></div>
    </div>`).join('') || '<div class="muted">該当者はいません</div>'}
    </div>
  </div>`;
}

/* ===== ブラックリスト ===== */
async function pageBlacklist(app){
  if(!has('blacklist_manage')){ notFound(app); return; }
  const rows = await api('/blacklist');
  const sc = id => `<select id="${id}" style="width:64px"><option value="">-</option>${[1,2,3,4,5].map(n=>`<option>${n}</option>`).join('')}</select>`;
  const scTh = ['会話','服装','身なり','遅刻','業務'];
  app.innerHTML = `
  <h2>ブラックリスト</h2>
  <div class="card">
    <h2 style="font-size:14px">新規提出 <span class="muted">(チーフ以上)</span></h2>
    <div class="form-grid" style="max-width:560px">
      <label>日付</label><input type="date" id="b-date" value="${jstToday()}">
      <label>報告者</label><input id="b-reporter" value="${h(ME.name)}">
      <label>名前 *</label><input id="b-name" placeholder="対象者の名前">
      <label>会話(5段階)</label>${sc('b-talk')}
      <label>服装(5段階)</label>${sc('b-dress')}
      <label>身なり(5段階)</label>${sc('b-groom')}
      <label>遅刻(5段階)</label>${sc('b-late')}
      <label>業務(5段階)</label>${sc('b-work')}
      <label>理由</label><textarea id="b-reason" placeholder="具体的な理由・エピソード"></textarea>
    </div>
    <div class="row" style="margin-top:14px"><button class="btn danger" id="b-add">提出する</button><span id="b-msg"></span></div>
  </div>
  <div class="card">
    <div class="sched-wrap pc-only"><table class="list">
    <tr><th>提出日時</th><th>日付</th><th>報告者</th><th>名前</th>${scTh.map(t=>`<th>${t}</th>`).join('')}<th>理由</th><th>登録者</th></tr>
    ${rows.map(r=>`<tr>
      <td>${h(r.ts)}</td><td>${h(r.date)}</td><td>${h(r.reporter)}</td><td><b>${h(r.name)}</b></td>
      <td class="c">${r.s_talk??''}</td><td class="c">${r.s_dress??''}</td><td class="c">${r.s_groom??''}</td><td class="c">${r.s_late??''}</td><td class="c">${r.s_work??''}</td>
      <td>${h(r.reason)}</td><td>${h(r.added_by)}</td></tr>`).join('') || '<tr><td colspan="11" class="muted">登録はありません</td></tr>'}
    </table></div>
    <div class="cards sp-only">
    ${rows.map(r=>{
      const sc2 = [['会話',r.s_talk],['服装',r.s_dress],['身なり',r.s_groom],['遅刻',r.s_late],['業務',r.s_work]].filter(x=>x[1]!=null);
      return `<div class="dcard">
      <div class="dcard-head"><span class="dcard-title">${h(r.name)}</span><span class="dcard-sub">${h(r.date)}</span></div>
      <div class="drow"><span class="dk">報告者</span><span class="dv">${h(r.reporter)}</span></div>
      ${sc2.length?`<div class="drow"><span class="dk">評価</span><span class="dv"><div class="dscore">${sc2.map(x=>`<span>${x[0]} ${x[1]}</span>`).join('')}</div></span></div>`:''}
      ${r.reason?`<div class="drow"><span class="dk">理由</span><span class="dv">${h(r.reason)}</span></div>`:''}
      <div class="drow"><span class="dk">登録者</span><span class="dv dcard-sub">${h(r.added_by)} / ${h(r.ts)}</span></div>
    </div>`;}).join('') || '<div class="muted">登録はありません</div>'}
    </div>
  </div>`;
  $('#b-add').onclick = async () => {
    const name = $('#b-name').value.trim();
    if(!name){ popup('名前は必須です', 'error'); return; }
    try{
      await api('/blacklist',{method:'POST',body:{
        date:$('#b-date').value, reporter:$('#b-reporter').value.trim(), name,
        s_talk:$('#b-talk').value, s_dress:$('#b-dress').value, s_groom:$('#b-groom').value,
        s_late:$('#b-late').value, s_work:$('#b-work').value, reason:$('#b-reason').value
      }});
      render();
      popup('ブラックリストに登録しました。');
    }catch(e){ popup(e.message, 'error'); }
  };
}

/* ===== 手配者専用ページ ===== */
/* ===== スプレッドシート取り込み(import_data権限・専用ページ) ===== */
async function pageImport(app){
  if(!has('import_data')){ notFound(app); return; }
  app.innerHTML = `
  <h2 style="margin-bottom:8px">📥 スプレッドシートから取り込み <span class="muted" style="font-weight:400;font-size:13px">(IN/OUT・現場・会場)</span></h2>
  <div class="card">
    <div class="muted" style="margin-bottom:8px">対象シートを「リンクを知る全員が閲覧可」にしてからURLを貼ってください。複数URLは改行で区切れます。取り込んだ内容はアプリに保存され、後でシートを非公開に戻しても残ります。</div>
    <textarea id="imp-urls" placeholder="https://docs.google.com/spreadsheets/d/.../edit?gid=...&#10;https://docs.google.com/spreadsheets/d/.../edit?gid=..." style="width:100%;min-height:80px;font-family:monospace;font-size:12px"></textarea>
    <div class="row" style="margin-top:8px;flex-wrap:wrap">
      <label>対象月 <input type="month" id="imp-month" value="${MONTH}"></label>
      <label>対象日(IN/OUT台帳用・シートの日付欄が空の場合に使用) <input type="date" id="imp-date" value="${jstToday()}"></label>
      <label>フォーマット
        <select id="imp-format">
          <option value="auto">自動判定</option>
          <option value="C">IN/OUT表(勤務表)</option>
          <option value="AB">個人スケジュール(月間表)</option>
        </select>
      </label>
      <label><input type="checkbox" id="imp-add"> 既存に追加(同日を置き換えない)</label>
      <label><input type="checkbox" id="imp-save" checked> URLを保存する</label>
      <button class="btn gold" id="imp-run">取り込み実行</button>
    </div>
    <div class="muted" style="margin-top:6px">💡 IN/OUT台帳は基本的に「1ファイル=1日分」です。シート内の日付が自動で読み取れない場合、この「対象日」がその日の日付として使われます。1ファイルに複数日が混在する場合は、日付ごとにURLを分けて取り込んでください。</div>
    <div id="imp-result" style="margin-top:10px"></div>
    <div id="imp-saved" class="muted" style="margin-top:8px"></div>
  </div>`;

  const showSaved = async () => {
    try{
      const d = await api('/import-urls');
      const el = $('#imp-saved'); if(!el) return;
      if(!d.urls.length){ el.innerHTML = '保存済みURLはありません'; return; }
      el.innerHTML = `<div style="margin-bottom:6px">保存済みURL (${d.urls.length}件): <button class="btn ghost xs" id="imp-clear-all">すべて削除</button></div>` +
        d.urls.map(u=>`<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          <span style="font-family:monospace;font-size:11px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h(u)}</span>
          <button class="btn ghost xs imp-del-one" data-url="${h(u)}">削除</button>
        </div>`).join('');
      const ca = $('#imp-clear-all');
      if(ca) ca.onclick = async () => {
        if(!confirm('保存済みURLをすべて削除しますか？\n\n※取り込み済みのスケジュール・給与データ・保管した台帳は残ります。次回また取り込む際にURLを貼り直す必要があるだけです。')) return;
        try{ await api('/import-urls/delete',{method:'POST',body:{all:true}}); popup('保存済みURLをすべて削除しました'); showSaved(); }
        catch(e){ popup(e.message,'error'); }
      };
      el.querySelectorAll('.imp-del-one').forEach(b => b.onclick = async () => {
        try{ await api('/import-urls/delete',{method:'POST',body:{url:b.dataset.url}}); popup('URLを削除しました'); showSaved(); }
        catch(e){ popup(e.message,'error'); }
      });
    }catch(_){}
  };
  showSaved();
  $('#imp-run').onclick = async () => {
    const urls = $('#imp-urls').value.split(/\s+/).map(s=>s.trim()).filter(Boolean);
    if(!urls.length){ $('#imp-result').innerHTML='<span class="msg err">URLを入力してください</span>'; return; }
    $('#imp-run').disabled = true; $('#imp-result').innerHTML = '<span class="muted">取り込み中…（全シートを読み込むため少し時間がかかります）</span>';
    try{
      const d = await api('/import-from-url', { method:'POST', body:{
        urls, month: $('#imp-month').value, date: $('#imp-date').value, format: $('#imp-format').value,
        add: $('#imp-add').checked, save: $('#imp-save').checked
      }});
      $('#imp-result').innerHTML = d.results.map(r=>{
        const short = r.url.length>60 ? r.url.slice(0,60)+'…' : r.url;
        if(!r.ok) return `<div class="imp-card imp-card-err">
          <div class="imp-card-url">${h(short)}</div>
          <div class="msg err" style="margin-top:4px">${h(r.error)}</div>
        </div>`;
        const errs = r.errors&&r.errors.length ? `<div class="muted" style="margin-top:4px">注意: ${r.errors.slice(0,5).map(h).join(' / ')}${r.errors.length>5?` ほか${r.errors.length-5}件`:''}</div>` : '';
        const arch = r.archived ? '<div class="muted" style="margin-top:4px">📦 台帳をサーバーに保管しました</div>' : (r.archiveError?`<div class="muted" style="margin-top:4px">⚠️保管失敗:${h(r.archiveError)}</div>`:'');
        const shList = r.sheets&&r.sheets.length ? `<div class="muted" style="margin-top:4px">シート: ${r.sheets.map(s=>`${h(s.name)}(${s.count})`).join(' / ')}</div>` : '';
        const skipDetail = (r.skippedUnregistered||r.skippedUnchanged||r.skippedInvalid) ? `<div class="muted" style="margin-top:4px">内訳: 未登録 ${r.skippedUnregistered||0}件 / 変更なし ${r.skippedUnchanged||0}件 / 不正な行 ${r.skippedInvalid||0}件</div>` : '';
        return `<div class="imp-card">
          <div class="imp-card-url">${h(short)}</div>
          <div class="msg ok" style="margin-top:4px">${r.sheetsRead||1}シート読込 / 反映 ${r.applied} / スキップ ${r.skipped}</div>
          ${skipDetail}${shList}${errs}${arch}
        </div>`;
      }).join('');
      showSaved();
    }catch(e){ $('#imp-result').innerHTML = `<span class="msg err">${h(e.message)}</span>`; }
    $('#imp-run').disabled = false;
  };
}

/* ===== ログイン中メンバー・編集履歴(handler_tools権限・専用ページ) ===== */
async function pageHandlerStatus(app){
  if(!has('handler_tools')){ notFound(app); return; }
  const stHs = PAGE_STATE.handlerStatus || (PAGE_STATE.handlerStatus = { open:{ online:true } });
  const openSet = stHs.open;
  const sec = (id,title,body)=>`<details class="adm-sec" id="hssec-${id}" data-sec="${id}" ${openSet[id]?'open':''}><summary>${title}</summary><div class="adm-body">${body}</div></details>`;
  app.innerHTML = `
  <h2 style="margin-bottom:8px">ログイン中メンバー・編集履歴</h2>
  <div class="adm-nav">
    ${[['online','🟢 ログイン中'],['hist','📝 編集履歴']].map(s=>`<button class="adm-chip" data-jump="${s[0]}">${s[1]}</button>`).join('')}
  </div>
  ${sec('online','🟢 現在ログイン中のメンバー <span class="muted" style="font-weight:400">(10秒ごとに自動更新)</span>', `<div id="hd-online" class="muted">読み込み中…</div>`)}
  ${sec('hist','📝 スケジュール編集履歴 <span class="muted" style="font-weight:400">(直近150件)</span>', `<div id="hd-history" class="muted">読み込み中…</div>`)}`;

  app.querySelectorAll('.adm-sec').forEach(d => d.addEventListener('toggle', () => { stHs.open[d.dataset.sec] = d.open; }));
  app.querySelectorAll('[data-jump]').forEach(b => b.onclick = () => {
    const d = document.getElementById('hssec-'+b.dataset.jump);
    if(d){ d.open = true; stHs.open[b.dataset.jump] = true; d.scrollIntoView({behavior:'smooth', block:'start'}); }
  });

  const fmtAgo = ms => { const s = Math.floor((Date.now()-ms)/1000); return s<60?'たった今':Math.floor(s/60)+'分前'; };
  const summarize = (b, a) => {
    // 想定外の形式が来ても、生のJSON文字列やコードをそのまま表示しないよう、常に安全な文言にフォールバックする
    const p = j => {
      if (j == null) return {};
      if (typeof j === 'object') return j; // 既にオブジェクトならそのまま
      try{ const v = JSON.parse(j); return (v && typeof v === 'object') ? v : {}; }catch(_){ return {}; }
    };
    const typeLabel = { off:'休暇', paid:'有給', ok:'1日OK', x:'×' };
    const descSlot = s => {
      if(!s || typeof s !== 'object') return '(空)';
      if(!s.type) return '(空)';
      if(s.type === 'work') return `現場「${String(s.site||'')}」${String(s.tin||'')}-${String(s.tout||'')}`;
      return typeLabel[s.type] || '(その他)';
    };
    const desc = o => {
      if(!o || typeof o !== 'object') return '(空)';
      if(o.plan!==undefined && o.type===undefined) return `育成計画「${String(o.plan||'(空)').slice(0,200)}」`;
      let slots = Array.isArray(o) ? o : (o.slots !== undefined ? (typeof o.slots==='string'?p(o.slots):o.slots) : (o.type?[o]:[]));
      if(!Array.isArray(slots)) slots = [];
      if(!slots.length) return '(空)';
      return slots.map(descSlot).join(' / ');
    };
    const ao = p(a);
    const src = (ao && typeof ao==='object' && ao._src) ? `[${String(ao._src).slice(0,60)}] ` : '';
    return src + `${desc(p(b))} → ${desc(ao)}`;
  };
  const loadOnline = async () => {
    try{
      const rows = await api('/online');
      const el = $('#hd-online'); if(!el) return;
      el.innerHTML = rows.length ? `<table class="list pc-only"><tr><th></th><th>氏名</th><th>役割</th><th>登録番号</th><th>最終アクセス</th></tr>
        ${rows.map(r=>`<tr><td class="c"><span class="online-dot pulse"></span></td><td>${r.uid?`<span class="name-link" data-goto-uid="${r.uid}">${h(r.name)}</span>`:h(r.name)}</td>
        <td><span class="tag ${r.role}">${roleLabel(r)}</span>${r.handler?' <span class="tag handler">手配モード中</span>':''}</td>
        <td>${h(r.regno)}</td><td>${fmtAgo(r.last_seen)}</td></tr>`).join('')}</table>
        <div class="cards sp-only">${rows.map(r=>`<div class="dcard">
          <div class="dcard-head"><span class="dcard-title"><span class="online-dot pulse"></span> ${r.uid?`<span class="name-link" data-goto-uid="${r.uid}">${h(r.name)}</span>`:h(r.name)}</span><span class="tag ${r.role}">${roleLabel(r)}</span></div>
          <div class="drow"><span class="dk">登録番号</span><span class="dv">${h(r.regno)}</span></div>
          <div class="drow"><span class="dk">最終アクセス</span><span class="dv">${fmtAgo(r.last_seen)}${r.handler?' / 手配モード中':''}</span></div>
        </div>`).join('')}</div>` : '<div class="muted">現在ログイン中のメンバーはいません</div>';
      wireNameLinks(el);
    }catch(_){}
  };
  loadOnline();
  timers.push(setInterval(loadOnline, 10000));

  const hist = await api('/history');
  $('#hd-history').innerHTML = hist.length ? `<div class="sched-wrap pc-only"><table class="list">
    <tr><th>日時</th><th>編集者</th><th>対象メンバー</th><th>対象日</th><th>変更内容</th></tr>
    ${hist.map(x=>`<tr><td>${h(x.ts)}</td><td>${h(x.editor_name)}</td><td>${x.target_id?`<span class="name-link" data-goto-uid="${x.target_id}">${h(x.target_name)}</span>`:h(x.target_name)}</td><td>${h(x.date)}</td><td>${h(summarize(x.before_json, x.after_json))}</td></tr>`).join('')}
  </table></div>
  <div class="cards sp-only">${hist.map(x=>`<div class="dcard">
    <div class="dcard-head"><span class="dcard-title">${x.target_id?`<span class="name-link" data-goto-uid="${x.target_id}">${h(x.target_name)}</span>`:h(x.target_name)} / ${h(x.date)}</span><span class="dcard-sub">${h(x.editor_name)}</span></div>
    <div class="drow"><span class="dk">変更</span><span class="dv">${h(summarize(x.before_json, x.after_json))}</span></div>
    <div class="drow"><span class="dk">日時</span><span class="dv dcard-sub">${h(x.ts)}</span></div>
  </div>`).join('')}</div>` : '<div class="muted">編集履歴はありません</div>';
  wireNameLinks($('#hd-history'));
}

/* ===== ロール一括権限の編集(管理者のみ・専用ページ) ===== */
async function pageRolePermissions(app){
  if(!has('account_manage')){ notFound(app); return; }
  app.innerHTML = '<h2>権限の一括設定</h2><div class="card"><div class="muted">読み込み中…</div></div>';
  let defs;
  try{ defs = await api('/perm-defs'); }
  catch(e){ app.innerHTML = `<h2>権限の一括設定</h2><div class="card"><div class="msg err">${h(e.message)}</div></div>`; return; }

  const roles = [
    { key:'member', label:'メンツ全員' },
    { key:'chief', label:'チーフ全員' },
    { key:'handler', label:'チーフ(手配者)全員' },
  ];
  app.innerHTML = `
  <div style="margin-bottom:14px"><a href="#/admin" class="btn ghost sm">← アカウント管理に戻る</a></div>
  <h2 style="margin-bottom:4px">権限の一括設定</h2>
  <div class="muted" style="margin-bottom:16px">役割ごとに、全員へまとめて追加権限を付与・解除できます。チェックを入れて保存すると、その役割の<b>全員</b>に反映されます(個別に設定した権限とは別に重ねて適用されます)。</div>
  <div class="adm-nav">
    ${roles.map(r=>`<button class="adm-chip" data-jump="role-${r.key}">${r.label}</button>`).join('')}
  </div>
  ${roles.map(r=>`<details class="adm-sec" id="rsec-${r.key}" data-sec="${r.key}">
    <summary>${r.label}の追加権限</summary>
    <div class="adm-body">
      <div class="muted" style="margin-bottom:10px">対象: <span id="rcount-${r.key}">—</span></div>
      <div id="rlist-${r.key}"></div>
      <div class="row" style="margin-top:14px;gap:8px;align-items:center">
        <button class="btn gold sm" data-save="${r.key}">${r.label}に反映する</button>
        <span class="muted" id="rmsg-${r.key}"></span>
      </div>
    </div>
  </details>`).join('')}`;

  app.querySelectorAll('.adm-sec').forEach(d => { /* no persisted open-state needed here */ });
  app.querySelectorAll('[data-jump]').forEach(b => b.onclick = () => {
    const d = document.getElementById('rsec-'+b.dataset.jump);
    if(d){ d.open = true; d.scrollIntoView({behavior:'smooth', block:'start'}); }
  });

  for(const r of roles){
    let cur;
    try{ cur = await api(`/role-perms/${r.key}`); }
    catch(e){ $('#rlist-'+r.key).innerHTML = `<div class="msg err">${h(e.message)}</div>`; continue; }
    $('#rcount-'+r.key).textContent = `${cur.count}人`;
    const listEl = $('#rlist-'+r.key);
    listEl.innerHTML = defs.perms.map(p=>{
      const already = p.baseLv <= LV[r.key]; // この役割の基本権限で既に使える機能
      const checked = already || cur.perms.includes(p.key);
      return `<label style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line);${already?'opacity:.5':''}">
        <input type="checkbox" class="rperm-cb-${r.key}" value="${p.key}" ${checked?'checked':''} ${already?'disabled':''} style="width:18px;height:18px">
        <span style="flex:1">${h(p.label)}</span>
        ${already?'<span class="tag" style="font-size:11px">標準で利用可</span>':''}
      </label>`;
    }).join('');
  }

  app.querySelectorAll('[data-save]').forEach(btn => btn.onclick = async () => {
    const role = btn.dataset.save;
    const keys = [...document.querySelectorAll(`.rperm-cb-${role}:not(:disabled)`)].filter(c=>c.checked).map(c=>c.value);
    const msgEl = $('#rmsg-'+role);
    msgEl.textContent = '保存中…';
    try{
      const r = await api(`/role-perms/${role}`, { method:'PUT', body:{ perms: keys } });
      msgEl.textContent = `${r.updated}人に反映しました`;
      popup('一括で権限を反映しました');
    }catch(e){ msgEl.textContent = e.message; }
  });
}

/* ===== 個別権限の編集(管理者のみ・専用ページ) ===== */
async function pagePermissions(app, hash){
  const canPerms = has('account_manage');
  const canNotify = has('wage_settings');
  if(!canPerms && !canNotify){ notFound(app); return; }
  const uid = Number(hash.split('/')[2]);
  if(!uid){ notFound(app); return; }
  app.innerHTML = '<h2>権限編集</h2><div class="card"><div class="muted">読み込み中…</div></div>';
  let data = null, defs = null, baseUser = null;
  try{
    const users = await getUsers();
    baseUser = users.find(u => u.id === uid);
    if(!baseUser) throw new Error('ユーザーが見つかりません');
    if(canPerms){
      [data, defs] = await Promise.all([ api(`/users/${uid}/perms`), api('/perm-defs') ]);
    }
  }catch(e){ app.innerHTML = `<h2>権限編集</h2><div class="card"><div class="msg err">${h(e.message)}</div></div>`; return; }
  const roleForDisplay = data ? data.role : baseUser.role;
  const baseLvOfMe = LV[roleForDisplay] ?? 0;
  app.innerHTML = `
  <div style="margin-bottom:14px"><a href="#/admin" class="btn ghost sm">← アカウント管理に戻る</a></div>
  <h2 style="margin-bottom:4px">権限編集</h2>
  <div class="muted" style="margin-bottom:16px">${h(baseUser.name)} さん（登録番号 ${h(baseUser.regno)} / ${h(roleLabel({role:roleForDisplay}))}）の設定を行います。</div>

  ${canPerms ? `
  <div class="card" style="margin-bottom:16px">
    <h2 style="font-size:14px;margin-bottom:10px">追加権限</h2>
    <div class="muted" style="margin-bottom:14px">この人の基本権限（${h(roleLabel({role:roleForDisplay}))}）で既に使える機能にはチェックを入れられません。下記はそれ以外に「追加で」使えるようにする機能です。</div>
    <div id="perm-list"></div>
    <div class="row" style="margin-top:18px;gap:8px;align-items:center">
      <button class="btn gold" id="perm-save">保存する</button>
      <span id="perm-msg" class="muted"></span>
    </div>
  </div>` : ''}

  ${canNotify ? `
  <div class="card">
    <h2 style="font-size:14px;margin-bottom:10px">新人報告リマインドの個人設定</h2>
    <div class="muted" style="margin-bottom:14px">「その日、現場に入っている」チーフ以上の人には毎日21時ごろに新人報告のリマインドが届きます。役割に関わらず、この人だけ個別に対象へ含めたり外したりできます。</div>
    <div class="form-grid" style="max-width:480px">
      <label>この人への送信</label>
      <select id="nr-select">
        <option value="">基本ルールに従う（役割で自動判定）</option>
        <option value="1">常に対象にする（役割に関わらず）</option>
        <option value="0">常に対象外にする（役割に関わらず）</option>
      </select>
    </div>
    <div class="row" style="margin-top:14px;gap:8px;align-items:center">
      <button class="btn gold sm" id="nr-save">保存する</button>
      <span id="nr-msg" class="muted"></span>
    </div>
  </div>` : ''}
  `;

  if(canPerms){
    const list = $('#perm-list');
    list.innerHTML = defs.perms.map(p => {
      const already = baseLvOfMe >= p.baseLv; // 基本権限で既に使える
      const checked = already || data.extraPerms.includes(p.key);
      return `<label style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line);${already?'opacity:.5':''}">
        <input type="checkbox" class="perm-cb" value="${p.key}" ${checked?'checked':''} ${already?'disabled':''} style="width:18px;height:18px">
        <span style="flex:1">${h(p.label)}</span>
        ${already?'<span class="tag" style="font-size:11px">標準で利用可</span>':''}
      </label>`;
    }).join('');
    $('#perm-save').onclick = async () => {
      const keys = [...document.querySelectorAll('.perm-cb:not(:disabled)')].filter(c=>c.checked).map(c=>c.value);
      $('#perm-msg').textContent = '保存中…';
      try{ await api(`/users/${uid}/perms`, {method:'PUT', body:{perms:keys}}); $('#perm-msg').textContent='保存しました'; popup('権限を保存しました'); }
      catch(e){ $('#perm-msg').textContent = e.message; }
    };
  }

  if(canNotify){
    const sel = $('#nr-select');
    const cur = baseUser.notify_rookie;
    sel.value = cur === 1 ? '1' : cur === 0 ? '0' : '';
    $('#nr-save').onclick = async () => {
      const v = sel.value === '' ? null : Number(sel.value);
      $('#nr-msg').textContent = '保存中…';
      try{ await api(`/users/${uid}`, {method:'PATCH', body:{notify_rookie:v}}); $('#nr-msg').textContent='保存しました'; popup('通知設定を保存しました'); }
      catch(e){ $('#nr-msg').textContent = e.message; }
    };
  }
}

/* ===== 台帳保管(管理者のみ) ===== */
/* ===== 予定表ソース管理(管理者・wage_settings権限のみ) ===== */
async function pageSchedSources(app){
  if(!has('wage_settings')){ notFound(app); return; }
  app.innerHTML = '<h2>📥 予定表ソース管理</h2><div class="card"><div class="muted">読み込み中…</div></div>';
  let data;
  try{ data = await api('/sched-sources'); }
  catch(e){ app.innerHTML = `<h2>📥 予定表ソース管理</h2><div class="card"><div class="msg err">${h(e.message)}</div></div>`; return; }
  const sources = data.sources || [];

  const freqLabel = s => s.freqType==='daily' ? `毎日 ${String(s.hour).padStart(2,'0')}:00` : `${s.intervalHours}時間ごと`;

  app.innerHTML = `
  <h2 style="margin-bottom:4px">📥 予定表ソース管理</h2>
  <div class="muted" style="margin-bottom:16px">チーフ予定・1課予定など、自動で取り込む予定表を何個でも登録できます。取り込み日から<b>2日後以降の日付のみ</b>反映され(当日・翌日は台帳の実績取り込みを優先)、時刻情報のない表のため現場名・会場名・×・休暇のみ反映されます。反映があった場合、管理者へ通知が届きます。</div>

  <div class="card" style="margin-bottom:16px">
    <h2 style="font-size:14px;margin-bottom:10px">＋ 新しい予定表ソースを追加</h2>
    <div class="form-grid" style="max-width:640px">
      <label>名前</label>
      <input id="ss-new-label" placeholder="例: 2課スケジュール表">
      <label>スプレッドシートURL</label>
      <input id="ss-new-url" placeholder="https://docs.google.com/spreadsheets/d/..." style="font-family:monospace;font-size:12px">
      <label>取り込み頻度</label>
      <select id="ss-new-freqtype" class="ss-new-freqtype">
        <option value="interval">N時間ごとにチェック</option>
        <option value="daily">1日1回、決まった時刻のみ</option>
      </select>
      <label class="ss-new-interval-row">間隔</label>
      <select id="ss-new-interval" class="ss-new-interval-row">
        <option value="1">1時間ごと</option>
        <option value="2">2時間ごと</option>
        <option value="3">3時間ごと</option>
        <option value="6">6時間ごと</option>
        <option value="12">12時間ごと</option>
        <option value="24">24時間ごと</option>
      </select>
      <label class="ss-new-hour-row" style="display:none">実行時刻</label>
      <select id="ss-new-hour" class="ss-new-hour-row" style="display:none">${Array.from({length:24},(_,i)=>`<option value="${i}">${String(i).padStart(2,'0')}:00</option>`).join('')}</select>
      <label>管理者へ通知</label>
      <label style="font-weight:400;display:flex;align-items:center;gap:8px"><input type="checkbox" id="ss-new-notify" checked style="width:auto"> 反映があった時に通知する</label>
    </div>
    <div class="row" style="margin-top:12px;gap:8px;align-items:center">
      <button class="btn gold sm" id="ss-add">追加する</button>
      <span class="muted" id="ss-add-msg"></span>
    </div>
  </div>

  ${sources.length ? sources.map(s => `
  <div class="card" style="margin-bottom:14px" data-id="${s.id}">
    <div class="row" style="justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
      <div style="flex:1;min-width:200px">
        <div style="font-weight:700;font-size:15px">${h(s.label)} ${s.enabled?'':'<span class="tag" style="font-size:11px">停止中</span>'}</div>
        <div class="muted" style="font-family:monospace;font-size:11px;margin-top:2px;overflow-wrap:break-word;word-break:break-all">${h(s.url)}</div>
      </div>
      <div class="row" style="gap:6px">
        <button class="btn ghost sm ss-edit-toggle" data-id="${s.id}">編集</button>
        <button class="btn ghost sm ss-run" data-id="${s.id}">今すぐ取り込む</button>
        <button class="btn danger sm ss-del" data-id="${s.id}">削除</button>
      </div>
    </div>
    <div class="muted" style="margin-top:8px">頻度: ${freqLabel(s)} / 通知: ${s.notifyAdmin?'する':'しない'}</div>
    <div class="muted" style="margin-top:4px">
      ${s.lastRun ? `最終実行: ${h(s.lastRun)}` : 'まだ実行されていません'}
      ${s.lastResult ? `<br>結果: 反映 ${s.lastResult.applied}件 / スキップ ${s.lastResult.skipped}件${s.lastResult.changedPeople!=null?` / 変更あり ${s.lastResult.changedPeople}人・変更なし ${s.lastResult.unchangedPeople}人`:''}${s.lastResult.error?` <span style="color:#b85042">エラー: ${h(s.lastResult.error)}</span>`:''}` : ''}
    </div>
    <span class="ss-msg muted" data-id="${s.id}" style="display:block;margin-top:6px"></span>

    <div class="ss-edit-form" data-id="${s.id}" style="display:none;margin-top:14px;border-top:1px solid var(--line);padding-top:14px">
      <div class="form-grid" style="max-width:640px">
        <label>名前</label>
        <input class="ss-e-label" data-id="${s.id}" value="${h(s.label)}">
        <label>スプレッドシートURL</label>
        <input class="ss-e-url" data-id="${s.id}" value="${h(s.url)}" style="font-family:monospace;font-size:12px">
        <label>有効</label>
        <label style="font-weight:400;display:flex;align-items:center;gap:8px"><input type="checkbox" class="ss-e-enabled" data-id="${s.id}" ${s.enabled?'checked':''} style="width:auto"> このソースを有効にする</label>
        <label>取り込み頻度</label>
        <select class="ss-e-freqtype" data-id="${s.id}">
          <option value="interval" ${s.freqType==='interval'?'selected':''}>N時間ごとにチェック</option>
          <option value="daily" ${s.freqType==='daily'?'selected':''}>1日1回、決まった時刻のみ</option>
        </select>
        <label class="ss-e-interval-row" data-id="${s.id}" style="${s.freqType==='daily'?'display:none':''}">間隔</label>
        <select class="ss-e-interval ss-e-interval-row" data-id="${s.id}" style="${s.freqType==='daily'?'display:none':''}">
          ${[1,2,3,6,12,24].map(n=>`<option value="${n}" ${s.intervalHours===n?'selected':''}>${n}時間ごと</option>`).join('')}
        </select>
        <label class="ss-e-hour-row" data-id="${s.id}" style="${s.freqType==='daily'?'':'display:none'}">実行時刻</label>
        <select class="ss-e-hour ss-e-hour-row" data-id="${s.id}" style="${s.freqType==='daily'?'':'display:none'}">${Array.from({length:24},(_,i)=>`<option value="${i}" ${s.hour===i?'selected':''}>${String(i).padStart(2,'0')}:00</option>`).join('')}</select>
        <label>管理者へ通知</label>
        <label style="font-weight:400;display:flex;align-items:center;gap:8px"><input type="checkbox" class="ss-e-notify" data-id="${s.id}" ${s.notifyAdmin?'checked':''} style="width:auto"> 反映があった時に通知する</label>
      </div>
      <div class="row" style="margin-top:10px"><button class="btn gold sm ss-save" data-id="${s.id}">保存する</button></div>
    </div>
  </div>`).join('') : '<div class="card"><div class="muted" style="text-align:center;padding:20px 0">まだ予定表ソースが登録されていません。上のフォームから追加してください。</div></div>'}
  `;

  // 新規追加フォームの頻度切替
  const newFreqSel = $('#ss-new-freqtype');
  if(newFreqSel) newFreqSel.onchange = () => {
    const daily = newFreqSel.value === 'daily';
    document.querySelectorAll('.ss-new-interval-row').forEach(el=>el.style.display = daily?'none':'');
    document.querySelectorAll('.ss-new-hour-row').forEach(el=>el.style.display = daily?'':'none');
  };

  // 新規追加
  const addBtn = $('#ss-add');
  if(addBtn) addBtn.onclick = async () => {
    const label = $('#ss-new-label').value.trim();
    const url = $('#ss-new-url').value.trim();
    const freqType = $('#ss-new-freqtype').value;
    const intervalHours = Number($('#ss-new-interval').value);
    const hour = Number($('#ss-new-hour').value);
    const notifyAdmin = $('#ss-new-notify').checked;
    if(!label || !url){ $('#ss-add-msg').textContent='名前とURLを入力してください'; return; }
    $('#ss-add-msg').textContent='追加中…';
    try{
      await api('/sched-sources',{method:'POST',body:{label,url,freqType,intervalHours,hour,notifyAdmin}});
      popup('予定表ソースを追加しました');
      pageSchedSources(app);
    }catch(e){ $('#ss-add-msg').textContent = e.message; }
  };

  // 編集フォームの開閉
  document.querySelectorAll('.ss-edit-toggle').forEach(btn => btn.onclick = () => {
    const id = btn.dataset.id;
    const form = document.querySelector(`.ss-edit-form[data-id="${id}"]`);
    if(form) form.style.display = form.style.display==='none' ? '' : 'none';
  });

  // 編集フォーム内の頻度切替
  document.querySelectorAll('.ss-e-freqtype').forEach(sel => sel.onchange = () => {
    const id = sel.dataset.id;
    const daily = sel.value === 'daily';
    document.querySelectorAll(`.ss-e-interval-row[data-id="${id}"]`).forEach(el=>el.style.display = daily?'none':'');
    document.querySelectorAll(`.ss-e-hour-row[data-id="${id}"]`).forEach(el=>el.style.display = daily?'':'none');
  });

  // 保存
  document.querySelectorAll('.ss-save').forEach(btn => btn.onclick = async () => {
    const id = btn.dataset.id;
    const label = document.querySelector(`.ss-e-label[data-id="${id}"]`).value.trim();
    const url = document.querySelector(`.ss-e-url[data-id="${id}"]`).value.trim();
    const enabled = document.querySelector(`.ss-e-enabled[data-id="${id}"]`).checked;
    const freqType = document.querySelector(`.ss-e-freqtype[data-id="${id}"]`).value;
    const intervalHours = Number(document.querySelector(`.ss-e-interval[data-id="${id}"]`).value);
    const hour = Number(document.querySelector(`.ss-e-hour[data-id="${id}"]`).value);
    const notifyAdmin = document.querySelector(`.ss-e-notify[data-id="${id}"]`).checked;
    const msgEl = document.querySelector(`.ss-msg[data-id="${id}"]`);
    if(!label || !url){ if(msgEl) msgEl.textContent='名前とURLを入力してください'; return; }
    if(msgEl) msgEl.textContent='保存中…';
    try{
      await api(`/sched-sources/${id}`,{method:'PUT',body:{label,url,enabled,freqType,intervalHours,hour,notifyAdmin}});
      popup('保存しました');
      pageSchedSources(app);
    }catch(e){ if(msgEl) msgEl.textContent = e.message; }
  });

  // 今すぐ取り込む
  document.querySelectorAll('.ss-run').forEach(btn => btn.onclick = async () => {
    const id = btn.dataset.id;
    const msgEl = document.querySelector(`.ss-msg[data-id="${id}"]`);
    btn.disabled = true; if(msgEl) msgEl.textContent='取り込み中…（少し時間がかかります）';
    try{
      const r = await api(`/sched-sources/${id}/run`,{method:'POST'});
      if(msgEl) msgEl.textContent = `対象日 ${r.fromDate} 以降: 反映 ${r.applied}件 / スキップ ${r.skipped}件`;
      popup(`取り込みました(反映${r.applied}件)`);
      pageSchedSources(app);
    }catch(e){ if(msgEl) msgEl.textContent = e.message; }
    finally{ btn.disabled = false; }
  });

  // 削除
  document.querySelectorAll('.ss-del').forEach(btn => btn.onclick = async () => {
    const id = btn.dataset.id;
    if(!confirm('この予定表ソースを削除しますか？\n\n※既に取り込まれたスケジュールデータは残ります。')) return;
    try{ await api(`/sched-sources/${id}`,{method:'DELETE'}); popup('削除しました'); pageSchedSources(app); }
    catch(e){ popup(e.message,'error'); }
  });
}

async function pageDaicho(app){
  if(ME.role !== 'admin'){ notFound(app); return; }
  app.innerHTML = '<h2>🗂️ 台帳保管</h2><div class="card"><div class="muted">読み込み中…</div></div>';
  let data;
  try{ data = await api('/daicho'); }
  catch(e){ app.innerHTML = `<h2>🗂️ 台帳保管</h2><div class="card"><div class="msg err">${h(e.message)}</div></div>`; return; }
  const items = data.items || [];
  const fmtSize = n => { n=Number(n||0); if(n<1024) return n+'B'; if(n<1048576) return (n/1024).toFixed(0)+'KB'; return (n/1048576).toFixed(1)+'MB'; };
  const st = PAGE_STATE.daicho || (PAGE_STATE.daicho = { name:'', person:'', dateFrom:'', dateTo:'', sortCol:'ts', sortDir:-1 });
  const persons = [...new Set(items.map(it=>it.importer_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ja'));
  const hasFilterOn = () => !!(st.name || st.person || st.dateFrom || st.dateTo);
  const sortMark = col => st.sortCol===col ? (st.sortDir===1?'▲':'▼') : '<span class="muted">⇅</span>';
  const sortOptions = [
    ['ts',-1,'取り込み日時(新しい順)'], ['ts',1,'取り込み日時(古い順)'],
    ['file_name',1,'ファイル名(A→Z/あ→ん)'], ['file_name',-1,'ファイル名(Z→A/ん→あ)'],
    ['importer_name',1,'取り込んだ人(あ→ん)'], ['importer_name',-1,'取り込んだ人(ん→あ)'],
    ['size',-1,'サイズ(大きい順)'], ['size',1,'サイズ(小さい順)'],
    ['applied',-1,'反映件数(多い順)'], ['applied',1,'反映件数(少ない順)'],
    ['sheets',-1,'シート数(多い順)'], ['sheets',1,'シート数(少ない順)'],
  ];

  // リスト部分だけを再構築する。フィルタ入力欄・並び替えプルダウンはここでは一切触らない
  // (input/select要素をDOMから作り直すと、スマホでソフトウェアキーボードが閉じてしまうため)
  const renderList = () => {
    const nameQ = st.name.trim().toLowerCase();
    let filtered = items.filter(it => {
      if(nameQ && !(it.file_name||'').toLowerCase().includes(nameQ)) return false;
      if(st.person && it.importer_name !== st.person) return false;
      if(st.dateFrom && it.ts.slice(0,10) < st.dateFrom) return false;
      if(st.dateTo && it.ts.slice(0,10) > st.dateTo) return false;
      return true;
    });
    filtered = filtered.sort((a,b) => {
      const av = a[st.sortCol], bv = b[st.sortCol];
      if(av == null && bv == null) return 0;
      if(av == null) return -1*st.sortDir; if(bv == null) return 1*st.sortDir;
      if(typeof av === 'number' || typeof bv === 'number') return ((Number(av)||0)-(Number(bv)||0))*st.sortDir;
      return String(av).localeCompare(String(bv), 'ja') * st.sortDir;
    });
    const area = $('#dc-list-area'); if(!area) return;
    const cb = $('#dc-clear'); if(cb) cb.style.display = hasFilterOn() ? '' : 'none';
    area.innerHTML = `
      <div class="muted" style="margin-bottom:8px">${filtered.length}件 / 全${items.length}件${hasFilterOn()?' (絞り込み中)':''}</div>
      ${filtered.length ? `
      <div class="list-scroll pc-only">
        <table class="list">
          <tr>
            <th class="dc-th" data-col="file_name" style="cursor:pointer;white-space:nowrap">ファイル名 ${sortMark('file_name')}</th>
            <th class="dc-th" data-col="ts" style="cursor:pointer;white-space:nowrap">取り込み日時 ${sortMark('ts')}</th>
            <th class="dc-th" data-col="importer_name" style="cursor:pointer;white-space:nowrap">取り込んだ人 ${sortMark('importer_name')}</th>
            <th class="dc-th" data-col="applied" style="cursor:pointer;white-space:nowrap">反映件数 ${sortMark('applied')}</th>
            <th class="dc-th" data-col="sheets" style="cursor:pointer;white-space:nowrap">シート数 ${sortMark('sheets')}</th>
            <th class="dc-th" data-col="size" style="cursor:pointer;white-space:nowrap">サイズ ${sortMark('size')}</th>
            <th></th><th></th>
          </tr>
          ${filtered.map(it=>`<tr>
            <td style="white-space:nowrap;font-weight:600">${h(it.file_name||'(名称不明)')}</td>
            <td style="white-space:nowrap">${h(it.ts)}</td>
            <td style="white-space:nowrap">${h(it.importer_name||'—')}</td>
            <td>${it.applied!=null?it.applied+'件':'—'}</td>
            <td>${it.sheets!=null?it.sheets:'—'}</td>
            <td style="white-space:nowrap">${fmtSize(it.size)}</td>
            <td style="white-space:nowrap"><button class="btn ghost xs dc-dl" data-id="${it.id}" data-name="${h(it.file_name||'daicho.xlsx')}">⬇️ ダウンロード</button></td>
            <td><button class="btn danger xs dc-del" data-id="${it.id}" data-ts="${h(it.ts)}">削除</button></td>
          </tr>`).join('')}
        </table>
      </div>
      <div class="cards sp-only">
        ${filtered.map(it=>`<div class="dcard">
          <div class="dcard-head"><span class="dcard-title">${h(it.file_name||'(名称不明)')}</span></div>
          <div class="drow"><span class="dk">取り込み日時</span><span class="dv">${h(it.ts)}</span></div>
          <div class="drow"><span class="dk">取り込んだ人</span><span class="dv">${h(it.importer_name||'—')}</span></div>
          <div class="drow"><span class="dk">反映件数</span><span class="dv">${it.applied!=null?it.applied+'件':'—'} / シート${it.sheets!=null?it.sheets:'—'} / ${fmtSize(it.size)}</span></div>
          <div class="dcard-actions">
            <button class="btn ghost sm dc-dl" data-id="${it.id}" data-name="${h(it.file_name||'daicho.xlsx')}">⬇️ ダウンロード</button>
            <button class="btn danger sm dc-del" data-id="${it.id}" data-ts="${h(it.ts)}">削除</button>
          </div>
        </div>`).join('')}
      </div>
      ` : `<div class="muted" style="padding:24px 0;text-align:center">${hasFilterOn()?'条件に一致する台帳はありません':'まだ保管された台帳はありません。スプレッドシートを取り込むと、ここに元Excelが保管されます。'}</div>`}`;
    area.querySelectorAll('.dc-th').forEach(th => th.onclick = () => {
      const c = th.dataset.col;
      if(st.sortCol === c) st.sortDir *= -1;
      else { st.sortCol = c; st.sortDir = c==='file_name'||c==='importer_name' ? 1 : -1; }
      const sortSel = $('#dc-sort'); if(sortSel) sortSel.value = `${st.sortCol}:${st.sortDir}`;
      renderList();
    });
    area.querySelectorAll('.dc-dl').forEach(b => b.onclick = async () => {
      b.disabled=true; const old=b.textContent; b.textContent='取得中…';
      try{ await downloadFile(`/daicho/${b.dataset.id}/download`, b.dataset.name); }
      catch(e){ popup(e.message,'error'); }
      finally{ b.disabled=false; b.textContent=old; }
    });
    area.querySelectorAll('.dc-del').forEach(b => b.onclick = async () => {
      if(!confirm(`${b.dataset.ts} に取り込んだ台帳を削除しますか？\n\n※元Excelファイルが完全に削除されます。すでに登録済みのスケジュール・給与データは残ります。`)) return;
      try{ await api(`/daicho/${b.dataset.id}/delete`,{method:'POST'}); popup('削除しました'); pageDaicho(app); }
      catch(e){ popup(e.message,'error'); }
    });
  };

  app.innerHTML = `
  <h2 style="margin-bottom:8px">🗂️ 台帳保管</h2>
  <div class="card">
    <div class="muted" style="margin-bottom:12px">スプレッドシートを取り込むたびに、元のExcelがそのままサーバーに保管されます（給与計算の根拠・監査用）。ここから閲覧・ダウンロード・削除ができます。<b>管理者のみ</b>がアクセスできます。</div>
    ${items.length ? `
    <div class="filter-bar" style="flex-wrap:wrap;gap:8px">
      <input id="dc-name" class="search-input" placeholder="🔍 ファイル名で検索" value="${h(st.name)}" style="min-width:160px;flex:1 1 160px">
      <select id="dc-person" class="filter-select" style="flex:1 1 140px">
        <option value="">取り込んだ人:すべて</option>
        ${persons.map(p=>`<option value="${h(p)}" ${st.person===p?'selected':''}>${h(p)}</option>`).join('')}
      </select>
      <label class="muted" style="display:flex;align-items:center;gap:4px;font-size:13px;white-space:nowrap">開始<input type="date" id="dc-from" value="${h(st.dateFrom)}" style="max-width:150px"></label>
      <label class="muted" style="display:flex;align-items:center;gap:4px;font-size:13px;white-space:nowrap">終了<input type="date" id="dc-to" value="${h(st.dateTo)}" style="max-width:150px"></label>
      <button class="btn ghost sm" id="dc-clear" style="${hasFilterOn()?'':'display:none'}">クリア</button>
    </div>
    <div class="row" style="margin:8px 0;align-items:center;gap:6px">
      <label class="muted" style="font-size:13px;white-space:nowrap">並び替え</label>
      <select id="dc-sort" class="filter-select" style="flex:1 1 220px">
        ${sortOptions.map(([col,dir,label])=>`<option value="${col}:${dir}" ${st.sortCol===col&&st.sortDir===dir?'selected':''}>${label}</option>`).join('')}
      </select>
    </div>
    <div id="dc-list-area"></div>
    ` : '<div class="muted" style="padding:24px 0;text-align:center">まだ保管された台帳はありません。スプレッドシートを取り込むと、ここに元Excelが保管されます。</div>'}
  </div>`;

  if(items.length){
    renderList();
    const dn = $('#dc-name');
    if(dn) dn.oninput = () => { st.name = dn.value; renderList(); }; // input要素自体には触れないのでキーボードは閉じない
    const dp = $('#dc-person');
    if(dp) dp.onchange = () => { st.person = dp.value; renderList(); };
    const df = $('#dc-from');
    if(df) df.onchange = () => { st.dateFrom = df.value; renderList(); };
    const dt = $('#dc-to');
    if(dt) dt.onchange = () => { st.dateTo = dt.value; renderList(); };
    const ds = $('#dc-sort');
    if(ds) ds.onchange = () => { const [col,dir] = ds.value.split(':'); st.sortCol = col; st.sortDir = Number(dir); renderList(); };
    const dc = $('#dc-clear');
    if(dc) dc.onclick = () => { st.name=''; st.person=''; st.dateFrom=''; st.dateTo=''; pageDaicho(app); };
  }
}

/* ===== アカウント管理(管理者)===== */
async function pageAdmin(app){
  if(!has('account_manage')){ notFound(app); return; }
  const users = await getUsers(true);
  const mgrs = await api('/managers');
  const optLists = await api('/option-lists').catch(()=>({ka:[],han:[]}));
  const st = PAGE_STATE.admin || (PAGE_STATE.admin = { q:'', mgr:'', open:{ list:true } });
  const openSet = st.open;
  const sec = (id,title,body)=>`<details class="adm-sec" id="sec-${id}" data-sec="${id}" ${openSet[id]?'open':''}><summary>${title}</summary><div class="adm-body">${body}</div></details>`;

  // アカウント一覧のリスト部分だけを再構築する。検索欄など入力要素はここでは触らない
  // (input要素をDOMから作り直すと、スマホでソフトウェアキーボードが閉じてしまうため)
  const renderAccountList = () => {
    const adq = st.q.trim(), admgr = st.mgr;
    const aList = users.filter(u=>{
      const mq = !adq || (u.name||'').includes(adq) || (u.regno||'').includes(adq);
      const mm = !admgr || (admgr==='__chief' ? !u.manager_id : String(u.manager_id)===String(admgr));
      return mq && mm;
    });
    const area = $('#ad-list-area'); if(!area) return;
    const countEl = $('#ad-count'); if(countEl) countEl.textContent = `(${aList.length}名)`;
    area.innerHTML = `
      <div class="muted" style="margin:2px 0 10px">${aList.length}名 表示中</div>
      <div class="sched-wrap pc-only"><table class="list">
      <tr><th>登録番号</th><th>氏名</th><th>役割(管理者のみ変更可)</th><th>担当手配者</th><th>ランク</th><th>班</th><th>駅</th><th>操作</th></tr>
      ${aList.map(u=>`<tr class="${u.suspended?'is-suspended':''}">
        <td class="nowrap">${h(u.regno)}</td><td class="nowrap">${h(u.name)}${u.suspended?' <span class="susp-tag">停止</span>':''}</td>
        <td><select data-role="${u.id}">${['member','chief','handler','admin'].map(r=>`<option value="${r}" ${u.role===r?'selected':''}>${ROLE_JP[r]}</option>`).join('')}</select></td>
        <td><select data-mgr="${u.id}"><option value="">(なし)</option>${mgrs.map(m=>`<option value="${m.id}" ${String(u.manager_id)===String(m.id)?'selected':''}>${h(m.name)}手配</option>`).join('')}</select></td>
        <td class="nowrap">${h(u.rank)}</td><td class="nowrap">${h(u.han)}</td><td class="nowrap">${h(u.station)}</td>
        <td class="nowrap"><a class="btn ghost sm" href="#/permissions/${u.id}" style="text-decoration:none;display:inline-block">権限</a>
            <button class="btn ghost sm" data-suspend="${u.id}" data-cur="${u.suspended?1:0}">${u.suspended?'復活':'停止'}</button>
            <button class="btn ghost sm" data-reset="${u.id}">PWリセット</button>
            <button class="btn danger sm" data-del="${u.id}">削除</button></td>
      </tr>`).join('') || '<tr><td colspan="8" class="muted" style="text-align:center;padding:16px">該当するアカウントはありません</td></tr>'}
      </table></div>
      <div class="cards sp-only">
      ${aList.map(u=>`<div class="dcard ${u.suspended?'is-suspended':''}">
        <div class="dcard-head"><span class="dcard-title">${h(u.name)}${u.suspended?' <span class="susp-tag">停止</span>':''}</span><span class="dcard-sub">${h(u.regno)}</span></div>
        <div class="drow"><span class="dk">役割</span><span class="dv"><select data-role="${u.id}">${['member','chief','handler','admin'].map(r=>`<option value="${r}" ${u.role===r?'selected':''}>${ROLE_JP[r]}</option>`).join('')}</select></span></div>
        <div class="drow"><span class="dk">担当手配</span><span class="dv"><select data-mgr="${u.id}"><option value="">(なし)</option>${mgrs.map(m=>`<option value="${m.id}" ${String(u.manager_id)===String(m.id)?'selected':''}>${h(m.name)}手配</option>`).join('')}</select></span></div>
        <div class="drow"><span class="dk">ランク/班</span><span class="dv">${h(u.rank)||'—'} / ${h(u.han)||'—'}</span></div>
        <div class="drow"><span class="dk">最寄駅</span><span class="dv">${h(u.station)||'—'}</span></div>
        <div class="dcard-actions"><a class="btn ghost sm" href="#/permissions/${u.id}" style="text-decoration:none;display:inline-block">権限</a><button class="btn ghost sm" data-suspend="${u.id}" data-cur="${u.suspended?1:0}">${u.suspended?'復活':'停止'}</button><button class="btn ghost sm" data-reset="${u.id}">PWリセット</button><button class="btn danger sm" data-del="${u.id}">削除</button></div>
      </div>`).join('') || '<div class="muted" style="text-align:center;padding:16px">該当するアカウントはありません</div>'}
      </div>
      <div class="muted" style="margin-top:8px">権限の階層:管理者 → 手配チーム → チーフ → メンツ。「担当手配者」を設定すると、スケジュール閲覧・入力で担当ごとにメンバーを絞り込めます。手配チームは右上メニューからPIN入力で手配者モードに切り替えられます。個人ごとの追加権限は「権限」ボタンから、役割全員への一括権限は上部の「🛡️ 権限の一括設定」から設定できます。</div>`;
    area.querySelectorAll('[data-role]').forEach(s => s.onchange = async () => {
      try{ await api('/users/'+s.dataset.role, { method:'PATCH', body:{ role:s.value } }); USERS_CACHE=null; }
      catch(e){ alert(e.message); render(); }
    });
    area.querySelectorAll('[data-mgr]').forEach(s => s.onchange = async () => {
      try{ await api('/users/'+s.dataset.mgr, { method:'PATCH', body:{ manager_id: s.value?Number(s.value):null } }); USERS_CACHE=null; }
      catch(e){ alert(e.message); render(); }
    });
    area.querySelectorAll('[data-suspend]').forEach(b => b.onclick = async () => {
      const id = b.dataset.suspend, cur = b.dataset.cur === '1';
      if(!confirm(cur ? 'このアカウントを復活します(ログイン可)。よろしいですか?' : 'このアカウントを停止します(ログイン不可。一覧・スケジュール入力・現場一覧には引き続き表示)。よろしいですか?')) return;
      try{ await api(`/users/${id}`,{method:'PATCH',body:{suspended:cur?0:1}}); USERS_CACHE=null; popup(cur?'復活しました':'停止しました'); renderAccountList(); }
      catch(e){ popup(e.message,'error'); }
    });
    area.querySelectorAll('[data-reset]').forEach(b => b.onclick = async () => {
      if(!confirm('パスワードを初期化しますか?(登録番号でログインできるようになります)')) return;
      await api(`/users/${b.dataset.reset}/resetpw`, { method:'POST' }); alert('初期化しました');
    });
    area.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
      if(!confirm('このアカウントを削除しますか?スケジュールも削除されます。')) return;
      try{ await api('/users/'+b.dataset.del, { method:'DELETE' }); USERS_CACHE=null; render(); }
      catch(e){ alert(e.message); }
    });
  };

  app.innerHTML = `
  <h2 style="margin-bottom:8px">アカウント管理</h2>
  <div class="adm-nav">
    ${[['data','📋 全データ'],['create','➕ 新規作成'],['list','👥 アカウント一覧']].map(s=>`<button class="adm-chip" data-jump="${s[0]}">${s[1]}</button>`).join('')}
    <a href="#/role-permissions" class="adm-chip" style="text-decoration:none;display:inline-block">🛡️ 権限の一括設定</a>
    <a href="#/admin-settings" class="adm-chip" style="text-decoration:none;display:inline-block">🔧 システム設定</a>
  </div>

  ${sec('data','📋 全データ閲覧', `
    <div class="row" style="margin-bottom:10px">
      <select id="dv-table">
        <option value="users">アカウント一覧(パスワード状態を含む)</option>
        <option value="schedule">スケジュール全件</option>
        <option value="history">スケジュール編集履歴</option>
        <option value="reports">新人報告 全項目</option>
        <option value="blacklist">ブラックリスト</option>
        <option value="notifications">通知(全員分)</option>
        <option value="sessions">ログインセッション</option>
      </select>
      <button class="btn" id="dv-load">表示する</button>
    </div>
    <div id="dv-out" class="muted">テーブルを選んで「表示する」を押してください。パスワード本体は暗号化保存のため誰にも表示できません(「PWリセット」で初期PW=登録番号に戻せます)。</div>`)}

  ${sec('create','➕ 新規アカウント作成 <span class="muted" style="font-weight:400">(初期パスワード = 登録番号)</span>', `
    <div class="form-grid" style="max-width:640px">
      <label>登録番号 *</label><input id="a-regno" placeholder="登録番号">
      <label>氏名 *</label><input id="a-name" placeholder="氏名">
      <label>ランク</label><select id="a-rank"><option value="">-</option>${['A','B','C','D','E'].map(r=>`<option>${r}</option>`).join('')}</select>
      <label>所属課</label><select id="a-ka"><option value="">-</option>${optLists.ka.map(o=>`<option value="${h(o.value)}">${h(o.value)}</option>`).join('')}</select>
      <label>班</label><select id="a-han"><option value="">-</option>${optLists.han.map(o=>`<option value="${h(o.value)}">${h(o.value)}</option>`).join('')}</select>
      <label>最寄駅</label><input id="a-station" placeholder="最寄駅">
      <label>役割</label><select id="a-role"><option value="member">メンツ</option><option value="chief">チーフ</option><option value="handler">チーフ(手配者)</option><option value="admin">チーフ(管理者)</option></select>
      <label>手配担当</label><select id="a-mgr"><option value="">チーフ手配</option>${mgrs.map(m=>`<option value="${m.id}">${h(m.name)}手配</option>`).join('')}</select>
    </div>
    <div class="row" style="margin-top:12px;gap:8px;align-items:center">
      <button class="btn gold" id="a-add">作成</button><span id="a-msg"></span>
    </div>
    <div class="muted" style="margin-top:8px">所属課・班の選択肢は<button class="btn ghost xs" id="a-opt-manage" type="button">こちらから追加・削除</button>できます。</div>
    <div id="a-opt-panel" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid var(--line)">
      <div class="row" style="gap:16px;flex-wrap:wrap;align-items:flex-start">
        <div>
          <div style="font-weight:700;margin-bottom:6px">所属課</div>
          ${optLists.ka.map(o=>`<div class="row" style="gap:6px;margin-bottom:4px;align-items:center"><span>${h(o.value)}</span><button class="btn ghost xs opt-del" data-id="${o.id}">削除</button></div>`).join('') || '<div class="muted">まだありません</div>'}
          <div class="row" style="margin-top:6px;gap:6px"><input id="a-ka-new" placeholder="新しい所属課" style="width:140px"><button class="btn ghost sm" id="a-ka-add">追加</button></div>
        </div>
        <div>
          <div style="font-weight:700;margin-bottom:6px">班</div>
          ${optLists.han.map(o=>`<div class="row" style="gap:6px;margin-bottom:4px;align-items:center"><span>${h(o.value)}</span><button class="btn ghost xs opt-del" data-id="${o.id}">削除</button></div>`).join('') || '<div class="muted">まだありません</div>'}
          <div class="row" style="margin-top:6px;gap:6px"><input id="a-han-new" placeholder="新しい班" style="width:140px"><button class="btn ghost sm" id="a-han-add">追加</button></div>
        </div>
      </div>
    </div>`)}

  ${sec('list',`👥 アカウント一覧 <span class="muted" style="font-weight:400" id="ad-count">(${users.length}名)</span>`, `
    <div class="filter-bar">
      <input id="ad-search" class="search-input" placeholder="🔍 氏名・登録番号で検索" value="${h(st.q)}">
      <select id="ad-mgr" class="filter-select">
        <option value="">手配担当:すべて</option>
        ${mgrs.map(m=>`<option value="${m.id}" ${String(st.mgr)===String(m.id)?'selected':''}>${h(m.name)}手配</option>`).join('')}
        <option value="__chief" ${st.mgr==='__chief'?'selected':''}>チーフ手配</option>
      </select>
      <button class="btn ghost sm" id="ad-clear" style="${(st.q||st.mgr)?'':'display:none'}">クリア</button>
    </div>
    <div id="ad-list-area"></div>`)}`;

  renderAccountList();

  // 折りたたみの開閉状態を保持 / 目次ジャンプ
  app.querySelectorAll('.adm-sec').forEach(d => d.addEventListener('toggle', () => { st.open[d.dataset.sec] = d.open; }));
  app.querySelectorAll('[data-jump]').forEach(b => b.onclick = () => {
    const d = document.getElementById('sec-'+b.dataset.jump);
    if(d){ d.open = true; st.open[b.dataset.jump] = true; d.scrollIntoView({behavior:'smooth', block:'start'}); }
  });

  $('#dv-load').onclick = async () => {
    $('#dv-out').innerHTML = '読み込み中…';
    try{
      const rows = await api('/admin/data?table=' + $('#dv-table').value);
      if(!rows.length){ $('#dv-out').innerHTML = '<div class="muted">データはありません</div>'; return; }
      DV_STATE.rows = rows;
      DV_STATE.cols = Object.keys(rows[0]);
      DV_STATE.sortCol = null; DV_STATE.sortDir = 1; DV_STATE.filters = {};
      DV_STATE.tableName = $('#dv-table').value;
      renderDvTable();
    }catch(e){ $('#dv-out').innerHTML = `<div class="msg err">${h(e.message)}</div>`; }
  };
  $('#a-add').onclick = async () => {
    try{
      await api('/users',{method:'POST',body:{
        regno:$('#a-regno').value, name:$('#a-name').value, rank:$('#a-rank').value,
        ka:$('#a-ka').value, han:$('#a-han').value, station:$('#a-station').value,
        role:$('#a-role').value, manager_id:$('#a-mgr').value ? Number($('#a-mgr').value) : null
      }});
      USERS_CACHE=null; render();
    }catch(e){ $('#a-msg').innerHTML = `<span class="msg err">${h(e.message)}</span>`; }
  };
  const aom = $('#a-opt-manage');
  if(aom) aom.onclick = () => { const p=$('#a-opt-panel'); if(p) p.style.display = p.style.display==='none' ? '' : 'none'; };
  const akAdd = $('#a-ka-add');
  if(akAdd) akAdd.onclick = async () => {
    const v = $('#a-ka-new').value.trim(); if(!v) return;
    try{ await api('/option-lists',{method:'POST',body:{category:'ka',value:v}}); pageAdmin(app); }
    catch(e){ popup(e.message,'error'); }
  };
  const ahAdd = $('#a-han-add');
  if(ahAdd) ahAdd.onclick = async () => {
    const v = $('#a-han-new').value.trim(); if(!v) return;
    try{ await api('/option-lists',{method:'POST',body:{category:'han',value:v}}); pageAdmin(app); }
    catch(e){ popup(e.message,'error'); }
  };
  app.querySelectorAll('.opt-del').forEach(b => b.onclick = async () => {
    if(!confirm('この選択肢を削除しますか？(既に設定されているメンバーの値はそのまま残ります)')) return;
    try{ await api(`/option-lists/${b.dataset.id}`,{method:'DELETE'}); pageAdmin(app); }
    catch(e){ popup(e.message,'error'); }
  });
  const adS=$('#ad-search');
  if(adS){
    adS.oninput = () => {
      st.q = adS.value;
      const adC0 = $('#ad-clear'); if(adC0) adC0.style.display = (st.q||st.mgr) ? '' : 'none';
      renderAccountList(); // input要素自体には触れず、リストだけ更新するのでキーボードは閉じない
    };
  }
  const adM=$('#ad-mgr'); if(adM) adM.onchange=()=>{ st.mgr=adM.value; const adC0=$('#ad-clear'); if(adC0) adC0.style.display=(st.q||st.mgr)?'':'none'; renderAccountList(); };
  const adC=$('#ad-clear'); if(adC) adC.onclick=()=>{ st.q=''; st.mgr=''; pageAdmin(app); };
}

/* ===== システム設定(PIN・連携・通知・台帳夜間再取込・時給。wage_settings権限のみ・専用ページ) ===== */
async function pageAdminSettings(app){
  if(!has('wage_settings')){ notFound(app); return; }
  const pin = (await api('/settings/handler-pin')).pin;
  const importTok = (await api('/settings/import-token')).token;
  const wageData = await api('/wage-rates').catch(()=>null);
  const notifyData = await api('/notify-settings').catch(()=>null);
  const daichoReloadSettings = await api('/daicho-reload-settings').catch(()=>null);
  const lockData = await api('/lock-settings').catch(()=>null);
  const stAs = PAGE_STATE.adminSettings || (PAGE_STATE.adminSettings = { open:{ pin:true } });
  const openSet = stAs.open;
  const sec = (id,title,body)=>`<details class="adm-sec" id="asec-${id}" data-sec="${id}" ${openSet[id]?'open':''}><summary>${title}</summary><div class="adm-body">${body}</div></details>`;
  app.innerHTML = `
  <h2 style="margin-bottom:8px">🔧 システム設定</h2>
  <div class="adm-nav">
    ${[['pin','🔑 PIN'],['link','🔗 連携'],['daicho-reload','🌙 台帳夜間再取込'],['notify','🔔 通知'],['wage','💴 時給']].map(s=>`<button class="adm-chip" data-jump="${s[0]}">${s[1]}</button>`).join('')}
  </div>

  ${sec('pin','🔑 手配者専用パスワード(PIN)', `
    <div class="row">
      <span>現在:<b id="pin-now">${h(pin)}</b></span>
      <input id="pin-new" placeholder="新しいPIN(4〜20文字)" style="width:180px">
      <button class="btn" id="pin-save">変更する</button><span id="pin-msg"></span>
    </div>
    <div class="muted" style="margin-top:6px">変更すると、手配モード中のメンバーは全員解除され、新しいPINの再入力が必要になります。</div>`)}

  ${sec('link','🔗 スプレッドシート連携(取り込みトークン)', `
    <div class="row">
      <input id="imp-tok" value="${h(importTok)}" readonly style="flex:1;min-width:240px;font-family:monospace;font-size:12px">
      <button class="btn ghost" id="imp-copy">コピー</button>
      <button class="btn danger" id="imp-regen">再発行</button><span id="imp-msg"></span>
    </div>
    <div class="muted" style="margin-top:6px">このトークンをGoogleスプレッドシート側のスクリプト(同梱の gas-連携.gs)に貼り付けると、シートの内容がアプリのスケジュールに自動反映されます。再発行すると古いトークンは無効になります。</div>`)}

  ${sec('daicho-reload','🌙 台帳の深夜自動再取り込み', `
    <div class="muted" style="margin-bottom:10px">手動で取り込んだ台帳URLを、<b>設定した時刻に毎日自動で再取り込み</b>します。手動取り込みが「事前の仮確認」、この自動処理が「その日の夜に確定版で上書き」という運用です。</div>
    <div class="muted" style="margin-bottom:12px">実行後、保存済みURLは自動的に削除されます。またR2台帳は<b>同じファイルの古いバージョンが削除され、最新版1件だけが残ります</b>。</div>
    <div class="form-grid" style="max-width:420px">
      <label>実行時刻</label>
      <select id="dr-hour" style="width:120px;max-width:100%">${Array.from({length:24},(_,i)=>`<option value="${i}" ${daichoReloadSettings&&daichoReloadSettings.hour===i?'selected':''}>${String(i).padStart(2,'0')}:00</option>`).join('')}</select>
    </div>
    <div class="row" style="margin-top:10px;gap:8px;align-items:center">
      <button class="btn gold sm" id="dr-save">保存</button>
      <span class="muted" id="dr-msg"></span>
    </div>
    <div id="daicho-reload-status" class="muted" style="margin-top:16px">読み込み中…</div>`)}

  ${sec('notify','🔔 通知設定 <span class="muted" style="font-weight:400">(新人報告リマインド)</span>', notifyData ? `
    <div class="muted" style="margin-bottom:10px">その日<b>現場に入っている人</b>のうち、下記の対象条件に当てはまり、かつ<b>まだ本人が新人報告を提出していない人</b>にだけ、決まった時刻にリマインドのお知らせ（🔔）を送ります。役割に関わらず、個人ごとの追加・除外は各アカウントの「権限編集」ページから設定できます。</div>
    <div class="form-grid" style="grid-template-columns:120px 1fr;max-width:440px;gap:10px 12px;align-items:center">
      <label>通知</label>
      <label style="font-weight:400;display:flex;align-items:center;gap:8px"><input type="checkbox" id="nt-enabled" ${notifyData.enabled?'checked':''} style="width:auto"> 通知をオンにする</label>
      <label>送信時刻</label>
      <select id="nt-hour" style="width:120px">${Array.from({length:24},(_,i)=>`<option value="${i}" ${notifyData.hour===i?'selected':''}>${String(i).padStart(2,'0')}:00</option>`).join('')}</select>
      <label>送信対象</label>
      <select id="nt-target" style="width:auto">
        <option value="chiefs" ${notifyData.target==='chiefs'?'selected':''}>チーフ以上（チーフ・手配者・管理者）</option>
        <option value="handlers" ${notifyData.target==='handlers'?'selected':''}>手配者・管理者のみ</option>
        <option value="all" ${notifyData.target==='all'?'selected':''}>メンツを含む全員</option>
      </select>
    </div>
    <div class="row" style="margin-top:14px;gap:8px;align-items:center">
      <button class="btn gold sm" id="nt-save">通知設定を保存</button>
      <button class="btn ghost sm" id="nt-test">今すぐテスト送信</button>
      <span id="nt-msg" class="muted"></span>
    </div>
    <div class="muted" style="margin-top:8px">※現場に入っていない人には送られません。既に本人が新人報告を提出済みの場合も送られません。通知はアプリ内のお知らせ（🔔）に届きます。</div>
  ` : '<div class="muted">通知設定を取得できませんでした</div>')}

  ${sec('wage','💴 時給設定 <span class="muted" style="font-weight:400">(ランク×時期)</span>', wageData ? `
    <div class="muted" style="margin-bottom:8px">現場日に有効な時給が給与計算に使われます。<b>${h(wageData.lockBefore)}</b> 以前の現場は給与確定済み（時給を変えても再計算されません）。</div>
    ${lockData ? `
    <div style="background:#f7f5ef;border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin-bottom:12px">
      <div style="font-weight:700;margin-bottom:6px">🔒 給与確定ロック期間</div>
      <div class="muted" style="margin-bottom:8px">現場日からこの日数を過ぎると、チーフ・手配者は編集できなくなります（管理者は常に編集可）。</div>
      <div class="row" style="align-items:center;gap:8px;flex-wrap:wrap">
        <span>現場日から</span>
        <input type="number" id="lock-days" value="${lockData.days}" min="0" max="3650" style="width:90px">
        <span>日後に確定</span>
        <button class="btn gold sm" id="lock-save">保存</button>
        <span id="lock-msg" class="muted"></span>
      </div>
      <div class="muted" style="margin-top:6px;font-size:12px">現在の設定では <b>${h(lockData.lockBefore)}</b> 以前が確定済みです。0にすると当日以降すべて編集可、長くすると過去まで編集可になります。</div>
    </div>` : ''}
    ${wageData.periods.map(p=>`
      <div style="font-weight:700;margin:10px 0 4px">${p.effective_from==='1900-01-01'?'旧時給（〜2025/9）':h(p.effective_from)+' 〜（改定）'}</div>
      <table class="wage-tbl">
        <tr><th>ランク</th><th>案内料金</th><th>搬入出料金</th></tr>
        ${['A','B','C','D','E'].map(rk=>{const g=(p.rates[rk]||{}).guide||0,l=(p.rates[rk]||{}).load||0;return `<tr><td>${rk}</td>
          <td><input type="number" class="wage-in" data-ef="${h(p.effective_from)}" data-rank="${rk}" data-kind="guide" value="${g}"></td>
          <td><input type="number" class="wage-in" data-ef="${h(p.effective_from)}" data-rank="${rk}" data-kind="load" value="${l}"></td></tr>`;}).join('')}
      </table>`).join('')}
    <div class="row" style="margin-top:12px;gap:8px;align-items:center">
      <button class="btn gold sm" id="wage-save">時給を保存</button>
      <span id="wage-msg" class="muted"></span>
    </div>
    <div class="muted" style="margin-top:8px">深夜手当・超過手当は案内料金×0.25、2st手当は+¥500。対象はA〜Eランクのみ（ケータリング・物品販売・その他ランクは対象外）。</div>
    <div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line)">
      <button class="btn ghost sm" id="recalc-btn">過去データの給与・残業を再計算</button>
      <span id="recalc-msg" class="muted"></span>
      <div class="muted" style="margin-top:6px">取り込み済みの全現場を、現在の時給・新ルール（残業9h／業務名）で計算し直します。確定ロックに関わらず再計算し、手動入力した給与も上書きされます。</div>
    </div>
  ` : '<div class="muted">時給データを取得できませんでした</div>')}`;

  app.querySelectorAll('.adm-sec').forEach(d => d.addEventListener('toggle', () => { stAs.open[d.dataset.sec] = d.open; }));
  app.querySelectorAll('[data-jump]').forEach(b => b.onclick = () => {
    const d = document.getElementById('asec-'+b.dataset.jump);
    if(d){ d.open = true; stAs.open[b.dataset.jump] = true; d.scrollIntoView({behavior:'smooth', block:'start'}); }
  });

  { const ws = $('#wage-save'); if(ws) ws.onclick = async () => {
      const rates = [...document.querySelectorAll('.wage-in')].map(i=>({effective_from:i.dataset.ef,rank:i.dataset.rank,kind:i.dataset.kind,amount:Number(i.value)})).filter(r=>Number.isFinite(r.amount)&&r.amount>=0);
      $('#wage-msg').textContent='保存中…';
      try{ const r=await api('/wage-rates',{method:'PUT',body:{rates}}); $('#wage-msg').textContent=`${r.updated}件 保存しました`; popup('時給を更新しました'); }
      catch(e){ $('#wage-msg').textContent=e.message; }
  }; }
  { const ls = $('#lock-save'); if(ls) ls.onclick = async () => {
      const days = Number($('#lock-days').value);
      $('#lock-msg').textContent='保存中…';
      try{ const r=await api('/lock-settings',{method:'PUT',body:{days}});
        $('#lock-msg').textContent=`${r.lockBefore} 以前を確定`; popup('ロック期間を保存しました'); pageAdminSettings(app); }
      catch(e){ $('#lock-msg').textContent=e.message; }
  }; }
  { const rb = $('#recalc-btn'); if(rb) rb.onclick = async () => {
      if(!confirm('取り込み済みの全現場の給与・残業を、現在の時給・新ルールで再計算します。手動入力した給与も上書きされます。よろしいですか？')) return;
      rb.disabled=true; $('#recalc-msg').textContent='再計算中…（件数が多いと数十秒かかります）';
      try{ const r=await api('/recalc',{method:'POST'}); $('#recalc-msg').textContent=`${r.updated}件 再計算しました`; popup(`${r.updated}件を再計算しました`); }
      catch(e){ $('#recalc-msg').textContent=e.message; }
      finally{ rb.disabled=false; }
  }; }
  { const ns = $('#nt-save'); if(ns) ns.onclick = async () => {
      const enabled = $('#nt-enabled').checked;
      const hour = Number($('#nt-hour').value);
      const target = $('#nt-target').value;
      $('#nt-msg').textContent='保存中…';
      try{ const r=await api('/notify-settings',{method:'PUT',body:{enabled,hour,target}});
        $('#nt-msg').textContent = r.enabled ? `毎日 ${String(r.hour).padStart(2,'0')}:00 に送信` : '通知オフ';
        popup('通知設定を保存しました'); }
      catch(e){ $('#nt-msg').textContent=e.message; }
  }; }
  { const nt = $('#nt-test'); if(nt) nt.onclick = async () => {
      $('#nt-msg').textContent='送信中…';
      try{ await api('/notify-test',{method:'POST'}); $('#nt-msg').textContent='テスト通知を送りました（🔔を確認）'; popup('テスト通知を送信しました。画面上部の🔔を確認してください'); }
      catch(e){ $('#nt-msg').textContent=e.message; }
  }; }
  { const dr = $('#dr-save'); if(dr) dr.onclick = async () => {
      const hour = Number($('#dr-hour').value);
      $('#dr-msg').textContent='保存中…';
      try{ await api('/daicho-reload-settings',{method:'PUT',body:{hour}});
        $('#dr-msg').textContent = `毎日 ${String(hour).padStart(2,'0')}:00 に自動再取り込み`;
        popup('設定を保存しました'); }
      catch(e){ $('#dr-msg').textContent=e.message; }
  }; }

  // 台帳自動再取り込みの最終実行結果と保存済みURLの件数を表示
  api('/import-urls').then(d => {
    const el = $('#daicho-reload-status'); if(!el) return;
    api('/settings/daicho-reload-result').then(res => {
      const savedCount = d.urls.length;
      const r = res && res.result;
      el.innerHTML = `<div style="margin-bottom:6px">現在の保存済みURL: <b>${savedCount}件</b>${savedCount?` <span class="muted">(次回0:00に自動再取り込み後、削除されます)</span>`:' <span class="muted">(再取り込み対象なし)</span>'}</div>`
        + (r ? `<div class="muted">最終実行: ${h(r.ts)} / ${r.count}件のURLを再取り込み${r.clearedAbsent?` / 🏖️ どのファイルにも登場しなかった人の現場を${r.clearedAbsent}件、休暇に変更`:''}<br>${r.results.map(x=>`${x.ok?'✓':'✗'} ${h((x.url||'').slice(0,60)+'…')} ${x.ok?`反映${x.applied}件`:`エラー:${h(x.error)}`}`).join('<br>')}</div>` : '<div class="muted">まだ自動実行されていません</div>');
    }).catch(()=>{ el.textContent='設定を取得できませんでした'; });
  }).catch(()=>{});

  $('#pin-save').onclick = async () => {
    const v = $('#pin-new').value.trim();
    if(!confirm(`手配者専用パスワードを「${v}」に変更しますか?`)) return;
    try{
      await api('/settings/handler-pin', { method:'POST', body:{ pin:v } });
      $('#pin-now').textContent = v; $('#pin-new').value='';
      $('#pin-msg').innerHTML = '<span class="msg ok">変更しました</span>';
    }catch(e){ $('#pin-msg').innerHTML = `<span class="msg err">${h(e.message)}</span>`; }
  };
  $('#imp-copy').onclick = () => {
    const el = $('#imp-tok'); el.select();
    navigator.clipboard?.writeText(el.value).then(
      () => $('#imp-msg').innerHTML = '<span class="msg ok">コピーしました</span>',
      () => { try{ document.execCommand('copy'); $('#imp-msg').innerHTML='<span class="msg ok">コピーしました</span>'; }catch(_){} }
    );
  };
  $('#imp-regen').onclick = async () => {
    if(!confirm('取り込みトークンを再発行しますか?古いトークンは使えなくなります(シート側のスクリプトの貼り替えが必要です)')) return;
    try{
      const d = await api('/settings/import-token', { method:'POST' });
      $('#imp-tok').value = d.token;
      $('#imp-msg').innerHTML = '<span class="msg ok">再発行しました</span>';
    }catch(e){ $('#imp-msg').innerHTML = `<span class="msg err">${h(e.message)}</span>`; }
  };
}

/* ===== パスワード変更 ===== */
function pagePassword(app){
  app.innerHTML = `
  <h2>パスワード変更</h2>
  <div class="card"><div class="form-grid">
    <label>現在のパスワード</label><input type="password" id="p-old">
    <label>新しいパスワード</label><input type="password" id="p-new">
    <label>新しいパスワード(確認)</label><input type="password" id="p-new2">
  </div>
  <div class="row" style="margin-top:16px"><button class="btn gold" id="p-save">変更する</button><span id="p-msg"></span></div></div>`;
  $('#p-save').onclick = async () => {
    if($('#p-new').value !== $('#p-new2').value){ $('#p-msg').innerHTML='<span class="msg err">確認用パスワードが一致しません</span>'; return; }
    try{
      await api('/password',{method:'POST',body:{oldpw:$('#p-old').value,newpw:$('#p-new').value}});
      $('#p-msg').innerHTML='<span class="msg ok">変更しました</span>';
      $('#p-old').value=$('#p-new').value=$('#p-new2').value='';
    }catch(e){ $('#p-msg').innerHTML=`<span class="msg err">${h(e.message)}</span>`; }
  };
}
