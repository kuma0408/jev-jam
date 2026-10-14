// 五線譜の上で叩いて弾くためのルール。叩いた位置（線と間）から、いまのコードに合う音と、それをいちばん上にした和音を決める。
import { fitsChord } from "../solo/aim.ts";
import { chordTones, pitchClassOf } from "./chord.ts";

/** 真ん中のド（C4） */
const MIDDLE_C = 60;
/** ドレミファソラシの、ドからの半音数 */
const NATURALS = [0, 2, 4, 5, 7, 9, 11];
/** ピッチクラスごとの、五線の上での段（ドからの数）と、フラットが付くか。音名の表記（黒鍵はフラット）に合わせる */
const PLACES: readonly { letter: number; flat: boolean }[] = [
  { letter: 0, flat: false },
  { letter: 1, flat: true },
  { letter: 1, flat: false },
  { letter: 2, flat: true },
  { letter: 2, flat: false },
  { letter: 3, flat: false },
  { letter: 4, flat: true },
  { letter: 4, flat: false },
  { letter: 5, flat: true },
  { letter: 5, flat: false },
  { letter: 6, flat: true },
  { letter: 6, flat: false },
];

/** 五線の上での位置。step は真ん中のド（C4）を0として、線と間を1段ずつ数えたもの */
export function stepOf(pitch: number): { step: number; accidental: "flat" | null } {
  const octave = Math.floor((pitch - MIDDLE_C) / 12);
  const place = PLACES[((pitch % 12) + 12) % 12]!;
  return { step: octave * 7 + place.letter, accidental: place.flat ? "flat" : null };
}

/** その位置の音（ドレミファソラシ）がコードに合わなければ、近い順に試すずらし幅（半音） */
const SHIFTS = [0, -1, 1, -2, 2];

/** 叩いた位置で鳴らす音。その位置の音がコードとぶつかるなら、2半音以内の合う音にする */
export function pitchAtStep(step: number, chord: string): number {
  const octave = Math.floor(step / 7);
  const natural = MIDDLE_C + octave * 12 + NATURALS[((step % 7) + 7) % 7]!;
  return SHIFTS.map((shift) => natural + shift).find((pitch) => fitsChord(pitch, chord)) ?? natural;
}

/** 下に重ねる音の数 */
const UNDER_NOTES = 3;
/** これより低い音を押したら、下に重ねる音を2つに減らす（G3） */
const LOW_TOP = 55;
const LOW_UNDER_NOTES = 2;
/** これより低い音（E3 より下）は、上の音と3半音以上空ける。低い音域で音を詰めると濁る */
const LOW_REGISTER = 52;
const LOW_MIN_INTERVAL = 3;

/**
 * top をいちばん上にして、その下にコードの音を重ねた和音（低い順）。
 * ふつうは3つ、低いところを押したときは2つ重ねる。
 * すぐ下の半音でぶつかる音は飛ばし、さらに下の同じ音を使う。低い音域では、上の音と詰まりすぎる音も飛ばす
 */
export function voicingUnder(top: number, chord: string): number[] {
  const tones = new Set(chordTones(chord).map(pitchClassOf));
  tones.delete(top % 12);
  const count = top < LOW_TOP ? LOW_UNDER_NOTES : UNDER_NOTES;
  const under: number[] = [];
  for (let pitch = top - 2; under.length < count; pitch--) {
    if (!tones.has(((pitch % 12) + 12) % 12)) continue;
    const above = under[0] ?? top;
    if (pitch < LOW_REGISTER && above - pitch < LOW_MIN_INTERVAL) continue;
    under.unshift(pitch);
  }
  return [...under, top];
}
