// Optional browser integration check: NODE_PATH must include Playwright.
'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'output/animation-validation');
fs.mkdirSync(output,{recursive:true});
const code=fs.readFileSync(path.join(root,'src/extension.js'),'utf8');
const context={module:{exports:{}},require:name=>name==='vscode'?{Uri:{file:file=>file}}:name.startsWith('./')?require(path.join(root,'src',name)):require(name)};
vm.runInNewContext(code+'\nextContext={extensionPath:'+JSON.stringify(root)+'};module.exports.render=htmlFor;',context);
let html;
const server=http.createServer((req,res)=>{
  if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(html);}
  const filename=path.resolve(root,'.'+decodeURIComponent(req.url));
  if(!filename.startsWith(root+path.sep)){res.statusCode=403;return res.end();}
  fs.readFile(filename,(err,bytes)=>{if(err){res.statusCode=404;return res.end();}res.setHeader('Content-Type',filename.endsWith('.png')?'image/png':'application/javascript');res.end(bytes);});
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    const origin='http://127.0.0.1:'+server.address().port;
    html=context.module.exports.render({cspSource:origin,asWebviewUri:file=>origin+'/'+path.relative(root,file).split(path.sep).map(encodeURIComponent).join('/')});
    browser=await chromium.launch({headless:true,...(process.env.KIRO_TEST_BROWSER?{executablePath:process.env.KIRO_TEST_BROWSER}:{})});
    const page=await browser.newPage({viewport:{width:960,height:800}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{window.acquireVsCodeApi=()=>({postMessage(){}});});
    await page.goto(origin);
    await page.waitForFunction(()=>assetsReady);
    const assets=await page.evaluate(()=>({total:loaded.size,ready:[...loaded.values()].filter(e=>e.ready).length}));
    assert.equal(assets.total,assets.ready);
    await page.evaluate(()=>{window.testNow=0;player.now=()=>window.testNow;player.setState('working',true);animate();});
    await page.evaluate(()=>{window.testNow=3000;animate();});
    await page.screenshot({path:path.join(output,'working-panel.png')});
    const before=await page.evaluate(()=>player.sample().path);
    await page.evaluate(()=>{player.react();animate();});
    assert.equal(await page.evaluate(()=>player.sample().name),'work_pet');
    await page.evaluate(()=>{window.testNow+=manifest.clips.work_pet.durations.reduce((a,b)=>a+b,0);animate();});
    assert.equal(await page.evaluate(()=>player.sample().path),before);
    await page.evaluate(()=>{player.react();window.testNow+=600;player.setState('working');animate();});
    assert.equal(await page.evaluate(()=>player.sample().path),before,'an event during a pat must preserve the background pose');
    await page.evaluate(()=>{player.setState('editing');animate();});
    const editingPhase=await page.evaluate(()=>(window.testNow-player.loopStarted)/manifest.clips.editing.durations.reduce((a,b)=>a+b,0));
    await page.evaluate(()=>{player.setState('tool');window.testNow+=700;player.setState('working');animate();});
    assert.ok(Math.abs(await page.evaluate(()=>(window.testNow-player.loopStarted)/manifest.clips.working.durations.reduce((a,b)=>a+b,0))-editingPhase)<1e-9);
    await page.evaluate(()=>{player.setState('idle');window.testNow+=22000;player.random=()=>0;animate();});
    await page.evaluate(()=>{window.testNow+=2000;animate();});
    await page.screenshot({path:path.join(output,'sitting-panel.png')});
    await page.evaluate(()=>{player.beginDrag();window.testNow+=160;animate();});
    assert.equal(await page.evaluate(()=>player.sample().name),'drag');
    await page.evaluate(()=>{player.endDrag();animate();});
    assert.equal(await page.evaluate(()=>player.sample().name),'land');
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.evaluate(()=>player.sample(true).index),0);
    assert.equal(await page.evaluate(()=>{
      const activity={state:'done',at:1234,phase:'finish',reply:'answer',replyUntil:Date.now()+8000};
      window.dispatchEvent(new MessageEvent('message',{data:{type:'activity',activity}}));
      const started=player.started;
      window.testNow+=500;
      window.dispatchEvent(new MessageEvent('message',{data:{type:'activity',activity:{...activity,reply:'',replyUntil:0}}}));
      return player.started===started;
    }),true,'preview changes must not replay completion');
    assert.deepEqual(errors,[]);
    const preview=path.resolve(root,'../output/animation-review-v090.html');
    if(fs.existsSync(preview)){
      await page.goto(require('node:url').pathToFileURL(preview).href);
      await page.locator('#pause').click();
      await page.locator('#task').click();
      await page.locator('#seek').evaluate(el=>{el.value=8000;el.dispatchEvent(new Event('input'));});
      assert.match(await page.locator('#newmeta').textContent(),/调用工具/);
      await page.screenshot({path:path.join(output,'review-page.png'),fullPage:true});
      assert.deepEqual(errors,[]);
    }
    console.log(JSON.stringify({assets,errors,checks:['real image loading','work reaction resume','idle scene','drag landing','reduced motion'],output}));
  }finally{if(browser)await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
