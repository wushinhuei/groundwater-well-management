const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function fixture(runs=[]) {
  const marker='2026-10-02T02:45:03.075Z';
  const values={WRA_WINDOWS_SOURCE_FILE_ID:'source',GITHUB_TOKEN:'test',GITHUB_OWNER:'owner',GITHUB_REPO:'repo',PUMPING_SOURCE_FILE_ID:'original'};
  const props={getProperty:k=>values[k]||null,setProperty:(k,v)=>values[k]=v,deleteProperty:k=>delete values[k]};
  const sent=[];
  const context={PropertiesService:{getScriptProperties:()=>props},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},DriveApp:{getFileById:()=>({getBlob:()=>({getDataAsString:()=>JSON.stringify({records:[{}],browserSync:{batch:1,completedAt:marker}})})})},requiredProperty_:(p,k)=>p.getProperty(k),githubApiBase_:()=>'',githubJson_:()=>({workflow_runs:runs}),dispatchGroundwaterSync_:o=>sent.push(o),scheduleIndexWriteback_(){},INDEX_WRITEBACK_DELAY_MINUTES:5,console};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(require.resolve('../automation/apps-script/WindowsPumping.gs'),'utf8'),context);
  return {values,sent,marker,run:()=>context.syncWindowsPumpingSource()};
}
test('dispatch remains pending; no duplicate while awaiting a run',()=>{
  const f=fixture();f.run();f.run();
  assert.equal(f.sent.length,1);
  assert.equal(f.values.PUMPING_SOURCE_FILE_ID,'original');
  assert.equal(f.values.WRA_WINDOWS_LAST_SUCCESS,undefined);
});
test('success acknowledgement and failure retry use the matching run',()=>{
  for(const conclusion of ['success','failure']) {
    const runs=[];const f=fixture(runs);f.run();
    const p=JSON.parse(f.values.WRA_WINDOWS_PENDING);
    runs.push({id:1,display_title:p.schedule,created_at:p.dispatchedAt,status:'completed',conclusion});
    f.run();
    assert.equal(f.sent.length,conclusion==='success'?1:2);
    assert.equal(f.values.WRA_WINDOWS_LAST_SUCCESS,conclusion==='success'?f.marker:undefined);
    f.run();assert.equal(f.sent.length,conclusion==='success'?1:2);
  }
});
