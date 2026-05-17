import { useRef, useEffect, useCallback } from 'react';
import type { FunctionDef } from '../../../types';
import { evaluateFunction } from '../../../engine/functionEval';
import styles from './Graph.module.css';

interface GraphProps {
  fn: FunctionDef;
  playheadStep?: number;
  playing?: boolean;
  accentColor?: string;
}

export function Graph({ fn, playheadStep = -1, playing = false, accentColor = '#f59e0b' }: GraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  const draw = useCallback((playhead: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);

    const result = evaluateFunction(fn);
    const raw = result.rawValues;
    if (raw.length === 0) return;

    const yMin = Math.min(...raw);
    const yMax = Math.max(...raw);
    const yRange = yMax - yMin || 1;

    const padX = 20;
    const padY = 20;
    const plotW = W - padX * 2;
    const plotH = H - padY * 2;

    // Grid lines
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 1;
    const gridLines = 8;
    for (let i = 0; i <= gridLines; i++) {
      const y = padY + (i / gridLines) * plotH;
      ctx.beginPath();
      ctx.moveTo(padX, y);
      ctx.lineTo(W - padX, y);
      ctx.stroke();
    }
    for (let i = 0; i <= fn.xAxis.stepsPerCycle; i++) {
      const x = padX + (i / fn.xAxis.stepsPerCycle) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, padY);
      ctx.lineTo(x, H - padY);
      ctx.stroke();
    }

    // Curve
    ctx.beginPath();
    ctx.strokeStyle = accentColor + '80';
    ctx.lineWidth = 1.5;
    raw.forEach((y, i) => {
      const px = padX + (i / (raw.length - 1 || 1)) * plotW;
      const py = padY + plotH - ((y - yMin) / yRange) * plotH;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Note dots
    result.notes.forEach((note, i) => {
      const y = raw[i];
      const px = padX + (fn.xAxis.stepsPerCycle <= 1 ? 0 : i / (fn.xAxis.stepsPerCycle - 1)) * plotW;
      const py = padY + plotH - ((y - yMin) / yRange) * plotH;

      const isActive = i === playhead;
      ctx.beginPath();
      ctx.arc(px, py, isActive ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? '#ffffff' : accentColor;
      ctx.fill();

      // MIDI note label on active
      if (isActive) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(midiNoteToName(note.midiNote), px, py - 10);
      }
    });

    // Playhead
    if (playhead >= 0 && fn.xAxis.stepsPerCycle > 1) {
      const px = padX + (playhead / (fn.xAxis.stepsPerCycle - 1)) * plotW;
      ctx.beginPath();
      ctx.strokeStyle = '#ffffff40';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(px, padY);
      ctx.lineTo(px, H - padY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Error overlay
    if (result.error) {
      ctx.fillStyle = '#ef444480';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ef4444';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Expression error', W / 2, H / 2);
    }
  }, [fn, accentColor]);

  // Redraw when fn changes or not playing
  useEffect(() => {
    if (!playing) {
      draw(playheadStep);
    }
  }, [fn, playing, playheadStep, draw]);

  // Animation loop during playback
  useEffect(() => {
    if (!playing) return;
    let currentStep = playheadStep;

    const loop = () => {
      draw(currentStep);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, draw, playheadStep]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.canvas}
      width={600}
      height={300}
    />
  );
}

function midiNoteToName(midi: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  return names[midi % 12] + octave;
}
