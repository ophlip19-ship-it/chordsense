/**
 * Voice activity + pitch smoothing for ChordSense.
 * Filters ambient noise and damps pitch fluctuation so learn/analyze
 * modes only track real sung or spoken voice.
 */

/** Typical singing fundamental range (MIDI). */
export const VOICE_MIDI_MIN = 36; // ~C2
export const VOICE_MIDI_MAX = 88; // ~E6

/** Broader analysis range (instruments + voice). */
export const ANALYZE_MIDI_MIN = 28;
export const ANALYZE_MIDI_MAX = 96;

/**
 * Mode-tuned gate thresholds.
 * Learn is stricter: only stable, harmonic voice.
 */
export const GATE_PROFILES = {
  learn: {
    energyFloor: 18,
    snrMin: 1.55,
    voiceScoreMin: 0.58,
    holdFrames: 4,
    dropFrames: 10,
    jumpSemitones: 1.35,
    smoothAlpha: 0.28,
    monoMaxFunds: 3,
    harmonicMin: 0.35,
  },
  analyze: {
    energyFloor: 12,
    snrMin: 1.25,
    voiceScoreMin: 0.38,
    holdFrames: 2,
    dropFrames: 14,
    jumpSemitones: 2.2,
    smoothAlpha: 0.42,
    monoMaxFunds: 6,
    harmonicMin: 0.18,
  },
};

/**
 * SNR of loudest bin vs detector noise threshold.
 * @param {number} maxEnergy
 * @param {number} threshold
 */
export function estimateSnr(maxEnergy, threshold) {
  const t = Math.max(1, threshold || 1);
  return maxEnergy / t;
}

/**
 * Fraction of spectrum energy in the human-voice band (~80–3200 Hz).
 * Uses binMidi when available; falls back to low/mid bins.
 * @param {Float32Array|number[]|null} spectrum
 * @param {Float32Array|number[]|null} binMidi
 */
export function voiceBandRatio(spectrum, binMidi) {
  if (!spectrum?.length) return 0;

  let voice = 0;
  let total = 0;
  const n = spectrum.length;

  for (let i = 0; i < n; i++) {
    const e = spectrum[i] || 0;
    if (e <= 0) continue;
    total += e;

    let inBand = false;
    if (binMidi && binMidi.length > i) {
      const m = binMidi[i];
      // ~E2–G7 covers sung fundamentals + formants
      inBand = m >= 40 && m <= 103;
    } else {
      // Without MIDI map, treat lower 55% of bins as voice-ish
      inBand = i > 2 && i < n * 0.55;
    }
    if (inBand) voice += e;
  }

  return total > 0 ? voice / total : 0;
}

/**
 * How “peaky” the spectrum is (voice/tones) vs broadband noise.
 * High = few strong peaks; low = flat noise floor.
 * @param {Float32Array|number[]|null} peakEnergies
 * @param {number} peakCount
 * @param {number} maxEnergy
 */
export function spectralPeakiness(peakEnergies, peakCount, maxEnergy) {
  if (!peakCount || !maxEnergy || maxEnergy < 1) return 0;
  const top = Math.min(peakCount, 8);
  let sum = 0;
  for (let i = 0; i < top; i++) sum += peakEnergies[i] || 0;
  // Concentrated energy in a few peaks → more tonal
  const concentration = sum / (maxEnergy * top);
  // Prefer having some structure but not a wall of peaks
  const structure =
    peakCount >= 2 && peakCount <= 28
      ? 1
      : peakCount === 1
        ? 0.7
        : peakCount > 40
          ? 0.25
          : 0.55;
  return Math.min(1, concentration * 1.4) * structure;
}

/**
 * Score harmonic support for a candidate fundamental (voice-like).
 * Looks for energy near 2f, 3f, 4f in peak list or spectrum.
 * @param {number} fundMidi
 * @param {{ peakBins?: Float32Array, peakEnergies?: Float32Array, peakCount?: number, spectrum?: Float32Array, binMidi?: Float32Array }} data
 */
export function harmonicityScore(fundMidi, data = {}) {
  if (fundMidi == null || Number.isNaN(fundMidi)) return 0;

  const { peakCount = 0, peakEnergies, spectrum, binMidi } = data;
  const harmonics = [2, 3, 4, 5];
  let hits = 0;
  let weight = 0;

  // Prefer peak list when available
  if (peakCount > 0 && data.peakBins && binMidi?.length) {
    // Approximate peak MIDI from nearest binMidi if we only have bins
    // fundMidis already in MIDI; match harmonic MIDI targets
  }

  // Match against fundMidis-style MIDI using spectrum bins
  if (spectrum?.length && binMidi?.length) {
    for (const h of harmonics) {
      const target = fundMidi + 12 * Math.log2(h);
      let best = 0;
      // Search a narrow window around the harmonic
      for (let i = 0; i < binMidi.length; i++) {
        if (Math.abs(binMidi[i] - target) < 0.55) {
          best = Math.max(best, spectrum[i] || 0);
        }
      }
      if (best > 8) {
        hits += 1;
        weight += best / (h * 40);
      }
    }
  } else if (peakCount > 0 && peakEnergies) {
    // Weak fallback: more peaks often means partials for voice
    hits = Math.min(harmonics.length, Math.max(0, peakCount - 1));
    weight = hits * 0.15;
  }

  const coverage = hits / harmonics.length;
  return Math.min(1, coverage * 0.75 + Math.min(0.4, weight));
}

