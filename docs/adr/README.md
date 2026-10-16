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
| [0029](0029-user-plays-melody-on-fitting-pads.md) | 旋律はユーザーが弾く。弾けない人のために「合う音だけの鍵盤」を用意する | 設計判断 | Superseded by 0031 | 2026-10-13 |
| [0030](0030-trade-two-bars-with-jev.md) | Jevと2小節ずつ交代で弾く（掛け合い）。Jevには「どう応えるか」を選ばせる | 設計判断 | Accepted | 2026-10-13 |
| [0031](0031-tap-only-simple-ui.md) | 操作は「叩く」だけにする。叩く高さで盛り上がりを決め、ほかは「裏側を見る」に隠す | 設計判断 | Superseded by 0032（盛り上がりの決め方） | 2026-10-14 |
| [0032](0032-tap-the-staff.md) | 五線譜を叩いて弾く。叩いた位置の音をいちばん上にした和音を鳴らす | 設計判断 | Accepted | 2026-10-14 |
| [0033](0033-hold-to-sustain-and-try-three-views.md) | 押している間は和音を伸ばす。音符の表示をやめ、3種類の表示を見比べて選ぶ | 設計判断 | Accepted（0034で決定） | 2026-10-14 |
| [0034](0034-ribbon-view-with-golden-melody.md) | 表示は「光の帯と線」に決める。Jevの旋律は金色の光の線にする | 設計判断 | Accepted | 2026-10-14 |
| [0035](0035-solo-follows-comping-touch.md) | ソロは伴奏の質感（押した回数と伸ばした長さ）に合わせて、しっとりにも激しくもなる | 設計判断 | Accepted | 2026-10-14 |
| [0036](0036-breath-noise-and-brass-samples.md) | 管楽器に息の音を重ねる。トランペットとトロンボーンの録音を足す | 工夫 | Accepted | 2026-10-14 |
| [0037](0037-revoice-held-chord-and-louder-brass.md) | 押さえたままの和音は、コードが変わったら押さえ直す。トロンボーンと息の音を大きくする | 苦労と解決 | Accepted | 2026-10-14 |
| [0038](0038-two-chords-in-one-bar.md) | 1小節に2つのコードを置けるようにする（Just the Two of Us進行を4小節で回す） | 苦労と解決 | Accepted | 2026-10-14 |
| [0039](0039-lower-tap-range.md) | 押せる和音を1オクターブ下（C3）まで広げる。低いところでは音を減らして濁らせない | 設計判断 | Accepted | 2026-10-14 |
| [0040](0040-jev-moves-between-progressions.md) | 8小節ごとの区切りで、Jevが定番進行を続けるか、別の進行へ移るかを選ぶ | 設計判断 | Accepted（一部 0042 で置き換え） | 2026-10-14 |
| [0041](0041-home-progressions.md) | カノン進行を外し、丸サ進行と Just the Two of Us進行を基本にする | 設計判断 | Accepted | 2026-10-14 |
| [0042](0042-lead-in-chord-to-any-progression.md) | 導くコードを挟んで、どの進行へも移れるようにする。ジャズ寄りの進行を3つ足す | 設計判断 | Accepted（導くコードは 0053 で置き換え） | 2026-10-14 |
| [0043](0043-drop-stepwise-descent.md) | 順次下降を一覧から外す | 設計判断 | Accepted | 2026-10-14 |
| [0044](0044-visual-refresh.md) | 文字をほぼ無くし、押すたびに弾けるエフェクトと、曲調で移ろう色にする | 設計判断 | Accepted | 2026-10-14 |
| [0045](0045-quieter-more-varied-flourishes.md) | エフェクトを控えめにし、種類を5から12に増やす | 設計判断 | Accepted | 2026-10-14 |
| [0046](0046-wider-expression-by-touch.md) | 伴奏の質感で、ソロの音の大きさ・音域・ビブラートの幅を広げる | 設計判断 | Accepted | 2026-10-14 |
| [0047](0047-retune-touch-volume-and-range.md) | しっとりの音量は下げず、激しいときは大きく、高すぎない音域にする | 設計判断 | Accepted | 2026-10-14 |
| [0048](0048-deploy-vercel-with-basic-auth.md) | 当日だけVercel（Hobby）に置き、固定ID・パスワードのBasic認証で守る | 技術選定 | Accepted | 2026-10-15 |
| [0049](0049-progression-in-english.md) | いまの進行は、日本語の名前ではなく英語の雰囲気の説明でJevに伝える | 設計判断 | Accepted | 2026-10-16 |
| [0050](0050-smooth-dynamics-across-bars.md) | 強さはJevの確率のまま選び、前の小節の終わりの音量から半小節かけてつなぐ | 設計判断 | Accepted（強弱の倍率は 0052 で置き換え） | 2026-10-16 |
| [0051](0051-pin-jev-model-version.md) | Jevのモデルを jev-1.14.0 に固定する | 技術選定 | Accepted | 2026-10-16 |
| [0052](0052-wider-dynamics-and-fast-tempo-volume.md) | デクレッシェンドの幅を広げ、フレーズの終わりを弱め、速い曲ではソロを大きめにする | 設計判断 | Accepted | 2026-10-16 |
| [0053](0053-two-five-lead-in-and-drum-cue.md) | 進行が移る前はツー・ファイブで導き、ドラムのフィルとシンバルで合図する | 設計判断 | Accepted | 2026-10-16 |
| [0054](0054-rule-based-decider-mode.md) | Jevを呼ばずにルールで確率を作るモードを足し、裏側の設定で切り替えられるようにする | 設計判断 | Accepted | 2026-10-16 |
