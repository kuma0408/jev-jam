import { describe, expect, it } from "vitest";
import type { ChoiceAnswer, DecisionClient } from "../jev/client.ts";
import { contourById } from "./contours.ts";
import { biasByEnergy, generatePhraseBars, penalizeRecent, spaceBias } from "./generate-phrases.ts";
import { RHYTHMS, rhythmById } from "./rhythms.ts";

/** 質問ごとに決めた選択肢へ確率1を返し、呼び出しを記録するクライアント */
function scriptedClient(picks: Record<string, string>) {
  const calls: { state: Record<string, unknown>; questions: Record<string, { instructions: string; criteria: Record<string, string> }> }[] = [];
  const client: DecisionClient = {
    name: "fake",
    async decide(state, questions) {
      calls.push({ state: state as Record<string, unknown>, questions });
      const answers: Record<string, ChoiceAnswer> = {};
      for (const [id, question] of Object.entries(questions)) {
        const choice = picks[id] ?? Object.keys(question.criteria)[0]!;
        answers[id] = { choice, probabilities: { [choice]: 1 } };
      }
      return answers;
    },
  };
  return { client, calls };
}

const input = { chords: ["Dm7"], bpm: 130, previousPitch: 62, range: { low: 53, high: 84 }, memo: {}, energy: 3 as const };
const picks = {
  rhythm_first_0: "r-four-eighths",
  contour_first_0: "c-arpeggio-up-root",
  rhythm_second_0: "r-rest",
  contour_second_0: "c-fall-from-fifth",
  dynamics: "loud",
  shape: "crescendo",
};

