import { useState, useRef, useCallback, useEffect } from 'react';
import PitchPlease from '@markusstrasser/pitchplease';
import { midiToFrequency, midiToNoteName, NOTE_NAMES } from '../lib/musicTheory';
import {
  GATE_PROFILES,
  VOICE_MIDI_MIN,
  VOICE_MIDI_MAX,
  ANALYZE_MIDI_MIN,
  ANALYZE_MIDI_MAX,
  scoreVoiceFrame,
  createPitchSmoother,
} from '../lib/voiceFilter';

/**
 * Microphone pitch/chord detection powered by PitchPlease.
 * settings: { tuningA4, sensitivity, chordQualityFilter }
 * mode: 'analyze' | 'learn' — learn uses stricter voice-only gating.
 */
export function useAudioEngine(settings = {}, mode = 'analyze') {
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(null);
  const [currentChord, setCurrentChord] = useState(null);
  const [detectedNotes, setDetectedNotes] = useState([]);
  const [spectrumData, setSpectrumData] = useState(null);
  /** Live monophonic pitch for learner mode */
  const [currentPitch, setCurrentPitch] = useState(null);
  /** Voice activity for UI (noise vs real voice) */
  const [voiceActivity, setVoiceActivity] = useState({
    isVoice: false,
    confidence: 0,
    status: 'idle',
  });

  const detectorRef = useRef(null);
  const settingsRef = useRef(settings);
  const modeRef = useRef(mode);
  const lastChordNameRef = useRef(null);
  const silenceFramesRef = useRef(0);
  const pitchHoldRef = useRef({ midi: null, frames: 0, lastEmitted: null });
  const lastPitchUiAtRef = useRef(0);
  const lastSpectrumUiAtRef = useRef(0);
  const lastVoiceUiAtRef = useRef(0);
  const smootherRef = useRef(createPitchSmoother(mode));
  const voiceGateHoldRef = useRef(0);
  const noiseFramesRef = useRef(0);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    modeRef.current = mode;
    smootherRef.current.setMode(mode);
  }, [mode]);

  const clearPitchState = useCallback((keepLastEmitted = true) => {
    setCurrentPitch(null);
    pitchHoldRef.current = {
      midi: null,
      frames: 0,
      lastEmitted: keepLastEmitted ? pitchHoldRef.current.lastEmitted : null,
    };
  }, []);

  const handleUpdate = useCallback((data) => {
    const sensitivity = settingsRef.current?.sensitivity ?? 0.5;
    const tuningA4 = settingsRef.current?.tuningA4 ?? 440;
    const modeNow = modeRef.current === 'learn' ? 'learn' : 'analyze';
    const profile = GATE_PROFILES[modeNow];

    // Higher sensitivity = lower energy gate; learn mode stays stricter
    const baseGate = Math.max(8, Math.round((1 - sensitivity) * 60));
    const energyGate =
      modeNow === 'learn'
        ? Math.max(profile.energyFloor, baseGate + 6)
        : Math.max(profile.energyFloor, baseGate);

    const now = performance.now();

    // Throttle spectrum UI updates (~15 fps)
    if (data.spectrum?.length && now - lastSpectrumUiAtRef.current > 66) {
      lastSpectrumUiAtRef.current = now;
      setSpectrumData(Array.from(data.spectrum));
    }

    const publishVoice = (isVoice, confidence, status) => {
      if (now - lastVoiceUiAtRef.current < 80) return;
      lastVoiceUiAtRef.current = now;
      setVoiceActivity({ isVoice, confidence, status });
    };

    // ---- Energy / silence gate ----
    if (data.maxEnergy < energyGate) {
      silenceFramesRef.current += 1;
      noiseFramesRef.current += 1;
      voiceGateHoldRef.current = Math.max(0, voiceGateHoldRef.current - 1);
      smootherRef.current.push(null, { isVoice: false, score: 0 });

      if (silenceFramesRef.current > profile.dropFrames) {
        setDetectedNotes([]);
        clearPitchState(true);
        if (lastChordNameRef.current) {
          lastChordNameRef.current = null;
          setCurrentChord(null);
        }
        publishVoice(false, 0, 'silence');
      } else {
        publishVoice(false, 0, 'noise');
      }
      return;
    }

    silenceFramesRef.current = 0;

    // ---- Pick best fundamental (voice prefers lowest strong fund) ----
    const fundCount = data.fundCount || 0;
    const midiMin = modeNow === 'learn' ? VOICE_MIDI_MIN : ANALYZE_MIDI_MIN;
    const midiMax = modeNow === 'learn' ? VOICE_MIDI_MAX : ANALYZE_MIDI_MAX;

    let bestMidi = null;
    if (fundCount > 0 && data.fundMidis?.length) {
      bestMidi = data.fundMidis[0];
      for (let i = 1; i < fundCount; i++) {
        const m = data.fundMidis[i];
        if (m > midiMin && m < bestMidi) bestMidi = m;
      }
      if (bestMidi <= midiMin || bestMidi >= midiMax) {
        // Out of range — try any fund in range
        bestMidi = null;
        for (let i = 0; i < fundCount; i++) {
          const m = data.fundMidis[i];
          if (m > midiMin && m < midiMax) {
            if (bestMidi == null || m < bestMidi) bestMidi = m;
          }
        }
      }
    }

    // ---- Voice activity detection ----
    const voice = scoreVoiceFrame(data, modeNow, bestMidi);

    // Learn mode: only monophonic-ish tonal voice (reject cluttered noise peaks)
    if (modeNow === 'learn') {
      if (fundCount === 0 || fundCount > profile.monoMaxFunds) {
        voice.isVoice = false;
        voice.score *= 0.4;
      }
      if (voice.harm < profile.harmonicMin && voice.snr < profile.snrMin * 1.35) {
        voice.isVoice = false;
        voice.score *= 0.5;
      }
    }

    if (!voice.isVoice) {
      noiseFramesRef.current += 1;
      voiceGateHoldRef.current = Math.max(0, voiceGateHoldRef.current - 1);
      const smooth = smootherRef.current.push(null, voice);

      // In learn mode, never surface notes/chords from noise
      if (modeNow === 'learn') {
        if (noiseFramesRef.current > 6) {
          setDetectedNotes([]);
          if (smooth.midi == null) clearPitchState(true);
        }
        publishVoice(false, voice.score, 'noise');
        return;
      }

      // Analyze mode: still show notes if energy is strong, but damp pitch
      publishVoice(false, voice.score, 'noise');
      // Fall through lightly for chord detection only when SNR is decent
      if (voice.snr < profile.snrMin) {
        return;
      }
    } else {
      noiseFramesRef.current = 0;
      voiceGateHoldRef.current += 1;
    }

    // Require sustained voice before locking learn-mode detections
    const voiceLocked =
      modeNow === 'analyze' || voiceGateHoldRef.current >= profile.holdFrames;

    if (!voiceLocked) {
      smootherRef.current.push(bestMidi, voice);
      publishVoice(true, voice.score, 'warming');
      return;
    }

    publishVoice(true, voice.score, 'voice');

    // ---- Notes (polyphony for analyze; voice pitch-class for learn) ----
    if (modeNow === 'learn') {
      if (bestMidi != null) {
        const pc = ((Math.round(bestMidi) % 12) + 12) % 12;
        setDetectedNotes([NOTE_NAMES[pc]]);
      }
    } else {
      const notes = (data.pitchClasses || []).map(
        (pc) => PitchPlease.NOTE_NAMES[pc] ?? PitchPlease.midiToNote(60 + pc)
      );
      setDetectedNotes(notes);
    }

    // ---- Monophonic pitch with fluctuation damping ----
    if (bestMidi != null) {
      const smooth = smootherRef.current.push(bestMidi, voice);
      const trackedMidi = smooth.midi ?? bestMidi;

      const rounded = Math.round(trackedMidi);
      const pitchClass = ((rounded % 12) + 12) % 12;
      const hold = pitchHoldRef.current;

      // Stability on smoothed pitch
      if (hold.midi != null && Math.abs(trackedMidi - hold.midi) < 0.55) {
        hold.frames += 1;
      } else {
        hold.midi = trackedMidi;
        hold.frames = 1;
      }

      const stable =
        hold.frames >= (modeNow === 'learn' ? profile.holdFrames : 2) &&
        smooth.stable;
      const noteChanged =
        hold.lastEmitted == null ||
        Math.abs(trackedMidi - hold.lastEmitted) >= (modeNow === 'learn' ? 0.55 : 0.45);

      if (now - lastPitchUiAtRef.current > 40) {
        lastPitchUiAtRef.current = now;
        setCurrentPitch({
          midi: trackedMidi,
          rawMidi: bestMidi,
          roundedMidi: rounded,
          pitchClass,
          note: midiToNoteName(trackedMidi, true),
          noteClass: NOTE_NAMES[pitchClass],
          frequency: midiToFrequency(trackedMidi, tuningA4),
          stable,
          noteChanged: stable && noteChanged,
          isVoice: Boolean(voice.isVoice),
          voiceConfidence: voice.score,
          timestamp: Date.now(),
        });
      }

      if (stable && noteChanged) {
        hold.lastEmitted = trackedMidi;
      }
    } else {
      silenceFramesRef.current += 1;
      smootherRef.current.push(null, { isVoice: false, score: voice.score });
      if (silenceFramesRef.current > 8) {
        clearPitchState(true);
      }
    }

    // ---- Chords (analyze always; learn only on clear voice + stable) ----
    if (data.stable && data.chord) {
      if (modeNow === 'learn' && (!voice.isVoice || voice.score < profile.voiceScoreMin)) {
        return;
      }
      const name = data.chord.full || data.chord.root;
      if (name && name !== lastChordNameRef.current) {
        lastChordNameRef.current = name;
        setCurrentChord({
          name,
          notes: data.pitchClasses || [],
          root: data.chord.root,
          quality: data.chord.name || data.chord.abbrev || 'unknown',
          abbrev: data.chord.abbrev || '',
          confidence: modeNow === 'learn' ? voice.score : 0.9,
          timestamp: Date.now(),
        });
      }
    }
  }, [clearPitchState]);

  const handleChord = useCallback((chord) => {
    if (!chord) return;
    // Learn mode ignores onChord — only accept voice-gated chords from onUpdate
    if (modeRef.current === 'learn') return;

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

      if (detectorRef.current) {
        detectorRef.current.stop();
        detectorRef.current = null;
      }

      smootherRef.current.reset();
      voiceGateHoldRef.current = 0;
      noiseFramesRef.current = 0;

      const learn = modeRef.current === 'learn';
      const detector = PitchPlease.create({
        fftSize: 8192,
        binCount: 400,
        // More frames before chord lock; learn needs extra stability
        stabilityFrames: learn ? 6 : 4,
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
      setVoiceActivity({ isVoice: false, confidence: 0, status: 'listening' });
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
    noiseFramesRef.current = 0;
    voiceGateHoldRef.current = 0;
    pitchHoldRef.current = { midi: null, frames: 0, lastEmitted: null };
    smootherRef.current.reset();
    setIsListening(false);
    setCurrentChord(null);
    setDetectedNotes([]);
    setSpectrumData(null);
    setCurrentPitch(null);
    setVoiceActivity({ isVoice: false, confidence: 0, status: 'idle' });
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

  // When switching modes while listening, reset tracking so noise state doesn't leak
  useEffect(() => {
    smootherRef.current.reset();
    voiceGateHoldRef.current = 0;
    noiseFramesRef.current = 0;
    pitchHoldRef.current = { midi: null, frames: 0, lastEmitted: null };
    lastChordNameRef.current = null;
    setCurrentPitch(null);
    setCurrentChord(null);
    setDetectedNotes([]);
    setVoiceActivity({
      isVoice: false,
      confidence: 0,
      status: detectorRef.current ? 'listening' : 'idle',
    });
  }, [mode]);

  return {
    isListening,
    error,
    currentChord,
    detectedNotes,
    spectrumData,
    currentPitch,
    voiceActivity,
    startAudio,
    stopAudio,
  };
}
