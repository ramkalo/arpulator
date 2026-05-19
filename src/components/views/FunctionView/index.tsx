import { useState, useEffect, useCallback, useRef } from 'react';
import { useTopologyStore } from '../../../stores/topologyStore';
import { useMidiStore } from '../../../stores/midiStore';
import { useTransportStore } from '../../../stores/transportStore';
import { Graph } from '../../shared/Graph';
import { Transport } from '../../shared/Transport';
import { ScaleSelector } from '../../shared/ScaleSelector';
import { FunctionSlot } from '../../shared/FunctionSlot';
import { compileExpression } from '../../../engine/functionEval';
import { startSequence, stopSequence, updateSequenceExpression } from '../../../engine/arpEngine';
import type { NoteValue } from '../../../types';
import styles from './FunctionView.module.css';

const NOTE_VALUES: NoteValue[] = [
  'whole', 'half', 'quarter', 'eighth', 'sixteenth', 'thirty-second',
  'triplet-quarter', 'triplet-eighth', 'triplet-sixteenth',
];

const SEQ_ID = 'function-view';

export function FunctionView() {
  const { topology, activeFunctionId, setActiveFunctionId, updateFunction, addFunction, duplicateFunction, deleteFunction } = useTopologyStore();
  const { selectedOutputId } = useMidiStore();
  const { playing, currentBpm, looping, play, pause, stop, setPlayheadX, playheadX } = useTransportStore();

  const fn = topology.functions.find((f) => f.id === activeFunctionId) ?? topology.functions[0];
  const [expressionInput, setExpressionInput] = useState(fn?.expression ?? 'sin(x)');
  const [evalError, setEvalError] = useState<string | null>(null);

  // Track current playhead X per-component (updated by the engine callback)
  const playheadXRef = useRef<number>(fn?.xAxis.domain[0] ?? 0);

  useEffect(() => {
    if (fn) setExpressionInput(fn.expression);
  }, [fn?.id]);

  const handleExpressionCommit = useCallback(() => {
    if (!fn) return;
    const { error } = compileExpression(expressionInput);
    setEvalError(error);
    if (!error) updateFunction(fn.id, { expression: expressionInput });
  }, [fn, expressionInput, updateFunction]);

  const handleApply = useCallback(() => {
    if (!fn) return;
    const { compiled, error } = compileExpression(expressionInput);
    setEvalError(error);
    if (error || !compiled) return;
    updateFunction(fn.id, { expression: expressionInput });
    updateSequenceExpression(SEQ_ID, compiled);
  }, [fn, expressionInput, updateFunction]);

  const handlePlay = useCallback(() => {
    if (!fn || !selectedOutputId) return;
    const { compiled, error } = compileExpression(fn.expression);
    if (error || !compiled) return;

    startSequence({
      id: SEQ_ID,
      expression: fn.expression,
      compiled,
      midiOutputId: selectedOutputId,
      midiChannel: fn.midiChannel,
      bpm: currentBpm,
      domain: fn.xAxis.domain,
      looping,
      oneShotDuration: fn.oneShotDuration,
      velocity: fn.velocity,
      scale: fn.yAxis.scale,
      rootNote: fn.yAxis.rootNote,
      onXUpdate: (x) => {
        playheadXRef.current = x;
        setPlayheadX(x);
      },
    });
    play();
  }, [fn, selectedOutputId, currentBpm, looping, play, setPlayheadX]);

  const handlePause = useCallback(() => {
    stopSequence(SEQ_ID, selectedOutputId ?? undefined, fn?.midiChannel);
    pause();
  }, [fn, selectedOutputId, pause]);

  const handleStop = useCallback(() => {
    stopSequence(SEQ_ID, selectedOutputId ?? undefined, fn?.midiChannel);
    stop();
    playheadXRef.current = fn?.xAxis.domain[0] ?? 0;
  }, [fn, selectedOutputId, stop]);

  useEffect(() => () => { stopSequence(SEQ_ID); }, []);

  if (!fn) return <div className={styles.empty}>No functions. Click + to create one.</div>;

  return (
    <div className={styles.layout}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>Functions</span>
          <button className={styles.addBtn} onClick={addFunction} title="New Function" disabled={topology.functions.length >= 16}>+</button>
        </div>
        <div className={styles.fnList}>
          {topology.functions.map((f) => (
            <FunctionSlot key={f.id} fn={f} selected={f.id === fn.id} compact onSelect={() => { setActiveFunctionId(f.id); handleStop(); }} />
          ))}
        </div>
      </aside>

      {/* Main editor */}
      <main className={styles.main}>
        <div className={styles.topBar}>
          <input className={styles.nameInput} value={fn.name} onChange={(e) => updateFunction(fn.id, { name: e.target.value })} />
          <div className={styles.fnActions}>
            <button className={styles.actionBtn} onClick={() => duplicateFunction(fn.id)} title="Duplicate">⧉</button>
            <button className={styles.actionBtn} onClick={() => { deleteFunction(fn.id); handleStop(); }} title="Delete">🗑</button>
          </div>
        </div>

        <div className={styles.contentRow}>
          <div className={styles.graphWrap}>
            <Graph
              fn={fn}
              playheadX={playing ? playheadX : undefined}
              playing={playing}
              accentColor={fn.color}
              onDomainEndChange={(xEnd) => updateFunction(fn.id, { xAxis: { ...fn.xAxis, domain: [0, xEnd] } })}
            />
          </div>

          <div className={styles.controlsPanel}>
          <div className={styles.exprRow}>
          <label className={styles.label}>f(x) =</label>
          <input
            className={`${styles.exprInput} ${evalError ? styles.inputError : ''}`}
            value={expressionInput}
            onChange={(e) => setExpressionInput(e.target.value)}
            onBlur={handleExpressionCommit}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleApply(); } }}
            placeholder="sin(x) * 3"
            spellCheck={false}
          />
          {evalError && <span className={styles.error} title={evalError}>⚠</span>}
          <button
            className={styles.applyBtn}
            onClick={handleApply}
            title="Apply equation to engine"
          >Apply</button>
        </div>

        <div className={styles.settingsGrid}>
          {/* Y Axis */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Y Axis (Pitch)</h3>
            <div className={styles.field}>
              <label className={styles.label}>Scale</label>
              <ScaleSelector value={fn.yAxis.scale} onChange={(scale) => updateFunction(fn.id, { yAxis: { ...fn.yAxis, scale } })} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Root Note</label>
              <div className={styles.row}>
                <select className={styles.select} value={fn.yAxis.rootNote % 12}
                  onChange={(e) => {
                    const pc = parseInt(e.target.value);
                    const oct = Math.floor(fn.yAxis.rootNote / 12);
                    updateFunction(fn.id, { yAxis: { ...fn.yAxis, rootNote: oct * 12 + pc } });
                  }}
                >
                  {['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'].map((n, i) => (
                    <option key={n} value={i}>{n}</option>
                  ))}
                </select>
                <select className={styles.select} value={Math.floor(fn.yAxis.rootNote / 12) - 1}
                  onChange={(e) => {
                    const oct = parseInt(e.target.value) + 1;
                    const pc = fn.yAxis.rootNote % 12;
                    updateFunction(fn.id, { yAxis: { ...fn.yAxis, rootNote: oct * 12 + pc } });
                  }}
                >
                  {[1,2,3,4,5,6,7].map((o) => <option key={o} value={o}>Oct {o}</option>)}
                </select>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Y View Range</label>
              <div className={styles.row}>
                <input type="number" className={styles.numInput} step={1}
                  min={-127} max={0}
                  value={fn.yAxis.yViewRange[0]}
                  onChange={(e) => {
                    const val = Math.max(-127, Math.min(0, Math.round(+e.target.value)));
                    updateFunction(fn.id, { yAxis: { ...fn.yAxis, yViewRange: [val, fn.yAxis.yViewRange[1]] } });
                  }}
                />
                <span className={styles.label}>→</span>
                <input type="number" className={styles.numInput} step={1}
                  min={0} max={127}
                  value={fn.yAxis.yViewRange[1]}
                  onChange={(e) => {
                    const val = Math.max(0, Math.min(127, Math.round(+e.target.value)));
                    updateFunction(fn.id, { yAxis: { ...fn.yAxis, yViewRange: [fn.yAxis.yViewRange[0], val] } });
                  }}
                />
              </div>
            </div>
          </section>

          {/* X Axis */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>X Axis (Time)</h3>
            <div className={styles.field}>
              <label className={styles.label}>X Duration (sec)</label>
              <div className={styles.row}>
                <span className={styles.label}>0 →</span>
                <input type="number" className={styles.numInput} step={1}
                  min={1} max={60}
                  value={fn.xAxis.domain[1]}
                  onChange={(e) => {
                    const val = Math.max(1, Math.min(Math.round(+e.target.value), 60));
                    updateFunction(fn.id, { xAxis: { ...fn.xAxis, domain: [0, val] } });
                  }}
                />
              </div>
            </div>
          </section>

          {/* MIDI */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>MIDI</h3>
            <div className={styles.field}>
              <label className={styles.label}>Gate Duration</label>
              <select className={styles.select} value={fn.oneShotDuration}
                onChange={(e) => updateFunction(fn.id, { oneShotDuration: e.target.value as NoteValue })}
              >
                {NOTE_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Channel</label>
              <select className={styles.select} value={fn.midiChannel}
                onChange={(e) => updateFunction(fn.id, { midiChannel: +e.target.value })}
              >
                {Array.from({ length: 16 }, (_, i) => <option key={i + 1} value={i + 1}>Ch {i + 1}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Velocity</label>
              <input type="range" min={1} max={127} value={fn.velocity}
                onChange={(e) => updateFunction(fn.id, { velocity: +e.target.value })}
                className={styles.slider}
              />
              <span className={styles.sliderVal}>{fn.velocity}</span>
            </div>
          </section>
        </div>

        <div className={styles.transportBar}>
          <Transport onPlay={handlePlay} onPause={handlePause} onStop={handleStop} />
          {!selectedOutputId && <span className={styles.noOutputWarning}>Select a MIDI output in the header to play</span>}
        </div>
          </div>{/* controlsPanel */}
        </div>{/* contentRow */}
      </main>
    </div>
  );
}
