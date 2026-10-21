const {test}=require('node:test');const a=require('node:assert/strict');
const {dueTargets,parseResult,merge,plan}=require('./core.cjs');
const keys=['B1050080','B0950059','K0124336'];
test('catch up earlier missed batches, including months with PC off',()=>{
 const q=dueTargets('2026-11-06','2026-09',keys,()=>null);
 a.deepEqual(q.map(t=>[t.month,t.batch]),[[9,1],[9,2],[9,3],[10,1]]);
 a.equal(dueTargets('2026-10-05','2026-09',keys,()=>null).length,0);
 a.equal(dueTargets('2026-10-26','2026-09',keys,()=>({uploaded:true})).length,0);
});
test('January reporting targets previous December',()=>{
 a.equal(dueTargets('2027-01-06','2026-12',keys,()=>null)[0].yearMinguo,115);
});
test('missing is allowed only with explicit empty-result evidence',()=>{
 a.deepEqual(parseResult([],keys[0],115,9,true),{m3:null,reason:'not-listed'});
 a.throws(()=>parseResult([],keys[0],115,9,false));
});
test('blank, zero and duplicate remain distinct',()=>{
 const row=['1',keys[0],'115',...Array(12).fill(''),'0'];
 a.equal(parseResult([row],keys[0],115,9,false).m3,null);
 row[11]='0';a.equal(parseResult([row],keys[0],115,9,false).m3,0);
 a.throws(()=>parseResult([row,row],keys[0],115,9,true));
 row[11]='-1';a.throws(()=>parseResult([row],keys[0],115,9,false));
});
test('missing preserves existing source and never invents an annual row',()=>{
 const target=plan('2026-10-06',[keys[0]]);
 const source={records:[{waterRightNo:keys[0],yearMinguo:115,monthlyM3:Array(12).fill(9)}]};
 const r={waterRightNo:keys[0],yearMinguo:115,month:9,m3:null};
 a.deepEqual(merge(source,[r],target).records,source.records);
 a.equal(merge({records:[]},[r],target).records.length,0);
 a.equal(merge(source,[{...r,m3:0}],target).records[0].monthlyM3[8],0);
 a.throws(()=>merge(source,[],target));
});
const {scheduledTargets}=require('./core.cjs');
test('rolling three completed months include previous month only once',()=>{
 const q=scheduledTargets('2026-10-28','2026-09',keys,()=>({uploaded:false}));
 a.equal(q.length,9);a.deepEqual([...new Set(q.map(t=>t.month))],[9,8,7]);
 a.equal(new Set(q.map(t=>t.checkpointName)).size,9);
 a.deepEqual(scheduledTargets('2026-10-06','2026-09',keys,()=>null).map(t=>t.month),[9]);
 a.deepEqual(scheduledTargets('2026-10-08','2026-09',keys,()=>null).map(t=>t.month),[9,8,7]);
});
test('old completed batches do not suppress a new review, completed review does',()=>{
 const read=n=>n.startsWith('batch-')?{uploaded:true}:null;
 const q=scheduledTargets('2026-10-08','2026-09',keys,read);a.equal(q.length,3);
 const done=q[0].checkpointName;
 a.equal(scheduledTargets('2026-10-08','2026-09',keys,n=>n===done?{completed:true,uploaded:false}:read(n)).length,2);
 const november=scheduledTargets('2026-11-08','2026-09',keys,n=>n.startsWith('review-2026-10')?{completed:true}:read(n));
 a.equal(november.length,3);a.ok(november.some(t=>t.month===9));
});
test('rolling review crosses years and excludes current month',()=>{
 const q=scheduledTargets('2027-01-28','2026-12',keys,()=>null);
 a.deepEqual([...new Set(q.map(t=>t.month))],[12,11,10]);a.ok(q.every(t=>t.yearMinguo===115));
});
test('older unfinished months remain catchup after rolling work',()=>{
 const q=scheduledTargets('2026-10-08','2026-05',keys,()=>null);
 a.deepEqual(q.slice(0,3).map(t=>t.month),[9,8,7]);a.ok(q.slice(3).every(t=>t.kind==='catch-up'&&t.month<7));
});
test('late corrections change only chosen month and retain blank historic values',()=>{
 const t=plan('2026-10-06',[keys[0]]);t.month=8;
 const original={records:[{waterRightNo:keys[0],yearMinguo:115,monthlyM3:[1,2,3,4,5,6,7,8,9,null,null,null]}]};
 const r={waterRightNo:keys[0],yearMinguo:115,month:8,m3:80};
 const next=merge(original,[r],t);a.equal(next.records[0].monthlyM3[7],80);a.equal(next.records[0].monthlyM3[8],9);
 a.deepEqual(merge(original,[{...r,m3:null}],t).records,original.records);
});
