import type { ScaleDefinition } from '../types';

export const BUILT_IN_SCALES: ScaleDefinition[] = [
  { name: 'Major',               intervals: [0, 2, 4, 5, 7, 9, 11] },
  { name: 'Natural Minor',       intervals: [0, 2, 3, 5, 7, 8, 10] },
  { name: 'Harmonic Minor',      intervals: [0, 2, 3, 5, 7, 8, 11] },
  { name: 'Melodic Minor',       intervals: [0, 2, 3, 5, 7, 9, 11] },
  { name: 'Pentatonic Major',    intervals: [0, 2, 4, 7, 9] },
  { name: 'Pentatonic Minor',    intervals: [0, 3, 5, 7, 10] },
  { name: 'Blues',               intervals: [0, 3, 5, 6, 7, 10] },
  { name: 'Dorian',              intervals: [0, 2, 3, 5, 7, 9, 10] },
  { name: 'Phrygian',            intervals: [0, 1, 3, 5, 7, 8, 10] },
  { name: 'Lydian',              intervals: [0, 2, 4, 6, 7, 9, 11] },
  { name: 'Mixolydian',          intervals: [0, 2, 4, 5, 7, 9, 10] },
  { name: 'Locrian',             intervals: [0, 1, 3, 5, 6, 8, 10] },
  { name: 'Whole Tone',          intervals: [0, 2, 4, 6, 8, 10] },
  { name: 'Diminished (HW)',     intervals: [0, 1, 3, 4, 6, 7, 9, 10] },
  { name: 'Diminished (WH)',     intervals: [0, 2, 3, 5, 6, 8, 9, 11] },
  { name: 'Chromatic',           intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  { name: 'Hungarian Minor',     intervals: [0, 2, 3, 6, 7, 8, 11] },
  { name: 'Double Harmonic',     intervals: [0, 1, 4, 5, 7, 8, 11] },
  { name: 'Japanese (Hirajoshi)',intervals: [0, 2, 3, 7, 8] },
  { name: 'In Scale',            intervals: [0, 1, 5, 7, 8] },
];

export function scaleDegreeToMidi(
  degree: number,       // 0-based integer; higher = higher pitch, wraps per scale length
  scale: ScaleDefinition,
  rootNote: number      // MIDI root, e.g. 60 = C4
): number {
  const n = scale.intervals.length;
  const octave = Math.floor(degree / n);
  const index = ((degree % n) + n) % n;
  const note = rootNote + octave * 12 + scale.intervals[index];
  return Math.max(0, Math.min(127, note));
}
