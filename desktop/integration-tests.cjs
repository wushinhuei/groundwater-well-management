const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const realRequire=require('node:module').createRequire(__filename);
async function simulate({value='20',http=200,concurrent=false}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gw-integration-'));const state=path.join(root,'GroundwaterPC');fs.mkdirSync(state);
 const configPath=path.join(root,'config.json'),keyPath=path.join(root,'fake-key.json');
 fs.writeFileSync(configPath,JSON.stringify({stateDirectory:state,serviceAccountFile:keyPath,sourceFileId:'source',indexFolderId:'folder',startMonth:'2026-09'}));
 fs.writeFileSync(keyPath,JSON.stringify({client_email:'test@example.invalid',private_key:'FAKE'}));
 let source={records:[{waterRightNo:'K1140087',yearMinguo:115,monthlyM3:[1,2,3,4,5,6,7,8,10,null,null,null]}]},writes=0,reads=0,queries=0;
 const response=x=>({ok:true,status:200,json:async()=>structuredClone(x)});
 const fakeFetch=async(url,options={})=>{
  if(url.includes('oauth2'))return response({access_token:'FAKE'});
  if(options.method==='PATCH'){writes++;source=JSON.parse(options.body);return response({id:'source'});}
  if(url.includes('files?q='))return response({files:[{id:'registry'}]});
  if(url.includes('files/registry'))return response([{wellKey:'K1140087',station:'測試站',source:{井別:'測試井'}}]);
  if(url.includes('files/source')){reads++;const x=structuredClone(source);if(concurrent&&reads===2)x.external=true;return response(x);}
  throw Error('Unexpected network route');
 };
 const row=['1','K1140087','115',...Array(12).fill(''),'0'];row[11]=value;
 const page={setDefaultTimeout(){},goto:async()=>({status:()=>http}),url:()=> 'https://wr.wra.gov.tw/WRTInfoFrontEnd/WaterRecord/WaterSearch',waitForNavigation:async()=>({status:()=>200}),getByRole:()=>({click:async()=>{queries++;}}),locator:selector=>({fill:async()=>{},waitFor:async()=>{},evaluateAll:async()=>[row],innerText:async()=>'',})};
 const context={newPage:async()=>page,close:async()=>{}};
 class FixedDate extends Date{constructor(...args){super(...(args.length?args:['2026-10-06T06:13:00Z']));}static now(){return new Date('2026-10-06T06:13:00Z').getTime();}}
 const proc={argv:['node','run.cjs',configPath,'scheduled'],env:{LOCALAPPDATA:root},cwd:()=>root,exitCode:0};
 try{
  const sandbox={require:n=>n==='./local-data.cjs'?{localDataClient:()=>async(route,body)=>{const r=await fakeFetch('https://mock/drive/'+route,{method:body?'PATCH':'GET',body:body?JSON.stringify(body):undefined});return r.json();}}:n==='./local-publish.cjs'?{publishLocal:()=>({status:'published-verified'})}:n==='playwright'?{chromium:{launchPersistentContext:async()=>context}}:n==='./browser-session.cjs'?{restoreSession:async()=>{},saveSession:async()=>{},setYear:async()=>{}}:n==='node:crypto'?{...realRequire(n),sign:()=>Buffer.from('fake')}:realRequire(n),process:proc,console:{log(){},error(){}},Buffer,URLSearchParams,AbortSignal,Date:FixedDate,Intl,fetch:fakeFetch,setTimeout:fn=>{fn();}};
  await vm.runInNewContext(fs.readFileSync(path.join(__dirname,'run.cjs'),'utf8'),sandbox,{filename:'run.cjs'});
  const status=JSON.parse(fs.readFileSync(path.join(state,'status.json'),'utf8'));
  const logs=fs.readdirSync(path.join(state,'logs')).flatMap(n=>fs.readFileSync(path.join(state,'logs',n),'utf8').trim().split('\n').map(JSON.parse));
  return {status,logs,writes,queries,source,exitCode:proc.exitCode,cooldown:fs.existsSync(path.join(state,'cooldown.json'))};
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('runner correction uploads exactly once and logs named before/after',async()=>{
 const r=await simulate();assert.equal(r.writes,1);assert.equal(r.source.records[0].monthlyM3[8],20);assert.equal(r.status.status,'published-verified');
 const e=r.logs.find(x=>x.event==='WELL_UPDATED');assert.equal(e.wellName,'測試井');assert.equal(e.beforeM3,10);assert.equal(e.afterM3,20);
});
test('runner unchanged result performs no Drive write',async()=>{const r=await simulate({value:'10'});assert.equal(r.writes,0);assert.equal(r.status.status,'checked-no-changes');assert.ok(r.logs.some(e=>e.event==='WELL_UNCHANGED'));});
test('runner blank preserves historic number and records warning',async()=>{const r=await simulate({value:''});assert.equal(r.writes,0);assert.equal(r.source.records[0].monthlyM3[8],10);assert.ok(r.logs.some(e=>e.event==='WELL_MISSING_PRESERVED'&&e.beforeM3===10&&e.afterM3===10));});
test('runner stops when source changes concurrently',async()=>{const r=await simulate({concurrent:true});assert.equal(r.writes,0);assert.equal(r.exitCode,1);assert.equal(r.status.code,'SOURCE_CHANGED');});
test('runner HTTP429 stops before query/upload and sets cooldown',async()=>{const r=await simulate({http:429});assert.equal(r.writes,0);assert.equal(r.queries,0);assert.equal(r.cooldown,true);assert.equal(r.status.code,'SITE_BLOCKED');});
