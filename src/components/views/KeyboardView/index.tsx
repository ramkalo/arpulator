import React, { useState } from 'react';
import { useKeyboard } from '../../../hooks/useKeyboard';
import { useMidiStore } from '../../../stores/midiStore';
import styles from './KeyboardView.module.css';

const WHITE_NOTES = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
// White key: 44px wide, 2px gap → 46px step. Black key: 28px wide (half = 14px).
// left = midpoint between adjacent white key centers, minus half black key width.
const BLACK_KEY_POSITIONS = [
  { semitone: 1,  left: 31  }, // C#
  { semitone: 3,  left: 77  }, // D#
  { semitone: 6,  left: 169 }, // F#
  { semitone: 8,  left: 215 }, // G#
  { semitone: 10, left: 261 }, // A#
];

const QWERTY_WHITE = ['A', 'S', 'D', 'F', 'G', 'H', 'J'];
const QWERTY_BLACK_KEYS = ['W', 'E', 'T', 'Y', 'U'];

function Key({
  semitone,
  isBlack,
  qwerty,
  isActive,
  baseOctave,
  style,
}: {
  semitone: number;
  isBlack: boolean;
  qwerty: string;
  isActive: boolean;
  baseOctave: number;
  style?: React.CSSProperties;
}) {
  const midiNote = baseOctave * 12 + semitone;
  return (
    <div
      className={`${isBlack ? styles.blackKey : styles.whiteKey} ${isActive ? styles.keyActive : ''}`}
      style={style}
      title={`MIDI ${midiNote}`}
    >
      <span className={styles.keyLabel}>{qwerty}</span>
    </div>
  );
}

export function KeyboardView() {
  const { selectedOutputId, outputs, setSelectedOutputId } = useMidiStore();
  const [midiChannel, setMidiChannel] = useState(1);
  const [enabled, setEnabled] = useState(true);
  const { octave, activeNotes } = useKeyboard(enabled, selectedOutputId, midiChannel);

  return (
    <div className={styles.layout}>
      <div className={styles.controls}>
        <div className={styles.controlRow}>
          <label className={styles.label}>MIDI Output</label>
          <select className={styles.select} value={selectedOutputId ?? ''} onChange={(e) => setSelectedOutputId(e.target.value || null)}>
            <option value="">— none —</option>
            {outputs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className={styles.controlRow}>
          <label className={styles.label}>Channel</label>
          <select className={styles.select} value={midiChannel} onChange={(e) => setMidiChannel(+e.target.value)}>
            {Array.from({ length: 16 }, (_, i) => <option key={i + 1} value={i + 1}>Ch {i + 1}</option>)}
          </select>
        </div>
        <div className={styles.controlRow}>
          <label className={styles.label}>Keyboard Mode</label>
          <button
            className={`${styles.toggleBtn} ${enabled ? styles.on : ''}`}
            onClick={() => setEnabled((v) => !v)}
          >
            {enabled ? 'ON' : 'OFF'}
          </button>
        </div>
        <div className={styles.octaveRow}>
          <span className={styles.label}>Octave</span>
          <span className={styles.octaveDisplay}>{octave}</span>
          <span className={styles.hint}>[Z] ↓  [X] ↑</span>
        </div>
      </div>

      <div className={styles.pianoWrap}>
        {[0, 1].map((relOct) => {
          const baseOctave = octave + relOct;
          return (
            <div key={relOct} className={styles.octaveGroup}>
              <div className={styles.octaveLabel}>Oct {baseOctave}</div>
              <div className={styles.keyGroup}>
                {/* White keys */}
                <div className={styles.whiteKeys}>
                  {WHITE_NOTES.map((semitone, i) => {
                    const midi = baseOctave * 12 + semitone;
                    return (
                      <Key
                        key={i}
                        semitone={semitone}
                        isBlack={false}
                        qwerty={relOct === 0 ? QWERTY_WHITE[i] : (i < 2 ? ['K', 'L'][i] : '')}
                        isActive={activeNotes.has(midi)}
                        baseOctave={baseOctave}
                      />
                    );
                  })}
                </div>
                {/* Black keys */}
                <div className={styles.blackKeys}>
                  {BLACK_KEY_POSITIONS.map(({ semitone, left }, i) => {
                    const midi = baseOctave * 12 + semitone;
                    return (
                      <Key
                        key={i}
                        semitone={semitone}
                        isBlack
                        style={{ left }}
                        qwerty={relOct === 0 ? QWERTY_BLACK_KEYS[i] : (i === 0 ? 'O' : '')}
                        isActive={activeNotes.has(midi)}
                        baseOctave={baseOctave}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.legend}>
        <h3 className={styles.legendTitle}>Key Map</h3>
        <div className={styles.legendGrid}>
          <div><kbd>A</kbd>C  <kbd>W</kbd>C#</div>
          <div><kbd>S</kbd>D  <kbd>E</kbd>D#</div>
          <div><kbd>D</kbd>E</div>
          <div><kbd>F</kbd>F  <kbd>T</kbd>F#</div>
          <div><kbd>G</kbd>G  <kbd>Y</kbd>G#</div>
          <div><kbd>H</kbd>A  <kbd>U</kbd>A#</div>
          <div><kbd>J</kbd>B</div>
          <div><kbd>K</kbd>C'  <kbd>O</kbd>C#'</div>
          <div><kbd>L</kbd>D'</div>
          <div><kbd>Z</kbd>Oct↓  <kbd>X</kbd>Oct↑</div>
        </div>
      </div>
    </div>
  );
}
