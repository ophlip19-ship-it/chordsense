import { useState, useRef, useCallback, useEffect } from 'react';
import PitchPlease from '@markusstrasser/pitchplease';

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

  const detectorRef = useRef(null);
  const settingsRef = useRef(settings);
  const lastChordNameRef = useRef(null);
  const silenceFramesRef = useRef(0);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const handleUpdate = useCallback((data) => {
    const sensitivity = settingsRef.current?.sensitivity ?? 0.5;
    // Higher sensitivity = lower energy gate
    const energyGate = Math.max(8, Math.round((1 - sensitivity) * 60));

    // Copy spectrum so React state is not tied to the reusable buffer
    if (data.spectrum?.length) {
      setSpectrumData(Array.from(data.spectrum));
    }

    if (data.maxEnergy < energyGate) {
      silenceFramesRef.current += 1;
      if (silenceFramesRef.current > 20) {
        setDetectedNotes([]);
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
    setIsListening(false);
    setCurrentChord(null);
    setDetectedNotes([]);
    setSpectrumData(null);
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
    startAudio,
    stopAudio,
  };
}
