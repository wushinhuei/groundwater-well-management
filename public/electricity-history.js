let historyPromise;
let generation = 0;
const number = (v) => v == null ? '—' : Number(v).toLocaleString('zh-TW', { maximumFractionDigits: 2 });
const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
};

function dialog() {
  let node = document.getElementById('electricityHistoryDialog');
  if (node) return node;
  node = document.createElement('dialog');
  node.id = 'electricityHistoryDialog';
  node.className = 'history-dialog';
  node.setAttribute('aria-labelledby', 'electricityHistoryTitle');
  node.innerHTML = `<div class="history-dialog-head"><div><p>歷史用電資料</p><h2 id="electricityHistoryTitle"></h2></div><button type="button" class="dialog-close" aria-label="關閉用電紀錄">×</button></div><div id="electricityHistoryContent" aria-live="polite"></div>`;
  node.querySelector('button').addEventListener('click', () => node.close());
  node.addEventListener('click', (event) => { if (event.target === node) node.close(); });
  document.body.append(node);
  return node;
}

export async function openElectricityHistory(well) {
  const request = ++generation;
  const modal = dialog();
  modal.querySelector('#electricityHistoryTitle').textContent = `${well.name}｜歷史用電度數及費用`;
  const body = modal.querySelector('#electricityHistoryContent');
  body.replaceChildren(el('p', '正在讀取用電資料…'));
  if (!modal.open) modal.showModal();
  try {
    if (!historyPromise) historyPromise = fetch(`data/electricity-history.json?v=${Date.now()}`, {cache:'no-store'})
      .then(response => { if (!response.ok) throw new Error('missing'); return response.json(); })
      .catch(error => { historyPromise = null; throw error; });
    const data = await historyPromise;
    if (request !== generation) return;
    body.replaceChildren();
    const pending = data.pendingMatches?.[well.waterRightNo];
    if (pending) {
      body.append(el('h3', '待確認對應'), el('p', pending), el('p', '確認前不合併至其他井，避免顯示錯誤電費。'));
      return;
    }
    const records = data.records.filter(r => r.waterRightNo === well.waterRightNo).sort((a,b) => b.yearMinguo-a.yearMinguo);
    if (!records.length) {
      body.append(el('p', '所提供的民國 110～115 年電費表中，尚無可明確對應此井的資料。'));
      return;
    }
    const toolbar = el('div', null, 'history-toolbar');
    const label = el('label', '查詢年度'); label.htmlFor = 'electricityHistoryYear';
    const select = el('select'); select.id = 'electricityHistoryYear';
    for (const record of records) { const option=el('option', `民國 ${record.yearMinguo} 年`);option.value=record.yearMinguo;select.append(option); }
    toolbar.append(label, select);
    const detail = el('div');
    body.append(toolbar, detail);
    const render = () => {
      const record = records.find(r => r.yearMinguo === Number(select.value));
      detail.replaceChildren();
      const sum = field => record.months.filter(m => m[field]!=null).reduce((total,m) => total+m[field],0);
      const count = field => record.months.filter(m=>m[field]!=null).length;
      const summary = el('div', null, 'history-summary');
      summary.append(el('p', `已知月份用電合計：${count('kwh') ? number(sum('kwh'))+' 度' : '—'}（${count('kwh')} 個月）`),
        el('p', `已知月份電費合計：${count('feeTwd') ? number(sum('feeTwd'))+' 元' : '—'}（${count('feeTwd')} 個月）`));
      detail.append(summary, el('p', '用電單位：度（kWh）；電費：新臺幣元，採原表每月「總計」。— 表示未填或無可用數值，0 表示來源明列零值。'));
      const wrap = el('div', null, 'history-table-wrap'), table = el('table', null, 'history-table');
      const head=el('thead'), headings=el('tr');
      for (const text of ['月份','用電度數（度）','電費（元）','資料註記']) headings.append(el('th',text));
      head.append(headings);table.append(head);
      const rows=el('tbody');rows.id='electricityHistoryRows';
      for(const month of record.months){
        const row=el('tr');
        for(const text of [`${month.month}月`,number(month.kwh),number(month.feeTwd),month.note || (month.kwh==null && month.feeTwd==null ? '未填資料' : month.kwh==null || month.feeTwd==null ? '部分資料' : '已填資料')]) row.append(el('td',text));
        rows.append(row);
      }
      table.append(rows);wrap.append(table);detail.append(wrap);
      const source=data.sources.find(s=>s.id===record.sourceId);
      detail.append(el('p', `來源：${source?.fileName || ''}／${record.sourceSheet}／第 ${record.sourceRow} 列`),
        el('p', `表內電號：${record.electricityNo}；對應依據：${record.matchMethod}`));
    };
    select.addEventListener('change', render);render();
  } catch {
    if(request===generation) body.replaceChildren(el('p','用電資料讀取失敗，請重新整理頁面後再試。'));
  }
}
