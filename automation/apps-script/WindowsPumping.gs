/** Drive handoff for Windows browser jobs; no public web app or cloud VM. */
function prepareWindowsPumpingSource() {
  const p=PropertiesService.getScriptProperties();
  const existing=p.getProperty('WRA_WINDOWS_SOURCE_FILE_ID');
  if(existing) {console.log('Windows source file ID: '+existing);return;}
  const folder=getIndexFolder_(p);
  const sources=folder.getFilesByName('wra-windows-pumping-source.json');
  if(sources.hasNext()) throw new Error('Source already exists; inspect before configuring');
  const indexes=folder.getFilesByName('pumping-index.json');
  let baseline;
  if(indexes.hasNext()) baseline=JSON.parse(indexes.next().getBlob().getDataAsString('UTF-8'));
  else {
    const response=UrlFetchApp.fetch('https://wushinhuei.github.io/groundwater-well-management/data/pumping-history.json',{muteHttpExceptions:true});
    if(response.getResponseCode()!==200) throw new Error('Cannot load published pumping baseline');
    baseline=JSON.parse(response.getContentText());
  }
  const records=Array.isArray(baseline)?baseline:baseline.records;
  if(!Array.isArray(records)||!records.length) throw new Error('Invalid pumping baseline');
  const file=folder.createFile('wra-windows-pumping-source.json',JSON.stringify({schemaVersion:1,records:records,browserSync:null}),'application/json');
  p.setProperty('WRA_WINDOWS_SOURCE_FILE_ID',file.getId());
  console.log('Windows source file ID: '+file.getId()+'; folder: '+folder.getId());
}

function syncWindowsPumpingSource() {
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(1000)) return;
  try {
    const p=PropertiesService.getScriptProperties();
    const id=requiredProperty_(p,'WRA_WINDOWS_SOURCE_FILE_ID');
    const source=JSON.parse(DriveApp.getFileById(id).getBlob().getDataAsString('UTF-8'));
    const marker=source.browserSync;
    if(!marker) return;
    if(!Array.isArray(source.records)||!source.records.length||![1,2,3].includes(marker.batch)||!marker.completedAt) throw new Error('Invalid Windows handoff');
    if(p.getProperty('WRA_WINDOWS_LAST_SUCCESS')===marker.completedAt) return;
    const token=requiredProperty_(p,'GITHUB_TOKEN');
    const base=githubApiBase_(requiredProperty_(p,'GITHUB_OWNER'),requiredProperty_(p,'GITHUB_REPO'));
    const runs=githubJson_(base+'/actions/workflows/groundwater-sync.yml/runs?per_page=20',token).workflow_runs||[];
    const pending=JSON.parse(p.getProperty('WRA_WINDOWS_PENDING')||'null');
    let attempts=0;
    if(pending) {
      const run=runs.find(r=>r.id>(pending.beforeRunId||0) && r.display_title===pending.schedule && Date.parse(r.created_at)>=Date.parse(pending.dispatchedAt)-5000);
      if(run && run.status!=='completed') return;
      if(run && run.conclusion==='success') {
        p.setProperty('WRA_WINDOWS_LAST_SUCCESS',pending.marker);
        p.deleteProperty('WRA_WINDOWS_PENDING');
        if(pending.marker===marker.completedAt) return;
      } else {
        if(!run && Date.now()-Date.parse(pending.dispatchedAt)<30*60*1000) return;
        if(pending.marker===marker.completedAt) attempts=pending.attempts;
        if(attempts>=3) throw new Error('Windows handoff failed after three attempts; inspect GitHub Actions.');
      }
    }
    if(runs.some(run=>run.status!=='completed')) return;
    const schedule='windows-browser-'+marker.completedAt;
    const dispatchedAt=new Date().toISOString();
    const old=p.getProperty('PUMPING_SOURCE_FILE_ID');
    try {
      p.setProperty('PUMPING_SOURCE_FILE_ID',id);
      dispatchGroundwaterSync_({schedule:schedule,syncScope:'pumping'});
    } finally {
      if(old) p.setProperty('PUMPING_SOURCE_FILE_ID',old); else p.deleteProperty('PUMPING_SOURCE_FILE_ID');
    }
    p.setProperty('WRA_WINDOWS_LAST_DISPATCH',marker.completedAt);
    p.setProperty('WRA_WINDOWS_PENDING',JSON.stringify({marker:marker.completedAt,schedule:schedule,dispatchedAt:dispatchedAt,beforeRunId:Math.max(0,...runs.map(r=>r.id)),attempts:attempts+1}));
    scheduleIndexWriteback_(INDEX_WRITEBACK_DELAY_MINUTES);
  } finally {lock.releaseLock();}
}

/** Activate after a real browser result was verified in Drive. */
function installWindowsPumpingHandoff() {
  const p=PropertiesService.getScriptProperties();
  const id=requiredProperty_(p,'WRA_WINDOWS_SOURCE_FILE_ID');
  const source=JSON.parse(DriveApp.getFileById(id).getBlob().getDataAsString('UTF-8'));
  if(!source.browserSync || !source.browserSync.completedAt) throw new Error('Run Windows browser-to-Drive verification first.');
  ScriptApp.getProjectTriggers().filter(t=>['triggerPumpingMonthlySync','syncWindowsPumpingSource'].includes(t.getHandlerFunction())).forEach(t=>ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncWindowsPumpingSource').timeBased().everyHours(1).nearMinute(43).create();
  console.log('Windows uploads only; hourly Drive handoff check installed.');
}

function inspectWindowsPumpingStatus() {
  const p=PropertiesService.getScriptProperties();
  const id=requiredProperty_(p,'WRA_WINDOWS_SOURCE_FILE_ID');
  const source=JSON.parse(DriveApp.getFileById(id).getBlob().getDataAsString('UTF-8'));
  console.log(JSON.stringify({records:source.records.length,browserSync:source.browserSync||null,lastSuccess:p.getProperty('WRA_WINDOWS_LAST_SUCCESS'),pending:JSON.parse(p.getProperty('WRA_WINDOWS_PENDING')||'null'),triggers:ScriptApp.getProjectTriggers().map(t=>t.getHandlerFunction())}));
}