describe("generatePhraseBars", () => {
  it("前半のリズム・動き・強弱を決めてから、後半のリズムと動きを決める（Jevを2回呼ぶ）", async () => {
    const { client, calls } = scriptedClient(picks);
    const [bar] = await generatePhraseBars(client, input);
    expect(calls).toHaveLength(2);
    expect(Object.keys(calls[0]!.questions)).toEqual(["rhythm_first_0", "contour_first_0", "dynamics", "shape"]);
    expect(Object.keys(calls[1]!.questions)).toEqual(["rhythm_second_0", "contour_second_0"]);
    expect(bar!.calls).toBe(2);
  });

  it("選ばれたリズムと動きを組み合わせて音に直す", async () => {
    const { client } = scriptedClient(picks);
    const [bar] = await generatePhraseBars(client, input);
    // 8分音符4つ × ルートからのアルペジオ = D F A C
    expect(bar!.notes.map((note) => note.pitch)).toEqual([62, 65, 69, 72]);
    expect(bar!.notes.map((note) => note.startBeats)).toEqual([0, 0.5, 1, 1.5]);
    expect(bar!.lastPitch).toBe(72);
  });

  it("同じ動きでも、リズムが変われば別のフレーズになる", async () => {
    const { client } = scriptedClient({ ...picks, rhythm_first_0: "r-two-quarters" });
    const [bar] = await generatePhraseBars(client, input);
    expect(bar!.notes.map((note) => note.pitch)).toEqual([62, 65]);
    expect(bar!.notes.map((note) => note.durationBeats)).toEqual([1, 1]);
  });

  it("スウィングさせないリズムの音には印を付ける", async () => {
    const { client } = scriptedClient({ ...picks, rhythm_first_0: "r-sixteenth-run" });
    const [bar] = await generatePhraseBars(client, { ...input, bpm: 70 });
    expect(bar!.notes).toHaveLength(8);
    expect(bar!.notes.every((note) => !note.swing)).toBe(true);
  });

  it("テンポ帯に合ったリズムだけを選択肢に出す", async () => {
    const { client, calls } = scriptedClient(picks);
    await generatePhraseBars(client, { ...input, bpm: 220 });
    const offered = Object.keys(calls[0]!.questions.rhythm_first_0!.criteria);
    expect(offered).not.toContain("r-sixteenth-run");
    expect(offered).toContain("r-half");
  });

  it("後半を決めるとき、前半に選んだリズムと動きをJevに伝える", async () => {
    const { client, calls } = scriptedClient(picks);
    await generatePhraseBars(client, input);
    const state = JSON.stringify(calls[1]!.state);
    expect(state).toContain(rhythmById("r-four-eighths").description);
    expect(state).toContain(contourById("c-arpeggio-up-root").description);
  });

  it("直前の小節で使ったリズムと動きを、説明文でJevに伝える", async () => {
    const { client, calls } = scriptedClient(picks);
    await generatePhraseBars(client, { ...input, memo: { cells: ["r-half", "c-fall-from-ninth", "r-rest", "c-arch"] } });
    const state = JSON.stringify(calls[0]!.state);
    expect(state).toContain(rhythmById("r-half").description);
    expect(state).toContain(contourById("c-fall-from-ninth").description);
  });

  it("盛り上がりの指定を、バンドリーダーの合図としてJevに伝える", async () => {
    const calm = scriptedClient(picks);
    const intense = scriptedClient(picks);
    await generatePhraseBars(calm.client, { ...input, energy: 1 });
    await generatePhraseBars(intense.client, { ...input, energy: 4 });
    expect(calm.calls[0]!.state.bandleader_cue).not.toEqual(intense.calls[0]!.state.bandleader_cue);
  });

  it("ユーザーが伴奏を叩いていれば、その様子をJevに伝える", async () => {
    const quiet = scriptedClient(picks);
    const busy = scriptedClient(picks);
    await generatePhraseBars(quiet.client, input);
    await generatePhraseBars(busy.client, { ...input, touch: "busy" });
    expect(quiet.calls[0]!.state.accompanist).toBeUndefined();
    expect(String(busy.calls[0]!.state.accompanist)).toMatch(/busily/);
  });

  it("画面用の要約と、次の依頼に渡すメモを返す", async () => {
    const { client } = scriptedClient(picks);
    const [bar] = await generatePhraseBars(client, input);
    expect(bar!.summary).toBe("four-eighths / arpeggio-up-root + rest");
    expect(bar!.details).toContain("loud");
    expect(bar!.details).toContain("crescendo");
    const cells = ["r-four-eighths", "c-arpeggio-up-root", "r-rest", "c-fall-from-fifth"];
    expect(bar!.memo).toEqual({ cells, dynamics: "loud", history: [{ chord: "Dm7", cells }] });
  });

  it("小節まるごと休みなら、直前の音の高さを引き継ぐ", async () => {
    const { client } = scriptedClient({ ...picks, rhythm_first_0: "r-rest" });
    const [bar] = await generatePhraseBars(client, input);
    expect(bar!.notes).toEqual([]);
    expect(bar!.lastPitch).toBe(62);
  });

  it("コードがいくつあっても、Jevの呼び出しは2回で済ませる", async () => {
    const { client, calls } = scriptedClient(picks);
    const bars = await generatePhraseBars(client, { ...input, chords: ["Dm7", "Fmaj7", "G7"] });
    expect(calls).toHaveLength(2);
    expect(bars.map((bar) => bar.chord)).toEqual(["Dm7", "Fmaj7", "G7"]);
    expect(calls[0]!.questions.rhythm_first_1!.instructions).toContain("Fmaj7");
    expect(Object.keys(calls[1]!.questions)).toHaveLength(6);
  });
});

