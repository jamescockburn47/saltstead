// The ship's log page — a DOM panel over the pure book in shiplog.js.
// Latest entry at the bottom, the way a log is actually kept.

import { logLine } from './shiplog.js';

export class LogUI {
  constructor() {
    this.wrap = document.getElementById('shiplog');
    this.body = this.wrap.querySelector('.pages');
    this.open = false;
  }

  toggle(log) {
    this.open = !this.open;
    this.wrap.style.display = this.open ? 'flex' : 'none';
    if (this.open) this.render(log);
  }

  render(log) {
    this.body.textContent = '';
    if (!log.length) {
      const d = document.createElement('div');
      d.className = 'entry quiet';
      d.textContent = 'The book is blank \u2014 the voyage will write it.';
      this.body.appendChild(d);
    }
    for (const e of log) {
      const d = document.createElement('div');
      d.className = 'entry';
      d.textContent = logLine(e);
      this.body.appendChild(d);
    }
    this.body.scrollTop = this.body.scrollHeight;
  }
}
