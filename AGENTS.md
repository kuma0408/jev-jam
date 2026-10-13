# AGENTS.md

このリポジトリで作業するAIエージェント（および人間）向けの指示書。

## プロジェクト概要

- TypeSafe AI の判断特化モデル **Jev** を使った、音楽アドリブセッション体験のデモWebアプリ。
- ユーザーがコード進行を選び、それに合わせたアドリブソロをJevの判断でほぼリアルタイムに展開する。
- 社内SWE勉強会での発表を想定している。**作る過程そのものが発表の素材**になる。

## 意思決定の記録（ADR）— 必須

重要な決断・価値のある判断・行為を行ったら、**その作業と同じタイミングで** `docs/adr/` に記録すること。
後からまとめて書かない（勉強会資料の一次情報になるため、当時の温度感と根拠を残す）。

### 記録する対象

- 技術選定（フレームワーク、ライブラリ、アーキテクチャ、Jevの使い方）
- 複数案を比較して1つを選んだ判断（採用しなかった案とその理由を必ず残す）
- 苦労した点と、その解決策または回避策
- 工夫した点（体験・性能・設計上の工夫）
- **できなかったこと・諦めたこと**と、その理由
- 検証や計測で分かった事実（レイテンシ、品質、コストなどの実測値）
- 当初の想定が外れたこと

些細な実装の詳細（命名、軽微なリファクタなど）は記録不要。迷ったら「勉強会で話す価値があるか」で判断する。

### 書き方

- 場所: `docs/adr/NNNN-短い-ケバブケース名.md`（`NNNN` は4桁の連番）
- 雛形: `docs/adr/0000-template.md` をコピーして使う
- 1ファイル1決定。短くてよい（数行〜1画面）
- 決定を覆すときは既存ADRを書き換えず、新しいADRを作って旧ADRのステータスを `Superseded by NNNN` にする
- 追加したら `docs/adr/README.md` の一覧に1行足す

## 開発ルール

- パッケージマネージャは **pnpm / pnpx** を使う（npm / npx は使わない）
- 原則TDD。小さなテスト → 失敗確認 → 実装のサイクルを小刻みに回す
- コード内コメントは日本語
- 一度に大量の変更をせず、小分けに進める
- UIはアクセシビリティを重視する（キーボード操作、コントラスト、音に頼らない状態表示）
- APIキーなどの秘密情報はコミットしない（`.env*` は `.gitignore` 対象）
- **Jevの呼び出しは課金される。動作確認では呼ばない**
  - 画面の動作確認は `http://localhost:3000/?mock=1` で行う（Jevを呼ばず、ダミーの応答で動く）
  - APIを直接叩くときは、リクエストに `"mock": true` を入れる
  - 本物のJevを呼ぶのは、Jevの振る舞いそのもの（確率分布、選ばれ方の偏り）を知りたいときだけ。回数は判断に足りる最小にする
  - 目安: 候補4個で1小節あたり約1.6万トークン（入力 $0.042/100万トークン）

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
