"use client";

// 背景。いま乗っている進行ごとに、表情（流れる砂・集まって散る粒・図形の断片）を変える。
// 色はいまの色（theme-store）から取り、拍や小節の頭の通知で動きに弾みを付ける。
// 音の通知を直接購読し、React の再描画を介さずに canvas へ描く。
import { useEffect, useRef } from "react";
import { type Scene, type Theme, css } from "../../lib/visual/palette.ts";
import type { Session, SessionEvent } from "../session/use-session.ts";
import { currentTheme } from "../visual/theme-store.ts";

/** 表情が切り替わるときに、前の表情を消していく時間（秒） */
const FADE_SECONDS = 1.4;
const SAND_COUNT = 900;
const SWARM_COUNT = 170;
const SHARD_COUNT = 30;
/** 集まって散る粒を、持ち場へ引き戻す強さと、減速の強さ */
const SWARM_PULL = 5;
const SWARM_DAMPING = 2.6;

type View = { context: CanvasRenderingContext2D; width: number; height: number; theme: Theme; time: number; pulse: number; speed: number };

/** 1つの表情。step で動かし、draw で描く。alpha は切り替えのときの濃さ（0〜1） */
type SceneRunner = {
  step: (view: View, dt: number) => void;
  draw: (view: View, alpha: number) => void;
  /** 小節の頭の通知 */
  onBar?: (view: View) => void;
};

/** 流れる砂: 細かい粒が、うねる流れに乗って右へ流れる */
function createSand(width: number, height: number): SceneRunner {
  const grains = Array.from({ length: SAND_COUNT }, (_, index) => ({
    x: Math.random() * width,
    y: Math.random() * height,
    size: 0.8 + Math.random() * 1.6,
    accent: index % 7 === 0,
  }));
  return {
    step({ width: w, height: h, time, pulse, speed }, dt) {
      for (const grain of grains) {
        // 場所と時刻で向きが変わる流れ。砂丘を風が吹き抜けるようにうねる
        const angle = Math.sin(grain.x * 0.0031 + time * 0.25) * 0.9 + Math.cos(grain.y * 0.0042 - time * 0.18) * 0.7;
        const velocity = (26 + 60 * pulse) * speed;
        grain.x += Math.cos(angle) * velocity * dt + 14 * speed * dt;
        grain.y += Math.sin(angle) * velocity * dt;
        if (grain.x > w + 4) grain.x = -4;
        if (grain.x < -4) grain.x = w + 4;
        if (grain.y > h + 4) grain.y = -4;
        if (grain.y < -4) grain.y = h + 4;
      }
    },
    draw({ context, theme }, alpha) {
      context.fillStyle = css(theme.deep, 0.22 * alpha);
      for (const grain of grains) if (!grain.accent) context.fillRect(grain.x, grain.y, grain.size, grain.size);
      context.fillStyle = css(theme.primary, 0.55 * alpha);
      for (const grain of grains) if (grain.accent) context.fillRect(grain.x, grain.y, grain.size * 1.4, grain.size * 1.4);
    },
  };
}

/** 集まって散る粒: 拍ごとに集まる場所へ引き寄せられ、小節の頭でぱっと散る */
function createSwarm(width: number, height: number): SceneRunner {
  const dots = Array.from({ length: SWARM_COUNT }, (_, index) => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: 0,
    vy: 0,
    size: 1.5 + Math.random() * 3,
    secondary: index % 4 === 0,
    // 集まる場所の中での持ち場（輪の上の角度と距離）
    angle: Math.random() * Math.PI * 2,
    reach: 0.25 + Math.random() * 0.75,
  }));
  let center = { x: width * 0.5, y: height * 0.5 };
  return {
    step({ width: w, height: h, time, speed }, dt) {
      const radius = Math.min(w, h) * 0.28;
      for (const dot of dots) {
        const targetX = center.x + Math.cos(dot.angle + time * 0.15) * radius * dot.reach;
        const targetY = center.y + Math.sin(dot.angle + time * 0.15) * radius * dot.reach;
        // ばねのように持ち場へ引き寄せ、少しずつ減速させる。弱いと、散った粒が画面の外へ出たまま戻らない
        dot.vx += (targetX - dot.x) * SWARM_PULL * speed * dt;
        dot.vy += (targetY - dot.y) * SWARM_PULL * speed * dt;
        dot.vx *= 1 - SWARM_DAMPING * dt;
        dot.vy *= 1 - SWARM_DAMPING * dt;
        dot.x += dot.vx * dt;
        dot.y += dot.vy * dt;
      }
    },
    draw({ context, theme }, alpha) {
      for (const dot of dots) {
        context.fillStyle = css(dot.secondary ? theme.secondary : theme.primary, 0.45 * alpha);
        context.beginPath();
        context.arc(dot.x, dot.y, dot.size, 0, Math.PI * 2);
        context.fill();
      }
    },
    onBar({ width: w, height: h }) {
      // 小節の頭で、外へ弾き飛ばし、次に集まる場所を移す
      for (const dot of dots) {
        const angle = Math.atan2(dot.y - center.y, dot.x - center.x) + (Math.random() - 0.5);
        const power = 260 + Math.random() * 380;
        dot.vx += Math.cos(angle) * power;
        dot.vy += Math.sin(angle) * power;
      }
      center = { x: w * (0.2 + Math.random() * 0.6), y: h * (0.25 + Math.random() * 0.5) };
    },
  };
}

