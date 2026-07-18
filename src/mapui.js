// The chart table — DOM/canvas layer over the pure pixels in chart.js.
//
//   minimap    — small always-on local chart, top-right; rebuilt when the ship
//                sails far enough from the last centre
//   world map  — full-screen chart on M, built once from the land mask
//
// Ship is a heading arrow; legends are inked marks (X for havens' rivals too —
// every row of legends.js lands on both charts, that's the point of a chart).

import {
  globalChartPixels, localChartPixels, chartXY,
  beginFineWorld, stepFineWorld, finishFineWorld,
} from './chart.js';
import { LEGENDS } from './legends.js';
import { PORTS } from './ports.js';

// every mark a chart carries: the legends, then the world's honest dockyards
const MARKS = LEGENDS.concat(PORTS);

const INK = '#3a2c1c', BLOOD = '#8c2f22';
const LOCAL_SPAN = 9;      // degrees across the minimap window
const LOCAL_N = 96;        // chart resolution
const REBUILD_DEG = LOCAL_SPAN / 10; // recentre after drifting a tenth of the window
const MAX_ZOOM = 8;        // the world chart zooms to 8x (45 degrees across)

function blit(img) {
  const c = document.createElement('canvas');
  c.width = img.w; c.height = img.h;
  c.getContext('2d').putImageData(
    new ImageData(new Uint8ClampedArray(img.data.buffer), img.w, img.h), 0, 0);
  return c;
}

function drawShip(ctx, x, y, yaw, scale = 1, color = BLOOD) {
  ctx.save();
  ctx.translate(x, y);
  // world yaw 0 = +z = south on the chart; the chart's north is up
  ctx.rotate(Math.PI - yaw);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -6 * scale); ctx.lineTo(4 * scale, 5 * scale);
  ctx.lineTo(0, 2.5 * scale); ctx.lineTo(-4 * scale, 5 * scale);
  ctx.closePath();
  ctx.fill();
  // parchment halo so every sail pops off land wash and sea alike
  ctx.strokeStyle = 'rgba(240, 230, 205, 0.9)';
  ctx.lineWidth = Math.max(0.8, scale);
  ctx.stroke();
  ctx.restore();
}

// every sail wears her allegiance on the chart: the King's navy in blue,
// pirates in black, honest trade in ink, the dead in weathered grey
const SAIL_TINT = {
  navy: '#2c4a7a', raider: '#17171c', derelict: '#6a6f72',
  trader: INK, indiaman: INK,
};
// the chart's key, drawn on the world map — the player's own mark first
const KEY_ROWS = [
  [BLOOD, 'your ship'], ['#2c4a7a', 'the King’s navy'], ['#17171c', 'pirates'],
  [INK, 'honest trade'], ['#6a6f72', 'derelicts'],
];

function drawLegend(ctx, x, y, kind) {
  ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = 1.5;
  if (kind === 'haven') {                         // anchor dot
    ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
  } else if (kind === 'dockyard') {               // open ring: an honest port
    ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.stroke();
  } else {                                        // X marks the spot
    ctx.beginPath();
    ctx.moveTo(x - 3, y - 3); ctx.lineTo(x + 3, y + 3);
    ctx.moveTo(x + 3, y - 3); ctx.lineTo(x - 3, y + 3);
    ctx.stroke();
  }
}

