// Local stdio MCP. Read-only browser query; no Drive credentials or upload tools.
const {SOURCE_URL,plan,parseRows}=require('./core.cjs');
const fs=require('node:fs');const path=require('node:path');
const {restoreSession,saveSession,setYear}=require('./browser-session.cjs');
function requestArgs(args,now=new Date()) {
  if(!args || !/^[A-Z]\d{7}$/.test(args.waterRightNo)) throw Error('INVALID_WATER_RIGHT');
  if(Object.keys(args).some(k=>!['waterRightNo'].includes(k))) throw Error('UNSUPPORTED_ARGUMENT');
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const p=plan(date,[args.waterRightNo]);
  return {waterRightNo:args.waterRightNo,yearMinguo:p.yearMinguo,month:p.month};
}
async function browserQuery(config,q) {
  const {chromium}=require(config.playwrightModule);
  const profile=path.join(config.stateDirectory,'browser-profile');
  const context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:!config.interactiveLogin,chromiumSandbox:true});
  let page,stage='open-page';
  try {
    await restoreSession(context,config);
    page=await context.newPage();page.setDefaultTimeout(30000);
    await page.goto(SOURCE_URL,{waitUntil:'domcontentloaded'});
    if(config.interactiveLogin) {
      process.stderr.write('Log in in the opened Chrome window, then open Query/Export. Keep the window open; the single-well test continues automatically.\n');
      try {
        await page.waitForURL(url=>url.origin==='https://wr.wra.gov.tw' && url.pathname==='/WRTInfoFrontEnd/WaterRecord/WaterSearch',{timeout:600000});
        await page.locator('#Query_LicenseNO').waitFor({state:'visible',timeout:30000});
      } catch {throw Error('LOGIN_REQUIRED');}
    }
    if(new URL(page.url()).pathname!=='/WRTInfoFrontEnd/WaterRecord/WaterSearch') throw Error('LOGIN_REQUIRED');
    stage='water-right-field';
    await page.locator('#Query_LicenseNO').fill(q.waterRightNo);
    stage='start-year-field';
    await setYear(page.locator('#Query_StartYear'),q.yearMinguo);
    stage='end-year-field';
    await setYear(page.locator('#Query_EndYear'),q.yearMinguo);
    stage='submit-query';
    await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.getByRole('button',{name:'查詢',exact:true}).click()]);
    if(new URL(page.url()).pathname!=='/WRTInfoFrontEnd/WaterRecord/WaterSearch') throw Error('LOGIN_REQUIRED');
    stage='parse-result';
    const rows=await page.locator('table tr').evaluateAll(trs=>trs.map(tr=>Array.from(tr.querySelectorAll('td')).map(td=>td.textContent.trim())));
    const result={status:'ok',...q,m3:parseRows(rows,q.waterRightNo,q.yearMinguo,q.month),sourceUrl:SOURCE_URL,checkedAt:new Date().toISOString()};
    await saveSession(context,config);
    return result;
  } catch(error) {
    const diagnostic={stage,at:new Date().toISOString(),timeout:error.name==='TimeoutError'};
    try {
      diagnostic.pathname=new URL(page.url()).pathname;
      // Only structure is retained: never form values, page text, keys or cookies.
      diagnostic.fields=await page.locator('#Query_LicenseNO, #Query_StartYear, #Query_EndYear').evaluateAll(els=>els.map(e=>({id:e.id,tag:e.tagName,type:e.getAttribute('type')})));
      diagnostic.rowWidths=await page.locator('table tr').evaluateAll(rows=>rows.slice(0,30).map(r=>r.querySelectorAll('td').length));
      fs.mkdirSync(config.stateDirectory,{recursive:true});
      fs.writeFileSync(path.join(config.stateDirectory,'mcp-diagnostic.json'),JSON.stringify(diagnostic,null,2));
    } catch {}
    error.stage=stage;
    throw error;
  } finally {await context.close();}
}
function createHandler(query, now=()=>new Date()) {
  let initialized=false,ready=false,last=0;
  return async m=>{
    const error=(code,message)=>({jsonrpc:'2.0',id:m?.id??null,error:{code,message}});
    const success=result=>({jsonrpc:'2.0',id:m.id,result});
    if(!m||m.jsonrpc!=='2.0'||typeof m.method!=='string') return error(-32600,'Invalid request');
    if(m.method==='notifications/initialized'){if(initialized)ready=true;return null;}
    if(m.id===undefined) return null;
    if(m.method==='initialize'){
      initialized=true;ready=false;
      return success({protocolVersion:'2025-03-26',capabilities:{tools:{}},serverInfo:{name:'wra-browser-readonly',version:'0.1.0'}});
    }
    if(m.method==='ping') return success({});
    if(!ready) return error(-32000,'Initialize first');
    if(m.method==='tools/list') return success({tools:[{name:'wra_query_latest_month',description:'Read one water right from WRA browser UI for the previous complete month; no writes.',inputSchema:{type:'object',properties:{waterRightNo:{type:'string',pattern:'^[A-Z][0-9]{7}$'}},required:['waterRightNo'],additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true}}]});
    if(m.method!=='tools/call') return error(-32601,'Method not found');
    if(m.params?.name!=='wra_query_latest_month') return error(-32602,'Unknown tool');
    let q;try{q=requestArgs(m.params.arguments,now());}catch(e){return error(-32602,e.message);}
    try {
      const delay=Math.max(0,8000-(Date.now()-last));
      if(delay) await new Promise(r=>setTimeout(r,delay));
      last=Date.now();
      const result=await query(q);
      return success({content:[{type:'text',text:JSON.stringify(result)}]});
    } catch(e) {
      const message=/EPERM/.test(e.message)?'BROWSER_LAUNCH_DENIED':/LOGIN_REQUIRED/.test(e.message)?'LOGIN_REQUIRED':'BROWSER_QUERY_FAILED';
      return success({isError:true,content:[{type:'text',text:JSON.stringify({status:'error',code:message,...q,...(e.stage?{stage:e.stage}:{})})}]});
    }
  };
}
async function serve(config) {
  const handle=createHandler(q=>browserQuery(config,q));
  const lines=require('node:readline').createInterface({input:process.stdin,crlfDelay:Infinity});
  // Sequential consumption prevents overlapping browser queries within this server.
  for await(const line of lines) {
    if(!line.trim())continue;
    let response;
    try {response=await handle(JSON.parse(line));}
    catch {response={jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}};}
    if(response) process.stdout.write(JSON.stringify(response)+'\n');
  }
}
if(require.main===module) {
  const config=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
  // Explicit local test mode only. Scheduled MCP clients remain non-interactive.
  config.interactiveLogin=process.argv.includes('--login');
  serve(config).catch(()=>{process.stderr.write('MCP server failed\n');process.exitCode=1;});
}
module.exports={createHandler,requestArgs,browserQuery};
