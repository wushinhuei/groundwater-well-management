const {test}=require('node:test');const a=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {createLogger,classifyError,changedCount}=require('./logger.cjs');
test('log appends Taiwan timestamps and excludes credential fields',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gw-log-test-'));
 try {const l=createLogger(dir,{now:()=>new Date('2026-10-19T03:50:00Z'),runId:'test'});l.log('INFO','START','開始',{password:'secret'});l.log('WARN','MISSING','缺值',{waterRightNo:'B1050080'});
 const lines=fs.readFileSync(l.file,'utf8').trim().split('\n').map(JSON.parse);a.equal(lines.length,2);a.equal(lines[0].time,'2026-10-19T11:50:00.000+08:00');a.equal(lines[0].password,undefined);
 }finally{fs.rmSync(dir,{recursive:true});}
});
test('errors classify without leaking raw error content',()=>{a.equal(classifyError(Error('LOGIN_REQUIRED secret')).code,'LOGIN_REQUIRED');a.ok(!classifyError(Error('private_key=secret')).message.includes('secret'));});
test('changed count separates missing from zero',()=>{a.equal(changedCount({records:[]},{records:[{waterRightNo:'B1050080',yearMinguo:115,monthlyM3:[0,...Array(11).fill(null)]}]}),1);});

test('reporting month owns log even when run occurs later, with named wells',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gw-month-test-'));
 try {const l=createLogger(dir,{now:()=>new Date('2026-11-01T03:00:00Z')});
 l.log('INFO','RUN_START','start');l.setPeriod(115,9);
 l.log('WARN','WELL_MISSING_PRESERVED','missing',{wellName:'白冷圳大南抽水井',station:'大南',waterRightNo:'B1050080',beforeM3:0,afterM3:0});
 l.log('INFO','RUN_END','end');
 a.equal(path.basename(l.file),'抽水更新-115-09.log');
 const rows=fs.readFileSync(l.file,'utf8').trim().split('\n').map(JSON.parse);
 a.equal(rows.length,3);a.equal(rows[1].wellName,'白冷圳大南抽水井');a.equal(rows[1].beforeM3,0);
 a.equal(fs.readdirSync(path.join(dir,'logs')).length,1);
 }finally{fs.rmSync(dir,{recursive:true});}
});
