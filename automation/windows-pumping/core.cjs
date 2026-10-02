const SOURCE_URL = 'https://wr.wra.gov.tw/WRTInfoFrontEnd/WaterRecord/WaterSearch';
function plan(date, keys) {
  const [y,m,d] = date.split('-').map(Number);
  const previous = new Date(Date.UTC(y,m-2,1));
  const batch = d >= 26 ? 3 : d >= 16 ? 2 : d >= 6 ? 1 : 0;
  const sorted = [...new Set(keys)].sort();
  if (!sorted.length || sorted.some(k=> !/^[A-Z]\d{7}$/.test(k))) throw Error('Invalid well index');
  return {yearMinguo:previous.getUTCFullYear()-1911,month:previous.getUTCMonth()+1,batch,groups:[0,1,2].map(n=>sorted.filter((_,i)=>i%3===n))};
}
function parseRows(rows, key, year, month) {
  const matches = rows.filter(cells=>cells.length===16 && cells[1].trim()===key && Number(cells[2].trim())===year);
  if(matches.length!==1) throw Error('Expected exactly one matching annual row: '+key);
  const text=matches[0][month+2].trim();
  if(text==='') return null;
  if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) throw Error('Invalid monthly value: '+key);
  const value=Number(text.replace(/,/g,''));
  if(!Number.isFinite(value)) throw Error('Non-finite value');
  return value;
}
function merge(source, results, target) {
  if(!Array.isArray(source.records)) throw Error('Invalid source records');
  const copy=JSON.parse(JSON.stringify(source));
  for(const r of results) {
    if(!target.groups[target.batch-1].includes(r.waterRightNo) || r.yearMinguo!==target.yearMinguo || r.month!==target.month ||
       (r.m3!==null && (typeof r.m3!=='number' || !Number.isFinite(r.m3) || r.m3<0))) throw Error('Result outside target batch/month');
    let annual=copy.records.find(x=>x.waterRightNo===r.waterRightNo&&x.yearMinguo===target.yearMinguo);
    if(!annual) { annual={waterRightNo:r.waterRightNo,yearMinguo:target.yearMinguo,monthlyM3:Array(12).fill(null)};copy.records.push(annual); }
    if(!Array.isArray(annual.monthlyM3)||annual.monthlyM3.length!==12) throw Error('Invalid baseline months');
    if(r.m3!==null) annual.monthlyM3[target.month-1]=r.m3;
    annual.sourceTotalM3=annual.monthlyM3.reduce((sum,v)=>sum+(v??0),0);
    annual.source={kind:'wra-browser',url:SOURCE_URL,checkedAt:r.checkedAt,checkedMonth:target.month};
  }
  if(results.length!==target.groups[target.batch-1].length || new Set(results.map(r=>r.waterRightNo)).size!==results.length) throw Error('Incomplete/duplicate batch');
  copy.browserSync={yearMinguo:target.yearMinguo,month:target.month,batch:target.batch,checkedWells:results.length,completedAt:new Date().toISOString()};
  return copy;
}
module.exports={SOURCE_URL,plan,parseRows,merge};
