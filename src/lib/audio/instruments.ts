// 録音音源（public/samples/）の定義。出典とライセンスは public/samples/README.md を参照。

/** サンプラーに渡す「音名 → ファイル」の対応。間の音はサンプラーが近い音から作る */
type SampleMap = Record<string, string>;

function sampleMap(directory: string, notes: readonly string[], fileName: (note: string) => string = (note) => note): SampleMap {
  return Object.fromEntries(notes.map((note) => [note, `/samples/${directory}/${fileName(note)}.mp3`]));
}

export type SoloVoice = "sax-recorded" | "tenor-sax" | "electric-piano";

export type SoloInstrument = {
  label: string;
  samples: SampleMap;
  /** ソロに使う音域（MIDIノート番号） */
  range: { low: number; high: number };
  /** 音源ごとの音量差をならすための補正（dB） */
  gainDb: number;
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
    // 実測で他の音源より約18dB大きい
    gainDb: -12,
  },
  "tenor-sax": {
    label: "テナーサックス（MIDI音源）",
    samples: sampleMap("tenor-sax", ["A2", "C3", "Eb3", "Gb3", "A3", "C4", "Eb4", "Gb4", "A4", "C5", "Eb5", "Gb5"]),
    range: { low: 53, high: 77 },
    gainDb: 6,
  },
  "electric-piano": {
    label: "エレピ",
    samples: ELECTRIC_PIANO_SAMPLES,
    range: { low: 60, high: 84 },
    gainDb: 7,
  },
};

export const SOLO_VOICES = Object.keys(SOLO_INSTRUMENTS) as SoloVoice[];

/** 伴奏のコードはエレピで鳴らす */
export const COMP_SAMPLES = ELECTRIC_PIANO_SAMPLES;
export const COMP_GAIN_DB = 4;
export const BASS_GAIN_DB = 8;

export const BASS_SAMPLES = sampleMap("bass", ["Eb1", "Gb1", "A1", "C2", "Eb2", "Gb2"]);

/** ベースのルート音を、ウッドベースの低い音域（E1〜Eb2）に収める */
export function bassPitch(rootPitchClass: number): number {
  return 28 + ((rootPitchClass + 8) % 12);
}
