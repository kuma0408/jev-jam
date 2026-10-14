// 演奏面を押した位置を、エフェクトの層に伝えるための置き場所。
// エフェクトの層は、音の通知（jam）が届いたときに、直前に押された位置をここから読む。
export const lastPress = { x: 0, y: 0, height: 0.5, at: -Infinity };

/** 演奏面が押されたときに呼ぶ。height は押した高さ（0=いちばん下、1=いちばん上） */
export function notePress(x: number, y: number, height: number) {
  lastPress.x = x;
  lastPress.y = y;
  lastPress.height = height;
  lastPress.at = performance.now();
}
