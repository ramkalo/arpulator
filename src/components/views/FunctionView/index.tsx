import { useState, useEffect, useCallback } from 'react';
import { useTopologyStore } from '../../../stores/topologyStore';
import { useMidiStore } from '../../../stores/midiStore';
import { useTransportStore } from '../../../stores/transportStore';
import { Graph } from '../../shared/Graph';
import { Transport } from '../../shared/Transport';
import { ScaleSelector } from '../../shared/ScaleSelector';
import { FunctionSlot } from '../../shared/FunctionSlot';
import { evaluateFunction } from '../../../engine/functionEval';
import { startSequence, stopSequence } from '../../../engine/arpEngine';
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
  const { playing, paused, currentBpm, looping, play, pause, stop, setPlayheadStep, playheadStep } = useTransportStore();

  const fn = topology.functions.find((f) => f.id === activeFunctionId) ?? topology.functions[0];
  const [expressionInput, setExpressionInput] = useState(fn?.expression ?? 'sin(x)');
  const [evalError, setEvalError] = useState<string | null>(null);

  // Keep expression input in sync when switching functions
  useEffect(() => {
    if (fn) setExpressionInput(fn.expression);
  }, [fn?.id]);

  const handleExpressionCommit = useCallback(() => {
    if (!fn) return;
    const result = evaluateFunction({ ...fn, expression: expressionInput });
    setEvalError(result.error);
    if (!result.error) {
      updateFunction(fn.id, { expression: expressionInput });
    }
  }, [fn, expressionInput, updateFunction]);

  const handlePlay = useCallback(() => {
    if (!fn || !selectedOutputId) return;
    const result = evaluateFunction(fn);
    if (result.error || result.notes.length === 0) return;
    startSequence({
      id: SEQ_ID,
      notes: result.notes,
      midiOutputId: selectedOutputId,
      midiChannel: fn.midiChannel,
      bpm: currentBpm,
      quantization: fn.xAxis.quantization,
      noteDuration: fn.noteDuration,
      looping,
      startStep: paused ? playheadStep : 0,
      onStep: (step) => setPlayheadStep(step),
    });
    play();
  }, [fn, selectedOutputId, currentBpm, looping, paused, playheadStep, play, setPlayheadStep]);

  const handlePause = useCallback(() => {
    stopSequence(SEQ_ID, selectedOutputId ?? undefined, fn?.midiChannel);
    pause();
  }, [fn, selectedOutputId, pause]);

  const handleStop = useCallback(() => {
    stopSequence(SEQ_ID, selectedOutputId ?? undefined, fn?.midiChannel);
    stop();
  }, [fn, selectedOutputId, stop]);

  // Stop when component unmounts
  useEffect(() => () => { stopSequence(SEQ_ID); }, []);

  if (!fn) return <div className={styles.empty}>No functions. Click + to create one.</div>;

  return (
    <div className={styles.layout}>
      {/* Sidebar — function list */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <span className={styles.sidebarTitle}>Functions</span>
          <button
            className={styles.addBtn}
            onClick={addFunction}
            title="New Function"
            disabled={topology.functions.length >= 16}
          >+</button>
        </div>
        <div className={styles.fnList}>
          {topology.functions.map((f) => (
            <FunctionSlot
              key={f.id}
              fn={f}
              selected={f.id === fn.id}
              compact
              onSelect={() => { setActiveFunctionId(f.id); handleStop(); }}
            />
          ))}
        </div>
      </aside>

      {/* Main editor */}
      <main className={styles.main}>
        <div className={styles.topBar}>
          <input
            className={styles.nameInput}
            value={fn.name}
            onChange={(e) => updateFunction(fn.id, { name: e.target.value })}
          />
          <div className={styles.fnActions}>
            <button className={styles.actionBtn} onClick={() => duplicateFunction(fn.id)} title="Duplicate">⧉</button>
            <button className={styles.actionBtn} onClick={() => { deleteFunction(fn.id); handleStop(); }} title="Delete">🗑</button>
          </div>
        </div>

        {/* Graph */}
        <div className={styles.graphWrap}>
          <Graph fn={fn} playheadStep={playing ? playheadStep : -1} playing={playing} accentColor={fn.color} />
        </div>

        {/* Expression */}
        <div className={styles.exprRow}>
          <label className={styles.label}>f(x) =</label>
          <input
            className={`${styles.exprInput} ${evalError ? styles.inputError : ''}`}
            value={expressionInput}
            onChange={(e) => setExpressionInput(e.target.value)}
            onBlur={handleExpressionCommit}
            onKeyDown={(e) => e.key === 'Enter' && handleExpressionCommit()}
            placeholder="sin(x) * 3"
            spellCheck={false}
          />
          {evalError && <span className={styles.error} title={evalError}>⚠</span>}
        </div>

        {/* Settings grid */}
        <div className={styles.settingsGrid}>
          {/* Y Axis */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Y Axis (Pitch)</h3>
            <div className={styles.field}>
              <label className={styles.label}>Scale</label>
              <ScaleSelector
                value={fn.yAxis.scale}
                onChange={(scale) => updateFunction(fn.id, { yAxis: { ...fn.yAxis, scale } })}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Root Note</label>
              <div className={styles.row}>
                <select
                  className={styles.select}
                  value={fn.yAxis.rootNote % 12}
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
                <select
                  className={styles.select}
                  value={Math.floor(fn.yAxis.rootNote / 12) - 1}
                  onChange={(e) => {
                    const oct = parseInt(e.target.value) + 1;
                    const pc = fn.yAxis.rootNote % 12;
                    updateFunction(fn.id, { yAxis: { ...fn.yAxis, rootNote: oct * 12 + pc } });
                  }}
                >
                  {[1,2,3,4,5,6,7].map((o) => (
                    <option key={o} value={o}>Oct {o}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Octave Range</label>
              <div className={styles.row}>
                <input type="number" className={styles.numInput} min={0} max={8}
                  value={fn.yAxis.octaveRange[0]}
                  onChange={(e) => updateFunction(fn.id, { yAxis: { ...fn.yAxis, octaveRange: [+e.target.value, fn.yAxis.octaveRange[1]] } })}
                />
                <span className={styles.label}>–</span>
                <input type="number" className={styles.numInput} min={0} max={8}
                  value={fn.yAxis.octaveRange[1]}
                  onChange={(e) => updateFunction(fn.id, { yAxis: { ...fn.yAxis, octaveRange: [fn.yAxis.octaveRange[0], +e.target.value] } })}
                />
              </div>
            </div>
          </section>

          {/* X Axis */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>X Axis (Time)</h3>
            <div className={styles.field}>
              <label className={styles.label}>Quantization</label>
              <select className={styles.select} value={fn.xAxis.quantization}
                onChange={(e) => updateFunction(fn.id, { xAxis: { ...fn.xAxis, quantization: e.target.value as NoteValue } })}
              >
                {NOTE_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Steps / Cycle</label>
              <input type="number" className={styles.numInput} min={1} max={64}
                value={fn.xAxis.stepsPerCycle}
                onChange={(e) => updateFunction(fn.id, { xAxis: { ...fn.xAxis, stepsPerCycle: +e.target.value } })}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>X Domain</label>
              <div className={styles.row}>
                <input type="number" className={styles.numInput}
                  value={fn.xAxis.domain[0]}
                  step={0.1}
                  onChange={(e) => updateFunction(fn.id, { xAxis: { ...fn.xAxis, domain: [+e.target.value, fn.xAxis.domain[1]] } })}
                />
                <span className={styles.label}>→</span>
                <input type="number" className={styles.numInput}
                  value={fn.xAxis.domain[1]}
                  step={0.1}
                  onChange={(e) => updateFunction(fn.id, { xAxis: { ...fn.xAxis, domain: [fn.xAxis.domain[0], +e.target.value] } })}
                />
              </div>
            </div>
          </section>

          {/* MIDI */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>MIDI</h3>
            <div className={styles.field}>
              <label className={styles.label}>Channel</label>
              <select className={styles.select} value={fn.midiChannel}
                onChange={(e) => updateFunction(fn.id, { midiChannel: +e.target.value })}
              >
                {Array.from({ length: 16 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>Ch {i + 1}</option>
                ))}
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
            <div className={styles.field}>
              <label className={styles.label}>Note Duration</label>
              <select className={styles.select} value={fn.noteDuration}
                onChange={(e) => updateFunction(fn.id, { noteDuration: e.target.value as NoteValue })}
              >
                {NOTE_VALUES.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </section>
        </div>

        {/* Transport */}
        <div className={styles.transportBar}>
          <Transport onPlay={handlePlay} onPause={handlePause} onStop={handleStop} />
          {!selectedOutputId && (
            <span className={styles.noOutputWarning}>Select a MIDI output in the header to play</span>
          )}
        </div>
      </main>
    </div>
  );
}
