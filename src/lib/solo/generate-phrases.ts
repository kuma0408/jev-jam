import type { DecisionClient } from "../jev/client.ts";
import { sampleFromDistribution } from "../music/sample.ts";
import { aimPitch, fitsChord } from "./aim.ts";
import type { SectionQuestion, SoloBar, SoloMemo, Trade } from "./api.ts";
import { REPLIES, type ReplyId, describeCall, replyEnergy } from "./call.ts";
import { tempoVelocity, touchRange, touchRegister, touchVelocity } from "./touch-style.ts";
import type { Cell } from "./cells.ts";
import { CONTOURS, type Contour, biasByDirection, contourById, favorLeaps } from "./contours.ts";
import { ENERGY, type Energy, TOUCH_CUE, type Touch } from "./energy.ts";
import {
  PHRASE_SHAPES,
  REGISTER_ARCS,
  biasShapesByEnergy,
  phraseShapeById,
  registerArcById,
  registerTarget,
} from "./phrase-plan.ts";
import type { ChoiceQuestion } from "./questions.ts";
import { type Dynamics, type Shape, barEndLevel, renderCells } from "./render-cells.ts";
import {
  RHYTHMS,
  type Rhythm,
  TIE_RHYTHMS,
  boostSixteenths,
  favorDownbeat,
  holdBackLongNotes,
  holdBackTies,
  keepRunning,
  leadsOut,
  rhythmById,
  rhythmsFor,
  settleDown,
} from "./rhythms.ts";

export type PhraseBarsInput = {
  /** ソロを用意したいコード。次に選べる候補すべてを一度に渡す */
  chords: readonly string[];
  bpm: number;
  previousPitch: number;
  range: { low: number; high: number };
  /** 直前の小節の記録。cells に [前半のリズム, 前半の動き, 後半のリズム, 後半の動き] のIDが入る */
  memo: SoloMemo;
  /** 盛り上がり。つまみの値に、ユーザーの叩き方を足したもの */
  energy: Energy;
  /** ユーザーが伴奏をどれだけ叩いているか */
  touch?: Touch;
  /** 4小節のまとまりの中で、これから作る小節が何番目か（0〜3） */
  barInPhrase?: number;
  /** 直前の小節の最後の音（previousPitch）が、小節の終わりまで鳴り続けているか */
  sustained?: boolean;
  /**
   * 直前の小節の最後の音が、コード選択の締切より後に鳴り始める音か。
   * そうなら、次のコードが決まってから鳴らすので、次のコードに合う音へ寄せられる
   */
  retargetable?: boolean;
  /** 掛け合いでの役割。掛け合いでなければ省く */
  trade?: Trade;
  /** 区切りの前の小節なら、進行を続けるか移るかの質問 */
  section?: SectionQuestion;
};

/** いまの進行を続けている長さの言い方。Jevは数えるのが苦手なので、小節数ではなく言葉で伝える */
function progressionAge(barsOn: number): string {
  if (barsOn < 8) return "It has just started.";
  if (barsOn < 24) return "It has been going for a while.";
  return "It has been going for a long time.";
}

/** 掛け合いでの位置。相手と交代で弾いていることと、いまが応えのどこかを伝える */
const TRADE_POSITIONS: Record<Trade["part"], string> = {
  answer:
    "You are trading two-bar phrases with another player. This is the first bar of your two-bar reply. Come in right away.",
  close:
    "You are trading two-bar phrases with another player. This is the last bar of your reply. Finish your thought clearly: the other player takes over next.",
};

/** 前のフレーズとの関係。人のアドリブで「考えて吹いている」ように聞こえる部分を、Jevに選ばせる */
export type Relation = "develop-rhythm" | "develop-melody" | "echo" | "contrast" | "space";

