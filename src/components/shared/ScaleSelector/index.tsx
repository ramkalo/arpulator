import { useState } from 'react';
import { BUILT_IN_SCALES } from '../../../engine/scales';
import type { ScaleDefinition } from '../../../types';
import styles from './ScaleSelector.module.css';

interface ScaleSelectorProps {
  value: ScaleDefinition;
  onChange: (scale: ScaleDefinition) => void;
}

export function ScaleSelector({ value, onChange }: ScaleSelectorProps) {
  const [customMode, setCustomMode] = useState(false);
  const [customText, setCustomText] = useState('0,2,4,5,7,9,11');
  const [customName, setCustomName] = useState('Custom');

  const isBuiltIn = BUILT_IN_SCALES.some((s) => s.name === value.name);

  const handleSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    if (name === '__custom__') {
      setCustomMode(true);
      return;
    }
    setCustomMode(false);
    const scale = BUILT_IN_SCALES.find((s) => s.name === name);
    if (scale) onChange(scale);
  };

  const handleCustomApply = () => {
    try {
      const intervals = customText.split(',').map((n) => parseInt(n.trim(), 10));
      if (intervals.some(isNaN)) return;
      onChange({ name: customName, intervals });
    } catch {}
  };

  return (
    <div className={styles.wrapper}>
      <select
        className={styles.select}
        value={isBuiltIn ? value.name : '__custom__'}
        onChange={handleSelect}
      >
        {BUILT_IN_SCALES.map((s) => (
          <option key={s.name} value={s.name}>{s.name}</option>
        ))}
        <option value="__custom__">Custom…</option>
      </select>

      {(customMode || !isBuiltIn) && (
        <div className={styles.customRow}>
          <input
            className={styles.input}
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Name"
            style={{ width: 90 }}
          />
          <input
            className={styles.input}
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="0,2,4,5,7,9,11"
          />
          <button className={styles.applyBtn} onClick={handleCustomApply}>Apply</button>
        </div>
      )}

      <div className={styles.intervals}>
        {value.intervals.join(' · ')}
      </div>
    </div>
  );
}
