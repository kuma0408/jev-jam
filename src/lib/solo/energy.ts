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
