import { parseChord, pitchClassOf } from "../music/chord.ts";
import { soloCandidates } from "../music/solo-candidates.ts";
import type { SoloNote } from "./api.ts";
import type { Cell, CellNote } from "./cells.ts";

export type Dynamics = "soft" | "medium" | "loud";
export type Shape = "steady" | "crescendo" | "decrescendo";

export type RenderOptions = {
  /** 直前に鳴っていた音。ここから近い高さでフレーズを始める */
  previousPitch: number;
  low: number;
  high: number;
  dynamics: Dynamics;
  shape: Shape;
};

const BEATS_PER_CELL = 2;
const BEATS_PER_BAR = 4;
const STEPS_PER_OCTAVE = 7;

const BASE_VELOCITY: Record<Dynamics, number> = { soft: 0.48, medium: 0.68, loud: 0.86 };
/** 小節の頭と終わりでの強さの倍率 */
const SHAPE_RANGE: Record<Shape, [from: number, to: number]> = {
  steady: [1, 1],
  crescendo: [0.72, 1.12],
  decrescendo: [1.12, 0.72],
};
// 裏拍を表拍より強くするのがジャズの8分音符のアクセント
const OFFBEAT_FACTOR = 1.08;
const ONBEAT_FACTOR = 0.94;
const GHOST_FACTOR = 0.55;
const ACCENT_FACTOR = 1.2;
const MIN_VELOCITY = 0.15;

/** コードのスケール7音の、ルートからの半音数（低い順） */
function scaleSemitones(chord: string): number[] {
  const { root } = parseChord(chord);
  return soloCandidates(chord).map((candidate) => (pitchClassOf(candidate.note) - root + 12) % 12);
}

/** ルートの高さを基準に、型の1音の高さを求める */
function pitchOf(note: CellNote, rootPitch: number, scale: readonly number[]): number {
  const octave = Math.floor(note.step / STEPS_PER_OCTAVE);
  const index = note.step - octave * STEPS_PER_OCTAVE;
  return rootPitch + 12 * octave + scale[index]! + (note.alt ?? 0);
}

/**
 * 型を鳴らすときのルートの高さを決める。
 * 最初の音が基準の音に最も近くなるオクターブを選び、型全体が音域からはみ出すならオクターブ単位でずらす。
 */
function chooseRootPitch(cell: Cell, rootPitchClass: number, scale: readonly number[], reference: number, low: number, high: number): number {
  const offsets = cell.notes.map((note) => pitchOf(note, 0, scale));
  const first = offsets[0]!;
  let rootPitch = rootPitchClass + 12 * Math.round((reference - first - rootPitchClass) / 12);

  const highest = Math.max(...offsets);
  const lowest = Math.min(...offsets);
  while (rootPitch + highest > high) rootPitch -= 12;
  // 音域より型の幅が広いときは、下にはみ出すより上にはみ出すほうを選ぶ
  while (rootPitch + lowest < low) rootPitch += 12;
  return rootPitch;
}

function velocityOf(note: CellNote, startBeats: number, options: RenderOptions): number {
  const [from, to] = SHAPE_RANGE[options.shape];
  const shape = from + (to - from) * (startBeats / BEATS_PER_BAR);
  const fraction = note.at - Math.floor(note.at);
  const metric = fraction === 0 ? ONBEAT_FACTOR : fraction === 0.5 ? OFFBEAT_FACTOR : 1;
  const accent = note.accent === "ghost" ? GHOST_FACTOR : note.accent === "accent" ? ACCENT_FACTOR : 1;
  return Math.min(1, Math.max(MIN_VELOCITY, BASE_VELOCITY[options.dynamics] * shape * metric * accent));
}

/**
 * 前半と後半の型を、コードに合わせた1小節ぶんの音に直す。
 * 音の高さは度数から、強さは強弱の指定と拍の位置から決める。
 */
export function renderCells(cells: readonly [Cell, Cell], chord: string, options: RenderOptions): SoloNote[] {
  const scale = scaleSemitones(chord);
  const { root } = parseChord(chord);
  const notes: SoloNote[] = [];
  let reference = options.previousPitch;

  cells.forEach((cell, half) => {
    if (cell.notes.length === 0) return;
    const rootPitch = chooseRootPitch(cell, root, scale, reference, options.low, options.high);
    for (const note of cell.notes) {
      const startBeats = half * BEATS_PER_CELL + note.at;
      const pitch = pitchOf(note, rootPitch, scale);
      notes.push({
        pitch,
        startBeats,
        durationBeats: note.dur,
        velocity: velocityOf(note, startBeats, options),
        swing: !cell.straight,
      });
      reference = pitch;
    }
  });
  return notes;
}
