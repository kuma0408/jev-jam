"use client";

// 掛け合いで、いまどちらの番かと、Jevがあなたのフレーズにどう応えたかを出す。
// Jevは文章を返さず、選択肢ごとの確率だけを返す。その確率をそのまま見せる。
import { REPLIES, type ReplyId, TURN_BARS } from "../../lib/solo/call.ts";
import type { Session } from "../session/use-session.ts";

type Props = Pick<Session, "turn" | "reply">;

export function TurnBanner({ turn, reply }: Props) {
  if (!turn) return null;
  const yours = turn.who === "you";
  const last = turn.bar === TURN_BARS;
  const total = reply ? Object.values(reply.odds).reduce((sum, odd) => sum + odd, 0) : 0;
  return (
    <div className="turn" data-who={turn.who}>
      {/* 番が変わったことを、読み上げにも伝える */}
      <p className="turn-now" role="status">
        <span className="turn-who">{yours ? "あなたの番" : "Jevの番"}</span>
        <span className="turn-count">
          {turn.bar} / {TURN_BARS} 小節
        </span>
        <span className="turn-next">
          {yours
            ? last
              ? "この小節が終わると、Jevが応えます"
              : "好きに弾いてください。Jevが聴いています"
            : last
              ? "次の小節から、あなたの番です"
              : "Jevが弾いています"}
        </span>
      </p>
      {reply && total > 0 && (
        <div className="turn-reply">
          <p className="turn-reply-head">
            Jevの応え方: <strong>{reply.label}</strong>
          </p>
          <ul className="turn-odds" aria-label="Jevが返した、応え方ごとの確率">
            {(Object.keys(REPLIES) as ReplyId[]).map((id) => {
              const percent = Math.round(((reply.odds[id] ?? 0) / total) * 100);
              return (
                <li key={id} data-chosen={id === reply.id}>
                  <span className="turn-odds-label">
                    {id === reply.id && <span aria-hidden="true">✓ </span>}
                    {REPLIES[id].label}
                    {id === reply.id && <span className="visually-hidden">（選ばれた）</span>}
                  </span>
                  <span className="turn-odds-bar" aria-hidden="true">
                    <span style={{ width: `${percent}%` }} />
                  </span>
                  <span className="turn-odds-value">{percent}%</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
