/**
 * Sound hook layer. Every audible moment in the game calls `audio.play(key)`.
 * Keys resolve through sounds.json to files in public/audio. Placeholder files
 * are silent; replacing a file is the whole audio pipeline for now.
 */
export class AudioHooks {
  /** Keys played recently, newest last. Lets tests assert hooks fire. */
  recent: string[] = [];
  private pool = new Map<string, HTMLAudioElement[]>();
  private enabled = typeof window !== 'undefined' && typeof Audio !== 'undefined';
  volume = 0.6;

  constructor(private map: Record<string, string>, private base = './') {}

  play(key: string): void {
    this.recent.push(key);
    if (this.recent.length > 64) this.recent.shift();
    if (!this.enabled) return;
    const path = this.map[key];
    if (!path) return;
    let list = this.pool.get(key);
    if (!list) {
      list = [];
      this.pool.set(key, list);
    }
    let el = list.find((a) => a.paused || a.ended);
    if (!el) {
      if (list.length >= 6) return;
      el = new Audio(this.base + path);
      el.preload = 'auto';
      list.push(el);
    }
    el.volume = this.volume;
    el.currentTime = 0;
    el.play().catch(() => { /* autoplay policy before first click; fine */ });
  }
}
