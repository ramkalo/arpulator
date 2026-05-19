import { Midi } from '@tonejs/midi';
import type { FunctionDef, Chain, Topology } from '../types';
import { compileExpression, findCrossings, noteValueToSeconds } from './functionEval';
import { scaleDegreeToMidi } from './scales';

// X = seconds directly
function xDeltaToSeconds(xDelta: number): number {
  return xDelta;
}

function exportFunctionToTrack(
  midi: Midi,
  fn: FunctionDef,
  bpm: number,
  trackName: string,
  midiChannel: number = 1,
  timeOffset: number = 0
): number {
  const track = midi.addTrack();
  track.name = trackName;
  track.channel = midiChannel - 1;

  const { compiled, error } = compileExpression(fn.expression);
  if (error || !compiled) return 0;

  const [xMin, xMax] = fn.xAxis.domain;
  const xRange = xMax - xMin;
  const totalSamples = Math.max(200, Math.round(1000 * xRange));
  const crossings = findCrossings(compiled, xMin, xMax, totalSamples);

  const gateSec = noteValueToSeconds(fn.oneShotDuration, bpm);

  crossings.forEach((crossing) => {
    const midiNote = scaleDegreeToMidi(crossing.toDegree, fn.yAxis.scale, fn.yAxis.rootNote);
    const startSec = timeOffset + xDeltaToSeconds(crossing.x - xMin);

    const durSec = gateSec * 0.9;

    track.addNote({
      midi: midiNote,
      time: startSec,
      duration: Math.max(0.02, durSec),
      velocity: fn.velocity / 127,
    });
  });

  return xDeltaToSeconds(xMax - xMin);
}

export function exportFunctionAsMidi(fn: FunctionDef, bpm: number): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(bpm);
  exportFunctionToTrack(midi, fn, bpm, fn.name, fn.midiChannel);
  return midi.toArray();
}

export function exportChainAsMidi(chain: Chain, functions: FunctionDef[], bpm: number): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(bpm);
  let timeOffset = 0;
  for (const fnId of chain.functionIds) {
    const fn = functions.find((f) => f.id === fnId);
    if (!fn) continue;
    const duration = exportFunctionToTrack(midi, fn, bpm, fn.name, fn.midiChannel, timeOffset);
    timeOffset += duration;
  }
  return midi.toArray();
}

export function exportManifoldAsMidi(topology: Topology): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(topology.globalTempo);

  for (const row of topology.manifold) {
    if (row.itemType === 'empty' || !row.itemId) continue;

    if (row.itemType === 'function') {
      const fn = topology.functions.find((f) => f.id === row.itemId);
      if (!fn) continue;
      exportFunctionToTrack(midi, fn, topology.globalTempo, `Ch ${row.midiChannel}: ${fn.name}`, row.midiChannel);
    } else if (row.itemType === 'chain') {
      const chain = topology.chains.find((c) => c.id === row.itemId);
      if (!chain) continue;
      let timeOffset = 0;
      for (const fnId of chain.functionIds) {
        const fn = topology.functions.find((f) => f.id === fnId);
        if (!fn) continue;
        const duration = exportFunctionToTrack(midi, fn, topology.globalTempo, `Ch ${row.midiChannel}: ${fn.name}`, row.midiChannel, timeOffset);
        timeOffset += duration;
      }
    }
  }

  return midi.toArray();
}

export function downloadMidi(data: Uint8Array, filename: string) {
  const blob = new Blob([data.buffer as ArrayBuffer], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadJSON(json: string, filename: string) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
