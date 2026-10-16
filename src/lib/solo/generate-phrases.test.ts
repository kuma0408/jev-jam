import { describe, expect, it } from "vitest";
import type { ChoiceAnswer, DecisionClient } from "../jev/client.ts";
import { contourById } from "./contours.ts";
import { biasByEnergy, generatePhraseBars, penalizeRecent, spaceBias } from "./generate-phrases.ts";
import { barEndLevel, renderCells } from "./render-cells.ts";
import { touchRange } from "./touch-style.ts";
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
  rhythm_first: "r-four-eighths",
  contour_first: "c-arpeggio-up-root",
  rhythm_second: "r-rest",
  contour_second: "c-fall-from-fifth",
  dynamics: "loud",
  shape: "crescendo",
  // 1小節目は「前半を吹き、後半を休む」形
  phrase_shape: "p-build",
  // 1小節目は低い音域を目指す流れ（直前の音 D4 の近くから始まる）
  register_arc: "a-low",
};

describe("generatePhraseBars", () => {
  it("前半のリズム・動き・強弱を決めてから、後半のリズムと動きを決める（Jevを2回呼ぶ）", async () => {
    const { client, calls } = scriptedClient(picks);
    const [bar] = await generatePhraseBars(client, input);
    expect(calls).toHaveLength(2);
    expect(Object.keys(calls[0]!.questions)).toEqual([
      "rhythm_first",
      "contour_first",
      "dynamics",
      "shape",
      "phrase_shape",
      "register_arc",
    ]);
    expect(Object.keys(calls[1]!.questions)).toEqual(["rhythm_second", "contour_second"]);
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
    const { client } = scriptedClient({ ...picks, rhythm_first: "r-two-quarters" });
    const [bar] = await generatePhraseBars(client, input);
    expect(bar!.notes.map((note) => note.pitch)).toEqual([62, 65]);
    expect(bar!.notes.map((note) => note.durationBeats)).toEqual([1, 1]);
  });

  it("スウィングさせないリズムの音には印を付ける", async () => {
    const { client } = scriptedClient({ ...picks, rhythm_first: "r-sixteenth-run" });
    const [bar] = await generatePhraseBars(client, { ...input, bpm: 70 });
    expect(bar!.notes).toHaveLength(8);
    expect(bar!.notes.every((note) => !note.swing)).toBe(true);
  });

  it("テンポ帯に合ったリズムだけを選択肢に出す", async () => {
    const { client, calls } = scriptedClient(picks);
    await generatePhraseBars(client, { ...input, bpm: 220 });
    const offered = Object.keys(calls[0]!.questions.rhythm_first!.criteria);
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
    expect(bar!.memo).toEqual({
      cells,
      dynamics: "loud",
      history: [{ chord: "Dm7", cells }],
      intensity: "crescendo",
      // 強いクレッシェンドの終わりの音量（次の小節はここから始める）
      level: 0.95,
      shape: "p-build",
      arc: "a-low",
    });
  });

  it("小節まるごと休みなら、直前の音の高さを引き継ぐ", async () => {
    // 1小節目をまるごと休む形
    const { client } = scriptedClient({ ...picks, rhythm_first: "r-rest", phrase_shape: "p-wait-then-answer" });
    const [bar] = await generatePhraseBars(client, input);
    expect(bar!.notes).toEqual([]);
    expect(bar!.lastPitch).toBe(62);
  });

  it("フレーズはコードによらず1つだけ選ばせる（コードが増えても質問は増えない）", async () => {
    const one = scriptedClient(picks);
    const many = scriptedClient(picks);
    await generatePhraseBars(one.client, input);
    const bars = await generatePhraseBars(many.client, { ...input, chords: ["Dm7", "Fmaj7", "G7"] });
    expect(many.calls).toHaveLength(2);
    expect(Object.keys(many.calls[0]!.questions)).toEqual(Object.keys(one.calls[0]!.questions));
    expect(Object.keys(many.calls[1]!.questions)).toEqual(["rhythm_second", "contour_second"]);
    expect(bars.map((bar) => bar.chord)).toEqual(["Dm7", "Fmaj7", "G7"]);
  });

  it("どのコードにも同じフレーズを使い、音だけをそれぞれのコードに合わせる", async () => {
    const { client } = scriptedClient(picks);
    const [dm7, fmaj7, g7] = await generatePhraseBars(client, { ...input, chords: ["Dm7", "Fmaj7", "G7"] });
    expect(fmaj7!.memo.cells).toEqual(dm7!.memo.cells);
    expect(g7!.summary).toBe(dm7!.summary);
    // ルートからのアルペジオが、それぞれのコードの音になる
    expect(dm7!.notes.map((note) => note.pitch % 12)).toEqual([2, 5, 9, 0]);
    expect(fmaj7!.notes.map((note) => note.pitch % 12)).toEqual([5, 9, 0, 4]);
    expect(g7!.notes.map((note) => note.pitch % 12)).toEqual([7, 11, 2, 5]);
  });

  it("質問文にコード名を入れない（どのコードの上で鳴らすかは、鳴らす瞬間に決まる）", async () => {
    const { client, calls } = scriptedClient(picks);
    await generatePhraseBars(client, { ...input, chords: ["Dm7", "Fmaj7"] });
    const texts = JSON.stringify([calls[0]!.questions.rhythm_first!.instructions, calls[0]!.questions.contour_first!.instructions]);
    expect(texts).not.toContain("Dm7");
    expect(texts).not.toContain("Fmaj7");
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
    expect(tieIds(calls[0]!.questions.rhythm_first!.criteria)).toEqual([]);
  });

  it("前の音が鳴り続けていれば、持ち越しを選択肢に出す", async () => {
    const { client, calls } = scriptedClient(picks);
    await generatePhraseBars(client, sustained);
    expect(tieIds(calls[0]!.questions.rhythm_first!.criteria).length).toBeGreaterThanOrEqual(3);
  });

  it("持ち越しが選ばれても、鳴っている音が合わないコードの上では持ち越さない（小節の頭で切れる）", async () => {
    const { client } = scriptedClient({ ...picks, rhythm_first: "r-tie-then-two" });
    // F は Dm7 の 3rd。D7 のスケールには無く、Am7 では b13 で、ぶつかる音
    const [dm7, d7, am7] = await generatePhraseBars(client, { ...sustained, chords: ["Dm7", "D7", "Am7"] });
    expect(dm7!.notes[0]).toMatchObject({ pitch: 65, tie: true });
    expect(d7!.notes.some((note) => note.tie)).toBe(false);
    expect(am7!.notes.some((note) => note.tie)).toBe(false);
    // 持ち越さないコードでも、続きの2音は鳴る
    expect(d7!.notes).toHaveLength(2);
  });

  it("後半のリズムには持ち越しを出さない", async () => {
    const { client, calls } = scriptedClient(picks);
    await generatePhraseBars(client, sustained);
    expect(tieIds(calls[1]!.questions.rhythm_second!.criteria)).toEqual([]);
  });

  it("持ち越しが選ばれたら、最初の音は直前の音と同じ高さで、持ち越しの印が付く", async () => {
    const { client } = scriptedClient({ ...picks, rhythm_first: "r-tie-long" });
    const [bar] = await generatePhraseBars(client, sustained);
    expect(bar!.notes[0]).toMatchObject({ pitch: 65, startBeats: 0, durationBeats: 2, tie: true });
    expect(bar!.summary).toBe("tie-long + rest");
  });

  it("最後の音を次のコードへ寄せられるなら、寄せた先の音で持ち越す", async () => {
    // 直前の音 F は D7 に合わないが、締切で次のコードが決まった後に鳴らす音なら、E へ寄せてから持ち越せる
    const { client, calls } = scriptedClient({ ...picks, rhythm_first: "r-tie-long" });
    const history = [{ chord: "Dm7", cells: ["r-half", "c-arch", "r-late-long", "c-arch"] }];
    const [bar] = await generatePhraseBars(client, { ...sustained, chords: ["D7"], retargetable: true, memo: { history } });
    expect(calls).toHaveLength(2);
    expect(bar!.notes[0]).toMatchObject({ pitch: 64, tie: true });
  });

  it("寄せられない音（締切より前から鳴っている音）は、合わなければ持ち越さない", async () => {
    const { client } = scriptedClient({ ...picks, rhythm_first: "r-tie-long" });
    const history = [{ chord: "Dm7", cells: ["r-half", "c-arch", "r-half", "c-arch"] }];
    const [bar] = await generatePhraseBars(client, { ...sustained, chords: ["D7"], retargetable: false, memo: { history } });
    expect(bar!.notes.some((note) => note.tie)).toBe(false);
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
    const starts = startsOf(calls[0]!.questions.rhythm_first!.criteria);
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
    const ids = Object.keys(calls[0]!.questions.rhythm_first!.criteria);
    expect(ids).toContain("r-rest");
    expect(ids).toContain("r-offbeat-long");
  });
});

