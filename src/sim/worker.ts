import { compare, extractDetail, runMode, type Comparison, type DetailSeries } from './engine';
import { buildLotGraph } from './graph';
import { generateLot } from '../lot/generateLot';
import { scaledLot } from './scaledLot';
import type { SimParams } from './params';

/** Runs a live comparison in a Web Worker so the page stays responsive. */

export interface LiveRequest {
  params: SimParams;
  days: number;
  seed: number;
  /** 2 blocks x 9 columns is the 32-spot demo lot. */
  blocks: number;
  cols: number;
}

export type LiveMessage =
  | { kind: 'progress'; done: number; total: number }
  | { kind: 'result'; comparison: Comparison; detail: DetailSeries; spots: number }
  | { kind: 'error'; message: string };

const ctx = self as unknown as { postMessage(message: LiveMessage): void; onmessage: ((e: MessageEvent<LiveRequest>) => void) | null };

ctx.onmessage = (e) => {
  try {
    const { params, days, seed, blocks, cols } = e.data;
    const lot = blocks === 2 && cols === 9 ? generateLot() : scaledLot(blocks, cols);
    const g = buildLotGraph(lot);
    const p = { ...params, demandScale: params.demandScale * (g.spots.length / 32) };
    const total = days * 2;
    const base = runMode(g, p, 'baseline', seed, days, { detail: true, onProgress: (done) => ctx.postMessage({ kind: 'progress', done, total }) });
    const app = runMode(g, p, 'app', seed, days, { detail: true, onProgress: (done) => ctx.postMessage({ kind: 'progress', done: days + done, total }) });
    const comparison = compare(base, app, p, seed, 1000);
    ctx.postMessage({ kind: 'result', comparison, detail: extractDetail(base, app, p), spots: g.spots.length });
  } catch (err) {
    ctx.postMessage({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
