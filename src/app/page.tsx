"use client";

import { useEffect, useState } from "react";
import { BarLogPanel } from "./components/bar-log.tsx";
import { ControlDock } from "./components/control-dock.tsx";
import { MelodyPads, PAD_KEY_CODES } from "./components/melody-pads.tsx";
import { FlourishLayer } from "./components/flourish-layer.tsx";
import { Backdrop } from "./components/backdrop.tsx";
import { Score, TAP_STEP_HIGH, TAP_STEP_LOW } from "./components/score.tsx";
import { NOTE_KEY_CODES } from "./components/piano.tsx";
import { ADVENTURE_LABELS, AdventureMark, Piano } from "./components/piano.tsx";
import { TurnBanner } from "./components/turn-banner.tsx";
import { useSession } from "./session/use-session.ts";

export default function Page() {
  const session = useSession();
  const { status, candidates, nextChord, choose } = session;
  const playing = status === "playing";

  const { strike, lift, noteOn, noteOff, padOn, padOff, releaseChord } = session;
  // 旋律を弾く鍵盤。easy は合う音だけの8鍵、piano は12音すべて
  const [keyboard, setKeyboard] = useState<"easy" | "piano">("easy");
  // キーボードで叩くときの五線の位置（上下キーで動かす）。最初は五線の真ん中のシ
  const [keyboardStep, setKeyboardStep] = useState(6);
  // 旋律の鍵盤は、掛け合いをするときだけキーで弾ける（普段はキーを叩いても何も起きない）
  const trading = session.settings.trade;

  // スペースで叩き、上下キーで叩く高さを動かす。数字キーでコードを弾ける（裏側の鍵盤を開いていなくても効く）
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // 文字を打つ場所（選択肢の一覧）にいるときだけ無視する。つまみやスライダーを触った後でも弾けるようにする
      if (event.target instanceof HTMLSelectElement) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // event.key は日本語入力がオンだと文字が取れない（"Process" になる）ので、物理キーの位置で判定する
      const { code } = event;
      // ボタンやつまみにフォーカスがあるときのスペースと上下キーは、その部品の操作として扱う
      // 叩く面そのものはボタンだが、スペースは叩く操作として扱う
      const onSurface = event.target instanceof HTMLElement && event.target.classList.contains("score-surface");
      const onControl =
        !onSurface && (event.target instanceof HTMLButtonElement || event.target instanceof HTMLInputElement);
      if (code === "Space" && !onControl && !event.repeat) {
        if (playing) strike(keyboardStep);
        else if (status === "idle") session.start();
        event.preventDefault();
        return;
      }
      if (playing && !event.repeat && trading) {
        // 掛け合いの旋律の鍵盤。押している間だけ鳴る
        if (keyboard === "easy") {
          const slot = PAD_KEY_CODES.indexOf(code as (typeof PAD_KEY_CODES)[number]);
          if (slot >= 0) {
            padOn(slot);
            event.preventDefault();
            return;
          }
        } else {
          const pitchClass = NOTE_KEY_CODES.indexOf(code as (typeof NOTE_KEY_CODES)[number]);
          if (pitchClass >= 0) {
            noteOn(pitchClass);
            event.preventDefault();
            return;
          }
        }
      }
      if (playing && !onControl && (code === "ArrowUp" || code === "ArrowDown")) {
        setKeyboardStep((current) => Math.min(TAP_STEP_HIGH, Math.max(TAP_STEP_LOW, current + (code === "ArrowUp" ? 1 : -1))));
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
      // スペースを離したら、押さえていた和音を止める
      if (event.code === "Space") lift();
      if (/^(?:Digit|Numpad)[1-9]$/.test(event.code)) releaseChord();
      const pitchClass = NOTE_KEY_CODES.indexOf(event.code as (typeof NOTE_KEY_CODES)[number]);
      if (pitchClass >= 0) noteOff(pitchClass);
      // 押している途中で鍵盤を切り替えても鳴りっぱなしにならないよう、どちらの鍵盤の音も止める
      const slot = PAD_KEY_CODES.indexOf(event.code as (typeof PAD_KEY_CODES)[number]);
      if (slot >= 0) padOff(slot);
    };
    // ほかの窓へ移ると、キーや指を離したことが届かないので、押さえている和音を止める
    const onBlur = () => lift();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [candidates, choose, keyboard, keyboardStep, noteOff, noteOn, padOff, padOn, playing, releaseChord, session, status, strike, lift, trading]);

  const preparing = playing && session.readyMs === null;

  return (
    <>
      <Backdrop subscribe={session.subscribe} energy={session.liveEnergy} />
      <FlourishLayer subscribe={session.subscribe} />
      <main className="shell">
        <header className="top">
          <h1 className="brand">Jev Session</h1>
          {playing && (
            <div className="top-now">
              {/* 文字は出さず、四角の形で「止める」を示す。読み上げには名前を付ける */}
              <button type="button" className="stop" aria-label="停止" title="停止" onClick={session.stop}>
                <span className="stop-icon" aria-hidden="true" />
              </button>
            </div>
          )}
        </header>

        {session.error && (
          <p className="alert" role="alert">
            <span className="alert-mark" aria-hidden="true">
              !
            </span>
            {session.error}
          </p>
        )}

        <Score
          subscribe={session.subscribe}
          status={status}
          energy={session.liveEnergy}
          keyboardStep={keyboardStep}
          onStart={session.start}
          onPress={strike}
          onRelease={lift}
        />

        {/* 遊ぶのに要らないものは、ここにしまっておく。勉強会では開いて、Jevが何を選んだかを見せる */}
        <details className="backstage">
          <summary>裏側を見る</summary>
          <dl className="meters">
            <div className="meter">
              <dt>接続先</dt>
              <dd>{session.clientName === null ? "—" : ({ jev: "Jev", rules: "ルール" } as Record<string, string>)[session.clientName] ?? "ダミー"}</dd>
            </div>
            <div className="meter">
              <dt>次のソロの準備</dt>
              <dd data-busy={preparing}>
                {!playing ? "—" : session.readyMs === null ? "依頼中…" : `完了（${Math.round(session.readyMs)}ms）`}
              </dd>
            </div>
            <div className="meter">
              <dt>次のコード</dt>
              <dd>{nextChord ?? "—"}</dd>
            </div>
          </dl>
          <BarLogPanel log={session.log} />
          <ControlDock settings={session.settings} updateSettings={session.updateSettings} />
        {trading && (
        <section className="melody" aria-labelledby="melody-heading">
          <div className="melody-head">
            <h2 id="melody-heading" className="jam-heading">
              旋律を弾く
            </h2>
            <fieldset className="melody-mode">
              <legend className="visually-hidden">旋律を弾く鍵盤</legend>
              {(
                [
                  ["easy", "合う音だけ（A〜K）"],
                  ["piano", "ピアノの12音"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="melody-mode-option">
                  <input
                    type="radio"
                    name="keyboard"
                    value={value}
                    checked={keyboard === value}
                    onChange={() => setKeyboard(value)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          </div>
          <TurnBanner turn={session.turn} reply={session.reply} />
          {keyboard === "easy" ? (
            <>
              <MelodyPads
                padOn={padOn}
                padOff={padOff}
                subscribe={session.subscribe}
                currentChord={session.chord}
                playing={playing}
              />
              <p className="hint">
                どれを叩いても、いまのコードに合う音が鳴ります。右へ行くほど高い音です。コードが変わると、音も自動で入れ替わります。
              </p>
            </>
          ) : (
            <p className="hint">上の鍵盤の、鍵に書いてあるキーで12音すべてを弾けます。コードに合わない音も、そのまま鳴ります。</p>
          )}
        </section>
        )}

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
            showNoteKeys={keyboard === "piano"}
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
                ? "コードの札を押すと、その場で鳴って、バンドが次の拍から付いてきます（数字キーでも弾けます）。何度でも弾けます。弾かなければ「自動」の印のコードへ進みます。旋律は、下の「旋律を弾く」で弾けます。"
                : "開始すると、次に進めるコードが鍵の上に出ます。"}
            </p>
          </div>
        </section>

        </details>
      </main>
    </>
  );
}
