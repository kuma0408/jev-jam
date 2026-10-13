// 「合う音だけの鍵盤」の音を決める。弾けない人でも、どれを叩いても外れないようにする。
import { pitchClassOf } from "./chord.ts";
import { soloCandidates } from "./solo-candidates.ts";

/** 鍵盤の数。パソコンのキーの横一列（A S D F G H J K）に合わせる */
export const PAD_COUNT = 8;

/**
 * コードの上で伸ばしてよい音だけを、low 以上の高さから低い順に並べて返す（MIDIノート番号）。
 *
 * コードの音とぶつかる音は飛ばす。コードが変わっても、左ほど低く右ほど高い並びと、
 * おおよその高さは変わらないので、「右へ行けば上がる」という感覚のまま弾ける。
 */
export function padPitches(chord: string, low: number): number[] {
  const fitting = new Set(
    soloCandidates(chord)
      .filter((candidate) => !candidate.avoid)
      .map((candidate) => pitchClassOf(candidate.note)),
  );
  const pitches: number[] = [];
  for (let pitch = low; pitches.length < PAD_COUNT; pitch++) {
    if (fitting.has(pitch % 12)) pitches.push(pitch);
  }
  return pitches;
}
