import { describe, expect, it } from "vitest";
import { writeMidi } from "./write.ts";

describe("writeMidi", () => {
  it("1音だけの標準MIDIファイル（フォーマット0）を書き出す", () => {
    const bytes = writeMidi([{ pitch: 60, startTick: 0, durationTicks: 480, velocity: 100, channel: 0 }], {
      bpm: 120,
      ticksPerBeat: 480,
    });
    // prettier-ignore
    expect([...bytes]).toEqual([
      // ヘッダ: "MThd", 長さ6, フォーマット0, トラック数1, 四分音符あたり480ティック
      0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0x01, 0xe0,
      // トラック: "MTrk", 長さ20
      0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 20,
      // テンポ: 四分音符あたり500000マイクロ秒（120BPM）
      0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20,
      // ノートオン: C4, ベロシティ100
      0x00, 0x90, 60, 100,
      // 480ティック後（可変長で 0x83 0x60）にノートオフ
      0x83, 0x60, 0x80, 60, 0,
      // トラック終端
      0x00, 0xff, 0x2f, 0x00,
    ]);
  });

  it("同じ時刻ではノートオフをノートオンより先に並べる", () => {
    const bytes = writeMidi(
      [
        { pitch: 62, startTick: 240, durationTicks: 240, velocity: 90, channel: 0 },
        { pitch: 60, startTick: 0, durationTicks: 240, velocity: 90, channel: 0 },
      ],
      { bpm: 120, ticksPerBeat: 480 },
    );
    // テンポイベント（7バイト）より後ろのイベント列
    const events = [...bytes].slice(22 + 7, -4);
    // prettier-ignore
    expect(events).toEqual([
      0x00, 0x90, 60, 90,
      0x81, 0x70, 0x80, 60, 0, // 240ティック後にC4をオフ
      0x00, 0x90, 62, 90,      // 同時刻にD4をオン
      0x81, 0x70, 0x80, 62, 0,
    ]);
  });

  it("チャンネルをステータスバイトに反映する", () => {
    const bytes = writeMidi([{ pitch: 60, startTick: 0, durationTicks: 480, velocity: 100, channel: 1 }], {
      bpm: 120,
      ticksPerBeat: 480,
    });
    expect(bytes[22 + 7 + 1]).toBe(0x91);
  });
});