describe("generatePhraseBars（4小節の形と高さの流れ）", () => {
  const planned = { shape: "p-wait-then-answer", arc: "a-climb" };

  it("4小節のまとまりの最初の小節でだけ、形と高さの流れをJevに選ばせる", async () => {
    const first = scriptedClient(picks);
    const later = scriptedClient(picks);
    await generatePhraseBars(first.client, { ...input, barInPhrase: 0 });
    await generatePhraseBars(later.client, { ...input, barInPhrase: 1, memo: planned });
    expect(Object.keys(first.calls[0]!.questions)).toEqual(expect.arrayContaining(["phrase_shape", "register_arc"]));
    expect(Object.keys(later.calls[0]!.questions)).not.toContain("phrase_shape");
    expect(Object.keys(later.calls[0]!.questions)).not.toContain("register_arc");
  });

  it("選ばれた形と流れを、まとまりの終わりまで引き継ぐ", async () => {
    const { client } = scriptedClient(picks);
    const [bar] = await generatePhraseBars(client, { ...input, barInPhrase: 2, memo: planned });
    expect(bar!.memo).toMatchObject(planned);
  });

  it("形が「休む」としている場所では、Jevが何を選んでも休む", async () => {
    // p-wait-then-answer は1小節目をまるごと休む
    const { client } = scriptedClient({ ...picks, rhythm_second: "r-four-eighths" });
    const [bar] = await generatePhraseBars(client, { ...input, barInPhrase: 0, memo: {} , ...{} });
    expect(bar).toBeDefined();
    const rested = scriptedClient({ ...picks, phrase_shape: "p-wait-then-answer", rhythm_second: "r-four-eighths" });
    const [silent] = await generatePhraseBars(rested.client, { ...input, barInPhrase: 0 });
    expect(silent!.notes).toEqual([]);
  });

  it("形が「吹く」としている場所では、Jevが休みを選んでも休まない", async () => {
    // p-wait-then-answer の2小節目は、前半も後半も吹く
    const { client } = scriptedClient({ ...picks, rhythm_first: "r-rest", rhythm_second: "r-rest" });
    const [bar] = await generatePhraseBars(client, { ...input, barInPhrase: 1, memo: planned });
    expect(bar!.memo.cells![0]).not.toBe("r-rest");
    expect(bar!.memo.cells![2]).not.toBe("r-rest");
    expect(bar!.notes.length).toBeGreaterThan(0);
  });

  it("形が「休む」としている場所では、前の小節が次へつなぐ形で終わっていても休む（形が決めたフレーズの終わりを守る）", async () => {
    const { client } = scriptedClient(picks);
    // p-long-line（xx xx x. ..）の4小節目は、まるごと休み
    const leading = { chord: "Cmaj7", cells: ["r-half", "c-arch", "r-pickup-two", "c-rise-from-fifth"] };
    const [bar] = await generatePhraseBars(client, {
      ...input,
      barInPhrase: 3,
      memo: { shape: "p-long-line", arc: "a-middle", history: [leading] },
    });
    expect(bar!.notes).toEqual([]);
  });

  it("高さの流れに沿って、小節ごとに音の高さが動く", async () => {
    const mean = async (barInPhrase: number) => {
      const { client } = scriptedClient(picks);
      const [bar] = await generatePhraseBars(client, {
        ...input,
        previousPitch: 65,
        barInPhrase,
        memo: { shape: "p-relentless", arc: "a-climb" },
      });
      return bar!.notes.reduce((sum, note) => sum + note.pitch, 0) / bar!.notes.length;
    };
    // 登る流れの2小節目と4小節目を比べる（1小節目は流れを選び直す小節なので使わない）
    expect(await mean(3)).toBeGreaterThan((await mean(1)) + 6);
  });

  it("新しいまとまりに入るとき、直前までの形と流れを覚えておく（同じものの繰り返しを避けるため）", async () => {
    const { client } = scriptedClient(picks);
    const [bar] = await generatePhraseBars(client, {
      ...input,
      barInPhrase: 0,
      memo: { shape: "p-taper", arc: "a-peak", pastShapes: ["p-long-line", "p-scattered", "p-bookends"], pastArcs: ["a-low"] },
    });
    // 直前のものを先頭に足し、3つまで覚える
    expect(bar!.memo.pastShapes).toEqual(["p-taper", "p-long-line", "p-scattered"]);
    expect(bar!.memo.pastArcs).toEqual(["a-peak", "a-low"]);
  });

  it("まとまりの途中では、覚えている形と流れをそのまま引き継ぐ", async () => {
    const { client } = scriptedClient(picks);
    const [bar] = await generatePhraseBars(client, {
      ...input,
      barInPhrase: 2,
      memo: { ...planned, pastShapes: ["p-taper"], pastArcs: ["a-low"] },
    });
    expect(bar!.memo.pastShapes).toEqual(["p-taper"]);
    expect(bar!.memo.pastArcs).toEqual(["a-low"]);
  });

  it("形と流れを、画面用の補足に出す", async () => {
    const { client } = scriptedClient(picks);
    const [bar] = await generatePhraseBars(client, { ...input, barInPhrase: 1, memo: planned });
    expect(bar!.details).toContain("待ってから応える");
    expect(bar!.details).toContain("登る");
  });

  it("形が決まっていなければ（途中から始まったときなど）、縛りを掛けない", async () => {
    const { client } = scriptedClient({ ...picks, rhythm_first: "r-rest" });
    const [bar] = await generatePhraseBars(client, { ...input, barInPhrase: 2, memo: {} });
    expect(bar!.memo.cells![0]).toBe("r-rest");
  });
});

