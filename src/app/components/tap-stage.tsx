"use client";

// 叩く面。このアプリでユーザーがする操作は、ここを叩くことだけ。
// 叩くと、いまのコードがあなたのリズムで鳴る。上の方を叩くほど激しく、下の方を叩くほど静かになり、Jevのソロも応える。
import { type CSSProperties, useState } from "react";
import { ENERGY, ENERGY_LEVELS, type Energy } from "../../lib/solo/energy.ts";
import type { SessionStatus } from "../session/use-session.ts";

/** 叩いた場所に出す波紋を、消すまでの時間（ミリ秒） */
const RIPPLE_MS = 700;

type Ripple = { id: number; x: number; y: number };

type Props = {
  status: SessionStatus;
  /** いまの盛り上がり */
  energy: Energy;
  /** キーボード（スペース）で叩くときの高さ（0〜1）。上下キーで動かす */
  keyboardHeight: number;
  onStart: () => void;
  /** height は叩いた位置の高さ（0=いちばん下、1=いちばん上） */
  onTap: (height: number) => void;
};

let nextRippleId = 0;

export function TapStage({ status, energy, keyboardHeight, onStart, onTap }: Props) {
  const playing = status === "playing";
  const [ripples, setRipples] = useState<Ripple[]>([]);

  return (
    <div className="tap-stage" data-playing={playing}>
      <button
        type="button"
        className="tap-surface"
        aria-label={
          playing
            ? "叩く。上の方ほど激しく、下の方ほど静かになります（スペースキーで叩き、上下キーで高さを変えられます）"
            : "叩いて、セッションをはじめる"
        }
        aria-describedby="tap-status"
        disabled={status === "starting"}
        // 押した瞬間に鳴らしたいので、離したときではなく押したときに反応させる
        onPointerDown={(event) => {
          event.preventDefault();
          if (!playing) {
            onStart();
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - rect.left;
          const y = event.clientY - rect.top;
          onTap(1 - y / rect.height);
          const id = nextRippleId++;
          setRipples((current) => [...current, { id, x, y }]);
          setTimeout(() => setRipples((current) => current.filter((ripple) => ripple.id !== id)), RIPPLE_MS);
        }}
        // スペースとエンターは、ページ全体のキー操作（page.tsx）で扱う。ボタンの既定のクリックは使わない
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "Enter") event.preventDefault();
        }}
      >
        {/* 上から 激しい → 静か の4段。いまの段は、色だけでなく「いま」の文字でも示す */}
        {[...ENERGY_LEVELS].reverse().map((level) => (
          <span key={level} className="tap-band" data-level={level} data-active={playing && level === energy}>
            <span className="tap-band-label">
              {ENERGY[level].label}
              {playing && level === energy && <span className="tap-band-now">いま</span>}
            </span>
          </span>
        ))}
        {playing && (
          <span className="tap-cursor" style={{ "--height": keyboardHeight } as CSSProperties} aria-hidden="true">
            ▶
          </span>
        )}
        {ripples.map((ripple) => (
          <span
            key={ripple.id}
            className="tap-ripple"
            style={{ left: ripple.x, top: ripple.y }}
            aria-hidden="true"
          />
        ))}
        {!playing && (
          <span className="tap-start">{status === "starting" ? "じゅんび中…" : "ここを叩いて、はじめる"}</span>
        )}
      </button>
      <p id="tap-status" className="tap-status" role="status">
        {playing
          ? `いまは「${ENERGY[energy].label}」。上の方を叩くと激しく、下の方を叩くと静かになります。叩くのをやめると、ゆったりに戻ります。`
          : "叩くと、バンドとJevのソロが始まります。"}
      </p>
    </div>
  );
}
