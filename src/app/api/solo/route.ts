import { createJevClient, createMockClient } from "../../../lib/jev/client.ts";
import { NOTE_NAMES } from "../../../lib/music/chord.ts";
import { KNOWN_CHORDS } from "../../../lib/progression/candidates.ts";
import type { SoloRequest, SoloResponse } from "../../../lib/solo/api.ts";
import { SLOTS_PER_BAR, generateBar } from "../../../lib/solo/generate.ts";
import { HOLD, REST } from "../../../lib/solo/questions.ts";

const SLOT_CHOICES: readonly string[] = [...NOTE_NAMES, REST, HOLD];
const MAX_CHORDS = 8;

export async function POST(request: Request): Promise<Response> {
  const body = parseRequest(await request.json().catch(() => null));
  if (!body) {
    return Response.json({ error: "リクエストの形式が正しくありません" }, { status: 400 });
  }

  // キーはサーバー側だけで読み、ブラウザには渡さない
  const apiKey = process.env.TYPESAFE_API_KEY;
  const client = apiKey ? createJevClient(apiKey) : createMockClient();

  // 候補すべての分を並列に依頼する（ユーザーが選ぶ前に用意しておくため）
  const settled = await Promise.allSettled(
    body.chords.map((chord) =>
      generateBar(client, { strategy: body.strategy, chord, bpm: body.bpm, previousBar: body.previousBar }),
    ),
  );

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

function parseRequest(value: unknown): SoloRequest | null {
  if (typeof value !== "object" || value === null) return null;
  const { chords, strategy, bpm, previousBar } = value as Record<string, unknown>;

  if (!Array.isArray(chords) || chords.length === 0 || chords.length > MAX_CHORDS) return null;
  if (!chords.every((chord) => typeof chord === "string" && KNOWN_CHORDS.includes(chord))) return null;
  if (strategy !== "batch" && strategy !== "two-stage") return null;
  if (typeof bpm !== "number" || !(bpm >= 40 && bpm <= 240)) return null;
  if (!Array.isArray(previousBar) || previousBar.length > SLOTS_PER_BAR) return null;
  if (!previousBar.every((choice) => typeof choice === "string" && SLOT_CHOICES.includes(choice))) return null;

  return { chords: [...new Set(chords)], strategy, bpm, previousBar };
}
