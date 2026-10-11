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
    constructor(manifest, now = () => performance.now()) {
      this.manifest = manifest;
      this.now = now;
      this.state = 'idle';
      this.started = now();
      this.reaction = null;
      this.pausedAt = null;
    }
    setState(state, restart = false) {
      const next = this.manifest.clips[state] ? state : 'idle';
      if (next === this.state && !restart) return;
      this.state = next;
      this.started = this.pausedAt === null ? this.now() : this.pausedAt;
      // New work always takes precedence over an interaction reaction.
      this.reaction = null;
    }
    react(name = 'hug') {
      if (this.manifest.clips[name]) this.reaction = {name, started: this.pausedAt === null ? this.now() : this.pausedAt};
    }
    pause() { if (this.pausedAt === null) this.pausedAt = this.now(); }
    resume() {
      if (this.pausedAt === null) return;
      const shift = this.now() - this.pausedAt;
      this.started += shift;
      if (this.reaction) this.reaction.started += shift;
      this.pausedAt = null;
    }
    sample(reducedMotion = false) {
      const time = this.pausedAt === null ? this.now() : this.pausedAt;
      if (this.reaction) {
        const clip = this.manifest.clips[this.reaction.name];
        const duration = clip.durations.reduce((sum, value) => sum + value, 0);
        if (time - this.reaction.started >= duration) this.reaction = null;
      }
      const name = this.reaction ? this.reaction.name : this.state;
      const clip = this.manifest.clips[name];
      const start = this.reaction ? this.reaction.started : this.started;
      const index = reducedMotion ? 0 : frameAt(clip, time - start);
      return {name, index, path: clip.frames[index]};
    }
  }
  const api = {frameAt, AnimationPlayer};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WhaleAnimation = api;
})(typeof window !== 'undefined' ? window : globalThis);