describe("generatePhraseBars（これまでの流れを踏まえる）", () => {
  const previousBar = { chord: "Cmaj7", cells: ["r-charleston", "c-arch", "r-half", "c-fall-from-fifth"] };
  const withHistory = { ...input, memo: { history: [previousBar] } };

  it("ソロの出だしでは、前との関係は聞かない", async () => {
    const { client, calls } = scriptedClient(picks);
    await generatePhraseBars(client, input);
    expect(Object.keys(calls[0]!.questions)).not.toContain("relation");
  });

  it("2小節目からは、前のフレーズとの関係をJevに選ばせる", async () => {
    const { client, calls } = scriptedClient(picks);
    await generatePhraseBars(client, withHistory);
    expect(Object.keys(calls[0]!.questions)).toContain("relation");
  });

  it("これまでのソロを、どのコードの上で何を吹いたかの説明でJevに渡す", async () => {
    const { client, calls } = scriptedClient(picks);
    const older = { chord: "Am7", cells: ["r-rest", "c-arch", "r-whole", "c-rise-from-third"] };
    await generatePhraseBars(client, { ...input, memo: { history: [older, previousBar] } });
    const soFar = calls[0]!.state.solo_so_far as string[];
    expect(soFar).toHaveLength(2);
    expect(soFar[0]).toContain("Am7");
    expect(soFar[1]).toContain("Cmaj7");
    expect(soFar[1]).toContain(rhythmById("r-charleston").description);
    expect(soFar[1]).toContain(contourById("c-fall-from-fifth").description);
  });

  it("4小節のまとまりの中の位置を、意味のある言葉でJevに渡す", async () => {
    const texts = [];
    for (const barInPhrase of [0, 1, 2, 3] as const) {
      const { client, calls } = scriptedClient(picks);
      await generatePhraseBars(client, { ...withHistory, barInPhrase });
      texts.push(String(calls[0]!.state.where_we_are));
    }
    expect(new Set(texts).size).toBe(4);
    expect(texts[0]).toMatch(/opening|begin/i);
    expect(texts[3]).toMatch(/last|conclu/i);
  });

  it("「リズムを引き継ぐ」なら、前半のリズムは前の小節と同じにし、音の動きは変える", async () => {
    const { client } = scriptedClient({ ...picks, relation: "develop-rhythm" });
    const [bar] = await generatePhraseBars(client, withHistory);
    expect(bar!.memo.cells![0]).toBe("r-charleston");
    expect(bar!.memo.cells![1]).toBe("c-arpeggio-up-root");
  });

  it("「音の形を引き継ぐ」なら、前半の動きは前の小節と同じにし、リズムは変える", async () => {
    const { client } = scriptedClient({ ...picks, relation: "develop-melody" });
    const [bar] = await generatePhraseBars(client, withHistory);
    expect(bar!.memo.cells![0]).toBe("r-four-eighths");
    expect(bar!.memo.cells![1]).toBe("c-arch");
  });

  it("「繰り返す」なら、前半はリズムも動きも前の小節と同じにする（コードが違うので音は変わる）", async () => {
    const { client } = scriptedClient({ ...picks, relation: "echo" });
    const [bar] = await generatePhraseBars(client, withHistory);
    expect(bar!.memo.cells!.slice(0, 2)).toEqual(["r-charleston", "c-arch"]);
  });

  it("「対照的に」なら、Jevが選んだものをそのまま使う", async () => {
    const { client } = scriptedClient({ ...picks, relation: "contrast" });
    const [bar] = await generatePhraseBars(client, withHistory);
    expect(bar!.memo.cells!.slice(0, 2)).toEqual(["r-four-eighths", "c-arpeggio-up-root"]);
  });

  it("前の小節の前半が休みなら、後半のフレーズを引き継ぐ", async () => {
    const { client } = scriptedClient({ ...picks, relation: "echo" });
    const rested = { chord: "Cmaj7", cells: ["r-rest", "c-arch", "r-two-quarters", "c-valley"] };
    const [bar] = await generatePhraseBars(client, { ...input, memo: { history: [rested] } });
    expect(bar!.memo.cells!.slice(0, 2)).toEqual(["r-two-quarters", "c-valley"]);
  });

  it("引き継ぐリズムがいまのテンポ帯に無ければ、Jevが選んだリズムを使う", async () => {
    const { client } = scriptedClient({ ...picks, relation: "develop-rhythm" });
    const slowBar = { chord: "Cmaj7", cells: ["r-sixteenth-run", "c-arch", "r-rest", "c-arch"] };
    const [bar] = await generatePhraseBars(client, { ...input, bpm: 220, memo: { history: [slowBar] } });
    expect(bar!.memo.cells![0]).toBe("r-four-eighths");
  });

  it("同じリズムが2小節続いていたら、もう引き継がない（同じリズムが延々と残るのを防ぐ）", async () => {
    const { client } = scriptedClient({ ...picks, relation: "develop-rhythm" });
    const [bar] = await generatePhraseBars(client, { ...input, memo: { history: [previousBar, previousBar] } });
    expect(bar!.memo.cells![0]).toBe("r-four-eighths");
  });

  it("同じ音の形が2小節続いていたら、もう引き継がない", async () => {
    const { client } = scriptedClient({ ...picks, relation: "develop-melody" });
    const [bar] = await generatePhraseBars(client, { ...input, memo: { history: [previousBar, previousBar] } });
    expect(bar!.memo.cells![1]).toBe("c-arpeggio-up-root");
  });

  it("選ばれた関係を、画面用の補足とメモに残す", async () => {
    const { client } = scriptedClient({ ...picks, relation: "echo" });
    const [bar] = await generatePhraseBars(client, withHistory);
    expect(bar!.details).toContain("繰り返す");
    expect(bar!.memo.relation).toBe("echo");
  });

  it("メモの履歴に今回の小節を足し、直近4小節だけ残す", async () => {
    const { client } = scriptedClient(picks);
    const history = ["Cmaj7", "Fmaj7", "E7", "Am7"].map((chord) => ({ ...previousBar, chord }));
    const [bar] = await generatePhraseBars(client, { ...input, memo: { history } });
    expect(bar!.memo.history!.map((entry) => entry.chord)).toEqual(["Fmaj7", "E7", "Am7", "Dm7"]);
    expect(bar!.memo.history!.at(-1)!.cells).toEqual(bar!.memo.cells);
  });
});

