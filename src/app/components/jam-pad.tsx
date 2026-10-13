"use client";

// 自分で音を出して参加するための操作。伴奏を刻むボタンと、いまのコードの音を弾くキー。
// コードを選ぶ鍵盤とは別のキーに割り当てて、選ぶ操作の邪魔をしない。
import type { Touch } from "../../lib/solo/energy.ts";

/** いまのコードの音を弾く、パソコンのキー。ホームポジションの左手に並べる */
export const JAM_KEYS = ["a", "s", "d", "f"] as const;

const TOUCH_LABELS: Record<Touch, string> = {
  none: "叩くと、ソロがあなたに応えます",
  light: "軽く刻んでいます",
  active: "のってきました。ソロが応えています",
  busy: "激しく刻んでいます。ソロも全開です",
};

type Props = {
  playing: boolean;
  /** いまのコードの構成音の名前 */
  tones: string[];
  touch: Touch;
  onTap: () => void;
  onTone: (index: number) => void;
};

export function JamPad({ playing, tones, touch, onTap, onTone }: Props) {
  return (
    <section className="jam" aria-labelledby="jam-heading">
      <h2 id="jam-heading" className="jam-heading">
        自分でも弾く
        <span className="jam-status" role="status">
          {playing ? TOUCH_LABELS[touch] : "開始すると、いまのコードを自分で鳴らせます"}
        </span>
      </h2>
      <div className="jam-row">
        {/* 押した瞬間に鳴らしたいので、離したときではなく押したときに反応させる */}
        <button
          type="button"
          className="jam-tap"
          disabled={!playing}
          onPointerDown={(event) => {
            event.preventDefault();
            onTap();
          }}
          onKeyDown={(event) => {
            if ((event.key === "Enter" || event.key === " ") && !event.repeat) {
              event.preventDefault();
              onTap();
            }
          }}
        >
          <span className="jam-tap-label">コードを刻む</span>
          <kbd className="jam-kbd">Space</kbd>
        </button>
        <div className="jam-tones" role="group" aria-label="いまのコードの音を弾く">
          {JAM_KEYS.map((key, index) => (
            <button
              key={key}
              type="button"
              className="jam-tone"
              disabled={!playing || tones[index] === undefined}
              aria-label={tones[index] ? `${tones[index]} の音を弾く（${key.toUpperCase()}キー）` : "音なし"}
              onPointerDown={(event) => {
                event.preventDefault();
                onTone(index);
              }}
              onKeyDown={(event) => {
                if ((event.key === "Enter" || event.key === " ") && !event.repeat) {
                  event.preventDefault();
                  onTone(index);
                }
              }}
            >
              <span className="jam-tone-name">{tones[index] ?? "—"}</span>
              <kbd className="jam-kbd">{key.toUpperCase()}</kbd>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