export class MapUI {
  constructor() {
    this.mini = document.getElementById('minimap');
    this.miniCtx = this.mini.getContext('2d');
    this.worldWrap = document.getElementById('worldmap');
    this.worldCanvas = this.worldWrap.querySelector('canvas');
    this.worldOpen = false;

    // the world chart never changes: bake it once
    this.worldImg = globalChartPixels(720, 360);
    this.worldBase = blit(this.worldImg);
    // the FINE sheet (real coastline at 2880x1440) is baked a row a frame
    // while the chart is open — the mask sheet serves until the ink dries
    this.fineJob = null;
    this.fineBase = null;

    this.localView = null;   // { w, h, latC, lonC, spanDeg }
    this.localBase = null;

    addEventListener('keydown', (e) => {
      if (e.code === 'KeyM' && !e.repeat) this.toggleWorld();
      if (e.code === 'Escape' && this.worldOpen) this.toggleWorld();
    });
    // the phone's ways out: the ✕, or a tap on the backdrop outside the
    // sheet (M and Esc live on no touchscreen). The backdrop ignores the
    // first ~0.4 s — the tap that OPENS the chart also ghosts a click onto
    // the overlay that now covers the button, and would slam it shut.
    const closeBtn = document.getElementById('worldmapclose');
    if (closeBtn) closeBtn.addEventListener('click', () => { if (this.worldOpen) this.toggleWorld(); });
    this.worldWrap.addEventListener('click', (e) => {
      if (e.target === this.worldWrap && this.worldOpen
        && performance.now() - (this._openedAt || 0) > 400) this.toggleWorld();
    });

    // click the chart, set a course: the world chart is a plain
    // equirectangular sheet, so the inversion is the projection backwards.
    // main.js owns what a course MEANS (the helmsman); the chart only
    // reports where the captain's finger landed.
    this.course = null;   // { lat, lon } while a course is set
    this.routeLL = null;  // [{ lat, lon }, …] the LAID route (read only while course set)
    this.routeLeg = 0;    // the ACTIVE leg (main.js syncs it) — passed marks aren't drawn
    this.onCourse = null; // main.js hangs the handler here
    this.worldCanvas.addEventListener('click', (e) => {
      if (!this.onCourse || this._dragged) return;
      const p = this.toCanvasXY(e);
      const ll = this.worldLatLonAt(p.x, p.y);
      this.onCourse(ll.lat, ll.lon);
    });

    // ---- ZOOM AND PAN: scroll or pinch to zoom, drag to pan ----
    // The view is { zoom, centre }: zoom 1 is the whole sheet exactly as it
    // always was; zoomed, the projection is uniform pixels-per-degree
    // (chartXY's ppd form) so a click still inverts exactly. A drag or a
    // pinch marks _dragged, and the click handler above stands down.
    this.worldZoom = 1;
    this.worldC = { lat: 0, lon: 0 };
    this._wPtrs = new Map();
    this._dragged = false;
    const wc = this.worldCanvas;
    wc.addEventListener('wheel', (e) => {
      if (!this.worldOpen) return;
      e.preventDefault();
      const p = this.toCanvasXY(e);
      const before = this.worldLatLonAt(p.x, p.y);
      this.worldZoom = Math.max(1, Math.min(MAX_ZOOM, this.worldZoom * Math.exp(-e.deltaY * 0.0016)));
      this.holdUnder(p, before); // the water under the cursor stays put
    }, { passive: false });
    wc.addEventListener('pointerdown', (e) => {
      this._wPtrs.set(e.pointerId, this.toCanvasXY(e));
      if (this._wPtrs.size === 1) this._dragged = false;
      wc.setPointerCapture(e.pointerId);
    });
    wc.addEventListener('pointermove', (e) => {
      if (!this._wPtrs.has(e.pointerId)) return;
      const p = this.toCanvasXY(e);
      if (this._wPtrs.size === 1) {
        const prev = this._wPtrs.get(e.pointerId);
        const dx = p.x - prev.x, dy = p.y - prev.y;
        if (Math.hypot(dx, dy) > 4) this._dragged = true;
        if (this._dragged) {
          const ppd = (wc.width / 360) * this.worldZoom;
          this.worldC.lon -= dx / ppd;
          this.worldC.lat += dy / ppd;
          this.clampWorldC();
        }
        this._wPtrs.set(e.pointerId, p);
      } else if (this._wPtrs.size === 2) {
        // pinch: zoom about the midpoint, and pan as the midpoint moves
        const ids = [...this._wPtrs.keys()];
        const old = ids.map((id) => this._wPtrs.get(id));
        this._wPtrs.set(e.pointerId, p);
        const now = ids.map((id) => this._wPtrs.get(id));
        const dOld = Math.hypot(old[1].x - old[0].x, old[1].y - old[0].y);
        const dNew = Math.hypot(now[1].x - now[0].x, now[1].y - now[0].y);
        const midOld = { x: (old[0].x + old[1].x) / 2, y: (old[0].y + old[1].y) / 2 };
        const midNew = { x: (now[0].x + now[1].x) / 2, y: (now[0].y + now[1].y) / 2 };
        const before = this.worldLatLonAt(midOld.x, midOld.y);
        if (dOld > 0) this.worldZoom = Math.max(1, Math.min(MAX_ZOOM, this.worldZoom * (dNew / dOld)));
        this.holdUnder(midNew, before);
        this._dragged = true;
      }
    });
    const endPtr = (e) => { this._wPtrs.delete(e.pointerId); };
    wc.addEventListener('pointerup', endPtr);
    wc.addEventListener('pointercancel', endPtr);
  }

