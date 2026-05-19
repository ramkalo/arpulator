import { useState, useCallback, useEffect, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTopologyStore } from '../../../stores/topologyStore';
import { useMidiStore } from '../../../stores/midiStore';
import { useTransportStore } from '../../../stores/transportStore';
import { FunctionSlot } from '../../shared/FunctionSlot';
import { Transport } from '../../shared/Transport';
import { compileExpression } from '../../../engine/functionEval';
import { startSequence, stopSequence, getCurrentX } from '../../../engine/arpEngine';
import type { FunctionDef } from '../../../types';
import styles from './ChainView.module.css';

const SEQ_ID = 'chain-view';
const LIB_DRAG_TYPE = 'application/arpulator-fn';

function ChainPlayhead({ seqId, domain, color }: { seqId: string; domain: [number, number]; color: string }) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId: number;
    const [xMin, xMax] = domain;
    const span = xMax - xMin;

    const tick = () => {
      const x = getCurrentX(seqId);
      const bar = barRef.current;
      if (bar) {
        if (x !== null && x >= xMin && x < xMax) {
          bar.style.left = `${((x - xMin) / span) * 100}%`;
          bar.style.opacity = '1';
        } else {
          bar.style.opacity = '0';
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [seqId, domain]);

  return (
    <div className={styles.playheadOverlay}>
      <div ref={barRef} className={styles.playheadBar} style={{ background: color }} />
    </div>
  );
}

function SortableFunctionSlot({ fn, chainId, index, playing }: { fn: FunctionDef; chainId: string; index: number; playing: boolean }) {
  const { removeFunctionFromChain } = useTopologyStore();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: fn.id + '-' + index });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className={styles.sortableSlot}>
      <FunctionSlot
        fn={fn}
        compact
        dragHandleProps={{ ...attributes, ...listeners }}
        onRemove={() => removeFunctionFromChain(chainId, index)}
      />
      {playing && (
        <ChainPlayhead seqId={`${SEQ_ID}-${index}`} domain={fn.xAxis.domain} color={fn.color} />
      )}
    </div>
  );
}

