import { parseChord, pitchClassOf } from "../music/chord.ts";
import { soloCandidates } from "../music/solo-candidates.ts";
import type { SoloNote } from "./api.ts";
import type { Cell, CellNote } from "./cells.ts";

export type Dynamics = "soft" | "medium" | "loud";
/**
 * 小節の中での強さの動き。
 * terraced: 前半は強く、後半は急に弱く / surge: 真ん中へ向けて盛り上がり、また引く
 */
export type Shape = "steady" | "crescendo" | "decrescendo" | "terraced" | "surge";

export type RenderOptions = {
  /** 直前に鳴っていた音。ここから近い高さでフレーズを始める */
  previousPitch: number;
  low: number;
  high: number;
  dynamics: Dynamics;
  shape: Shape;
  /** この小節で目指す音の高さ。指定すると、直前の音よりそちらへ寄った高さからフレーズを始める */
  targetPitch?: number;
  /**
   * false なら、持ち越しの音を鳴らさない（その音だけを落とし、続きの音は鳴らす）。
   * 鳴っている音がこのコードに合わないときに使う。省略時は true
   */
  allowTie?: boolean;
  /** 音の大きさの倍率。伴奏の質感で、しっとりなら小さく、激しいほど大きくする。省略時は1 */
  velocityScale?: number;
};

const BEATS_PER_CELL = 2;
const BEATS_PER_BAR = 4;
const STEPS_PER_OCTAVE = 7;

// 強弱の幅は広く取る。以前は 0.48〜0.86 で、どの小節も似た強さに聞こえた
const BASE_VELOCITY: Record<Dynamics, number> = { soft: 0.4, medium: 0.64, loud: 0.9 };

/** 小節の中の位置（0〜1）での、強さの倍率 */
function shapeLevel(shape: Shape, position: number): number {
  switch (shape) {
    case "crescendo":
      return 0.62 + 0.58 * position;
    case "decrescendo":
      return 1.2 - 0.58 * position;
    case "terraced":
      return position < 0.5 ? 1.15 : 0.6;
    case "surge":
      // 真ん中で頂点
      return 0.7 + 0.5 * (1 - Math.abs(position - 0.5) * 2);
    default:
      return 1;
  }
}

// 裏拍を表拍より強くするのがジャズの8分音符のアクセント
const OFFBEAT_FACTOR = 1.08;
const ONBEAT_FACTOR = 0.94;
const GHOST_FACTOR = 0.45;
const ACCENT_FACTOR = 1.3;
const MIN_VELOCITY = 0.12;
/** 高さの目標へ寄せる強さ。0なら直前の音の近く、1なら目標の近くから始める */
const TARGET_PULL = 0.85;
/** 後半のフレーズを目標へ寄せる強さ。前半の続きとして聞こえるよう、弱めにする */
const SECOND_HALF_PULL = 0.4;

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
 * 最初の音（高さの目標へ向かうときはフレーズの真ん中）が基準の音に最も近くなるオクターブを選び、
 * フレーズ全体が音域からはみ出すならオクターブ単位でずらす。
 */
function chooseRootPitch(
  cell: Cell,
  rootPitchClass: number,
  scale: readonly number[],
  reference: number,
  low: number,
  high: number,
  anchor: "first" | "center",
): number {
  // 持ち越しの音は高さが決まっているので、ルートの高さを決める材料から外す
  const offsets = cell.notes.filter((note) => !note.tie).map((note) => pitchOf(note, 0, scale));
  const first = offsets[0];
  if (first === undefined) return rootPitchClass;
  // 高さの目標へ向かうときは、フレーズ全体の真ん中を基準の高さに合わせる。
  // 最初の音を合わせると、上がるフレーズは目標より高く、下がるフレーズは低く偏ってしまう
  const center = offsets.reduce((sum, offset) => sum + offset, 0) / offsets.length;
  const aligned = anchor === "center" ? center : first;
  let rootPitch = rootPitchClass + 12 * Math.round((reference - aligned - rootPitchClass) / 12);

  const highest = Math.max(...offsets);
  const lowest = Math.min(...offsets);
  while (rootPitch + highest > high) rootPitch -= 12;
  // 音域よりフレーズの幅が広いときは、下にはみ出すより上にはみ出すほうを選ぶ
  while (rootPitch + lowest < low) rootPitch += 12;
  return rootPitch;
}

function velocityOf(note: CellNote, startBeats: number, options: RenderOptions): number {
  const shape = shapeLevel(options.shape, startBeats / BEATS_PER_BAR);
  const fraction = note.at - Math.floor(note.at);
  const metric = fraction === 0 ? ONBEAT_FACTOR : fraction === 0.5 ? OFFBEAT_FACTOR : 1;
  const accent = note.accent === "ghost" ? GHOST_FACTOR : note.accent === "accent" ? ACCENT_FACTOR : 1;
  const scale = options.velocityScale ?? 1;
  return Math.min(1, Math.max(MIN_VELOCITY, BASE_VELOCITY[options.dynamics] * shape * metric * accent * scale));
}

/**
 * 前半と後半の型を、コードに合わせた1小節ぶんの音に直す。
 * 音の高さは度数から、強さは強弱の指定と拍の位置から決める。
 */
export function renderCells(cells: readonly [Cell, Cell], chord: string, options: RenderOptions): SoloNote[] {
  const scale = scaleSemitones(chord);
  const { root } = parseChord(chord);
  const notes: SoloNote[] = [];
  // 高さの目標があれば、直前の音と目標のあいだ（目標寄り）を基準にする
  const pull = (pitch: number, strength: number) =>
    options.targetPitch === undefined ? pitch : Math.round(pitch + (options.targetPitch - pitch) * strength);
  let reference = pull(options.previousPitch, TARGET_PULL);

  cells.forEach((cell, half) => {
    if (cell.notes.length === 0) return;
    if (half === 1) reference = pull(reference, SECOND_HALF_PULL);
    const rootPitch = chooseRootPitch(
      cell,
      root,
      scale,
      reference,
      options.low,
      options.high,
      // 後半は前半の続きなので、目標があっても最初の音を前半の最後の音の近くに置く
      options.targetPitch !== undefined && half === 0 ? "center" : "first",
    );
    for (const note of cell.notes) {
      if (note.tie && options.allowTie === false) continue;
      const startBeats = half * BEATS_PER_CELL + note.at;
      // 持ち越しの音は、直前の音の高さのまま伸ばす
      const pitch = note.tie ? options.previousPitch : pitchOf(note, rootPitch, scale);
      notes.push({
        pitch,
        startBeats,
        durationBeats: note.dur,
        velocity: velocityOf(note, startBeats, options),
        swing: !cell.straight,
        ...(note.tie ? { tie: true } : {}),
      });
      reference = pitch;
    }
  });

  // 単旋律の楽器なので、次の音が始まったら前の音を切る。最後の音は小節の終わりで切る
  notes.forEach((note, index) => {
    const limit = notes[index + 1]?.startBeats ?? BEATS_PER_BAR;
    note.durationBeats = Math.min(note.durationBeats, limit - note.startBeats);
  });
  return notes;
}
