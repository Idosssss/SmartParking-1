import type { LotGraph } from './graph';

/**
 * Dependency-free SVG charts. Every function returns an SVG string, so the exact same charts are
 * used on the website page and in the PDF report. Colours: orange = driving without the app,
 * blue = driving with the app.
 */

export const COLORS = {
  base: '#ff9500',
  app: '#007aff',
  grid: '#e5e5ea',
  axis: '#aeaeb2',
  text: '#1d1d1f',
  mute: '#6e6e73',
  green: '#34c759',
  red: '#ff3b30',
  purple: '#5856d6',
  lane: '#ececf0',
  spotFree: '#d6f5df',
  spotTaken: '#c7c7cc',
};

const FONT = `-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif`;

export function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function open(w: number, h: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" font-family="${FONT}" style="width:100%;height:auto;display:block">`;
}

const lin = (d0: number, d1: number, r0: number, r1: number) => (v: number) => (d1 === d0 ? (r0 + r1) / 2 : r0 + ((v - d0) / (d1 - d0)) * (r1 - r0));

export function niceScale(min: number, max: number, count = 5): { min: number; max: number; ticks: number[] } {
  if (max <= min) max = min + 1;
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return { min: lo, max: hi, ticks };
}

const fmtDefault = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1).replace(/\.0$/, '') : v.toFixed(2).replace(/0$/, '').replace(/\.0$/, ''));

interface Margins {
  l: number;
  r: number;
  t: number;
  b: number;
}

function legend(items: { name: string; color: string; dashed?: boolean }[], x: number, y: number): string {
  let cursor = x;
  return items
    .map((it) => {
      const out = `<g transform="translate(${cursor},${y})"><line x1="0" y1="0" x2="18" y2="0" stroke="${it.color}" stroke-width="3" ${it.dashed ? 'stroke-dasharray="5 3"' : ''} stroke-linecap="round"/><text x="24" y="4" font-size="11.5" fill="${COLORS.text}">${esc(it.name)}</text></g>`;
      cursor += 24 + it.name.length * 6.4 + 18;
      return out;
    })
    .join('');
}

/* ------------------------------------ line chart ----------------------------------- */

export interface LinePoint {
  x: number;
  y: number;
  lo?: number;
  hi?: number;
}

export interface LineSeries {
  name: string;
  color: string;
  points: LinePoint[];
  dashed?: boolean;
  area?: boolean;
  markers?: boolean;
}

export interface LineChartOptions {
  series: LineSeries[];
  xLabel: string;
  yLabel: string;
  xFormat?: (v: number) => string;
  yFormat?: (v: number) => string;
  xTicks?: number[];
  xLog?: boolean;
  yMin?: number;
  yMax?: number;
  width?: number;
  height?: number;
  /** Highlight a point with a label, e.g. the default scenario. */
  marker?: { x: number; y: number; label: string };
}

