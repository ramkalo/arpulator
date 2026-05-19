import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Topology, FunctionDef, Chain, ManifoldRow } from '../types';
import { BUILT_IN_SCALES } from '../engine/scales';

const DEFAULT_FUNCTION_COLORS = [
  '#f59e0b', '#10b981', '#3b82f6', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#84cc16',
  '#ec4899', '#14b8a6', '#a78bfa', '#fb923c',
  '#34d399', '#60a5fa', '#f472b6', '#facc15',
];

function makeDefaultManifold(): ManifoldRow[] {
  return Array.from({ length: 16 }, (_, i) => ({
    midiChannel: i + 1,
    itemType: 'empty' as const,
    itemId: null,
  }));
}

function makeDefaultFunction(index: number): FunctionDef {
  return {
    id: crypto.randomUUID(),
    name: `Function ${index + 1}`,
    expression: 'sin(x)',
    xAxis: {
      domain: [0, 6],
    },
    yAxis: {
      scale: BUILT_IN_SCALES[0],
      rootNote: 60,
      yViewRange: [-8, 8],
    },
    oneShotDuration: 'eighth',
    midiChannel: 1,
    velocity: 100,
    color: DEFAULT_FUNCTION_COLORS[index % DEFAULT_FUNCTION_COLORS.length],
  };
}

function makeNewTopology(name = 'New Topology'): Topology {
  const firstFn = makeDefaultFunction(0);
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: new Date().toISOString(),
    functions: [firstFn],
    chains: [],
    manifold: makeDefaultManifold(),
    globalTempo: 120,
  };
}

interface TopologyStore {
  topology: Topology;
  activeFunctionId: string | null;
  activeChainId: string | null;

  // Topology-level
  setTopologyName: (name: string) => void;
  setGlobalTempo: (bpm: number) => void;
  loadTopology: (t: Topology) => void;
  newTopology: () => void;
  exportTopologyJSON: () => string;

  // Functions
  addFunction: () => void;
  duplicateFunction: (id: string) => void;
  deleteFunction: (id: string) => void;
  updateFunction: (id: string, patch: Partial<FunctionDef>) => void;
  setActiveFunctionId: (id: string | null) => void;

  // Chains
  addChain: () => void;
  duplicateChain: (id: string) => void;
  deleteChain: (id: string) => void;
  updateChain: (id: string, patch: Partial<Chain>) => void;
  setActiveChainId: (id: string | null) => void;
  addFunctionToChain: (chainId: string, functionId: string) => void;
  removeFunctionFromChain: (chainId: string, index: number) => void;
  reorderChainFunctions: (chainId: string, newOrder: string[]) => void;

  // Manifold
  setManifoldRow: (channel: number, itemType: ManifoldRow['itemType'], itemId: string | null) => void;
  clearManifoldRow: (channel: number) => void;
}

