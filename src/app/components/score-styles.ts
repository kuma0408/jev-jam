// 演奏の流れの描き方。見比べて選べるよう、3種類を用意している（決まったら残りは消す）。
// どれも、縦は音の高さ（五線と同じ並び）、横は時間（右の「いま」から左へ流れる）で、
// あなたの和音は押している間だけ伸び、Jevのソロは鳴った長さのぶんだけ描く。
import { stepOf } from "../../lib/music/staff.ts";

export type ScoreStyleId = "ribbon" | "geometry" | "ripple";

/** あなたが押さえた和音。end は離した時刻で、押さえている間は null */
export type YouMark = { kind: "you"; start: number; end: number | null; pitches: number[] };
/** Jevのソロの1音 */
export type JevMark = { kind: "jev"; start: number; seconds: number; pitch: number; strength: number };
/** 小節の頭と、コードが変わったところ */
export type BarMark = { kind: "bar"; at: number; chord: string };
export type Mark = YouMark | JevMark | BarMark;

/** 描くのに使う寸法と道具 */
export type Frame = {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** いまの時刻（秒） */
  now: number;
  /** 「いま」の線の位置 */
  nowX: number;
  /** 左端の、記号を置く欄の幅。ここより左では描かない */
  leftEdge: number;
  /** 1段（線と間の半分）の高さ */
  half: number;
  /** 時刻の横位置 */
  xAt: (time: number) => number;
  /** 段（真ん中のドを0とした線と間）の縦位置 */
  yOf: (step: number) => number;
  musicFont: string;
  displayFont: string;
  /** 動きを減らす設定か */
  reducedMotion: boolean;
};

/** ト音記号の五線の5本の線の位置（ミ・ソ・シ・レ・ファ） */
export const STAFF_LINES = [2, 4, 6, 8, 10];
/** Jevの音と音の間がこれ以上空いたら、旋律の線を切る（秒） */
const PHRASE_GAP_SECONDS = 0.6;
/** いちばん上に書く位置（コード名など） */
const TOP_STEP = 16;

const COLORS = {
  ink: "#17132e",
  inkSoft: "#55516b",
  line: "#7b7890",
  blue: "#2a62f2",
  red: "#cf2e25",
  mustard: "#d99a1e",
  purple: "#7d3be6",
};

/** 音の高さの縦位置。フラットの付く音は、上の音との間に置く */
function pitchY(frame: Frame, pitch: number): number {
  const { step, accidental } = stepOf(pitch);
  return frame.yOf(accidental ? step - 0.5 : step);
}

function endOf(frame: Frame, mark: YouMark): number {
  return mark.end ?? frame.now;
}

/** 左端に近づいたものを薄くする倍率（0〜1） */
function fadeAt(frame: Frame, x: number): number {
  return Math.max(0, Math.min(1, (x - frame.leftEdge) / 60));
}

function staffLines(frame: Frame, alpha: number) {
  const { context } = frame;
  context.globalAlpha = alpha;
  context.fillStyle = COLORS.line;
  for (const line of STAFF_LINES) context.fillRect(8, frame.yOf(line) - 0.5, frame.width - 16, 1);
  context.globalAlpha = 1;
}

function clef(frame: Frame, alpha: number) {
  const { context, half } = frame;
  context.globalAlpha = alpha;
  context.fillStyle = COLORS.ink;
  context.font = `${Math.round(half * 8.6)}px ${frame.musicFont}, serif`;
  context.textBaseline = "alphabetic";
  context.fillText("𝄞", half * 0.6, frame.yOf(-0.6));
  context.globalAlpha = 1;
}

function chordNames(frame: Frame, marks: readonly Mark[], size: number, color: string, alpha = 1) {
  const { context } = frame;
  context.font = `800 ${Math.round(size)}px ${frame.displayFont}, "Helvetica Neue", Arial, sans-serif`;
  context.textBaseline = "alphabetic";
  context.fillStyle = color;
  for (const mark of marks) {
    if (mark.kind !== "bar") continue;
    const x = frame.xAt(mark.at);
    if (x < frame.leftEdge) continue;
    context.globalAlpha = alpha * fadeAt(frame, x);
    context.fillText(mark.chord, x + 6, frame.yOf(TOP_STEP));
  }
  context.globalAlpha = 1;
}

