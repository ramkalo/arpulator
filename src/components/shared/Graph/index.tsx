import { useRef, useEffect, useCallback, useState } from 'react';
import type { FunctionDef } from '../../../types';
import { sampleFunction, compileExpression, findCrossings } from '../../../engine/functionEval';
import styles from './Graph.module.css';

interface GraphProps {
  fn: FunctionDef;
  playheadX?: number;
  playing?: boolean;
  accentColor?: string;
  onDomainEndChange?: (xEnd: number) => void;
}

const GRAPH_SAMPLES = 400;
const PAD_LEFT = 32;
const PAD_RIGHT = 12;
const PAD_Y = 12;

export function Graph({ fn, playheadX, playing = false, accentColor = '#f59e0b', onDomainEndChange }: GraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const dragRef = useRef<{ active: boolean; lastX: number; lastY: number }>({
    active: false, lastX: 0, lastY: 0,
  });
  const domainDragRef = useRef(false);
  // Always-current draw reference so the ResizeObserver can call it without a stale closure
  const drawRef = useRef<(x: number | undefined) => void>(() => {});
  // Refs so event handlers always see current values without stale closures
  const viewRef = useRef({ xMin: 0, xMax: 1, yLo: -8, yHi: 8 });
  const fnRef = useRef(fn);
  const onDomainEndChangeRef = useRef(onDomainEndChange);
  fnRef.current = fn;
  onDomainEndChangeRef.current = onDomainEndChange;

  const [view, setView] = useState(() => ({
    xMin: fn.xAxis.domain[0],
    xMax: fn.xAxis.domain[1] + 5,
    yLo:  Math.max(-127, fn.yAxis.yViewRange[0]),
    yHi:  Math.min(127,  fn.yAxis.yViewRange[1]),
  }));

  // View extends 5 units past the domain end so the user can see what they're cutting off
  const maxX = fn.xAxis.domain[1] + 5;
  // Ref so wheel/drag callbacks always see the current value without re-creating
  const maxXRef = useRef(maxX);
  maxXRef.current = maxX;
  viewRef.current = view;

  // Reset view when switching functions
  useEffect(() => {
    setView({
      xMin: fn.xAxis.domain[0],
      xMax: fn.xAxis.domain[1] + 5,
      yLo:  Math.max(-127, fn.yAxis.yViewRange[0]),
      yHi:  Math.min(127,  fn.yAxis.yViewRange[1]),
    });
  }, [fn.id]);

  const draw = useCallback((currentX: number | undefined) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);

    const { xMin, xMax, yLo, yHi } = view;
    const xRange = xMax - xMin || 1;
    const yRange = yHi - yLo || 1;

    const plotW = W - PAD_LEFT - PAD_RIGHT;
    const plotH = H - PAD_Y * 2;

    const toCanvasX = (x: number) => PAD_LEFT + ((x - xMin) / xRange) * plotW;
    const toCanvasY = (y: number) => PAD_Y + plotH - ((y - yLo) / yRange) * plotH;

    // Integer Y grid lines and labels
    const intLo = Math.ceil(yLo);
    const intHi = Math.floor(yHi);
    for (let n = intLo; n <= intHi; n++) {
      const cy = toCanvasY(n);
      ctx.strokeStyle = n === 0 ? '#374151' : '#1a2030';
      ctx.lineWidth = n === 0 ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(PAD_LEFT, cy);
      ctx.lineTo(W - PAD_RIGHT, cy);
      ctx.stroke();

      ctx.fillStyle = n === 0 ? '#6b7280' : '#374151';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(String(n), PAD_LEFT - 4, cy + 3);
    }

    // X-axis tick marks
    const xRange_ = xMax - xMin;
    const xTickStep = xRange_ <= 10 ? 1 : xRange_ <= 50 ? 5 : Math.ceil(xRange_ / 10);
    const xTickStart = Math.ceil(xMin / xTickStep) * xTickStep;
    ctx.strokeStyle = '#1a2030';
    ctx.lineWidth = 1;
    for (let tx = xTickStart; tx <= xMax; tx += xTickStep) {
      const cx = toCanvasX(tx);
      ctx.beginPath();
      ctx.moveTo(cx, PAD_Y);
      ctx.lineTo(cx, H - PAD_Y);
      ctx.stroke();
    }

    // Compile and sample — always sample across the full fn domain, not just view
    const { compiled, error } = compileExpression(fn.expression);
    if (error || !compiled) {
      ctx.fillStyle = '#ef444480';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ef4444';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Expression error', W / 2, H / 2);
      return;
    }

    const samples = sampleFunction(compiled, xMin, xMax, GRAPH_SAMPLES);

    // Draw curve
    ctx.beginPath();
    ctx.strokeStyle = accentColor + '80';
    ctx.lineWidth = 1.5;
    let penDown = false;
    for (const pt of samples) {
      if (!isFinite(pt.y)) { penDown = false; continue; }
      const cx = toCanvasX(pt.x);
      const cy = toCanvasY(pt.y);
      if (!penDown) { ctx.moveTo(cx, cy); penDown = true; }
      else ctx.lineTo(cx, cy);
    }
    ctx.stroke();

    // Dark overlay for inactive region past domain end
    const domainEnd = fn.xAxis.domain[1];
    const domainEndCx = toCanvasX(domainEnd);
    if (domainEndCx < W - PAD_RIGHT) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.fillRect(domainEndCx, PAD_Y, W - PAD_RIGHT - domainEndCx, plotH);
    }

    // Crossing dots — clipped to active domain only
    const crossingEvents = findCrossings(compiled, xMin, Math.min(xMax, domainEnd), GRAPH_SAMPLES);
    const drawnDots = new Set<string>();
    for (const ev of crossingEvents) {
      const crossedInt = Math.max(ev.fromDegree, ev.toDegree);
      const cx = toCanvasX(ev.x);
      const cy = toCanvasY(crossedInt);
      const key = `${Math.round(cx)},${Math.round(cy)}`;
      if (drawnDots.has(key)) continue;
      drawnDots.add(key);
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = accentColor;
      ctx.fill();
    }

    // Playhead vertical line
    if (currentX !== undefined) {
      const cx = toCanvasX(currentX);
      if (cx >= PAD_LEFT && cx <= W - PAD_RIGHT) {
        ctx.beginPath();
        ctx.strokeStyle = '#ffffff50';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.moveTo(cx, PAD_Y);
        ctx.lineTo(cx, H - PAD_Y);
        ctx.stroke();
        ctx.setLineDash([]);

        try {
          const curY = compiled.evaluate({ x: currentX });
          if (isFinite(curY)) {
            const cy = toCanvasY(curY);
            ctx.beginPath();
            ctx.arc(cx, cy, 5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = '10px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(curY.toFixed(2), cx + 8, cy + 4);
          }
        } catch { /* ignore */ }
      }
    }

    // Domain end marker — draggable vertical boundary
    const domCx = toCanvasX(domainEnd);
    if (domCx >= PAD_LEFT && domCx <= W - PAD_RIGHT) {
      ctx.strokeStyle = accentColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(domCx, PAD_Y);
      ctx.lineTo(domCx, H - PAD_Y);
      ctx.stroke();
      // Triangle handle at top
      ctx.fillStyle = accentColor;
      ctx.beginPath();
      ctx.moveTo(domCx - 5, PAD_Y);
      ctx.lineTo(domCx + 5, PAD_Y);
      ctx.lineTo(domCx, PAD_Y + 9);
      ctx.closePath();
      ctx.fill();
      // X value label
      ctx.fillStyle = accentColor;
      ctx.font = '9px monospace';
      ctx.textAlign = domCx > W - PAD_RIGHT - 30 ? 'right' : 'left';
      ctx.fillText(String(domainEnd), domCx + (domCx > W - PAD_RIGHT - 30 ? -6 : 6), PAD_Y + 20);
    }
  }, [fn, accentColor, view]);

  drawRef.current = draw;

  // Keep canvas pixel dimensions in sync with its container
  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (!wrapper || !canvas) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (!width || !height) return;
      canvas.width = Math.round(width);
      canvas.height = Math.round(height);
      drawRef.current(undefined);
    });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!playing) draw(playheadX);
  }, [fn, playing, playheadX, draw]);

  useEffect(() => {
    if (!playing) return;
    const loop = () => {
      draw(playheadX);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing, draw, playheadX]);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;
    const plotW = canvas.width - PAD_LEFT - PAD_RIGHT;
    const plotH = canvas.height - PAD_Y * 2;
    const mx = maxXRef.current;

    setView(v => {
      const dx = v.xMin + ((cx - PAD_LEFT) / plotW) * (v.xMax - v.xMin);
      const dy = v.yLo + (1 - (cy - PAD_Y) / plotH) * (v.yHi - v.yLo);
      const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      const newXMin = Math.max(0, dx - (dx - v.xMin) * factor);
      const newXMax = Math.min(dx + (v.xMax - dx) * factor, mx);
      const newYLo  = Math.max(-127, dy - (dy - v.yLo) * factor);
      const newYHi  = Math.min(127,  dy + (v.yHi - dy) * factor);
      return { xMin: newXMin, xMax: newXMax, yLo: newYLo, yHi: newYHi };
    });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const cx = (e.clientX - rect.left) * scaleX;
    const v = viewRef.current;
    const plotW = canvas.width - PAD_LEFT - PAD_RIGHT;
    const xRange = v.xMax - v.xMin || 1;
    const domainEnd = fnRef.current.xAxis.domain[1];
    const domCx = PAD_LEFT + ((domainEnd - v.xMin) / xRange) * plotW;

    if (Math.abs(cx - domCx) <= 8) {
      domainDragRef.current = true;
      canvas.style.cursor = 'col-resize';
      return;
    }
    dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY };
    canvas.style.cursor = 'grabbing';
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const plotW = canvas.width - PAD_LEFT - PAD_RIGHT;
    const plotH = canvas.height - PAD_Y * 2;
    const cx = (e.clientX - rect.left) * scaleX;
    const v = viewRef.current;
    const xRange = v.xMax - v.xMin || 1;

    // Domain end drag
    if (domainDragRef.current) {
      const globalMax = 60;
      const xVal = v.xMin + ((cx - PAD_LEFT) / plotW) * xRange;
      const snapped = Math.max(1, Math.min(globalMax, Math.round(xVal)));
      onDomainEndChangeRef.current?.(snapped);
      maxXRef.current = snapped + 5;
      setView(prev => ({ ...prev, xMax: snapped + 5 }));
      return;
    }

    // Update cursor based on proximity to domain end line
    if (!dragRef.current.active) {
      const domainEnd = fnRef.current.xAxis.domain[1];
      const domCx = PAD_LEFT + ((domainEnd - v.xMin) / xRange) * plotW;
      canvas.style.cursor = Math.abs(cx - domCx) <= 8 ? 'col-resize' : 'grab';
    }

    // Pan
    const d = dragRef.current;
    if (!d.active) return;
    const dx = (e.clientX - d.lastX) * scaleX;
    const dy = (e.clientY - d.lastY) * scaleY;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;

    const mx = maxXRef.current;
    setView(prev => {
      const xShift = -(dx / plotW) * (prev.xMax - prev.xMin);
      const yShift =  (dy / plotH) * (prev.yHi - prev.yLo);
      let newXMin = prev.xMin + xShift;
      let newXMax = prev.xMax + xShift;
      if (newXMax > mx) { newXMin -= (newXMax - mx); newXMax = mx; }
      if (newXMin < 0)  { newXMax -= newXMin; newXMax = Math.min(newXMax, mx); newXMin = 0; }
      let newYLo = prev.yLo + yShift;
      let newYHi = prev.yHi + yShift;
      if (newYHi > 127)  { newYLo -= (newYHi - 127); newYHi = 127; }
      if (newYLo < -127) { newYHi -= (newYLo + 127); newYHi = Math.min(newYHi, 127); newYLo = -127; }
      return { xMin: newXMin, xMax: newXMax, yLo: newYLo, yHi: newYHi };
    });
  }, []);

  const handleMouseUp = useCallback(() => {
    dragRef.current.active = false;
    domainDragRef.current = false;
    if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
  }, []);
  const handleMouseLeave = useCallback(() => {
    dragRef.current.active = false;
    domainDragRef.current = false;
    if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
  }, []);

  const handleDoubleClick = useCallback(() => {
    setView({
      xMin: fn.xAxis.domain[0],
      xMax: fn.xAxis.domain[1] + 5,
      yLo:  Math.max(-127, fn.yAxis.yViewRange[0]),
      yHi:  Math.min(127,  fn.yAxis.yViewRange[1]),
    });
  }, [fn]);

  const handleAutoZoom = useCallback(() => {
    const { compiled, error } = compileExpression(fn.expression);
    if (error || !compiled) return;

    const [xDomainMin, xDomainMax] = fn.xAxis.domain;
    const samples = sampleFunction(compiled, xDomainMin, xDomainMax, 1000);
    const finiteYs = samples.map(p => p.y).filter(isFinite);
    if (finiteYs.length === 0) return;

    const yMin = Math.min(...finiteYs);
    const yMax = Math.max(...finiteYs);
    const yRange = yMax - yMin || 2;
    const pad = yRange * 0.05;
    setView({
      xMin: xDomainMin,
      xMax: xDomainMax + 5,
      yLo:  Math.max(-127, yMin - pad),
      yHi:  Math.min(127,  yMax + pad),
    });
  }, [fn]);

  return (
    <div ref={wrapperRef} className={styles.wrapper}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onDoubleClick={handleDoubleClick}
      />
      <button className={styles.autoBtn} onClick={handleAutoZoom} title="Fit to function">⊡</button>
      <button className={styles.resetBtn} onClick={handleDoubleClick} title="Reset view">⌖</button>
    </div>
  );
}
