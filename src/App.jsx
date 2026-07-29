import React, { useState, useEffect, useCallback } from 'react';
import { Play, Square, Music, Lock, Unlock, Activity, Trash2 } from 'lucide-react';
import { useAudioEngine } from './hooks/useAudioEngine';
import { useLearnerSession } from './hooks/useLearnerSession';
import { detectKeyFromProgression, getNextChordSuggestions, getRomanNumeral } from './lib/musicTheory';
import { SpectrumVisualizer } from './components/SpectrumVisualizer';
import { ModeToggle } from './components/ModeToggle';
import { LearnerPanel } from './components/LearnerPanel';

export default function App() {
  const [mode, setMode] = useState('analyze'); // 'analyze' | 'learn'
  const [settings] = useState({
    tuningA4: 440,
    sensitivity: 0.55,
    chordQualityFilter: 'all',
  });

  const {
    isListening,
    error,
    currentChord,
    detectedNotes,
    spectrumData,
    currentPitch,
    voiceActivity,
    startAudio,
    stopAudio,
  } = useAudioEngine(settings, mode);

  const [history, setHistory] = useState([]);
  const [lockedKey, setLockedKey] = useState(null);

  const learner = useLearnerSession(currentPitch, currentChord, {
    requireVoice: true,
  });

  // Append stable detected chords to progression history (analyze mode)
  useEffect(() => {
    if (mode !== 'analyze') return;
    if (!currentChord?.name) return;

    setHistory((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].chord === currentChord.name) {
        return prev;
      }

      const keyInfo = lockedKey
        ? {
            tonic: lockedKey.tonic,
            type: lockedKey.type || 'major',
            scaleName: lockedKey.scaleName || `${lockedKey.tonic} major`,
          }
        : detectKeyFromProgression([...prev.map((p) => p.chord), currentChord.name]);

      const roman = getRomanNumeral(currentChord.name, keyInfo.tonic, keyInfo.type);

      return [
        ...prev,
        {
          id: `${Date.now()}-${currentChord.name}`,
          chord: currentChord.name,
          roman,
          timestamp: Date.now(),
        },
      ].slice(-12);
    });
  }, [currentChord, lockedKey, mode]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopAudio();
    } else {
      startAudio();
    }
  }, [isListening, startAudio, stopAudio]);

  // Spacebar toggles listening when focus is on the page body
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code !== 'Space') return;
      if (e.target !== document.body && e.target !== document.documentElement) return;
      e.preventDefault();
      toggleListening();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleListening]);

  const currentKey = lockedKey
    ? lockedKey
    : detectKeyFromProgression(history.map((h) => h.chord));

  const suggestions =
    history.length > 0
      ? getNextChordSuggestions(history[history.length - 1].chord, currentKey)
      : [];

  const handleLockKey = () => {
    if (lockedKey) {
      setLockedKey(null);
      return;
    }
    setLockedKey(currentKey);
  };

  const clearHistory = () => {
    setHistory([]);
    if (!lockedKey) setLockedKey(null);
  };

  const isLearn = mode === 'learn';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur px-6 py-4 flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Music className={`w-6 h-6 ${isLearn ? 'text-emerald-500' : 'text-indigo-500'}`} />
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
              ChordSense
            </h1>
          </div>
          <ModeToggle mode={mode} onChange={setMode} />
        </div>

        <button
          type="button"
          onClick={toggleListening}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-medium transition duration-200 shadow-lg ${
            isListening
              ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950/50'
              : isLearn
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-950/50'
          }`}
        >
          {isListening ? (
            <Square className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 fill-current" />
          )}
          {isListening
            ? isLearn
              ? 'Stop Coaching'
              : 'Stop Analysis'
            : isLearn
              ? 'Start Coaching'
              : 'Start Audio'}
        </button>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto p-6 space-y-6">
        {error && (
          <div className="bg-rose-950/40 border border-rose-800/60 text-rose-300 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {!isListening && !error && (
          <div
            className={`border px-4 py-3 rounded-lg text-sm ${
              isLearn
                ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-200'
                : 'bg-indigo-950/30 border-indigo-800/40 text-indigo-200'
            }`}
          >
            {isLearn ? (
              <>
                Pick a <strong>base key</strong>, click <strong>Start Coaching</strong> (or press
                Space), then sing. ChordSense filters noise, locks onto real voice, flags notes that
                are too high or too low, and analyzes your song progression.
              </>
            ) : (
              <>
                Click <strong>Start Audio</strong> (or press Space) and allow microphone access to
                detect live chords.
              </>
            )}
          </div>
        )}

        {isLearn ? (
          <LearnerPanel
            isListening={isListening}
            currentPitch={currentPitch}
            voiceActivity={voiceActivity}
            baseKey={learner.baseKey}
            setBaseKey={learner.setBaseKey}
            pitchAnalysis={learner.pitchAnalysis}
            melodyHistory={learner.melodyHistory}
            chordHistory={learner.chordHistory}
            progression={learner.progression}
            accuracyPercent={learner.accuracyPercent}
            stats={learner.stats}
            clearSession={learner.clearSession}
          />
        ) : (
          <>
            {/* Hero chord banner */}
            <div className="relative overflow-hidden bg-slate-900/80 border border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center text-center shadow-2xl">
              <div className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Activity className={`w-4 h-4 ${isListening ? 'animate-pulse' : ''}`} />
                {isListening ? 'Live Detection' : 'Detected Chord'}
              </div>

              <div className="text-7xl md:text-8xl font-black tracking-tight text-white my-4 min-h-[110px] flex items-center">
                {currentChord ? currentChord.name : '—'}
              </div>

              {currentChord?.quality && currentChord.quality !== 'unknown' && (
                <div className="text-sm text-slate-400 mb-3">{currentChord.quality}</div>
              )}

              <div className="flex flex-wrap gap-2 justify-center mt-2 min-h-[28px]">
                {detectedNotes.length > 0 ? (
                  detectedNotes.map((note) => (
                    <span
                      key={note}
                      className="bg-slate-800 text-slate-300 border border-slate-700 px-3 py-1 rounded-md text-xs font-mono"
                    >
                      {note}
                    </span>
                  ))
                ) : (
                  <span className="text-slate-500 text-sm italic">
                    {isListening ? 'Listening for notes…' : 'Start audio to begin'}
                  </span>
                )}
              </div>
            </div>

            {/* Key + suggestions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Estimated Key
                  </span>
                  <button
                    type="button"
                    onClick={handleLockKey}
                    className={`text-xs flex items-center gap-1 px-2.5 py-1 rounded border transition ${
                      lockedKey
                        ? 'bg-indigo-950 border-indigo-700 text-indigo-300'
                        : 'border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    {lockedKey ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                    {lockedKey ? 'Locked' : 'Lock Key'}
                  </button>
                </div>
                <div className="text-2xl font-bold text-slate-200">{currentKey.scaleName}</div>
                <div className="text-xs text-slate-500 mt-2 capitalize">{currentKey.type} tonality</div>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
                  Suggested Next Chords
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {suggestions.length > 0 ? (
                    suggestions.map((sug) => (
                      <div
                        key={`${sug.chord}-${sug.roman}`}
                        className="bg-slate-800/80 border border-slate-700/60 p-3 rounded-lg flex-1 min-w-[100px]"
                        title={sug.reason}
                      >
                        <div className="text-lg font-bold text-cyan-400">{sug.chord}</div>
                        <div className="text-xs text-slate-400">{sug.roman}</div>
                      </div>
                    ))
                  ) : (
                    <span className="text-slate-500 text-sm italic">
                      Play a chord to see suggestions…
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Progression history */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4 gap-3">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Chord Progression History
                </div>
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={clearHistory}
                    className="text-xs flex items-center gap-1 text-slate-500 hover:text-rose-300 transition"
                  >
                    <Trash2 className="w-3 h-3" /> Clear
                  </button>
                )}
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 min-h-[64px]">
                {history.length > 0 ? (
                  history.map((item) => (
                    <div
                      key={item.id}
                      className="bg-slate-800/90 border border-slate-700 p-3 rounded-lg text-center min-w-[80px] shrink-0"
                    >
                      <div className="text-sm font-bold text-slate-200">{item.chord}</div>
                      <div className="text-xs font-mono text-indigo-400 mt-1">
                        {item.roman || '—'}
                      </div>
                    </div>
                  ))
                ) : (
                  <span className="text-slate-500 text-sm italic self-center">
                    Detected chords will appear here in order…
                  </span>
                )}
              </div>
            </div>
          </>
        )}

        <SpectrumVisualizer spectrumData={spectrumData} isListening={isListening} />
      </main>
    </div>
  );
}
