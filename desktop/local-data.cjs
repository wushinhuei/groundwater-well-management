const fs=require('node:fs');const path=require('node:path');
function localPaths(config){const root=config.dataRoot||'D:/地下水井管理系統';return {root,source:config.pumpingSourcePath||path.join(root,'抽水紀錄','pumping-history.json'),index:path.join(root,'系統索引','well-index.json')};}
function localDataClient(config){const paths=localPaths(config);return async(route,body)=>{
 if(route.startsWith('files?q='))return {files:[{id:'local-registry'}]};
 if(route.startsWith('files/local-registry?'))return JSON.parse(fs.readFileSync(paths.index,'utf8').replace(/^\uFEFF/,''));
 if(route.startsWith('files/'+encodeURIComponent(config.sourceFileId)+'?')){
  if(body){fs.mkdirSync(path.dirname(paths.source),{recursive:true});fs.writeFileSync(paths.source+'.tmp',JSON.stringify(body,null,2),'utf8');fs.renameSync(paths.source+'.tmp',paths.source);}
  return JSON.parse(fs.readFileSync(paths.source,'utf8').replace(/^\uFEFF/,''));
 }
 throw Error('Unsupported local source route');
};}
module.exports={localPaths,localDataClient};
