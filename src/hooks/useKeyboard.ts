import { useEffect, useRef, useState } from 'react';
import { getMidiOutput, sendNoteOn, sendNoteOff } from '../engine/midiEngine';

// QWERTY → semitone offset from C in current octave
const KEY_TO_SEMITONE: Record<string, number> = {
  a: 0,   // C
  w: 1,   // C#
  s: 2,   // D
  e: 3,   // D#
  d: 4,   // E
  f: 5,   // F
  t: 6,   // F#
  g: 7,   // G
  y: 8,   // G#
  h: 9,   // A
  u: 10,  // A#
  j: 11,  // B
  k: 12,  // C (upper)
  o: 13,  // C# (upper)
  l: 14,  // D (upper)
};

export function useKeyboard(
  enabled: boolean,
  midiOutputId: string | null,
  midiChannel: number
) {
  const octaveRef = useRef(4);
  const [octave, setOctave] = useState(4);
  const heldNotes = useRef<Map<string, number>>(new Map());
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!enabled || !midiOutputId) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const key = e.key.toLowerCase();

      if (key === 'z') {
        const newOct = Math.max(0, octaveRef.current - 1);
        octaveRef.current = newOct;
        setOctave(newOct);
        return;
      }
      if (key === 'x') {
        const newOct = Math.min(9, octaveRef.current + 1);
        octaveRef.current = newOct;
        setOctave(newOct);
        return;
      }

      const semitone = KEY_TO_SEMITONE[key];
      if (semitone === undefined) return;
      if (heldNotes.current.has(key)) return; // already held

      const midiNote = octaveRef.current * 12 + semitone;
      if (midiNote < 0 || midiNote > 127) return;

      const output = getMidiOutput(midiOutputId);
      if (!output) return;

      sendNoteOn(output, midiChannel, midiNote, 100);
      heldNotes.current.set(key, midiNote);
      setActiveNotes((prev) => new Set([...prev, midiNote]));
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const midiNote = heldNotes.current.get(key);
      if (midiNote === undefined) return;

      const output = getMidiOutput(midiOutputId);
      if (output) sendNoteOff(output, midiChannel, midiNote);
      heldNotes.current.delete(key);
      setActiveNotes((prev) => {
        const next = new Set(prev);
        next.delete(midiNote);
        return next;
      });
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      // Release all held notes on cleanup
      const output = midiOutputId ? getMidiOutput(midiOutputId) : null;
      if (output) {
        heldNotes.current.forEach((note) => sendNoteOff(output, midiChannel, note));
      }
      heldNotes.current.clear();
      setActiveNotes(new Set());
    };
  }, [enabled, midiOutputId, midiChannel]);

  return { octave, activeNotes };
}
