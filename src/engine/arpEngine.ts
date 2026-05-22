import type { ScaleDefinition, CrossingEvent } from '../types';
import { getMidiOutput, sendNoteOn, sendNoteOff, sendAllNotesOff } from './midiEngine';
import { findCrossings, noteValueToSeconds } from './functionEval';
import { scaleDegreeToMidi } from './scales';

// Lookahead scheduler — schedules MIDI events using AudioContext time for jitter-free playback.
// Based on the Chris Wilson Web Audio scheduling pattern.

const LOOKAHEAD_MS = 100;
const SCHEDULE_INTERVAL = 25;
const SAMPLE_RESOLUTION = 1000; // samples per X unit for crossing detection

interface ContinuousSequence {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  compiled: any;
  midiOutputId: string;
  midiChannel: number;
  bpm: number;
  domain: [number, number];
  looping: boolean;
  oneShotDurationSec: number;
  velocity: number;
  scale: ScaleDefinition;
  rootNote: number;

  timeOrigin: number;         // AudioContext.currentTime when playback started
  xOrigin: number;            // X value at timeOrigin (domain[0])
  scheduledUpTo: number;      // AudioContext.currentTime already scheduled through
  precomputedCrossings: CrossingEvent[]; // sorted by x, computed once at start
  onXUpdate?: (x: number) => void;
}

let audioContext: AudioContext | null = null;
let scheduleTimer: ReturnType<typeof setInterval> | null = null;
const sequences = new Map<string, ContinuousSequence>();

function getAudioContext(): AudioContext {
  if (!audioContext) audioContext = new AudioContext();
  return audioContext;
}

// X = seconds directly, so 1 second = 1 X unit
function secPerXUnit(_seq: ContinuousSequence): number { return 1; }

// Convert AudioContext time → X, accounting for looping
function audioTimeToX(t: number, seq: ContinuousSequence): number {
  const elapsed = t - seq.timeOrigin;
  const rawX = seq.xOrigin + elapsed / secPerXUnit(seq);
  const [xMin, xMax] = seq.domain;
  const span = xMax - xMin;
  if (!seq.looping) return rawX;
  return xMin + ((rawX - xMin) % span + span) % span;
}

// Convert X → AudioContext time. For looping sequences, finds the next occurrence of x
// at or after `afterTime`.
function xToAudioTime(x: number, seq: ContinuousSequence, afterTime: number): number {
  const [xMin, xMax] = seq.domain;
  const span = xMax - xMin;
  const spx = secPerXUnit(seq);

  if (!seq.looping) {
    return seq.timeOrigin + (x - seq.xOrigin) * spx;
  }

  // For looping: determine which cycle afterTime falls in.
  const xAtAfter = audioTimeToX(afterTime, seq);
  const rawXAtAfter = seq.xOrigin + (afterTime - seq.timeOrigin) / spx;
  const cyclesSinceOrigin = Math.floor((rawXAtAfter - xMin) / span);
  const cycleOriginX = xMin + cyclesSinceOrigin * span;
  const candidateX = cycleOriginX + (x - xMin);
  const candidateTime = seq.timeOrigin + (candidateX - seq.xOrigin) * spx;

  if (candidateTime >= afterTime - 1e-9) return candidateTime;
  // Must be in the next cycle
  return candidateTime + span * spx;

  // suppress unused warning
  void xAtAfter;
}

function runScheduler() {
  const ctx = getAudioContext();
  const lookaheadSec = LOOKAHEAD_MS / 1000;
  const perfNow = performance.now();

  for (const [, seq] of sequences) {
    const windowStart = seq.scheduledUpTo;
    const windowEnd = ctx.currentTime + lookaheadSec;
    if (windowEnd <= windowStart) continue;

    const output = getMidiOutput(seq.midiOutputId);
    seq.onXUpdate?.(audioTimeToX(ctx.currentTime, seq));

    const [xMin, xMax] = seq.domain;
    const span = xMax - xMin;

    // Crossings are precomputed. For each crossing at domain x:
    //   audioTime(cycle k) = timeOrigin + (crossing.x - xMin) + k * span
    // We find all (crossing, k) pairs whose audioTime falls in [windowStart, windowEnd].
    for (const crossing of seq.precomputedCrossings) {
      const base = seq.timeOrigin + (crossing.x - xMin);

      if (!seq.looping) {
        if (base < windowStart - 1e-9 || base > windowEnd + 1e-9) continue;
        if (crossing.x >= xMax - 1e-9) continue;
        const midiNote = scaleDegreeToMidi(crossing.toDegree, seq.scale, seq.rootNote);
        const noteOnMs = perfNow + (base - ctx.currentTime) * 1000;
        if (!output) continue;
        sendNoteOn(output, seq.midiChannel, midiNote, seq.velocity, noteOnMs);
        sendNoteOff(output, seq.midiChannel, midiNote, noteOnMs + seq.oneShotDurationSec * 1000);
      } else {
        if (crossing.x >= xMax - 1e-9) continue;
        const kMin = Math.max(0, Math.ceil((windowStart - 1e-9 - base) / span));
        const kMax = Math.floor((windowEnd + 1e-9 - base) / span);
        for (let k = kMin; k <= kMax; k++) {
          const audioTime = base + k * span;
          if (audioTime < windowStart - 1e-9 || audioTime > windowEnd + 1e-9) continue;
          const midiNote = scaleDegreeToMidi(crossing.toDegree, seq.scale, seq.rootNote);
          const noteOnMs = perfNow + (audioTime - ctx.currentTime) * 1000;
          if (!output) continue;
          sendNoteOn(output, seq.midiChannel, midiNote, seq.velocity, noteOnMs);
          sendNoteOff(output, seq.midiChannel, midiNote, noteOnMs + seq.oneShotDurationSec * 1000);
        }
      }
    }

    seq.scheduledUpTo = windowEnd;

    if (!seq.looping) {
      const xNow = xMin + (windowEnd - seq.timeOrigin);
      if (xNow >= xMax) sequences.delete(seq.id);
    }
  }
}

