// ソロの後ろで鳴る伴奏（ベース、コード、シンバル）の1小節ぶんを作る。ルールだけで決め、Jevは使わない。
import { bassPitch } from "../audio/instruments.ts";
import { chordTones, parseChord, pitchClassOf } from "../music/chord.ts";

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
};

type CompHit = { at: number; dur: number; velocity: number };

/** コード伴奏のリズムの型。裏拍から入る、短く切る、間を空ける、を混ぜる */
export const COMP_PATTERNS: readonly (readonly CompHit[])[] = [
  // チャールストン: 1拍目と、2拍目の裏
  [
    { at: 0, dur: 0.9, velocity: 0.45 },
    { at: 1.5, dur: 1.3, velocity: 0.5 },
  ],
  // 2拍目と4拍目の裏を短く突く
  [
    { at: 1.5, dur: 0.4, velocity: 0.5 },
    { at: 3.5, dur: 0.5, velocity: 0.45 },
  ],
  // 頭から長く伸ばす
  [{ at: 0, dur: 3.5, velocity: 0.4 }],
  // 裏から入って、3拍目で受け、最後に次の小節へ食い込む
  [
    { at: 0.5, dur: 0.4, velocity: 0.45 },
    { at: 2, dur: 1, velocity: 0.4 },
    { at: 3.5, dur: 0.5, velocity: 0.5 },
  ],
  // 前半は休み、3拍目の裏から伸ばす
  [{ at: 2.5, dur: 1.4, velocity: 0.45 }],
];

const COMP_LOW = 52;
const BARS_PER_PHRASE = 4;

/** ルートからの半音数で、コードの3rd・5th・7thを返す */
function intervals(chord: string): { third: number; fifth: number; seventh: number } {
  const { root } = parseChord(chord);
  const [, third, fifth, seventh] = chordTones(chord).map((note) => (pitchClassOf(note) - root + 12) % 12);
  return { third: third!, fifth: fifth!, seventh: seventh! };
}

/** 4分音符で歩くベース。ルート、3rd、5thと上がり、4拍目は次のルートへ半音で寄る */
function walkingBass(chord: string, nextChord: string | undefined): BandEvent[] {
  const rootPitch = bassPitch(parseChord(chord).root);
  const { third, fifth, seventh } = intervals(chord);
  const line = [rootPitch, rootPitch + third, rootPitch + fifth];

  if (nextChord) {
    // 次のルートを、いまの音に近い高さで狙い、下からか上から半音で寄る
    const nextRoot = bassPitch(parseChord(nextChord).root);
    const target = nextRoot + 12 <= line[2]! + 6 ? nextRoot + 12 : nextRoot;
    line.push(target > line[2]! ? target - 1 : target + 1);
  } else {
    line.push(rootPitch + seventh);
  }
  return line.map((pitch, beat) => ({
    part: "bass",
    startBeats: beat,
    durationBeats: 0.9,
    pitches: [pitch],
    velocity: beat === 0 ? 0.85 : 0.7,
  }));
}

/** ルートを省いた構成音を、エレピの中音域に並べる（ルートはベースに任せる） */
function compVoicing(chord: string): number[] {
  return chordTones(chord)
    .slice(1)
    .map((note) => {
      const pitchClass = pitchClassOf(note);
      return COMP_LOW + ((pitchClass - (COMP_LOW % 12) + 12) % 12);
    });
}

/** シンバルレガート（チン・チンチキ）。2拍目と4拍目を強く、4小節ごとに刻みを足して区切る */
function ride(bar: number): BandEvent[] {
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
  return hits.map((hit) => ({ part: "ride", startBeats: hit.at, durationBeats: 0.1, pitches: [], velocity: hit.velocity }));
}

/**
 * 1小節ぶんの伴奏を返す。
 *
 * @param random コード伴奏のリズムの型を選ぶ乱数（0以上1未満）
 */
export function accompaniment(
  chord: string,
  options: AccompanimentOptions,
  random: () => number = Math.random,
): BandEvent[] {
  const pattern = COMP_PATTERNS[Math.min(COMP_PATTERNS.length - 1, Math.floor(random() * COMP_PATTERNS.length))]!;
  const voicing = compVoicing(chord);
  const comp: BandEvent[] = pattern.map((hit) => ({
    part: "comp",
    startBeats: hit.at,
    durationBeats: hit.dur,
    pitches: voicing,
    velocity: hit.velocity,
  }));
  return [...walkingBass(chord, options.nextChord), ...comp, ...ride(options.bar)];
}
