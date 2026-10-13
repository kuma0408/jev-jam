// ソロの「吹き方」をルールで決める。Jevは使わない（1音ごとの判断は回数が多すぎるため）。
import type { SoloNote } from "./api.ts";

/** 下からしゃくって入る（スクープ）ときの、曲げ方 */
export type Scoop = {
  /** 目的の音より何半音下から入るか */
  semitones: number;
  /** 目的の音に届くまでの秒数 */
  seconds: number;
};

export type ExpressionOptions = {
  /** いまのテンポでの1拍の秒数 */
  secondsPerBeat: number;
};

/** 候補になった音のうち、実際にしゃくる割合。毎回かかると機械的に聞こえる */
const SCOOP_CHANCE = 0.6;
/** これより短い音は、曲げる間が無いのでしゃくらない */
const MIN_SECONDS = 0.2;
/** これ以上の長さの音は、全音下から深く入る */
const DEEP_SECONDS = 0.5;
const MAX_BEND_SECONDS = 0.14;
/** 前の音からこれ以上跳び上がった音は、しゃくる候補にする（半音数） */
const LEAP_UP = 5;
/** 前の音が終わってからこれ以上空いたら、入り直しとみなす（拍） */
const REENTRY_GAP_BEATS = 0.5;

/**
 * 1小節ぶんの音それぞれについて、下からしゃくって入るかどうかを決める。
 *
 * サックスらしく聞こえる場所に絞る: フレーズの入りの音、休符の後に入り直す音、大きく跳び上がった先の音。
 *
 * @returns 音と同じ並びで、しゃくる音には曲げ方、しゃくらない音には null
 */
export function planScoops(
  notes: readonly SoloNote[],
  options: ExpressionOptions,
  random: () => number = Math.random,
): (Scoop | null)[] {
  return notes.map((note, index) => {
    const seconds = note.durationBeats * options.secondsPerBeat;
    if (seconds < MIN_SECONDS) return null;

    const previous = notes[index - 1];
    const entering = !previous || note.startBeats - (previous.startBeats + previous.durationBeats) >= REENTRY_GAP_BEATS;
    const leaping = previous !== undefined && note.pitch - previous.pitch >= LEAP_UP;
    if (!entering && !leaping) return null;
    if (random() >= SCOOP_CHANCE) return null;

    return {
      semitones: seconds >= DEEP_SECONDS ? 2 : 1,
      seconds: Math.min(MAX_BEND_SECONDS, seconds / 2),
    };
  });
}
