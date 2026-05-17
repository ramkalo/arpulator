import { create } from 'zustand';
import type { MidiDevice } from '../types';

interface MidiStore {
  supported: boolean;
  accessGranted: boolean;
  inputs: MidiDevice[];
  outputs: MidiDevice[];
  selectedOutputId: string | null;
  selectedInputId: string | null;

  setSupported: (v: boolean) => void;
  setAccessGranted: (v: boolean) => void;
  setDevices: (inputs: MidiDevice[], outputs: MidiDevice[]) => void;
  setSelectedOutputId: (id: string | null) => void;
  setSelectedInputId: (id: string | null) => void;
}

export const useMidiStore = create<MidiStore>()((set) => ({
  supported: typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator,
  accessGranted: false,
  inputs: [],
  outputs: [],
  selectedOutputId: null,
  selectedInputId: null,

  setSupported: (v) => set({ supported: v }),
  setAccessGranted: (v) => set({ accessGranted: v }),
  setDevices: (inputs, outputs) => set({ inputs, outputs }),
  setSelectedOutputId: (id) => set({ selectedOutputId: id }),
  setSelectedInputId: (id) => set({ selectedInputId: id }),
}));
