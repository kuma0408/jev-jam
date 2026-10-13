// 録音音源を、1音ごとに音程と音量を動かしながら鳴らす音源。
// Tone.js の Sampler は鳴らし始めた音の音程を動かせないので、ソロ用に自前で持つ。
import { type NoteExpression, renderExpression } from "../../lib/solo/expression.ts";

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
  /** 吹き方。しゃくり、音量の動き、ビブラート、フォールなど */
  expression: NoteExpression;
  /**
   * true なら、長さが来ても音を切らずに鳴らし続ける。いつ切るかは、戻り値の releaseAt で後から決める。
   * 小節の終わりまで伸びる音を、次の小節へ持ち越すかどうか決まるまで保留するために使う
   */
  open?: boolean;
};

/** 鳴らし続けている音。releaseAt を呼ぶまで切れない */
export type HeldNote = {
  /** 指定した時刻（オーディオの時刻、秒）に音を切る */
  releaseAt: (time: number) => void;
};

export type ExpressiveVoice = {
  /** 音源ファイルの読み込みが終わると解決する */
  loaded: Promise<void>;
  /** open を指定した音のときだけ、後から切るための HeldNote を返す */
  play: (note: VoiceNote) => HeldNote | null;
  dispose: () => void;
};

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

      // 1音の中の音程と音量の動きを、曲線としてまとめて予約する
      const curves = renderExpression(note.expression, note.duration);
      if (curves.pitch.some((offset) => offset !== 0)) {
        source.playbackRate.setValueCurveAtTime(
          curves.pitch.map((offset) => rate * semitoneRatio(offset)),
          note.time,
          note.duration,
        );
      }
      gain.gain.setValueCurveAtTime(
        curves.gain.map((level) => level * note.velocity),
        note.time,
        note.duration,
      );
      const releaseAt = (time: number) => {
        gain.gain.setTargetAtTime(0, time, RELEASE_SECONDS / 3);
        source.stop(time + RELEASE_SECONDS * 2);
      };

      source.onended = () => {
        active.delete(voice);
        source.dispose();
        gain.dispose();
      };
      source.start(note.time, startOffset);
      if (note.open) {
        return { releaseAt };
      }
      releaseAt(note.time + note.duration);
      return null;
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
