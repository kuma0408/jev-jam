// ソロの「吹き方」をルールで決める。Jevは使わない（1音ごとの判断は回数が多すぎるため）。
import type { SoloNote } from "./api.ts";

/** 伸ばした音の中での音量の動き */
export type Shape = "flat" | "swell" | "fade" | "bloom";

/** 1音の吹き方 */
export type NoteExpression = {
  /** しゃくり: 目的の音より何半音下から入るか。0ならしゃくらない */
  scoopSemitones: number;
  /** しゃくり: 目的の音に届くまでの秒数 */
  scoopSeconds: number;
  /** 音量の動き。swell=ふくらむ、fade=しぼむ、bloom=ふくらんで戻る */
  shape: Shape;
  /** 音の後半にビブラートをかけるか */
  vibrato: boolean;
  /** 音の終わりで音程を落として消えるか（フォール） */
  fall: boolean;
  /** 音の立ち上がりにかける秒数。長いほどやわらかく、前の音となめらかにつながる */
  attackSeconds: number;
};

export type ExpressionOptions = {
  /** いまのテンポでの1拍の秒数 */
  secondsPerBeat: number;
};

/** 候補になった音のうち、実際にしゃくる割合。毎回かかると機械的に聞こえる */
const SCOOP_CHANCE = 0.6;
/** これより短い音は、曲げる間が無いのでしゃくらない */
const SCOOP_MIN_SECONDS = 0.2;
/** 聴いた評価で全音は深すぎたので、半音に固定する */
const SCOOP_SEMITONES = 1;
const SCOOP_MAX_SECONDS = 0.14;
/** 前の音からこれ以上跳び上がった音は、しゃくる候補にする（半音数） */
const LEAP_UP = 5;
/** 前の音が終わってからこれ以上空いたら、フレーズの切れ目とみなす（拍） */
const PHRASE_GAP_BEATS = 0.5;

const SHAPE_MIN_SECONDS = 0.5;
const VIBRATO_MIN_SECONDS = 0.6;
const FALL_MIN_SECONDS = 0.35;
const BEATS_PER_BAR = 4;
/** 小節の終わりまでこれ以内に迫る音は、次の小節へ持ち越すかもしれない音として扱う（拍） */
const BAR_END_MARGIN_BEATS = 0.05;
const FALL_CHANCE = 0.35;

const TONGUED_ATTACK = 0.012;
const SLURRED_ATTACK = 0.035;
/** これ以下の音程で切れ目なく進むときは、なめらかにつなぐ（半音数） */
const SLUR_INTERVAL = 2;
const SLUR_GAP_BEATS = 0.05;

function pickShape(value: number): Shape {
  if (value < 0.35) return "swell";
  if (value < 0.65) return "fade";
  if (value < 0.9) return "bloom";
  return "flat";
}

/**
 * 1小節ぶんの音それぞれの吹き方を決める。サックスらしく聞こえる場所に絞って表情を付ける。
 *
 * - しゃくり: フレーズの入り、休符の後、大きく跳び上がった先の音
 * - 音量の動きとビブラート: 伸ばした音
 * - フォール: フレーズの最後の長い音
 * - なめらかなつなぎ: 隣の音へ切れ目なく進むとき
 */
export function planExpression(
  notes: readonly SoloNote[],
  options: ExpressionOptions,
  random: () => number = Math.random,
): NoteExpression[] {
  return notes.map((note, index) => {
    const seconds = note.durationBeats * options.secondsPerBeat;
    const previous = notes[index - 1];
    const next = notes[index + 1];
    const gapBefore = previous ? note.startBeats - (previous.startBeats + previous.durationBeats) : Infinity;
    const gapAfter = next ? next.startBeats - (note.startBeats + note.durationBeats) : Infinity;

    const entering = gapBefore >= PHRASE_GAP_BEATS;
    const leaping = previous !== undefined && note.pitch - previous.pitch >= LEAP_UP;
    const scoop = seconds >= SCOOP_MIN_SECONDS && (entering || leaping) && random() < SCOOP_CHANCE;

    const ending = gapAfter >= PHRASE_GAP_BEATS;
    // 小節の終わりまで伸びる音は、次の小節へ持ち越すかもしれないので落とさない
    const reachesBarEnd = note.startBeats + note.durationBeats >= BEATS_PER_BAR - BAR_END_MARGIN_BEATS;
    const fall = seconds >= FALL_MIN_SECONDS && ending && !reachesBarEnd && random() < FALL_CHANCE;

    const slurred =
      previous !== undefined && gapBefore < SLUR_GAP_BEATS && Math.abs(note.pitch - previous.pitch) <= SLUR_INTERVAL;

    return {
      scoopSemitones: scoop ? SCOOP_SEMITONES : 0,
      scoopSeconds: scoop ? Math.min(SCOOP_MAX_SECONDS, seconds / 2) : 0,
      shape: seconds >= SHAPE_MIN_SECONDS ? pickShape(random()) : "flat",
      vibrato: seconds >= VIBRATO_MIN_SECONDS,
      fall,
      attackSeconds: slurred ? SLURRED_ATTACK : TONGUED_ATTACK,
    };
  });
}

