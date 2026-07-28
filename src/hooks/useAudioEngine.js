import { useState, useRef, useCallback, useEffect } from 'react';
import PitchPlease from '@markusstrasser/pitchplease';
import { midiToFrequency, midiToNoteName, NOTE_NAMES } from '../lib/musicTheory';

/**
 * Microphone pitch/chord detection powered by PitchPlease.
 * settings: { tuningA4, sensitivity, chordQualityFilter }
 */
export function useAudioEngine(settings = {}) {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(null);
  const [currentChord, setCurrentChord] = useState(null);
  const [detectedNotes, setDetectedNotes] = useState([]);
  const [spectrumData, setSpectrumData] = useState(null);
  /** Live monophonic pitch for learner mode */
  const [currentPitch, setCurrentPitch] = useState(null);

  const detectorRef = useRef(null);
  const settingsRef = useRef(settings);
  const lastChordNameRef = useRef(null);
  const silenceFramesRef = useRef(0);
  const pitchHoldRef = useRef({ midi: null, frames: 0, lastEmitted: null });
  const lastPitchUiAtRef = useRef(0);
  const lastSpectrumUiAtRef = useRef(0);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const handleUpdate = useCallback((data) => {
    const sensitivity = settingsRef.current?.sensitivity ?? 0.5;
    const tuningA4 = settingsRef.current?.tuningA4 ?? 440;
    // Higher sensitivity = lower energy gate
    const energyGate = Math.max(8, Math.round((1 - sensitivity) * 60));

    // Throttle spectrum UI updates (~15 fps)
    const now = performance.now();
    if (data.spectrum?.length && now - lastSpectrumUiAtRef.current > 66) {
      lastSpectrumUiAtRef.current = now;
      setSpectrumData(Array.from(data.spectrum));
    }

    if (data.maxEnergy < energyGate) {
      silenceFramesRef.current += 1;
      if (silenceFramesRef.current > 12) {
        setDetectedNotes([]);
        setCurrentPitch(null);
        pitchHoldRef.current = { midi: null, frames: 0, lastEmitted: pitchHoldRef.current.lastEmitted };
        if (lastChordNameRef.current) {
          lastChordNameRef.current = null;
          setCurrentChord(null);
        }
      }
      return;
    }

    silenceFramesRef.current = 0;

    const notes = (data.pitchClasses || []).map(
      (pc) => PitchPlease.NOTE_NAMES[pc] ?? PitchPlease.midiToNote(60 + pc)
    );
    setDetectedNotes(notes);

    // Primary fundamental for monophonic (singing) tracking
    const fundCount = data.fundCount || 0;
    if (fundCount > 0 && data.fundMidis?.length) {
      // Prefer the lowest strong fundamental (typical for voice)
      let bestMidi = data.fundMidis[0];
      for (let i = 1; i < fundCount; i++) {
        const m = data.fundMidis[i];
        if (m > 30 && m < bestMidi) bestMidi = m;
      }

      if (bestMidi > 30 && bestMidi < 100) {
        const rounded = Math.round(bestMidi);
        const pitchClass = ((rounded % 12) + 12) % 12;
        const hold = pitchHoldRef.current;

        // Stability: require a few frames near the same pitch class
        if (
          hold.midi != null &&
          Math.abs(bestMidi - hold.midi) < 0.6
        ) {
          hold.frames += 1;
        } else {
          hold.midi = bestMidi;
          hold.frames = 1;
        }

        const stable = hold.frames >= 2;
        const noteChanged =
          hold.lastEmitted == null ||
          Math.abs(bestMidi - hold.lastEmitted) >= 0.45;

        // Throttle pitch UI (~25 fps) while keeping hold tracking per-frame
        if (now - lastPitchUiAtRef.current > 40) {
          lastPitchUiAtRef.current = now;
          setCurrentPitch({
            midi: bestMidi,
            roundedMidi: rounded,
            pitchClass,
            note: midiToNoteName(bestMidi, true),
            noteClass: NOTE_NAMES[pitchClass],
            frequency: midiToFrequency(bestMidi, tuningA4),
            stable,
            noteChanged: stable && noteChanged,
            timestamp: Date.now(),
          });
        }

        if (stable && noteChanged) {
          hold.lastEmitted = bestMidi;
        }
      }
    } else {
      // No fundamental — clear after brief hang
      silenceFramesRef.current += 1;
      if (silenceFramesRef.current > 8) {
        setCurrentPitch(null);
      }
    }

    if (data.stable && data.chord) {
      const name = data.chord.full || data.chord.root;
      if (name && name !== lastChordNameRef.current) {
        lastChordNameRef.current = name;
        setCurrentChord({
          name,
          notes,
          root: data.chord.root,
          quality: data.chord.name || data.chord.abbrev || 'unknown',
          abbrev: data.chord.abbrev || '',
          confidence: 0.9,
          timestamp: Date.now(),
        });
      }
    }
  }, []);

  const handleChord = useCallback((chord) => {
    if (!chord) return;
    const name = chord.full || chord.root;
    if (!name || name === lastChordNameRef.current) return;

    lastChordNameRef.current = name;
    setCurrentChord({
      name,
      notes: [],
      root: chord.root,
      quality: chord.name || chord.abbrev || 'unknown',
      abbrev: chord.abbrev || '',
      confidence: 0.95,
      timestamp: Date.now(),
    });
  }, []);

  const startAudio = useCallback(async () => {
    try {
      setError(null);

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access is not supported in this browser');
      }

      // Tear down any previous detector before creating a new one
      if (detectorRef.current) {
        detectorRef.current.stop();
        detectorRef.current = null;
      }

      const detector = PitchPlease.create({
        fftSize: 8192,
        binCount: 400,
        stabilityFrames: 4,
        onUpdate: handleUpdate,
        onChord: handleChord,
        onError: (err) => {
          setError(err?.message || 'Audio detection error');
          setIsListening(false);
        },
      });

      detectorRef.current = detector;
      await detector.start();
      setIsListening(true);
    } catch (err) {
      setError(err?.message || 'Permission denied or microphone unavailable');
      setIsListening(false);
      detectorRef.current = null;
    }
  }, [handleUpdate, handleChord]);

  const stopAudio = useCallback(() => {
    if (detectorRef.current) {
      detectorRef.current.stop();
      detectorRef.current = null;
    }

    lastChordNameRef.current = null;
    silenceFramesRef.current = 0;
    pitchHoldRef.current = { midi: null, frames: 0, lastEmitted: null };
    setIsListening(false);
    setCurrentChord(null);
    setDetectedNotes([]);
    setSpectrumData(null);
    setCurrentPitch(null);
  }, []);

  // Full cleanup on unmount
  useEffect(() => {
    return () => {
      if (detectorRef.current) {
        detectorRef.current.stop();
        detectorRef.current = null;
      }
    };
  }, []);

  return {
    isListening,
    error,
    currentChord,
    detectedNotes,
    spectrumData,
    currentPitch,
    startAudio,
    stopAudio,
  };
}
