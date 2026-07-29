import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  analyzePitchAgainstKey,
  analyzeSongProgression,
  DEFAULT_CENTS_TOLERANCE,
  makeKeyInfo,
} from '../lib/musicTheory';

/**
 * Learner-mode session: base key, live pitch analysis, melodic progression history.
 * options.requireVoice (default true): ignore frames not tagged as real voice.
 */
export function useLearnerSession(currentPitch, currentChord, options = {}) {
  const centsTolerance = options.centsTolerance ?? DEFAULT_CENTS_TOLERANCE;
  const requireVoice = options.requireVoice !== false;
  const minVoiceConfidence = options.minVoiceConfidence ?? 0.5;

  /** Only accept stable, voice-gated pitches for learning. */
  const isValidVoicePitch = useCallback(
    (pitch) => {
      if (!pitch?.stable || pitch.midi == null) return false;
      if (!requireVoice) return true;
      if (pitch.isVoice === false) return false;
      if (
        typeof pitch.voiceConfidence === 'number' &&
        pitch.voiceConfidence < minVoiceConfidence
      ) {
        return false;
      }
      return true;
    },
    [requireVoice, minVoiceConfidence]
  );

  const [baseKey, setBaseKeyState] = useState(() => makeKeyInfo('C', 'major'));
  const [melodyHistory, setMelodyHistory] = useState([]);
  const [chordHistory, setChordHistory] = useState([]);
  const [stats, setStats] = useState({
    samples: 0,
    inTuneSamples: 0,
    offKeyHigh: 0,
    offKeyLow: 0,
  });

  const lastNoteClassRef = useRef(null);
  const lastNoteAtRef = useRef(0);
  const lastChordRef = useRef(null);
  const baseKeyRef = useRef(baseKey);

  useEffect(() => {
    baseKeyRef.current = baseKey;
  }, [baseKey]);

  const setBaseKey = useCallback((tonic, type = 'major') => {
    setBaseKeyState(makeKeyInfo(tonic, type));
  }, []);

  const pitchAnalysis = useMemo(() => {
    // Live meter: show pitch when voice is present (even while stabilizing).
    // Never analyze frames explicitly tagged as noise.
    if (
      !currentPitch?.midi ||
      (requireVoice && currentPitch.isVoice === false)
    ) {
      return analyzePitchAgainstKey(null, baseKey, { centsTolerance });
    }
    if (
      requireVoice &&
      typeof currentPitch.voiceConfidence === 'number' &&
      currentPitch.voiceConfidence < minVoiceConfidence * 0.85
    ) {
      return analyzePitchAgainstKey(null, baseKey, { centsTolerance });
    }
    return analyzePitchAgainstKey(currentPitch.midi, baseKey, { centsTolerance });
  }, [
    currentPitch,
    baseKey,
    centsTolerance,
    requireVoice,
    minVoiceConfidence,
  ]);

  // Live accuracy counters (frame-level, only when real voice is active)
  useEffect(() => {
    if (!isValidVoicePitch(currentPitch) || !pitchAnalysis.active) return;

    setStats((prev) => {
      const next = {
        samples: prev.samples + 1,
        inTuneSamples: prev.inTuneSamples + (pitchAnalysis.inTune ? 1 : 0),
        offKeyHigh:
          prev.offKeyHigh +
          (pitchAnalysis.direction === 'high' && !pitchAnalysis.inTune ? 1 : 0),
        offKeyLow:
          prev.offKeyLow +
          (pitchAnalysis.direction === 'low' && !pitchAnalysis.inTune ? 1 : 0),
      };
      return next;
    });
  }, [currentPitch?.timestamp, currentPitch, pitchAnalysis, isValidVoicePitch]);

  // Append distinct held notes to melodic progression (voice only)
  useEffect(() => {
    if (!isValidVoicePitch(currentPitch) || !pitchAnalysis.active) return;

    const noteClass = pitchAnalysis.sungNoteClass || currentPitch.noteClass;
    const now = currentPitch.timestamp || Date.now();

    // Debounce same pitch class within 400ms; allow re-entry after gap
    if (
      noteClass === lastNoteClassRef.current &&
      now - lastNoteAtRef.current < 450
    ) {
      return;
    }

    // Require a clear pitch-class change or a meaningful re-attack after silence
    const isRepeat =
      noteClass === lastNoteClassRef.current &&
      now - lastNoteAtRef.current < 900;
    if (isRepeat) return;

    lastNoteClassRef.current = noteClass;
    lastNoteAtRef.current = now;

    setMelodyHistory((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.noteClass === noteClass && now - last.timestamp < 700) {
        return prev;
      }

      return [
        ...prev,
        {
          id: `${now}-${noteClass}`,
          note: currentPitch.note,
          noteClass,
          midi: currentPitch.midi,
          pitchClass: currentPitch.pitchClass,
          inKey: pitchAnalysis.inKey && pitchAnalysis.inTune
            ? true
            : pitchAnalysis.inKey,
          inTune: pitchAnalysis.inTune,
          direction: pitchAnalysis.direction,
          cents: pitchAnalysis.cents,
          timestamp: now,
        },
      ].slice(-48);
    });
  }, [currentPitch, pitchAnalysis, isValidVoicePitch]);

  // Track chords under the locked base key (song harmony while learning)
  // Only when confidence suggests real musical content (not noise spikes)
  useEffect(() => {
    if (!currentChord?.name) return;
    if (
      requireVoice &&
      typeof currentChord.confidence === 'number' &&
      currentChord.confidence < minVoiceConfidence
    ) {
      return;
    }
    if (currentChord.name === lastChordRef.current) return;
    lastChordRef.current = currentChord.name;

    setChordHistory((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].chord === currentChord.name) {
        return prev;
      }
      return [
        ...prev,
        {
          id: `${Date.now()}-${currentChord.name}`,
          chord: currentChord.name,
          timestamp: Date.now(),
        },
      ].slice(-16);
    });
  }, [currentChord, requireVoice, minVoiceConfidence]);

  const progression = useMemo(
    () => analyzeSongProgression(melodyHistory, baseKey),
    [melodyHistory, baseKey]
  );

  const accuracyPercent = useMemo(() => {
    if (stats.samples === 0) return null;
    return Math.round((stats.inTuneSamples / stats.samples) * 100);
  }, [stats]);

  const clearSession = useCallback(() => {
    setMelodyHistory([]);
    setChordHistory([]);
    setStats({ samples: 0, inTuneSamples: 0, offKeyHigh: 0, offKeyLow: 0 });
    lastNoteClassRef.current = null;
    lastNoteAtRef.current = 0;
    lastChordRef.current = null;
  }, []);

  // Reset note debounce when pitch drops out
  useEffect(() => {
    if (!currentPitch) {
      // Allow the same note to re-register after silence
      if (Date.now() - lastNoteAtRef.current > 600) {
        lastNoteClassRef.current = null;
      }
    }
  }, [currentPitch]);

  return {
    baseKey,
    setBaseKey,
    pitchAnalysis,
    melodyHistory,
    chordHistory,
    progression,
    stats,
    accuracyPercent,
    clearSession,
  };
}
