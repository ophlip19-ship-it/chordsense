import { Chord, Key, Progression } from 'tonal';

const MAJOR_FUNCTIONS = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];

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
