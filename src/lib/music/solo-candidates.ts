import { type ChordQuality, type NoteName, noteAbove, parseChord } from "./chord.ts";

export type SoloCandidate = {
  note: NoteName;
  /** コードに対する度数 */
  degree: string;
  kind: "chord-tone" | "tension";
  /** Jevに渡す説明。Jevは英語が得意で計数が苦手なので、響きの意味を英語で書く */
  description: string;
};

type Step = { semitones: number; degree: string; description: string };

/** コードの種類ごとの、構成音と、テンションの選択肢（先頭が標準で、後ろは変化させた音） */
type ChordScale = {
  root: Step;
  third: Step;
  fifth: Step;
  seventh: Step;
  ninth: readonly Step[];
  eleventh: readonly Step[];
  thirteenth: readonly Step[];
};

const ROOT: Step = { semitones: 0, degree: "root", description: "Root of the chord. Stable and resolved, a home base to land on." };
const FIFTH: Step = { semitones: 7, degree: "5th", description: "Fifth of the chord. Neutral and solid, good for passing through." };
const NINTH: Step = { semitones: 2, degree: "9th", description: "Ninth. Open, airy color that floats above the chord." };
const THIRTEENTH: Step = { semitones: 9, degree: "13th", description: "Thirteenth. Bright, sophisticated jazz color." };

const SCALES: Record<ChordQuality, ChordScale> = {
  maj7: {
    root: ROOT,
    third: { semitones: 4, degree: "3rd", description: "Major third. Warm and sweet, defines the major sound." },
    fifth: FIFTH,
    seventh: { semitones: 11, degree: "7th", description: "Major seventh. Lush and sentimental, defines the chord." },
    ninth: [NINTH],
    eleventh: [
      { semitones: 5, degree: "11th", description: "Eleventh. Clashes with the major third, use only as a quick passing note." },
      { semitones: 6, degree: "#11th", description: "Sharp eleventh. Dreamy, floating Lydian color." },
    ],
    thirteenth: [THIRTEENTH],
  },
  m7: {
    root: ROOT,
    third: { semitones: 3, degree: "3rd", description: "Minor third. Defines the dark, soulful minor sound." },
    fifth: FIFTH,
    seventh: { semitones: 10, degree: "7th", description: "Minor seventh. Smooth and mellow, defines the chord." },
    ninth: [
      NINTH,
      { semitones: 1, degree: "b9th", description: "Flat ninth. Clashes harshly with the root, use only as a quick passing note." },
    ],
    eleventh: [{ semitones: 5, degree: "11th", description: "Eleventh. Suspended, modal color typical of neo soul." }],
    thirteenth: [
      THIRTEENTH,
      { semitones: 8, degree: "b13th", description: "Flat thirteenth. Clashes with the fifth, use only as a quick passing note." },
    ],
  },
  "7": {
    root: ROOT,
    third: { semitones: 4, degree: "3rd", description: "Major third. Strong guide tone that wants to resolve." },
    fifth: FIFTH,
    seventh: { semitones: 10, degree: "7th", description: "Flat seventh. Bluesy guide tone that pulls toward the next chord." },
    ninth: [
      NINTH,
      { semitones: 1, degree: "b9th", description: "Flat ninth. Dark, tense color that pulls strongly toward the next chord." },
    ],
    eleventh: [
      { semitones: 5, degree: "11th", description: "Eleventh. Clashes with the third, use only as a quick passing note." },
      { semitones: 6, degree: "#11th", description: "Sharp eleventh. Edgy, modern color that floats above the dominant chord." },
    ],
    thirteenth: [
      THIRTEENTH,
      { semitones: 8, degree: "b13th", description: "Flat thirteenth. Dark, melancholy tension that pulls toward a minor chord." },
    ],
  },
};

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];

/**
 * コードの上でソロに使える7音を、度数の低い順に返す。
 *
 * コードの種類だけでスケールを決めると、Cメジャーの曲のCmaj7でF#が鳴るように、
 * 曲のキーから外れた音が出る。そこで構成音はコードから決め、
 * 間を埋めるテンションはキーに含まれる音を優先して選ぶ。
 *
 * @param keyRoot 曲のキー（メジャー）のルートのピッチクラス。既定はC
 */
export function soloCandidates(symbol: string, keyRoot = 0): SoloCandidate[] {
  const { root, quality } = parseChord(symbol);
  const scale = SCALES[quality];
  const inKey = (step: Step) => MAJOR_SCALE.includes((root + step.semitones - keyRoot + 12) % 12);
  const pick = (options: readonly Step[]) => options.find(inKey) ?? options[0]!;

  const steps: [Step, SoloCandidate["kind"]][] = [
    [scale.root, "chord-tone"],
    [pick(scale.ninth), "tension"],
    [scale.third, "chord-tone"],
    [pick(scale.eleventh), "tension"],
    [scale.fifth, "chord-tone"],
    [pick(scale.thirteenth), "tension"],
    [scale.seventh, "chord-tone"],
  ];
  return steps.map(([step, kind]) => ({
    note: noteAbove(root, step.semitones),
    degree: step.degree,
    kind,
    description: step.description,
  }));
}