/**
 * Combined 0–1 voice likelihood for this frame.
 * @param {object} data PitchPlease onUpdate payload
 * @param {'learn'|'analyze'} mode
 * @param {number|null} candidateMidi
 */
export function scoreVoiceFrame(data, mode = 'learn', candidateMidi = null) {
  const profile = GATE_PROFILES[mode] || GATE_PROFILES.learn;
  const maxEnergy = data?.maxEnergy ?? 0;
  const threshold = data?.threshold ?? 1;
  const snr = estimateSnr(maxEnergy, threshold);
  const band = voiceBandRatio(data?.spectrum, data?.binMidi);
  const peaky = spectralPeakiness(
    data?.peakEnergies,
    data?.peakCount ?? 0,
    maxEnergy
  );

  const midiMin = mode === 'learn' ? VOICE_MIDI_MIN : ANALYZE_MIDI_MIN;
  const midiMax = mode === 'learn' ? VOICE_MIDI_MAX : ANALYZE_MIDI_MAX;

  let rangeScore = 0.5;
  if (candidateMidi != null && !Number.isNaN(candidateMidi)) {
    rangeScore =
      candidateMidi >= midiMin && candidateMidi <= midiMax
        ? 1
        : candidateMidi >= midiMin - 4 && candidateMidi <= midiMax + 4
          ? 0.45
          : 0.05;
  }

  const harm = harmonicityScore(candidateMidi, data);
  const fundCount = data?.fundCount ?? 0;
  const monoBonus =
    fundCount === 1
      ? 0.12
      : fundCount === 2
        ? 0.06
        : fundCount > profile.monoMaxFunds
          ? -0.18
          : 0;

  // Normalize SNR into 0–1
  const snrScore = Math.min(1, Math.max(0, (snr - 1) / 2.2));
  const energyScore = Math.min(1, maxEnergy / 90);

  let score =
    snrScore * 0.28 +
    band * 0.22 +
    peaky * 0.16 +
    harm * 0.18 +
    rangeScore * 0.12 +
    energyScore * 0.04 +
    monoBonus;

  // Hard fails for clearly non-voice frames
  if (maxEnergy < profile.energyFloor) score *= 0.2;
  if (snr < profile.snrMin * 0.85) score *= 0.45;
  if (fundCount === 0) score *= 0.25;
  if (mode === 'learn' && harm < profile.harmonicMin * 0.5 && snr < profile.snrMin * 1.2) {
    score *= 0.55;
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    snr,
    band,
    peaky,
    harm,
    isVoice: score >= profile.voiceScoreMin && snr >= profile.snrMin,
  };
}

/**
 * Stateful pitch smoother: rejects noise jumps and damps micro-fluctuation.
 */
export function createPitchSmoother(mode = 'learn') {
  let smoothed = null;
  let rawHold = null;
  let rawHoldFrames = 0;
  let voiceHold = 0;
  let silentFrames = 0;

  const reset = () => {
    smoothed = null;
    rawHold = null;
    rawHoldFrames = 0;
    voiceHold = 0;
    silentFrames = 0;
  };

  const setMode = (next) => {
    mode = next;
  };

  /**
   * @param {number|null} rawMidi
   * @param {{ isVoice: boolean, score: number }} voice
   * @returns {{ midi: number|null, stable: boolean, voiceHold: number, confidence: number }}
   */
  const push = (rawMidi, voice) => {
    const profile = GATE_PROFILES[mode] || GATE_PROFILES.learn;

    if (rawMidi == null || !voice?.isVoice) {
      silentFrames += 1;
      voiceHold = Math.max(0, voiceHold - 1);
      if (silentFrames > profile.dropFrames) {
        smoothed = null;
        rawHold = null;
        rawHoldFrames = 0;
        voiceHold = 0;
      }
      return {
        midi: smoothed,
        stable: false,
        voiceHold,
        confidence: voice?.score ?? 0,
      };
    }

    silentFrames = 0;
    voiceHold += 1;

    // Require a jump candidate to persist before following large pitch changes
    if (smoothed != null && Math.abs(rawMidi - smoothed) > profile.jumpSemitones) {
      if (rawHold != null && Math.abs(rawMidi - rawHold) < 0.55) {
        rawHoldFrames += 1;
      } else {
        rawHold = rawMidi;
        rawHoldFrames = 1;
      }
      if (rawHoldFrames < profile.holdFrames + 1) {
        // Keep previous smooth pitch while jump is unconfirmed
        return {
          midi: smoothed,
          stable: voiceHold >= profile.holdFrames,
          voiceHold,
          confidence: voice.score,
        };
      }
    } else {
      rawHold = rawMidi;
      rawHoldFrames = 1;
    }

    if (smoothed == null) {
      smoothed = rawMidi;
    } else {
      // Adaptive EMA: more damping when confidence is low or jump is small noise
      const conf = Math.max(0.15, Math.min(1, voice.score));
      const delta = Math.abs(rawMidi - smoothed);
      const microNoise = delta < 0.35;
      const alpha = microNoise
        ? profile.smoothAlpha * 0.45 * conf
        : profile.smoothAlpha * (0.55 + 0.45 * conf);
      smoothed = smoothed + (rawMidi - smoothed) * alpha;
    }

    return {
      midi: smoothed,
      stable: voiceHold >= profile.holdFrames,
      voiceHold,
      confidence: voice.score,
    };
  };

  return { push, reset, setMode };
}
