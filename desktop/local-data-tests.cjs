const {test}=require('node:test'),assert=require('node:assert/strict');const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const {localDataClient}=require('./local-data.cjs');
test('local pumping source read/write stays in designated data root',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'local-master-'));
 try{fs.mkdirSync(path.join(root,'抽水紀錄'));fs.mkdirSync(path.join(root,'系統索引'));fs.writeFileSync(path.join(root,'抽水紀錄','pumping-history.json'),'{"records":[]}');fs.writeFileSync(path.join(root,'系統索引','well-index.json'),'[{"wellKey":"B1050080"}]');const client=localDataClient({dataRoot:root,sourceFileId:'source'});
 assert.equal((await client('files/local-registry?alt=media'))[0].wellKey,'B1050080');await client('files/source?uploadType=media',{records:[{a:1}]});assert.equal((await client('files/source?alt=media')).records[0].a,1);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('missing local master fails instead of restoring cloud data',async()=>{const client=localDataClient({dataRoot:path.join(os.tmpdir(),'missing-master-'+Date.now()),sourceFileId:'source'});await assert.rejects(()=>client('files/source?alt=media'));});