export const useTopologyStore = create<TopologyStore>()(
  persist(
    (set, get) => {
      const initial = makeNewTopology();
      return {
        topology: initial,
        activeFunctionId: initial.functions[0]?.id ?? null,
        activeChainId: null,

        setTopologyName: (name) =>
          set((s) => ({ topology: { ...s.topology, name } })),

        setGlobalTempo: (bpm) =>
          set((s) => ({ topology: { ...s.topology, globalTempo: bpm } })),

        loadTopology: (t) =>
          set({ topology: t, activeFunctionId: t.functions[0]?.id ?? null, activeChainId: null }),

        newTopology: () => {
          const t = makeNewTopology();
          set({ topology: t, activeFunctionId: t.functions[0]?.id ?? null, activeChainId: null });
        },

        exportTopologyJSON: () => JSON.stringify(get().topology, null, 2),

        addFunction: () =>
          set((s) => {
            if (s.topology.functions.length >= 16) return s;
            const fn = makeDefaultFunction(s.topology.functions.length);
            return {
              topology: { ...s.topology, functions: [...s.topology.functions, fn] },
              activeFunctionId: fn.id,
            };
          }),

        duplicateFunction: (id) =>
          set((s) => {
            if (s.topology.functions.length >= 16) return s;
            const src = s.topology.functions.find((f) => f.id === id);
            if (!src) return s;
            const dup: FunctionDef = { ...src, id: crypto.randomUUID(), name: src.name + ' Copy' };
            return {
              topology: { ...s.topology, functions: [...s.topology.functions, dup] },
              activeFunctionId: dup.id,
            };
          }),

        deleteFunction: (id) =>
          set((s) => {
            const fns = s.topology.functions.filter((f) => f.id !== id);
            const chains = s.topology.chains.map((c) => ({
              ...c,
              functionIds: c.functionIds.filter((fid) => fid !== id),
            }));
            const manifold = s.topology.manifold.map((r) =>
              r.itemType === 'function' && r.itemId === id
                ? { ...r, itemType: 'empty' as const, itemId: null }
                : r
            );
            const newActiveId =
              s.activeFunctionId === id ? (fns[0]?.id ?? null) : s.activeFunctionId;
            return {
              topology: { ...s.topology, functions: fns, chains, manifold },
              activeFunctionId: newActiveId,
            };
          }),

        updateFunction: (id, patch) =>
          set((s) => ({
            topology: {
              ...s.topology,
              functions: s.topology.functions.map((f) =>
                f.id === id ? { ...f, ...patch } : f
              ),
            },
          })),

        setActiveFunctionId: (id) => set({ activeFunctionId: id }),

        addChain: () =>
          set((s) => {
            if (s.topology.chains.length >= 16) return s;
            const chain: Chain = {
              id: crypto.randomUUID(),
              name: `Chain ${s.topology.chains.length + 1}`,
              functionIds: [],
            };
            return {
              topology: { ...s.topology, chains: [...s.topology.chains, chain] },
              activeChainId: chain.id,
            };
          }),

        duplicateChain: (id) =>
          set((s) => {
            if (s.topology.chains.length >= 16) return s;
            const src = s.topology.chains.find((c) => c.id === id);
            if (!src) return s;
            const dup: Chain = { ...src, id: crypto.randomUUID(), name: src.name + ' Copy' };
            return {
              topology: { ...s.topology, chains: [...s.topology.chains, dup] },
              activeChainId: dup.id,
            };
          }),

        deleteChain: (id) =>
          set((s) => {
            const chains = s.topology.chains.filter((c) => c.id !== id);
            const manifold = s.topology.manifold.map((r) =>
              r.itemType === 'chain' && r.itemId === id
                ? { ...r, itemType: 'empty' as const, itemId: null }
                : r
            );
            return {
              topology: { ...s.topology, chains, manifold },
              activeChainId: s.activeChainId === id ? (chains[0]?.id ?? null) : s.activeChainId,
            };
          }),

        updateChain: (id, patch) =>
          set((s) => ({
            topology: {
              ...s.topology,
              chains: s.topology.chains.map((c) => (c.id === id ? { ...c, ...patch } : c)),
            },
          })),

        setActiveChainId: (id) => set({ activeChainId: id }),

        addFunctionToChain: (chainId, functionId) =>
          set((s) => ({
            topology: {
              ...s.topology,
              chains: s.topology.chains.map((c) => {
                if (c.id !== chainId || c.functionIds.length >= 16) return c;
                return { ...c, functionIds: [...c.functionIds, functionId] };
              }),
            },
          })),

        removeFunctionFromChain: (chainId, index) =>
          set((s) => ({
            topology: {
              ...s.topology,
              chains: s.topology.chains.map((c) => {
                if (c.id !== chainId) return c;
                const ids = [...c.functionIds];
                ids.splice(index, 1);
                return { ...c, functionIds: ids };
              }),
            },
          })),

        reorderChainFunctions: (chainId, newOrder) =>
          set((s) => ({
            topology: {
              ...s.topology,
              chains: s.topology.chains.map((c) =>
                c.id === chainId ? { ...c, functionIds: newOrder } : c
              ),
            },
          })),

        setManifoldRow: (channel, itemType, itemId) =>
          set((s) => ({
            topology: {
              ...s.topology,
              manifold: s.topology.manifold.map((r) =>
                r.midiChannel === channel ? { ...r, itemType, itemId } : r
              ),
            },
          })),

        clearManifoldRow: (channel) =>
          set((s) => ({
            topology: {
              ...s.topology,
              manifold: s.topology.manifold.map((r) =>
                r.midiChannel === channel ? { ...r, itemType: 'empty', itemId: null } : r
              ),
            },
          })),
      };
    },
    {
      name: 'arpulator-topology',
      version: 5,
      migrate: (state: unknown) => {
        const s = state as { topology?: Topology };
        if (!s?.topology) return state;
        const fns = s.topology.functions.map((fn) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const f = fn as any;
          const rawDomain = f.xAxis?.domain ?? [0, 6];
          const rawYView = f.yAxis?.yViewRange ?? [-8, 8];
          return {
            ...fn,
            xAxis: {
              domain: [0, Math.max(1, Math.min(60, Math.round(rawDomain[1])))] as [number, number],
            },
            yAxis: {
              scale: f.yAxis?.scale ?? BUILT_IN_SCALES[0],
              rootNote: f.yAxis?.rootNote ?? 60,
              yViewRange: [Math.max(-127, rawYView[0]), Math.min(127, rawYView[1])] as [number, number],
            },
            oneShotDuration: f.oneShotDuration ?? f.noteDuration ?? 'eighth',
            color: f.color ?? '#f59e0b',
          };
        });
        return { ...s, topology: { ...s.topology, functions: fns } };
      },
    }
  )
);