const RELATIONS: Record<Relation, { label: string; description: string }> = {
  "develop-rhythm": {
    label: "リズムを引き継ぐ",
    description: "Keep the rhythm of the previous phrase but change the notes. Sounds like developing a motif.",
  },
  "develop-melody": {
    label: "音の形を引き継ぐ",
    description: "Keep the melodic shape of the previous phrase but play it with a different rhythm.",
  },
  echo: {
    label: "繰り返す",
    description: "Repeat the previous idea over the new chord, like a sequence. Makes the solo feel intentional.",
  },
  contrast: {
    label: "対照的に",
    description: "Do something clearly different from the previous phrase. A fresh idea.",
  },
  space: {
    label: "間で応える",
    description: "Answer the previous phrase with space. Play very little and let it sink in.",
  },
};

/** 4小節のまとまりの中の位置。Jevは数えるのが苦手なので、番号ではなく役割で伝える */
const PHRASE_POSITIONS = [
  "Opening bar of a new four-bar phrase. State a clear idea.",
  "Second bar of the phrase. Continue or answer the idea just stated.",
  "Third bar of the phrase. Build tension toward the end of the phrase.",
  "Last bar of the four-bar phrase. Conclude the thought, or leave space to set up the next phrase.",
];

/**
 * 「間で応える」の選ばれやすさ。Jevは間を好み、実測では15小節中6回これを選んだ。
 * 盛り上がっているのにソロが黙ってしまわないよう、盛り上がりが高いほど選ばれにくくする
 */
export function spaceBias(energy: Energy): number {
  return [1.5, 0.6, 0.3, 0.1][energy - 1]!;
}

const MAX_HISTORY = 4;
/** 繰り返しを避けるために覚えておく、過去のまとまりの形と流れの数 */
const MAX_PAST_PLANS = 3;
/** 「対照的に」のとき、前の小節で使ったものに掛ける倍率 */
const CONTRAST_PENALTY = 0.05;

const DYNAMICS: Record<Dynamics, string> = {
  soft: "Quiet and intimate, almost whispered.",
  medium: "Relaxed, conversational volume.",
  loud: "Strong and projecting, full of energy.",
};

const SHAPES: Record<Shape, string> = {
  steady: "Keep the same intensity through the bar.",
  crescendo: "Start gently and grow louder toward the end of the bar.",
  decrescendo: "Start strong and fade away toward the end of the bar.",
  surge: "Swell up to a peak in the middle of the bar, then pull back.",
};


/** 直前に使ったものは、この倍率で確率を下げる */
const RECENT_PENALTY = 0.3;
const REST_ID = "r-rest";

/**
 * 最近使ったリズムや動きの確率を下げる。Jevは同じ状況には同じ分布を返しやすいので、
 * そのまま抽選すると同じフレーズが続きやすい。使った回数が多いものほど大きく下げる。
 * 休みは繰り返してよいので下げない。
 *
 * @param recent 最近使ったID。同じIDが複数回入っていれば、その回数ぶん下げる
 */
export function penalizeRecent(probabilities: Record<string, number>, recent: readonly string[]): Record<string, number> {
  return Object.fromEntries(
    Object.entries(probabilities).map(([id, probability]) => {
      const uses = id === REST_ID ? 0 : recent.filter((used) => used === id).length;
      return [id, probability * RECENT_PENALTY ** uses];
    }),
  );
}

const RHYTHM_ENERGY = new Map([...RHYTHMS, ...TIE_RHYTHMS].map((rhythm) => [rhythm.id, rhythm.energy]));

/**
 * リズムの確率を、盛り上がりのつまみに近い音数のものへ寄せる。
 * Jevにも合図として伝えるが、つまみを動かしたら必ず音に表れるよう、ルールでも効かせる。
 */
export function biasByEnergy(probabilities: Record<string, number>, energy: Energy): Record<string, number> {
  return Object.fromEntries(
    Object.entries(probabilities).map(([id, probability]) => {
      const distance = (RHYTHM_ENERGY.get(id) ?? energy) - energy;
      return [id, probability / (1 + distance * distance)];
    }),
  );
}

function tempoFeel(bpm: number): string {
  return bpm < 100 ? "slow ballad tempo" : bpm <= 180 ? "medium swing tempo" : "fast, up-tempo swing";
}

