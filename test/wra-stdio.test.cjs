const {test}=require('node:test');const assert=require('node:assert/strict');
const {createHandler,requestArgs}=require('../automation/windows-pumping/mcp.cjs');
test('MCP lifecycle, discovery and one read-only call',async()=>{
 let received;const h=createHandler(async q=>{received=q;return {...q,m3:0};},()=>new Date('2026-10-02T00:00:00Z'));
 const call=(id,method,params)=>h({jsonrpc:'2.0',id,method,params});
 assert.ok((await call(0,'tools/list')).error);
 assert.equal((await call(1,'initialize')).result.serverInfo.name,'wra-browser-readonly');
 await h({jsonrpc:'2.0',method:'notifications/initialized'});
 const tools=(await call(2,'tools/list')).result.tools;assert.equal(tools.length,1);assert.equal(tools[0].annotations.readOnlyHint,true);
 const result=await call(3,'tools/call',{name:'wra_query_latest_month',arguments:{waterRightNo:'K1140087'}});
 assert.deepEqual(received,{waterRightNo:'K1140087',yearMinguo:115,month:9});assert.equal(JSON.parse(result.result.content[0].text).m3,0);
 assert.ok((await call(4,'tools/call',{name:'upload',arguments:{}})).error);
});
test('invalid arguments and January rollover',()=>{
 assert.equal(requestArgs({waterRightNo:'K1140087'},new Date('2027-01-01')).month,12);
 assert.throws(()=>requestArgs({waterRightNo:'../bad'}));
 assert.throws(()=>requestArgs({waterRightNo:'K1140087',month:1}));
});
test('login failure is an error, never a blank pumping result',async()=>{
 const h=createHandler(async()=>{throw Error('LOGIN_REQUIRED');});
 await h({jsonrpc:'2.0',id:1,method:'initialize'});await h({jsonrpc:'2.0',method:'notifications/initialized'});
 const r=await h({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'wra_query_latest_month',arguments:{waterRightNo:'K1140087'}}});
 assert.equal(r.result.isError,true);assert.equal(JSON.parse(r.result.content[0].text).code,'LOGIN_REQUIRED');
});
