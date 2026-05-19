import { useRef } from 'react';
import { useTopologyStore } from '../../../stores/topologyStore';
import { useTransportStore } from '../../../stores/transportStore';
import {
  exportFunctionAsMidi,
  exportChainAsMidi,
  exportManifoldAsMidi,
  downloadMidi,
  downloadJSON,
} from '../../../engine/midiExport';
import type { Topology } from '../../../types';
import styles from './TopologyView.module.css';

export function TopologyView() {
  const store = useTopologyStore();
  const { topology, exportTopologyJSON, loadTopology, newTopology, setTopologyName } = store;
  const { currentBpm } = useTransportStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportJSON = () => {
    downloadJSON(exportTopologyJSON(), `${topology.name.replace(/\s+/g, '_')}.arpulator.json`);
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as Topology;
        if (!parsed.id || !parsed.functions) throw new Error('Invalid topology file');
        loadTopology(parsed);
      } catch {
        alert('Failed to load topology: invalid file format.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportManifoldMidi = () => {
    const data = exportManifoldAsMidi(topology);
    downloadMidi(data, `${topology.name}_manifold.mid`);
  };

  return (
    <div className={styles.layout}>
      <div className={styles.header}>
        <input
          className={styles.nameInput}
          value={topology.name}
          onChange={(e) => setTopologyName(e.target.value)}
        />
        <div className={styles.meta}>
          <span className={styles.metaItem}>Created: {new Date(topology.createdAt).toLocaleDateString()}</span>
          <span className={styles.metaItem}>{topology.functions.length} functions</span>
          <span className={styles.metaItem}>{topology.chains.length} chains</span>
        </div>
      </div>

      {/* Topology actions */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Topology</h3>
        <div className={styles.btnRow}>
          <button className={styles.btn} onClick={newTopology}>New Topology</button>
          <button className={styles.btn} onClick={handleExportJSON}>Export JSON</button>
          <button className={styles.btn} onClick={() => fileInputRef.current?.click()}>Import JSON</button>
          <input ref={fileInputRef} type="file" accept=".json,.arpulator.json" style={{ display: 'none' }} onChange={handleImportJSON} />
          <button className={`${styles.btn} ${styles.btnAccent}`} onClick={handleExportManifoldMidi}>Export Manifold as MIDI</button>
        </div>
      </section>

      {/* Functions list */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Functions ({topology.functions.length}/16)</h3>
        <div className={styles.itemList}>
          {topology.functions.map((fn) => (
            <div key={fn.id} className={styles.item} style={{ borderLeftColor: fn.color }}>
              <div className={styles.itemInfo}>
                <span className={styles.itemName}>{fn.name}</span>
                <span className={styles.itemDetail}>{fn.expression} · {fn.oneShotDuration}</span>
              </div>
              <button
                className={styles.exportBtn}
                onClick={() => {
                  const data = exportFunctionAsMidi(fn, currentBpm);
                  downloadMidi(data, `${fn.name.replace(/\s+/g, '_')}.mid`);
                }}
              >
                Export MIDI
              </button>
            </div>
          ))}
          {topology.functions.length === 0 && <div className={styles.empty}>No functions defined</div>}
        </div>
      </section>

      {/* Chains list */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Chains ({topology.chains.length}/16)</h3>
        <div className={styles.itemList}>
          {topology.chains.map((chain) => (
            <div key={chain.id} className={styles.item}>
              <div className={styles.itemInfo}>
                <span className={styles.itemName}>{chain.name}</span>
                <span className={styles.itemDetail}>{chain.functionIds.length} functions</span>
              </div>
              <button
                className={styles.exportBtn}
                onClick={() => {
                  const data = exportChainAsMidi(chain, topology.functions, currentBpm);
                  downloadMidi(data, `${chain.name.replace(/\s+/g, '_')}.mid`);
                }}
              >
                Export MIDI
              </button>
            </div>
          ))}
          {topology.chains.length === 0 && <div className={styles.empty}>No chains defined</div>}
        </div>
      </section>
    </div>
  );
}
