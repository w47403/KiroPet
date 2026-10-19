'use strict';

// Shared timeline: a frame is an independently drawn pose, never a transformed still.
(function (root) {
  function frameAt(clip, elapsed) {
    const durations = clip.durations;
    const total = durations.reduce((sum, value) => sum + value, 0);
    let remaining = Math.max(0, elapsed);
    if (clip.loop) remaining %= total;
    else if (remaining >= total) return durations.length - 1;
    for (let i = 0; i < durations.length; i++) {
      if (remaining < durations[i]) return i;
      remaining -= durations[i];
    }
    return durations.length - 1;
  }
  function frameDelay(clip, elapsed) {
    const total = clip.durations.reduce((a, b) => a + b, 0);
    let remaining = Math.max(0, elapsed);
    if (clip.loop) remaining %= total;
    else if (remaining >= total) return 250;
    for (const duration of clip.durations) {
      if (remaining < duration) return Math.max(16, Math.min(250, duration - remaining));
      remaining -= duration;
    }
    return 250;
  }
  class AnimationPlayer {
    constructor(manifest, now = () => performance.now(), random = Math.random) {
      this.manifest = manifest;
      this.now = now;
      this.state = 'idle';
      this.started = now();
      this.reaction = null;
      this.pausedAt = null;
      this.suspensions = new Set();
      this.dragStarted = null;
      this.random = random;
      this.idleName = 'idle';
      this.idleStart = null;
      this.idleNext = this.started + (manifest.idleBehavior?.initialHoldMs ?? 22000);
      this.taskStarted = null;
      this.loopStarted = this.started;
      this.workAccent = null;
      this.workNext = Infinity;
    }
    setState(state, restart = false) {
      const next = this.manifest.clips[state] ? state : 'idle';
      if (next === this.state && !restart) { this.reaction = null; return; }
      const active = name => ['working','tool','editing'].includes(name);
      const time = this.pausedAt === null ? this.now() : this.pausedAt;
      this.loopStarted = time;
      if (active(next) && (!active(this.state) || restart)) {
        this.taskStarted = time;
        const intro = this.manifest.clips.work_start;
        this.workNext = time + (intro ? intro.durations.reduce((a,b)=>a+b,0) : 0) + 18000;
        this.workAccent = null;
      } else if (!active(next)) {
        this.taskStarted = null;
        this.workAccent = null;
      }
      this.state = next;
      this.started = this.pausedAt === null ? this.now() : this.pausedAt;
      // New work always takes precedence over an interaction reaction.
      this.reaction = null;
      this.idleName = 'idle';
      this.idleStart = null;
      this.idleNext = this.started + (this.manifest.idleBehavior?.initialHoldMs ?? 22000);
    }
    react(name = 'hug') {
      if (this.reaction || this.dragStarted !== null) return;
      if (name === 'hug') {
        const pose = this.sample().path.split('/').slice(-2,-1)[0];
        if (['work_start','done','sit_down','lie_down','rice_scoop','rice_hug','rice_full'].includes(pose)) return;
        name = this.manifest.reactions?.[this.state] || this.manifest.reactions?.[pose] || name;
      }
      if (this.manifest.clips[name]) this.reaction = {name, started: this.pausedAt === null ? this.now() : this.pausedAt};
    }
    beginDrag() {
      if (this.dragStarted !== null) return;
      if (this.reaction) {
        const duration = this.manifest.clips[this.reaction.name].durations.reduce((a,b)=>a+b,0);
        this.shiftTimeline(Math.min(duration,(this.pausedAt ?? this.now())-this.reaction.started));
        this.reaction = null;
      }
      this.dragStarted = this.now();
      this.pause('drag');
    }
    endDrag() {
      if (this.dragStarted === null) return;
      this.dragStarted = null;
      this.resume('drag');
      if (this.state === 'idle' && this.manifest.clips.land) {
        this.idleName = 'idle'; this.idleStart = null;
        this.idleNext = (this.pausedAt ?? this.now()) + (this.manifest.idleBehavior?.initialHoldMs ?? 22000);
        this.reaction = null;
        this.react('land');
      }
    }
    pause(reason = 'hidden') {
      this.suspensions.add(reason);
      if (this.pausedAt === null) this.pausedAt = this.now();
    }
    resume(reason = 'hidden') {
      this.suspensions.delete(reason);
      if (this.suspensions.size) return;
      if (this.pausedAt === null) return;
      const shift = this.now() - this.pausedAt;
      this.shiftTimeline(shift);
      if (this.reaction) this.reaction.started += shift;
      this.pausedAt = null;
    }
    shiftTimeline(shift) {
      this.started += shift;
      this.loopStarted += shift;
      this.idleNext += shift;
      if (this.idleStart !== null) this.idleStart += shift;
      if (this.taskStarted !== null) this.taskStarted += shift;
      this.workNext += shift;
      if (this.workAccent) this.workAccent.started += shift;
    }
    sample(reducedMotion = false) {
      this.nextDelay = 250;
      const timedFrame = (clip, elapsed) => {
        this.nextDelay = frameDelay(clip, elapsed);
        return frameAt(clip, elapsed);
      };
      if (this.dragStarted !== null && this.manifest.clips.drag) {
        const clip = this.manifest.clips.drag;
        const index = reducedMotion ? 0 : timedFrame(clip, this.now() - this.dragStarted);
        return {name: 'drag', index, path: clip.frames[index]};
      }
      const time = this.pausedAt === null ? this.now() : this.pausedAt;
      if (this.reaction) {
        const clip = this.manifest.clips[this.reaction.name];
        const duration = clip.durations.reduce((sum, value) => sum + value, 0);
        if (time - this.reaction.started >= duration) {
          this.shiftTimeline(duration);
          this.reaction = null;
        }
      }
      if (this.taskStarted !== null && !this.reaction) {
        const intro = this.manifest.clips.work_start;
        const total = intro ? intro.durations.reduce((a,b)=>a+b,0) : 0;
        if (intro && time-this.taskStarted < total) {
          const index = reducedMotion ? intro.frames.length - 1 : timedFrame(intro,time-this.taskStarted);
          return {name:'work_start',index,path:intro.frames[index]};
        }
        if (this.workAccent && time-this.workAccent.started >=
            this.manifest.clips[this.workAccent.name].durations.reduce((a,b)=>a+b,0)) this.workAccent = null;
        if (!reducedMotion && this.state !== 'tool' && !this.workAccent &&
            time >= this.workNext && this.manifest.clips.work_pause) {
          this.workAccent = {name:'work_pause',started:time};
          this.workNext = time + this.manifest.clips.work_pause.durations.reduce((a,b)=>a+b,0) + 18000 + this.random()*17000;
        }
        const name = this.state === 'tool' ? 'tool' :
          this.workAccent ? this.workAccent.name : this.state;
        const clip = this.manifest.clips[name];
        const index = reducedMotion ? 0 : timedFrame(this.workAccent && this.state !== 'tool' ? {...clip,loop:false} : clip,
          time-(this.workAccent && this.state !== 'tool' ? this.workAccent.started : Math.max(this.loopStarted,this.taskStarted+total)));
        if (!reducedMotion && this.state !== 'tool' && !this.workAccent)
          this.nextDelay = Math.max(16, Math.min(this.nextDelay, this.workNext - time));
        return {name,index,path:clip.frames[index]};
      }
      if (this.state === 'idle' && !this.reaction && !reducedMotion && time >= this.idleNext) {
        const candidates = (this.manifest.idleBehavior?.clips || ['idle'])
          .filter(name => this.manifest.clips[name] && name !== this.idleName);
        const weighted = candidates.flatMap(name => Array(this.manifest.idleBehavior?.weights?.[name] || 1).fill(name));
        this.idleName = weighted[Math.floor(this.random() * weighted.length)] || 'idle';
        this.idleStart = time;
        const duration = this.manifest.clips[this.idleName].durations.reduce((a,b) => a+b, 0);
        const min = this.manifest.idleBehavior?.restMinMs ?? 18000;
        const max = this.manifest.idleBehavior?.restMaxMs ?? 45000;
        this.idleNext = time + duration + min + this.random() * (max-min);
      }
      const name = this.reaction ? this.reaction.name : this.state === 'idle' ? this.idleName : this.state;
      const clip = this.manifest.clips[name];
      const start = this.reaction ? this.reaction.started : this.started;
      const index = reducedMotion || (this.state === 'idle' && !this.reaction && this.idleStart === null) ? 0 :
        timedFrame(this.state === 'idle' && !this.reaction ? {...clip, loop: false} : clip,
          time - (this.state === 'idle' && !this.reaction ? this.idleStart : start));
      if (this.state === 'idle' && !this.reaction && !reducedMotion)
        this.nextDelay = Math.max(16, Math.min(this.nextDelay, this.idleNext - time));
      return {name, index, path: clip.frames[index]};
    }
  }
  const api = {frameAt, frameDelay, AnimationPlayer};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WhaleAnimation = api;
})(typeof window !== 'undefined' ? window : globalThis);
