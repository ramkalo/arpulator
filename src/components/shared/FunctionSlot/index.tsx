import type { FunctionDef } from '../../../types';
import styles from './FunctionSlot.module.css';

interface FunctionSlotProps {
  fn: FunctionDef;
  onSelect?: () => void;
  onRemove?: () => void;
  selected?: boolean;
  compact?: boolean;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

export function FunctionSlot({ fn, onSelect, onRemove, selected, compact, dragHandleProps }: FunctionSlotProps) {
  return (
    <div
      className={`${styles.slot} ${selected ? styles.selected : ''} ${compact ? styles.compact : ''}`}
      style={{ borderColor: fn.color }}
      onClick={onSelect}
    >
      {dragHandleProps && (
        <div className={styles.handle} {...dragHandleProps} title="Drag to reorder">
          ⠿
        </div>
      )}

      <div className={styles.colorBar} style={{ background: fn.color }} />

      <div className={styles.info}>
        <div className={styles.name}>{fn.name}</div>
        {!compact && (
          <div className={styles.expr}>{fn.expression}</div>
        )}
      </div>

      {onRemove && (
        <button
          className={styles.removeBtn}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          aria-label={`Remove ${fn.name}`}
          title="Remove"
        >
          ×
        </button>
      )}
    </div>
  );
}
