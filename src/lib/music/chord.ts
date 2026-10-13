// 音名はジャズの慣習に合わせて、黒鍵をフラット表記で統一する
const NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;

export type NoteName = (typeof NOTE_NAMES)[number];

// ルートからの半音数で表したコードの構成音
const CHORD_INTERVALS = {
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  "7": [0, 4, 7, 10],
} as const satisfies Record<string, readonly number[]>;

export type ChordQuality = keyof typeof CHORD_INTERVALS;

const NATURAL_PITCH_CLASSES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const CHORD_PATTERN = /^([A-G])([#b]?)(.*)$/;

export function chordTones(symbol: string): NoteName[] {
  const match = CHORD_PATTERN.exec(symbol);
  const letter = match?.[1];
  const quality = match?.[3];
  if (!match || letter === undefined || quality === undefined || !isChordQuality(quality)) {
    throw new Error(`未対応のコードです: ${symbol}`);
  }
  const accidental = match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0;
  const root = (NATURAL_PITCH_CLASSES[letter]! + accidental + 12) % 12;
  return CHORD_INTERVALS[quality].map((interval) => NOTE_NAMES[(root + interval) % 12]!);
}

function isChordQuality(value: string): value is ChordQuality {
  return Object.hasOwn(CHORD_INTERVALS, value);
}
