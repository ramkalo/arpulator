import { create } from 'zustand';

interface TransportStore {
  playing: boolean;
  paused: boolean;
  looping: boolean;
  externalClockActive: boolean;
  currentBpm: number;
  playheadX: number;           // current X position (for graph animation)

  play: () => void;
  pause: () => void;
  stop: () => void;
  toggleLoop: () => void;
  setBpm: (bpm: number) => void;
  setExternalClock: (active: boolean, bpm?: number) => void;
  setPlayheadX: (x: number) => void;
}

export const useTransportStore = create<TransportStore>()((set) => ({
  playing: false,
  paused: false,
  looping: true,
  externalClockActive: false,
  currentBpm: 120,
  playheadX: 0,

  play: () => set({ playing: true, paused: false }),
  pause: () => set((s) => ({ playing: false, paused: s.playing })),
  stop: () => set({ playing: false, paused: false, playheadX: 0 }),
  toggleLoop: () => set((s) => ({ looping: !s.looping })),
  setBpm: (bpm) => set({ currentBpm: Math.max(20, Math.min(300, bpm)) }),
  setExternalClock: (active, bpm) =>
    set((s) => ({
      externalClockActive: active,
      currentBpm: bpm !== undefined ? bpm : s.currentBpm,
    })),
  setPlayheadX: (x) => set({ playheadX: x }),
}));
