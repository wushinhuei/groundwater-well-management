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
    if(r.m3===null) continue;
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

function dueTargets(date, startMonth, keys, read) {
 const [y,m,d]=date.split('-').map(Number);
 const [sy,sm]=startMonth.split('-').map(Number);
 if(!Number.isInteger(sy)||!Number.isInteger(sm)||sm<1||sm>12) throw Error('Invalid start month');
 const out=[];
 for(let monthIndex=sy*12+sm-1;monthIndex<y*12+m-1;monthIndex++) {
  const ty=Math.floor(monthIndex/12),tm=monthIndex%12+1;
  const next=new Date(Date.UTC(ty,tm,1));
  const current=next.getUTCFullYear()===y&&next.getUTCMonth()+1===m;
  const groups=plan(date,keys).groups;
  for(let batch=1;batch<=3;batch++) {
   if(current&&d<[6,16,26][batch-1]) continue;
   const target={yearMinguo:ty-1911,month:tm,batch,groups};
   const name=`batch-${target.yearMinguo}-${tm}-${batch}.json`;
   const previous=read(name);
   if(!previous?.uploaded&&!previous?.completed)out.push(target);
  }
 }
 return out;
}
function parseResult(rows,key,year,month,explicitEmpty) {
 const matches=rows.filter(r=>r.length===16&&r[1].trim()===key&&Number(r[2])===year);
 if(!matches.length&&explicitEmpty)return {m3:null,reason:'not-listed'};
 const m3=parseRows(rows,key,year,month);
 return {m3,reason:m3===null?'blank':null};
}
module.exports.dueTargets=dueTargets;
module.exports.parseResult=parseResult;

// One new round per execution month; completed historical batches do not suppress review.
function scheduledTargets(date,startMonth,keys,read){
 const [y,m,d]=date.split('-').map(Number),cycle=date.slice(0,7);
 const current=y*12+m-1, groups=plan(date,keys).groups;
 const result=[];
 for(let batch=1;batch<=3;batch++)for(let offset=1;offset<=3;offset++){
  if(d<[6,16,26][batch-1]+offset-1)continue;
  const index=current-offset,yearMinguo=Math.floor(index/12)-1911,month=index%12+1;
  const checkpointName=`review-${cycle}-${yearMinguo}-${month}-${batch}.json`;
  const prior=read(checkpointName);
  if(!prior?.completed&&!prior?.uploaded)result.push({yearMinguo,month,batch,groups,cycle,kind:'rolling-review',checkpointName,planName:`review-plan-${cycle}-${yearMinguo}-${month}.json`});
 }
 // Older never-completed batches remain catch-up work; recent ones are covered above.
 const older=dueTargets(date,startMonth,keys,read).filter(t=>(t.yearMinguo+1911)*12+t.month-1<current-3);
 return result.concat(older.map(t=>({...t,kind:'catch-up',cycle,checkpointName:`batch-${t.yearMinguo}-${t.month}-${t.batch}.json`,planName:`plan-${t.yearMinguo}-${t.month}.json`})));
}
module.exports.scheduledTargets=scheduledTargets;
