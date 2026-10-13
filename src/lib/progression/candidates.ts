export type ChordCandidate = {
  chord: string;
  /** 1=定番、2=ひねり、3=大胆 */
  adventure: 1 | 2 | 3;
  /** なぜこの進行が成り立つかの短い説明 */
  reason: string;
};

type Transition = [chord: string, adventure: ChordCandidate["adventure"], reason: string];

// Cメジャーを中心にした重み付き遷移グラフ（ADR 0003）。
// 各コードの候補は冒険度の低い順に並べ、先頭を「選ばなかったときの既定」とする。
// 鍵盤の1つの鍵に1つのコードを割り当てるので、同じ候補リスト内でルート音は重複させない。
const TRANSITIONS: Record<string, Transition[]> = {
  Cmaj7: [
    ["Dm7", 1, "IIへ。ツーファイブの入口"],
    ["Am7", 1, "VIへ。平行調の落ち着き"],
    ["Fmaj7", 1, "IVへ。明るく開く"],
    ["E7", 2, "VIに向かうセカンダリードミナント"],
    ["Abmaj7", 3, "同主短調からの借用（bVI）"],
  ],
  Dm7: [
    ["G7", 1, "Vへ。王道のツーファイブ"],
    ["Db7", 2, "裏コード。半音で滑り降りる"],
    ["Em7", 2, "IIIへ順次上行"],
    ["Fm7", 3, "同主短調からの借用（IVm）"],
  ],
  Em7: [
    ["A7", 1, "IIに向かうセカンダリードミナント"],
    ["Fmaj7", 1, "IVへ半音上行"],
    ["Dm7", 2, "IIへ順次下行"],
  ],
  Fmaj7: [
    ["G7", 1, "Vへ。解決に向かう"],
    ["Em7", 1, "IIIへ半音下行"],
    ["Dm7", 1, "IIへ。同じサブドミナントの色"],
    ["Fm7", 2, "サブドミナントマイナー。切なく陰る"],
    ["Bb7", 3, "バックドアのドミナント（bVII7）"],
  ],
  G7: [
    ["Cmaj7", 1, "Iへ解決"],
    ["Am7", 2, "偽終止。VIへ逃げる"],
    ["Em7", 2, "IIIへ。解決をぼかす"],
    ["Abmaj7", 3, "bVIへ。意外な着地"],
  ],
  Am7: [
    ["Dm7", 1, "IIへ。4度進行"],
    ["Fmaj7", 1, "IVへ。3度下行"],
    ["G7", 2, "Vへ直行"],
    ["Abmaj7", 3, "半音下の借用和音へ"],
  ],
  A7: [
    ["Dm7", 1, "IIへ解決"],
    ["Fmaj7", 2, "IVへ逃げる偽終止"],
  ],
  E7: [
    ["Am7", 1, "VIへ解決"],
    ["Fmaj7", 2, "IVへ逃げる偽終止"],
  ],
  Db7: [
    ["Cmaj7", 1, "Iへ半音で解決"],
    ["Am7", 2, "VIへ。解決をぼかす"],
  ],
  Fm7: [
    ["Bb7", 1, "バックドアのツーファイブ"],
    ["Cmaj7", 1, "Iへ。サブドミナントマイナー終止"],
    ["G7", 2, "Vへ"],
    ["Em7", 2, "IIIへ半音下行"],
  ],
  Bb7: [
    ["Cmaj7", 1, "バックドアからIへ解決"],
    ["Ebmaj7", 1, "bIIIへ。4度進行"],
    ["Am7", 2, "VIへ半音下行"],
  ],
  Ebmaj7: [
    ["Abmaj7", 1, "bVIへ。4度進行"],
    ["Dm7", 2, "IIへ半音下行して戻る"],
    ["Fm7", 2, "IVmへ"],
  ],
  Abmaj7: [
    ["G7", 1, "Vへ半音下行"],
    ["Bb7", 1, "bVI→bVII→I の上行"],
    ["Db7", 2, "裏コードへ。4度進行"],
    ["Fm7", 2, "IVmへ"],
    ["Cmaj7", 2, "Iへ直接戻る"],
  ],
};

export const KNOWN_CHORDS: readonly string[] = Object.keys(TRANSITIONS);

export function nextChordCandidates(current: string): ChordCandidate[] {
  const transitions = TRANSITIONS[current];
  if (!transitions) {
    throw new Error(`進行のルールに無いコードです: ${current}`);
  }
  return transitions.map(([chord, adventure, reason]) => ({ chord, adventure, reason }));
}
