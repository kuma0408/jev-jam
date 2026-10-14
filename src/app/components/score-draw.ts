// 演奏の流れの描き方。縦は音の高さ（五線と同じ並び）、横は時間（右の「いま」から左へ流れる）。
// あなたの和音は押している間だけ伸びる青い光の帯、Jevのソロは金色の光の線で描く。
// 「幾何学模様」「波紋と粒」と見比べて、この「光の帯と線」を選んだ（ADR 0034）。
import { stepOf } from "../../lib/music/staff.ts";

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
/** Jevの旋律の色（RGB）。伴奏の青と対になる、真鍮の楽器のような金色 */
const GOLD = "226, 146, 26";
/** 光の芯の色。白に近い明るい金 */
const GOLD_CORE = "255, 231, 170";
/** 光のにじみの色。赤みのある橙 */
const GOLD_GLOW = "236, 110, 40";
/** 鳴り始めに広がる光の輪が消えるまでの時間（秒） */
const BLOOM_SECONDS = 0.6;
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
 * Jevのソロは、音と音をなめらかにつなぐ金色の光の線。鳴り始めに光の輪が広がり、いま鳴っている音の先端が光る
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
  // 線は2回描く。1回目は太くぼかした光、2回目は細い芯。左（過去）へ行くほど薄くする
  const fadeGradient = (color: string) => {
    const gradient = context.createLinearGradient(frame.leftEdge, 0, frame.nowX, 0);
    gradient.addColorStop(0, `rgba(${color}, 0)`);
    gradient.addColorStop(0.35, `rgba(${color}, 0.55)`);
    gradient.addColorStop(1, `rgba(${color}, 1)`);
    return gradient;
  };
  const tracePhrases = () => {
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
  };
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = half * 0.9;
  context.strokeStyle = fadeGradient(GOLD_GLOW);
  context.globalAlpha = 0.28;
  context.filter = frame.reducedMotion ? "none" : `blur(${Math.round(half * 0.35)}px)`;
  tracePhrases();
  context.filter = "none";
  context.globalAlpha = 1;
  context.lineWidth = Math.max(2, half * 0.22);
  context.strokeStyle = fadeGradient(GOLD);
  tracePhrases();

  // 音の鳴り始め: 光の輪が広がって消え、小さな光の点が残る
  for (const note of notes) {
    const x = xAt(note.start);
    if (x < frame.leftEdge) continue;
    const y = pitchY(frame, note.pitch);
    const fade = fadeAt(frame, x);
    const age = frame.now - note.start;
    if (age < BLOOM_SECONDS && !frame.reducedMotion) {
      const progress = age / BLOOM_SECONDS;
      context.globalAlpha = (1 - progress) * (0.4 + 0.6 * note.strength);
      context.strokeStyle = `rgb(${GOLD})`;
      context.lineWidth = Math.max(1.5, half * 0.2);
      context.beginPath();
      context.arc(x, y, half * (0.6 + progress * 2.6 * (0.5 + note.strength)), 0, Math.PI * 2);
      context.stroke();
    }
    const radius = half * (0.32 + 0.3 * note.strength);
    const glow = context.createRadialGradient(x, y, 0, x, y, radius * 2.6);
    glow.addColorStop(0, `rgba(${GOLD_CORE}, 1)`);
    glow.addColorStop(0.35, `rgba(${GOLD}, 0.85)`);
    glow.addColorStop(1, `rgba(${GOLD_GLOW}, 0)`);
    context.globalAlpha = (0.5 + 0.5 * note.strength) * fade;
    context.fillStyle = glow;
    context.beginPath();
    context.arc(x, y, radius * 2.6, 0, Math.PI * 2);
    context.fill();
  }

  // 彗星の頭: いま鳴っている音の先端を光らせる
  const latest = notes.at(-1);
  if (latest && frame.now < latest.start + latest.seconds + 0.15) {
    const x = Math.min(frame.nowX, xAt(latest.start + latest.seconds));
    const y = pitchY(frame, latest.pitch);
    const radius = half * (1.4 + latest.strength);
    const head = context.createRadialGradient(x, y, 0, x, y, radius);
    head.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    head.addColorStop(0.25, `rgba(${GOLD}, 0.8)`);
    head.addColorStop(1, `rgba(${GOLD_GLOW}, 0)`);
    context.globalAlpha = 1;
    context.fillStyle = head;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();

  // いま
  context.globalAlpha = 0.5;
  context.fillStyle = COLORS.red;
  context.fillRect(frame.nowX, frame.yOf(TOP_STEP - 1.5), 1.5, frame.height - frame.yOf(TOP_STEP - 1.5) - 8);
  context.globalAlpha = 1;
}

/** 演奏の流れを1コマ描く */
export const drawScore = drawRibbon;
