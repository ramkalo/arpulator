import { useCallback, useEffect, useState, useRef } from 'react';
import { useTopologyStore } from '../../../stores/topologyStore';
import { useMidiStore } from '../../../stores/midiStore';
import { useTransportStore } from '../../../stores/transportStore';
import { Transport } from '../../shared/Transport';
import { compileExpression } from '../../../engine/functionEval';
import { startSequence, stopAllSequences } from '../../../engine/arpEngine';
import { getMidiOutput, sendAllNotesOff } from '../../../engine/midiEngine';
import styles from './ManifoldView.module.css';

export function ManifoldView() {
  const { topology, setManifoldRow, clearManifoldRow, updateManifoldRow, setGlobalTempo } = useTopologyStore();
  const { selectedOutputId, outputs } = useMidiStore();
  const { currentBpm, looping } = useTransportStore();
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const manifoldLoopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getRowOutputId = useCallback((row: typeof topology.manifold[0]) =>
    row.outputDeviceId ?? selectedOutputId, [selectedOutputId]);

  const getActiveOutputIds = useCallback(() => {
    const ids = new Set<string>();
    for (const row of topology.manifold) {
      if (row.itemType === 'empty') continue;
      const id = row.outputDeviceId ?? selectedOutputId;
      if (id) ids.add(id);
    }
    return [...ids];
  }, [topology.manifold, selectedOutputId]);

  const startRowSequence = useCallback((row: typeof topology.manifold[0], seqIdSuffix: string) => {
    const outputId = getRowOutputId(row);
    if (!outputId) return;
    const startFn = (fn: typeof topology.functions[0], seqId: string) => {
      const { compiled, error } = compileExpression(fn.expression);
      if (error || !compiled) return;
      startSequence({
        id: seqId,
        expression: fn.expression,
        compiled,
        midiOutputId: outputId,
        midiChannel: row.outputChannel,
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
  }, [topology, getRowOutputId, currentBpm, looping]);

  const handlePlay = useCallback(() => {
    if (!selectedOutputId && getActiveOutputIds().length === 0) return;
    if (manifoldLoopTimerRef.current) clearTimeout(manifoldLoopTimerRef.current);
    for (const row of topology.manifold) {
      if (row.itemType === 'empty' || !row.itemId) continue;
      startRowSequence(row, `ch${row.midiChannel}`);
    }
    setPlaying(true);
    setPaused(false);
  }, [topology, selectedOutputId, startRowSequence, getActiveOutputIds]);

  const stopAndSilence = useCallback(() => {
    stopAllSequences();
    for (const id of getActiveOutputIds()) {
      const output = getMidiOutput(id);
      if (output) sendAllNotesOff(output);
    }
  }, [getActiveOutputIds]);

  const handlePause = useCallback(() => {
    if (manifoldLoopTimerRef.current) { clearTimeout(manifoldLoopTimerRef.current); manifoldLoopTimerRef.current = null; }
    stopAndSilence();
    setPlaying(false);
    setPaused(true);
  }, [stopAndSilence]);

  const handleStop = useCallback(() => {
    if (manifoldLoopTimerRef.current) { clearTimeout(manifoldLoopTimerRef.current); manifoldLoopTimerRef.current = null; }
    stopAndSilence();
    setPlaying(false);
    setPaused(false);
  }, [stopAndSilence]);

  useEffect(() => () => {
    if (manifoldLoopTimerRef.current) clearTimeout(manifoldLoopTimerRef.current);
    stopAllSequences();
  }, []);

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
        <Transport playing={playing} paused={paused} onPlay={handlePlay} onPause={handlePause} onStop={handleStop} showLoop />
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
              <div className={styles.rowControls}>
                <select
                  className={styles.rowSelect}
                  value={row.outputDeviceId ?? ''}
                  onChange={(e) => updateManifoldRow(row.midiChannel, { outputDeviceId: e.target.value || null })}
                  title="MIDI output device"
                >
                  <option value="">Global</option>
                  {outputs.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
                <select
                  className={styles.rowSelect}
                  value={row.outputChannel}
                  onChange={(e) => updateManifoldRow(row.midiChannel, { outputChannel: +e.target.value })}
                  title="MIDI channel"
                >
                  {Array.from({ length: 16 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>Ch {i + 1}</option>
                  ))}
                </select>
              </div>

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