function question(instructions: string, options: readonly { id: string; description: string }[]): ChoiceQuestion {
  return {
    type: "choice",
    instructions,
    criteria: Object.fromEntries(options.map((option) => [option.id, option.description])),
  };
}

function describe(rhythm: Rhythm, contour: Contour): string {
  return voicedCount(rhythm) === 0 ? rhythm.description : `Rhythm: ${rhythm.description} Melody: ${contour.description}`;
}

/** 新しく発音する音の数。持ち越して伸ばす音は数えない */
function voicedCount(rhythm: Rhythm): number {
  return rhythm.hits.filter((hit) => !hit.tie).length;
}

/** リズムと音の動きを組み合わせて、半小節ぶんのフレーズにする */
function compose(rhythm: Rhythm, contour: Contour): Cell {
  // 持ち越しの音は高さが決まっているので、動きは新しく発音する音にだけ割り当てる
  const steps = contour.notes(voicedCount(rhythm));
  let next = 0;
  return {
    ...(rhythm.straight ? { straight: true } : {}),
    notes: rhythm.hits.map((hit) => (hit.tie ? { ...hit, step: 0 } : { ...hit, ...steps[next++]! })),
  };
}

function label(rhythm: Rhythm, contour: Contour): string {
  const name = (id: string) => id.slice(2);
  return voicedCount(rhythm) === 0 ? name(rhythm.id) : `${name(rhythm.id)} / ${name(contour.id)}`;
}

/**
 * Jevに1小節ぶんのソロを選ばせる。半小節ごとに「リズム」と「音の動き」を別々に選ばせ、組み合わせて音にする。
 * リズムと音を一体にした型から選ばせる方式より組み合わせが桁違いに多く、同じフレーズに聞こえにくい。
 *
 * 前半を決めてから後半を聞くので、2つがつながった1つのフレーズになりやすい。
 * 次に選べるコードすべての分を、コードごとの質問として1回のリクエストに詰める。
 */