/**
 * 光の帯と線。五線は薄く残す。
 * あなたの和音は、押している間伸びる青い光の帯（下に重ねた音は細い線）。
 * Jevのソロは、音と音をなめらかにつなぐ1本の線（旋律の軌跡）
 */
function drawRibbon(frame: Frame, marks: readonly Mark[]) {
  const { context, half, xAt } = frame;
  staffLines(frame, 0.35);
  clef(frame, 0.22);

  // 小節の区切りは、上から下まで薄い点線にする
  context.save();
  context.setLineDash([2, 6]);
  context.strokeStyle = COLORS.line;
  for (const mark of marks) {
    if (mark.kind !== "bar") continue;
    const x = xAt(mark.at);
    if (x < frame.leftEdge) continue;
    context.globalAlpha = 0.4 * fadeAt(frame, x);
    context.beginPath();
    context.moveTo(x, frame.yOf(TOP_STEP - 1.5));
    context.lineTo(x, frame.height - 8);
    context.stroke();
  }
  context.restore();
  chordNames(frame, marks, half * 2.1, COLORS.inkSoft);

  // あなたの和音
  for (const mark of marks) {
    if (mark.kind !== "you") continue;
    const x0 = xAt(mark.start);
    const x1 = Math.max(x0 + half * 0.8, xAt(endOf(frame, mark)));
    if (x1 < frame.leftEdge) continue;
    const fade = fadeAt(frame, x1);
    const top = Math.max(...mark.pitches);
    for (const pitch of mark.pitches) {
      const y = pitchY(frame, pitch);
      if (pitch === top) {
        const thickness = half * 1.3;
        const gradient = context.createLinearGradient(x0, 0, x1, 0);
        gradient.addColorStop(0, "rgba(42, 98, 242, 0.35)");
        gradient.addColorStop(1, "rgba(42, 98, 242, 0.95)");
        context.save();
        context.globalAlpha = fade;
        context.shadowColor = "rgba(42, 98, 242, 0.55)";
        context.shadowBlur = mark.end === null ? 22 : 10;
        context.fillStyle = gradient;
        context.beginPath();
        context.roundRect(x0, y - thickness / 2, x1 - x0, thickness, thickness / 2);
        context.fill();
        context.restore();
      } else {
        context.globalAlpha = 0.35 * fade;
        context.fillStyle = COLORS.blue;
        context.fillRect(x0, y - 1, x1 - x0, 2);
      }
    }
  }
  context.globalAlpha = 1;

  // Jevの旋律の線。鳴り始めの点をなめらかな曲線でつなぐ。間が空いたところで線を切る
  const notes = marks.filter((mark): mark is JevMark => mark.kind === "jev").sort((a, b) => a.start - b.start);
  const phrases: { x: number; y: number }[][] = [];
  notes.forEach((note, index) => {
    const previous = notes[index - 1];
    const point = { x: xAt(note.start), y: pitchY(frame, note.pitch) };
    if (!previous || note.start - (previous.start + previous.seconds) > PHRASE_GAP_SECONDS) phrases.push([point]);
    else phrases.at(-1)!.push(point);
    // フレーズの最後の音は、鳴っている長さのぶん水平に伸ばす
    const next = notes[index + 1];
    if (!next || next.start - (note.start + note.seconds) > PHRASE_GAP_SECONDS) {
      phrases.at(-1)!.push({ x: Math.max(point.x, Math.min(frame.nowX, xAt(note.start + note.seconds))), y: point.y });
    }
  });
  context.save();
  context.lineWidth = Math.max(2, half * 0.28);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = COLORS.ink;
  for (const points of phrases) {
    context.beginPath();
    context.moveTo(points[0]!.x, points[0]!.y);
    // Catmull-Rom 曲線を、ベジェ曲線に直して描く
    for (let index = 0; index < points.length - 1; index++) {
      const p0 = points[index - 1] ?? points[index]!;
      const p1 = points[index]!;
      const p2 = points[index + 1]!;
      const p3 = points[index + 2] ?? p2;
      context.bezierCurveTo(
        p1.x + (p2.x - p0.x) / 6,
        p1.y + (p2.y - p0.y) / 6,
        p2.x - (p3.x - p1.x) / 6,
        p2.y - (p3.y - p1.y) / 6,
        p2.x,
        p2.y,
      );
    }
    context.stroke();
  }
  for (const note of notes) {
    const x = xAt(note.start);
    if (x < frame.leftEdge) continue;
    context.globalAlpha = (0.5 + 0.5 * note.strength) * fadeAt(frame, x);
    context.fillStyle = COLORS.ink;
    context.beginPath();
    context.arc(x, pitchY(frame, note.pitch), half * (0.35 + 0.35 * note.strength), 0, Math.PI * 2);
    context.fill();
  }
  context.restore();

  // いま
  context.globalAlpha = 0.5;
  context.fillStyle = COLORS.red;
  context.fillRect(frame.nowX, frame.yOf(TOP_STEP - 1.5), 1.5, frame.height - frame.yOf(TOP_STEP - 1.5) - 8);
  context.globalAlpha = 1;
}

