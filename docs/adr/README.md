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
| [0008](0008-solo-from-half-bar-cells.md) | ソロは1音ずつではなく、半小節の「型」から選ばせる | 設計判断 | Superseded by 0014 | 2026-10-13 |
| [0009](0009-recorded-samples-for-instruments.md) | 楽器の音は合成音をやめ、公開されている録音音源を使う | 技術選定 | Accepted | 2026-10-13 |
| [0010](0010-progression-from-known-fragments.md) | コード候補は、定番進行の断片と履歴の照合で出す | 設計判断 | Accepted | 2026-10-13 |
| [0011](0011-cells-implemented-and-batched.md) | 型の方式を実装し、全候補の質問を1回のリクエストにまとめた | 検証結果 | Accepted | 2026-10-13 |
| [0012](0012-rule-based-accompaniment.md) | 伴奏はルールで動かし、Jevは使わない | 設計判断 | Accepted | 2026-10-13 |
| [0013](0013-white-ui-with-reactive-particles.md) | 画面を白基調に作り直し、音に反応する粒子の背景を置く | 工夫 | Accepted | 2026-10-13 |
| [0014](0014-rhythm-and-contour-chosen-separately.md) | ソロは「リズム」と「音の動き」を別々に選ばせて組み合わせる | 設計判断 | Accepted | 2026-10-13 |
| [0015](0015-energy-dial-and-instant-feedback.md) | 盛り上がりのつまみと、押した瞬間の音で「操っている感」を出す | 設計判断 | Accepted | 2026-10-13 |
| [0016](0016-at-least-three-chord-choices.md) | コードの候補は常に3つ以上出し、「とどまる」も選べるようにする | 設計判断 | Accepted | 2026-10-13 |
| [0017](0017-scoop-with-own-sample-player.md) | ソロの音に「しゃくり」を付けるため、音源の鳴らし方を自前で持つ | 工夫 | Accepted | 2026-10-13 |
| [0018](0018-user-plays-along.md) | ユーザーが自分でも音を出せるようにし、その叩き方にバンドが応える | 設計判断 | Accepted | 2026-10-13 |
| [0019](0019-solo-follows-its-own-history.md) | ソロに、これまでの流れと「前のフレーズとの関係」を持たせる | 設計判断 | Accepted | 2026-10-13 |
| [0020](0020-expression-curves-and-feedback-fixes.md) | 一音の中の音程と音量を曲線で動かし、聴いた指摘を直す | 工夫 | Accepted | 2026-10-13 |
| [0021](0021-ties-across-bars-and-landing.md) | 小節をまたいで音を伸ばせるようにし、小節の頭の抜けを減らす | 検証結果 | Accepted | 2026-10-13 |
| [0022](0022-chord-deadline-and-legato.md) | コード選択に締切を設け、最後の1拍を次のコードへ向かわせる。音の切れ目をなめらかにする | 設計判断 | Accepted | 2026-10-13 |
| [0023](0023-instant-jam-notes-on-the-piano.md) | 自分で鳴らす音を、押した瞬間に鳴らし、鍵盤に表示する | 苦労と解決 | Accepted | 2026-10-13 |
| [0024](0024-phrase-shape-register-arc-and-contrast.md) | 4小節ごとに「吹く場所」と「高さの流れ」を決め、跳躍と強弱の幅を広げる | 検証結果 | Accepted | 2026-10-13 |
| [0025](0025-sixteenth-runs-less-silence-richer-comping.md) | 16分音符は走らせ、伸ばしと無音を減らし、伴奏の押さえ方を増やす | 検証結果 | Accepted | 2026-10-13 |
| [0026](0026-play-the-chord-and-piano-roll.md) | コードは「選ぶ」のではなく「弾く」。弾いた瞬間に鳴り、バンドが次の拍から付いてくる | 設計判断 | Accepted | 2026-10-13 |
| [0027](0027-verify-with-mock-not-jev.md) | 動作確認はダミーで行い、本物のJevは振る舞いを知りたいときだけ呼ぶ | 設計判断 | Accepted | 2026-10-13 |
| [0028](0028-play-freely-chords-and-notes.md) | コードも音も、いつでも好きに弾けるようにする | 設計判断 | Accepted | 2026-10-13 |
| [0029](0029-user-plays-melody-on-fitting-pads.md) | 旋律はユーザーが弾く。弾けない人のために「合う音だけの鍵盤」を用意する | 設計判断 | Accepted | 2026-10-13 |
