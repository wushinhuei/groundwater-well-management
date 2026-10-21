const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
function taipeiTime(date=new Date()) {return new Date(date.getTime()+8*3600000).toISOString().replace('Z','+08:00');}
function classifyError(error){
 const s=String(error?.message||'');
 if(/LOCAL_SETUP_REQUIRED/.test(s))return {code:'LOCAL_SETUP_REQUIRED',message:'請先執行 Configure-Local.cmd 設定 Python 與 GitHub CLI。'};
 if(/LOCAL_PUBLISH_FAILED/.test(s))return {code:'LOCAL_PUBLISH_FAILED',message:'本機同步或網站驗證尚未完成，請查看 local-publish-status.json；下次重試。'};
 if(/LOGIN_REQUIRED/.test(s))return {code:'LOGIN_REQUIRED',message:'登入已過期，請在本機執行 Login.cmd。'};
 if(/COOLDOWN/.test(s))return {code:'COOLDOWN',message:'網站查詢暫停中，冷卻期結束後再試。'};
 if(/SITE_HTTP_/.test(s))return {code:'SITE_BLOCKED',message:'網站拒絕請求或回傳錯誤，已停止查詢。'};
 if(/Timeout|timeout/i.test(s))return {code:'TIMEOUT',message:'連線或頁面操作逾時，已停止本次作業。'};
 if(/Drive authentication|Drive request/.test(s))return {code:'DRIVE_ERROR',message:'Google Drive 驗證或讀寫失敗，請檢查金鑰及檔案權限。'};
 if(/SOURCE_CHANGED/.test(s))return {code:'SOURCE_CHANGED',message:'Drive 原始資料已被其他程序更新，本次停止寫入。'};
 if(/write verification/.test(s))return {code:'VERIFY_FAILED',message:'Drive 寫入後比對失敗，尚未標記批次完成。'};
 if(/matching annual row|monthly value|Non-finite|Invalid baseline|Incomplete|duplicate/i.test(s))return {code:'DATA_ERROR',message:'資料缺少明確對應、重複或數值格式異常，停止更新。'};
 return {code:'EXECUTION_ERROR',message:'程式執行失敗，請檢查本機設定、依賴與網路。'};
}
function createLogger(directory,{now=()=>new Date(),runId=crypto.randomUUID()}={}) {
 const folder=path.join(directory,'logs');fs.mkdirSync(folder,{recursive:true});
 let period=null;const pending=[];
 const allowed=['cycle','kind','mode','phase','yearMinguo','month','batch','waterRightNo','wellName','station','beforeM3','afterM3','checkedWells','missingWells','changedMonths','durationSeconds','code','outcome','reason','m3','pendingBatches','resumedWells','exitCode'];
 function filename(){return path.join(folder,`抽水更新-${period.yearMinguo}-${String(period.month).padStart(2,'0')}.log`);}
 function flush(){if(pending.length){fs.appendFileSync(filename(),pending.map(r=>JSON.stringify(r)).join('\n')+'\n','utf8');pending.length=0;}}
 function setPeriod(yearMinguo,month){
  if(!Number.isInteger(yearMinguo)||!Number.isInteger(month)||month<1||month>12)throw Error('Invalid log period');
  if(period&&(period.yearMinguo!==yearMinguo||period.month!==month))throw Error('Log period already set');
  period={yearMinguo,month};flush();
 }
 function fallback(){const parts=taipeiTime(now()).slice(0,7).split('-').map(Number);setPeriod(parts[0]-1911,parts[1]);}
 function log(level,event,message,details={}) {
  const row={time:taipeiTime(now()),runId,level,event,message};
  for(const k of allowed)if(details[k]!==undefined)row[k]=details[k];
  pending.push(row);if(event==='RUN_END'&&!period)fallback();if(period)flush();return row;
 }
 return {log,setPeriod,get file(){if(!period)fallback();return filename();},runId};
}
function changedCount(before,after){
 const index=new Map(before.records.map(r=>[r.waterRightNo+'|'+r.yearMinguo,r.monthlyM3]));
 return after.records.reduce((sum,r)=>sum+r.monthlyM3.filter((v,i)=>v!==(index.get(r.waterRightNo+'|'+r.yearMinguo)?.[i]??null)).length,0);
}
module.exports={createLogger,taipeiTime,classifyError,changedCount};