describe("generatePhraseBars（小節をまたいで音を伸ばす）", () => {
  const tieIds = (criteria: Record<string, string>) => Object.keys(criteria).filter((id) => id.startsWith("r-tie-"));
  // 直前の音は F4(65)。小節の終わりまで鳴っている
  const sustained = { ...input, previousPitch: 65, sustained: true };

  it("前の音が鳴り続けていなければ、持ち越しは選択肢に出さない", async () => {
    const { client, calls } = scriptedClient(picks);
    await generatePhraseBars(client, { ...sustained, sustained: false });
    expect(tieIds(calls[0]!.questions.rhythm_first_0!.criteria)).toEqual([]);
  });

  it("前の音が鳴り続けていて、次のコードに合うなら、持ち越しを選択肢に出す", async () => {
    const { client, calls } = scriptedClient(picks);
    // F は Dm7 の 3rd
    await generatePhraseBars(client, sustained);
    expect(tieIds(calls[0]!.questions.rhythm_first_0!.criteria).length).toBeGreaterThanOrEqual(3);
  });

  it("次のコードに合わない音は持ち越さない（そのコードでは選択肢に出さない）", async () => {
    const { client, calls } = scriptedClient(picks);
    // F は D7 のスケールに無い。Am7 では b13 で、ぶつかる音
    await generatePhraseBars(client, { ...sustained, chords: ["Dm7", "D7", "Am7"] });
    expect(tieIds(calls[0]!.questions.rhythm_first_0!.criteria).length).toBeGreaterThan(0);
    expect(tieIds(calls[0]!.questions.rhythm_first_1!.criteria)).toEqual([]);
    expect(tieIds(calls[0]!.questions.rhythm_first_2!.criteria)).toEqual([]);
  });

  it("後半のリズムには持ち越しを出さない", async () => {
    const { client, calls } = scriptedClient(picks);
    await generatePhraseBars(client, sustained);
    expect(tieIds(calls[1]!.questions.rhythm_second_0!.criteria)).toEqual([]);
  });

  it("持ち越しが選ばれたら、最初の音は直前の音と同じ高さで、持ち越しの印が付く", async () => {
    const { client } = scriptedClient({ ...picks, rhythm_first_0: "r-tie-long" });
    const [bar] = await generatePhraseBars(client, sustained);
    expect(bar!.notes[0]).toMatchObject({ pitch: 65, startBeats: 0, durationBeats: 2, tie: true });
    expect(bar!.summary).toBe("tie-long + rest");
  });

  it("前の音がまだ鳴っていることをJevに伝える", async () => {
    const yes = scriptedClient(picks);
    const no = scriptedClient(picks);
    await generatePhraseBars(yes.client, sustained);
    await generatePhraseBars(no.client, { ...sustained, sustained: false });
    expect(String(yes.calls[0]!.state.still_sounding)).toMatch(/held|holding/i);
    expect(no.calls[0]!.state.still_sounding).toBeUndefined();
  });
});