/** 曲線の細かさ（秒）。10ミリ秒ごとに値を置く */
const STEP_SECONDS = 0.01;
/** ビブラートは音の後半から。伸ばしてから揺らすのがジャズのサックスらしい */
const VIBRATO_START = 0.4;
const VIBRATO_FADE_IN_SECONDS = 0.15;
/** 音の終わりのこの秒数で揺れを収め、目的の音程に戻す */
const VIBRATO_FADE_OUT_SECONDS = 0.12;
const VIBRATO_DEPTH_SEMITONES = 0.22;
const VIBRATO_RATE_HZ = 5.2;
/** フォールは音の終わりの3割で、この半音数だけ落とす */
const FALL_START = 0.7;
const FALL_DEPTH_SEMITONES = 3;
const FALL_GAIN_DROP = 0.8;

/** 音量の動きの、始まり・途中の頂点（位置と値）・終わり */
const SHAPE_POINTS: Record<Shape, readonly [position: number, level: number][]> = {
  flat: [
    [0, 1],
    [1, 1],
  ],
  swell: [
    [0, 0.5],
    [1, 1],
  ],
  fade: [
    [0, 1],
    [1, 0.45],
  ],
  bloom: [
    [0, 0.6],
    [0.6, 1],
    [1, 0.75],
  ],
};

/** 折れ線の上の値を、位置から求める */
function levelAt(points: readonly [number, number][], position: number): number {
  for (let index = 1; index < points.length; index++) {
    const [fromPosition, fromLevel] = points[index - 1]!;
    const [toPosition, toLevel] = points[index]!;
    if (position <= toPosition) {
      return fromLevel + (toLevel - fromLevel) * ((position - fromPosition) / (toPosition - fromPosition));
    }
  }
  return points.at(-1)![1];
}

/**
 * 1音の吹き方を、時間に沿った音程と音量の曲線に直す。
 *
 * @returns pitch: 目的の音程からのずれ（半音）/ gain: 音量の倍率（0〜1）。どちらも10ミリ秒ごとの値
 */
export function renderExpression(expression: NoteExpression, seconds: number): { pitch: number[]; gain: number[] } {
  const count = Math.max(2, Math.round(seconds / STEP_SECONDS) + 1);
  const vibratoFrom = seconds * VIBRATO_START;
  const fallFrom = seconds * FALL_START;
  const pitch: number[] = [];
  const gain: number[] = [];

  for (let index = 0; index < count; index++) {
    const position = index / (count - 1);
    const time = position * seconds;
    // フォールが始まってからの進み具合（0〜1）
    const falling = expression.fall && time > fallFrom ? (time - fallFrom) / (seconds - fallFrom) : 0;

    let offset = 0;
    if (expression.scoopSemitones > 0 && time < expression.scoopSeconds) {
      // 最初は速く、目的の音に近づくほどゆっくり上がる
      offset = -expression.scoopSemitones * (1 - time / expression.scoopSeconds) ** 1.5;
    } else if (falling > 0) {
      offset = -FALL_DEPTH_SEMITONES * falling ** 2;
    } else if (expression.vibrato && time >= vibratoFrom) {
      const since = time - vibratoFrom;
      const depth =
        VIBRATO_DEPTH_SEMITONES *
        Math.min(1, since / VIBRATO_FADE_IN_SECONDS) *
        Math.min(1, (seconds - time) / VIBRATO_FADE_OUT_SECONDS);
      offset = depth * Math.sin(2 * Math.PI * VIBRATO_RATE_HZ * since);
    }
    pitch.push(offset);

    const attack = Math.min(1, time / expression.attackSeconds);
    const level = levelAt(SHAPE_POINTS[expression.shape], position);
    gain.push(attack * level * (1 - FALL_GAIN_DROP * falling ** 2));
  }
  return { pitch, gain };
}
