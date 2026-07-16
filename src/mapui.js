// The chart table — DOM/canvas layer over the pure pixels in chart.js.
//
//   minimap    — small always-on local chart, top-right; rebuilt when the ship
//                sails far enough from the last centre
//   world map  — full-screen chart on M, built once from the land mask
//
// Ship is a heading arrow; legends are inked marks (X for havens' rivals too —
// every row of legends.js lands on both charts, that's the point of a chart).

import { globalChartPixels, localChartPixels, chartXY } from './chart.js';
import { LEGENDS } from './legends.js';

const INK = '#3a2c1c', BLOOD = '#8c2f22';
const LOCAL_SPAN = 9;      // degrees across the minimap window
const LOCAL_N = 96;        // chart resolution
const REBUILD_DEG = LOCAL_SPAN / 10; // recentre after drifting a tenth of the window

function blit(img) {
  const c = document.createElement('canvas');
  c.width = img.w; c.height = img.h;
  c.getContext('2d').putImageData(
    new ImageData(new Uint8ClampedArray(img.data.buffer), img.w, img.h), 0, 0);
  return c;
}

function drawShip(ctx, x, y, yaw, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  // world yaw 0 = +z = south on the chart; the chart's north is up
  ctx.rotate(Math.PI - yaw);
  ctx.fillStyle = BLOOD;
  ctx.beginPath();
  ctx.moveTo(0, -6 * scale); ctx.lineTo(4 * scale, 5 * scale);
  ctx.lineTo(0, 2.5 * scale); ctx.lineTo(-4 * scale, 5 * scale);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawLegend(ctx, x, y, kind) {
  ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = 1.5;
  if (kind === 'haven') {                         // anchor dot
    ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
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

    this.localView = null;   // { w, h, latC, lonC, spanDeg }
    this.localBase = null;

    addEventListener('keydown', (e) => {
      if (e.code === 'KeyM' && !e.repeat) this.toggleWorld();
      if (e.code === 'Escape' && this.worldOpen) this.toggleWorld();
    });
  }

  toggleWorld() {
    this.worldOpen = !this.worldOpen;
    this.worldWrap.style.display = this.worldOpen ? 'flex' : 'none';
  }

  // called each frame; lat/lon/yaw are the SHIP's
  update(lat, lon, yaw) {
    this.updateMini(lat, lon, yaw);
    if (this.worldOpen) this.updateWorld(lat, lon, yaw);
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
    for (const L of LEGENDS) {
      const p = chartXY(L.lat, L.lon, this.localView);
      if (p.x >= 0 && p.x < LOCAL_N && p.y >= 0 && p.y < LOCAL_N)
        drawLegend(ctx, p.x * k, p.y * k, L.kind);
    }
    const s = chartXY(lat, lon, this.localView);
    drawShip(ctx, s.x * k, s.y * k, yaw);
  }

  updateWorld(lat, lon, yaw) {
    const ctx = this.worldCanvas.getContext('2d');
    const W = this.worldCanvas.width, H = this.worldCanvas.height;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.worldBase, 0, 0, W, H);
    const view = { w: W, h: H };
    ctx.font = '11px Georgia';
    for (const L of LEGENDS) {
      const p = chartXY(L.lat, L.lon, view);
      drawLegend(ctx, p.x, p.y, L.kind);
      ctx.fillStyle = INK;
      ctx.fillText(L.name, p.x + 6, p.y + 3);
    }
    const s = chartXY(lat, lon, view);
    drawShip(ctx, s.x, s.y, yaw, 1.4);
  }
}
