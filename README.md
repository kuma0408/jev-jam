# jev-jam

English | [日本語](README.ja.md)

Tap chords on a staff, and an AI saxophonist answers with an improvised solo in real time. A jam session that runs in your browser.

The solo is shaped by [Jev](https://docs.typesafe.ai), a decision model from TypeSafe AI. Jev never writes out a melody. Instead, it makes many small calls in every bar — what rhythm the next half-bar takes, which way the line moves — and the app turns those calls into music. You don't need to play an instrument; tapping the screen is enough to play along with the band.

## How to play

1. Tap the staff to start the band.
2. Each tap plays a chord voiced with the tapped note on top. Hold to sustain it.
3. Jev's solo scrolls past as a golden ribbon of light, following your comping.

Tap higher and the band builds up, and the solo grows hotter with it. Short, choppy taps get a sharper solo; long held chords get a softer, breathier one.

Open "裏側を見る" (Behind the scenes) at the bottom of the page to see what Jev chose in each bar and how many milliseconds the next solo took to prepare. Tempo, instrument, and call-and-response mode — where you and Jev trade two bars at a time — are set there too.

It works with a keyboard alone: Space to tap, Up/Down to change the tap height, number keys to play chords.

> The interface is currently in Japanese.

## How it works: choose, don't compose

Ask a language model to "write a solo over this chord" and you wait, and the result is unpredictable. At 120 BPM a bar lasts two seconds. There is no time to wait.

So the work is split. Rules handle what music theory can decide: which notes fit the chord and the key. Jev only decides which of those candidates to use. Each candidate comes with a short description, such as "guide tone; defines the color of the chord" or "clashes with the 3rd; use only as a brief passing note."

Jev returns a probability for every option, not just one answer. **The app samples from those probabilities**, so the same progression produces a different solo every time. The top choice typically gets 40–60%: spread enough to stay fresh, focused enough to stay musical.

In our measurements, sending one bar's worth of decisions as a single request took 174 ms at the median and 263 ms at worst (measured from Japan). That fits easily inside a two-second bar, so the app prepares a solo for every chord you might play next, before you play it. Whatever chord you pick, the solo is already waiting.

Jev also decides:

- every eight bars, whether to stay on the current progression or move to another
- in call-and-response, whether to echo your phrase, answer it, push harder, or calm things down
- how loud the solo should be, given whether your comping feels gentle or intense

The accompaniment, drums, and sound shaping run on rules, without Jev. There is also a rules-only mode that builds the probabilities without calling Jev, switchable from the settings.

Every design decision is recorded in [docs/adr](docs/adr/README.md) — 55 records, in Japanese — including the options we rejected and the things that didn't work.

## Running locally

Requires Node.js 22.18+ and pnpm.

```sh
pnpm install
cp .env.example .env   # add your TYPESAFE_API_KEY
pnpm dev
```

Open http://localhost:3000. Without `TYPESAFE_API_KEY`, the app runs on a mock that returns random probabilities. Even with a key, `http://localhost:3000/?mock=1` uses the mock. Jev calls are billed per use, so the mock is the better choice for UI work.

| Variable | Purpose |
| --- | --- |
| `TYPESAFE_API_KEY` | Jev API key, issued at [console.typesafe.ai](https://console.typesafe.ai/keys) |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` | Basic auth for a public deployment. Active only when both are set |

Run tests with `pnpm test` and type checks with `pnpm typecheck`.

## Tech stack

- Next.js 16 (App Router) and TypeScript
- Tone.js for audio, plus a custom sample player for the solo voice so notes can scoop and vibrato
- Jev is called only from a Next.js API route; the API key never reaches the browser
- Vitest for tests

## Sound credits

The instrument samples in `public/samples/` are third-party recordings, distributed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). They are not covered by this repository's MIT License.

| Instruments | Source |
| --- | --- |
| Saxophone, trumpet, trombone | [nbrosowsky/tonejs-instruments](https://github.com/nbrosowsky/tonejs-instruments) |
| Tenor sax, electric piano, upright bass | [gleitz/midi-js-soundfonts](https://github.com/gleitz/midi-js-soundfonts) (FluidR3_GM by Frank Wen) |

To keep the repository small, only every third semitone (minor-third steps) is included. See [public/samples/README.md](public/samples/README.md) for details.

## License

The code is under the [MIT License](LICENSE). The sound samples are under CC BY 3.0, as noted above.
