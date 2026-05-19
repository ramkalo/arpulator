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

// Detects every integer Y-value crossing in [xStart, xEnd].
//
// Two-pass approach:
//   Pass 1 — standard floor-change detection between consecutive samples.
//   Pass 2 — parabolic peak/trough detection: uses three-point parabola interpolation
//             to find true local extrema. This catches the case where a function's
//             amplitude is exactly an integer (e.g. 7*sin(x) touching y=7) but no
//             sample lands exactly at the peak, so the floor never changes past that
//             integer in the sample sequence.
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

  // Pre-compute all samples so we can run both passes without re-evaluating.
  const xs = new Array<number>(sampleResolution + 1);
  const ys = new Array<number>(sampleResolution + 1);
  for (let i = 0; i <= sampleResolution; i++) {
    xs[i] = i === sampleResolution ? xEnd : xStart + i * step;
    try {
      const r = compiled.evaluate({ x: xs[i] });
      const v = typeof r === 'number' ? r : Number(r);
      ys[i] = isFinite(v) ? v : NaN;
    } catch {
      ys[i] = NaN;
    }
  }

  const crossings: CrossingEvent[] = [];

  if (includeInitial && isFinite(ys[0])) {
    const rounded = Math.round(ys[0]);
    if (Math.abs(ys[0] - rounded) < 1e-9) {
      crossings.push({ x: xs[0], fromDegree: rounded - 1, toDegree: rounded });
    }
  }

  // Pass 1: floor-change crossing detection (existing logic).
  for (let i = 1; i <= sampleResolution; i++) {
    const prevX = xs[i - 1], prevY = ys[i - 1];
    const currX = xs[i],     currY = ys[i];
    if (!isFinite(prevY) || !isFinite(currY)) continue;

    const prevFloor = Math.floor(prevY);
    const currFloor = Math.floor(currY);
    if (prevFloor === currFloor) continue;

    const lo = Math.max(-127, Math.min(prevFloor, currFloor));
    const hi = Math.min(127,  Math.max(prevFloor, currFloor));
    const goingUp = currY > prevY;

    for (let n = lo + 1; n <= hi; n++) {
      const t = (n - prevY) / (currY - prevY);
      const xCross = prevX + t * (currX - prevX);
      crossings.push({
        x: xCross,
        fromDegree: goingUp ? n - 1 : n,
        toDegree:   goingUp ? n     : n - 1,
      });
    }
  }

  // Pass 2: parabolic peak/trough detection.
  // For each local extremum (y1 is max/min of its three-point window), fit a parabola
  // through (x0,y0),(x1,y1),(x2,y2) and compute the interpolated extremum value yPeak.
  // If yPeak crosses an integer that the sample y1 didn't reach (floor/ceil differs),
  // inject crossing events that the sample-based pass missed.
  for (let i = 1; i < sampleResolution; i++) {
    const y0 = ys[i - 1], y1 = ys[i], y2 = ys[i + 1];
    if (!isFinite(y0) || !isFinite(y1) || !isFinite(y2)) continue;

    const isLocalMax = y1 > y0 && y1 > y2;
    const isLocalMin = y1 < y0 && y1 < y2;
    if (!isLocalMax && !isLocalMin) continue;

    // Three-point parabola: y(t) = y1 + B*t + A*t², t ∈ [-1, 1] centred on x1.
    const A = (y0 + y2 - 2 * y1) / 2;
    if (Math.abs(A) < 1e-12) continue; // degenerate (flat)

    const B = (y2 - y0) / 2;
    const tStar = -B / (2 * A);
    if (tStar < -1 || tStar > 1) continue; // extremum outside window

    const yPeak = y1 - (B * B) / (4 * A);
    const xPeak = xs[i] + tStar * step;

    if (isLocalMax) {
      // Fire for integers that yPeak reaches but the sample y1 didn't.
      // Add a small epsilon because floating-point parabolic interpolation can land
      // just below the true peak (e.g. 6.9999999998 instead of 7.0).
      const sampleFloor = Math.floor(y1);
      const peakFloor   = Math.min(127, Math.floor(yPeak + 1e-6));
      for (let n = Math.max(-127, sampleFloor + 1); n <= peakFloor; n++) {
        // Upward crossing just before the peak, downward crossing just after.
        crossings.push({ x: xPeak - 1e-9, fromDegree: n - 1, toDegree: n });
        crossings.push({ x: xPeak + 1e-9, fromDegree: n,     toDegree: n - 1 });
      }
    } else {
      // isLocalMin: fire for integers yPeak descends to but the sample y1 didn't.
      const sampleCeil = Math.ceil(y1);
      const peakCeil   = Math.max(-127, Math.ceil(yPeak - 1e-6));
      for (let n = peakCeil; n < Math.min(128, sampleCeil); n++) {
        crossings.push({ x: xPeak - 1e-9, fromDegree: n,     toDegree: n - 1 });
        crossings.push({ x: xPeak + 1e-9, fromDegree: n - 1, toDegree: n });
      }
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
