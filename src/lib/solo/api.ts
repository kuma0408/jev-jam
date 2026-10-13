// 画面と中継API（/api/solo）の間でやり取りする型
import type { Energy, Touch } from "./energy.ts";
import type { SlotChoice } from "./phrase.ts";

/**
 * Jevへの聞き方。
 * cells: 半小節ごとにリズムと音の動きを選ばせる / batch: 8音を1回で聞く / two-stage: 方針を決めてから8音を聞く
 */
export type SoloStrategy = "cells" | "batch" | "two-stage";

export const SOLO_STRATEGIES: readonly SoloStrategy[] = ["cells", "batch", "two-stage"];

/** 1つの音。位置と長さはスウィングをかける前の、楽譜上の拍で表す */
export type SoloNote = {
  /** MIDIノート番号 */
  pitch: number;
  /** 小節の頭からの拍数 */
  startBeats: number;
  durationBeats: number;
  /** 強さ（0〜1） */
  velocity: number;
  /** スウィングをかけるか。3連符のように位置が決まっている音は false */
  swing: boolean;
  /** true なら、前の小節の最後の音を持ち越して伸ばす音。新しく発音しない */
  tie?: boolean;
};

/** 次の小節を依頼するときに送り返す、直前の小節の記録 */
export type SoloMemo = {
  /** cells の方式: [前半のリズム, 前半の動き, 後半のリズム, 後半の動き] のID */
  cells?: string[];
  /** cells の方式: 強弱 */
  dynamics?: string;
  /** cells の方式: 直近の数小節ぶんの、コードと cells（古い順）。最後の要素が直前の小節 */
  history?: { chord: string; cells: string[] }[];
  /** cells の方式: 直前の小節で選ばれた、その前のフレーズとの関係 */
  relation?: string;
  /** 1音ずつの方式: スロットごとの選択 */
  choices?: SlotChoice[];
};

/** 1小節ぶんのソロ */
export type SoloBar = {
  chord: string;
  notes: SoloNote[];
  /** 画面に出す、選ばれた内容の要約 */
  summary: string;
  /** 画面に出す、確率や方針などの補足 */
  details: string;
  /** Jevの呼び出しにかかった合計時間 */
  latencyMs: number;
  calls: number;
  /** この小節の最後の音の高さ。音が無ければ直前の音の高さ */
  lastPitch: number;
  memo: SoloMemo;
};

export type SoloRequest = {
  /** ソロを用意したいコード。次に選べる候補すべてを一度に渡す */
  chords: string[];
  strategy: SoloStrategy;
  bpm: number;
  /** 直前に鳴っていた音の高さ */
  previousPitch: number;
  /** ソロの楽器の音域（MIDIノート番号） */
  range: { low: number; high: number };
  /** 盛り上がり。つまみの値に、ユーザーの叩き方を足したもの */
  energy: Energy;
  /** ユーザーが伴奏をどれだけ叩いているか */
  touch: Touch;
  /** 4小節のまとまりの中で、これから作る小節が何番目か（0〜3） */
  barInPhrase: number;
  /** 直前の小節の最後の音が、小節の終わりまで鳴り続けているか。そうなら次の小節へ持ち越せる */
  sustained: boolean;
  memo: SoloMemo;
};

export type SoloResponse = {
  /** jev か mock */
  client: string;
  /** コードごとの結果。失敗したコードは null */
  results: Record<string, SoloBar | null>;
};
