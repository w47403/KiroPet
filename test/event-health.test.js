'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {eventProgress,isManagedHook,inspectHooks}=require('../src/event-health');
test('missing AgentStop never becomes a fabricated completion',()=>{
 const state={state:'tool',detail:'remote_web_search',at:1000,startedAt:500,eventCount:3};
 const out=eventProgress(state,182000);
 assert.equal(out.stale,true);
 assert.equal(out.active,true);
 assert.match(out.label,/尚未确认/);
 assert.equal(eventProgress({...state,state:'done'},182000).active,false);
});
test('inspect hook config without touching unrelated project hooks',()=>{
 const owned={version:'v1',hooks:[{name:'Whale Pet - 回答完成',trigger:'AgentStop',action:{type:'command',command:'powershell.exe -File HookSignal.ps1 -State done -Phase finish'}}]};
 assert.equal(isManagedHook(owned),true);
 assert.equal(inspectHooks(['one','two','three'],folder=>folder==='one'?owned:folder==='two'?{version:'v1',hooks:[{name:'Unrelated',trigger:'AgentStop',action:{type:'command',command:'echo hello'}}]}:null).map(x=>x.status).join(','),'ok,custom,missing');
 assert.equal(inspectHooks(['old'],()=>({...owned,hooks:[{...owned.hooks[0],trigger:'PreToolUse'}]}))[0].status,'no-stop');
});
