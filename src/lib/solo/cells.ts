// 半小節ぶんのフレーズ。リズム（rhythms.ts）と音の動き（contours.ts）を組み合わせて作り、
// render-cells.ts がコードに合わせた音に直す。

export type CellNote = {
  /** 半小節の頭からの拍数 */
  at: number;
  /** 長さ（拍） */
  dur: number;
  /**
   * コードのスケール上の段。0=ルート、1=9th、2=3rd、3=11th、4=5th、5=13th、6=7th。
   * 7で1オクターブ上のルート、-1で下の7thというように、範囲の外はオクターブ違いの同じ度数になる
   */
  step: number;
  /** スケールの音からずらす半音数。-1で半音下からのアプローチ */
  alt?: number;
  /** ghost: 飲み込むように弱く / accent: 強く */
  accent?: "ghost" | "accent";
  /** true なら、前の小節の最後の音を持ち越して伸ばす。新しく発音せず、高さも前の音のまま（step は使わない） */
  tie?: boolean;
};

export type Cell = {
  /** true ならスウィングさせない（均等な16分音符や3連符のように位置が決まっているもの） */
  straight?: boolean;
  notes: readonly CellNote[];
};
