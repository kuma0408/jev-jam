// 画面と中継API（/api/solo）の間でやり取りする型
import type { BarResult, Strategy } from "./generate.ts";
import type { SlotChoice } from "./phrase.ts";

export type SoloRequest = {
  /** ソロを用意したいコード。次に選べる候補すべてを一度に渡す */
  chords: string[];
  strategy: Strategy;
  bpm: number;
  previousBar: SlotChoice[];
};

export type SoloResponse = {
  /** jev か mock */
  client: string;
  /** コードごとの結果。失敗したコードは null */
  results: Record<string, BarResult | null>;
};
