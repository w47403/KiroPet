'use strict';

// Presentation is independent of task truth: a delayed animation never delays completion.
const INTENTS = {
  idle: {label:'待机', priority:0, clip:'breathing'},
  sleep: {label:'睡眠', priority:0, clip:'quick_nap'},
  working: {label:'处理请求', priority:2, clip:'eating_tokens'},
  thinking: {label:'思考', priority:3, clip:'deep_thought'},
  researching: {label:'搜索资料', priority:4, clip:'taking_notes'},
  reading: {label:'阅读文件', priority:5, clip:'taking_notes'},
  coding: {label:'编写代码', priority:6, clip:'coding'},
  editing: {label:'修改文件', priority:6, clip:'taking_notes'},
  listening: {label:'收到请求', priority:7, clip:'attentive_listening'},
  waiting: {label:'等待确认', priority:8, clip:'looking_around'},
  error: {label:'发生错误', priority:9, clip:'jump_scare'},
  done: {label:'任务完成', priority:1, clip:'happy_hop'},
};
const MODES = {
  quiet: {label:'安静', initialHoldMs:45000, restMinMs:45000, restMaxMs:90000},
  balanced: {label:'均衡', initialHoldMs:22000, restMinMs:22000, restMaxMs:45000},
  lively: {label:'活泼', initialHoldMs:8000, restMinMs:8000, restMaxMs:18000},
};
function intentOf(activity) {
  return INTENTS[activity.intent] ? activity.intent :
    ({tool:'thinking', editing:'editing', working:'working', done:'done', sleep:'sleep'}[activity.state] || 'idle');
}
function priority(activity) { return INTENTS[intentOf(activity)].priority; }

class BehaviorPolicy {
  constructor(manifest, {now=Date.now, random=Math.random}={}) {
    this.manifest=manifest; this.now=now; this.random=random;
    this.current='idle'; this.seq=0; this.clip=null; this.pending=null;
    this.entered=now(); this.task=''; this.lastChoices={}; this.configure({});
  }
  configure(options) {
    this.mode=MODES[options.mode] ? options.mode : 'balanced';
    this.excluded=new Set(Array.isArray(options.excluded) ? options.excluded : []);
    this.pools={};
    for (const key of Object.keys(INTENTS)) {
      const supplied=options.pools?.[key];
      const fallback=key==='idle' ? this.manifest.idleBehavior.clips : [INTENTS[key].clip];
      // An empty/invalid pool safely falls back, then respects global exclusions.
      const valid=Array.isArray(supplied) ? supplied.filter(n=>this.manifest.catalog.some(a=>a.id===n)) : [];
      this.pools[key]=[...new Set(valid.length ? valid : fallback)].filter(n=>this.manifest.clips[n] && !this.excluded.has(n) && !this.excluded.has(this.manifest.clips[n].sourceId));
    }
    this.configKey=JSON.stringify([this.mode,this.pools]);
    if (this.clip && !this.pools[this.current].includes(this.clip)) this.choose();
  }
  choose() {
    const pool=this.pools[this.current].filter(n=>n!==this.lastChoices[this.current]);
    const choices=pool.length ? pool : this.pools[this.current];
    // Breathing is the safe resting fallback when every candidate is excluded.
    this.clip=this.current==='idle' ? null : choices[Math.floor(this.random()*choices.length)] || 'breathing';
    if(this.clip)this.lastChoices[this.current]=this.clip;
    this.seq++;
  }
  submit(activity) {
    this.latest=activity;
    const next=intentOf(activity), now=this.now();
    const task=JSON.stringify([activity.session||'',activity.startedAt||0]);
    const newTask=task!==this.task && activity.phase==='start';
    const completion=next==='done' && this.completion!==`${activity.session}|${activity.at}`;
    if (completion) this.completion=`${activity.session}|${activity.at}`;
    if (next===this.current && !newTask && !completion) { this.pending=null; return; }
    // Explicit termination/new task cannot leave an old waiting/error animation scheduled.
    const immediate=activity.phase==='finish' || completion || newTask || activity.event==='Manual';
    if (immediate) { this.task=task; this.commit(next); return; }
    if (this.pending?.intent===next) return; // Continuous chunks must not starve the timer.
    const delay=INTENTS[next].priority>INTENTS[this.current].priority ? 500 : 1500;
    const due=Math.max(now+delay, this.current==='error' ? this.entered+3000 : 0);
    this.pending={intent:next,due};
  }
  commit(intent) { this.current=intent; this.entered=this.now(); this.pending=null; this.choose(); }
  sample() {
    if (this.pending && this.now()>=this.pending.due) this.commit(this.pending.intent);
    if (this.current==='error' && !this.pending && this.now()>=this.entered+3000) {
      this.commit(['working','tool','editing'].includes(this.latest?.state) ? 'working' : 'idle');
    }
    const mode=MODES[this.mode];
    return {intent:this.current,label:INTENTS[this.current].label,clip:this.clip,seq:this.seq,
      loop:!['done','error'].includes(this.current),
      behavior:{mode:this.mode,initialHoldMs:mode.initialHoldMs,restMinMs:mode.restMinMs,restMaxMs:mode.restMaxMs,
        clips:this.pools.idle,weights:{}},configKey:this.configKey};
  }
}
module.exports={BehaviorPolicy,INTENTS,MODES,intentOf,priority};
