import { Midi } from '@tonejs/midi';
import type { FunctionDef, Chain, Topology } from '../types';
import { evaluateFunction, noteValueToSeconds } from './functionEval';

function notesToMidiTrack(
  midi: Midi,
  notes: Array<{ midiNote: number; velocity: number }>,
  bpm: number,
  quantization: string,
  noteDuration: string,
  trackName: string
) {
  const track = midi.addTrack();
  track.name = trackName;
  const stepSec = noteValueToSeconds(quantization, bpm);
  const durSec = noteValueToSeconds(noteDuration, bpm) * 0.9;

  notes.forEach((n, i) => {
    track.addNote({
      midi: n.midiNote,
      time: i * stepSec,
      duration: durSec,
      velocity: n.velocity / 127,
    });
  });
}

export function exportFunctionAsMidi(fn: FunctionDef, bpm: number): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(bpm);
  const result = evaluateFunction(fn);
  notesToMidiTrack(midi, result.notes, bpm, fn.xAxis.quantization, fn.noteDuration, fn.name);
  return midi.toArray();
}

export function exportChainAsMidi(chain: Chain, functions: FunctionDef[], bpm: number): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(bpm);
  const track = midi.addTrack();
  track.name = chain.name;

  let timeOffset = 0;
  for (const fnId of chain.functionIds) {
    const fn = functions.find((f) => f.id === fnId);
    if (!fn) continue;
    const result = evaluateFunction(fn);
    const stepSec = noteValueToSeconds(fn.xAxis.quantization, bpm);
    const durSec = noteValueToSeconds(fn.noteDuration, bpm) * 0.9;
    result.notes.forEach((n, i) => {
      track.addNote({
        midi: n.midiNote,
        time: timeOffset + i * stepSec,
        duration: durSec,
        velocity: n.velocity / 127,
      });
    });
    timeOffset += result.notes.length * stepSec;
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
      const result = evaluateFunction(fn);
      notesToMidiTrack(
        midi,
        result.notes,
        topology.globalTempo,
        fn.xAxis.quantization,
        fn.noteDuration,
        `Ch ${row.midiChannel}: ${fn.name}`
      );
    } else if (row.itemType === 'chain') {
      const chain = topology.chains.find((c) => c.id === row.itemId);
      if (!chain) continue;
      const track = midi.addTrack();
      track.name = `Ch ${row.midiChannel}: ${chain.name}`;
      let timeOffset = 0;
      for (const fnId of chain.functionIds) {
        const fn = topology.functions.find((f) => f.id === fnId);
        if (!fn) continue;
        const result = evaluateFunction(fn);
        const stepSec = noteValueToSeconds(fn.xAxis.quantization, topology.globalTempo);
        const durSec = noteValueToSeconds(fn.noteDuration, topology.globalTempo) * 0.9;
        result.notes.forEach((n, i) => {
          track.addNote({
            midi: n.midiNote,
            time: timeOffset + i * stepSec,
            duration: durSec,
            velocity: n.velocity / 127,
          });
        });
        timeOffset += result.notes.length * stepSec;
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
