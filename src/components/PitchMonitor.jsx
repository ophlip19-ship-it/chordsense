import React from 'react';
import { ArrowDown, ArrowUp, Check, AlertTriangle, Mic, MicOff, AudioLines } from 'lucide-react';

/**
 * Visual pitch meter: cents needle + high/low/in-tune status.
 * Shows voice-gate status so noise is not mistaken for singing.
 */
export function PitchMonitor({
  pitchAnalysis,
  currentPitch,
  isListening,
  voiceActivity,
}) {
  const cents = pitchAnalysis?.cents ?? 0;
  // Clamp needle to ±50 cents visual range
  const clamped = Math.max(-50, Math.min(50, cents));
  const needlePercent = 50 + (clamped / 50) * 50;

  const status = pitchAnalysis?.status || 'idle';
  const voiceStatus = voiceActivity?.status || 'idle';
  const isVoice = voiceActivity?.isVoice || currentPitch?.isVoice;
  const active = pitchAnalysis?.active && isListening && isVoice !== false;

  const statusStyles = {
    idle: 'border-slate-700 text-slate-400',
    'in-tune': 'border-emerald-600/60 text-emerald-300 bg-emerald-950/30',
    'too-high': 'border-amber-600/60 text-amber-300 bg-amber-950/30',
    'too-low': 'border-sky-600/60 text-sky-300 bg-sky-950/30',
    'off-key-high': 'border-rose-600/60 text-rose-300 bg-rose-950/30',
    'off-key-low': 'border-rose-600/60 text-rose-300 bg-rose-950/30',
    unknown: 'border-slate-600 text-slate-300',
  };

  const voiceBadge = (() => {
    if (!isListening) {
      return {
        label: 'Mic off',
        className: 'border-slate-700 text-slate-500 bg-slate-900/40',
        Icon: MicOff,
      };
    }
    if (voiceStatus === 'voice' || (isVoice && active)) {
      return {
        label: 'Voice locked',
        className: 'border-emerald-700/60 text-emerald-300 bg-emerald-950/40',
        Icon: Mic,
      };
    }
    if (voiceStatus === 'warming') {
      return {
        label: 'Locking voice…',
        className: 'border-cyan-700/50 text-cyan-300 bg-cyan-950/30',
        Icon: AudioLines,
      };
    }
    if (voiceStatus === 'noise') {
      return {
        label: 'Noise filtered',
        className: 'border-slate-600 text-slate-400 bg-slate-800/50',
        Icon: MicOff,
      };
    }
    if (voiceStatus === 'silence' || voiceStatus === 'listening') {
      return {
        label: 'Listening for voice',
        className: 'border-slate-600 text-slate-400 bg-slate-900/40',
        Icon: AudioLines,
      };
    }
    return {
      label: isListening ? 'Listening…' : 'Idle',
      className: 'border-slate-700 text-slate-400',
      Icon: Mic,
    };
  })();

  const StatusIcon =
    status === 'in-tune'
      ? Check
      : status === 'too-high' || status === 'off-key-high'
        ? ArrowUp
        : status === 'too-low' || status === 'off-key-low'
          ? ArrowDown
          : AlertTriangle;

  const VoiceIcon = voiceBadge.Icon;
  const confPct =
    typeof voiceActivity?.confidence === 'number'
      ? Math.round(voiceActivity.confidence * 100)
      : typeof currentPitch?.voiceConfidence === 'number'
        ? Math.round(currentPitch.voiceConfidence * 100)
        : null;

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-2xl">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">
          Pitch Monitor
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${voiceBadge.className}`}
            title="Voice activity gate — ambient noise is ignored in learn mode"
          >
            <VoiceIcon className="w-3.5 h-3.5" />
            {voiceBadge.label}
            {confPct != null && isListening && voiceStatus === 'voice' ? (
              <span className="font-mono text-[10px] opacity-80">{confPct}%</span>
            ) : null}
          </div>
          <div
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${
              statusStyles[status] || statusStyles.idle
            }`}
          >
            {active && <StatusIcon className="w-3.5 h-3.5" />}
            {active
              ? pitchAnalysis.message
              : isListening
                ? voiceStatus === 'noise'
                  ? 'Ignoring noise'
                  : 'Waiting for voice…'
                : 'Idle'}
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center gap-6">
        {/* Big note display */}
        <div className="text-center min-w-[140px]">
          <div className="text-6xl md:text-7xl font-black tracking-tight text-white min-h-[84px] flex items-center justify-center">
            {active ? pitchAnalysis.sungNoteClass || '—' : '—'}
          </div>
          <div className="text-sm text-slate-400 font-mono mt-1">
            {active && currentPitch?.note ? currentPitch.note : 'No pitch'}
            {active && currentPitch?.frequency
              ? ` · ${Math.round(currentPitch.frequency)} Hz`
              : ''}
          </div>
          {active && pitchAnalysis.targetNoteClass && (
            <div className="text-xs text-slate-500 mt-1">
              Target:{' '}
              <span className="text-emerald-400 font-semibold">
                {pitchAnalysis.targetNoteClass}
              </span>
              {typeof pitchAnalysis.cents === 'number' && (
                <span className="ml-1 font-mono">
                  ({pitchAnalysis.cents > 0 ? '+' : ''}
                  {pitchAnalysis.cents}¢)
                </span>
              )}
            </div>
          )}
        </div>

        {/* Cents gauge */}
        <div className="flex-1 w-full max-w-md">
          <div className="relative h-3 rounded-full bg-slate-800 border border-slate-700 overflow-visible">
            {/* In-tune center band (±30¢ visual) */}
            <div
              className="absolute top-0 bottom-0 bg-emerald-500/20 border-x border-emerald-500/30"
              style={{ left: '35%', width: '30%' }}
            />
            {/* Center line */}
            <div className="absolute left-1/2 top-[-4px] bottom-[-4px] w-0.5 bg-slate-400/80 -translate-x-1/2" />
            {/* Needle — smoother transition to reflect fluctuation damping */}
            <div
              className={`absolute top-1/2 w-3.5 h-3.5 rounded-full border-2 shadow-lg transition-all duration-150 -translate-x-1/2 -translate-y-1/2 ${
                !active
                  ? 'bg-slate-600 border-slate-500 opacity-40'
                  : pitchAnalysis.inTune
                    ? 'bg-emerald-400 border-emerald-200'
                    : pitchAnalysis.direction === 'high'
                      ? 'bg-amber-400 border-amber-200'
                      : 'bg-sky-400 border-sky-200'
              }`}
              style={{ left: `${active ? needlePercent : 50}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-500 mt-2 font-mono uppercase tracking-wide">
            <span className="flex items-center gap-1">
              <ArrowDown className="w-3 h-3 text-sky-400" /> Flat / Low
            </span>
            <span className="text-emerald-400">In tune</span>
            <span className="flex items-center gap-1">
              Sharp / High <ArrowUp className="w-3 h-3 text-amber-400" />
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-3 text-center md:text-left">
            Noise and room tone are filtered — only sustained voice is scored.
          </p>
        </div>
      </div>
    </div>
  );
}