describe("generatePhraseBars（小節の頭に着地する）", () => {
  const startsOf = (criteria: Record<string, string>) => Object.keys(criteria).map((id) => rhythmById(id).hits[0]?.at);

  it("前の小節が次へつなぐ形で終わったら、前半は頭から鳴るリズムだけを選択肢に出す", async () => {
    const { client, calls } = scriptedClient(picks);
    const leading = { chord: "Cmaj7", cells: ["r-half", "c-arch", "r-pickup-two", "c-rise-from-fifth"] };
    await generatePhraseBars(client, { ...input, memo: { history: [leading] } });
    const starts = startsOf(calls[0]!.questions.rhythm_first_0!.criteria);
    expect(starts.length).toBeGreaterThan(8);
    expect(starts.every((at) => at === 0)).toBe(true);
  });

  it("着地が必要なときは、遅れて入るリズムを前の小節から引き継がない", async () => {
    const { client } = scriptedClient({ ...picks, relation: "develop-rhythm" });
    // 前半は遅れて入るリズム、後半は次へつなぐ形
    const leading = { chord: "Cmaj7", cells: ["r-offbeat-long", "c-arch", "r-pickup-two", "c-rise-from-fifth"] };
    const [bar] = await generatePhraseBars(client, { ...input, memo: { history: [leading] } });
    expect(bar!.memo.cells![0]).toBe("r-four-eighths");
  });

  it("前の小節が伸ばして終わったなら、休みや遅れて入るリズムも選択肢に残す", async () => {
    const { client, calls } = scriptedClient(picks);
    const settled = { chord: "Cmaj7", cells: ["r-half", "c-arch", "r-half", "c-fall-from-fifth"] };
    await generatePhraseBars(client, { ...input, memo: { history: [settled] } });
    const ids = Object.keys(calls[0]!.questions.rhythm_first_0!.criteria);
    expect(ids).toContain("r-rest");
    expect(ids).toContain("r-offbeat-long");
  });
});

describe("penalizeRecent", () => {
  it("直前に使ったものの確率を下げて、同じフレーズの繰り返しを減らす", () => {
    const adjusted = penalizeRecent({ "c-arch": 0.5, "c-valley": 0.5 }, ["c-arch"]);
    expect(adjusted["c-arch"]).toBeLessThan(adjusted["c-valley"]!);
    expect(adjusted["c-valley"]).toBe(0.5);
  });

  it("何度も使ったものほど、大きく下げる", () => {
    const once = penalizeRecent({ "c-arch": 1 }, ["c-arch"]);
    const twice = penalizeRecent({ "c-arch": 1 }, ["c-arch", "c-arch"]);
    expect(twice["c-arch"]).toBeLessThan(once["c-arch"]!);
  });

  it("休みは下げない（間は繰り返してよい）", () => {
    expect(penalizeRecent({ "r-rest": 0.5, "r-half": 0.5 }, ["r-rest"])["r-rest"]).toBe(0.5);
  });
});

describe("spaceBias", () => {
  it("盛り上がりが高いほど、「間で応える」を選ばれにくくする", () => {
    expect(spaceBias(1)).toBeGreaterThan(spaceBias(2));
    expect(spaceBias(2)).toBeGreaterThan(spaceBias(3));
    expect(spaceBias(3)).toBeGreaterThan(spaceBias(4));
    expect(spaceBias(4)).toBeGreaterThan(0);
  });
});

describe("biasByEnergy", () => {
  const uniform = Object.fromEntries(RHYTHMS.map((rhythm) => [rhythm.id, 1]));
  const share = (energy: 1 | 2 | 3 | 4, level: number) => {
    const biased = biasByEnergy(uniform, energy);
    const total = Object.values(biased).reduce((sum, value) => sum + value, 0);
    return RHYTHMS.filter((rhythm) => rhythm.energy === level).reduce((sum, rhythm) => sum + biased[rhythm.id]!, 0) / total;
  };

  it("盛り上がりが低いほど音数の少ないリズムに、高いほど多いリズムに寄せる", () => {
    expect(share(1, 1)).toBeGreaterThan(share(4, 1));
    expect(share(4, 4)).toBeGreaterThan(share(1, 4));
  });

  it("どのリズムの確率も0にはしない（つまみの位置によらず意外性を残す）", () => {
    for (const value of Object.values(biasByEnergy(uniform, 1))) {
      expect(value).toBeGreaterThan(0);
    }
  });
});
