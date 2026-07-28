import React from 'react';
import {
  Trash2,
  Music2,
  Target,
  TrendingUp,
  Lightbulb,
  ArrowUp,
  ArrowDown,
  Check,
  Ban,
} from 'lucide-react';
import { COMMON_KEYS, getScaleNotes } from '../lib/musicTheory';
import { PitchMonitor } from './PitchMonitor';

const ACTION_ICONS = {
  hold: Check,
  raise: ArrowUp,
  lower: ArrowDown,
  'move-up': ArrowUp,
  'move-down': ArrowDown,
  aim: Target,
  avoid: Ban,
};

/**
 * Full learner-mode UI: base key, pitch coach, suggestions, song progression.
 */
export function LearnerPanel({
  isListening,
  currentPitch,
  baseKey,
  setBaseKey,
  pitchAnalysis,
  melodyHistory,
  chordHistory,
  progression,
  accuracyPercent,
  stats,
  clearSession,
}) {
  const scaleNotes = getScaleNotes(baseKey.tonic, baseKey.type);
  const majorKeys = COMMON_KEYS.filter((k) => k.type === 'major');
  const minorKeys = COMMON_KEYS.filter((k) => k.type === 'minor');

  return (
    <div className="space-y-6">
      {/* Base key picker */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Base Key
            </div>
            <div className="text-2xl font-bold text-emerald-300 mt-1">
              {baseKey.scaleName}
            </div>
          </div>
          <div className="text-xs text-slate-500 max-w-xs text-right">
            Sing in this key — off-pitch notes are flagged as too high or too low.
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">
              Major
            </div>
            <div className="flex flex-wrap gap-1.5">
              {majorKeys.map((k) => (
                <button
                  key={`maj-${k.tonic}`}
                  type="button"
                  onClick={() => setBaseKey(k.tonic, 'major')}
                  className={`px-2.5 py-1 rounded-md text-xs font-mono border transition ${
                    baseKey.tonic === k.tonic && baseKey.type === 'major'
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {k.tonic}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">
              Minor
            </div>
            <div className="flex flex-wrap gap-1.5">
              {minorKeys.map((k) => (
                <button
                  key={`min-${k.tonic}`}
                  type="button"
                  onClick={() => setBaseKey(k.tonic, 'minor')}
                  className={`px-2.5 py-1 rounded-md text-xs font-mono border transition ${
                    baseKey.tonic === k.tonic && baseKey.type === 'minor'
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {k.tonic}m
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 items-center">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 mr-1">
            Scale
          </span>
          {scaleNotes.map((n) => {
            const isTarget =
              pitchAnalysis?.active && pitchAnalysis.targetNoteClass === n;
            const isSung =
              pitchAnalysis?.active && pitchAnalysis.sungNoteClass === n;
            return (
              <span
                key={n}
                className={`px-2.5 py-1 rounded-md text-xs font-mono border ${
                  isSung && pitchAnalysis.inTune
                    ? 'bg-emerald-600/40 border-emerald-500 text-emerald-200'
                    : isSung
                      ? 'bg-amber-600/30 border-amber-500 text-amber-200'
                      : isTarget
                        ? 'bg-slate-700 border-emerald-700/50 text-emerald-300'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400'
                }`}
              >
                {n}
              </span>
            );
          })}
        </div>
      </div>

      <PitchMonitor
        pitchAnalysis={pitchAnalysis}
        currentPitch={currentPitch}
        isListening={isListening}
      />

      {/* Suggestions + live accuracy */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="w-4 h-4 text-amber-400" />
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Singing Suggestions
            </div>
          </div>
          <div className="space-y-2 min-h-[120px]">
            {pitchAnalysis?.suggestions?.length > 0 ? (
              pitchAnalysis.suggestions.map((sug, i) => {
                const Icon = ACTION_ICONS[sug.action] || Target;
                const tone =
                  sug.action === 'avoid'
                    ? 'border-rose-800/50 text-rose-300'
                    : sug.action === 'hold'
                      ? 'border-emerald-800/50 text-emerald-300'
                      : 'border-slate-700 text-slate-200';
                return (
                  <div
                    key={`${sug.action}-${sug.note}-${i}`}
                    className={`flex items-start gap-3 p-3 rounded-lg border bg-slate-800/50 ${tone}`}
                  >
                    <Icon className="w-4 h-4 mt-0.5 shrink-0 opacity-80" />
                    <div>
                      <div className="text-sm font-semibold">{sug.label}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{sug.detail}</div>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-slate-500 text-sm italic">
                {isListening
                  ? 'Sing a sustained note for coaching tips…'
                  : 'Start audio, pick a base key, then sing.'}
              </p>
            )}
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Target className="w-4 h-4 text-indigo-400" />
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Session Accuracy
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="In tune"
              value={accuracyPercent != null ? `${accuracyPercent}%` : '—'}
              accent="text-emerald-400"
            />
            <StatCard
              label="Notes tracked"
              value={progression.noteCount || 0}
              accent="text-cyan-400"
            />
            <StatCard
              label="Too high"
              value={stats.offKeyHigh}
              accent="text-amber-400"
            />
            <StatCard
              label="Too low"
              value={stats.offKeyLow}
              accent="text-sky-400"
            />
          </div>
          {progression.inKeyPercent > 0 && (
            <div className="mt-4">
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Key adherence</span>
                <span>{progression.inKeyPercent}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-600 to-cyan-500 transition-all duration-300"
                  style={{ width: `${progression.inKeyPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Melodic progression */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4 gap-3">
          <div className="flex items-center gap-2">
            <Music2 className="w-4 h-4 text-emerald-400" />
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Song Progression (Melody)
            </div>
          </div>
          {melodyHistory.length > 0 && (
            <button
              type="button"
              onClick={clearSession}
              className="text-xs flex items-center gap-1 text-slate-500 hover:text-rose-300 transition"
            >
              <Trash2 className="w-3 h-3" /> Clear
            </button>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 min-h-[72px]">
          {melodyHistory.length > 0 ? (
            melodyHistory.map((item) => (
              <div
                key={item.id}
                className={`p-3 rounded-lg text-center min-w-[64px] shrink-0 border ${
                  item.inTune
                    ? 'bg-emerald-950/40 border-emerald-800/50'
                    : item.direction === 'high'
                      ? 'bg-amber-950/30 border-amber-800/40'
                      : item.direction === 'low'
                        ? 'bg-sky-950/30 border-sky-800/40'
                        : 'bg-slate-800/90 border-slate-700'
                }`}
                title={
                  item.inTune
                    ? 'In tune'
                    : item.direction === 'high'
                      ? `Sharp (${item.cents > 0 ? '+' : ''}${item.cents}¢)`
                      : item.direction === 'low'
                        ? `Flat (${item.cents}¢)`
                        : 'Detected'
                }
              >
                <div className="text-sm font-bold text-slate-100">{item.noteClass}</div>
                <div className="text-[10px] font-mono text-slate-500 mt-1">
                  {item.note}
                </div>
              </div>
            ))
          ) : (
            <span className="text-slate-500 text-sm italic self-center">
              Held notes appear here as you sing through the song…
            </span>
          )}
        </div>
      </div>

      {/* Progression analysis */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-cyan-400" />
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Progression Analysis
          </div>
        </div>

        <p className="text-sm text-slate-300 mb-4">{progression.summary}</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3">
            <div className="text-[10px] uppercase text-slate-500 tracking-wider mb-1">
              Motion
            </div>
            <div className="text-sm font-semibold text-slate-200 capitalize">
              {progression.motion || '—'}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {progression.phraseCount || 0} phrase
              {progression.phraseCount === 1 ? '' : 's'}
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3">
            <div className="text-[10px] uppercase text-slate-500 tracking-wider mb-1">
              Range
            </div>
            <div className="text-sm font-semibold text-slate-200 font-mono">
              {progression.range
                ? `${progression.range.low} – ${progression.range.high}`
                : '—'}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {progression.range
                ? `${progression.range.semitones} semitones`
                : 'No span yet'}
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3">
            <div className="text-[10px] uppercase text-slate-500 tracking-wider mb-1">
              Center note
            </div>
            <div className="text-sm font-semibold text-emerald-300">
              {progression.mostUsed || '—'}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {progression.uniqueNotes?.length
                ? `${progression.uniqueNotes.length} unique pitches`
                : 'No notes yet'}
            </div>
          </div>
        </div>

        {progression.intervals?.length > 0 && (
          <div className="mt-4">
            <div className="text-[10px] uppercase text-slate-500 tracking-wider mb-2">
              Recent intervals
            </div>
            <div className="flex flex-wrap gap-2">
              {progression.intervals.map((iv, i) => (
                <span
                  key={`${iv.from}-${iv.to}-${i}`}
                  className="text-xs font-mono bg-slate-800 border border-slate-700 px-2 py-1 rounded text-slate-300"
                >
                  {iv.from}→{iv.to}{' '}
                  <span className="text-cyan-400">{iv.label}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {progression.impliedChords?.length > 0 && (
          <div className="mt-4">
            <div className="text-[10px] uppercase text-slate-500 tracking-wider mb-2">
              Implied harmony (from recent notes)
            </div>
            <div className="flex flex-wrap gap-2">
              {progression.impliedChords.map((c) => (
                <div
                  key={c.chord}
                  className="bg-slate-800/80 border border-slate-700 px-3 py-2 rounded-lg"
                >
                  <div className="text-sm font-bold text-cyan-400">{c.chord}</div>
                  {c.roman && (
                    <div className="text-[10px] text-slate-500 font-mono">{c.roman}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {chordHistory.length > 0 && (
          <div className="mt-4">
            <div className="text-[10px] uppercase text-slate-500 tracking-wider mb-2">
              Detected chords while learning
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {chordHistory.map((c) => (
                <span
                  key={c.id}
                  className="shrink-0 text-xs font-mono bg-indigo-950/40 border border-indigo-800/40 text-indigo-300 px-2.5 py-1 rounded"
                >
                  {c.chord}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">
        {label}
      </div>
      <div className={`text-2xl font-bold ${accent}`}>{value}</div>
    </div>
  );
}
