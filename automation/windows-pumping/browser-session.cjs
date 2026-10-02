const fs=require('node:fs');
const path=require('node:path');
const sessionFile=config=>path.join(config.stateDirectory,'wra-session-private.json');
const isWra=c=>c.domain==='wr.wra.gov.tw'||c.domain==='.wr.wra.gov.tw';
async function restoreSession(context,config) {
  const file=sessionFile(config);
  if(!fs.existsSync(file)) return;
  const cookies=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!Array.isArray(cookies)||cookies.some(c=>!isWra(c))) throw Error('INVALID_SESSION_FILE');
  await context.addCookies(cookies.filter(c=>c.expires===-1||c.expires>Date.now()/1000));
}
async function saveSession(context,config) {
  const cookies=(await context.cookies('https://wr.wra.gov.tw')).filter(isWra);
  fs.mkdirSync(config.stateDirectory,{recursive:true});
  const file=sessionFile(config);
  fs.writeFileSync(file+'.tmp',JSON.stringify(cookies),{mode:0o600});
  fs.renameSync(file+'.tmp',file);
}
async function setYear(locator,year) {
  if(await locator.evaluate(e=>e.tagName)==='SELECT') await locator.selectOption(String(year));
  else await locator.fill(String(year));
}
module.exports={restoreSession,saveSession,setYear};
