import * as math from 'mathjs';
import type { FunctionDef, EvaluatedNote } from '../types';
import { scaleDegreeToMidi } from './scales';

export interface EvalResult {
  notes: EvaluatedNote[];
  error: string | null;
  rawValues: number[]; // raw Y values before scale mapping, for graphing
}

export function evaluateFunction(fn: FunctionDef): EvalResult {
  const { expression, xAxis, yAxis } = fn;
  const { domain, stepsPerCycle } = xAxis;
  const { scale, rootNote, octaveRange } = yAxis;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let compiled: any;
  try {
    compiled = math.compile(expression);
  } catch (e) {
    return { notes: [], error: String(e), rawValues: [] };
  }

  const notes: EvaluatedNote[] = [];
  const rawValues: number[] = [];
  const [xMin, xMax] = domain;
  const range = xMax - xMin;

  for (let i = 0; i < stepsPerCycle; i++) {
    const x = stepsPerCycle <= 1 ? xMin : xMin + (i / (stepsPerCycle - 1)) * range;
    let y: number;
    try {
      const result = compiled.evaluate({ x });
      y = typeof result === 'number' ? result : Number(result);
      if (!isFinite(y)) y = 0;
    } catch {
      y = 0;
    }
    rawValues.push(y);

    // Map Y to scale degree (round to nearest integer)
    const degree = Math.round(y);
    const midiNote = scaleDegreeToMidi(degree, scale, rootNote, octaveRange);
    notes.push({ midiNote, stepIndex: i, velocity: fn.velocity });
  }

  return { notes, error: null, rawValues };
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
