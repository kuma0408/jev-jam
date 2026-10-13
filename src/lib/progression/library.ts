export type Progression = {
  /** 画面に出す呼び名 */
  name: string;
  chords: readonly string[];
  /** 最後のコードから先頭に戻って繰り返す進行か */
  loop?: boolean;
  /** ポップス寄りの進行。ジャズ/ネオソウルのセッションでは優先度を下げる */
  pop?: boolean;
};

// よく使われるコード進行の一覧。すべてCメジャーで書く。
// セブンスコードは maj7 / m7 / 7 の3種類に揃えている（例: 枯葉の Bm7b5 は省いた）。
export const PROGRESSIONS: readonly Progression[] = [
  { name: "ツーファイブワン", chords: ["Dm7", "G7", "Cmaj7"] },
  { name: "循環（I-VI-II-V）", chords: ["Cmaj7", "Am7", "Dm7", "G7"], loop: true },
  { name: "循環（I-VI7-II-V）", chords: ["Cmaj7", "A7", "Dm7", "G7"], loop: true },
  { name: "3-6-2-5", chords: ["Em7", "A7", "Dm7", "G7", "Cmaj7"] },
  { name: "王道進行", chords: ["Fmaj7", "G7", "Em7", "Am7"], loop: true, pop: true },
  { name: "Just the Two of Us進行", chords: ["Fmaj7", "E7", "Am7", "Gm7", "C7"], loop: true },
  { name: "丸サ進行", chords: ["Fmaj7", "E7", "Am7", "C7"], loop: true },
  { name: "カノン進行", chords: ["Cmaj7", "G7", "Am7", "Em7", "Fmaj7", "Cmaj7", "Fmaj7", "G7"], loop: true, pop: true },
  { name: "小室進行", chords: ["Am7", "Fmaj7", "G7", "Cmaj7"], loop: true, pop: true },
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
  { name: "レディバード風ターンアラウンド", chords: ["Cmaj7", "Ebmaj7", "Abmaj7", "Db7"], loop: true },
  { name: "I-IVの往復", chords: ["Cmaj7", "Fmaj7"], loop: true, pop: true },
  { name: "I-III7-VI", chords: ["Cmaj7", "E7", "Am7"] },
  { name: "偽終止", chords: ["Dm7", "G7", "Am7"] },
];
