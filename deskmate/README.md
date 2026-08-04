# Deskmate — the bedroom version

The [business case](BUSINESS-CASE.md) worked out that the company version of this idea
needs about $2M and eighteen months. This is the other version: a face that lives on your
screen, costs nothing to start, and can be running in the next five minutes.

## Start it

```
open deskmate/index.html        # macOS
xdg-open deskmate/index.html    # Linux
start deskmate/index.html       # Windows
```

Use **Chrome or Edge** — speech recognition doesn't exist in Firefox, and Safari's is
patchy. Click the face to wake it, then **hold space and talk**. Let go and it answers.

It opens in demo mode with canned replies, so it works before you've spent anything.

## What it costs to run

This is the whole point, so here it is plainly:

| Part | Who does it | Cost |
|---|---|---|
| Hearing you | Your browser (Web Speech API) | **free** |
| Talking back | Your browser (speechSynthesis) | **free** |
| Seeing | Your webcam | **free** |
| The face | Canvas, ~200 lines | **free** |
| Thinking | An LLM API | **~$0.0004 a turn** |

Speech is the expensive part of every voice assistant, and your browser gives it away.
That's why the estimate in the business case — $22–43/month — collapses to **under $2/month**
here. Fifty conversations a day on Haiku is about **60¢ a month**.

Three deliberate choices keep it there, and you should keep all three:

- **Hold-to-talk, not always-listening.** Always-on is where the money goes, and it means
  a microphone open in your bedroom all day. Push-to-talk fixes both at once.
- **The camera only grabs a frame when you say something that needs eyes** — "look at this",
  "what am I holding". Never streamed. Image tokens are the most expensive thing here.
- **A running cost counter, top right.** You can watch what you're spending. Nobody who can
  see the number gets a surprise bill.

Cheaper still: point it at **Ollama or LM Studio** on your own laptop (Brain →
OpenAI-compatible → `http://localhost:11434/v1/chat/completions`, no key). Then it's free
forever and works offline. An 8B model is worse company than Haiku, but it's *yours*.

## The money ladder

Don't buy anything until the step below has been running for a couple of weeks.

**Step 0 — £0. Browser tab.** What you have now. Full-screen it on a second monitor, or
just leave the tab open. Live with it for two weeks.

> This step is the actual experiment. The question isn't whether you *can* build it — you
> just did. It's whether you still talk to it in week six. Most people don't, and finding
> that out for £0 instead of £2M is the entire value of doing it small.

**Step 1 — £0. Your old phone.** Prop it against your monitor, run `python3 -m http.server 8000`
in this folder, and open `http://<your-laptop-ip>:8000/deskmate/` on the phone. Now it's a
physical object on your desk with its own screen and camera, for nothing. This is 90% of the
feeling of the £220 build.

**Step 2 — ~£20. A cheap round display.** A Waveshare ESP32-S3 round LCD board is about £18.
It's a dumb face — your laptop still does the thinking and talking, the board just shows the
eyes over a serial or websocket link. This is where it stops being a screen and starts being
an object.

**Step 3 — ~£45. A second-hand Pi.** A used Pi 4 with a 3.5" screen off eBay. Only worth it
once you know you want it standalone.

Skip to Step 3 and you'll spend £45 finding out what Step 0 tells you for nothing.

## Giving it hands

Files and email are where this gets genuinely useful and genuinely dangerous. The approval
gate is already built — `requestApproval(what, body)` in `index.html` shows a card and
resolves true or false. It exists before any tool does, on purpose.

When you wire up real tools, the rule to hold:

- **Reading is free, writing asks.** Anything that creates, edits, deletes or sends goes
  through `requestApproval` and shows you the exact content first.
- **One folder.** Point it at `~/deskmate-files`, not your home directory. A wrong path in a
  voice command should cost you a scratch file, not your coursework.
- **Email is draft-only.** It writes, you press send. Delete stays yours. Voice
  misrecognition is common enough that "delete that email" *will* eventually fire on the
  wrong thread, and there's no undo worth relying on.

To do this you need a small local server — the browser can't touch your filesystem — so
Step 4 is a ~100-line Node process on localhost exposing read/write tools, with every write
routed back through the approval card. Build it when you want it, not before.

## Files

| | |
|---|---|
| `index.html` | The whole thing. Face, ears, mouth, eyes, brain, approval gate. No build step, no dependencies. |
| `BUSINESS-CASE.md` | Why the company version is a bad first move, with the numbers. |

## Making the face yours

The character is in one object near the top of the script:

```js
const MOODS = {
  idle:      { lid: 0.06, pupil: 1.0, mouth: 0.04, curve: 0.30, hue: 200, glow: 0.55 },
  listening: { lid: 0.00, pupil: 1.35, ... },
};
```

`lid` is how shut the eyes are, `pupil` scales the iris, `curve` bows the mouth (negative
frowns), `hue` colours everything. The draw loop eases toward whichever mood is set, so you
never write transitions — change the numbers and the personality changes. Add a `sulking`,
give it a `curious` head-tilt. That's the fun part, and it's free.