/** 図形の断片: 細い線と三角の輪郭が、ゆっくり回りながら漂い、拍で脈打つ */
function createShards(width: number, height: number): SceneRunner {
  const shards = Array.from({ length: SHARD_COUNT }, (_, index) => ({
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 18,
    vy: (Math.random() - 0.5) * 12,
    size: 16 + Math.random() * 54,
    rotation: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.5,
    triangle: index % 3 !== 0,
    accent: index % 5 === 0,
  }));
  return {
    step({ width: w, height: h, speed }, dt) {
      for (const shard of shards) {
        shard.x += shard.vx * speed * dt;
        shard.y += shard.vy * speed * dt;
        shard.rotation += shard.spin * speed * dt;
        if (shard.x < -80) shard.x = w + 80;
        if (shard.x > w + 80) shard.x = -80;
        if (shard.y < -80) shard.y = h + 80;
        if (shard.y > h + 80) shard.y = -80;
      }
    },
    draw({ context, theme, pulse }, alpha) {
      context.lineWidth = 1.5;
      for (const shard of shards) {
        const size = shard.size * (1 + pulse * 0.12);
        context.save();
        context.translate(shard.x, shard.y);
        context.rotate(shard.rotation);
        context.strokeStyle = css(shard.accent ? theme.primary : theme.deep, (shard.accent ? 0.5 : 0.18) * alpha);
        context.beginPath();
        if (shard.triangle) {
          for (let corner = 0; corner < 3; corner++) {
            const angle = (corner / 3) * Math.PI * 2;
            context.lineTo(Math.cos(angle) * size * 0.5, Math.sin(angle) * size * 0.5);
          }
          context.closePath();
        } else {
          context.moveTo(-size * 0.6, 0);
          context.lineTo(size * 0.6, 0);
        }
        context.stroke();
        context.restore();
      }
    },
  };
}

const CREATORS: Record<Scene, (width: number, height: number) => SceneRunner> = {
  sand: createSand,
  swarm: createSwarm,
  shards: createShards,
};

/** 盛り上がり（1〜4）ごとの、動きの速さの倍率 */
const SPEED_BY_ENERGY = [0.6, 0.85, 1.15, 1.5];

export function Backdrop({ subscribe, energy }: Pick<Session, "subscribe"> & { energy: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const energyRef = useRef(energy);
  energyRef.current = energy;

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = window.innerWidth;
    let height = window.innerHeight;
    let scene: Scene = currentTheme().scene;
    let runner = CREATORS[scene](width, height);
    /** 消えていく前の表情と、切り替えた時刻 */
    let fading: { runner: SceneRunner; since: number } | null = null;
    let pulse = 0;
    let last = performance.now() / 1000;
    let frame = 0;

    const view = (time: number): View => ({
      context,
      width,
      height,
      theme: currentTheme(),
      time,
      pulse,
      speed: SPEED_BY_ENERGY[energyRef.current - 1] ?? 1,
    });

    const render = () => {
      const time = performance.now() / 1000;
      const dt = Math.min(0.05, time - last);
      last = time;
      const theme = currentTheme(time);
      // 進行が移って表情が変わったら、前の表情をゆっくり消しながら新しい表情を出す
      if (theme.scene !== scene) {
        fading = { runner, since: time };
        scene = theme.scene;
        runner = CREATORS[scene](width, height);
      }
      pulse *= 1 - Math.min(1, dt * 4);
      const current = view(time);
      context.clearRect(0, 0, width, height);
      const fadeProgress = fading ? Math.min(1, (time - fading.since) / FADE_SECONDS) : 1;
      if (fading) {
        fading.runner.step(current, dt);
        fading.runner.draw(current, 1 - fadeProgress);
        if (fadeProgress >= 1) fading = null;
      }
      runner.step(current, dt);
      runner.draw(current, fadeProgress);
    };

    const loop = () => {
      render();
      frame = requestAnimationFrame(loop);
    };

    const onEvent = (event: SessionEvent) => {
      if (event.kind === "beat") pulse = Math.min(1, pulse + (event.beat === 0 ? 1 : 0.5));
      else if (event.kind === "bar") runner.onBar?.(view(performance.now() / 1000));
      // 動きを減らす設定のときは、通知が来たときだけ1コマ描く
      if (motionQuery.matches) render();
    };

    const resize = () => {
      // 高精細な画面でもぼけないようにする。描画の負荷を抑えるため2倍まで
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      runner = CREATORS[scene](width, height);
      render();
    };

    resize();
    window.addEventListener("resize", resize);
    if (!motionQuery.matches) frame = requestAnimationFrame(loop);
    const unsubscribe = subscribe(onEvent);
    return () => {
      unsubscribe();
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(frame);
    };
  }, [subscribe]);

  return <canvas ref={canvasRef} className="backdrop" aria-hidden="true" />;
}