export function ChainView() {
  const { topology, activeChainId, setActiveChainId, addChain, duplicateChain, deleteChain, updateChain, addFunctionToChain, reorderChainFunctions } = useTopologyStore();
  const { selectedOutputId } = useMidiStore();
  const { currentBpm, looping } = useTransportStore();
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [slotDragOver, setSlotDragOver] = useState(false);
  const [previewChannel, setPreviewChannel] = useState(1);
  const chainLoopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const chain = topology.chains.find((c) => c.id === activeChainId) ?? topology.chains[0];

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const startChain = useCallback(() => {
    if (!chain || !selectedOutputId) return 0;
    let offsetSec = 0;
    chain.functionIds.forEach((fnId, i) => {
      const fn = topology.functions.find((f) => f.id === fnId);
      if (!fn) return;
      const { compiled, error } = compileExpression(fn.expression);
      if (error || !compiled) return;
      const fnDuration = fn.xAxis.domain[1] - fn.xAxis.domain[0];
      startSequence({
        id: `${SEQ_ID}-${i}`,
        expression: fn.expression,
        compiled,
        midiOutputId: selectedOutputId,
        midiChannel: previewChannel,
        bpm: currentBpm,
        domain: fn.xAxis.domain,
        looping: false,
        oneShotDuration: fn.oneShotDuration,
        velocity: fn.velocity,
        scale: fn.yAxis.scale,
        rootNote: fn.yAxis.rootNote,
        startOffsetSec: offsetSec,
      });
      offsetSec += fnDuration;
    });
    return offsetSec;
  }, [chain, selectedOutputId, topology.functions, previewChannel, currentBpm]);

  const handlePlay = useCallback(() => {
    if (!chain || !selectedOutputId) return;
    if (chainLoopTimerRef.current) clearTimeout(chainLoopTimerRef.current);
    const totalSec = startChain();
    setPlaying(true);
    setPaused(false);

    if (looping && totalSec > 0) {
      const scheduleLoop = (delaySec: number) => {
        chainLoopTimerRef.current = setTimeout(() => {
          startChain();
          scheduleLoop(totalSec);
        }, delaySec * 1000);
      };
      scheduleLoop(totalSec);
    }
  }, [chain, selectedOutputId, looping, startChain]);

  const stopAll = useCallback(() => {
    if (chainLoopTimerRef.current) { clearTimeout(chainLoopTimerRef.current); chainLoopTimerRef.current = null; }
    if (!chain) return;
    chain.functionIds.forEach((_, i) => stopSequence(`${SEQ_ID}-${i}`, selectedOutputId ?? undefined, previewChannel));
  }, [chain, selectedOutputId, previewChannel]);

  const handlePause = useCallback(() => { stopAll(); setPlaying(false); setPaused(true); }, [stopAll]);
  const handleStop = useCallback(() => { stopAll(); setPlaying(false); setPaused(false); }, [stopAll]);

  useEffect(() => () => {
    if (chainLoopTimerRef.current) clearTimeout(chainLoopTimerRef.current);
    for (let i = 0; i < 16; i++) stopSequence(`${SEQ_ID}-${i}`);
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    if (!chain) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIds = chain.functionIds.map((fid, i) => fid + '-' + i);
    const oldIdx = oldIds.indexOf(String(active.id));
    const newIdx = oldIds.indexOf(String(over.id));
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(chain.functionIds, oldIdx, newIdx);
    reorderChainFunctions(chain.id, reordered);
  };

  const handleSlotDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setSlotDragOver(false);
    if (!chain || chain.functionIds.length >= 16) return;
    const fnId = e.dataTransfer.getData(LIB_DRAG_TYPE);
    if (!fnId) return;
    addFunctionToChain(chain.id, fnId);
  };

  return (
    <div className={styles.layout}>
      {/* Left sidebar — chain list */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>Chains</span>
          <button className={styles.addBtn} onClick={addChain} disabled={topology.chains.length >= 16} title="New Chain">+</button>
        </div>
        <div className={styles.chainList}>
          {topology.chains.map((c) => (
            <div
              key={c.id}
              className={`${styles.chainItem} ${c.id === chain?.id ? styles.active : ''}`}
              onClick={() => { setActiveChainId(c.id); handleStop(); }}
            >
              <span className={styles.chainName}>{c.name}</span>
              <span className={styles.chainCount}>{c.functionIds.length}</span>
            </div>
          ))}
          {topology.chains.length === 0 && (
            <div className={styles.emptyMsg}>No chains yet</div>
          )}
        </div>
      </aside>

      {/* Main editor */}
      <main className={styles.main}>
        {!chain ? (
          <div className={styles.empty}>
            <p>No chains yet.</p>
            <button className={styles.bigAddBtn} onClick={addChain}>Create Chain</button>
          </div>
        ) : (
          <>
            <div className={styles.topBar}>
              <input
                className={styles.nameInput}
                value={chain.name}
                onChange={(e) => updateChain(chain.id, { name: e.target.value })}
              />
              <div className={styles.fnActions}>
                <button className={styles.actionBtn} onClick={() => duplicateChain(chain.id)} title="Duplicate">⧉</button>
                <button className={styles.actionBtn} onClick={() => { deleteChain(chain.id); handleStop(); }} title="Delete">🗑</button>
              </div>
            </div>

            <div
              className={`${styles.slotArea} ${slotDragOver ? styles.slotDragOver : ''}`}
              onDragOver={(e) => { e.preventDefault(); setSlotDragOver(true); }}
              onDragLeave={() => setSlotDragOver(false)}
              onDrop={handleSlotDrop}
            >
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext
                  items={chain.functionIds.map((fid, i) => fid + '-' + i)}
                  strategy={horizontalListSortingStrategy}
                >
                  <div className={styles.slotRow}>
                    {chain.functionIds.map((fnId, idx) => {
                      const fn = topology.functions.find((f) => f.id === fnId);
                      if (!fn) return null;
                      return (
                        <SortableFunctionSlot key={fnId + '-' + idx} fn={fn} chainId={chain.id} index={idx} playing={playing} />
                      );
                    })}
                    {chain.functionIds.length === 0 && (
                      <div className={styles.slotEmptyHint}>← drag functions here from the library</div>
                    )}
                  </div>
                </SortableContext>
              </DndContext>
            </div>

            <div className={styles.transportBar}>
              <Transport playing={playing} paused={paused} onPlay={handlePlay} onPause={handlePause} onStop={handleStop} />
              <div className={styles.channelRow}>
                <label className={styles.label}>Preview Ch</label>
                <select className={styles.select} value={previewChannel} onChange={(e) => setPreviewChannel(+e.target.value)}>
                  {Array.from({ length: 16 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>Ch {i + 1}</option>
                  ))}
                </select>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Right panel — function library */}
      <aside className={styles.fnLibrary}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>Functions</span>
        </div>
        <div className={styles.fnLibList}>
          {topology.functions.length === 0 && (
            <div className={styles.emptyMsg}>No functions yet. Create one in Function view.</div>
          )}
          {topology.functions.map((fn) => (
            <div
              key={fn.id}
              className={styles.fnLibItem}
              style={{ borderLeftColor: fn.color }}
              draggable
              onDragStart={(e) => e.dataTransfer.setData(LIB_DRAG_TYPE, fn.id)}
              onClick={() => { if (chain && chain.functionIds.length < 16) addFunctionToChain(chain.id, fn.id); }}
              title={chain ? (chain.functionIds.length >= 16 ? 'Chain is full' : 'Click to add, or drag into chain') : ''}
            >
              <span className={styles.fnLibName}>{fn.name}</span>
              <span className={styles.fnLibExpr}>{fn.expression}</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
