/**
 * 8分音符のスロットが、小節の頭から何拍目に鳴るかを返す。
 *
 * @param swing 裏拍を拍のどの位置に置くか。0.5で均等、2/3で3連符のスウィング
 */
export function slotOffsetBeats(slot: number, swing: number): number {
  const beat = Math.floor(slot / 2);
  return slot % 2 === 0 ? beat : beat + swing;
}
