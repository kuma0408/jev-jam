import { type DecisionClient, createJevClient, createMockClient } from "../../../lib/jev/client.ts";
import { NOTE_NAMES } from "../../../lib/music/chord.ts";
import { KNOWN_CHORDS } from "../../../lib/progression/candidates.ts";
import { SOLO_STRATEGIES, type SoloBar, type SoloMemo, type SoloRequest, type SoloResponse } from "../../../lib/solo/api.ts";
import { SLOTS_PER_BAR, generateBar } from "../../../lib/solo/generate.ts";
import { TOUCHES, isEnergy } from "../../../lib/solo/energy.ts";
import { generatePhraseBars } from "../../../lib/solo/generate-phrases.ts";
import { legacyToSoloBar } from "../../../lib/solo/legacy-bar.ts";
import type { SlotChoice } from "../../../lib/solo/phrase.ts";
import { HOLD, REST } from "../../../lib/solo/questions.ts";

const SLOT_CHOICES: readonly string[] = [...NOTE_NAMES, REST, HOLD];
const MAX_CHORDS = 8;
const MAX_MEMO_CELLS = 4;
const MAX_MEMO_HISTORY = 4;
const BARS_PER_PHRASE = 4;

export async function POST(request: Request): Promise<Response> {
  const raw: unknown = await request.json().catch(() => null);
  let body: SoloRequest;
  try {
    body = parseRequest(raw);
  } catch (cause) {
    if (!(cause instanceof InvalidRequest)) throw cause;
    // どの項目で弾いたかが分からないと原因を追えないので、条件と受け取った内容をログに残す
    console.warn(`リクエストを受け付けませんでした: ${cause.message}`, JSON.stringify(raw)?.slice(0, 600));
    return Response.json({ error: "リクエストの形式が正しくありません", reason: cause.message }, { status: 400 });
  }

  // キーはサーバー側だけで読み、ブラウザには渡さない
  const apiKey = process.env.TYPESAFE_API_KEY;
  // 動作確認のときは、キーがあってもダミーを使える（Jevのトークンを使わないため）。本番では受け付けない
  const useMock = !apiKey || (body.mock === true && process.env.NODE_ENV !== "production");
  const client = useMock ? createMockClient() : createJevClient(apiKey);

  // 候補すべての分を先に作る（ユーザーが選ぶ前に用意しておくため）
  const settled = await generateAll(client, body);

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

async function generateAll(client: DecisionClient, body: SoloRequest): Promise<PromiseSettledResult<SoloBar>[]> {
  if (body.strategy === "cells") {
    // 全コードの質問を1組のJev呼び出しにまとめる。失敗するときは全コードまとめて失敗する
    try {
      const bars = await generatePhraseBars(client, {
        chords: body.chords,
        bpm: body.bpm,
        previousPitch: body.previousPitch,
        range: body.range,
        memo: body.memo,
        energy: body.energy,
        touch: body.touch,
        barInPhrase: body.barInPhrase,
        sustained: body.sustained,
        retargetable: body.retargetable,
      });
      return bars.map((value) => ({ status: "fulfilled", value }));
    } catch (reason) {
      return body.chords.map(() => ({ status: "rejected", reason }));
    }
  }

  // 1音ずつの方式は、コードごとに別のリクエストを並列に投げる
  return Promise.allSettled(
    body.chords.map(async (chord) => {
      const result = await generateBar(client, {
        strategy: body.strategy as Exclude<SoloRequest["strategy"], "cells">,
        chord,
        bpm: body.bpm,
        previousBar: body.memo.choices ?? [],
      });
      return legacyToSoloBar(result, { previousPitch: body.previousPitch, ...body.range });
    }),
  );
}

function isMidiPitch(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 127;
}

function isCellIds(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_MEMO_CELLS &&
    value.every((cell) => typeof cell === "string" && /^[a-z0-9-]{1,40}$/.test(cell))
  );
}

/** リクエストの検証に失敗したことを表す。どの条件で弾いたかを持つ */
class InvalidRequest extends Error {}

function fail(reason: string): never {
  throw new InvalidRequest(reason);
}

