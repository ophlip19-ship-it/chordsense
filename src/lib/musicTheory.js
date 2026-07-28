import { Chord, Key, Progression, Scale, Note, Midi } from 'tonal';

const MAJOR_FUNCTIONS = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];

/** Chromatic pitch-class names (sharps). */
export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Common keys for the learner base-key picker. */
export const COMMON_KEYS = [
  ...['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'F', 'Bb', 'Eb', 'Ab', 'Db'].map((tonic) => ({
    tonic,
    type: 'major',
    scaleName: `${tonic} major`,
  })),
  ...['A', 'E', 'B', 'F#', 'C#', 'G#', 'D', 'G', 'C', 'F', 'Bb', 'Eb'].map((tonic) => ({
    tonic,
    type: 'minor',
    scaleName: `${tonic} minor`,
  })),
];

/** Default cents tolerance before a pitch is considered off-key. */
export const DEFAULT_CENTS_TOLERANCE = 30;

/**
 * Normalize tonal major-key roman strings (IIm, VIm, VII0, Imaj7…) to diatonic functions.
 */
function toMajorFunction(roman) {
  if (!roman) return null;

  const cleaned = roman
    .replace(/maj7|m7b5|m7|mM7|dim7|ø7|ø|dim|°|0|aug|\+|7|6|9|11|13|add\d*/gi, '')
    .replace(/m$/i, '')
    .replace(/[^b#ivxIVX]/g, '');

  if (!cleaned) return null;

  const upper = cleaned.toUpperCase();
  const map = {
    I: 'I',
    II: 'ii',
    III: 'iii',
    IV: 'IV',
    V: 'V',
    VI: 'vi',
    VII: 'vii°',
  };

  return map[upper] || null;
}

/**
 * Convert tonal romans (computed against a minor tonic) into classical minor labels.
 * e.g. Im → i, IVm → iv, bVI → VI, IIdim → ii°
 */
function toMinorFunction(roman) {
  if (!roman) return null;

  const raw = roman.trim();
  const table = [
    [/^Im(aj7|7)?$/i, 'i'],
    [/^I$/i, 'i'],
    [/^II(dim|°|m7b5|0).*/i, 'ii°'],
    [/^IIm$/i, 'ii'],
    [/^bIII.*/i, 'III'],
    [/^IVm.*/i, 'iv'],
    [/^IV$/i, 'IV'],
    [/^Vm.*/i, 'v'],
    [/^V(7)?$/i, 'V'],
    [/^bVI.*/i, 'VI'],
    [/^bVII.*/i, 'VII'],
    [/^VII.*/i, 'vii°'],
  ];

  for (const [re, label] of table) {
    if (re.test(raw)) return label;
  }

  return raw;
}

/**
 * Infer scale/key from a history of chords.
 */
export function detectKeyFromProgression(chords = []) {
  if (chords.length === 0) {
    return { tonic: 'C', type: 'major', scaleName: 'C major' };
  }

  const parsed = chords.map((c) => Chord.get(c));
  const roots = parsed.map((info) => info.tonic || info.root).filter(Boolean);

  if (roots.length === 0) {
    return { tonic: 'C', type: 'major', scaleName: 'C major' };
  }

  const rootCounts = {};
  roots.forEach((r) => {
    rootCounts[r] = (rootCounts[r] || 0) + 1;
  });

  const mostFrequentRoot = Object.keys(rootCounts).reduce(
    (a, b) => (rootCounts[a] >= rootCounts[b] ? a : b),
    roots[0]
  );

  // Count how often the tonic candidate appears as a minor chord
  const minorHits = parsed.filter((info) => {
    const tonic = info.tonic || info.root;
    if (tonic !== mostFrequentRoot) return false;
    const type = `${info.type || ''} ${info.quality || ''} ${info.symbol || ''}`.toLowerCase();
    return type.includes('minor') || /(^|[^a-z])m([^a-z]|$)/.test(info.symbol || '');
  }).length;

  const majorHits = rootCounts[mostFrequentRoot] - minorHits;
  const type = minorHits > majorHits ? 'minor' : 'major';

  return {
    tonic: mostFrequentRoot,
    type,
    scaleName: `${mostFrequentRoot} ${type}`,
  };
}

/**
 * Roman numeral of a chord relative to the current key.
 */
export function getRomanNumeral(chordName, keyTonic, keyType = 'major') {
  if (!chordName || !keyTonic) return '';

  try {
    const [roman] = Progression.toRomanNumerals(keyTonic, [chordName]);
    if (!roman) return '';

    if (keyType === 'minor') {
      return toMinorFunction(roman) || roman;
    }

    return toMajorFunction(roman) || roman;
  } catch {
    return '';
  }
}

function resolveMajorChord(targetFn, triads) {
  const scaleIndex = MAJOR_FUNCTIONS.indexOf(targetFn);
  if (scaleIndex !== -1 && triads[scaleIndex]) return triads[scaleIndex];

  try {
    const [resolved] = Progression.fromRomanNumerals(
      // derive tonic from first triad if needed — caller passes triads from key
      Chord.get(triads[0] || 'C').tonic || 'C',
      [targetFn]
    );
    return resolved;
  } catch {
    return null;
  }
}

function resolveMinorChord(targetFn, minorKey) {
  const natural = minorKey.natural?.triads || [];
  const harmonic = minorKey.harmonic?.triads || [];

  const map = {
    i: natural[0],
    'ii°': natural[1],
    ii: natural[1],
    III: natural[2],
    iv: natural[3],
    v: natural[4],
    V: harmonic[4] || natural[4], // prefer harmonic dominant
    VI: natural[5],
    VII: natural[6],
    'vii°': harmonic[6] || natural[1],
  };

  return map[targetFn] || null;
}

/**
 * Suggest next chords based on common harmonic movement.
 */
export function getNextChordSuggestions(lastChord, keyInfo) {
  if (!lastChord || !keyInfo?.tonic) return [];

  const isMinor = keyInfo.type === 'minor';
  const roman = getRomanNumeral(lastChord, keyInfo.tonic, keyInfo.type || 'major');
  const fn = isMinor ? toMinorFunction(roman) || roman : toMajorFunction(roman) || roman;

  const majorMovement = {
    I: ['IV', 'V', 'vi', 'ii'],
    ii: ['V', 'vii°', 'IV'],
    iii: ['vi', 'IV'],
    IV: ['V', 'I', 'ii'],
    V: ['I', 'vi'],
    vi: ['ii', 'IV', 'V'],
    'vii°': ['I', 'vi'],
  };

  const minorMovement = {
    i: ['iv', 'V', 'VII', 'VI'],
    'ii°': ['V', 'i'],
    ii: ['V', 'i'],
    III: ['VI', 'iv'],
    iv: ['V', 'i', 'VII'],
    v: ['i', 'VI'],
    V: ['i', 'VI'],
    VI: ['III', 'iv', 'i'],
    VII: ['III', 'i'],
    'vii°': ['i'],
  };

  const movement = isMinor ? minorMovement : majorMovement;
  const nextFns = movement[fn] || (isMinor ? ['i', 'iv', 'V', 'VI'] : ['I', 'IV', 'V', 'vi']);

  if (isMinor) {
    const minorKey = Key.minorKey(keyInfo.tonic);
    return nextFns.map((targetFn, index) => ({
      chord: resolveMinorChord(targetFn, minorKey) || `${keyInfo.tonic}m`,
      roman: targetFn,
      reason: index === 0 ? 'Strong resolution' : 'Diatonic progression',
    }));
  }

  const majorKey = Key.majorKey(keyInfo.tonic);
  const triads = majorKey.triads || [];

  return nextFns.map((targetFn, index) => ({
    chord: resolveMajorChord(targetFn, triads) || keyInfo.tonic,
    roman: targetFn,
    reason: index === 0 ? 'Strong resolution' : 'Diatonic progression',
  }));
}

/**
 * Scale pitch classes (0–11) for a tonic + major/minor type.
 */
export function getScalePitchClasses(tonic, type = 'major') {
  if (!tonic) return [];
  const scaleName = type === 'minor' ? `${tonic} minor` : `${tonic} major`;
  const notes = Scale.get(scaleName).notes || [];
  return notes
    .map((n) => Note.chroma(n))
    .filter((c) => typeof c === 'number' && !Number.isNaN(c));
}

/**
 * Named scale degrees for display (e.g. C D E F G A B).
 */
export function getScaleNotes(tonic, type = 'major') {
  if (!tonic) return [];
  const scaleName = type === 'minor' ? `${tonic} minor` : `${tonic} major`;
  return Scale.get(scaleName).notes || [];
}

/**
 * MIDI note number → display name with octave (e.g. A4).
 */
export function midiToNoteName(midi, withOctave = true) {
  if (midi == null || Number.isNaN(midi)) return '—';
  const rounded = Math.round(midi);
  try {
    return withOctave ? Note.fromMidi(rounded) || '—' : NOTE_NAMES[((rounded % 12) + 12) % 12];
  } catch {
    return NOTE_NAMES[((rounded % 12) + 12) % 12] || '—';
  }
}

/**
 * Frequency (Hz) from MIDI, respecting A4 tuning.
 */
export function midiToFrequency(midi, tuningA4 = 440) {
  if (midi == null || Number.isNaN(midi)) return null;
  return tuningA4 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Find the nearest scale-degree MIDI to a continuous midi value.
 */
export function nearestScaleMidi(midi, scalePcs) {
  if (midi == null || !scalePcs?.length) return null;

  let best = null;
  const floor = Math.floor(midi);

  // Search nearby octaves of every scale pitch class
  for (const pc of scalePcs) {
    for (const base of [floor - 12, floor, floor + 12]) {
      const candidate = base - (((base % 12) + 12) % 12) + pc;
      // Normalize into a sensible window around the sung pitch
      let m = candidate;
      while (m < midi - 6) m += 12;
      while (m > midi + 6) m -= 12;
      const cents = (midi - m) * 100;
      if (!best || Math.abs(cents) < Math.abs(best.cents)) {
        best = {
          midi: m,
          pitchClass: pc,
          note: midiToNoteName(m),
          noteClass: NOTE_NAMES[pc],
          cents,
        };
      }
    }
  }

  return best;
}

/**
 * Analyze a sung pitch against a base key.
 * Returns whether the singer is in-key, flat (too low), or sharp (too high),
 * plus correction suggestions.
 *
 * @param {number} midi continuous MIDI from pitch detector
 * @param {{ tonic: string, type?: string }} keyInfo
 * @param {{ centsTolerance?: number }} options
 */
export function analyzePitchAgainstKey(midi, keyInfo, options = {}) {
  const centsTolerance = options.centsTolerance ?? DEFAULT_CENTS_TOLERANCE;

  if (midi == null || Number.isNaN(midi) || !keyInfo?.tonic) {
    return {
      active: false,
      inKey: false,
      inTune: false,
      status: 'idle',
      direction: null,
      cents: 0,
      sungNote: null,
      targetNote: null,
      targetMidi: null,
      pitchClass: null,
      scaleNotes: [],
      suggestions: [],
      message: 'Sing a note to begin…',
    };
  }

  const type = keyInfo.type || 'major';
  const scalePcs = getScalePitchClasses(keyInfo.tonic, type);
  const scaleNotes = getScaleNotes(keyInfo.tonic, type);
  const nearest = nearestScaleMidi(midi, scalePcs);

  if (!nearest) {
    return {
      active: true,
      inKey: false,
      inTune: false,
      status: 'unknown',
      direction: null,
      cents: 0,
      sungNote: midiToNoteName(midi),
      targetNote: null,
      targetMidi: null,
      pitchClass: ((Math.round(midi) % 12) + 12) % 12,
      scaleNotes,
      suggestions: scaleNotes.slice(0, 4).map((n) => ({
        action: 'aim',
        note: n,
        label: `Try ${n}`,
        detail: `Stay in ${keyInfo.scaleName || `${keyInfo.tonic} ${type}`}`,
      })),
      message: 'Could not map pitch to the scale',
    };
  }

  const cents = nearest.cents; // positive = sung higher than target
  const absCents = Math.abs(cents);
  const pitchClass = ((Math.round(midi) % 12) + 12) % 12;
  const chromaticNote = NOTE_NAMES[pitchClass];
  const inScaleClass = scalePcs.includes(pitchClass);
  // Treat "in key" when close to a scale degree (even if slightly off pitch)
  const inKey = absCents <= 50 || inScaleClass;
  const inTune = absCents <= centsTolerance;

  let status = 'in-tune';
  let direction = null;
  let message = `On pitch — ${nearest.noteClass}`;

  if (!inTune) {
    if (cents > 0) {
      status = 'too-high';
      direction = 'high';
      message = `Too high — lower toward ${nearest.noteClass}`;
    } else {
      status = 'too-low';
      direction = 'low';
      message = `Too low — raise toward ${nearest.noteClass}`;
    }
  }

  if (!inScaleClass && absCents > centsTolerance) {
    // Clearly off the scale, not just slightly detuned
    status = direction === 'high' ? 'off-key-high' : 'off-key-low';
    message =
      direction === 'high'
        ? `Off-key (sharp of ${nearest.noteClass}) — slide down`
        : `Off-key (flat of ${nearest.noteClass}) — slide up`;
  }

  const suggestions = buildSingingSuggestions({
    status,
    direction,
    nearest,
    scaleNotes,
    scalePcs,
    midi,
    keyInfo,
    chromaticNote,
  });

  return {
    active: true,
    inKey: inKey && (inScaleClass || inTune),
    inTune,
    status,
    direction,
    cents: Math.round(cents),
    absCents: Math.round(absCents),
    sungNote: midiToNoteName(midi),
    sungNoteClass: chromaticNote,
    targetNote: nearest.note,
    targetNoteClass: nearest.noteClass,
    targetMidi: nearest.midi,
    pitchClass,
    scaleNotes,
    suggestions,
    message,
  };
}

function buildSingingSuggestions({
  status,
  direction,
  nearest,
  scaleNotes,
  scalePcs,
  midi,
  keyInfo,
  chromaticNote,
}) {
  const suggestions = [];
  const keyLabel = keyInfo.scaleName || `${keyInfo.tonic} ${keyInfo.type || 'major'}`;

  if (status === 'in-tune') {
    suggestions.push({
      action: 'hold',
      note: nearest.noteClass,
      label: `Hold ${nearest.noteClass}`,
      detail: `You're locked to ${keyLabel}`,
    });

    // Suggest neighboring scale degrees for melodic motion
    const idx = scaleNotes.findIndex(
      (n) => Note.chroma(n) === nearest.pitchClass
    );
    if (idx !== -1) {
      const up = scaleNotes[(idx + 1) % scaleNotes.length];
      const down = scaleNotes[(idx - 1 + scaleNotes.length) % scaleNotes.length];
      suggestions.push({
        action: 'move-up',
        note: up,
        label: `Step up to ${up}`,
        detail: 'Next scale degree higher',
      });
      suggestions.push({
        action: 'move-down',
        note: down,
        label: `Step down to ${down}`,
        detail: 'Next scale degree lower',
      });
    }
    return suggestions;
  }

  if (direction === 'high') {
    suggestions.push({
      action: 'lower',
      note: nearest.noteClass,
      label: `Lower to ${nearest.noteClass}`,
      detail: 'You are singing sharp / too high',
    });
  } else if (direction === 'low') {
    suggestions.push({
      action: 'raise',
      note: nearest.noteClass,
      label: `Raise to ${nearest.noteClass}`,
      detail: 'You are singing flat / too low',
    });
  }

  // Alternate nearby scale notes as safe landing spots
  const alternatives = [];
  for (const pc of scalePcs) {
    const target = nearestScaleMidi(midi, [pc]);
    if (!target || target.noteClass === nearest.noteClass) continue;
    alternatives.push(target);
  }
  alternatives
    .sort((a, b) => Math.abs(a.cents) - Math.abs(b.cents))
    .slice(0, 2)
    .forEach((alt) => {
      suggestions.push({
        action: 'aim',
        note: alt.noteClass,
        label: `Aim for ${alt.noteClass}`,
        detail: `In-key option in ${keyLabel}`,
      });
    });

  if (chromaticNote && !scalePcs.includes(Note.chroma(chromaticNote) ?? -1)) {
    suggestions.push({
      action: 'avoid',
      note: chromaticNote,
      label: `Avoid ${chromaticNote}`,
      detail: `${chromaticNote} is outside ${keyLabel}`,
    });
  }

  return suggestions;
}

/**
 * Summarize a melodic note history for song-progression analysis.
 * history items: { note, noteClass, midi, inKey, timestamp, durationMs? }
 */
export function analyzeSongProgression(history = [], keyInfo = null) {
  if (!history.length) {
    return {
      noteCount: 0,
      uniqueNotes: [],
      inKeyPercent: 0,
      offKeyCount: 0,
      contour: [],
      intervals: [],
      phraseCount: 0,
      mostUsed: null,
      range: null,
      impliedChords: [],
      summary: 'Start singing to build a progression…',
    };
  }

  const noteClasses = history.map((h) => h.noteClass || h.note).filter(Boolean);
  const uniqueNotes = [...new Set(noteClasses)];
  const inKeyCount = history.filter((h) => h.inKey).length;
  const inKeyPercent = Math.round((inKeyCount / history.length) * 100);
  const offKeyCount = history.length - inKeyCount;

  // Contour: rising / falling / static steps
  const contour = [];
  const intervals = [];
  for (let i = 1; i < history.length; i++) {
    const a = history[i - 1].midi;
    const b = history[i].midi;
    if (a == null || b == null) continue;
    const semitones = Math.round(b) - Math.round(a);
    const dir = semitones > 0 ? 'up' : semitones < 0 ? 'down' : 'same';
    contour.push(dir);
    if (semitones !== 0) {
      intervals.push({
        from: history[i - 1].noteClass,
        to: history[i].noteClass,
        semitones,
        label: formatInterval(semitones),
      });
    }
  }

  // Phrase breaks: gaps > 1.2s between notes
  let phraseCount = 1;
  for (let i = 1; i < history.length; i++) {
    const gap = (history[i].timestamp || 0) - (history[i - 1].timestamp || 0);
    if (gap > 1200) phraseCount += 1;
  }

  // Most-used pitch class
  const counts = {};
  noteClasses.forEach((n) => {
    counts[n] = (counts[n] || 0) + 1;
  });
  const mostUsed = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0] || null;

  const midis = history.map((h) => h.midi).filter((m) => m != null);
  const lo = midis.length ? Math.min(...midis.map(Math.round)) : null;
  const hi = midis.length ? Math.max(...midis.map(Math.round)) : null;
  const range =
    lo != null && hi != null
      ? {
          low: midiToNoteName(lo),
          high: midiToNoteName(hi),
          semitones: hi - lo,
        }
      : null;

  // Implied harmony from recent in-key pitch classes
  const scalePcs = keyInfo?.tonic
    ? new Set(getScalePitchClasses(keyInfo.tonic, keyInfo.type || 'major'))
    : null;
  const recentPcs = [];
  for (const h of history.slice(-10)) {
    const pc = h.pitchClass ?? Note.chroma(h.noteClass);
    if (typeof pc !== 'number') continue;
    if (scalePcs && !scalePcs.has(pc)) continue;
    if (!recentPcs.includes(pc)) recentPcs.push(pc);
  }
  const impliedChords = [];
  if (recentPcs.length >= 2) {
    try {
      const noteNames = recentPcs.map((pc) => NOTE_NAMES[pc]);
      let matched = Chord.detect(noteNames) || [];
      // Fall back to triad subsets if full set doesn't match
      if (!matched.length && noteNames.length > 3) {
        matched = Chord.detect(noteNames.slice(0, 3)) || [];
      }
      matched.slice(0, 3).forEach((name) => {
        const roman = keyInfo
          ? getRomanNumeral(name, keyInfo.tonic, keyInfo.type || 'major')
          : '';
        impliedChords.push({ chord: name, roman });
      });
    } catch {
      // ignore detection failures
    }
  }

  const rising = contour.filter((c) => c === 'up').length;
  const falling = contour.filter((c) => c === 'down').length;
  let motion = 'steady';
  if (rising > falling + 1) motion = 'ascending';
  else if (falling > rising + 1) motion = 'descending';
  else if (rising + falling > 0) motion = 'undulating';

  const summary = [
    `${history.length} notes · ${inKeyPercent}% in key`,
    mostUsed ? `center on ${mostUsed}` : null,
    motion !== 'steady' ? `${motion} line` : null,
    range ? `range ${range.low}–${range.high}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    noteCount: history.length,
    uniqueNotes,
    inKeyPercent,
    offKeyCount,
    contour,
    intervals: intervals.slice(-6),
    phraseCount,
    mostUsed,
    range,
    impliedChords,
    motion,
    summary,
  };
}

function formatInterval(semitones) {
  const abs = Math.abs(semitones);
  const names = {
    1: 'm2',
    2: 'M2',
    3: 'm3',
    4: 'M3',
    5: 'P4',
    6: 'TT',
    7: 'P5',
    8: 'm6',
    9: 'M6',
    10: 'm7',
    11: 'M7',
    12: 'P8',
  };
  const label = names[abs] || `${abs}st`;
  return semitones > 0 ? `↑${label}` : semitones < 0 ? `↓${label}` : '—';
}

/**
 * Build a key info object from tonic + type.
 */
export function makeKeyInfo(tonic, type = 'major') {
  return {
    tonic,
    type,
    scaleName: `${tonic} ${type}`,
  };
}
