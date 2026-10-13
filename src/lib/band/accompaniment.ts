// ソロの後ろで鳴る伴奏（ベース、コード、シンバル）の1小節ぶんを作る。ルールだけで決め、Jevは使わない。
import { bassPitch } from "../audio/instruments.ts";
import { chordTones, parseChord, pitchClassOf } from "../music/chord.ts";
import { soloCandidates } from "../music/solo-candidates.ts";
import type { Energy } from "../solo/energy.ts";

export type BandPart = "bass" | "comp" | "ride";

export type BandEvent = {
  part: BandPart;
  /** 小節の頭からの拍数（スウィングをかける前） */
  startBeats: number;
  durationBeats: number;
  /** MIDIノート番号。シンバルは空 */
  pitches: number[];
  /** 強さ（0〜1） */
  velocity: number;
};

export type AccompanimentOptions = {
  /** 1始まりの小節番号。4小節ごとの区切りに使う */
  bar: number;
  /** 次に進みそうなコード。分かっていれば、ベースが4拍目でそのルートへ寄る */
  nextChord?: string;
  /** 盛り上がり。静かなほど手数を減らし、激しいほど増やす。省略時は2 */
  energy?: Energy;
  /** true ならベースの4拍目を返さない。次のコードが決まってから bassApproach で求める */
  deferLastBass?: boolean;
};

type CompHit = { at: number; dur: number; velocity: number };
type CompPattern = { hits: readonly CompHit[]; energies: readonly Energy[] };

/** コード伴奏のリズムの型。裏拍から入る、短く切る、間を空ける、を混ぜる。盛り上がりごとに使う型を分ける */
export const COMP_PATTERNS: readonly CompPattern[] = [
  // 頭から長く伸ばす
  { energies: [1, 2], hits: [{ at: 0, dur: 3.5, velocity: 0.4 }] },
  // 前半は休み、3拍目の裏から伸ばす
  { energies: [1, 2], hits: [{ at: 2.5, dur: 1.4, velocity: 0.42 }] },
  // チャールストン: 1拍目と、2拍目の裏
  {
    energies: [2, 3],
    hits: [
      { at: 0, dur: 0.9, velocity: 0.45 },
      { at: 1.5, dur: 1.3, velocity: 0.5 },
    ],
  },
  // 2拍目と4拍目の裏を短く突く
  {
    energies: [2, 3, 4],
    hits: [
      { at: 1.5, dur: 0.4, velocity: 0.5 },
      { at: 3.5, dur: 0.5, velocity: 0.45 },
    ],
  },
  // 裏から入って、3拍目で受け、最後に次の小節へ食い込む
  {
    energies: [3, 4],
    hits: [
      { at: 0.5, dur: 0.4, velocity: 0.45 },
      { at: 2, dur: 1, velocity: 0.4 },
      { at: 3.5, dur: 0.5, velocity: 0.5 },
    ],
  },
  // 頭を短く突き、裏拍で畳みかける
  {
    energies: [4],
    hits: [
      { at: 0, dur: 0.4, velocity: 0.5 },
      { at: 1.5, dur: 0.5, velocity: 0.5 },
      { at: 2.5, dur: 0.4, velocity: 0.45 },
      { at: 3.5, dur: 0.5, velocity: 0.55 },
    ],
  },
  // 裏拍を4つ続けて押す
  {
    energies: [4],
    hits: [
      { at: 0.5, dur: 0.4, velocity: 0.5 },
      { at: 1.5, dur: 0.4, velocity: 0.5 },
      { at: 2.5, dur: 0.4, velocity: 0.5 },
      { at: 3.5, dur: 0.5, velocity: 0.55 },
    ],
  },
  // 1拍待って、2拍目から伸ばす
  { energies: [1, 2], hits: [{ at: 1, dur: 2.5, velocity: 0.4 }] },
  // 2分音符で2回。押さえ方を変えて動きを付ける
  {
    energies: [1, 2, 3],
    hits: [
      { at: 0, dur: 1.4, velocity: 0.4 },
      { at: 2, dur: 1.6, velocity: 0.42 },
    ],
  },
  // 頭を短く突いて、3拍目の裏から伸ばす
  {
    energies: [2, 3],
    hits: [
      { at: 0, dur: 0.4, velocity: 0.45 },
      { at: 2.5, dur: 1.2, velocity: 0.45 },
    ],
  },
  // 2拍目の裏と4拍目
  {
    energies: [2, 3],
    hits: [
      { at: 1.5, dur: 1, velocity: 0.45 },
      { at: 3, dur: 0.8, velocity: 0.4 },
    ],
  },
  // 表と裏を取り混ぜて細かく刻む
  {
    energies: [3, 4],
    hits: [
      { at: 0, dur: 0.5, velocity: 0.5 },
      { at: 1, dur: 0.4, velocity: 0.4 },
      { at: 2.5, dur: 0.5, velocity: 0.5 },
      { at: 3.5, dur: 0.5, velocity: 0.5 },
    ],
  },
];

const DEFAULT_ENERGY: Energy = 2;
const COMP_LOW = 52;
const BARS_PER_PHRASE = 4;

/** ルートからの半音数で、コードの3rd・5th・7thを返す */
function intervals(chord: string): { third: number; fifth: number; seventh: number } {
  const { root } = parseChord(chord);
  const [, third, fifth, seventh] = chordTones(chord).map((note) => (pitchClassOf(note) - root + 12) % 12);
  return { third: third!, fifth: fifth!, seventh: seventh! };
}

/** ベースが次のコードのルートへ半音で寄るときの音。いまのコードの5thから見て近い高さを狙う */
export function bassApproach(chord: string, nextChord: string): number {
  const fifthPitch = bassPitch(parseChord(chord).root) + intervals(chord).fifth;
  const nextRoot = bassPitch(parseChord(nextChord).root);
  const target = nextRoot + 12 <= fifthPitch + 6 ? nextRoot + 12 : nextRoot;
  return target > fifthPitch ? target - 1 : target + 1;
}