export async function generatePhraseBars(
  client: DecisionClient,
  input: PhraseBarsInput,
  random: () => number = Math.random,
): Promise<SoloBar[]> {
  const rhythms = rhythmsFor(input.bpm);
  const trade = input.trade;
  const answering = trade?.part === "answer";
  /** 相手が弾いた内容。応えの1小節目で、相手が何か弾いていたときだけある */
  const call = answering ? trade.call : null;
  // 応えの2小節目は、1小節目で決めた応え方の音数を引き継ぐ。応えの1小節目は、応え方が決まった後で上書きする
  let energy: Energy = trade?.part === "close" && input.memo.reply ? input.memo.reply.energy : input.energy;
  // 履歴が無く直前の小節だけが渡されたときは、それを1小節ぶんの履歴として扱う
  const history = input.memo.history ?? (input.memo.cells ? [{ chord: "", cells: input.memo.cells }] : []);
  const recent = history.at(-1)?.cells ?? [];
  /** 直近の数小節で使ったすべてのID。同じものを何度も使っていれば、そのぶん重複して入る */
  const used = history.flatMap((bar) => bar.cells);
  /** 直近2小節の両方で使われているか。そうなら、もう引き継がせない */
  const overused = (id: string | undefined) =>
    id !== undefined && history.length >= 2 && history.slice(-2).every((bar) => bar.cells.includes(id));

  /** 送り返されたIDを、一覧にあるものだけ説明文に直す */
  const describeBar = (bar: { chord: string; cells: readonly string[] }): string => {
    const texts = [
      ...[...RHYTHMS, ...TIE_RHYTHMS].filter((rhythm) => bar.cells.includes(rhythm.id)),
      ...CONTOURS.filter((contour) => bar.cells.includes(contour.id)),
    ].map((item) => item.description);
    return `${bar.chord ? `Over ${bar.chord}: ` : ""}${texts.join(" ")}`;
  };

  const baseState = {
    style: "jazz / neo soul jam session, improvised horn solo",
    tempo: `${input.bpm} BPM, ${tempoFeel(input.bpm)}`,
    bandleader_cue: ENERGY[energy].cue,
    ...(input.touch && input.touch !== "none" ? { accompanist: TOUCH_CUE[input.touch] } : {}),
    where_we_are: trade ? TRADE_POSITIONS[trade.part] : (PHRASE_POSITIONS[input.barInPhrase ?? 0] ?? PHRASE_POSITIONS[0]),
    ...(answering
      ? {
          partner_just_played: call
            ? describeCall(call)
            : "They stayed silent on their turn. Fill the space with a clear idea of your own.",
        }
      : {}),
    solo_so_far: history.length > 0 ? history.map(describeBar) : "nothing yet, the solo is just starting",
    ...(input.sustained
      ? { still_sounding: "The last note of the previous bar is still being held as this bar begins." }
      : {}),
    ...(input.memo.dynamics ? { previous_bar_volume: input.memo.dynamics } : {}),
    ...(input.section
      ? {
          // 進行の名前は日本語なので渡さない。Jevは英語のほうが精度が高く、「丸サ進行」のような呼び名を知っている保証も無い
          current_progression: `${input.section.currentMood ?? "A free-flowing progression."} ${progressionAge(input.section.barsOn)}`,
        }
      : {}),
  };

  // 前の小節から引き継ぐフレーズ。前半が休みなら後半を使う
  const [r1, c1, r2, c2] = recent;
  const motif =
    r1 && c1 && r1 !== REST_ID ? { rhythm: r1, contour: c1 } : r2 && c2 && r2 !== REST_ID ? { rhythm: r2, contour: c2 } : null;
  const motifRhythm = overused(motif?.rhythm) ? undefined : rhythms.find((rhythm) => rhythm.id === motif?.rhythm);
  const motifContour = overused(motif?.contour) ? undefined : CONTOURS.find((contour) => contour.id === motif?.contour);

  // 4小節のまとまりの形と高さの流れ。まとまりの最初の小節で選び、残りの小節はメモから引き継ぐ
  const barInPhrase = input.barInPhrase ?? 0;
  const planning = barInPhrase === 0;
  // 掛け合いでは自分の番が2小節しかないので、4小節の形（どこで休むか）は使わない
  const shaping = planning && !trade;
  let phraseShape = planning || trade ? undefined : phraseShapeById(input.memo.shape);
  let arcId = planning ? undefined : registerArcById(input.memo.arc)?.id;
  /** 半小節の「吹く・休む」。形が決まっていなければ undefined（縛りなし） */
  const slotAt = (half: number) => phraseShape?.slots[barInPhrase * 2 + half];

  /** リズムを選ぶときの縛り。形が「吹く」としている場所では休めない */
  type Constraint = { allowRest: boolean };
  const constraintFor = (half: number): Constraint => ({ allowRest: slotAt(half) !== true });
  const allowed = (rhythm: Rhythm, constraint: Constraint) => constraint.allowRest || rhythm.id !== REST_ID;
  const unconstrained: Constraint = { allowRest: true };

  const allRhythms = [...RHYTHMS, ...TIE_RHYTHMS];
  const isRun = (id: string | undefined) => allRhythms.find((rhythm) => rhythm.id === id)?.run === true;
  /** 直前まで、半小節いくつぶん続けて16分音符で走っているか */
  const runsBefore = (() => {
    const halves = history.flatMap((bar) => [bar.cells[0], bar.cells[2]]);
    let count = 0;
    while (count < halves.length && isRun(halves[halves.length - 1 - count])) count++;
    return count;
  })();

  const pickRhythm = (
    probabilities: Record<string, number>,
    used: readonly string[],
    level: Energy = energy,
    constraint = unconstrained,
    runs = 0,
  ): Rhythm => {
    // 走っている最中は、走るリズムを「最近使ったから」と下げない。続けて走らせるため
    const penalized = penalizeRecent(probabilities, runs > 0 ? used.filter((id) => !isRun(id)) : used);
    const shaped = holdBackLongNotes(keepRunning(boostSixteenths(penalized, input.bpm), runs));
    // 伴奏が長く押さえてしっとりしているときは、ソロも落ち着かせる
    const settled = input.touch === "sustained" ? settleDown(shaped) : shaped;
    const odds = Object.fromEntries(
      Object.entries(biasByEnergy(settled, level)).filter(([id, odd]) => odd > 0 && allowed(rhythmById(id), constraint)),
    );
    // 縛りに合うものにJevが確率を置いていなければ、縛りに合う最初のリズムにする
    return Object.keys(odds).length > 0
      ? rhythmById(sampleFromDistribution(odds, random))
      : rhythms.find((rhythm) => rhythm.id !== REST_ID && allowed(rhythm, constraint))!;
  };

  // 前の小節が次へつなぐ形で終わっていたら、この小節は頭から鳴らして受け止める
  const previousEnding = [...RHYTHMS, ...TIE_RHYTHMS].find((rhythm) => rhythm.id === recent[2]);
  const mustLand = previousEnding !== undefined && leadsOut(previousEnding);
  /**
   * このコードへ進んだ場合に、直前の小節の最後に鳴っている音の高さ。
   * 締切より後に鳴り始める音なら、画面側がこのコードに合う音へ寄せて鳴らすので、同じ計算をする
   */
  const currentChord = history.at(-1)?.chord;
  const heldPitch = (chord: string): number =>
    input.retargetable && currentChord ? aimPitch(input.previousPitch, currentChord, chord) : input.previousPitch;

  /** 小節の前半に選べるリズム */
  const firstHalfRhythms: Rhythm[] = [
    ...(mustLand ? rhythms.filter((rhythm) => rhythm.hits[0]?.at === 0) : rhythms),
    // 前の音が鳴り続けていれば、持ち越して伸ばす選択肢を出す。
    // 実際に持ち越すかは、音に直すときにコードごとに決める（鳴っている音が合わないコードでは持ち越さない）
    ...(input.sustained ? TIE_RHYTHMS : []),
  ];
  const pickContour = (probabilities: Record<string, number>, used: readonly string[]) =>
    contourById(sampleFromDistribution(favorLeaps(penalizeRecent(probabilities, used)), random));

  const startedAt = performance.now();
  // フレーズ（リズムと音の動き）は、コードによらず1つだけ選ばせる。どのコードの音にするかは、音に直すときに決める。
  // 以前は候補のコードごとに質問を重ねていたが、フレーズは度数で持っているので、コードごとに選び直す意味が薄い。
  // 1つにすれば、小節の途中で何度コードが変わっても同じフレーズを乗せ直せて、トークンも候補の数ぶん減る
  const firstQuestions: Record<string, ChoiceQuestion> = {
    rhythm_first: question(
      "Pick the rhythm the improvising soloist plays in the first half of this bar. Follow the bandleader's cue. A great solo breathes: it answers the previous phrase, mixes movement with space, and does not repeat the same rhythm.",
      firstHalfRhythms,
    ),
    contour_first: question(
      "Pick how the melody moves in the first half of this bar. It should answer or develop the previous phrase rather than repeat it.",
      CONTOURS,
    ),
  };
  firstQuestions.dynamics = question(
    "How loud should the soloist play this bar, given the bandleader's cue and how the solo has been going?",
    Object.entries(DYNAMICS).map(([id, description]) => ({ id, description })),
  );
  firstQuestions.shape = question(
    "How should the intensity move within this bar?",
    Object.entries(SHAPES).map(([id, description]) => ({ id, description })),
  );
  if (shaping) {
    firstQuestions.phrase_shape = question(
      "A new four-bar phrase starts here. Pick where the soloist plays and where they stay silent over these four bars. Vary it from the previous phrase, and follow the bandleader's cue.",
      PHRASE_SHAPES,
    );
  }
  if (planning) {
    firstQuestions.register_arc = question(
      "Pick how the pitch of the solo travels over these four bars. A solo that goes somewhere is more exciting than one that stays in the same range.",
      REGISTER_ARCS,
    );
  }
  if (call) {
    firstQuestions.reply = question(
      "The other player just finished their phrase and it is your turn. How do you respond to what they played?",
      Object.entries(REPLIES).map(([id, { description }]) => ({ id, description })),
    );
  }
  // 相手に応えるときは、自分の前のフレーズとの関係は聞かない（相手に応えるのが先）
  if (history.length > 0 && !call) {
    firstQuestions.relation = question(
      "How should this bar relate to the previous phrase? Good solos develop ideas instead of only stringing new ones together, but too much repetition gets dull.",
      Object.entries(RELATIONS).map(([id, { description }]) => ({ id, description })),
    );
  }

  if (input.section) {
    firstQuestions.section = question(
      "The band is reaching the end of an eight-bar section. For the next section, should they keep playing the current chord progression, or move to a different one? Keep it if it has only just started. If it has been going for a while, consider moving to the mood that fits how the session feels now.",
      [
        {
          id: "stay",
          description: `Keep playing the current progression.${input.section.currentMood ? ` ${input.section.currentMood}` : ""}`,
        },
        ...input.section.options.map((option) => ({ id: option.id, description: option.mood })),
      ],
    );
  }

  const first = await client.decide(baseState, firstQuestions);
  // 区切りで続けるか移るか。抽選して、確率と一緒に画面側へ返す
  // 移り先に倍率が付いていれば、その分だけ選ばれやすくする（画面に出す確率は、Jevが返したまま）
  const sectionBiases = new Map(input.section?.options.map((option) => [option.id, option.bias ?? 1]));
  const section = first.section
    ? {
        choice: sampleFromDistribution(
          Object.fromEntries(
            Object.entries(first.section.probabilities).map(([id, odd]) => [id, odd * (sectionBiases.get(id) ?? 1)]),
          ),
          random,
        ),
        odds: first.section.probabilities,
      }
    : null;
  // 新しいまとまりに入るときは、直前の形と流れを「過去のもの」に回す
  const pastShapes = planning
    ? [...(input.memo.shape ? [input.memo.shape] : []), ...(input.memo.pastShapes ?? [])].slice(0, MAX_PAST_PLANS)
    : (input.memo.pastShapes ?? []);
  const pastArcs = planning
    ? [...(input.memo.arc ? [input.memo.arc] : []), ...(input.memo.pastArcs ?? [])].slice(0, MAX_PAST_PLANS)
    : (input.memo.pastArcs ?? []);
  // 相手への応え方。選ばれた応え方で、この番の音数と、音の動きの向きが決まる
  const reply = call && first.reply ? (sampleFromDistribution(first.reply.probabilities, random) as ReplyId) : null;
  if (call && reply) energy = replyEnergy(reply, call, energy);
  /** 真似るなら相手と同じ向きへ、返すなら逆の向きへ、音の動きを寄せる */
  const towardCall = (odds: Record<string, number>): Record<string, number> => {
    if (!call || (reply !== "echo" && reply !== "answer")) return odds;
    const opposite = { rising: "falling", falling: "rising", level: "wavy", wavy: "wavy" } as const;
    return biasByDirection(odds, reply === "echo" ? call.direction : opposite[call.direction]);
  };
  if (shaping) {
    // 最近のまとまりで使った形・流れは選ばれにくくする。直前の1つだけを見ると、2種類の交互になった
    phraseShape = phraseShapeById(
      sampleFromDistribution(
        biasShapesByEnergy(penalizeRecent(first.phrase_shape!.probabilities, pastShapes), energy),
        random,
      ),
    );
  }
  if (planning) {
    arcId = sampleFromDistribution(penalizeRecent(first.register_arc!.probabilities, pastArcs), random);
  }
  // 同じ関係が続くと単調になるので、直前に選ばれた関係は選ばれにくくする
  const relation = first.relation
    ? (sampleFromDistribution(
        Object.fromEntries(
          Object.entries(
            penalizeRecent(first.relation.probabilities, input.memo.relation ? [input.memo.relation] : []),
          ).map(([id, odd]) => [id, id === "space" ? odd * spaceBias(energy) : odd]),
        ),
        random,
      ) as Relation)
    : null;

  const firstHalf = (() => {
    const rhythmOdds = first.rhythm_first!.probabilities;
    const contourOdds = first.contour_first!.probabilities;
    // 「対照的に」では、前の小節で使ったものをほぼ選ばせない
    // 走っている最中の走るリズムは、対照の対象から外す（走り続けるほうを優先する）
    const contrasted = (odds: Record<string, number>) =>
      Object.fromEntries(
        Object.entries(odds).map(([id, odd]) => [
          id,
          recent.includes(id) && !(runsBefore > 0 && isRun(id)) ? odd * CONTRAST_PENALTY : odd,
        ]),
      );

    // 形が「休む」としている場所では休む。前の小節が次へつなぐ形で終わっていても、形が決めたフレーズの終わりを守る
    const resting = slotAt(0) === false;
    // 応えの出だしは休まない。相手が弾き終えたら、すぐ何か弾いて応える
    const constraint: Constraint = { allowRest: constraintFor(0).allowRest && !mustLand && !answering };
    // 着地が必要なのに遅れて入るリズムや、形の縛りに合わないリズムは、前の小節から引き継がない
    const canKeepRhythm =
      motifRhythm !== undefined && !(mustLand && motifRhythm.hits[0]?.at !== 0) && allowed(motifRhythm, constraint);
    const keepRhythm = canKeepRhythm && (relation === "develop-rhythm" || relation === "echo");
    const keepContour = relation === "develop-melody" || relation === "echo";
    // Jevが持ち越しを選んだら、前との関係より優先する。音をつなぐ意図のほうが強い選択だから
    const sampled = pickRhythm(
      holdBackTies(favorDownbeat(relation === "contrast" ? contrasted(rhythmOdds) : rhythmOdds)),
      used,
      energy,
      constraint,
      runsBefore,
    );
    // 持ち越しと、走り続ける選択は、前との関係より優先する
    const rhythm = sampled.hits[0]?.tie || (runsBefore > 0 && sampled.run && !resting)
      ? sampled
      : resting
        ? rhythmById(REST_ID)
        : keepRhythm && motifRhythm
          ? motifRhythm
          : relation === "space"
            ? // 間で応えるときは、頭から鳴るリズムへの優遇を掛けず、音数の少ないリズムに寄せる
              pickRhythm(holdBackTies(rhythmOdds), used, 1, constraint)
            : sampled;
    const contour =
      keepContour && motifContour
        ? motifContour
        : pickContour(towardCall(relation === "contrast" ? contrasted(contourOdds) : contourOdds), used);
    return { rhythm, contour };
  })();
  // 小節の強さは、Jevが返した確率のまま抽選する。
  // 以前は盛り上がりで重みを掛け、直前と同じ強さも選ばれにくくしていたが、小節ごとに強さが入れ替わって
  // 急に小さくなるのが不自然だった。盛り上がりは合図の文でJevに伝わっている
  const dynamics = sampleFromDistribution(first.dynamics!.probabilities, random) as Dynamics;
  const shape = sampleFromDistribution(
    penalizeRecent(first.shape!.probabilities, input.memo.intensity ? [input.memo.intensity] : []),
    random,
  ) as Shape;

  const second = await client.decide(
    {
      ...baseState,
      volume_of_this_bar: dynamics,
      first_half_of_this_bar: describe(firstHalf.rhythm, firstHalf.contour),
    },
    {
      rhythm_second: question(
        "Pick the rhythm for the second half of this bar, continuing from the first half so the two parts form one musical sentence. If the first half was busy, consider space; if it was sparse, consider movement.",
        rhythms,
      ),
      contour_second: question(
        "Pick how the melody moves in the second half of this bar, so that it completes the idea started in the first half.",
        CONTOURS,
      ),
    },
  );
  const latencyMs = performance.now() - startedAt;

  const usedSoFar = [...used, firstHalf.rhythm.id, firstHalf.contour.id];
  const secondHalf = {
    // 形が「休む」としている場所では休む
    rhythm:
      slotAt(1) === false
        ? rhythmById(REST_ID)
        : pickRhythm(
            second.rhythm_second!.probabilities,
            usedSoFar,
            energy,
            constraintFor(1),
            // 前半が走っていれば、後半も走りやすくする（1小節まるごと走る）
            firstHalf.rhythm.run ? runsBefore + 1 : 0,
          ),
    contour: pickContour(towardCall(second.contour_second!.probabilities), usedSoFar),
  };
  const composed: [Cell, Cell] = [
    compose(firstHalf.rhythm, firstHalf.contour),
    compose(secondHalf.rhythm, secondHalf.contour),
  ];
  const cells = [firstHalf.rhythm.id, firstHalf.contour.id, secondHalf.rhythm.id, secondHalf.contour.id];

  // 選ばれた1つのフレーズを、渡されたコードそれぞれの音に直す
  return input.chords.map((chord) => {
    // 伴奏が激しければ高い音域、しっとりなら低めを目指す。どちらでもなければ4小節の高さの流れに任せる
    const touch = input.touch ?? "none";
    const targetPitch = touchRegister(touch, input.range) ?? registerTarget(arcId, barInPhrase, input.range);
    // 伴奏の質感とテンポの倍率のうち、大きいほうを使う（掛け合わせると大きくなりすぎる）
    const velocityScale = Math.max(touchVelocity(touch), tempoVelocity(input.bpm));
    const render = {
      previousPitch: heldPitch(chord),
      // 伴奏が激しければ高い音域だけ、しっとりなら低めの音域で吹く
      ...touchRange(touch, input.range),
      dynamics,
      shape,
      ...(targetPitch === undefined ? {} : { targetPitch }),
      // 鳴っている音がこのコードに合わなければ、持ち越さない（小節の頭で切れる）
      allowTie: input.sustained === true && fitsChord(heldPitch(chord), chord),
      // 伴奏の質感で、音の大きさの幅を広げる
      ...(velocityScale === 1 ? {} : { velocityScale }),
      // 前の小節の終わりの音量から、半小節かけてこの小節の音量へつなぐ
      ...(input.memo.level === undefined ? {} : { startLevel: input.memo.level }),
    };
    const notes = renderCells(composed, chord, render);
    return {
      chord,
      notes,
      summary: `${label(firstHalf.rhythm, firstHalf.contour)} + ${label(secondHalf.rhythm, secondHalf.contour)}`,
      details: [
        `強弱 ${dynamics} / ${shape}`,
        `盛り上がり ${ENERGY[energy].label}`,
        ...(reply ? [`応え方 ${REPLIES[reply].label}`] : []),
        ...(relation ? [`前との関係 ${RELATIONS[relation].label}`] : []),
        ...(phraseShape ? [`形 ${phraseShape.label}`] : []),
        ...(arcId ? [`高さ ${registerArcById(arcId)?.label ?? arcId}`] : []),
      ].join(" / "),
      latencyMs,
      calls: 2,
      lastPitch: notes.at(-1)?.pitch ?? heldPitch(chord),
      memo: {
        cells,
        dynamics,
        history: [...history.filter((bar) => bar.chord !== ""), { chord, cells }].slice(-MAX_HISTORY),
        ...(relation ? { relation } : {}),
        intensity: shape,
        level: barEndLevel(render),
        ...(phraseShape ? { shape: phraseShape.id } : {}),
        ...(arcId ? { arc: arcId } : {}),
        ...(pastShapes.length > 0 ? { pastShapes } : {}),
        ...(pastArcs.length > 0 ? { pastArcs } : {}),
        // 応えの2小節目へ、応え方とその音数を引き継ぐ
        ...(reply ? { reply: { id: reply, energy } } : {}),
      },
      plan: { cells: composed, render },
      ...(section ? { section } : {}),
      ...(reply && first.reply ? { reply: { id: reply, label: REPLIES[reply].label, odds: first.reply.probabilities } } : {}),
    };
  });
}