  // event -> canvas pixel space (the canvas is CSS-scaled)
  toCanvasXY(e) {
    const r = this.worldCanvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * this.worldCanvas.width,
      y: ((e.clientY - r.top) / r.height) * this.worldCanvas.height,
    };
  }

  // the zoomed world view (chartXY's ppd form); zoom 1 = the classic sheet
  worldView() {
    const W = this.worldCanvas.width, H = this.worldCanvas.height;
    return { w: W, h: H, ppd: (W / 360) * this.worldZoom, latC: this.worldC.lat, lonC: this.worldC.lon };
  }

  // canvas pixel -> { lat, lon } through the current view
  worldLatLonAt(px, py) {
    const v = this.worldView();
    return {
      lat: v.latC - (py - v.h / 2) / v.ppd,
      lon: ((v.lonC + (px - v.w / 2) / v.ppd + 540) % 360) - 180,
    };
  }

  // recentre so the given water stays under the given canvas point, then clamp
  holdUnder(p, ll) {
    const v = this.worldView();
    this.worldC.lon = ll.lon - (p.x - v.w / 2) / v.ppd;
    this.worldC.lat = ll.lat + (p.y - v.h / 2) / v.ppd;
    this.clampWorldC();
  }

  // the chart never scrolls past the poles; lon wraps (the world is a cylinder)
  clampWorldC() {
    const v = this.worldView();
    const m = Math.max(0, 90 - v.h / 2 / v.ppd);
    this.worldC.lat = Math.max(-m, Math.min(m, this.worldC.lat));
    this.worldC.lon = ((this.worldC.lon + 540) % 360) - 180;
  }

  // the course on a chart: the LAID ROUTE as a dashed line, ship through
  // every mark — round the capes and through the straits, the road the
  // helmsman will actually sail — with a pennant at the destination. Legs
  // that cross the world seam are split at the chart edge, not smeared
  // across it. (Both charts carry it — that is what a chart is FOR.)
  drawCourse(ctx, s, view, boundsN = null) {
    if (!this.course) return;
    const k = boundsN !== null ? this.mini.width / boundsN : 1;
    // the road AHEAD, exactly as the helmsman intends it: from the active
    // leg to the destination — marks already made are not drawn again
    const marks = this.routeLL && this.routeLL.length
      ? this.routeLL.slice(Math.min(this.routeLeg, this.routeLL.length - 1))
      : [this.course];
    // on the local window, re-seam each mark's lon about the window centre
    const wrapLon = (lon) => view.spanDeg !== undefined
      ? view.lonC + (((lon - view.lonC + 540) % 360) - 180)
      : lon;
    const P = marks.map((m) => chartXY(m.lat, wrapLon(m.lon), view));
    // one full world turn in pixels — the seam-split threshold (the zoomed
    // world's ppd view projects wider than its canvas)
    const worldPx = view.ppd !== undefined ? 360 * view.ppd : view.w;
    ctx.strokeStyle = BLOOD;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    let px = s.x, py = s.y;
    ctx.moveTo(px * k, py * k);
    for (const q of P) {
      if (view.spanDeg === undefined && Math.abs(q.x - px) > worldPx / 2) {
        // the short way crosses the seam: run the leg out past one edge
        // (the canvas clips it), then re-enter from beyond the other
        const dir = Math.sign(q.x - px);
        ctx.lineTo((q.x - dir * worldPx) * k, q.y * k);
        ctx.moveTo((px + dir * worldPx) * k, py * k);
      }
      ctx.lineTo(q.x * k, q.y * k);
      px = q.x; py = q.y;
    }
    ctx.stroke();
    ctx.setLineDash([]);
    const c = P[P.length - 1];
    if (boundsN !== null && (c.x < 0 || c.x >= boundsN || c.y < 0 || c.y >= boundsN)) return;
    ctx.fillStyle = BLOOD;
    ctx.beginPath();
    ctx.moveTo(c.x * k, c.y * k); ctx.lineTo(c.x * k, c.y * k - 11);
    ctx.lineTo(c.x * k + 8, c.y * k - 8); ctx.closePath();
    ctx.fill();
  }

  toggleWorld() {
    this.worldOpen = !this.worldOpen;
    if (this.worldOpen) this._openedAt = performance.now();
    this.worldWrap.style.display = this.worldOpen ? 'flex' : 'none';
  }

  // called each frame; lat/lon/yaw are the SHIP's, digSite the treasure X,
  // sails the other ships in lookout range ({ lat, lon, yaw, type })
  update(lat, lon, yaw, digSite = null, sails = []) {
    this.digSite = digSite;
    this.sails = sails;
    this.updateMini(lat, lon, yaw);
    if (this.worldOpen) this.updateWorld(lat, lon, yaw);
  }

  drawX(ctx, x, y, s = 5) {
    ctx.strokeStyle = BLOOD; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s);
    ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s);
    ctx.stroke();
  }

  updateMini(lat, lon, yaw) {
    if (!this.localView
      || Math.abs(lat - this.localView.latC) > REBUILD_DEG
      || Math.abs(lon - this.localView.lonC) > REBUILD_DEG) {
      this.localView = { w: LOCAL_N, h: LOCAL_N, latC: lat, lonC: lon, spanDeg: LOCAL_SPAN };
      this.localBase = blit(localChartPixels(lat, lon, LOCAL_SPAN, LOCAL_N));
    }
    const ctx = this.miniCtx, S = this.mini.width;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.localBase, 0, 0, S, S);
    const k = S / this.localView.w;
    for (const L of MARKS) {
      const p = chartXY(L.lat, L.lon, this.localView);
      if (p.x >= 0 && p.x < LOCAL_N && p.y >= 0 && p.y < LOCAL_N)
        drawLegend(ctx, p.x * k, p.y * k, L.kind);
    }
    if (this.digSite) {
      const p = chartXY(this.digSite.lat, this.digSite.lon, this.localView);
      if (p.x >= 0 && p.x < LOCAL_N && p.y >= 0 && p.y < LOCAL_N)
        this.drawX(ctx, p.x * k, p.y * k, 6);
    }
    // the lookout's sightings, coloured by allegiance
    for (const o of this.sails || []) {
      const p = chartXY(o.lat, o.lon, this.localView);
      if (p.x >= 0 && p.x < LOCAL_N && p.y >= 0 && p.y < LOCAL_N)
        drawShip(ctx, p.x * k, p.y * k, o.yaw, 0.9, SAIL_TINT[o.type] || INK);
    }
    const s = chartXY(lat, lon, this.localView);
    this.drawCourse(ctx, s, this.localView, LOCAL_N);
    drawShip(ctx, s.x * k, s.y * k, yaw);
  }

  updateWorld(lat, lon, yaw) {
    const ctx = this.worldCanvas.getContext('2d');
    const W = this.worldCanvas.width, H = this.worldCanvas.height;
    // bake a slice of the FINE sheet each open-chart frame (real coastline;
    // whole seconds of work in total, never more than ~8 ms of any frame) —
    // the mask sheet serves until the ink dries, then the fine one forever
    if (!this.fineBase) {
      if (!this.fineJob) this.fineJob = beginFineWorld(2880, 1440);
      if (stepFineWorld(this.fineJob, this.worldZoom > 1 ? 2 : 1)) {
        this.fineBase = blit(finishFineWorld(this.fineJob));
        this.fineJob = null;
      }
    }
    ctx.imageSmoothingEnabled = false;
    const view = this.worldView();
    const ppd = view.ppd;
    // the world is a cylinder: tile the sheet across the seam
    const sheet = this.fineBase || this.worldBase;
    const wPx = 360 * ppd, hPx = 180 * ppd;
    const y0 = H / 2 + (view.latC - 90) * ppd;
    for (let k = -1; k <= 1; k++) {
      const x0 = W / 2 + (-180 + k * 360 - view.lonC) * ppd;
      if (x0 + wPx < 0 || x0 > W) continue;
      ctx.drawImage(sheet, x0, y0, wPx, hPx);
    }
    for (const L of MARKS) {
      const p = chartXY(L.lat, L.lon, view);
      if (p.x < -80 || p.x > W + 80 || p.y < -20 || p.y > H + 20) continue;
      drawLegend(ctx, p.x, p.y, L.kind);
      ctx.fillStyle = INK;
      // dockyards mark quietly; the legends get the big ink
      ctx.font = L.kind === 'dockyard' ? '9px Georgia' : '11px Georgia';
      if (L.kind === 'dockyard') ctx.globalAlpha = 0.75;
      ctx.fillText(L.name, p.x + 6, p.y + 3);
      ctx.globalAlpha = 1;
    }
    if (this.digSite) {
      const p = chartXY(this.digSite.lat, this.digSite.lon, view);
      this.drawX(ctx, p.x, p.y, 6);
      ctx.fillStyle = BLOOD;
      ctx.fillText('the dig', p.x + 8, p.y + 3);
    }
    // the chart's key: which colour flies which flag
    const kx = 10, ky = H - 14 - KEY_ROWS.length * 13;
    ctx.fillStyle = 'rgba(216, 201, 168, 0.85)';
    ctx.fillRect(kx - 6, ky - 12, 108, KEY_ROWS.length * 13 + 18);
    ctx.strokeStyle = INK; ctx.lineWidth = 1;
    ctx.strokeRect(kx - 6, ky - 12, 108, KEY_ROWS.length * 13 + 18);
    ctx.font = '9px Georgia';
    KEY_ROWS.forEach(([tint, label], i) => {
      drawShip(ctx, kx + 4, ky + i * 13, Math.PI, 0.8, tint);
      ctx.fillStyle = INK;
      ctx.fillText(label, kx + 13, ky + i * 13 + 3);
    });

    const s = chartXY(lat, lon, view);
    this.drawCourse(ctx, s, view);
    drawShip(ctx, s.x, s.y, yaw, 1.4);
  }
}
