import { useCallback, useEffect, useState } from 'react';
import { useTopologyStore } from '../../../stores/topologyStore';
import { useMidiStore } from '../../../stores/midiStore';
import { useTransportStore } from '../../../stores/transportStore';
import { Transport } from '../../shared/Transport';
import { compileExpression } from '../../../engine/functionEval';
import { startSequence, stopAllSequences } from '../../../engine/arpEngine';
import styles from './ManifoldView.module.css';

export function ManifoldView() {
  const { topology, setManifoldRow, clearManifoldRow, setGlobalTempo } = useTopologyStore();
  const { selectedOutputId } = useMidiStore();
  const { playing, currentBpm, looping, play, pause, stop } = useTransportStore();

  const [dragOver, setDragOver] = useState<number | null>(null);

  const startRowSequence = useCallback((row: typeof topology.manifold[0], seqIdSuffix: string) => {
    if (!selectedOutputId) return;
    const startFn = (fn: typeof topology.functions[0], seqId: string) => {
      const { compiled, error } = compileExpression(fn.expression);
      if (error || !compiled) return;
      startSequence({
        id: seqId,
        expression: fn.expression,
        compiled,
        midiOutputId: selectedOutputId,
        midiChannel: row.midiChannel,
        bpm: currentBpm,
        domain: fn.xAxis.domain,
        looping,
        oneShotDuration: fn.oneShotDuration,
        velocity: fn.velocity,
        scale: fn.yAxis.scale,
        rootNote: fn.yAxis.rootNote,
      });
    };

    if (row.itemType === 'function') {
      const fn = topology.functions.find((f) => f.id === row.itemId);
      if (fn) startFn(fn, `manifold-${seqIdSuffix}`);
    } else if (row.itemType === 'chain') {
      const chain = topology.chains.find((c) => c.id === row.itemId);
      if (chain) {
        chain.functionIds.forEach((fnId, i) => {
          const fn = topology.functions.find((f) => f.id === fnId);
          if (fn) startFn(fn, `manifold-${seqIdSuffix}-${i}`);
        });
      }
    }
  }, [topology, selectedOutputId, currentBpm, looping]);

  const handlePlay = useCallback(() => {
    if (!selectedOutputId) return;
    for (const row of topology.manifold) {
      if (row.itemType === 'empty' || !row.itemId) continue;
      startRowSequence(row, `ch${row.midiChannel}`);
    }
    play();
  }, [topology, selectedOutputId, startRowSequence, play]);

  const handlePause = useCallback(() => {
    stopAllSequences(selectedOutputId ?? undefined);
    pause();
  }, [selectedOutputId, pause]);

  const handleStop = useCallback(() => {
    stopAllSequences(selectedOutputId ?? undefined);
    stop();
  }, [selectedOutputId, stop]);

  useEffect(() => () => { stopAllSequences(); }, []);

  const handleDrop = (channel: number, e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
    const data = e.dataTransfer.getData('application/arpulator');
    if (!data) return;
    const { type, id } = JSON.parse(data) as { type: 'function' | 'chain'; id: string };
    setManifoldRow(channel, type, id);
  };

  return (
    <div className={styles.layout}>
      <div className={styles.header}>
        <div className={styles.bpmRow}>
          <label className={styles.label}>BPM</label>
          <input
            type="number"
            className={styles.bpmInput}
            min={20} max={300}
            value={Math.round(currentBpm)}
            onChange={(e) => { setGlobalTempo(+e.target.value); useTransportStore.getState().setBpm(+e.target.value); }}
          />
        </div>
        <Transport onPlay={handlePlay} onPause={handlePause} onStop={handleStop} showLoop />
        {!selectedOutputId && <span className={styles.warn}>Select MIDI output in header</span>}
      </div>

      <div className={styles.palette}>
        <div className={styles.paletteSection}>
          <span className={styles.paletteLabel}>Functions — drag to a row</span>
          <div className={styles.paletteItems}>
            {topology.functions.map((fn) => (
              <div
                key={fn.id}
                className={styles.palettePill}
                style={{ borderColor: fn.color }}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('application/arpulator', JSON.stringify({ type: 'function', id: fn.id }))}
                title={fn.expression}
              >
                {fn.name}
              </div>
            ))}
          </div>
        </div>
        <div className={styles.paletteSection}>
          <span className={styles.paletteLabel}>Chains — drag to a row</span>
          <div className={styles.paletteItems}>
            {topology.chains.map((chain) => (
              <div
                key={chain.id}
                className={styles.palettePill}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('application/arpulator', JSON.stringify({ type: 'chain', id: chain.id }))}
              >
                {chain.name}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.rows}>
        {topology.manifold.map((row) => {
          const fn = row.itemType === 'function' ? topology.functions.find((f) => f.id === row.itemId) : null;
          const chain = row.itemType === 'chain' ? topology.chains.find((c) => c.id === row.itemId) : null;
          const isActive = playing && row.itemType !== 'empty';

          return (
            <div
              key={row.midiChannel}
              className={`${styles.row} ${dragOver === row.midiChannel ? styles.dragOver : ''} ${isActive ? styles.rowActive : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(row.midiChannel); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => handleDrop(row.midiChannel, e)}
            >
              <div className={styles.chLabel}>Ch {row.midiChannel}</div>

              <div className={styles.rowContent}>
                {row.itemType === 'empty' && (
                  <div className={styles.emptyDrop}>drop function or chain here</div>
                )}
                {fn && (
                  <div className={styles.assignedItem} style={{ borderColor: fn.color }}>
                    <span className={styles.itemType}>FN</span>
                    <span className={styles.itemName}>{fn.name}</span>
                    <span className={styles.itemExpr}>{fn.expression}</span>
                  </div>
                )}
                {chain && (
                  <div className={styles.assignedItem}>
                    <span className={styles.itemType}>CH</span>
                    <span className={styles.itemName}>{chain.name}</span>
                    <span className={styles.itemExpr}>{chain.functionIds.length} functions</span>
                  </div>
                )}
              </div>

              {row.itemType !== 'empty' && (
                <button className={styles.clearBtn} onClick={() => clearManifoldRow(row.midiChannel)} title="Clear row">×</button>
              )}

              {isActive && <div className={styles.activeLed} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
