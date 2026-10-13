// 録音音源を、1音ごとに音程と音量を動かしながら鳴らす音源。
// Tone.js の Sampler は鳴らし始めた音の音程を動かせないので、ソロ用に自前で持つ。
import type { Scoop } from "../../lib/solo/expression.ts";

type Tone = typeof import("tone");

export type VoiceNote = {
  /** MIDIノート番号 */
  pitch: number;
  /** 鳴らし始める時刻（オーディオの時刻、秒） */
  time: number;
  /** 長さ（秒） */
  duration: number;
  /** 強さ（0〜1） */
  velocity: number;
  /** 下からしゃくって入るときの曲げ方 */
  scoop?: Scoop | null;
};

export type ExpressiveVoice = {
  /** 音源ファイルの読み込みが終わると解決する */
  loaded: Promise<void>;
  play: (note: VoiceNote) => void;
  dispose: () => void;
};

const ATTACK_SECONDS = 0.012;
const RELEASE_SECONDS = 0.07;

function semitoneRatio(semitones: number): number {
  return 2 ** (semitones / 12);
}

/**
 * @param samples 「音名 → 音源ファイル」の対応
 * @param startOffset 音源ファイルの頭にある無音の長さ（秒）。そのぶん先から再生する
 */
export function createExpressiveVoice(
  tone: Tone,
  samples: Record<string, string>,
  output: import("tone").InputNode,
  startOffset = 0,
): ExpressiveVoice {
  const pitches = Object.keys(samples).map((name) => ({ name, midi: tone.Frequency(name).toMidi() }));
  let buffers: import("tone").ToneAudioBuffers;
  const loaded = new Promise<void>((resolve, reject) => {
    buffers = new tone.ToneAudioBuffers({ urls: samples, onload: () => resolve(), onerror: reject });
  });
  const active = new Set<{ source: import("tone").ToneBufferSource; gain: import("tone").Gain }>();

  return {
    loaded,
    play(note) {
      // 目的の音に最も近い録音を選び、再生速度で音程を合わせる
      const nearest = pitches.reduce((best, candidate) =>
        Math.abs(candidate.midi - note.pitch) < Math.abs(best.midi - note.pitch) ? candidate : best,
      );
      const rate = semitoneRatio(note.pitch - nearest.midi);

      const gain = new tone.Gain(0).connect(output);
      const source = new tone.ToneBufferSource({ url: buffers.get(nearest.name), playbackRate: rate }).connect(gain);
      const voice = { source, gain };
      active.add(voice);

      // しゃくり: 低い音程から始めて、目的の音程まで滑らかに上げる
      if (note.scoop) {
        source.playbackRate.setValueAtTime(rate * semitoneRatio(-note.scoop.semitones), note.time);
        source.playbackRate.exponentialRampToValueAtTime(rate, note.time + note.scoop.seconds);
      }

      const end = note.time + note.duration;
      gain.gain.setValueAtTime(0, note.time);
      gain.gain.linearRampToValueAtTime(note.velocity, note.time + ATTACK_SECONDS);
      gain.gain.setTargetAtTime(0, end, RELEASE_SECONDS / 3);

      source.onended = () => {
        active.delete(voice);
        source.dispose();
        gain.dispose();
      };
      source.start(note.time, startOffset);
      source.stop(end + RELEASE_SECONDS * 2);
    },
    dispose() {
      for (const { source, gain } of active) {
        source.dispose();
        gain.dispose();
      }
      active.clear();
      buffers.dispose();
    },
  };
}
