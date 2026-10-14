// 録音音源を、1音ごとに音程と音量を動かしながら鳴らす音源。
// Tone.js の Sampler は鳴らし始めた音の音程を動かせないので、ソロ用に自前で持つ。
import { type NoteExpression, breathCurve, renderExpression } from "../../lib/solo/expression.ts";

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
  /**
   * 指定した時刻（オーディオの時刻、秒）から音を消し始める。
   *
   * @param fadeSeconds 消えるまでの長さ。長くすると余韻を残して自然に消える
   */
  releaseAt: (time: number, fadeSeconds?: number) => void;
};

export type ExpressiveVoice = {
  /** 音源ファイルの読み込みが終わると解決する */
  loaded: Promise<void>;
  /** open を指定した音のときだけ、後から切るための HeldNote を返す */
  play: (note: VoiceNote) => HeldNote | null;
  dispose: () => void;
};

/** 音の消え際の長さ。短い音はすぐ切り、長い音は少し余韻を残す */
const MIN_FADE_SECONDS = 0.05;
const MAX_FADE_SECONDS = 0.14;
const FADE_RATIO = 0.2;

function semitoneRatio(semitones: number): number {
  return 2 ** (semitones / 12);
}

/** 息の音を通すフィルターの中心を、音の高さの何倍にするか。倍音のあたりのかすれを残す */
const BREATH_FREQUENCY_RATIO = 3;
const BREATH_FREQUENCY_MIN = 700;
const BREATH_FREQUENCY_MAX = 6000;
/** 息の音を通す幅（フィルターの Q）。小さいほど広い。0.9 では削りすぎて聞こえなかったので広げた */
const BREATH_Q = 0.5;

export type BreathOptions = {
  /** 楽器ごとの息の音の多さ（0〜1）。息を使わない楽器（エレピ）は 0 */
  level: number;
  /** ユーザーが設定で決める息の量（0〜1）。鳴らすたびに読む */
  amount: () => number;
  /** 息の音の出力先。楽器の音とは別の経路にする（明るさのフィルターを通さないため） */
  output: import("tone").InputNode;
};

/**
 * @param samples 「音名 → 音源ファイル」の対応
 * @param startOffset 音源ファイルの頭にある無音の長さ（秒）。そのぶん先から再生する
 * @param breath 音に重ねる息の音。録音音源だけでは機械っぽく聞こえるので、管楽器では息づかいを足す
 */
export function createExpressiveVoice(
  tone: Tone,
  samples: Record<string, string>,
  output: import("tone").InputNode,
  startOffset = 0,
  breath?: BreathOptions,
): ExpressiveVoice {
  // 息の音のもと。鳴らしっぱなしのノイズを、音ごとのフィルターと音量で切り出して使う
  const noise = breath && breath.level > 0 ? new tone.Noise("pink").start() : null;
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
      // 読み込みが終わっていない楽器（裏で読み込み中）は、鳴らさずに飛ばす
      if (!buffers.get(nearest.name).loaded) return null;

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
      // 息の音: 音の高さのあたりだけを通したノイズを、吹き始めは強く、その後は小さく重ねる
      const amount = breath && noise ? breath.level * breath.amount() : 0;
      let breathPath: { filter: import("tone").Filter; gain: import("tone").Gain } | null = null;
      if (breath && noise && amount > 0) {
        const center = tone.Frequency(note.pitch, "midi").toFrequency() * BREATH_FREQUENCY_RATIO;
        const filter = new tone.Filter({
          type: "bandpass",
          frequency: Math.min(BREATH_FREQUENCY_MAX, Math.max(BREATH_FREQUENCY_MIN, center)),
          Q: BREATH_Q,
        });
        const breathGain = new tone.Gain(0).connect(breath.output);
        noise.connect(filter);
        filter.connect(breathGain);
        breathGain.gain.setValueCurveAtTime(breathCurve(curves.gain, note.duration, note.velocity, amount), note.time, note.duration);
        breathPath = { filter, gain: breathGain };
      }

      const naturalFade = Math.min(MAX_FADE_SECONDS, Math.max(MIN_FADE_SECONDS, note.duration * FADE_RATIO));
      const releaseAt = (time: number, fadeSeconds = naturalFade) => {
        // setTargetAtTime は時定数の3倍でほぼ0になる
        gain.gain.setTargetAtTime(0, time, fadeSeconds / 3);
        breathPath?.gain.gain.setTargetAtTime(0, time, fadeSeconds / 3);
        source.stop(time + fadeSeconds * 2);
      };

      source.onended = () => {
        active.delete(voice);
        source.dispose();
        gain.dispose();
        if (breathPath && noise) {
          noise.disconnect(breathPath.filter);
          breathPath.filter.dispose();
          breathPath.gain.dispose();
        }
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
      noise?.dispose();
    },
  };
}
