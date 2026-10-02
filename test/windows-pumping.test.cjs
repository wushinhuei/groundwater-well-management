const {test}=require('node:test');const assert=require('node:assert/strict');
const {plan,parseRows,merge}=require('../automation/windows-pumping/core.cjs');
test('previous full month, January boundary and three disjoint batches',()=>{
 const keys=Array.from({length:111},(_,i)=>'K'+String(i).padStart(7,'0'));
 const p=plan('2026-10-16',keys);assert.equal(p.batch,2);assert.equal(p.month,9);assert.equal(p.yearMinguo,115);
 assert.deepEqual(p.groups.map(g=>g.length),[37,37,37]);assert.equal(new Set(p.groups.flat()).size,111);
 assert.equal(plan('2027-01-06',keys).month,12);assert.equal(plan('2027-01-06',keys).yearMinguo,115);
 assert.equal(plan('2026-10-01',keys).batch,0);
});
test('DOM parser preserves blank columns and rejects mismatched/duplicate rows',()=>{
 const row=['1','K1140087','115',...Array(12).fill(''),'3024']; row[10]='252';
 assert.equal(parseRows([row],'K1140087',115,8),252);assert.equal(parseRows([row],'K1140087',115,9),null);
 row[11]='0';assert.equal(parseRows([row],'K1140087',115,9),0);
 row[11]='1,008';assert.equal(parseRows([row],'K1140087',115,9),1008);
 row[11]='--';assert.throws(()=>parseRows([row],'K1140087',115,9));
 assert.throws(()=>parseRows([row,row],'K1140087',115,9));assert.throws(()=>parseRows([row],'K1140087',114,9));
});
test('merge modifies only selected month and never blanks existing values',()=>{
 const target=plan('2026-10-06',['K1140087']);
 const source={records:[{waterRightNo:'K1140087',yearMinguo:115,monthlyM3:[0,0,0,126,630,1008,1008,252,12,null,null,null]}]};
 const r={waterRightNo:'K1140087',yearMinguo:115,month:9,m3:null};
 assert.deepEqual(merge(source,[r],target).records[0].monthlyM3,source.records[0].monthlyM3);
 const result=merge(source,[{...r,m3:0}],target);assert.equal(result.records[0].monthlyM3[8],0);assert.equal(result.records[0].monthlyM3[7],252);
 assert.equal(source.records[0].monthlyM3[8],12);assert.throws(()=>merge(source,[],target));assert.throws(()=>merge(source,[{...r,month:8}],target));
});