export function lineChart(o: LineChartOptions): string {
  const w = o.width ?? 520;
  const h = o.height ?? 340;
  const m: Margins = { l: 60, r: 20, t: 38, b: 52 };
  const xs = o.series.flatMap((s) => s.points.map((p) => p.x));
  const ys = o.series.flatMap((s) => s.points.flatMap((p) => [p.y, p.lo ?? p.y, p.hi ?? p.y]));
  const xmin = Math.min(...xs);
  const xmax = Math.max(...xs);
  const ysc = niceScale(o.yMin ?? Math.min(0, ...ys), o.yMax ?? Math.max(...ys) * 1.05, 5);
  const tx = o.xLog ? (v: number) => Math.log10(v) : (v: number) => v;
  const sx = lin(tx(xmin), tx(xmax), m.l, w - m.r);
  const sy = lin(ysc.min, ysc.max, h - m.b, m.t);
  const yf = o.yFormat ?? fmtDefault;
  const xf = o.xFormat ?? fmtDefault;
  const xTicks = o.xTicks ?? niceScale(xmin, xmax, 6).ticks.filter((t) => t >= xmin - 1e-9 && t <= xmax + 1e-9);

  let g = open(w, h);
  for (const t of ysc.ticks) {
    g += `<line x1="${m.l}" x2="${w - m.r}" y1="${sy(t)}" y2="${sy(t)}" stroke="${COLORS.grid}"/>`;
    g += `<text x="${m.l - 8}" y="${sy(t) + 4}" font-size="11" fill="${COLORS.mute}" text-anchor="end">${yf(t)}</text>`;
  }
  for (const t of xTicks) {
    g += `<line x1="${sx(tx(t))}" x2="${sx(tx(t))}" y1="${h - m.b}" y2="${h - m.b + 5}" stroke="${COLORS.axis}"/>`;
    g += `<text x="${sx(tx(t))}" y="${h - m.b + 19}" font-size="11" fill="${COLORS.mute}" text-anchor="middle">${xf(t)}</text>`;
  }
  g += `<line x1="${m.l}" x2="${w - m.r}" y1="${h - m.b}" y2="${h - m.b}" stroke="${COLORS.axis}"/>`;
  g += `<text x="${(m.l + w - m.r) / 2}" y="${h - 8}" font-size="12" fill="${COLORS.text}" text-anchor="middle">${esc(o.xLabel)}</text>`;
  g += `<text transform="translate(16,${(m.t + h - m.b) / 2}) rotate(-90)" font-size="12" fill="${COLORS.text}" text-anchor="middle">${esc(o.yLabel)}</text>`;

  for (const s of o.series) {
    const pts = s.points.map((p) => [sx(tx(p.x)), sy(p.y)] as const);
    if (s.points.some((p) => p.lo !== undefined && p.hi !== undefined)) {
      const upper = s.points.map((p) => `${sx(tx(p.x))},${sy(p.hi ?? p.y)}`);
      const lower = s.points.map((p) => `${sx(tx(p.x))},${sy(p.lo ?? p.y)}`).reverse();
      g += `<polygon points="${[...upper, ...lower].join(' ')}" fill="${s.color}" opacity="0.16"/>`;
    }
    if (s.area) {
      g += `<polygon points="${m.l + 0},${sy(ysc.min)} ${pts.map((p) => p.join(',')).join(' ')} ${pts[pts.length - 1][0]},${sy(ysc.min)}" fill="${s.color}" opacity="0.18"/>`;
    }
    g += `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${s.color}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" ${s.dashed ? 'stroke-dasharray="6 4"' : ''}/>`;
    if (s.markers) {
      s.points.forEach((p, i) => {
        g += `<circle cx="${pts[i][0]}" cy="${pts[i][1]}" r="3.8" fill="#fff" stroke="${s.color}" stroke-width="2.2"><title>${esc(s.name)}: ${xf(p.x)} → ${yf(p.y)}</title></circle>`;
      });
    }
  }
  if (o.marker) {
    const mx = sx(tx(o.marker.x));
    const my = sy(o.marker.y);
    g += `<circle cx="${mx}" cy="${my}" r="6" fill="none" stroke="${COLORS.text}" stroke-width="1.6"/>`;
    const right = mx > w * 0.65;
    g += `<text x="${right ? mx - 10 : mx + 10}" y="${my - 10}" font-size="11.5" font-weight="600" fill="${COLORS.text}" text-anchor="${right ? 'end' : 'start'}">${esc(o.marker.label)}</text>`;
  }
  g += legend(
    o.series.map((s) => ({ name: s.name, color: s.color, dashed: s.dashed })),
    m.l,
    18,
  );
  return g + '</svg>';
}

/* ------------------------------------- bar chart ------------------------------------ */

export interface BarSeries {
  name: string;
  color: string;
  values: number[];
  lo?: number[];
  hi?: number[];
}

export interface BarChartOptions {
  categories: string[];
  series: BarSeries[];
  yLabel: string;
  xLabel?: string;
  yFormat?: (v: number) => string;
  valueFormat?: (v: number) => string;
  yMax?: number;
  width?: number;
  height?: number;
  showValues?: boolean;
}