describe("generatePhraseBars（16分音符で走り続ける）", () => {
  /** 質問ごとに、決めた確率で選択肢を返すクライアント。抽選は乱数で決まる */
  function weightedClient(weights: Record<string, Record<string, number>>) {
    const client: DecisionClient = {
      name: "fake",
      async decide(_state, questions) {
        const answers: Record<string, ChoiceAnswer> = {};
        for (const [id, question] of Object.entries(questions)) {
          const probabilities = weights[id] ?? { [Object.keys(question.criteria)[0]!]: 1 };
          answers[id] = { choice: Object.keys(probabilities)[0]!, probabilities };
        }
        return answers;
      },
    };
    return client;
  }
  const slow = { ...input, bpm: 72, barInPhrase: 1, memo: { shape: "p-relentless", arc: "a-middle" } };
  // Jevは走るリズムにあまり確率を置いていない、という状況
  const mostlyCalm = { "r-charleston": 0.95, "r-sixteenth-run": 0.05 };
  const TRIALS = 300;

  it("前半が走っていたら、後半も走るリズムが選ばれやすい（1小節まるごと走る）", async () => {
    const runRate = async (first: string) => {
      let runs = 0;
      for (let i = 0; i < TRIALS; i++) {
        const client = weightedClient({ rhythm_first: { [first]: 1 }, rhythm_second: mostlyCalm });
        const [bar] = await generatePhraseBars(client, slow);
        if (bar!.memo.cells![2] === "r-sixteenth-run") runs++;
      }
      return runs / TRIALS;
    };
    expect(await runRate("r-sixteenth-run")).toBeGreaterThan((await runRate("r-two-quarters")) + 0.2);
  });

  it("前の小節の後半が走っていたら、この小節の前半も走るリズムが選ばれやすい（小節をまたいで走る）", async () => {
    const runRate = async (previousSecond: string) => {
      let runs = 0;
      const history = [{ chord: "Cmaj7", cells: ["r-two-quarters", "c-arch", previousSecond, "c-rise-from-third"] }];
      for (let i = 0; i < TRIALS; i++) {
        const client = weightedClient({ rhythm_first: mostlyCalm, relation: { contrast: 1 } });
        const [bar] = await generatePhraseBars(client, { ...slow, memo: { ...slow.memo, history } });
        if (bar!.memo.cells![0] === "r-sixteenth-run") runs++;
      }
      return runs / TRIALS;
    };
    expect(await runRate("r-sixteenth-run")).toBeGreaterThan((await runRate("r-half")) + 0.2);
  });

  it("2小節走り続けた後は、走るリズムが選ばれにくくなる（伸ばす音との対比に戻る）", async () => {
    const runRate = async (bars: number) => {
      let runs = 0;
      const history = Array.from({ length: bars }, () => ({
        chord: "Cmaj7",
        cells: ["r-sixteenth-run", "c-arch", "r-sixteenth-run", "c-rise-from-third"],
      }));
      for (let i = 0; i < TRIALS; i++) {
        const client = weightedClient({ rhythm_first: mostlyCalm, relation: { contrast: 1 } });
        const [bar] = await generatePhraseBars(client, { ...slow, memo: { ...slow.memo, history } });
        if (bar!.memo.cells![0] === "r-sixteenth-run") runs++;
      }
      return runs / TRIALS;
    };
    // 1小節走った後は続きやすく、2小節走った後は止まりやすい
    expect(await runRate(1)).toBeGreaterThan((await runRate(2)) + 0.3);
  });
});

