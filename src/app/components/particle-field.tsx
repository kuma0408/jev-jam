"use client";

// 背景の粒子。音が鳴るタイミングの通知を直接購読し、Reactの再描画を介さずにキャンバスへ描く。
import { useEffect, useRef } from "react";
import { parseChord } from "../../lib/music/chord.ts";
import type { Session, SessionEvent } from "../session/use-session.ts";

/** 粒子の色（緑・赤・青・紫）。白地で沈まない程度に彩度を保つ */
const COLORS = [
  [18, 160, 108],
  [226, 58, 48],
  [42, 98, 242],
  [132, 64, 238],
] as const;

const MAX_PARTICLES = 320;
const MAX_SPARKS = 90;
const MAX_RIPPLES = 8;
/** 拍の間隔が分かるまでの仮の値（120BPM） */
const DEFAULT_BEAT_SECONDS = 0.5;

type Particle = {
  /** 中心から見た向きと、中心からの距離（0〜1） */
  angle: number;
  radius: number;
  size: number;
  alpha: number;
  color: number;
  /** 手前にあるものほど大きく動かすための係数 */
  depth: number;
  phase: number;
  drift: number;
  /** 輪郭をぼかした大きな粒か */
  soft: boolean;
};

/** ソロの1音ごとに飛び散る、短命の粒 */
type Spark = { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; color: number };

/** ソロの1音が、その音の向きにある粒を押し出す波 */
type Ripple = { angle: number; strength: number; age: number };

/** 再読み込みのたびに配置が変わらないよう、種を固定した乱数を使う */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createParticles(): Particle[] {
  const random = seededRandom(20261013);
  return Array.from({ length: MAX_PARTICLES }, (_, index) => {
    const soft = index % 9 === 0;
    return {
      angle: random() * Math.PI * 2,
      // 中央は鍵盤と文字があるので、外側に寄せて散らす
      radius: 0.16 + 0.84 * Math.sqrt(random()),
      size: soft ? 18 + random() * 26 : 1.8 + random() * random() * 9,
      alpha: soft ? 0.12 + random() * 0.1 : 0.35 + random() * 0.45,
      color: index % COLORS.length,
      depth: 0.5 + random() * 1.1,
      phase: random() * Math.PI * 2,
      drift: 0.15 + random() * 0.35,
      soft,
    };
  });
}

/** コードのルートから、主役にする色を決める。5度圏で隣り合うコードが違う色になるよう並べる */
function colorOfChord(chord: string): number {
  return ((parseChord(chord).root * 7) % 12) % COLORS.length;
}

/** 盛り上がり（1〜4）ごとの、拍で押し広げる強さ */
const KICK_BY_ENERGY = [0.55, 0.85, 1.15, 1.5];

