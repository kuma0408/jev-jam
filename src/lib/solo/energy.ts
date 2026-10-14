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
export type Touch = "none" | "light" | "active" | "busy";

export const TOUCHES: readonly Touch[] = ["none", "light", "active", "busy"];

/** Jevに渡す、ユーザーの叩き方の説明。叩いていないときは何も伝えない */
export const TOUCH_CUE: Record<Exclude<Touch, "none">, string> = {
  light: "The pianist (a human player) is adding a few light chords. Leave them some room.",
  active: "The pianist (a human player) is comping actively. Respond to their energy.",
  busy: "The pianist (a human player) is comping busily and pushing hard. Rise to meet them.",
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
