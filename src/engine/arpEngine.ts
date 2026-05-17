import type { EvaluatedNote } from '../types';
import { getMidiOutput, sendNoteOn, sendNoteOff, sendAllNotesOff } from './midiEngine';
import { noteValueToSeconds } from './functionEval';

// Lookahead scheduler — schedules MIDI events using AudioContext time for jitter-free playback.
// Based on the Chris Wilson Web Audio scheduling pattern.

const LOOKAHEAD_MS = 100;    // how far ahead to schedule (ms)
const SCHEDULE_INTERVAL = 25; // how often to call the scheduler (ms)

interface ScheduledSequence {
  id: string;
  notes: EvaluatedNote[];
  midiOutputId: string;
  midiChannel: number;
  bpm: number;
  quantization: string;
  noteDuration: string;
  looping: boolean;
  currentStep: number;
  nextNoteTime: number; // AudioContext time of next note
  onStep?: (step: number) => void;
}

let audioContext: AudioContext | null = null;
let scheduleTimer: ReturnType<typeof setInterval> | null = null;
const sequences = new Map<string, ScheduledSequence>();

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

function scheduleNote(seq: ScheduledSequence, note: EvaluatedNote, time: number) {
  const output = getMidiOutput(seq.midiOutputId);
  if (!output) return;

  const durationSec = noteValueToSeconds(seq.noteDuration, seq.bpm);
  const msTime = time * 1000; // AudioContext time is in seconds, MIDIOutput.send uses ms

  sendNoteOn(output, seq.midiChannel, note.midiNote, note.velocity, msTime);
  sendNoteOff(output, seq.midiChannel, note.midiNote, msTime + durationSec * 900); // 90% gate
}

function runScheduler() {
  const ctx = getAudioContext();
  const lookaheadSec = LOOKAHEAD_MS / 1000;

  for (const [id, seq] of sequences) {
    if (seq.notes.length === 0) continue;

    while (seq.nextNoteTime < ctx.currentTime + lookaheadSec) {
      const note = seq.notes[seq.currentStep];
      scheduleNote(seq, note, seq.nextNoteTime);
      seq.onStep?.(seq.currentStep);

      const stepDuration = noteValueToSeconds(seq.quantization, seq.bpm);
      seq.nextNoteTime += stepDuration;
      seq.currentStep++;

      if (seq.currentStep >= seq.notes.length) {
        if (seq.looping) {
          seq.currentStep = 0;
        } else {
          sequences.delete(id);
          break;
        }
      }
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
  notes: EvaluatedNote[];
  midiOutputId: string;
  midiChannel: number;
  bpm: number;
  quantization: string;
  noteDuration: string;
  looping: boolean;
  startStep?: number;
  onStep?: (step: number) => void;
}

export function startSequence(opts: StartSequenceOptions) {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') ctx.resume();

  const seq: ScheduledSequence = {
    id: opts.id,
    notes: opts.notes,
    midiOutputId: opts.midiOutputId,
    midiChannel: opts.midiChannel,
    bpm: opts.bpm,
    quantization: opts.quantization,
    noteDuration: opts.noteDuration,
    looping: opts.looping,
    currentStep: opts.startStep ?? 0,
    nextNoteTime: ctx.currentTime + 0.05, // 50ms start offset
    onStep: opts.onStep,
  };
  sequences.set(opts.id, seq);
  ensureSchedulerRunning();
}

export function stopSequence(id: string, midiOutputId?: string, midiChannel?: number) {
  sequences.delete(id);
  stopSchedulerIfIdle();
  if (midiOutputId) {
    const output = getMidiOutput(midiOutputId);
    if (output) {
      if (midiChannel !== undefined) {
        // Send all notes off on this channel
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

export function getSequenceStep(id: string): number {
  return sequences.get(id)?.currentStep ?? 0;
}

export function updateSequenceBpm(id: string, bpm: number) {
  const seq = sequences.get(id);
  if (seq) seq.bpm = bpm;
}
