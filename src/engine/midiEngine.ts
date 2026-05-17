import type { MidiDevice } from '../types';

export type MidiClockCallback = (bpm: number) => void;
export type MidiNoteCallback = (channel: number, note: number, velocity: number, isOn: boolean) => void;

let midiAccess: MIDIAccess | null = null;
let clockCallback: MidiClockCallback | null = null;
let noteCallback: MidiNoteCallback | null = null;

// MIDI clock pulse tracking (24 ppqn)
let clockPulseCount = 0;
let clockPulseTimestamps: number[] = [];

function handleMidiMessage(event: MIDIMessageEvent) {
  const data = event.data;
  if (!data || data.length === 0) return;

  const status = data[0];

  // MIDI clock tick (0xF8) — 24 per quarter note
  if (status === 0xf8) {
    const now = performance.now();
    clockPulseTimestamps.push(now);
    if (clockPulseTimestamps.length > 48) clockPulseTimestamps.shift(); // keep last 2 beats
    clockPulseCount++;
    if (clockPulseTimestamps.length >= 24) {
      const elapsed = now - clockPulseTimestamps[clockPulseTimestamps.length - 24];
      const bpm = Math.round(60000 / elapsed);
      if (bpm > 10 && bpm < 400 && clockCallback) {
        clockCallback(bpm);
      }
    }
    return;
  }

  // MIDI start (0xFA) / continue (0xFB) / stop (0xFC)
  if (status === 0xfa || status === 0xfb) {
    clockPulseCount = 0;
    clockPulseTimestamps = [];
  }

  const msgType = status & 0xf0;
  const channel = (status & 0x0f) + 1;

  if (msgType === 0x90 && data.length >= 3) {
    // Note On
    noteCallback?.(channel, data[1], data[2], data[2] > 0);
  } else if (msgType === 0x80 && data.length >= 3) {
    // Note Off
    noteCallback?.(channel, data[1], data[2], false);
  }
}

function enumerateDevices(): { inputs: MidiDevice[]; outputs: MidiDevice[] } {
  if (!midiAccess) return { inputs: [], outputs: [] };
  const inputs: MidiDevice[] = [];
  const outputs: MidiDevice[] = [];
  midiAccess.inputs.forEach((port) => {
    inputs.push({
      id: port.id,
      name: port.name ?? 'Unknown Input',
      manufacturer: port.manufacturer ?? '',
      type: 'input',
      state: port.state as 'connected' | 'disconnected',
    });
  });
  midiAccess.outputs.forEach((port) => {
    outputs.push({
      id: port.id,
      name: port.name ?? 'Unknown Output',
      manufacturer: port.manufacturer ?? '',
      type: 'output',
      state: port.state as 'connected' | 'disconnected',
    });
  });
  return { inputs, outputs };
}

export async function initMidi(
  onDeviceChange: (inputs: MidiDevice[], outputs: MidiDevice[]) => void,
  onClock: MidiClockCallback,
  onNote: MidiNoteCallback
): Promise<{ inputs: MidiDevice[]; outputs: MidiDevice[] }> {
  clockCallback = onClock;
  noteCallback = onNote;

  try {
    midiAccess = await navigator.requestMIDIAccess({ sysex: false });
  } catch {
    throw new Error('MIDI access denied');
  }

  // Subscribe all current inputs
  midiAccess.inputs.forEach((port) => {
    port.onmidimessage = handleMidiMessage;
  });

  midiAccess.onstatechange = () => {
    // Re-subscribe on new connections
    midiAccess?.inputs.forEach((port) => {
      port.onmidimessage = handleMidiMessage;
    });
    const { inputs, outputs } = enumerateDevices();
    onDeviceChange(inputs, outputs);
  };

  return enumerateDevices();
}

export function refreshDevices(): { inputs: MidiDevice[]; outputs: MidiDevice[] } {
  return enumerateDevices();
}

export function getMidiOutput(id: string): MIDIOutput | null {
  if (!midiAccess) return null;
  return midiAccess.outputs.get(id) ?? null;
}

export function sendNoteOn(
  output: MIDIOutput,
  channel: number,
  note: number,
  velocity: number,
  atTime?: number
) {
  const ch = Math.max(1, Math.min(16, channel)) - 1;
  output.send([0x90 | ch, note & 0x7f, velocity & 0x7f], atTime);
}

export function sendNoteOff(
  output: MIDIOutput,
  channel: number,
  note: number,
  atTime?: number
) {
  const ch = Math.max(1, Math.min(16, channel)) - 1;
  output.send([0x80 | ch, note & 0x7f, 0], atTime);
}

export function sendAllNotesOff(output: MIDIOutput) {
  for (let ch = 0; ch < 16; ch++) {
    output.send([0xb0 | ch, 123, 0]);
  }
}