export function barChart(o: BarChartOptions): string {
  const w = o.width ?? 520;
  const h = o.height ?? 340;
  const m: Margins = { l: 60, r: 20, t: 38, b: o.xLabel ? 62 : 48 };
  const top = Math.max(...o.series.flatMap((s) => s.values.map((v, i) => s.hi?.[i] ?? v)));
  const ysc = niceScale(0, o.yMax ?? top * 1.12, 5);
  const sy = lin(ysc.min, ysc.max, h - m.b, m.t);
  const yf = o.yFormat ?? fmtDefault;
  const vf = o.valueFormat ?? yf;
  const band = (w - m.l - m.r) / o.categories.length;
  const groupW = band * 0.72;
  const barW = groupW / o.series.length;

  let g = open(w, h);
  for (const t of ysc.ticks) {
    g += `<line x1="${m.l}" x2="${w - m.r}" y1="${sy(t)}" y2="${sy(t)}" stroke="${COLORS.grid}"/>`;
    g += `<text x="${m.l - 8}" y="${sy(t) + 4}" font-size="11" fill="${COLORS.mute}" text-anchor="end">${yf(t)}</text>`;
  }
  g += `<line x1="${m.l}" x2="${w - m.r}" y1="${h - m.b}" y2="${h - m.b}" stroke="${COLORS.axis}"/>`;
  o.categories.forEach((cat, ci) => {
    const gx = m.l + band * ci + (band - groupW) / 2;
    g += `<text x="${m.l + band * (ci + 0.5)}" y="${h - m.b + 18}" font-size="11" fill="${COLORS.mute}" text-anchor="middle">${esc(cat)}</text>`;
    o.series.forEach((s, si) => {
      const v = s.values[ci];
      const x = gx + barW * si;
      g += `<rect x="${x + 1}" y="${sy(v)}" width="${Math.max(barW - 2, 1)}" height="${Math.max(h - m.b - sy(v), 0)}" rx="3" fill="${s.color}"><title>${esc(s.name)} · ${esc(cat)}: ${vf(v)}</title></rect>`;
      if (s.lo && s.hi) {
        const cx = x + barW / 2;
        g += `<line x1="${cx}" x2="${cx}" y1="${sy(s.lo[ci])}" y2="${sy(s.hi[ci])}" stroke="${COLORS.text}" stroke-width="1.3"/>`;
        g += `<line x1="${cx - 4}" x2="${cx + 4}" y1="${sy(s.hi[ci])}" y2="${sy(s.hi[ci])}" stroke="${COLORS.text}" stroke-width="1.3"/>`;
        g += `<line x1="${cx - 4}" x2="${cx + 4}" y1="${sy(s.lo[ci])}" y2="${sy(s.lo[ci])}" stroke="${COLORS.text}" stroke-width="1.3"/>`;
      }
      if (o.showValues !== false) {
        g += `<text x="${x + barW / 2}" y="${sy(s.hi?.[ci] ?? v) - 6}" font-size="10.5" font-weight="600" fill="${COLORS.text}" text-anchor="middle">${vf(v)}</text>`;
      }
    });
  });
  if (o.xLabel) g += `<text x="${(m.l + w - m.r) / 2}" y="${h - 8}" font-size="12" fill="${COLORS.text}" text-anchor="middle">${esc(o.xLabel)}</text>`;
  g += `<text transform="translate(16,${(m.t + h - m.b) / 2}) rotate(-90)" font-size="12" fill="${COLORS.text}" text-anchor="middle">${esc(o.yLabel)}</text>`;
  g += legend(
    o.series.map((s) => ({ name: s.name, color: s.color })),
    m.l,
    18,
  );
  return g + '</svg>';
}

/* --------------------------------------- lot map ------------------------------------- */

export interface LotMapRoute {
  nodes: number[];
  /** Spot index the route ends in (draws the final turn into the spot). */
  endSpot?: number;
  color: string;
  width: number;
  dashed?: boolean;
  label: string;
}

export interface LotMapOptions {
  occupied?: number[];
  /** Colour spots by a value (e.g. drive distance) instead of free / taken. */
  spotHeat?: { values: number[]; unit: string };
  /** Print a number on each lane cell (e.g. Dijkstra distance). */
  laneNumbers?: (number | string)[];
  routes?: LotMapRoute[];
  showIds?: boolean;
  cell?: number;
  caption?: string;
  /** Spot indices to outline (e.g. the destination spots). */
  highlight?: { spot: number; color: string }[];
}

function heat(t: number): string {
  const hue = 135 - 125 * Math.min(Math.max(t, 0), 1);
  return `hsl(${hue.toFixed(0)}, 68%, 66%)`;
}

