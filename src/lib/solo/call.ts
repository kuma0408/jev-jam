// 掛け合い（ユーザーとJevが2小節ずつ交代で弾く）のためのルール。
// ユーザーが弾いた内容を言葉に要約してJevに渡し、Jevに「どう応えるか」を選ばせる。
import type { Energy } from "./energy.ts";

export type Turn = "jev" | "you";

/** 1回の番の長さ（小節） */
export const TURN_BARS = 2;

/** その小節（1始まり）がどちらの番か。先にJevが弾いて場を作り、次にユーザーが弾く */
export function turnOf(bar: number): Turn {
  return Math.floor((bar - 1) / TURN_BARS) % 2 === 0 ? "jev" : "you";
}

/** ユーザーが弾いた1音。beat は、番の頭からの拍数 */
export type PlayedNote = { pitch: number; beat: number };

export type CallDensity = "sparse" | "moderate" | "busy";
export type CallDirection = "rising" | "falling" | "level" | "wavy";

/** ユーザーが自分の番に弾いた内容の要約 */
export type CallSummary = {
  density: CallDensity;
  direction: CallDirection;
  /** 最後に弾いた音の高さ（MIDIノート番号）。Jevはここから弾き始める */
  lastPitch: number;
};

export const CALL_DENSITIES: readonly CallDensity[] = ["sparse", "moderate", "busy"];
export const CALL_DIRECTIONS: readonly CallDirection[] = ["rising", "falling", "level", "wavy"];

/** この数までなら「まばら」 */
const SPARSE_NOTES = 4;
/** この数までなら「ほどほど」。超えたら「細かい」 */
const MODERATE_NOTES = 10;
/** 最初と最後の音がこの半音数以上離れていれば、上がった・下がったと見なす */
const DIRECTION_INTERVAL = 3;
/** 全体の音域がこの半音数以内なら、同じあたりにとどまっていたと見なす */
const LEVEL_SPAN = 2;

/** ユーザーが弾いた音から、Jevに伝える要約を作る。何も弾いていなければ null */
export function summarizeCall(notes: readonly PlayedNote[]): CallSummary | null {
  if (notes.length === 0) return null;
  const ordered = [...notes].sort((a, b) => a.beat - b.beat);
  const pitches = ordered.map((note) => note.pitch);
  const first = pitches[0]!;
  const last = pitches.at(-1)!;
  const span = Math.max(...pitches) - Math.min(...pitches);
  const direction: CallDirection =
    span <= LEVEL_SPAN
      ? "level"
      : last - first >= DIRECTION_INTERVAL
        ? "rising"
        : first - last >= DIRECTION_INTERVAL
          ? "falling"
          : "wavy";
  const density: CallDensity =
    notes.length <= SPARSE_NOTES ? "sparse" : notes.length <= MODERATE_NOTES ? "moderate" : "busy";
  return { density, direction, lastPitch: last };
}

const DENSITY_TEXT: Record<CallDensity, string> = {
  sparse: "Sparse: only a few notes, with lots of space.",
  moderate: "A moderate, singing line: neither sparse nor busy.",
  busy: "Busy: many quick notes, hardly any space.",
};

const DIRECTION_TEXT: Record<CallDirection, string> = {
  rising: "The line kept rising and ended high.",
  falling: "The line kept falling and ended low.",
  level: "The line stayed around the same few notes.",
  wavy: "The line moved up and down and came back near where it started.",
};

/** Jevに渡す説明。Jevは数えるのが苦手なので、数ではなく言葉で伝える */
export function describeCall(call: CallSummary): string {
  return `${DENSITY_TEXT[call.density]} ${DIRECTION_TEXT[call.direction]}`;
}

/** ユーザーのフレーズへの応え方。Jevに選ばせる */
export type ReplyId = "echo" | "answer" | "push" | "calm";

export const REPLIES: Record<ReplyId, { label: string; description: string }> = {
  echo: {
    label: "真似る",
    description: "Pick up their idea and play it back: a similar amount of notes, moving the same way. Shows you were listening.",
  },
  answer: {
    label: "返す",
    description: "Answer like the second half of a sentence: move the opposite way to where they went, and bring it to rest.",
  },
  push: {
    label: "畳みかける",
    description: "Take their idea further: busier and more intense than what they played, raising the excitement.",
  },
  calm: {
    label: "落ち着かせる",
    description: "Cool things down: play less than they did, with space, and let their phrase sink in.",
  },
};

export function isReplyId(value: unknown): value is ReplyId {
  return typeof value === "string" && Object.hasOwn(REPLIES, value);
}

const DENSITY_ENERGY: Record<CallDensity, Energy> = { sparse: 1, moderate: 2, busy: 4 };

/** 応え方と相手の音数から、Jevの音数（盛り上がり）を決める */
export function replyEnergy(reply: ReplyId, call: CallSummary, energy: Energy): Energy {
  const theirs = DENSITY_ENERGY[call.density];
  if (reply === "answer") return energy;
  const shift = reply === "push" ? 1 : reply === "calm" ? -1 : 0;
  return Math.max(1, Math.min(4, theirs + shift)) as Energy;
}

/** Jevの応答と、音の予約に必要な余裕（秒）。応答は実測で0.4〜0.5秒 */
const PREPARE_SECONDS = 1;
const BEATS_PER_BAR = 4;

/**
 * ユーザーの番の最後の小節で、何拍目（0始まり）にJevへ聞くか。
 * できるだけ多く聴いてから応えたいので、間に合ういちばん遅い拍にする
 */
export function prepareBeat(bpm: number): number {
  const beatsNeeded = Math.ceil(PREPARE_SECONDS / (60 / bpm) - 1e-9);
  return Math.max(0, BEATS_PER_BAR - beatsNeeded);
}
