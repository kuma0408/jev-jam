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

/** ユーザーが叩いた記録。height は叩いた位置の高さ（0=いちばん下、1=いちばん上） */
export type Tap = { at: number; height: number };

/** しばらく叩いていないときの盛り上がり。黙っていても曲は流れ続けるよう、静かすぎない段階にする */
export const RESTING_ENERGY: Energy = 2;

/**
 * 叩いた高さから盛り上がりを決める。直近 windowMs ミリ秒（1小節ぶん）に叩いた高さの平均を、4段階に分ける。
 * 上の方を叩けば激しく、下の方を叩けば静かになる。叩かずにいれば RESTING_ENERGY に戻る
 */
export function energyFromTaps(taps: readonly Tap[], now: number, windowMs: number): Energy {
  const recent = taps.filter((tap) => tap.at >= now - windowMs);
  if (recent.length === 0) return RESTING_ENERGY;
  const average = recent.reduce((sum, tap) => sum + tap.height, 0) / recent.length;
  return Math.min(4, Math.floor(average * 4) + 1) as Energy;
}

/** 叩いた高さから、鳴らす音の強さ（0〜1）を決める。上ほど強い */
export function tapVelocity(height: number): number {
  return 0.45 + 0.5 * Math.min(1, Math.max(0, height));
}
