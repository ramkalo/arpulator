import { useMidiStore } from '../../../stores/midiStore';
import { useTransportStore } from '../../../stores/transportStore';
import { refreshDevices } from '../../../engine/midiEngine';
import styles from './MidiStatus.module.css';

export function MidiStatus() {
  const { supported, accessGranted, inputs, outputs, selectedOutputId, selectedInputId, setSelectedOutputId, setSelectedInputId } = useMidiStore();
  const { externalClockActive, currentBpm } = useTransportStore();

  if (!supported) {
    return (
      <div className={`${styles.banner} ${styles.warning}`}>
        ⚠ Web MIDI API not supported in this browser — MIDI features disabled. Use Chrome or Edge for full functionality.
      </div>
    );
  }

  if (!accessGranted) {
    return (
      <div className={`${styles.banner} ${styles.info}`}>
        Requesting MIDI access…
      </div>
    );
  }

  return (
    <div className={styles.status}>
      <div className={styles.deviceRow}>
        <label className={styles.label}>OUT</label>
        <select
          className={styles.select}
          value={selectedOutputId ?? ''}
          onChange={(e) => setSelectedOutputId(e.target.value || null)}
        >
          <option value="">— no output —</option>
          {outputs.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>

        <label className={styles.label}>IN</label>
        <select
          className={styles.select}
          value={selectedInputId ?? ''}
          onChange={(e) => setSelectedInputId(e.target.value || null)}
        >
          <option value="">— no input —</option>
          {inputs.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>

        {externalClockActive && (
          <span className={styles.clockBadge}>EXT CLOCK {currentBpm} BPM</span>
        )}

        <button
          className={styles.refreshBtn}
          onClick={() => {
            const { inputs, outputs } = refreshDevices();
            useMidiStore.getState().setDevices(inputs, outputs);
          }}
          title="Refresh MIDI device list"
          aria-label="Refresh MIDI devices"
        >
          ↺
        </button>

        <span className={`${styles.dot} ${outputs.length > 0 ? styles.connected : styles.disconnected}`} title={outputs.length > 0 ? 'MIDI connected' : 'No MIDI devices'} />
      </div>
    </div>
  );
}