export function ParticleField({ subscribe, energy: level }: { subscribe: Session["subscribe"]; energy: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // 盛り上がりが変わるたびに粒子を作り直さないよう、最新の値をrefで読む
  const levelRef = useRef(level);
  levelRef.current = level;

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const particles = createParticles();
    const sparks: Spark[] = [];
    const ripples: Ripple[] = [];
    const weights = COLORS.map(() => 0.8);
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    let width = 0;
    let height = 0;
    let frame = 0;
    let lastFrameAt = 0;
    let time = 0;
    let rotation = 0;
    // 拍で広がって戻る、全体のばね
    let pulse = 0;
    let pulseVelocity = 0;
    // 再生中は1に近づき、止まると数秒かけて0に戻る
    let energy = 0;
    let dominant: number | null = null;
    let beatSeconds = DEFAULT_BEAT_SECONDS;
    let lastBeatAt = 0;

    const draw = () => {
      context.clearRect(0, 0, width, height);
      const centerX = width / 2;
      const centerY = height * 0.45;
      const reachX = width * 0.62;
      const reachY = height * 0.66;
      // 画面の広さに合わせて粒の数を変える
      const count = Math.min(MAX_PARTICLES, Math.max(90, Math.round((width * height) / 4500)));

      for (let index = 0; index < count; index++) {
        const particle = particles[index]!;
        const sway = Math.sin(time * particle.drift + particle.phase);
        const angle = particle.angle + rotation * particle.depth + 0.05 * sway;

        let push = 0;
        let swell = 0;
        for (const ripple of ripples) {
          const distance = Math.abs(Math.atan2(Math.sin(angle - ripple.angle), Math.cos(angle - ripple.angle)));
          if (distance < 0.7) {
            const envelope = Math.sin(Math.PI * Math.min(1, ripple.age / 0.5));
            const amount = ripple.strength * (1 - distance / 0.7) * envelope;
            push += amount * 0.07;
            swell += amount * 0.9;
          }
        }

        const stretch = particle.radius * (1 + 0.025 * sway + 0.13 * pulse * particle.depth + push * particle.depth);
        const x = centerX + Math.cos(angle) * stretch * reachX;
        const y = centerY + Math.sin(angle) * stretch * reachY;
        const weight = weights[particle.color]!;
        const size = particle.size * (0.8 + 0.35 * weight) * (1 + 0.55 * Math.max(0, pulse) * particle.depth + swell);
        const alpha = particle.alpha * (0.4 + 0.6 * weight) * (0.75 + 0.25 * energy);
        const [red, green, blue] = COLORS[particle.color]!;

        if (particle.soft) {
          const gradient = context.createRadialGradient(x, y, 0, x, y, size);
          gradient.addColorStop(0, `rgba(${red},${green},${blue},${alpha})`);
          gradient.addColorStop(1, `rgba(${red},${green},${blue},0)`);
          context.fillStyle = gradient;
        } else {
          context.fillStyle = `rgba(${red},${green},${blue},${alpha})`;
        }
        context.beginPath();
        context.arc(x, y, size, 0, Math.PI * 2);
        context.fill();
      }

      for (const spark of sparks) {
        const remaining = 1 - spark.age / spark.life;
        const [red, green, blue] = COLORS[spark.color]!;
        context.fillStyle = `rgba(${red},${green},${blue},${0.75 * remaining})`;
        context.beginPath();
        context.arc(spark.x, spark.y, spark.size * (0.4 + 0.6 * remaining), 0, Math.PI * 2);
        context.fill();
      }
    };

    const advance = (seconds: number) => {
      time += seconds;
      energy = Math.max(0, energy - seconds / 3);
      rotation += seconds * (0.01 + 0.03 * energy);

      // 1拍のうちに広がって縮み、少し行き過ぎて戻るばね。テンポが速いほど硬くする
      const omega = (Math.PI * 2) / (beatSeconds * 0.9);
      const steps = 2;
      for (let step = 0; step < steps; step++) {
        const dt = seconds / steps;
        pulseVelocity += (-omega * omega * pulse - 2 * 0.3 * omega * pulseVelocity) * dt;
        pulse += pulseVelocity * dt;
      }

      // 止まってしばらくしたら、色の偏りを戻す
      if (energy === 0) dominant = null;
      const ease = Math.min(1, seconds * 3);
      for (let color = 0; color < weights.length; color++) {
        const target = dominant === null ? 0.8 : color === dominant ? 1.25 : 0.5;
        weights[color]! += (target - weights[color]!) * ease;
      }

      for (let index = ripples.length - 1; index >= 0; index--) {
        const ripple = ripples[index]!;
        ripple.age += seconds;
        if (ripple.age > 0.5) ripples.splice(index, 1);
      }
      for (let index = sparks.length - 1; index >= 0; index--) {
        const spark = sparks[index]!;
        spark.age += seconds;
        if (spark.age > spark.life) {
          sparks.splice(index, 1);
          continue;
        }
        spark.x += spark.vx * seconds;
        spark.y += spark.vy * seconds;
        spark.vx *= 1 - 1.8 * seconds;
        spark.vy *= 1 - 1.8 * seconds;
      }
    };

    const tick = (now: number) => {
      // タブが戻ってきた直後などに、一気に進まないよう上限を置く
      advance(Math.min(0.05, (now - lastFrameAt) / 1000));
      lastFrameAt = now;
      draw();
      frame = requestAnimationFrame(tick);
    };

    const startLoop = () => {
      cancelAnimationFrame(frame);
      lastFrameAt = performance.now();
      frame = requestAnimationFrame(tick);
    };

    /** 動きを減らす設定のときは、静止画を1枚描くだけにする */
    const drawStill = () => {
      pulse = 0;
      pulseVelocity = 0;
      sparks.length = 0;
      ripples.length = 0;
      for (let color = 0; color < weights.length; color++) {
        weights[color] = dominant === null ? 0.8 : color === dominant ? 1.25 : 0.5;
      }
      draw();
    };

    const resize = () => {
      // 高精細な画面でもぼけないようにする。描画の負荷を抑えるため2倍まで
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (motionQuery.matches) drawStill();
      else draw();
    };

    const onEvent = (event: SessionEvent) => {
      if (event.kind === "bar") {
        dominant = colorOfChord(event.chord);
        energy = 1;
        if (motionQuery.matches) drawStill();
        return;
      }
      if (motionQuery.matches) return;

      // 自分で鳴らした音も、ソロの音と同じように粒を散らす
      if (event.kind === "jam") {
        for (const pitch of event.pitches) {
          onEvent({ kind: "note", pitch, velocity: 0.6, durationSeconds: 0.3 });
        }
        return;
      }

      if (event.kind === "beat") {
        const now = performance.now();
        const interval = (now - lastBeatAt) / 1000;
        if (interval > 0.2 && interval < 1.2) beatSeconds = interval;
        lastBeatAt = now;
        energy = 1;
        // 小節の頭は強く、ほかの拍は軽く押し広げる
        const kick = (event.beat === 0 ? 1 : 0.55) * (KICK_BY_ENERGY[levelRef.current - 1] ?? 1);
        pulseVelocity += kick * ((Math.PI * 2) / (beatSeconds * 0.9));
        return;
      }

      // 押さえていた音を離したときは、何もしない
      if (event.kind === "lift") return;

      // ソロの音: 音名を時計の文字盤のように向きへ割り当て、その向きの粒を押し出す
      const angle = ((event.pitch % 12) / 12) * Math.PI * 2 - Math.PI / 2;
      if (ripples.length >= MAX_RIPPLES) ripples.shift();
      ripples.push({ angle, strength: 0.4 + 0.6 * event.velocity, age: 0 });

      const amount = 2 + Math.round(event.velocity * 4);
      const life = Math.min(0.9, 0.35 + event.durationSeconds);
      // 高い音ほど外側から飛ばす
      const distance = 0.3 + 0.25 * Math.min(1, Math.max(0, (event.pitch - 48) / 40));
      const originX = width / 2 + Math.cos(angle) * distance * width * 0.62;
      const originY = height * 0.45 + Math.sin(angle) * distance * height * 0.66;
      for (let index = 0; index < amount && sparks.length < MAX_SPARKS; index++) {
        const direction = angle + (Math.random() - 0.5) * 1.6;
        const speed = 50 + Math.random() * 130 * (0.5 + event.velocity);
        sparks.push({
          x: originX,
          y: originY,
          vx: Math.cos(direction) * speed,
          vy: Math.sin(direction) * speed,
          age: 0,
          life: life * (0.7 + Math.random() * 0.5),
          size: 1.5 + Math.random() * 3 * (0.5 + event.velocity),
          color: Math.random() < 0.6 && dominant !== null ? dominant : Math.floor(Math.random() * COLORS.length),
        });
      }
    };

    const onMotionChange = () => {
      if (motionQuery.matches) {
        cancelAnimationFrame(frame);
        drawStill();
      } else {
        startLoop();
      }
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    if (!motionQuery.matches) startLoop();
    motionQuery.addEventListener("change", onMotionChange);
    const unsubscribe = subscribe(onEvent);

    return () => {
      unsubscribe();
      motionQuery.removeEventListener("change", onMotionChange);
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [subscribe]);

  // 飾りなので、読み上げや操作の対象から外す
  return <canvas ref={canvasRef} className="particle-field" aria-hidden="true" />;
}
