import React, { useRef, useEffect } from 'react';

/**
 * Draws a real-time frequency spectrum from PitchPlease spectrum samples.
 * spectrumData: number[] | Float32Array | null (values roughly 0–255)
 */
export function SpectrumVisualizer({ spectrumData, isListening }) {
  const canvasRef = useRef(null);
  const dataRef = useRef(spectrumData);

  useEffect(() => {
    dataRef.current = spectrumData;
  }, [spectrumData]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId;
    let running = true;

    const draw = () => {
      if (!running) return;
      animationId = requestAnimationFrame(draw);

      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const data = dataRef.current;
      if (!isListening || !data || data.length === 0) {
        // Idle baseline
        ctx.fillStyle = 'rgba(51, 65, 85, 0.5)';
        ctx.fillRect(0, height - 2, width, 2);
        return;
      }

      const binCount = data.length;
      const barWidth = Math.max(1, width / binCount);
      let x = 0;

      for (let i = 0; i < binCount; i++) {
        const value = data[i] / 255;
        const barHeight = Math.max(1, value * height);
        const hue = 220 + (i / binCount) * 100;
        const lightness = 40 + value * 25;
        ctx.fillStyle = `hsl(${hue}, 80%, ${lightness}%)`;
        ctx.fillRect(x, height - barHeight, barWidth - 0.5, barHeight);
        x += barWidth;
      }
    };

    draw();

    return () => {
      running = false;
      cancelAnimationFrame(animationId);
    };
  }, [isListening]);

  return (
    <div className="w-full bg-slate-900/60 border border-slate-800 rounded-xl p-4 backdrop-blur">
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
        Real-Time Frequency Spectrum
      </div>
      <canvas
        ref={canvasRef}
        width={800}
        height={120}
        className="w-full h-28 rounded bg-slate-950/50"
      />
    </div>
  );
}
