const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {saveSession,restoreSession}=require('../automation/windows-pumping/browser-session.cjs');
test('retain WRA application-path cookies, exclude unrelated domains and expired cookies',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'wra-session-test-'));
  const config={stateDirectory:directory};
  const cookies=[{name:'session',value:'fixture-only',domain:'wr.wra.gov.tw',path:'/WRTInfoFrontEnd',expires:-1},
    {name:'expired',value:'fixture-only',domain:'wr.wra.gov.tw',path:'/',expires:1},
    {name:'other',value:'fixture-only',domain:'www.cp.gov.tw',path:'/',expires:-1}];
  try {
    await saveSession({cookies:async(...args)=>{assert.equal(args.length,0);return cookies;}},config);
    let restored;
    await restoreSession({addCookies:async c=>restored=c},config);
    assert.deepEqual(restored,[cookies[0]]);
  } finally {fs.unlinkSync(path.join(directory,'wra-session-private.json'));fs.rmdirSync(directory);}
});
