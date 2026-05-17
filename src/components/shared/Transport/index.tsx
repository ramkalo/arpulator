import { useTransportStore } from '../../../stores/transportStore';
import styles from './Transport.module.css';

interface TransportProps {
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  showLoop?: boolean;
}

export function Transport({ onPlay, onPause, onStop, showLoop = true }: TransportProps) {
  const { playing, paused, looping, toggleLoop } = useTransportStore();

  return (
    <div className={styles.transport}>
      <button
        className={`${styles.btn} ${playing ? styles.active : ''}`}
        onClick={playing ? onPause : onPlay}
        aria-label={playing ? 'Pause' : 'Play'}
        title={playing ? 'Pause' : 'Play'}
      >
        {playing ? '⏸' : '▶'}
      </button>

      <button
        className={styles.btn}
        onClick={onStop}
        aria-label="Stop"
        title="Stop"
        disabled={!playing && !paused}
      >
        ⏹
      </button>

      {showLoop && (
        <button
          className={`${styles.btn} ${looping ? styles.active : ''}`}
          onClick={toggleLoop}
          aria-label="Toggle Loop"
          title={looping ? 'Loop On' : 'Loop Off'}
        >
          ⟳
        </button>
      )}
    </div>
  );
}
