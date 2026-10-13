"use client";

// 自分で音を出して参加するための操作。伴奏を刻むボタンを置く。
// 鍵盤の音を1つずつ弾くキー（A W S E D F T G Y H U J）は、鍵盤の上に表示している（piano.tsx）。
import type { Touch } from "../../lib/solo/energy.ts";

const TOUCH_LABELS: Record<Touch, string> = {
  none: "叩くと、ソロがあなたに応えます",
  light: "軽く刻んでいます",
  active: "のってきました。ソロが応えています",
  busy: "激しく刻んでいます。ソロも全開です",
};

type Props = {
  playing: boolean;
  touch: Touch;
  onTap: () => void;
};

export function JamPad({ playing, touch, onTap }: Props) {
  return (
    <section className="jam" aria-labelledby="jam-heading">
      <h2 id="jam-heading" className="jam-heading">
        自分でも弾く
        <span className="jam-status" role="status">
          {playing
            ? `${TOUCH_LABELS[touch]}（鍵盤の音は、鍵に書いてあるキーで弾けます）`
            : "開始すると、いまのコードを自分で鳴らせます"}
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
      </div>
    </section>
  );
}
