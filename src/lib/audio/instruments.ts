// 録音音源（public/samples/）の定義。出典とライセンスは public/samples/README.md を参照。

/** サンプラーに渡す「音名 → ファイル」の対応。間の音はサンプラーが近い音から作る */
type SampleMap = Record<string, string>;

function sampleMap(directory: string, notes: readonly string[], fileName: (note: string) => string = (note) => note): SampleMap {
  return Object.fromEntries(notes.map((note) => [note, `/samples/${directory}/${fileName(note)}.mp3`]));
}

export type SoloVoice = "sax-recorded" | "trumpet" | "trombone" | "tenor-sax" | "electric-piano";

export type SoloInstrument = {
  label: string;
  samples: SampleMap;
  /** ソロに使う音域（MIDIノート番号） */
  range: { low: number; high: number };
  /** 音源ごとの音量差をならすための補正（dB） */
  gainDb: number;
  /** 音源ファイルの頭にある無音の長さ（秒）。そのぶん先から再生して、発音の遅れを無くす */
  startOffset: number;
  /** 音に重ねる息の音の多さ（0〜1）。息を使わない楽器は 0 */
  breath: number;
};

const ELECTRIC_PIANO_SAMPLES = sampleMap("electric-piano", [
  "C3", "Eb3", "Gb3", "A3", "C4", "Eb4", "Gb4", "A4", "C5", "Eb5", "Gb5", "A5", "C6",
]);

export const SOLO_INSTRUMENTS: Record<SoloVoice, SoloInstrument> = {
  "sax-recorded": {
    label: "サックス（楽器の録音）",
    // 配布元のファイル名はシャープを "s" と書く（C#3 → Cs3）
    samples: sampleMap(
      "sax-recorded",
      ["C#3", "E3", "G3", "A#3", "C#4", "E4", "G4", "A#4", "C#5", "E5", "G5"],
      (note) => note.replace("#", "s"),
    ),
    range: { low: 53, high: 77 },
    // 実測で他の音源より約18dB大きく、頭に約28msの無音がある
    gainDb: -12,
    startOffset: 0.025,
    breath: 1,
  },
  trumpet: {
    label: "トランペット（楽器の録音）",
    samples: sampleMap(
      "trumpet",
      ["F3", "A3", "C4", "D#4", "F4", "G4", "A#4", "D5", "F5", "A5", "C6"],
      (note) => note.replace("#", "s"),
    ),
    // 録音は F3〜C6。ジャズのソロでよく使う B♭3〜A5 に絞る
    range: { low: 58, high: 81 },
    // 実測でサックスの録音と同じくらいの大きさ（-11〜-15dB）で、頭に約28msの無音がある
    gainDb: -12,
    startOffset: 0.025,
    breath: 0.8,
  },
  trombone: {
    label: "トロンボーン（楽器の録音）",
    samples: sampleMap(
      "trombone",
      ["C3", "D3", "D#3", "F3", "G#3", "A#3", "C4", "C#4", "D4", "D#4", "F4"],
      (note) => note.replace("#", "s"),
    ),
    // 録音は C3〜F4 を置いている（配布元にはもっと低い音もあるが、ソロでは使わないので置いていない）
    range: { low: 48, high: 67 },
    gainDb: -12,
    startOffset: 0.025,
    breath: 1,
  },
  "tenor-sax": {
    label: "テナーサックス（MIDI音源）",
    samples: sampleMap("tenor-sax", ["A2", "C3", "Eb3", "Gb3", "A3", "C4", "Eb4", "Gb4", "A4", "C5", "Eb5", "Gb5"]),
    range: { low: 53, high: 77 },
    gainDb: 6,
    startOffset: 0,
    breath: 1,
  },
  "electric-piano": {
    label: "エレピ",
    samples: ELECTRIC_PIANO_SAMPLES,
    range: { low: 60, high: 84 },
    gainDb: 7,
    startOffset: 0,
    breath: 0,
  },
};

export const SOLO_VOICES = Object.keys(SOLO_INSTRUMENTS) as SoloVoice[];

/** 伴奏のコードはエレピで鳴らす */
export const COMP_SAMPLES = ELECTRIC_PIANO_SAMPLES;
export const COMP_GAIN_DB = 4;
export const BASS_GAIN_DB = 8;

export const BASS_SAMPLES = sampleMap("bass", ["Eb1", "Gb1", "A1", "C2", "Eb2", "Gb2", "A2", "C3"]);

/** ベースのルート音を、ウッドベースの低い音域（E1〜Eb2）に収める */
export function bassPitch(rootPitchClass: number): number {
  return 28 + ((rootPitchClass + 8) % 12);
}
