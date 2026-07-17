// The captain's charts — pure pixel generators for the two maps, no THREE,
// no DOM. verify-chart.mjs guards them. main.js blits the RGBA into canvases.
//
//   globalChartPixels()  — the whole world from the baked 0.5° land mask
//   localChartPixels()   — a window around the ship from the REAL coastline
//                          polygons (isLand), so harbours read true
//   chartXY()            — lat/lon -> pixel inside either view
//
// Drawn as an aged paper chart: parchment sea, ink-washed land, ink coastline.

import { maskLand, isLand, eachRiverSegment } from './earth.js';

export const SEA_RGB = [216, 201, 168];    // aged paper
export const LAND_RGB = [150, 134, 94];    // olive wash
export const COAST_RGB = [58, 44, 28];     // ink line
export const RIVER_RGB = [64, 106, 130];   // water-blue ink: the river roads

// paint an RGBA buffer from a boolean land grid, inking any land px that
// touches sea (the coastline draws itself)
function paint(land, w, h) {
  const px = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let c = land[i] ? LAND_RGB : SEA_RGB;
      if (land[i]) {
        const sea = (x > 0 && !land[i - 1]) || (x < w - 1 && !land[i + 1])
          || (y > 0 && !land[i - w]) || (y < h - 1 && !land[i + w]);
        if (sea) c = COAST_RGB;
      }
      px[i * 4] = c[0]; px[i * 4 + 1] = c[1]; px[i * 4 + 2] = c[2]; px[i * 4 + 3] = 255;
    }
  }
  return px;
}

// ink the baked river polylines over the LAND pixels of a painted chart —
// rivers are navigable in-game, so the chart shows the river roads (how
// else would anyone find their way up the Amazon?). Mouths stop at the
// coast: sea pixels are never overdrawn.
function inkRivers(px, land, w, h, xyOf) {
  eachRiverSegment((lon1, lat1, lon2, lat2) => {
    if (Math.abs(lon1 - lon2) > 180) return; // antimeridian stub
    const a = xyOf(lat1, lon1), b = xyOf(lat2, lon2);
    if ((a.x < 0 && b.x < 0) || (a.x >= w && b.x >= w)
      || (a.y < 0 && b.y < 0) || (a.y >= h && b.y >= h)) return;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))));
    for (let s = 0; s <= steps; s++) {
      const x = Math.floor(a.x + ((b.x - a.x) * s) / steps);
      const y = Math.floor(a.y + ((b.y - a.y) * s) / steps);
      if (x < 0 || x >= w || y < 0 || y >= h) continue;
      const i = y * w + x;
      if (!land[i]) continue;
      px[i * 4] = RIVER_RGB[0]; px[i * 4 + 1] = RIVER_RGB[1]; px[i * 4 + 2] = RIVER_RGB[2];
    }
  });
}

// the world, equirectangular to match the game's plate-carrée geometry.
// Cheap (bit lookups), so full 720x360 is fine to build once at startup.
export function globalChartPixels(w = 720, h = 360) {
  const land = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const lat = 90 - ((y + 0.5) * 180) / h;
    for (let x = 0; x < w; x++) {
      const lon = -180 + ((x + 0.5) * 360) / w;
      land[y * w + x] = maskLand(lat, lon) ? 1 : 0;
    }
  }
  const data = paint(land, w, h);
  inkRivers(data, land, w, h, (lat, lon) => chartXY(lat, lon, { w, h }));
  return { w, h, data };
}

// a square window of the real coastline centred on the ship. spanDeg is the
// full width in degrees — the game world is unprojected (x = lon·M_PER_DEG),
// so equal degree spans are equal game metres and the window stays square.
export function localChartPixels(latC, lonC, spanDeg = 9, n = 96) {
  const land = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) {
    const lat = latC + spanDeg / 2 - ((y + 0.5) * spanDeg) / n;
    for (let x = 0; x < n; x++) {
      const lon = lonC - spanDeg / 2 + ((x + 0.5) * spanDeg) / n;
      land[y * n + x] = (Math.abs(lat) <= 90 && isLand(lat, ((lon + 540) % 360) - 180)) ? 1 : 0;
    }
  }
  const data = paint(land, n, n);
  const view = { w: n, h: n, latC, lonC, spanDeg };
  inkRivers(data, land, n, n, (lat, lon) => chartXY(lat, lon, view));
  return { w: n, h: n, data };
}

// lat/lon -> pixel. view: { w, h } for the world, or
// { w, h, latC, lonC, spanDeg } for a local window. May land outside 0..w.
export function chartXY(lat, lon, view) {
  if (view.spanDeg === undefined) {
    return { x: ((lon + 180) / 360) * view.w, y: ((90 - lat) / 180) * view.h };
  }
  return {
    x: ((lon - (view.lonC - view.spanDeg / 2)) / view.spanDeg) * view.w,
    y: ((view.latC + view.spanDeg / 2 - lat) / view.spanDeg) * view.h,
  };
}
