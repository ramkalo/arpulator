import { useState, useCallback, useEffect } from 'react';
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
import { startSequence, stopSequence } from '../../../engine/arpEngine';
import type { FunctionDef } from '../../../types';
import styles from './ChainView.module.css';

const SEQ_ID = 'chain-view';

function SortableFunctionSlot({ fn, chainId, index }: { fn: FunctionDef; chainId: string; index: number }) {
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
    </div>
  );
}

export function ChainView() {
  const { topology, activeChainId, setActiveChainId, addChain, duplicateChain, deleteChain, updateChain, addFunctionToChain, reorderChainFunctions } = useTopologyStore();
  const { selectedOutputId } = useMidiStore();
  const { currentBpm, looping, play, pause, stop } = useTransportStore();

  const chain = topology.chains.find((c) => c.id === activeChainId) ?? topology.chains[0];
  const [showPicker, setShowPicker] = useState(false);
  const [previewChannel, setPreviewChannel] = useState(1);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Chains play each function as a parallel continuous sequence on the preview channel.
  const handlePlay = useCallback(() => {
    if (!chain || !selectedOutputId) return;
    chain.functionIds.forEach((fnId, i) => {
      const fn = topology.functions.find((f) => f.id === fnId);
      if (!fn) return;
      const { compiled, error } = compileExpression(fn.expression);
      if (error || !compiled) return;
      startSequence({
        id: `${SEQ_ID}-${i}`,
        expression: fn.expression,
        compiled,
        midiOutputId: selectedOutputId,
        midiChannel: previewChannel,
        bpm: currentBpm,
        domain: fn.xAxis.domain,
        looping,
        oneShotDuration: fn.oneShotDuration,
        velocity: fn.velocity,
        scale: fn.yAxis.scale,
        rootNote: fn.yAxis.rootNote,
      });
    });
    play();
  }, [chain, selectedOutputId, topology.functions, previewChannel, currentBpm, looping, play]);

  const stopAll = useCallback(() => {
    if (!chain) return;
    chain.functionIds.forEach((_, i) => stopSequence(`${SEQ_ID}-${i}`, selectedOutputId ?? undefined, previewChannel));
  }, [chain, selectedOutputId, previewChannel]);

  const handlePause = useCallback(() => { stopAll(); pause(); }, [stopAll, pause]);
  const handleStop = useCallback(() => { stopAll(); stop(); }, [stopAll, stop]);

  useEffect(() => () => {
    // cleanup all possible chain slot IDs
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

  return (
    <div className={styles.layout}>
      {/* Sidebar */}
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

      {/* Main */}
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

            <div className={styles.slotArea}>
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
                        <SortableFunctionSlot key={fnId + '-' + idx} fn={fn} chainId={chain.id} index={idx} />
                      );
                    })}
                    {chain.functionIds.length < 16 && (
                      <button className={styles.addSlotBtn} onClick={() => setShowPicker(true)} title="Add Function">
                        + Add
                      </button>
                    )}
                  </div>
                </SortableContext>
              </DndContext>
            </div>

            {chain.functionIds.length === 0 && (
              <div className={styles.hintMsg}>Drag functions here from the picker, or click "+ Add"</div>
            )}

            {/* Function picker modal */}
            {showPicker && (
              <div className={styles.pickerOverlay} onClick={() => setShowPicker(false)}>
                <div className={styles.picker} onClick={(e) => e.stopPropagation()}>
                  <h3 className={styles.pickerTitle}>Pick a Function</h3>
                  <div className={styles.pickerList}>
                    {topology.functions.map((fn) => (
                      <div
                        key={fn.id}
                        className={styles.pickerItem}
                        style={{ borderLeftColor: fn.color }}
                        onClick={() => { addFunctionToChain(chain.id, fn.id); setShowPicker(false); }}
                      >
                        <span className={styles.pickerName}>{fn.name}</span>
                        <span className={styles.pickerExpr}>{fn.expression}</span>
                      </div>
                    ))}
                    {topology.functions.length === 0 && (
                      <div className={styles.emptyMsg}>No functions defined. Go to Function view first.</div>
                    )}
                  </div>
                  <button className={styles.pickerClose} onClick={() => setShowPicker(false)}>Cancel</button>
                </div>
              </div>
            )}

            {/* Transport */}
            <div className={styles.transportBar}>
              <Transport onPlay={handlePlay} onPause={handlePause} onStop={handleStop} />
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
    </div>
  );
}