function parseMemo(value: unknown): SoloMemo {
  if (typeof value !== "object" || value === null) fail("本体がオブジェクトではない");
  const { cells, dynamics, choices, history, relation, intensity, shape, arc, pastShapes, pastArcs } = value as Record<
    string,
    unknown
  >;
  const memo: SoloMemo = {};

  if (cells !== undefined) {
    if (!isCellIds(cells)) fail("memo.cells");
    memo.cells = cells;
  }
  if (history !== undefined) {
    if (!Array.isArray(history) || history.length > MAX_MEMO_HISTORY) fail("memo.history");
    const bars: NonNullable<SoloMemo["history"]> = [];
    for (const entry of history) {
      if (typeof entry !== "object" || entry === null) fail("memo.history の要素");
      const { chord, cells: barCells } = entry as Record<string, unknown>;
      if (typeof chord !== "string" || !KNOWN_CHORDS.includes(chord) || !isCellIds(barCells)) fail("memo.history の chord または cells");
      bars.push({ chord, cells: barCells });
    }
    memo.history = bars;
  }
  // 選ばれたものの名前をそのまま送り返してもらう項目。IDとして使える文字だけを通す
  for (const [name, text] of Object.entries({ intensity, shape, arc })) {
    if (text === undefined) continue;
    if (typeof text !== "string" || !/^[a-z0-9-]{1,40}$/.test(text)) fail(`memo.${name}`);
    memo[name as "intensity" | "shape" | "arc"] = text;
  }
  for (const [name, ids] of Object.entries({ pastShapes, pastArcs })) {
    if (ids === undefined) continue;
    if (!isCellIds(ids)) fail(`memo.${name}`);
    memo[name as "pastShapes" | "pastArcs"] = ids;
  }
  if (relation !== undefined) {
    if (typeof relation !== "string" || !/^[a-z-]{1,20}$/.test(relation)) fail("memo.relation");
    memo.relation = relation;
  }
  if (dynamics !== undefined) {
    if (typeof dynamics !== "string" || !/^[a-z-]{1,20}$/.test(dynamics)) fail("memo.dynamics");
    memo.dynamics = dynamics;
  }
  if (choices !== undefined) {
    if (!Array.isArray(choices) || choices.length > SLOTS_PER_BAR) fail("memo.choices の数");
    if (!choices.every((choice) => typeof choice === "string" && SLOT_CHOICES.includes(choice))) fail("memo.choices の値");
    memo.choices = choices as SlotChoice[];
  }
  return memo;
}

function parseRequest(value: unknown): SoloRequest {
  if (typeof value !== "object" || value === null) fail("本体がオブジェクトではない");
  // 後から足した項目（energy 以降）は、送られてこなければ既定値で受け付ける。
  // 開発中に画面とサーバーの更新がずれても、開いたままの画面が止まらないようにするため
  const {
    chords,
    strategy,
    bpm,
    previousPitch,
    range,
    energy = 2,
    touch = "none",
    barInPhrase = 0,
    sustained = false,
    retargetable = false,
    mock = false,
  } = value as Record<string, unknown>;

  if (!Array.isArray(chords) || chords.length === 0 || chords.length > MAX_CHORDS) fail("chords の数");
  if (!chords.every((chord) => typeof chord === "string" && KNOWN_CHORDS.includes(chord))) fail("chords に一覧に無いコードがある");
  const strategyValue = SOLO_STRATEGIES.find((option) => option === strategy);
  if (!strategyValue) fail("strategy");
  if (typeof bpm !== "number" || !(bpm >= 40 && bpm <= 240)) fail("bpm は 40〜240");
  if (!isMidiPitch(previousPitch)) fail("previousPitch");
  if (!isEnergy(energy)) fail("energy は 1〜4");
  const touchValue = TOUCHES.find((option) => option === touch);
  if (!touchValue) fail("touch");
  if (typeof barInPhrase !== "number" || !Number.isInteger(barInPhrase) || barInPhrase < 0 || barInPhrase >= BARS_PER_PHRASE) {
    fail("barInPhrase は 0〜3 の整数");
  }

  if (typeof range !== "object" || range === null) fail("range");
  const { low, high } = range as Record<string, unknown>;
  if (!isMidiPitch(low) || !isMidiPitch(high) || high - low < 12) fail("range.low / range.high");

  if (typeof sustained !== "boolean" || typeof retargetable !== "boolean") fail("sustained / retargetable は真偽値");

  const memo = parseMemo((value as Record<string, unknown>).memo);

  return { chords: [...new Set(chords as string[])], strategy: strategyValue, bpm, previousPitch, range: { low, high },
    energy,
    touch: touchValue,
    barInPhrase,
    sustained,
    retargetable,
    mock: mock === true,
    memo,
  };
}
