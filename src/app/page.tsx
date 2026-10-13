"use client";

import { useEffect } from "react";
import { BarLogPanel } from "./components/bar-log.tsx";
import { isEnergy } from "../lib/solo/energy.ts";
import { ControlDock } from "./components/control-dock.tsx";
import { EnergyDial } from "./components/energy-dial.tsx";
import { JamPad } from "./components/jam-pad.tsx";
import { ParticleField } from "./components/particle-field.tsx";
import { NOTE_KEY_CODES } from "./components/piano.tsx";
import { PianoRoll } from "./components/piano-roll.tsx";
import { ADVENTURE_LABELS, AdventureMark, Piano } from "./components/piano.tsx";
import { useSession } from "./session/use-session.ts";

export default function Page() {
  const session = useSession();
  const { status, candidates, nextChord, choose } = session;
  const playing = status === "playing";

  const { energy } = session.settings;
  const { updateSettings, tap, noteOn, noteOff, releaseChord } = session;

  // 数字キーで候補を選び、再生中は上下キーで盛り上がりを動かせるようにする
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // 文字を打つ場所（選択肢の一覧）にいるときだけ無視する。つまみやスライダーを触った後でも弾けるようにする
      if (event.target instanceof HTMLSelectElement) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // event.key は日本語入力がオンだと文字が取れない（"Process" になる）ので、物理キーの位置で判定する
      const { code } = event;
      // ボタンやつまみにフォーカスがあるときのスペースと上下キーは、その部品の操作として扱う
      const onControl = event.target instanceof HTMLButtonElement || event.target instanceof HTMLInputElement;
      if (playing && !event.repeat) {
        if (code === "Space" && !onControl) {
          tap();
          event.preventDefault();
          return;
        }
        // 鍵盤の音。押している間だけ鳴る
        const pitchClass = NOTE_KEY_CODES.indexOf(code as (typeof NOTE_KEY_CODES)[number]);
        if (pitchClass >= 0) {
          noteOn(pitchClass);
          event.preventDefault();
          return;
        }
      }
      if (playing && !onControl && (code === "ArrowUp" || code === "ArrowDown")) {
        const next = energy + (code === "ArrowUp" ? 1 : -1);
        if (isEnergy(next)) {
          updateSettings({ energy: next });
        }
        // 再生中はページのスクロールより演奏の操作を優先する
        event.preventDefault();
        return;
      }
      const digit = /^(?:Digit|Numpad)([1-9])$/.exec(code)?.[1];
      const candidate = digit === undefined ? undefined : candidates[Number(digit) - 1];
      if (candidate && !event.repeat) {
        choose(candidate.chord);
      }
    };
    // キーを離したら、押さえていたコードや音を止める
    const onKeyUp = (event: KeyboardEvent) => {
      if (/^(?:Digit|Numpad)[1-9]$/.test(event.code)) releaseChord();
      const pitchClass = NOTE_KEY_CODES.indexOf(event.code as (typeof NOTE_KEY_CODES)[number]);
      if (pitchClass >= 0) noteOff(pitchClass);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [candidates, choose, energy, noteOff, noteOn, playing, releaseChord, tap, updateSettings]);

  const preparing = playing && session.readyMs === null;

  return (
    <>
      <ParticleField subscribe={session.subscribe} energy={session.liveEnergy} />
      <main className="shell">
        <header className="top">
          <h1 className="brand">Jev Session</h1>
          <dl className="meters">
            <div className="meter">
              <dt>接続先</dt>
              <dd>{session.clientName === null ? "—" : session.clientName === "jev" ? "Jev" : "ダミー（キー未設定）"}</dd>
            </div>
            <div className="meter">
              <dt>次のソロの準備</dt>
              <dd data-busy={preparing}>
                {!playing ? "—" : session.readyMs === null ? "依頼中…" : `完了（${Math.round(session.readyMs)}ms）`}
              </dd>
            </div>
          </dl>
        </header>

        {session.error && (
          <p className="alert" role="alert">
            <span className="alert-mark" aria-hidden="true">
              !
            </span>
            {session.error}
          </p>
        )}

        <section className="stage" aria-label="コードの進行">
          {playing ? (
            <div className="stage-chords">
              <div className="stage-now">
                <span className="stage-label">いま</span>
                <span className="now-chord" aria-label={`現在のコード ${session.chord ?? "なし"}`}>
                  {session.chord ?? "—"}
                </span>
              </div>
              <div className="stage-next">
                <span className="stage-label">つぎ</span>
                <span className="next-chord">{nextChord ?? "—"}</span>
                {nextChord && (
                  <span className="next-how" data-chosen={session.chosenByUser}>
                    {session.chosenByUser ? "✓ あなたが選びました" : "選ばなければ自動でここへ"}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="stage-lead">
              コードを選ぶ。
              <br />
              Jevがソロで応える。
            </p>
          )}
          <button
            type="button"
            className="transport"
            data-playing={playing}
            onClick={playing ? session.stop : session.start}
            disabled={status === "starting"}
          >
            <span className="transport-icon" aria-hidden="true" />
            {status === "starting" ? "準備中…" : playing ? "停止" : "開始"}
          </button>
        </section>

        <PianoRoll subscribe={session.subscribe} playing={playing} />

        <section className="chooser" aria-labelledby="chooser-heading">
          <h2 id="chooser-heading" className="visually-hidden">
            次のコードを選ぶ
          </h2>
          <Piano
            candidates={candidates}
            nextChord={nextChord}
            chosenByUser={session.chosenByUser}
            choose={choose}
            releaseChord={releaseChord}
            noteOn={noteOn}
            noteOff={noteOff}
            subscribe={session.subscribe}
            currentChord={session.chord}
            bpm={session.settings.bpm}
            playing={playing}
          />
          <div className="guide">
            <ul className="legend" aria-label="印の意味">
              {([1, 2, 3] as const).map((level) => (
                <li key={level}>
                  <AdventureMark level={level} />
                  {ADVENTURE_LABELS[level]}
                </li>
              ))}
              <li>
                <span className="legend-current" aria-hidden="true">
                  C
                </span>
                いまのルート
              </li>
              <li>
                <span className="legend-fit" data-fit="chord" aria-hidden="true" />
                コードの音
              </li>
              <li>
                <span className="legend-fit" data-fit="scale" aria-hidden="true" />
                合う音
              </li>
              <li>
                <span className="legend-fit" data-fit="outside" aria-hidden="true" />
                外の音
              </li>
            </ul>
            <p className="hint">
              {playing
                ? "コードの札を押すと、その場で鳴って、バンドが次の拍から付いてきます（数字キーでも弾けます）。何度でも弾けます。弾かなければ「自動」の印のコードへ進みます。鍵そのものや、鍵に書いてあるキーを押すと、その音が鳴ります。"
                : "開始すると、次に進めるコードが鍵の上に出ます。"}
            </p>
          </div>
        </section>

        <JamPad playing={playing} touch={session.touch} onTap={tap} />
        <EnergyDial
          energy={session.settings.energy}
          live={session.liveEnergy}
          onChange={(energy) => session.updateSettings({ energy })}
        />
        <ControlDock settings={session.settings} updateSettings={session.updateSettings} />
        <BarLogPanel log={session.log} />
      </main>
    </>
  );
}
