import type { SoloBar } from "./api.ts";
import type { BarResult } from "./generate.ts";
import { type PhraseOptions, type SlotChoice, toNoteEvents } from "./phrase.ts";

/** 1スロットは8分音符なので半拍 */
const BEATS_PER_SLOT = 0.5;
const VELOCITY = 0.8;

export function formatChoices(choices: readonly SlotChoice[]): string {
  return choices.map((choice) => (choice === "rest" ? "." : choice === "hold" ? "-" : choice).padEnd(2)).join(" ");
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** 1音ずつ選ばせる方式（batch, two-stage）の結果を、画面と共通の形式に変換する */
export function legacyToSoloBar(result: BarResult, options: PhraseOptions): SoloBar {
  const events = toNoteEvents(result.choices, options);
  const details = [
    `最上位 ${percent(result.stats.top)}`,
    `休符 ${percent(result.stats.rest)}`,
    `伸ばす ${percent(result.stats.hold)}`,
    ...(result.plan ? [`方針 ${Object.values(result.plan).join(", ")}`] : []),
  ].join(" / ");

  return {
    chord: result.chord,
    notes: events.map((event) => ({
      pitch: event.pitch,
      startBeats: event.startSlot * BEATS_PER_SLOT,
      durationBeats: event.lengthSlots * BEATS_PER_SLOT,
      velocity: VELOCITY,
      swing: true,
    })),
    summary: formatChoices(result.choices),
    details,
    latencyMs: result.latencyMs,
    calls: result.calls,
    lastPitch: events.at(-1)?.pitch ?? options.previousPitch,
    memo: { choices: result.choices },
  };
}
