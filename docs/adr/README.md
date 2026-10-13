# ADR 一覧

重要な決断・判断・検証結果の記録。書き方は [AGENTS.md](../../AGENTS.md) を参照。

| No. | タイトル | 種別 | ステータス | 日付 |
| --- | --- | --- | --- | --- |
| [0001](0001-jev-chooses-solo-from-candidates.md) | Jevにはソロを「生成」させず、候補から「選ばせて」確率で抽選する | 設計判断 | Proposed | 2026-10-13 |
| [0002](0002-nextjs-typescript-tonejs.md) | Next.js + TypeScript + Tone.js を採用する | 技術選定 | Accepted | 2026-10-13 |
| [0003](0003-rule-based-chord-transition-graph.md) | コード進行の候補は、ルールベースの重み付き遷移グラフで出す | 設計判断 | Superseded by 0010 | 2026-10-13 |
| [0004](0004-start-with-jev-spike.md) | アプリ本体より先に、Jevの検証スパイクから始める | 設計判断 | Accepted | 2026-10-13 |
| [0005](0005-jev-spike-first-measurement.md) | Jevの初回実測: 速度は十分、リズムが課題 | 検証結果 | Accepted | 2026-10-13 |
| [0006](0006-speculative-solos-for-all-candidates.md) | 次に選べるコードすべての分のソロを、選ばれる前に作っておく | 設計判断 | Accepted | 2026-10-13 |
| [0007](0007-scale-choice-follows-song-tonality.md) | ソロの候補音は、コードの種類だけでなく曲のキーからも決める | 苦労と解決 | Accepted | 2026-10-13 |
| [0008](0008-solo-from-half-bar-cells.md) | ソロは1音ずつではなく、半小節の「型」から選ばせる | 設計判断 | Accepted | 2026-10-13 |
| [0009](0009-recorded-samples-for-instruments.md) | 楽器の音は合成音をやめ、公開されている録音音源を使う | 技術選定 | Accepted | 2026-10-13 |
| [0010](0010-progression-from-known-fragments.md) | コード候補は、定番進行の断片と履歴の照合で出す | 設計判断 | Accepted | 2026-10-13 |
| [0011](0011-cells-implemented-and-batched.md) | 型の方式を実装し、全候補の質問を1回のリクエストにまとめた | 検証結果 | Accepted | 2026-10-13 |
| [0012](0012-rule-based-accompaniment.md) | 伴奏はルールで動かし、Jevは使わない | 設計判断 | Accepted | 2026-10-13 |