function ensureSchedulerRunning() {
  if (scheduleTimer !== null) return;
  scheduleTimer = setInterval(runScheduler, SCHEDULE_INTERVAL);
}

function stopSchedulerIfIdle() {
  if (sequences.size === 0 && scheduleTimer !== null) {
    clearInterval(scheduleTimer);
    scheduleTimer = null;
  }
}

export interface StartSequenceOptions {
  id: string;
  expression: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  compiled: any;
  midiOutputId: string;
  midiChannel: number;
  bpm: number;
  domain: [number, number];
  looping: boolean;
  oneShotDuration: string;
  velocity: number;
  scale: ScaleDefinition;
  rootNote: number;
  startOffsetSec?: number;
  onXUpdate?: (x: number) => void;
}

export function startSequence(opts: StartSequenceOptions) {
  const ctx = getAudioContext();

  const begin = () => {
    const startTime = ctx.currentTime + 0.05 + (opts.startOffsetSec ?? 0);
    const precomputeRes = Math.max(1000, Math.round(SAMPLE_RESOLUTION * (opts.domain[1] - opts.domain[0])));
    const seq: ContinuousSequence = {
      id: opts.id,
      compiled: opts.compiled,
      midiOutputId: opts.midiOutputId,
      midiChannel: opts.midiChannel,
      bpm: opts.bpm,
      domain: opts.domain,
      looping: opts.looping,
      oneShotDurationSec: noteValueToSeconds(opts.oneShotDuration, opts.bpm),
      velocity: opts.velocity,
      scale: opts.scale,
      rootNote: opts.rootNote,
      timeOrigin: startTime,
      xOrigin: opts.domain[0],
      scheduledUpTo: startTime,
      precomputedCrossings: findCrossings(opts.compiled, opts.domain[0], opts.domain[1], precomputeRes, true),
      onXUpdate: opts.onXUpdate,
    };
    sequences.set(opts.id, seq);
    ensureSchedulerRunning();
  };

  if (ctx.state === 'suspended') {
    ctx.resume().then(begin);
  } else {
    begin();
  }
}

export function stopSequence(id: string, midiOutputId?: string, midiChannel?: number) {
  sequences.delete(id);
  stopSchedulerIfIdle();
  if (midiOutputId) {
    const output = getMidiOutput(midiOutputId);
    if (output) {
      if (midiChannel !== undefined) {
        output.send([0xb0 | ((midiChannel - 1) & 0xf), 123, 0]);
      } else {
        sendAllNotesOff(output);
      }
    }
  }
}

export function stopAllSequences(midiOutputId?: string) {
  const ids = [...sequences.keys()];
  ids.forEach((id) => sequences.delete(id));
  stopSchedulerIfIdle();
  if (midiOutputId) {
    const output = getMidiOutput(midiOutputId);
    if (output) sendAllNotesOff(output);
  }
}

export function updateSequenceBpm(id: string, bpm: number) {
  const seq = sequences.get(id);
  if (!seq) return;
  // Recalculate xOrigin/timeOrigin so position is preserved at new BPM
  const ctx = getAudioContext();
  const currentX = audioTimeToX(ctx.currentTime, seq);
  seq.bpm = bpm;
  seq.oneShotDurationSec = noteValueToSeconds('eighth', bpm); // re-derive if needed
  seq.timeOrigin = ctx.currentTime;
  seq.xOrigin = currentX;
  seq.scheduledUpTo = ctx.currentTime;
}

export function getCurrentX(id: string): number | null {
  const seq = sequences.get(id);
  if (!seq) return null;
  return audioTimeToX(getAudioContext().currentTime, seq);
}

export function updateSequenceDomain(id: string, domain: [number, number]) {
  const seq = sequences.get(id);
  if (!seq) return;
  const ctx = getAudioContext();
  seq.domain = domain;
  seq.scheduledUpTo = ctx.currentTime;
  const precomputeRes = Math.max(1000, Math.round(SAMPLE_RESOLUTION * (domain[1] - domain[0])));
  seq.precomputedCrossings = findCrossings(seq.compiled, domain[0], domain[1], precomputeRes, true);
}

export function updateSequenceDuration(id: string, oneShotDuration: string, bpm: number) {
  const seq = sequences.get(id);
  if (!seq) return;
  seq.oneShotDurationSec = noteValueToSeconds(oneShotDuration, bpm);
}

export function updateSequenceExpression(id: string, compiled: unknown) {
  const seq = sequences.get(id);
  if (!seq) return;
  const ctx = getAudioContext();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  seq.compiled = compiled as any;
  seq.scheduledUpTo = ctx.currentTime;
  const precomputeRes = Math.max(1000, Math.round(SAMPLE_RESOLUTION * (seq.domain[1] - seq.domain[0])));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  seq.precomputedCrossings = findCrossings(compiled as any, seq.domain[0], seq.domain[1], precomputeRes, true);
}