describe("generatePhraseBars（途中でコードが変わっても乗せ直せる）", () => {
  it("選ばれたフレーズを、別のコードの上に乗せ直すための情報を返す", async () => {
    const { client } = scriptedClient(picks);
    const [bar] = await generatePhraseBars(client, input);
    expect(bar!.plan).toBeDefined();
    // 同じ情報でもう一度音に直すと、返ってきた音と同じになる
    expect(renderCells(bar!.plan!.cells, "Dm7", bar!.plan!.render)).toEqual(bar!.notes);
  });

  it("乗せ直すと、同じリズムのまま、新しいコードの音になる", async () => {
    const { client } = scriptedClient(picks);
    const [bar] = await generatePhraseBars(client, input);
    const moved = renderCells(bar!.plan!.cells, "G7", bar!.plan!.render);
    expect(moved.map((note) => note.startBeats)).toEqual(bar!.notes.map((note) => note.startBeats));
    // G7 のルート・3rd・5th・7th = G B D F
    expect(moved.map((note) => note.pitch % 12)).toEqual([7, 11, 2, 5]);
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

describe("generatePhraseBars（掛け合い）", () => {
  const call = { density: "busy" as const, direction: "rising" as const, lastPitch: 72 };
  const previousBar = { chord: "Cmaj7", cells: ["r-charleston", "c-arch", "r-half", "c-fall-from-fifth"] };
  const answering = { ...input, memo: { history: [previousBar] }, trade: { part: "answer" as const, call } };

  it("相手が弾いた内容を言葉でJevに伝え、どう応えるかを選ばせる", async () => {
    const { client, calls } = scriptedClient(picks);
    await generatePhraseBars(client, answering);
    expect(calls[0]!.state.partner_just_played).toMatch(/busy/i);
    expect(Object.keys(calls[0]!.questions.reply!.criteria)).toEqual(["echo", "answer", "push", "calm"]);
  });

  it("応えるときは、自分の前のフレーズとの関係は聞かない（相手に応えるのが先）", async () => {
    const { client, calls } = scriptedClient(picks);
    await generatePhraseBars(client, answering);
    expect(Object.keys(calls[0]!.questions)).not.toContain("relation");
  });

  it("掛け合いでは、4小節の形（どこで休むか）は聞かない。自分の番は2小節しかない", async () => {
    const { client, calls } = scriptedClient(picks);
    await generatePhraseBars(client, answering);
    expect(Object.keys(calls[0]!.questions)).not.toContain("phrase_shape");
  });

  it("応えの出だしは休まない（Jevが休みを選んでも、何か弾いて応える）", async () => {
    const { client } = scriptedClient({ ...picks, rhythm_first: "r-rest" });
    const [bar] = await generatePhraseBars(client, answering);
    expect(bar!.notes.some((note) => note.startBeats < 2)).toBe(true);
  });

  it("選ばれた応え方と確率を返し、画面用の補足とメモにも残す", async () => {
    const { client } = scriptedClient({ ...picks, reply: "push" });
    const [bar] = await generatePhraseBars(client, { ...answering, energy: 1 });
    expect(bar!.reply).toEqual({ id: "push", label: "畳みかける", odds: { push: 1 } });
    expect(bar!.details).toContain("応え方 畳みかける");
    // 相手は細かく弾いたので、畳みかけるなら最大の盛り上がりで弾く
    expect(bar!.memo.reply).toEqual({ id: "push", energy: 4 });
  });

  it("相手が何も弾かなかったら、応え方は聞かず、黙っていたことを伝える", async () => {
    const { client, calls } = scriptedClient(picks);
    const [bar] = await generatePhraseBars(client, { ...answering, trade: { part: "answer", call: null } });
    expect(Object.keys(calls[0]!.questions)).not.toContain("reply");
    expect(calls[0]!.state.partner_just_played).toMatch(/silent/i);
    expect(bar!.reply).toBeUndefined();
  });

  it("応えの2小節目は、1小節目で決めた応え方の盛り上がりを引き継ぎ、締めくくることを伝える", async () => {
    const { client, calls } = scriptedClient(picks);
    const [bar] = await generatePhraseBars(client, {
      ...input,
      energy: 1,
      barInPhrase: 1,
      memo: { history: [previousBar], reply: { id: "push", energy: 4 } },
      trade: { part: "close", call: null },
    });
    expect(calls[0]!.state.bandleader_cue).toMatch(/all out/i);
    expect(calls[0]!.state.where_we_are).toMatch(/last bar of your/i);
    expect(Object.keys(calls[0]!.questions)).not.toContain("reply");
    // 次の番のために、応え方はメモに残さない
    expect(bar!.memo.reply).toBeUndefined();
  });
});

describe("generatePhraseBars（区切りで進行を移るか）", () => {
  const section = {
    current: "王道進行",
    currentMood: "Bright but wistful.",
    barsOn: 16,
    options: [
      { id: "just-the-two", mood: "Smooth, mellow neo soul." },
      { id: "i-vi-ii-v", mood: "The classic jazz turnaround." },
    ],
  };

  it("区切りの前の小節では、続けるか、どの進行へ移るかをJevに選ばせる", async () => {
    const { client, calls } = scriptedClient({ ...picks, section: "just-the-two" });
    const [bar] = await generatePhraseBars(client, { ...input, section });
    expect(Object.keys(calls[0]!.questions.section!.criteria)).toEqual(["stay", "just-the-two", "i-vi-ii-v"]);
    expect(calls[0]!.questions.section!.criteria.stay).toContain("Bright but wistful.");
    expect(bar!.section).toEqual({ choice: "just-the-two", odds: { "just-the-two": 1 } });
  });

  it("いまの進行をどれくらい続けているかを、言葉で伝える", async () => {
    const { client, calls } = scriptedClient(picks);
    await generatePhraseBars(client, { ...input, section: { ...section, barsOn: 4 } });
    expect(calls[0]!.state.current_progression).toMatch(/just started/i);
    const long = scriptedClient(picks);
    await generatePhraseBars(long.client, { ...input, section: { ...section, barsOn: 32 } });
    expect(long.calls[0]!.state.current_progression).toMatch(/long time/i);
  });

  it("いまの進行は、日本語の名前ではなく英語の雰囲気の説明で伝える（Jevは英語のほうが精度が高い）", async () => {
    const { client, calls } = scriptedClient(picks);
    await generatePhraseBars(client, { ...input, section });
    expect(calls[0]!.state.current_progression).toContain("Bright but wistful.");
    expect(calls[0]!.state.current_progression).not.toContain("王道進行");
  });

  it("雰囲気の説明が無い進行は、名前を出さずに決まった英語で伝える", async () => {
    const { client, calls } = scriptedClient(picks);
    const { currentMood: _, ...withoutMood } = section;
    await generatePhraseBars(client, { ...input, section: withoutMood });
    expect(calls[0]!.state.current_progression).toMatch(/^A free-flowing progression\./);
  });

  it("区切りでない小節では聞かない", async () => {
    const { client, calls } = scriptedClient(picks);
    const [bar] = await generatePhraseBars(client, input);
    expect(Object.keys(calls[0]!.questions)).not.toContain("section");
    expect(bar!.section).toBeUndefined();
  });
});

describe("generatePhraseBars（区切りの移り先の選ばれやすさ）", () => {
  /** 区切りの質問にだけ、決まった確率を返すクライアント */
  const sectionClient: DecisionClient = {
    name: "fake",
    async decide(_state, questions) {
      const answers: Record<string, ChoiceAnswer> = {};
      for (const [id, item] of Object.entries(questions)) {
        const labels = Object.keys(item.criteria);
        answers[id] =
          id === "section"
            ? { choice: "stay", probabilities: { stay: 0.5, "royal-road": 0.25, marusa: 0.25 } }
            : { choice: labels[0]!, probabilities: { [labels[0]!]: 1 } };
      }
      return answers;
    },
  };
  const options = [
    { id: "royal-road", mood: "Bright." },
    { id: "marusa", mood: "Urban." },
  ];

  it("移り先に倍率（bias）が付いていれば、その分だけ選ばれやすくする。画面に出す確率はJevが返したまま", async () => {
    const plain = await generatePhraseBars(sectionClient, { ...input, section: { current: null, barsOn: 0, options } }, () => 0.6);
    expect(plain[0]!.section!.choice).toBe("royal-road");
    const biased = await generatePhraseBars(
      sectionClient,
      { ...input, section: { current: null, barsOn: 0, options: [options[0]!, { ...options[1]!, bias: 10 }] } },
      () => 0.6,
    );
    expect(biased[0]!.section!.choice).toBe("marusa");
    expect(biased[0]!.section!.odds).toEqual({ stay: 0.5, "royal-road": 0.25, marusa: 0.25 });
  });
});

describe("generatePhraseBars（伴奏の質感で、音の大きさと音域を変える）", () => {
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const play = async (touch: "sustained" | "busy") => {
    const { client } = scriptedClient({ ...picks, rhythm_second: "r-four-eighths" });
    const [bar] = await generatePhraseBars(client, { ...input, barInPhrase: 1, touch });
    return bar!;
  };

  it("激しいときは、しっとりのときより大きく、高い音で吹く", async () => {
    const quiet = await play("sustained");
    const loud = await play("busy");
    expect(average(loud.notes.map((note) => note.velocity))).toBeGreaterThan(average(quiet.notes.map((note) => note.velocity)) * 1.3);
    expect(average(loud.notes.map((note) => note.pitch))).toBeGreaterThan(average(quiet.notes.map((note) => note.pitch)) + 4);
  });

  it("激しいときは、高い音域の中だけで吹く", async () => {
    const loud = await play("busy");
    for (const note of loud.notes) expect(note.pitch).toBeGreaterThanOrEqual(touchRange("busy", input.range).low);
  });

  it("別のコードへ乗せ直しても、音の大きさの倍率は保たれる", async () => {
    const loud = await play("busy");
    const moved = renderCells(loud.plan!.cells, "G7", loud.plan!.render);
    expect(average(moved.map((note) => note.velocity))).toBeCloseTo(average(loud.notes.map((note) => note.velocity)), 1);
  });
});

describe("generatePhraseBars（強さと、小節の境目の音量）", () => {
  it("小節の強さは、Jevが返した確率のまま抽選する（盛り上がりや前の小節で重みを掛けない）", async () => {
    const base = scriptedClient(picks).client;
    // 強さだけ soft と loud を半々で返す
    const client: DecisionClient = {
      name: "fake",
      async decide(state, questions) {
        const answers = await base.decide(state, questions);
        if (answers.dynamics) answers.dynamics = { choice: "soft", probabilities: { soft: 0.5, loud: 0.5 } };
        return answers;
      },
    };
    // 静かな盛り上がりで、前の小節も soft。重みを掛けると soft に寄るが、確率のままなら 0.6 の乱数で loud になる
    const [bar] = await generatePhraseBars(client, { ...input, energy: 1, memo: { dynamics: "soft" } }, () => 0.6);
    expect(bar!.plan!.render.dynamics).toBe("loud");
  });

  it("「前半だけ強く、後半で急に弱く」は強弱の動きの選択肢に出さない", async () => {
    const { client, calls } = scriptedClient(picks);
    await generatePhraseBars(client, input);
    expect(Object.keys(calls[0]!.questions.shape!.criteria)).not.toContain("terraced");
  });

  it("小節の終わりの音量をメモに残し、次の小節はその音量から始める", async () => {
    const { client } = scriptedClient(picks);
    const [bar] = await generatePhraseBars(client, input);
    expect(bar!.memo.level).toBeCloseTo(barEndLevel(bar!.plan!.render), 5);

    const next = scriptedClient(picks);
    const [following] = await generatePhraseBars(next.client, { ...input, memo: bar!.memo });
    expect(following!.plan!.render.startLevel).toBeCloseTo(bar!.memo.level!, 5);
  });
});

describe("generatePhraseBars（速いテンポの音量）", () => {
  it("速いテンポでは、伴奏を弾いていなくてもソロを大きめにする", async () => {
    const { client } = scriptedClient(picks);
    const [bar] = await generatePhraseBars(client, { ...input, bpm: 220 });
    expect(bar!.plan!.render.velocityScale).toBeCloseTo(1.3, 5);
  });

  it("激しい伴奏の倍率のほうが大きければ、そちらを使う（掛け合わせない）", async () => {
    const { client } = scriptedClient(picks);
    const [bar] = await generatePhraseBars(client, { ...input, bpm: 220, touch: "busy" });
    expect(bar!.plan!.render.velocityScale).toBeCloseTo(1.5, 5);
  });
});
