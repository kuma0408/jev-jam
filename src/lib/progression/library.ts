export type Progression = {
  /** 画面に出す呼び名 */
  name: string;
  chords: readonly string[];
  /** 最後のコードから先頭に戻って繰り返す進行か */
  loop?: boolean;
  /** ポップス寄りの進行。ジャズ/ネオソウルのセッションでは優先度を下げる */
  pop?: boolean;
  /**
   * 1小節に2つのコードを半分ずつ置く場所。i を入れると、chords[i] を小節の前半、chords[i + 1] を後半に置く。
   * 省けば、どのコードも1小節ずつ
   */
  split?: readonly number[];
  /** 区切りで移り先にするときのID（英数字）。繰り返し型の進行だけが持つ */
  id?: string;
  /** Jevに渡す、この進行の雰囲気の説明（英語）。繰り返し型の進行だけが持つ */
  mood?: string;
};

// よく使われるコード進行の一覧。すべてCメジャーで書く。
// セブンスコードは maj7 / m7 / 7 の3種類に揃えている（例: 枯葉の Bm7b5 は省いた）。
export const PROGRESSIONS: readonly Progression[] = [
  { name: "ツーファイブワン", chords: ["Dm7", "G7", "Cmaj7"] },
  {
    name: "循環（I-VI-II-V）", chords: ["Cmaj7", "Am7", "Dm7", "G7"], loop: true,
    id: "i-vi-ii-v",
    mood: "The classic jazz turnaround (I-vi-ii-V). Warm, familiar and relaxed, like a standard.",
  },
  {
    name: "循環（I-VI7-II-V）", chords: ["Cmaj7", "A7", "Dm7", "G7"], loop: true,
    id: "i-vi7-ii-v",
    mood: "A jazzier turnaround with a secondary dominant (I-VI7-ii-V). Bluesy tension that keeps pulling forward.",
  },
  { name: "3-6-2-5", chords: ["Em7", "A7", "Dm7", "G7", "Cmaj7"] },
  {
    name: "王道進行", chords: ["Fmaj7", "G7", "Em7", "Am7"], loop: true, pop: true,
    id: "royal-road",
    mood: "IV-V-iii-vi, the bittersweet J-pop progression. Bright but wistful and emotional.",
  },
  // | Fmaj7 | E7 | Am7 | Gm7 C7 | の4小節で1周する。1小節に1つずつ置くと5小節で1周し、4小節のまとまりとずれていく
  {
    name: "Just the Two of Us進行", chords: ["Fmaj7", "E7", "Am7", "Gm7", "C7"], loop: true, split: [3],
    id: "just-the-two",
    mood: "The Just the Two of Us progression. Smooth, mellow and soulful neo soul groove.",
  },
  {
    name: "丸サ進行", chords: ["Fmaj7", "E7", "Am7", "C7"], loop: true,
    id: "marusa",
    mood: "IV-III7-vi-I7, a city-pop favorite. Stylish, urban and slightly melancholic.",
  },

  {
    name: "小室進行", chords: ["Am7", "Fmaj7", "G7", "Cmaj7"], loop: true, pop: true,
    id: "komuro",
    mood: "vi-IV-V-I, the driving 90s dance-pop progression. Dramatic, minor-tinged and energetic.",
  },
  { name: "サブドミナントマイナー終止", chords: ["Fmaj7", "Fm7", "Cmaj7"] },
  { name: "サブドミナントマイナーからの下降", chords: ["Fmaj7", "Fm7", "Em7", "A7"] },
  { name: "バックドア", chords: ["Fm7", "Bb7", "Cmaj7"] },
  { name: "裏コード", chords: ["Dm7", "Db7", "Cmaj7"] },
  { name: "枯葉風", chords: ["Dm7", "G7", "Cmaj7", "Fmaj7", "E7", "Am7"] },
  { name: "bVI-bVII-I", chords: ["Abmaj7", "Bb7", "Cmaj7"] },
  { name: "ドミナントからbVIへ", chords: ["Dm7", "G7", "Abmaj7", "Bb7", "Cmaj7"] },
  { name: "順次下降", chords: ["Fmaj7", "Em7", "Dm7", "Cmaj7"] },
  { name: "IVへのツーファイブ", chords: ["Gm7", "C7", "Fmaj7"] },
  { name: "I-I7-IV-IVm", chords: ["Cmaj7", "C7", "Fmaj7", "Fm7"] },
  {
    name: "レディバード風ターンアラウンド", chords: ["Cmaj7", "Ebmaj7", "Abmaj7", "Db7"], loop: true,
    id: "ladybird",
    mood: "The Lady Bird turnaround with chromatic major chords. Adventurous, colorful and modern jazz.",
  },
  {
    name: "I-IVの往復", chords: ["Cmaj7", "Fmaj7"], loop: true, pop: true,
    id: "one-four",
    mood: "Just I and IV back and forth. Open, simple and dreamy, lots of room to stretch out.",
  },
  { name: "I-III7-VI", chords: ["Cmaj7", "E7", "Am7"] },
  { name: "偽終止", chords: ["Dm7", "G7", "Am7"] },
  // ここから下は、続きが1通りしか無いコードに別の道を作るために足した進行
  { name: "ドミナントの連鎖", chords: ["E7", "A7", "D7", "G7", "Cmaj7"] },
  { name: "III7からIVへの偽終止", chords: ["E7", "Fmaj7"] },
  { name: "IVへの裏コード", chords: ["Gm7", "Gb7", "Fmaj7"] },
  { name: "I7からIVmへ", chords: ["C7", "Fm7", "Bb7"] },
  { name: "bVII7からVIへ", chords: ["Bb7", "Am7"] },
  { name: "bIIIからツーファイブへ", chords: ["Ebmaj7", "Dm7", "G7"] },
  { name: "裏コードからの偽終止", chords: ["Db7", "Am7"] },
];
