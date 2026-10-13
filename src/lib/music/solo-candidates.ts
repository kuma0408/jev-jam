import { type ChordQuality, type NoteName, noteAbove, parseChord } from "./chord.ts";

export type SoloCandidate = {
  note: NoteName;
  /** コードに対する度数 */
  degree: string;
  kind: "chord-tone" | "tension";
  /** Jevに渡す説明。Jevは英語が得意で計数が苦手なので、響きの意味を英語で書く */
  description: string;
};

type ScaleStep = Pick<SoloCandidate, "degree" | "kind" | "description"> & { semitones: number };

const ROOT: Omit<ScaleStep, "semitones"> = {
  degree: "root",
  kind: "chord-tone",
  description: "Root of the chord. Stable and resolved, a home base to land on.",
};
const NINTH: Omit<ScaleStep, "semitones"> = {
  degree: "9th",
  kind: "tension",
  description: "Ninth. Open, airy color that floats above the chord.",
};
const FIFTH: Omit<ScaleStep, "semitones"> = {
  degree: "5th",
  kind: "chord-tone",
  description: "Fifth of the chord. Neutral and solid, good for passing through.",
};
const THIRTEENTH: Omit<ScaleStep, "semitones"> = {
  degree: "13th",
  kind: "tension",
  description: "Thirteenth. Bright, sophisticated jazz color.",
};

// コードの種類ごとに、ソロで使うスケールを1つ割り当てる
const SCALES: Record<ChordQuality, readonly ScaleStep[]> = {
  // ドリアン
  m7: [
    { ...ROOT, semitones: 0 },
    { ...NINTH, semitones: 2 },
    { semitones: 3, degree: "3rd", kind: "chord-tone", description: "Minor third. Defines the dark, soulful minor sound." },
    { semitones: 5, degree: "11th", kind: "tension", description: "Eleventh. Suspended, modal color typical of neo soul." },
    { ...FIFTH, semitones: 7 },
    { ...THIRTEENTH, semitones: 9 },
    { semitones: 10, degree: "7th", kind: "chord-tone", description: "Minor seventh. Smooth and mellow, defines the chord." },
  ],
  // ミクソリディアン
  "7": [
    { ...ROOT, semitones: 0 },
    { ...NINTH, semitones: 2 },
    { semitones: 4, degree: "3rd", kind: "chord-tone", description: "Major third. Strong guide tone that wants to resolve." },
    { semitones: 5, degree: "11th", kind: "tension", description: "Eleventh. Clashes with the third, use only as a quick passing note." },
    { ...FIFTH, semitones: 7 },
    { ...THIRTEENTH, semitones: 9 },
    { semitones: 10, degree: "7th", kind: "chord-tone", description: "Flat seventh. Bluesy guide tone that pulls toward the next chord." },
  ],
  // リディアン
  maj7: [
    { ...ROOT, semitones: 0 },
    { ...NINTH, semitones: 2 },
    { semitones: 4, degree: "3rd", kind: "chord-tone", description: "Major third. Warm and sweet, defines the major sound." },
    { semitones: 6, degree: "#11th", kind: "tension", description: "Sharp eleventh. Dreamy, floating Lydian color." },
    { ...FIFTH, semitones: 7 },
    { ...THIRTEENTH, semitones: 9 },
    { semitones: 11, degree: "7th", kind: "chord-tone", description: "Major seventh. Lush and sentimental, defines the chord." },
  ],
};

export function soloCandidates(symbol: string): SoloCandidate[] {
  const { root, quality } = parseChord(symbol);
  return SCALES[quality].map(({ semitones, ...rest }) => ({ note: noteAbove(root, semitones), ...rest }));
}
