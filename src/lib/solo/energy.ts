/** 盛り上がりの段階。1=静か、4=激しい。ユーザーがつまみで決める */
export type Energy = 1 | 2 | 3 | 4;

export const ENERGY_LEVELS: readonly Energy[] = [1, 2, 3, 4];

export const ENERGY: Record<Energy, { label: string; cue: string }> = {
  1: { label: "静か", cue: "Keep it calm and spacious. Long notes, lots of silence, play softly." },
  2: { label: "ゆったり", cue: "Keep it relaxed and melodic. Leave room to breathe between phrases." },
  3: { label: "のってきた", cue: "Build momentum. Play flowing lines with a confident, driving feel." },
  4: { label: "激しい", cue: "Go all out. Busy, intense lines at full volume, hardly any rests." },
};

export function isEnergy(value: unknown): value is Energy {
  return ENERGY_LEVELS.includes(value as Energy);
}

/** ユーザーが伴奏をどれだけ叩いているか */
/**
 * ユーザーの伴奏の質感。
 * sustained: 少ない回数で長く伸ばしている / light: 短く数回 / active: ほどほどに刻んでいる / busy: 連打している
 */
export type Touch = "none" | "sustained" | "light" | "active" | "busy";

export const TOUCHES: readonly Touch[] = ["none", "sustained", "light", "active", "busy"];

/** Jevに渡す、ユーザーの叩き方の説明。叩いていないときは何も伝えない */
export const TOUCH_CUE: Record<Exclude<Touch, "none">, string> = {
  sustained:
    "The pianist (a human player) is holding long, lush chords. Play softly with long, singing notes and plenty of space. Let it breathe.",
  light: "The pianist (a human player) is adding a few light chords. Leave them some room.",
  active: "The pianist (a human player) is comping actively. Respond to their energy.",
  busy: "The pianist (a human player) is comping busily, hammering out driving chords. Rise to meet them with fast sixteenth-note runs at full intensity.",
};

const ACTIVE_TAPS = 3;
const BUSY_TAPS = 6;

/** 直近1小節に叩いた回数から、叩き方を求める */
export function touchOf(tapsInLastBar: number): Touch {
  if (tapsInLastBar >= BUSY_TAPS) return "busy";
  if (tapsInLastBar >= ACTIVE_TAPS) return "active";
  return tapsInLastBar > 0 ? "light" : "none";
}

/**
 * つまみの値に叩き方を足した、実際の盛り上がり。
 * よく叩けば1段階、激しく叩けば2段階上がる。自分の演奏にバンドが応える手応えを作る。
 */
export function liveEnergy(dial: Energy, tapsInLastBar: number): Energy {
  const touch = touchOf(tapsInLastBar);
  const boost = touch === "busy" ? 2 : touch === "active" ? 1 : 0;
  return Math.min(4, dial + boost) as Energy;
}

/** しばらく叩いていないときの盛り上がり。つまみを無くしたので、これを土台に叩いた回数ぶん上げる。黙っていても曲が寂しくなりすぎない段階にする */
export const RESTING_ENERGY: Energy = 2;

/** ユーザーが押さえた和音。end は離した時刻（秒）で、押さえている間は null */
export type Press = { at: number; end: number | null };

/** しっとりと見なす、押した回数の上限 */
const SUSTAINED_MAX_PRESSES = 3;
/** しっとりと見なす、1回あたりの平均の長さ（拍） */
const SUSTAINED_BEATS = 1;

/**
 * 直前1小節（windowSeconds 秒）の伴奏の質感を、押した回数と伸ばした長さから決める。
 * 少ない回数で長く伸ばしていれば sustained、それ以外は回数で決める
 */
export function compTouch(presses: readonly Press[], now: number, windowSeconds: number, beatSeconds: number): Touch {
  const recent = presses.filter((press) => (press.end ?? now) >= now - windowSeconds);
  if (recent.length === 0) return "none";
  const averageSeconds = recent.reduce((sum, press) => sum + ((press.end ?? now) - press.at), 0) / recent.length;
  if (recent.length <= SUSTAINED_MAX_PRESSES && averageSeconds >= SUSTAINED_BEATS * beatSeconds) return "sustained";
  return touchOf(recent.length);
}

/** 伴奏の質感から決める盛り上がり。しっとりなら静か、連打なら激しい。弾いていなければ RESTING_ENERGY */
export function touchEnergy(touch: Touch): Energy {
  const energies: Record<Touch, Energy> = { sustained: 1, none: RESTING_ENERGY, light: 2, active: 3, busy: 4 };
  return energies[touch];
}
