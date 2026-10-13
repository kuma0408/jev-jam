// 小節の最後の音を、次のコードに合わせるためのルール。
// コード選択に締切を設け、次のコードが決まってから最後の1拍を鳴らすことで使えるようになった。
import { pitchClassOf } from "../music/chord.ts";
import { soloCandidates } from "../music/solo-candidates.ts";

/**
 * その音を、このコードの上で伸ばしてよいか。
 * コードのスケールに含まれ、かつ響きがぶつかる音でなければよい。
 */
export function fitsChord(pitch: number, chord: string): boolean {
  const pitchClass = ((pitch % 12) + 12) % 12;
  const candidate = soloCandidates(chord).find((note) => pitchClassOf(note.note) === pitchClass);
  return candidate !== undefined && !candidate.avoid;
}

/** 近い順に試す、音を動かす幅（半音）。同じ近さなら下へ動かすほうを先に試す */
const SHIFTS = [-1, 1, -2, 2];

/**
 * 小節の最後の音を、次のコードに合う音へ寄せる。
 *
 * そのまま合うなら動かさない。合わなければ、2半音以内で次のコードに合う音へ動かす。
 * いまのコードにも合う音があればそれを優先する（どちらのコードの上で鳴っても外れないので、小節をまたいで伸ばせる）。
 */
export function aimPitch(pitch: number, currentChord: string, nextChord: string): number {
  if (fitsChord(pitch, nextChord)) return pitch;
  const options = SHIFTS.map((shift) => pitch + shift).filter((option) => fitsChord(option, nextChord));
  return options.find((option) => fitsChord(option, currentChord)) ?? options[0] ?? pitch;
}
