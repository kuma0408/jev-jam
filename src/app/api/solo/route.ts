import { type DecisionClient, createJevClient, createMockClient } from "../../../lib/jev/client.ts";
import { NOTE_NAMES } from "../../../lib/music/chord.ts";
import { KNOWN_CHORDS } from "../../../lib/progression/candidates.ts";
import { SOLO_STRATEGIES, type SoloBar, type SoloMemo, type SoloRequest, type SoloResponse } from "../../../lib/solo/api.ts";
import { SLOTS_PER_BAR, generateBar } from "../../../lib/solo/generate.ts";
import { generateCellBar } from "../../../lib/solo/generate-cells.ts";
import { legacyToSoloBar } from "../../../lib/solo/legacy-bar.ts";
import type { SlotChoice } from "../../../lib/solo/phrase.ts";
import { HOLD, REST } from "../../../lib/solo/questions.ts";

const SLOT_CHOICES: readonly string[] = [...NOTE_NAMES, REST, HOLD];
const MAX_CHORDS = 8;
const MAX_MEMO_CELLS = 4;

export async function POST(request: Request): Promise<Response> {
  const body = parseRequest(await request.json().catch(() => null));
  if (!body) {
    return Response.json({ error: "リクエストの形式が正しくありません" }, { status: 400 });
  }

  // キーはサーバー側だけで読み、ブラウザには渡さない
  const apiKey = process.env.TYPESAFE_API_KEY;
  const client = apiKey ? createJevClient(apiKey) : createMockClient();

  // 候補すべての分を並列に依頼する（ユーザーが選ぶ前に用意しておくため）
  const settled = await Promise.allSettled(body.chords.map((chord) => generate(client, chord, body)));

  const results: SoloResponse["results"] = {};
  settled.forEach((outcome, index) => {
    const chord = body.chords[index]!;
    if (outcome.status === "fulfilled") {
      results[chord] = outcome.value;
    } else {
      // 上流のエラー内容はサーバーのログにだけ出す
      console.error(`ソロの生成に失敗しました (${chord})`, outcome.reason);
      results[chord] = null;
    }
  });
  return Response.json({ client: client.name, results } satisfies SoloResponse);
}

async function generate(client: DecisionClient, chord: string, body: SoloRequest): Promise<SoloBar> {
  if (body.strategy === "cells") {
    return generateCellBar(client, {
      chord,
      bpm: body.bpm,
      previousPitch: body.previousPitch,
      range: body.range,
      memo: body.memo,
    });
  }
  const result = await generateBar(client, {
    strategy: body.strategy,
    chord,
    bpm: body.bpm,
    previousBar: body.memo.choices ?? [],
  });
  return legacyToSoloBar(result, { previousPitch: body.previousPitch, ...body.range });
}

function isMidiPitch(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 127;
}

function parseMemo(value: unknown): SoloMemo | null {
  if (typeof value !== "object" || value === null) return null;
  const { cells, dynamics, choices } = value as Record<string, unknown>;
  const memo: SoloMemo = {};

  if (cells !== undefined) {
    if (!Array.isArray(cells) || cells.length > MAX_MEMO_CELLS) return null;
    if (!cells.every((cell) => typeof cell === "string" && /^[a-z0-9-]{1,40}$/.test(cell))) return null;
    memo.cells = cells;
  }
  if (dynamics !== undefined) {
    if (typeof dynamics !== "string" || !/^[a-z-]{1,20}$/.test(dynamics)) return null;
    memo.dynamics = dynamics;
  }
  if (choices !== undefined) {
    if (!Array.isArray(choices) || choices.length > SLOTS_PER_BAR) return null;
    if (!choices.every((choice) => typeof choice === "string" && SLOT_CHOICES.includes(choice))) return null;
    memo.choices = choices as SlotChoice[];
  }
  return memo;
}

function parseRequest(value: unknown): SoloRequest | null {
  if (typeof value !== "object" || value === null) return null;
  const { chords, strategy, bpm, previousPitch, range } = value as Record<string, unknown>;

  if (!Array.isArray(chords) || chords.length === 0 || chords.length > MAX_CHORDS) return null;
  if (!chords.every((chord) => typeof chord === "string" && KNOWN_CHORDS.includes(chord))) return null;
  const strategyValue = SOLO_STRATEGIES.find((option) => option === strategy);
  if (!strategyValue) return null;
  if (typeof bpm !== "number" || !(bpm >= 40 && bpm <= 240)) return null;
  if (!isMidiPitch(previousPitch)) return null;

  if (typeof range !== "object" || range === null) return null;
  const { low, high } = range as Record<string, unknown>;
  if (!isMidiPitch(low) || !isMidiPitch(high) || high - low < 12) return null;

  const memo = parseMemo((value as Record<string, unknown>).memo);
  if (!memo) return null;

  return { chords: [...new Set(chords as string[])], strategy: strategyValue, bpm, previousPitch, range: { low, high }, memo };
}