export function lotMap(g: LotGraph, o: LotMapOptions = {}): string {
  const cell = o.cell ?? 46;
  const pad = 14;
  const lot = g.lot;
  const w = lot.cols * cell + pad * 2;
  const legendH = (o.routes?.length ?? 0) > 0 || o.spotHeat ? 34 : 8;
  const h = lot.rows * cell + pad * 2 + legendH;
  const taken = new Set(o.occupied ?? []);
  const cx = (c: number) => pad + c * cell + cell / 2;
  const cy = (r: number) => pad + r * cell + cell / 2;
  const heatMax = o.spotHeat ? Math.max(...o.spotHeat.values) : 1;
  const heatMin = o.spotHeat ? Math.min(...o.spotHeat.values) : 0;

  let s = open(w, h);
  s += `<rect x="0.5" y="0.5" width="${w - 1}" height="${lot.rows * cell + pad * 2 - 1}" rx="14" fill="#fafafc" stroke="${COLORS.grid}"/>`;

  g.laneCells.forEach(([r, c], i) => {
    s += `<rect x="${pad + c * cell + 1}" y="${pad + r * cell + 1}" width="${cell - 2}" height="${cell - 2}" rx="5" fill="${COLORS.lane}"/>`;
    if (o.laneNumbers) {
      s += `<text x="${cx(c)}" y="${cy(r) + 4}" font-size="11" fill="${COLORS.mute}" text-anchor="middle">${o.laneNumbers[i]}</text>`;
    }
  });
  const ent = lot.entrance;
  s += `<rect x="${pad + ent.col * cell + 1}" y="${pad + ent.row * cell + 1}" width="${cell - 2}" height="${cell - 2}" rx="5" fill="#d6e8ff" stroke="${COLORS.app}"/>`;
  s += `<text x="${cx(ent.col)}" y="${cy(ent.row) + 4}" font-size="10.5" font-weight="700" fill="${COLORS.app}" text-anchor="middle">${o.laneNumbers ? '0 · IN' : 'IN'}</text>`;

  g.spots.forEach((sp, i) => {
    const fill = o.spotHeat ? heat((o.spotHeat.values[i] - heatMin) / Math.max(heatMax - heatMin, 1)) : taken.has(i) ? COLORS.spotTaken : COLORS.spotFree;
    s += `<rect x="${pad + sp.col * cell + 3}" y="${pad + sp.row * cell + 3}" width="${cell - 6}" height="${cell - 6}" rx="6" fill="${fill}" stroke="${taken.has(i) ? '#8e8e93' : '#fff'}" stroke-width="1"/>`;
    if (taken.has(i)) {
      // a little car shape so "taken" reads at a glance
      s += `<rect x="${cx(sp.col) - 9}" y="${cy(sp.row) - 5}" width="18" height="10" rx="3" fill="#6e6e73"/>`;
    }
    const label = o.spotHeat ? String(o.spotHeat.values[i]) : o.showIds === false ? '' : sp.id.replace('S', '');
    if (label && !taken.has(i)) s += `<text x="${cx(sp.col)}" y="${cy(sp.row) + 4}" font-size="${o.spotHeat ? 12 : 10.5}" font-weight="${o.spotHeat ? 700 : 500}" fill="#1d1d1f" text-anchor="middle">${label}</text>`;
  });

  for (const hl of o.highlight ?? []) {
    const sp = g.spots[hl.spot];
    s += `<rect x="${pad + sp.col * cell + 2}" y="${pad + sp.row * cell + 2}" width="${cell - 4}" height="${cell - 4}" rx="7" fill="none" stroke="${hl.color}" stroke-width="3"/>`;
  }

  for (const route of o.routes ?? []) {
    const pts = route.nodes.map((n) => [cx(g.laneCells[n][1]), cy(g.laneCells[n][0])]);
    if (route.endSpot !== undefined) {
      const sp = g.spots[route.endSpot];
      pts.push([cx(sp.col), cy(sp.row)]);
    }
    const off = route.dashed ? -3 : 3; // keep two overlapping routes visible side by side
    s += `<polyline points="${pts.map((p) => `${p[0] + off},${p[1] + off}`).join(' ')}" fill="none" stroke="${route.color}" stroke-width="${route.width}" stroke-linejoin="round" stroke-linecap="round" opacity="0.92" ${route.dashed ? 'stroke-dasharray="7 5"' : ''}/>`;
    const last = pts[pts.length - 1];
    s += `<circle cx="${last[0] + off}" cy="${last[1] + off}" r="5.5" fill="${route.color}" stroke="#fff" stroke-width="1.6"/>`;
  }

  const ly = lot.rows * cell + pad * 2 + 18;
  if (o.routes?.length) {
    let x = pad;
    for (const r of o.routes) {
      s += `<line x1="${x}" x2="${x + 22}" y1="${ly}" y2="${ly}" stroke="${r.color}" stroke-width="${r.width}" stroke-linecap="round" ${r.dashed ? 'stroke-dasharray="7 5"' : ''}/><text x="${x + 28}" y="${ly + 4}" font-size="11.5" fill="${COLORS.text}">${esc(r.label)}</text>`;
      x += 36 + r.label.length * 6.3;
    }
  } else if (o.spotHeat) {
    for (let i = 0; i <= 10; i++) s += `<rect x="${pad + i * 14}" y="${ly - 7}" width="14" height="12" fill="${heat(i / 10)}"/>`;
    s += `<text x="${pad + 164}" y="${ly + 3}" font-size="11.5" fill="${COLORS.text}">closer → farther (${esc(o.spotHeat.unit)})</text>`;
  }
  return s + '</svg>';
}
