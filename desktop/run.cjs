// Invoked by the Windows task; no inbound server or public port is required.
const fs=require('node:fs');
const path=require('node:path');
const {localDataClient}=require('./local-data.cjs');
const {SOURCE_URL,plan,parseResult,merge,dueTargets,scheduledTargets}=require('./core.cjs');
const {publishLocal}=require('./local-publish.cjs');
const {restoreSession,saveSession,setYear}=require('./browser-session.cjs');
const {createLogger,classifyError,changedCount}=require('./logger.cjs');
const mode=process.argv[3]||'scheduled';
let config,stateDir,phase='configuration',targetInfo={},activeWell;
const wellNames=new Map();
let outcome='completed';const started=Date.now();
const audit=createLogger(path.join(process.env.LOCALAPPDATA||process.cwd(),'GroundwaterPC'));
const log=(level,event,message,details={})=>audit.log(level,event,message,{mode,phase,...targetInfo,waterRightNo:activeWell,...(activeWell?(wellNames.get(activeWell)||{wellName:'井名未取得'}):{}),...details});
const save=(name,data)=>{const file=path.join(stateDir,name); fs.writeFileSync(file+'.tmp',JSON.stringify(data,null,2));fs.renameSync(file+'.tmp',file);};
const load=name=>fs.existsSync(path.join(stateDir,name))?JSON.parse(fs.readFileSync(path.join(stateDir,name),'utf8')):null;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(){
  log('INFO','RUN_START','開始執行本機更新。');
  config=JSON.parse(fs.readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,''));
  stateDir=config.stateDirectory;
  fs.mkdirSync(stateDir,{recursive:true});
  phase='dependencies';
  if(mode==='scheduled'||mode==='publish'){
    phase='local-publish';
    const result=publishLocal(config,process.argv[2],'all');
    log('INFO','LOCAL_PUBLISH_VERIFIED','本機同步、GitHub 提交及網站資料比對完成。',{outcome:result.status});
    if(mode==='publish')return;
  }
  const {chromium}=require('playwright');
  if(mode==='login') {
    phase='login';
    const context=await chromium.launchPersistentContext(path.join(stateDir,'browser-profile'),{channel:'chrome',headless:false,chromiumSandbox:true});
    try {
      await restoreSession(context,config);
      const page=context.pages()[0]||await context.newPage();
      await page.goto(SOURCE_URL);
      console.log('Log in and open Query/Export. Keep this window open until login is verified.');
      await page.waitForURL(url=>url.origin==='https://wr.wra.gov.tw'&&url.pathname==='/WRTInfoFrontEnd/WaterRecord/WaterSearch',{timeout:600000});
      await page.locator('#Query_LicenseNO').waitFor({state:'visible'});
      await saveSession(context,config);
      save('cooldown.json',{until:0});
      log('INFO','LOGIN_OK','本機登入驗證成功。');
      console.log('WRA login verified and saved privately.');
    } finally {await context.close();}
    return;
  }
  if(!config.sourceFileId) throw Error('Local source identifier has not been configured');
  phase='local-read';
  const drive=localDataClient(config);
  if(mode==='verify-local') {
    const original=await drive('files/'+encodeURIComponent(config.sourceFileId)+'?alt=media');
    if(original.browserSync) throw Error('Transport test requires an unused staging source');
    await drive('files/'+encodeURIComponent(config.sourceFileId)+'?uploadType=media',original);
    const check=await drive('files/'+encodeURIComponent(config.sourceFileId)+'?alt=media');
    if(JSON.stringify(check)!==JSON.stringify(original)) throw Error('本機 round-trip mismatch');
    console.log('本機 read/write verified; baseline records: '+check.records.length+'; no WRA data or dispatch marker added');return;
  }
  const q="'"+config.indexFolderId+"' in parents and trashed=false and name='well-index.json'";
  const files=await drive('files?q='+encodeURIComponent(q)+'&fields=files(id)');
  if(files.files.length!==1) throw Error('Well index missing or duplicated');
  const registry=await drive('files/'+files.files[0].id+'?alt=media');
  for(const r of registry)wellNames.set(r.wellKey,{wellName:r.wellName||r.source?.['井別']||'井名未取得',station:r.station||r.source?.['站別']||''});
  const keys=registry.map(r=>r.wellKey);
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const sample=['smoke','smoke-upload'].includes(mode);
  const queue=scheduledTargets(date,config.startMonth,keys,load);
  if(mode==='plan') {log('INFO','PLAN','已取得待更新批次。',{pendingBatches:queue.length});console.log(JSON.stringify(queue,null,2));return;}
  let target=sample?plan(date,keys):queue[0];
  if(!target){outcome='no-work';log('INFO','NO_WORK','沒有到期且未完成的批次。');console.log('No outstanding batches');return;}
  if(sample) {target.batch=1;target.groups=[['K1140087'],[],[]];}
  const frozenName=target.planName||('plan-'+target.yearMinguo+'-'+target.month+'.json');
  const frozen=load(frozenName);
  if(!sample) {if(frozen)target.groups=frozen.groups;else save(frozenName,target);}
  targetInfo={yearMinguo:target.yearMinguo,month:target.month,batch:target.batch,cycle:target.cycle,kind:target.kind};
  audit.setPeriod(target.yearMinguo,target.month);
  const name=target.checkpointName||('batch-'+target.yearMinguo+'-'+target.month+'-'+target.batch+'.json');
  const checkpoint=(sample?null:load(name))||{results:[],uploaded:false};
  log('INFO','BATCH_START','開始處理批次。',{resumedWells:checkpoint.results.length});
  if(checkpoint.completed||checkpoint.uploaded){outcome='already-uploaded';console.log('Batch already uploaded');return;}
  if(!sample && load('cooldown.json')?.until>Date.now()) throw Error('COOLDOWN: retry tomorrow');
  phase='query';
  const context=await chromium.launchPersistentContext(path.join(stateDir,'browser-profile'),{channel:'chrome',headless:true,chromiumSandbox:true});
  try {
    await restoreSession(context,config);
    const page=await context.newPage(); page.setDefaultTimeout(30000);
    for(const key of target.groups[target.batch-1]) {
      if(checkpoint.results.some(r=>r.waterRightNo===key)) continue;
      activeWell=key;
      log('INFO','WELL_START','開始查詢井號。');
      await sleep(Math.max(15000,Number(config.requestIntervalMs)||15000));
      const response=await page.goto(SOURCE_URL,{waitUntil:'domcontentloaded'});
      if(response&&response.status()>=400)throw Error('SITE_HTTP_'+response.status());
      if(!page.url().startsWith(SOURCE_URL)) throw Error('LOGIN_REQUIRED: open the dedicated login shortcut');
      await page.locator('#Query_LicenseNO').fill(key);
      await setYear(page.locator('#Query_StartYear'),target.yearMinguo);
      await setYear(page.locator('#Query_EndYear'),target.yearMinguo);
      const [response2]=await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.getByRole('button',{name:'查詢',exact:true}).click()]);
      if(response2&&response2.status()>=400)throw Error('SITE_HTTP_'+response2.status());
      await page.locator('#Query_LicenseNO').waitFor({state:'visible'});
      if(!page.url().startsWith(SOURCE_URL)) throw Error('LOGIN_REQUIRED');
      const rows=await page.locator('table tr').evaluateAll(trs=>trs.map(tr=>Array.from(tr.querySelectorAll('td')).map(td=>td.textContent.trim())));
      const body=await page.locator('body').innerText();
      if(/Too Many Requests|Access Denied|驗證碼|存取遭拒|請求過於頻繁/i.test(body))throw Error('SITE_HTTP_BLOCKED');
      const {m3,reason}=parseResult(rows,key,target.yearMinguo,target.month,/查無資料|查無符合.*資料|沒有符合.*資料/.test(body));
      await saveSession(context,config);
      checkpoint.results.push({waterRightNo:key,yearMinguo:target.yearMinguo,month:target.month,m3,reason,checkedAt:new Date().toISOString()});
      if(!sample) save(name,checkpoint);
      log(reason?'WARN':'INFO',reason?'MISSING_DATA':'WELL_OK',reason?'官方資料缺漏，保留原值。':'井號查詢完成。',{reason,m3});
    }
  } finally {await context.close();}
  activeWell=undefined;
  const stats={checkedWells:checkpoint.results.length,missingWells:checkpoint.results.filter(r=>r.m3===null).length};
  log(stats.missingWells?'WARN':'INFO','BATCH_QUERIED','批次查詢結束。',stats);
  if(mode==='smoke') {log('INFO','VERIFY_OK','單井驗證完成，未寫入 本機。',stats);save('smoke-result.json',checkpoint.results);save('verification.json',{at:Date.now(),ok:true});console.log(JSON.stringify(checkpoint.results));return;}
  phase='local-write';
  const source=await drive('files/'+encodeURIComponent(config.sourceFileId)+'?alt=media');
  save('before-upload.json',source);
  const merged=merge(source,checkpoint.results,target);
  const latest=await drive('files/'+encodeURIComponent(config.sourceFileId)+'?alt=media');
  if(JSON.stringify(latest)!==JSON.stringify(source))throw Error('SOURCE_CHANGED: retry later');
  if(sample) merged.browserSync.kind='single-well-verification';
  // Local PC owns publication; do not signal the legacy Apps Script listener.
  merged.browserSync=null;
  const changedMonths=changedCount(source,merged);
  if(changedMonths>0){
    log('INFO','UPLOAD_START','開始寫入 本機。',{...stats,changedMonths});
    await drive('files/'+encodeURIComponent(config.sourceFileId)+'?uploadType=media',merged);
    const verification=await drive('files/'+encodeURIComponent(config.sourceFileId)+'?alt=media');
    if(JSON.stringify(verification)!==JSON.stringify(merged))throw Error('本機 write verification failed');
  }
  if(changedMonths>0){
    phase='local-publish';
    publishLocal(config,process.argv[2],'pumping');
    log('INFO','LOCAL_PUBLISH_VERIFIED','本機已完成抽水索引更新及網站公開資料比對。');
  }
  for(const r of checkpoint.results){
    const before=source.records.find(x=>x.waterRightNo===r.waterRightNo&&x.yearMinguo===r.yearMinguo)?.monthlyM3[r.month-1]??null;
    const after=merged.records.find(x=>x.waterRightNo===r.waterRightNo&&x.yearMinguo===r.yearMinguo)?.monthlyM3[r.month-1]??null;
    const missing=r.m3===null;
    log(missing?'WARN':'INFO',missing?'WELL_MISSING_PRESERVED':before===after?'WELL_UNCHANGED':'WELL_UPDATED',missing?(r.reason==='not-listed'?'官方查無此井年度資料，未填零，保留原值。':'官方月份欄位空白，未填零，保留原值。'):before===after?'數值與原資料一致，無需變更。':'此井月份數值已寫入 本機 並讀回驗證。',{waterRightNo:r.waterRightNo,...(wellNames.get(r.waterRightNo)||{wellName:'井名未取得'}),beforeM3:before,afterM3:after,reason:r.reason,checkedWells:undefined});
  }
  checkpoint.completed=true;checkpoint.uploaded=changedMonths>0;
  checkpoint.completedAt=new Date().toISOString();
  if(!sample){
    save(name,checkpoint);
    // Preserve compatibility with catch-up checks without reusing old results in a new review.
    save('batch-'+target.yearMinguo+'-'+target.month+'-'+target.batch+'.json',{completed:true,uploaded:changedMonths>0,checkedOnly:changedMonths===0,completedAt:checkpoint.completedAt,reviewCheckpoint:name});
  }
  outcome=changedMonths>0?'published-verified':'checked-no-changes';
  save('status.json',{status:outcome,...targetInfo,...stats,changedMonths,completedAt:checkpoint.completedAt});
  log(stats.missingWells?'WARN':'INFO',changedMonths>0?'UPLOAD_VERIFIED':'NO_CHANGES',changedMonths>0?'本機、索引、GitHub 提交及網站公開資料比對成功。':'補查完成，無新數值；未寫入 本機。',{...stats,changedMonths,outcome});
  console.log(outcome+'; changed months: '+changedMonths);

}
main().catch(error=>{
  outcome='failed';const failure=classifyError(error);
  log('ERROR','RUN_ERROR',failure.message,failure);
  if(stateDir){
    if(/SITE_HTTP_|Timeout|LOGIN_REQUIRED/.test(error.message))save('cooldown.json',{until:Date.now()+86400000});
    save('status.json',{status:'failed',...failure,at:new Date().toISOString()});
  }
  console.error(failure.code+': '+failure.message);process.exitCode=1;
}).finally(()=>log(outcome==='failed'?'ERROR':'INFO','RUN_END','本次執行結束。',{outcome,durationSeconds:Math.round((Date.now()-started)/1000)}));
