import { create } from 'zustand';

interface TransportStore {
  looping: boolean;
  externalClockActive: boolean;
  currentBpm: number;

  toggleLoop: () => void;
  setBpm: (bpm: number) => void;
  setExternalClock: (active: boolean, bpm?: number) => void;
}

export const useTransportStore = create<TransportStore>()((set) => ({
  looping: true,
  externalClockActive: false,
  currentBpm: 120,

  toggleLoop: () => set((s) => ({ looping: !s.looping })),
  setBpm: (bpm) => set({ currentBpm: Math.max(20, Math.min(300, bpm)) }),
  setExternalClock: (active, bpm) =>
    set((s) => ({
      externalClockActive: active,
      currentBpm: bpm !== undefined ? bpm : s.currentBpm,
    })),
}));
