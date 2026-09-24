const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync('automation/apps-script/Code.gs','utf8');
function setup(y,m,d) {
  const props = new Map();
  const p = {getProperty:k=>props.get(k)||'',setProperty:(k,v)=>props.set(k,v)};
  const ctx = vm.createContext({Date, console, ScriptApp:{WeekDay:{MONDAY:1}}, Utilities:{formatDate:(_,tz,f)=>({yyyy:String(y),M:String(m),d:String(d),'yyyy-MM-dd':`${y}-${m}-${d}`}[f])}, PropertiesService:{getScriptProperties:()=>p}});
  vm.runInContext(code, ctx);
  ctx.loadWellKeysFromDriveIndex_ = ()=>Array.from({length:111},(_,i)=>`B${i}`);
  return {ctx,p};
}
test('all wells exactly once each month, including February',()=>{
  for (const [year,month,days] of [[2026,2,28],[2028,2,29],[2026,9,30],[2026,10,31]]) {
    const all=[];
    for(let d=1;d<=Math.min(days,29);d+=2) {
      const {ctx,p}=setup(year,month,d);
      const b=ctx.monthlyDistributedWellBatch_(p);
      assert.ok(b.wellKeys.length<=8); all.push(...b.wellKeys);
    }
    assert.equal(all.length,111); assert.equal(new Set(all).size,111);
  }
});
test('well and pumping days never overlap; day 31 skipped',()=>{
  for(let d=1;d<=31;d++) {
    const {ctx}=setup(2026,10,d); const scopes=[];
    ctx.dispatchScheduledSync_=s=>scopes.push(s);
    ctx.triggerDistributedMonthlyGroundwaterSync(); ctx.triggerPumpingMonthlySync();
    assert.ok(scopes.length<=1);
    assert.equal(scopes.includes('pumping'),[6,16,26].includes(d));
    assert.equal(scopes.includes('wells'),d<=29&&d%2===1);
  }
});
test('duplicate dispatch and busy workflow are skipped',()=>{
  const {ctx,p}=setup(2026,9,25); let calls=0, released=0;
  p.setProperty('GITHUB_TOKEN','test');p.setProperty('GITHUB_OWNER','test');p.setProperty('GITHUB_REPO','test');
  ctx.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>released++})};
  ctx.githubJson_=()=>({workflow_runs:[{status:'in_progress'}]});
  ctx.dispatchGroundwaterSync_=()=>calls++;ctx.scheduleIndexWriteback_=()=>{};
  ctx.dispatchScheduledSync_('wells');assert.equal(calls,0);
  ctx.githubJson_=()=>({workflow_runs:[]});
  ctx.dispatchScheduledSync_('wells');ctx.dispatchScheduledSync_('wells');
  assert.equal(calls,1);assert.equal(released,3);
});