/**
 * ベース。静かなときは2分音符でルートと5thだけ、それ以外は4分音符で歩く。
 * 歩くときは、ルート、3rd、5thと上がり、4拍目は次のルートへ半音で寄る。
 */
function bass(chord: string, options: AccompanimentOptions, energy: Energy): BandEvent[] {
  const rootPitch = bassPitch(parseChord(chord).root);
  const { third, fifth, seventh } = intervals(chord);

  if (energy === 1) {
    return [rootPitch, rootPitch + fifth].map((pitch, index) => ({
      part: "bass",
      startBeats: index * 2,
      durationBeats: 1.9,
      pitches: [pitch],
      velocity: index === 0 ? 0.75 : 0.6,
    }));
  }

  const line = [rootPitch, rootPitch + third, rootPitch + fifth];
  if (!options.deferLastBass) {
    line.push(options.nextChord ? bassApproach(chord, options.nextChord) : rootPitch + seventh);
  }
  return line.map((pitch, beat) => ({
    part: "bass",
    startBeats: beat,
    durationBeats: 0.9,
    pitches: [pitch],
    velocity: beat === 0 ? 0.85 : 0.7,
  }));
}

const COMP_HIGH = 72;

/** ピッチクラスの並びを、中音域の低いほうから順に積み上げる */
function stack(pitchClasses: readonly number[]): number[] {
  const pitches: number[] = [];
  for (const pitchClass of pitchClasses) {
    const floor = pitches.length === 0 ? COMP_LOW : pitches.at(-1)! + 1;
    pitches.push(floor + ((pitchClass - (floor % 12) + 12) % 12));
  }
  // 高くなりすぎたら、全体を1オクターブ下げる
  return pitches.at(-1)! > COMP_HIGH ? pitches.map((pitch) => pitch - 12) : pitches;
}

/**
 * コードの押さえ方の一覧。どれもルートを省く（ルートはベースに任せる）。
 * 先頭は 3rd・5th・7th の基本形。続いて転回、9th や 13th を入れた色のある形、3rd と 7th だけの形。
 * 9th や 13th は、そのコードの上でぶつからない音のときだけ使う。
 */
export function compVoicings(chord: string): number[][] {
  // 候補音は ルート・9th・3rd・11th・5th・13th・7th の順に並んでいる
  const [, ninth, third, , fifth, thirteenth, seventh] = soloCandidates(chord).map((candidate) => ({
    pitchClass: pitchClassOf(candidate.note),
    usable: !candidate.avoid,
  }));
  const [t, f, s] = [third!.pitchClass, fifth!.pitchClass, seventh!.pitchClass];
  const shapes: number[][] = [
    [t, f, s],
    [s, t, f],
    [f, s, t],
    [t, s],
  ];
  if (ninth!.usable) {
    const n = ninth!.pitchClass;
    shapes.push([t, s, n], [s, n, t, f], [t, f, s, n]);
  }
  if (thirteenth!.usable) {
    shapes.push([s, t, thirteenth!.pitchClass]);
  }
  return shapes.map(stack);
}

/** 基本の押さえ方（3rd・5th・7th）。ユーザーが自分でコードを刻むときに鳴らす */
export function compVoicing(chord: string): number[] {
  return compVoicings(chord)[0]!;
}

/** シンバルレガート（チン・チンチキ）。2拍目と4拍目を強く、4小節ごとに刻みを足して区切る */
function ride(bar: number, energy: Energy): BandEvent[] {
  // 静かなときは撫でる程度、激しいときは強く叩く
  const loudness = 0.55 + 0.15 * energy;
  const hits = [
    { at: 0, velocity: 0.22 },
    { at: 1, velocity: 0.34 },
    { at: 1.5, velocity: 0.16 },
    { at: 2, velocity: 0.22 },
    { at: 3, velocity: 0.34 },
    { at: 3.5, velocity: 0.16 },
  ];
  if (bar % BARS_PER_PHRASE === 0) {
    hits.push({ at: 2.5, velocity: 0.2 }, { at: 3.25, velocity: 0.26 }, { at: 3.75, velocity: 0.3 });
    hits.sort((a, b) => a.at - b.at);
  }
  return hits.map((hit) => ({
    part: "ride",
    startBeats: hit.at,
    durationBeats: 0.1,
    pitches: [],
    velocity: Math.min(1, hit.velocity * loudness),
  }));
}

/**
 * 1小節ぶんの伴奏を返す。
 *
 * @param random コード伴奏のリズムの型と、1打ごとの押さえ方を選ぶ乱数（0以上1未満）
 */
export function accompaniment(
  chord: string,
  options: AccompanimentOptions,
  random: () => number = Math.random,
): BandEvent[] {
  const energy = options.energy ?? DEFAULT_ENERGY;
  const patterns = COMP_PATTERNS.filter((pattern) => pattern.energies.includes(energy));
  const pattern = patterns[Math.min(patterns.length - 1, Math.floor(random() * patterns.length))]!;
  // 1打ごとに押さえ方を選び直す。同じコードでも、使う音・転回・高さが変わって聞こえる
  const voicings = compVoicings(chord);
  const comp: BandEvent[] = pattern.hits.map((hit) => ({
    part: "comp",
    startBeats: hit.at,
    durationBeats: hit.dur,
    pitches: voicings[Math.min(voicings.length - 1, Math.floor(random() * voicings.length))]!,
    velocity: hit.velocity,
  }));
  return [...bass(chord, options, energy), ...comp, ...ride(options.bar, energy)];
}
