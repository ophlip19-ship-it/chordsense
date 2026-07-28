import React from 'react';
import { Activity, GraduationCap } from 'lucide-react';

/**
 * Toggle between Analyze (chord detection) and Learn (pitch coaching) modes.
 */
export function ModeToggle({ mode, onChange }) {
  return (
    <div
      className="inline-flex items-center rounded-full border border-slate-700 bg-slate-900/80 p-1 gap-0.5"
      role="tablist"
      aria-label="App mode"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'analyze'}
        onClick={() => onChange('analyze')}
        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition ${
          mode === 'analyze'
            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-950/40'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <Activity className="w-3.5 h-3.5" />
        Analyze
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'learn'}
        onClick={() => onChange('learn')}
        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium transition ${
          mode === 'learn'
            ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/40'
            : 'text-slate-400 hover:text-slate-200'
        }`}
      >
        <GraduationCap className="w-3.5 h-3.5" />
        Learn
      </button>
    </div>
  );
}
