export type MidiNote = {
  /** MIDIノート番号 */
  pitch: number;
  startTick: number;
  durationTicks: number;
  velocity: number;
  /** 0始まりのチャンネル番号 */
  channel: number;
};

export type MidiOptions = {
  bpm: number;
  /** 四分音符あたりのティック数 */
  ticksPerBeat: number;
};

/** 音の列を、単一トラックの標準MIDIファイル（フォーマット0）のバイト列にする */
export function writeMidi(notes: readonly MidiNote[], options: MidiOptions): Uint8Array {
  type Event = { tick: number; isOn: boolean; bytes: number[] };
  const events: Event[] = [];
  for (const note of notes) {
    events.push({ tick: note.startTick, isOn: true, bytes: [0x90 | note.channel, note.pitch, note.velocity] });
    events.push({ tick: note.startTick + note.durationTicks, isOn: false, bytes: [0x80 | note.channel, note.pitch, 0] });
  }
  // 同じ時刻ではオフを先にして、同じ音高の連打が途切れないようにする
  events.sort((a, b) => a.tick - b.tick || Number(a.isOn) - Number(b.isOn));

  const microsecondsPerBeat = Math.round(60_000_000 / options.bpm);
  const track: number[] = [0x00, 0xff, 0x51, 0x03, ...bigEndian(microsecondsPerBeat, 3)];
  let currentTick = 0;
  for (const event of events) {
    track.push(...variableLength(event.tick - currentTick), ...event.bytes);
    currentTick = event.tick;
  }
  track.push(0x00, 0xff, 0x2f, 0x00);

  return Uint8Array.from([
    ...ascii("MThd"),
    ...bigEndian(6, 4),
    ...bigEndian(0, 2),
    ...bigEndian(1, 2),
    ...bigEndian(options.ticksPerBeat, 2),
    ...ascii("MTrk"),
    ...bigEndian(track.length, 4),
    ...track,
  ]);
}

function ascii(text: string): number[] {
  return [...text].map((char) => char.charCodeAt(0));
}

function bigEndian(value: number, byteLength: number): number[] {
  const bytes: number[] = [];
  for (let shift = (byteLength - 1) * 8; shift >= 0; shift -= 8) {
    bytes.push((value >>> shift) & 0xff);
  }
  return bytes;
}

/** MIDIの可変長数値（7ビットずつ、最終バイト以外は最上位ビットを立てる） */
function variableLength(value: number): number[] {
  const bytes = [value & 0x7f];
  for (let rest = value >>> 7; rest > 0; rest >>>= 7) {
    bytes.unshift((rest & 0x7f) | 0x80);
  }
  return bytes;
}
