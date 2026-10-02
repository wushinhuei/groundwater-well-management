// Invoked by the Windows task; no inbound server or public port is required.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {SOURCE_URL,plan,parseRows,merge}=require('./core.cjs');
const {restoreSession,saveSession,setYear}=require('./browser-session.cjs');
const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const mode=process.argv[3]||'scheduled';
const stateDir=config.stateDirectory;
fs.mkdirSync(stateDir,{recursive:true});
const save=(name,data)=>{const file=path.join(stateDir,name); fs.writeFileSync(file+'.tmp',JSON.stringify(data,null,2));fs.renameSync(file+'.tmp',file);};
const load=name=>fs.existsSync(path.join(stateDir,name))?JSON.parse(fs.readFileSync(path.join(stateDir,name),'utf8')):null;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function driveClient(){
  const key=JSON.parse(fs.readFileSync(config.serviceAccountFile,'utf8'));
  const enc=obj=>Buffer.from(JSON.stringify(obj)).toString('base64url');
  const now=Math.floor(Date.now()/1000);
  const unsigned=enc({alg:'RS256',typ:'JWT'})+'.'+enc({iss:key.client_email,scope:'https://www.googleapis.com/auth/drive',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
  const assertion=unsigned+'.'+crypto.sign('RSA-SHA256',Buffer.from(unsigned),key.private_key).toString('base64url');
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),signal:AbortSignal.timeout(40000)});
  if(!response.ok) throw Error('Drive authentication failed: '+response.status);
  const token=(await response.json()).access_token;
  return async (route,body)=>{
    const url='https://www.googleapis.com/'+(body?'upload/':'')+'drive/v3/'+route;
    const r=await fetch(url,{method:body?'PATCH':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
    if(!r.ok) throw Error('Drive request failed: '+r.status);
    return r.json();
  };
}
async function main(){
  const {chromium}=require(config.playwrightModule);
  if(mode==='login') {
    const context=await chromium.launchPersistentContext(path.join(stateDir,'browser-profile'),{channel:'chrome',headless:false,chromiumSandbox:true});
    try {
      await restoreSession(context,config);
      const page=context.pages()[0]||await context.newPage();
      await page.goto(SOURCE_URL);
      console.log('Log in and open Query/Export. Keep this window open until login is verified.');
      await page.waitForURL(url=>url.origin==='https://wr.wra.gov.tw'&&url.pathname==='/WRTInfoFrontEnd/WaterRecord/WaterSearch',{timeout:600000});
      await page.locator('#Query_LicenseNO').waitFor({state:'visible'});
      await saveSession(context,config);
      console.log('WRA login verified and saved privately.');
    } finally {await context.close();}
    return;
  }
  if(!config.sourceFileId) throw Error('Apps Script source file has not been configured');
  const drive=await driveClient();
  if(mode==='verify-drive') {
    const original=await drive('files/'+encodeURIComponent(config.sourceFileId)+'?alt=media');
    if(original.browserSync) throw Error('Transport test requires an unused staging source');
    await drive('files/'+encodeURIComponent(config.sourceFileId)+'?uploadType=media',original);
    const check=await drive('files/'+encodeURIComponent(config.sourceFileId)+'?alt=media');
    if(JSON.stringify(check)!==JSON.stringify(original)) throw Error('Drive round-trip mismatch');
    console.log('Drive read/write verified; baseline records: '+check.records.length+'; no WRA data or dispatch marker added');return;
  }
  const q="'"+config.indexFolderId+"' in parents and trashed=false and name='well-index.json'";
  const files=await drive('files?q='+encodeURIComponent(q)+'&fields=files(id)');
  if(files.files.length!==1) throw Error('Well index missing or duplicated');
  const keys=(await drive('files/'+files.files[0].id+'?alt=media')).map(r=>r.wellKey);
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  let target=plan(date,keys);
  const frozenName='plan-'+target.yearMinguo+'-'+target.month+'.json';
  const frozen=load(frozenName);
  if(frozen) target.groups=frozen.groups; else save(frozenName,target);
  if(mode==='plan') {console.log(JSON.stringify(target));return;}
  const sample=['smoke','smoke-upload'].includes(mode);
  if(sample) {target.batch=1;target.groups=[['K1140087'],[],[]];}
  if(!target.batch) {console.log('Not due before the sixth of the month');return;}
  const name='batch-'+target.yearMinguo+'-'+target.month+'-'+target.batch+'.json';
  const checkpoint=(sample?null:load(name))||{results:[],uploaded:false};
  if(checkpoint.uploaded){console.log('Batch already uploaded');return;}
  const context=await chromium.launchPersistentContext(path.join(stateDir,'browser-profile'),{channel:'chrome',headless:true,chromiumSandbox:true});
  try {
    await restoreSession(context,config);
    const page=await context.newPage(); page.setDefaultTimeout(30000);
    for(const key of target.groups[target.batch-1]) {
      if(checkpoint.results.some(r=>r.waterRightNo===key)) continue;
      await sleep(8000);
      await page.goto(SOURCE_URL,{waitUntil:'domcontentloaded'});
      if(!page.url().startsWith(SOURCE_URL)) throw Error('LOGIN_REQUIRED: open the dedicated login shortcut');
      await page.locator('#Query_LicenseNO').fill(key);
      await setYear(page.locator('#Query_StartYear'),target.yearMinguo);
      await setYear(page.locator('#Query_EndYear'),target.yearMinguo);
      await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.getByRole('button',{name:'查詢',exact:true}).click()]);
      if(!page.url().startsWith(SOURCE_URL)) throw Error('LOGIN_REQUIRED');
      const rows=await page.locator('table tr').evaluateAll(trs=>trs.map(tr=>Array.from(tr.querySelectorAll('td')).map(td=>td.textContent.trim())));
      const m3=parseRows(rows,key,target.yearMinguo,target.month);
      await saveSession(context,config);
      checkpoint.results.push({waterRightNo:key,yearMinguo:target.yearMinguo,month:target.month,m3,checkedAt:new Date().toISOString()});
      if(!sample) save(name,checkpoint);
    }
  } finally {await context.close();}
  if(mode==='smoke') {save('smoke-result.json',checkpoint.results);console.log(JSON.stringify(checkpoint.results));return;}
  const source=await drive('files/'+encodeURIComponent(config.sourceFileId)+'?alt=media');
  const merged=merge(source,checkpoint.results,target);
  if(sample) merged.browserSync.kind='single-well-verification';
  await drive('files/'+encodeURIComponent(config.sourceFileId)+'?uploadType=media',merged);
  const verification=await drive('files/'+encodeURIComponent(config.sourceFileId)+'?alt=media');
  if(verification.browserSync.completedAt!==merged.browserSync.completedAt) throw Error('Drive write verification failed');
  checkpoint.uploaded=true;if(!sample) save(name,checkpoint);
  save('status.json',{status:'uploaded-awaiting-apps-script',...merged.browserSync});
  console.log('Uploaded batch '+target.batch+'; Apps Script will process it');
}
main().catch(error=>{save('status.json',{status:'failed',message:error.message,at:new Date().toISOString()});console.error(error.message);process.exitCode=1;});
