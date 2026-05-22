import * as math from 'mathjs';
import type { CrossingEvent, SamplePoint } from '../types';

// Samples the function at numPoints evenly-spaced X values for graph rendering.
export function sampleFunction(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  compiled: any,
  xMin: number,
  xMax: number,
  numPoints: number
): SamplePoint[] {
  const points: SamplePoint[] = [];
  const range = xMax - xMin;
  for (let i = 0; i < numPoints; i++) {
    const x = numPoints <= 1 ? xMin : xMin + (i / (numPoints - 1)) * range;
    let y: number;
    try {
      const result = compiled.evaluate({ x });
      y = typeof result === 'number' ? result : Number(result);
      if (!isFinite(y) || y > 127 || y < -127) y = NaN;
    } catch {
      y = NaN;
    }
    points.push({ x, y });
  }
  return points;
}

// Compiles a math.js expression and returns the compiled object, or null on error.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function compileExpression(expression: string): { compiled: any; error: null } | { compiled: null; error: string } {
  try {
    const compiled = math.compile(expression);
    return { compiled, error: null };
  } catch (e) {
    return { compiled: null, error: String(e) };
  }
}

// --- root-finding helpers ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function evalAt(compiled: any, x: number): number {
  try {
    const r = compiled.evaluate({ x });
    const v = typeof r === 'number' ? r : Number(r);
    return isFinite(v) ? v : NaN;
  } catch { return NaN; }
}

// Bisect g(x) = f(x) - target on [x0, x1]. Caller guarantees a sign change exists.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bisect(compiled: any, x0: number, x1: number, target: number): number {
  let lo = x0, hi = x1;
  for (let i = 0; i < 52; i++) {
    const mid = (lo + hi) / 2;
    if (mid === lo || mid === hi) break;
    const gMid = evalAt(compiled, mid) - target;
    if (!isFinite(gMid)) break;
    const gLo = evalAt(compiled, lo) - target;
    if (Math.sign(gLo) === Math.sign(gMid)) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// Ternary search for a maximum (isMax=true) or minimum on [x0, x1].
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findExtremum(compiled: any, x0: number, x1: number, isMax: boolean): { x: number; y: number } {
  let lo = x0, hi = x1;
  for (let i = 0; i < 100; i++) {
    if (hi - lo < 1e-12) break;
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    const y1 = evalAt(compiled, m1), y2 = evalAt(compiled, m2);
    if (!isFinite(y1) || !isFinite(y2)) break;
    if (isMax ? y1 < y2 : y1 > y2) lo = m1; else hi = m2;
  }
  const x = (lo + hi) / 2;
  return { x, y: evalAt(compiled, x) };
}

// Detects every x in [xStart, xEnd] where f(x) equals an integer, using root-finding.
//
// Pass 1 — crossings: where adjacent samples are in different floor-zones, bisect to find
//   the precise x where f(x) = n. One event per integer crossed, exact to ~1e-15.
//
// Pass 2 — extrema: where a sample is a local max/min, ternary-search for the precise
//   peak/trough value. If it lands exactly on an integer (within 1e-9 floating-point
//   tolerance), fire one note. Catches sin(x)*3 peaking at exactly y=3.
export function findCrossings(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  compiled: any,
  xStart: number,
  xEnd: number,
  sampleResolution: number = 1000,
  includeInitial: boolean = false
): CrossingEvent[] {
  if (xEnd <= xStart) return [];

  const step = (xEnd - xStart) / sampleResolution;

  const xs = new Array<number>(sampleResolution + 1);
  const ys = new Array<number>(sampleResolution + 1);
  for (let i = 0; i <= sampleResolution; i++) {
    xs[i] = i === sampleResolution ? xEnd : xStart + i * step;
    ys[i] = evalAt(compiled, xs[i]);
  }

  const crossings: CrossingEvent[] = [];

  if (includeInitial && isFinite(ys[0])) {
    const degree = Math.round(ys[0]);
    crossings.push({ x: xs[0], fromDegree: degree - 1, toDegree: degree });
  }

  // Pass 1: bisect each integer crossing
  for (let i = 1; i <= sampleResolution; i++) {
    const prevY = ys[i - 1], currY = ys[i];
    if (!isFinite(prevY) || !isFinite(currY)) continue;
    const prevFloor = Math.floor(prevY), currFloor = Math.floor(currY);
    if (prevFloor === currFloor) continue;
    const lo = Math.min(prevFloor, currFloor);
    const hi = Math.max(prevFloor, currFloor);
    const goingUp = currY > prevY;
    for (let n = lo + 1; n <= hi; n++) {
      const xCross = bisect(compiled, xs[i - 1], xs[i], n);
      crossings.push({ x: xCross, fromDegree: goingUp ? n - 1 : n, toDegree: goingUp ? n : n - 1 });
    }
  }

  // Pass 2: extrema that land exactly on an integer
  for (let i = 1; i < sampleResolution; i++) {
    const prev = ys[i - 1], curr = ys[i], next = ys[i + 1];
    if (!isFinite(prev) || !isFinite(curr) || !isFinite(next)) continue;
    const isLocalMax = curr > prev && curr > next;
    const isLocalMin = curr < prev && curr < next;
    if (!isLocalMax && !isLocalMin) continue;
    const { x: xExt, y: yExt } = findExtremum(compiled, xs[i - 1], xs[i + 1], isLocalMax);
    if (!isFinite(yExt)) continue;
    const nearest = Math.round(yExt);
    if (Math.abs(yExt - nearest) < 1e-4) {
      crossings.push({ x: xExt, fromDegree: nearest - 1, toDegree: nearest });
    }
  }

  crossings.sort((a, b) => a.x - b.x);
  return crossings;
}

export function noteValueToSeconds(noteValue: string, bpm: number): number {
  const beat = 60 / bpm;
  switch (noteValue) {
    case 'whole':              return beat * 4;
    case 'half':               return beat * 2;
    case 'quarter':            return beat;
    case 'eighth':             return beat / 2;
    case 'sixteenth':          return beat / 4;
    case 'thirty-second':      return beat / 8;
    case 'triplet-quarter':    return beat * (2 / 3);
    case 'triplet-eighth':     return beat / 3;
    case 'triplet-sixteenth':  return beat / 6;
    default:                   return beat / 4;
  }
}
