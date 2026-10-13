// Jevにアドリブソロの音を選ばせ、遅延と選ばれた音を記録する検証スクリプト（ADR 0001, 0004）
//
// 使い方:
//   pnpm spike                 # 8小節、120BPM
//   pnpm spike --bars 16 --bpm 90
//
// 環境変数 TYPESAFE_API_KEY があれば本物のJevを、無ければダミーを呼ぶ。
import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { type DecisionClient, createJevClient, createMockClient } from "../src/lib/jev/client.ts";
import { type MidiNote, writeMidi } from "../src/lib/midi/write.ts";
import { chordTones, pitchClassOf } from "../src/lib/music/chord.ts";
import { sampleFromDistribution } from "../src/lib/music/sample.ts";
import { type SlotChoice, toNoteEvents } from "../src/lib/solo/phrase.ts";
import { buildPlanQuestions, buildSlotQuestions } from "../src/lib/solo/questions.ts";

const { values } = parseArgs({ options: { bars: { type: "string", default: "8" }, bpm: { type: "string", default: "120" } } });
const BARS = Number(values.bars);
const BPM = Number(values.bpm);

// II-V-I-VI の循環進行
const PROGRESSION = ["Dm7", "G7", "Cmaj7", "A7"];
const SLOTS_PER_BAR = 8;
const TICKS_PER_BEAT = 480;
const TICKS_PER_SLOT = (TICKS_PER_BEAT * 4) / SLOTS_PER_BAR;
const BAR_MS = (60_000 / BPM) * 4;
const SOLO_RANGE = { low: 60, high: 86 };

type Strategy = "batch" | "two-stage";

type BarResult = { chord: string; latencyMs: number; calls: number; choices: SlotChoice[]; plan?: Record<string, string> };

async function playBar(client: DecisionClient, strategy: Strategy, bar: number, previousBar: SlotChoice[]): Promise<BarResult> {
  const chord = PROGRESSION[bar % PROGRESSION.length]!;
  const baseState = {
    style: "jazz / neo soul jam session",
    tempo_bpm: BPM,
    current_chord: chord,
    next_chord: PROGRESSION[(bar + 1) % PROGRESSION.length]!,
    previous_bar_solo: previousBar,
  };

  const startedAt = performance.now();
  let calls = 1;
  let plan: Record<string, string> | undefined;
  let state: object = baseState;

  if (strategy === "two-stage") {
    // 1回目: フレーズの方針を決める。2回目のstateに入れて、各スロットの判断を揃えさせる
    const planAnswers = await client.decide(baseState, buildPlanQuestions(chord));
    plan = Object.fromEntries(
      Object.entries(planAnswers).map(([id, answer]) => [id, sampleFromDistribution(answer.probabilities)]),
    );
    state = { ...baseState, phrase_plan: plan };
    calls = 2;
  }

  const answers = await client.decide(state, buildSlotQuestions(chord, SLOTS_PER_BAR));
  const latencyMs = performance.now() - startedAt;

  const choices: SlotChoice[] = [];
  for (let slot = 0; slot < SLOTS_PER_BAR; slot++) {
    choices.push(sampleFromDistribution(answers[`slot_${slot}`]!.probabilities) as SlotChoice);
  }
  return { chord, latencyMs, calls, choices, ...(plan ? { plan } : {}) };
}

async function run(client: DecisionClient, strategy: Strategy): Promise<void> {
  console.log(`\n=== ${strategy} (${client.name}) ===`);
  const notes: MidiNote[] = [];
  const latencies: number[] = [];
  let previousBar: SlotChoice[] = [];
  let previousPitch = 72;

  for (let bar = 0; bar < BARS; bar++) {
    const result = await playBar(client, strategy, bar, previousBar);
    latencies.push(result.latencyMs);
    const barTick = bar * TICKS_PER_BEAT * 4;

    // 伴奏: 構成音を1オクターブ下で小節いっぱい鳴らす
    for (const tone of chordTones(result.chord)) {
      notes.push({ pitch: 48 + pitchClassOf(tone), startTick: barTick, durationTicks: TICKS_PER_BEAT * 4, velocity: 60, channel: 1 });
    }
    for (const event of toNoteEvents(result.choices, { previousPitch, ...SOLO_RANGE })) {
      notes.push({
        pitch: event.pitch,
        startTick: barTick + event.startSlot * TICKS_PER_SLOT,
        durationTicks: event.lengthSlots * TICKS_PER_SLOT,
        velocity: 100,
        channel: 0,
      });
      previousPitch = event.pitch;
    }
    previousBar = result.choices;

    const line = result.choices.map((choice) => (choice === "rest" ? "." : choice === "hold" ? "-" : choice).padEnd(2)).join(" ");
    const planText = result.plan ? `  [${Object.values(result.plan).join(", ")}]` : "";
    console.log(`${String(bar + 1).padStart(2)} ${result.chord.padEnd(6)} ${result.latencyMs.toFixed(0).padStart(5)}ms  ${line}${planText}`);
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const at = (ratio: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))]!;
  const late = latencies.filter((ms) => ms > BAR_MS).length;
  console.log(
    `遅延: 最小 ${sorted[0]!.toFixed(0)}ms / 中央 ${at(0.5).toFixed(0)}ms / 95% ${at(0.95).toFixed(0)}ms / 最大 ${sorted.at(-1)!.toFixed(0)}ms`,
  );
  console.log(`1小節 ${BAR_MS.toFixed(0)}ms (${BPM}BPM) に間に合わなかった小節: ${late}/${BARS}`);

  mkdirSync("spikes/out", { recursive: true });
  const path = `spikes/out/${strategy}-${client.name}.mid`;
  writeFileSync(path, writeMidi(notes, { bpm: BPM, ticksPerBeat: TICKS_PER_BEAT }));
  console.log(`MIDI: ${path}`);
}

const apiKey = process.env.TYPESAFE_API_KEY;
const client = apiKey ? createJevClient(apiKey) : createMockClient();
if (!apiKey) {
  console.log("TYPESAFE_API_KEY が無いのでダミーで動かします（確率はでたらめで、音楽的な質は評価できません）");
}
await run(client, "batch");
await run(client, "two-stage");
