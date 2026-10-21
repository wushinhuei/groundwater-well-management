const fs=require('node:fs');const path=require('node:path');const {execFileSync}=require('node:child_process');
function protect(text,decrypt=false) {
 const op=decrypt?'Unprotect':'Protect';
 const input=decrypt?'[Convert]::FromBase64String($text)':'[Text.Encoding]::UTF8.GetBytes($text)';
 const output=decrypt?'[Text.Encoding]::UTF8.GetString($bytes)':'[Convert]::ToBase64String($bytes)';
 const script=`Add-Type -AssemblyName System.Security; $text=[Console]::In.ReadToEnd(); $bytes=[Security.Cryptography.ProtectedData]::${op}(${input},$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write(${output})`;
 return execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{input:text,encoding:'utf8',windowsHide:true,timeout:20000,maxBuffer:4*1024*1024});
}
const file=c=>path.join(c.stateDirectory,'session.dpapi');
const isWra=c=>['wr.wra.gov.tw','.wr.wra.gov.tw'].includes(c.domain);
async function restoreSession(context,config){
 if(!fs.existsSync(file(config)))return;
 const cookies=JSON.parse(protect(fs.readFileSync(file(config),'utf8'),true));
 if(!Array.isArray(cookies)||cookies.some(c=>!isWra(c)))throw Error('Invalid session');
 await context.addCookies(cookies.filter(c=>c.expires===-1||c.expires>Date.now()/1000));
}
async function saveSession(context,config){
 const cookies=(await context.cookies()).filter(isWra);
 fs.writeFileSync(file(config)+'.tmp',protect(JSON.stringify(cookies)));
 fs.renameSync(file(config)+'.tmp',file(config));
}
async function setYear(locator,year){if(await locator.evaluate(e=>e.tagName)==='SELECT')await locator.selectOption(String(year));else await locator.fill(String(year));}
module.exports={restoreSession,saveSession,setYear};