/** 幾何学模様に使う、Jevの音の色。ピッチクラスで決める */
const GEOMETRY_PALETTE = [COLORS.red, COLORS.mustard, COLORS.ink, COLORS.purple];

/**
 * Blue Note風の幾何学模様。五線は描かない。
 * コード名を大きな文字の塊として背景に置き、あなたの和音は角張った色の板、Jevの音は色の丸で描く
 */
function drawGeometry(frame: Frame, marks: readonly Mark[]) {
  const { context, half, xAt } = frame;

  // 背景の大きなコード名
  context.font = `800 ${Math.round(half * 9)}px ${frame.displayFont}, "Helvetica Neue", Arial, sans-serif`;
  context.textBaseline = "alphabetic";
  context.fillStyle = COLORS.ink;
  for (const mark of marks) {
    if (mark.kind !== "bar") continue;
    const x = xAt(mark.at);
    if (x < frame.leftEdge - half * 20) continue;
    context.globalAlpha = 0.07;
    context.fillText(mark.chord, x, frame.height - half * 1.2);
    context.globalAlpha = 0.9 * fadeAt(frame, x);
    context.fillRect(x, frame.yOf(TOP_STEP - 1), half * 0.5, half * 2.2);
  }
  context.globalAlpha = 1;
  chordNames(frame, marks, half * 1.8, COLORS.ink);

  // あなたの和音: いちばん上の音は青い板、下の音は細い黒い板
  for (const mark of marks) {
    if (mark.kind !== "you") continue;
    const x0 = xAt(mark.start);
    const x1 = Math.max(x0 + half * 0.9, xAt(endOf(frame, mark)));
    if (x1 < frame.leftEdge) continue;
    const fade = fadeAt(frame, x1);
    const top = Math.max(...mark.pitches);
    for (const pitch of mark.pitches) {
      const y = pitchY(frame, pitch);
      const lead = pitch === top;
      const thickness = lead ? half * 2 : half * 0.5;
      context.globalAlpha = (lead ? 0.95 : 0.25) * fade;
      context.fillStyle = lead ? COLORS.blue : COLORS.ink;
      context.fillRect(x0, y - thickness / 2, x1 - x0, thickness);
    }
  }

  // Jevの音: 鳴り始めに色の丸、伸ばした長さは同じ色の細い板
  for (const mark of marks) {
    if (mark.kind !== "jev") continue;
    const x = xAt(mark.start);
    if (x < frame.leftEdge) continue;
    const y = pitchY(frame, mark.pitch);
    const color = GEOMETRY_PALETTE[mark.pitch % GEOMETRY_PALETTE.length]!;
    const fade = fadeAt(frame, x);
    const end = Math.min(frame.nowX, xAt(mark.start + mark.seconds));
    context.globalAlpha = 0.35 * fade;
    context.fillStyle = color;
    context.fillRect(x, y - half * 0.25, Math.max(0, end - x), half * 0.5);
    context.globalAlpha = fade;
    context.beginPath();
    context.arc(x, y, half * (0.5 + 0.6 * mark.strength), 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;

  // いま: 太い黒の縦線
  context.fillStyle = COLORS.ink;
  context.fillRect(frame.nowX - 1.5, frame.yOf(TOP_STEP - 1.5), 3, frame.height - frame.yOf(TOP_STEP - 1.5) - 8);
}

/** 波紋が広がりきって消えるまでの時間（秒） */
const RIPPLE_SECONDS = 1.4;

/**
 * 波紋と粒。五線は薄く残す。
 * あなたの和音は、押した所から広がる波紋（押している間は広がり続ける）。Jevの音は、光る粒
 */
function drawRipple(frame: Frame, marks: readonly Mark[]) {
  const { context, half, xAt, now } = frame;
  staffLines(frame, 0.3);
  clef(frame, 0.22);
  chordNames(frame, marks, half * 2, COLORS.inkSoft, 0.8);

  for (const mark of marks) {
    if (mark.kind !== "you") continue;
    const x = xAt(mark.start);
    if (x < frame.leftEdge) continue;
    const fade = fadeAt(frame, x);
    const top = Math.max(...mark.pitches);
    const y = pitchY(frame, top);
    // 押している間は広がり続け、離したら波紋が外へ抜けて消える
    const heldFor = endOf(frame, mark) - mark.start;
    const since = mark.end === null ? 0 : now - mark.end;
    const life = Math.max(0, 1 - since / RIPPLE_SECONDS);
    if (life <= 0 && mark.end !== null) {
      // 消えた後も、押した場所に小さな点を残して、リズムの跡にする
      context.globalAlpha = 0.5 * fade;
      context.fillStyle = COLORS.blue;
      context.beginPath();
      context.arc(x, y, half * 0.4, 0, Math.PI * 2);
      context.fill();
      continue;
    }
    const base = half * (1.2 + Math.min(4, heldFor * 3));
    context.strokeStyle = COLORS.blue;
    for (let ring = 0; ring < 3; ring++) {
      const radius = base + ring * half * 1.2 + (frame.reducedMotion ? 0 : since * half * 6);
      context.globalAlpha = life * fade * (0.8 - ring * 0.22);
      context.lineWidth = Math.max(1.5, half * 0.22);
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.stroke();
    }
    context.globalAlpha = fade;
    context.fillStyle = COLORS.blue;
    context.beginPath();
    context.arc(x, y, half * 0.6, 0, Math.PI * 2);
    context.fill();
    // 下に重ねた音は小さな点
    for (const pitch of mark.pitches) {
      if (pitch === top) continue;
      context.globalAlpha = 0.3 * fade;
      context.beginPath();
      context.arc(x, pitchY(frame, pitch), half * 0.3, 0, Math.PI * 2);
      context.fill();
    }
  }

  // Jevの音: 光る粒。鳴っている長さのぶん、うっすら尾を引く
  for (const mark of marks) {
    if (mark.kind !== "jev") continue;
    const x = xAt(mark.start);
    if (x < frame.leftEdge) continue;
    const y = pitchY(frame, mark.pitch);
    const fade = fadeAt(frame, x);
    const radius = half * (0.9 + 0.9 * mark.strength);
    const end = Math.min(frame.nowX, xAt(mark.start + mark.seconds));
    context.globalAlpha = 0.18 * fade;
    context.fillStyle = COLORS.purple;
    context.fillRect(x, y - half * 0.15, Math.max(0, end - x), half * 0.3);
    const glow = context.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, "rgba(23, 19, 46, 0.95)");
    glow.addColorStop(0.45, "rgba(125, 59, 230, 0.55)");
    glow.addColorStop(1, "rgba(125, 59, 230, 0)");
    context.globalAlpha = fade;
    context.fillStyle = glow;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

export const SCORE_STYLES: Record<ScoreStyleId, { label: string; draw: (frame: Frame, marks: readonly Mark[]) => void }> = {
  ribbon: { label: "光の帯と線", draw: drawRibbon },
  geometry: { label: "幾何学模様", draw: drawGeometry },
  ripple: { label: "波紋と粒", draw: drawRipple },
};

export const SCORE_STYLE_IDS = Object.keys(SCORE_STYLES) as ScoreStyleId[];
