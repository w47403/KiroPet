'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const manifest=require('../assets/animations/manifest.json');
const {BehaviorPolicy,MODES}=require('../src/behavior-policy');
const {AnimationPlayer}=require('../src/animation-player');
const {parseEvent,SessionMonitor}=require('../src/session-monitor');
function fixture(){let time=0;const policy=new BehaviorPolicy(manifest,{now:()=>time,random:()=>0});return {policy,at:n=>time=n};}
const activity=(intent,extra={})=>({state:'tool',intent,at:1,...extra});
test('priority upgrades debounce, downgrades linger, repeated chunks do not starve transitions',()=>{
 const {policy:p,at}=fixture();p.submit(activity('reading'));at(499);assert.equal(p.sample().intent,'idle');
 p.submit(activity('reading',{at:2}));at(500);assert.equal(p.sample().intent,'reading');
 const seq=p.sample().seq;p.submit(activity('reading',{at:3}));assert.equal(p.sample().seq,seq);
 p.submit(activity('working'));at(1999);assert.equal(p.sample().intent,'reading');at(2000);assert.equal(p.sample().intent,'working');
 p.submit(activity('waiting'));at(2500);assert.equal(p.sample().intent,'waiting');
 p.submit(activity('reading'));at(2800);p.submit(activity('waiting'));at(5000);assert.equal(p.sample().intent,'waiting');
});
test('completion cancels queued work, new requests escape error hold and completion can replay',()=>{
 const {policy:p,at}=fixture();p.submit(activity('error'));at(500);assert.equal(p.sample().intent,'error');
 p.submit(activity('working'));at(2500);assert.equal(p.sample().intent,'error');at(3500);assert.equal(p.sample().intent,'working');
 p.submit(activity('reading'));p.submit(activity('done',{state:'done',phase:'finish',at:3}));const first=p.sample().seq;
 at(10000);assert.equal(p.sample().intent,'done');p.submit(activity('done',{state:'done',phase:'finish',at:4}));assert.equal(p.sample().seq,first+1);
 p.submit(activity('error',{phase:'finish',state:'idle'}));p.submit(activity('listening',{phase:'start',state:'working',startedAt:101}));assert.equal(p.sample().intent,'listening');
});
test('standalone errors expire without inventing completion',()=>{
 const {policy:p,at}=fixture();p.submit(activity('error',{phase:'finish',state:'idle'}));at(3000);assert.equal(p.sample().intent,'idle');
 p.submit(activity('error'));at(3500);assert.equal(p.sample().intent,'error');at(6500);assert.equal(p.sample().intent,'working');
});
test('modes, pools, exclusions, nonrepeat selection and empty fallback are safe',()=>{
 const {policy:p}=fixture();
 for(const mode of Object.keys(MODES)){p.configure({mode});assert.equal(p.sample().behavior.restMinMs,MODES[mode].restMinMs);}
 p.configure({pools:{reading:['coding','taking_notes','missing','coding']}});
 p.submit(activity('reading',{event:'Manual'}));assert.equal(p.sample().clip,'coding');
 p.submit(activity('idle',{event:'Manual'}));p.submit(activity('reading',{event:'Manual'}));assert.equal(p.sample().clip,'taking_notes');
 p.configure({pools:{reading:['coding']},excluded:['coding']});assert.equal(p.sample().clip,'breathing');
 p.configure({pools:{reading:[]}});assert.equal(p.sample().clip,'taking_notes');
 p.configure({excluded:manifest.catalog.map(a=>a.id)});assert.deepEqual(p.sample().behavior.clips,[]);assert.equal(p.sample().clip,'breathing');
});
test('classifies only observed event metadata, without collecting tool arguments',()=>{
 const parse=(type,extra={})=>parseEvent({id:'a',timestamp:new Date(1).toISOString(),payload:{type,...extra}});
 for(const [tool,intent] of [['read_file','reading'],['grep','reading'],['web_search','researching'],['web_fetch','researching'],['bash','coding'],['str_replace','editing'],['unknown','thinking']]){
  const value=parse('tool_call',{toolName:tool,args:{secret:'private'}});assert.equal(value.intent,intent);assert.doesNotMatch(JSON.stringify(value),/private/);
 }
 assert.equal(parse('pending_interaction').intent,'waiting');assert.equal(parse('tool_result',{success:false}).intent,'error');
 assert.equal(parse('tool_call',{toolName:'read',status:'failed'}).intent,'error');assert.equal(parse('user').intent,'listening');
 assert.equal(parse('assistant',{operationType:'Reasoning',content:'private'}),null);
});
test('waiting across sessions outranks newer coding, completion cannot hide unfinished sessions',()=>{
 let result;const monitor=new SessionMonitor({onActivity:a=>result=a});
 monitor.sessions.set('wait',activity('waiting',{at:1}));monitor.sessions.set('code',activity('coding',{at:5}));monitor.publish();assert.equal(result.intent,'waiting');
 monitor.sessions.set('wait',activity('done',{state:'done',at:6}));monitor.publish();assert.equal(result.intent,'coding');assert.equal(result.activeSessions,1);
});
test('browser presentation preserves phase across same-state updates and pauses for interactions',()=>{
 let time=0;const p=new AnimationPlayer(structuredClone(manifest),()=>time,()=>0);
 const visual={intent:'reading',clip:'taking_notes',seq:1,loop:true,configKey:'a',behavior:manifest.idleBehavior};
 p.setState('tool');p.setPresentation(visual);time=1500;const before=p.sample();assert.equal(before.name,'taking_notes');
 p.setPresentation({...visual});assert.deepEqual(p.sample(),before);
 p.beginDrag();time+=2000;assert.equal(p.sample().name,'drag');p.endDrag();assert.deepEqual(p.sample(),before);
 p.react('cheerful_wave');assert.equal(p.sample().name,'cheerful_wave');time+=manifest.clips.cheerful_wave.durations.reduce((a,b)=>a+b,0);assert.deepEqual(p.sample(),before);
 p.setPresentation({...visual,seq:2,clip:'jump_scare',intent:'error',loop:false});assert.equal(p.sample().index,0);
 p.pause();time+=1000;p.resume();assert.equal(p.sample().index,0);
});
