// The navigator's planisphere — DOM/canvas layer over the pure projection in
// navigation.js. Zenith at centre, horizon at the rim, north up, east LEFT
// (the way every printed star chart is held overhead). Drawn live from the
// same celestial frame the 3D sky renders.

import {
  chartStars, chartBackground, CONSTELLATION_LINES, POINTER_LINES,
} from './navigation.js';

const RIM = '#8a793f', INK = '#d8e6f2', FAINT = 'rgba(216,230,242,0.35)';
const LABELLED = new Set(['Polaris', 'Sirius', 'Betelgeuse', 'Rigel',
  'Dubhe', 'Alkaid', 'Schedar', 'Acrux', 'Alpha Cen']);

export class StarChartUI {
  constructor() {
    this.wrap = document.getElementById('starchart');
    this.canvas = this.wrap.querySelector('canvas');
    this.cap = this.wrap.querySelector('.cap');
    this.open = false;
  }

  toggle() {
    this.open = !this.open;
    this.wrap.style.display = this.open ? 'flex' : 'none';
  }

  setCaption(text) { this.cap.textContent = text; }

  // t: sky seconds, latDeg: ship latitude; alpha: how visible the stars are
  // (day washes the chart out just as it washes out the sky)
  update(t, latDeg, alpha) {
    const ctx = this.canvas.getContext('2d');
    const S = this.canvas.width, c = S / 2, R = S * 0.46;
    const px = (p) => ({ x: c + p.x * R, y: c - p.y * R });

    ctx.fillStyle = '#070c16';
    ctx.fillRect(0, 0, S, S);

    // horizon ring + compass points (east LEFT: it's a sky chart)
    ctx.strokeStyle = RIM; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = RIM; ctx.font = `${S * 0.03}px Georgia`; ctx.textAlign = 'center';
    ctx.fillText('N', c, c - R - S * 0.012);
    ctx.fillText('S', c, c + R + S * 0.032);
    ctx.fillText('E', c - R - S * 0.02, c + S * 0.01);
    ctx.fillText('W', c + R + S * 0.02, c + S * 0.01);

    ctx.save();
    ctx.beginPath(); ctx.arc(c, c, R, 0, Math.PI * 2); ctx.clip();
    ctx.globalAlpha = Math.max(0.08, alpha);

    // the faint field
    for (const s of chartBackground(t, latDeg)) {
      const p = px(s);
      ctx.fillStyle = FAINT;
      const r = Math.max(0.4, (6 - s.mag) * 0.22);
      ctx.fillRect(p.x - r / 2, p.y - r / 2, r, r);
    }

    // the catalogue, with figures
    const stars = chartStars(t, latDeg);
    const byName = new Map(stars.map((s) => [s.name, s]));

    ctx.strokeStyle = 'rgba(138,121,63,0.7)'; ctx.lineWidth = 1;
    for (const [a, b] of CONSTELLATION_LINES) {
      const pa = byName.get(a), pb = byName.get(b);
      if (!pa || !pb) continue;
      const A = px(pa), B = px(pb);
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    }

    // the finding trick, dotted: follow the pointers to the pole
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = 'rgba(216,230,242,0.4)';
    for (const [a, b, target] of POINTER_LINES) {
      const pa = byName.get(a), pb = byName.get(b);
      if (!pa || !pb) continue;
      const end = target && byName.get(target);
      const A = px(pa), B = px(pb);
      let E;
      if (end) E = px(end);
      else { // extend the line ~4x past b, the Cross's trick
        E = { x: B.x + (B.x - A.x) * 4, y: B.y + (B.y - A.y) * 4 };
      }
      ctx.beginPath(); ctx.moveTo(B.x, B.y); ctx.lineTo(E.x, E.y); ctx.stroke();
    }
    ctx.setLineDash([]);

    for (const s of stars) {
      const p = px(s);
      const r = Math.max(1.2, (3.4 - s.mag) * 1.15);
      ctx.fillStyle = `rgb(${215 + 40 * s.warmth}, ${215 - 20 * s.warmth}, ${240 - 90 * s.warmth})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      if (LABELLED.has(s.name)) {
        ctx.fillStyle = INK; ctx.font = `${S * 0.022}px Georgia`; ctx.textAlign = 'left';
        ctx.fillText(s.name, p.x + r + 3, p.y + 3);
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
