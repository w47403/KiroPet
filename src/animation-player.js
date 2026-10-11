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
      this.workAccent = null;
      this.workNext = Infinity;
    }
    setState(state, restart = false) {
      const next = this.manifest.clips[state] ? state : 'idle';
      if (next === this.state && !restart) return;
      const active = name => ['working','tool','editing'].includes(name);
      const time = this.pausedAt === null ? this.now() : this.pausedAt;
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
      if (this.manifest.clips[name]) this.reaction = {name, started: this.pausedAt === null ? this.now() : this.pausedAt};
    }
    beginDrag() {
      if (this.dragStarted !== null) return;
      this.dragStarted = this.now();
      this.pause('drag');
    }
    endDrag() {
      if (this.dragStarted === null) return;
      this.dragStarted = null;
      this.resume('drag');
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
      this.started += shift;
      this.idleNext += shift;
      if (this.idleStart !== null) this.idleStart += shift;
      if (this.taskStarted !== null) this.taskStarted += shift;
      this.workNext += shift;
      if (this.workAccent) this.workAccent.started += shift;
      if (this.reaction) this.reaction.started += shift;
      this.pausedAt = null;
    }
    sample(reducedMotion = false) {
      if (this.dragStarted !== null && this.manifest.clips.drag) {
        const clip = this.manifest.clips.drag;
        const index = reducedMotion ? 0 : frameAt(clip, this.now() - this.dragStarted);
        return {name: 'drag', index, path: clip.frames[index]};
      }
      const time = this.pausedAt === null ? this.now() : this.pausedAt;
      if (this.reaction) {
        const clip = this.manifest.clips[this.reaction.name];
        const duration = clip.durations.reduce((sum, value) => sum + value, 0);
        if (time - this.reaction.started >= duration) this.reaction = null;
      }
      if (this.taskStarted !== null && !this.reaction) {
        const intro = this.manifest.clips.work_start;
        const total = intro ? intro.durations.reduce((a,b)=>a+b,0) : 0;
        if (intro && time-this.taskStarted < total) {
          const index = reducedMotion ? 7 : frameAt(intro,time-this.taskStarted);
          return {name:'work_start',index,path:intro.frames[index]};
        }
        if (this.workAccent && time-this.workAccent.started >=
            this.manifest.clips[this.workAccent.name].durations.reduce((a,b)=>a+b,0)) this.workAccent = null;
        if (!reducedMotion && this.state !== 'tool' && !this.workAccent &&
            time >= this.workNext && this.manifest.clips.work_pause) {
          this.workAccent = {name:'work_pause',started:time};
          this.workNext = time + this.manifest.clips.work_pause.durations.reduce((a,b)=>a+b,0) + 18000 + this.random()*17000;
        }
        const name = this.state === 'tool' && this.manifest.clips.work_pause ? 'work_pause' :
          this.workAccent ? this.workAccent.name : this.state;
        const clip = this.manifest.clips[name];
        const index = reducedMotion ? 0 : frameAt(this.state === 'tool' && name === 'work_pause' ? {...clip,loop:true} :
          this.workAccent ? {...clip,loop:false} : clip,
          time-(this.workAccent && this.state !== 'tool' ? this.workAccent.started : this.taskStarted+total));
        return {name,index,path:clip.frames[index]};
      }
      if (this.state === 'idle' && !this.reaction && !reducedMotion && time >= this.idleNext) {
        const candidates = (this.manifest.idleBehavior?.clips || ['idle'])
          .filter(name => this.manifest.clips[name] && name !== this.idleName);
        this.idleName = candidates[Math.floor(this.random() * candidates.length)] || 'idle';
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
        frameAt(this.state === 'idle' && !this.reaction ? {...clip, loop: false} : clip,
          time - (this.state === 'idle' && !this.reaction ? this.idleStart : start));
      return {name, index, path: clip.frames[index]};
    }
  }
  const api = {frameAt, AnimationPlayer};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WhaleAnimation = api;
})(typeof window !== 'undefined' ? window : globalThis);
