# Claude Buddy — Usage Mood Tracker

A tiny pixel-art companion that lives on top of every page you visit and
reacts to how close you are to your claude.ai usage limit. Pick your
character in Settings:

- **Cat** — draggable, sits in a corner, happy and green with a lazy
  tail-wag when you're clear, nervous and amber as you approach the limit,
  panicked (shaking, sweating) and red once you've hit it.
- **Web-Slinger** — a bundled image hanging top-right (rope drawn into the
  image itself), swaying and glowing redder as usage climbs. At 100% it
  **snaps and falls**; it respawns once usage drops back down.

Either way, the exact numbers are always visible — no click or popup needed
to see them: the cat shows one percentage plus a progress bar; the
Web-Slinger shows both current-session and weekly percentages side by side.

No API key to manage, no manual calibration. Everything runs locally in the
browser; the only network call is to claude.ai itself, from the extension's
own background worker.

> ## ⚠️ Personal-use-only asset — do not publish as-is
>
> `assets/hero-rope-mask.png` and `assets/hero-body.png` are cropped pieces
> of Marvel's Spider-Man — recognizable by its web-pattern suit texture,
> spider emblem, and mask design — sourced from a `spiderman.png` the user
> supplied (still in the repo root). They're bundled **only because this
> build is explicitly for that one user's personal, local, unpublished
> use.** Embedding them was a deliberate exception to the usual rule here,
> made on that basis alone.
>
> **If this is ever going to be published to the Chrome Web Store, shared
> with anyone else, or distributed in any form, both files under `assets/`
> must be removed or replaced first.** Editing/recoloring them does not fix
> this — a modified Spider-Man is still recognizably Spider-Man, and
> distributing that in a Chrome extension is copyright/trademark
> infringement regardless of edits. Swap `heroImg()` in `shared/mascot.js`
> back to a generic asset (an earlier procedural pixel-art version — no
> external image, upside-down via CSS rotation — is straightforward to
> restore) before any public build.

## How it works

`background.js` fetches usage **directly from claude.ai's own internal API**
— the same endpoints its Settings → Usage page reads from — using the
browser's existing claude.ai session cookies:

1. `GET https://claude.ai/api/organizations` → finds your organization ID.
2. `GET https://claude.ai/api/organizations/<org id>/usage` → returns real
   utilization percentages and reset timestamps, keyed by window:
   `five_hour` (current session), `seven_day` (weekly, all models),
   `seven_day_opus`, `seven_day_sonnet`.

Both calls use `credentials: "include"`, so they ride on whatever claude.ai
session cookie is already in the browser — no login flow, no API key, no
DOM scraping, no local estimating. This runs automatically every 5 minutes
via a `chrome.alarms` timer, and on demand via **Refresh now** (popup,
clicking the cat, or Settings). The mood/progress bar reflects the **worst**
(highest-utilization) bar, since that's the limit you're closest to hitting;
the popup and Settings show the full breakdown of every bar claude.ai
reports.

`content/overlay.js` runs on every page (`<all_urls>`), inside a closed
shadow DOM so host pages can't see or style it, and mounts whichever
character `Settings → Character` has selected, rebuilding its DOM whenever
that choice changes. `shared/mascot.js` renders both characters — the cat as
a 16×16 grid SVG (ears, tail, whiskers); the hero as two bundled images
(`assets/hero-rope-mask.png` + `assets/hero-body.png`, split from the
original — see below) loaded via `chrome.runtime.getURL(...)` (declared
under `web_accessible_resources` in `manifest.json` so a content script can
load them on any page) — **and** is the single source of truth for both
characters' CSS animations (`ClaudeBuddyMascot.css`), shared by the overlay
and the popup so neither ever drifts out of sync visually.

## Characters

**Cat.** Drag it anywhere; a plain click (no drag) refreshes usage
immediately. Percentage and progress bar sit directly under it, always
visible.

**Web-Slinger.** Its anchor point is fixed at the top-right corner — that
part doesn't move — but the character himself can be grabbed and pulled
like a rubber band; see "Pull-and-release physics" below. The original
image was cropped into two pieces at the exact row (found by scanning pixel
rows for where the narrow rope silhouette widens into the character, row
293 of 577) where the rope ends and the body begins:

- `hero-rope-mask.png` — just the rope lines, rendered as a CSS
  `mask-image` on a plain colored `<div>`, so its `background-color` can be
  driven directly by code rather than baked into a static image.
- `hero-body.png` — the character itself, shown as-is, never recolored.

The rope's color is a continuous interpolation from white (`rgb(255,255,255)`)
to red (`rgb(229,57,53)`) as a direct function of the exact usage percentage,
so it visibly creeps toward red the whole way up rather than jumping at
thresholds. The swinging rig's motion is driven the same way: two CSS
custom properties, `--tension-amp` (3° → 20°) and `--tension-dur`
(3.6s → 0.32s), are recomputed from the exact percentage on every render and
fed into one keyframe animation — so the sway smoothly widens and speeds up
as usage climbs instead of snapping between a handful of fixed tiers. Both
are eased toward the high end (`t^1.6`) so it stays fairly calm through the
low-to-mid range and escalates quickly near the limit, closer to how a real
rubber band feels stable for a while and then destabilizes fast right before
it snaps. Faint strain-lines above the rope fade in continuously too, over
the last 40 points before 100%, rather than switching on at a fixed
boundary. All of this is still just two or three numbers set once per
render — the actual animating happens natively in CSS, not a JS loop. At
100%, everything falls off-screen and respawns once usage drops back down.

The fall uses a FLIP technique (measure the hero's on-screen position,
detach it from the swinging/rotated rig, replay the fall as a fixed-position
`top: 115vh` animation) so it tumbles away relative to the actual viewport
rather than the rig's own rotation. Reaching 100% for the first time on a
freshly loaded page shows the *end state* (already fallen) instantly rather
than replaying the animation — it only plays on a live transition you
actually see happen.

Above the rope sit two small cards, side by side — **Session** (the
`five_hour` bar) and **Week** (the `seven_day`, all-models bar) — each
showing its own percentage in its own severity color, independent of the
rope (which always tracks the single worst bar across all four categories,
session or weekly, since that's the one you're closest to actually
hitting). Both numbers are plain text updates on every render — no extra
network calls, timers, or images — so adding them costs nothing beyond
what was already being fetched.

### Pull-and-release physics

Grabbing the character and dragging pulls him away from the anchor like a
rubber band — the rope rotates to point at him and stretches (`scaleY`) to
match the distance, capped at 70px so he can't be yanked off into the page.
Releasing hands off to a damped-spring simulation (stiffness/damping tuned
for a couple of overshooting oscillations, not a dead drop) that snaps him
back and settles.

This is deliberately built to cost nothing while idle:

- **While dragging**, there's no loop at all — real `pointermove` events
  (already throttled to the display's refresh rate by the browser) directly
  set `transform` on the character and the rope. `transform` is
  GPU-composited and doesn't trigger layout/reflow.
- **On release**, a `requestAnimationFrame` loop starts *only then*, runs
  the spring math each frame, and **cancels itself the instant the
  oscillation settles** below a small threshold — typically well under a
  second. No loop ever runs while the character is just hanging still.
- **Losing focus stops it immediately**: both `window`'s `blur` event
  (switching to another application — the browser window itself isn't the
  active one) and `visibilitychange` going hidden (switching tabs) cancel
  any in-flight animation frame and snap the character straight back to
  rest, rather than leaving something animating (throttled or not) in a
  background you can't see. The same reset runs on `pointercancel`, so an
  interrupted drag (e.g. the OS stealing the gesture) can't leave him
  stuck mid-pull either.
- **This isn't limited to the bounce.** A single `:host(.buddy-unfocused) *
  { animation-play-state: paused !important; }` rule, toggled by the same
  blur/visibility/focus events, freezes *every* continuous CSS animation in
  the widget — the cat's bob/tail-wag/ear-flick and the hero's ambient
  sway/shake — the instant the window isn't focused or the tab isn't
  visible, not just the JS-driven pull physics. Browsers already throttle
  animations in fully backgrounded tabs on their own, but that's not
  guaranteed for a window that's merely unfocused-but-visible, so this is
  an explicit stop rather than relying on that.
- **Switching characters in Settings** tears down the active mode's
  listeners and cancels its animation frame before mounting the other one,
  so repeatedly flipping between Cat and Web-Slinger can't accumulate
  stray `requestAnimationFrame` loops or duplicate `blur`/`visibilitychange`
  listeners.

A plain click (no movement past a small threshold) still refreshes usage,
same as before — the drag and the click share the same pointer handler and
are disambiguated by whether the pointer actually moved.

## Animation design

Blinking is a pure CSS class toggle (`.buddy-blink` squashes the eyes via
`transform: scaleY()`) rather than a full re-render, specifically so it never
interrupts the continuously-running tail-wag / ear-flick animations drawn
into the cat's SVG — those only restart when the mood itself actually
changes. Cat motion is tuned per mood: happy gets a fast wide tail wag and a
bouncy bob, content/concerned get a gentler sway, stressed gets a rapid
frantic tail plus a full-body jitter and a dripping sweat drop, and sleeping
gets a slow breathing bob with floating "z"s and a still, drooped tail. For
the hero, the same tuned-per-severity approach applies to the rig's
sway/shake and glow instead of the sprite itself — see the Characters
section above.

## Install (unpacked, for development / testing)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder
   (`d:\Codes\claude usage tracker`).
4. The cat should appear in the bottom-right corner of any page within a
   few seconds (switch to the Web-Slinger any time in Settings). If you're
   already logged into claude.ai in this browser, the usage bar populates
   automatically within moments — no need to visit claude.ai at all.
5. Click the toolbar icon and hit **Preview moods** to see all five states
   without needing to actually hit your usage limit (this cycles whichever
   character is currently selected, including the web-break at "stressed").

## Moods

Mood/progress bar are driven by the **worst** (highest-utilization) bar
claude.ai reports across your session and weekly limits:

| Mood | Trigger |
|---|---|
| 😴 Sleeping | Not logged in to claude.ai, or no data fetched yet |
| 🙂 Happy | Highest usage bar under ~40% |
| 😐 Content | 40–74% |
| 😟 Concerned | 75–89% |
| 😫 Stressed | 90%+ |

## Settings

Click the toolbar icon → **Settings**, or the creature's toggle to minimize:

- **Character** — Cat or Web-Slinger, with a live preview of each.
- **Show the buddy** — master on/off switch.
- **Where it appears** — every website (default) or claude.ai only.
- **Opacity** and **reset position** (cat only — the hero is always fixed
  top-right, so this control hides itself when Web-Slinger is selected).
- **Usage** — a live breakdown of every bar claude.ai reports, plus a
  **Refresh now** button.

## Refreshing on demand

The popup, Settings, and clicking the cat itself (a plain click, not a drag)
all trigger an immediate refresh from claude.ai's usage API instead of
waiting for the next automatic 5-minute check — no claude.ai tab needs to be
open for this to work, since the fetch happens directly from the extension's
background worker using your session cookie. Hovering the cat shows the full
per-limit breakdown as a native browser tooltip.

## Known limitations (read before publishing)

- **Blocks publishing entirely, as of the Web-Slinger's current art** — see
  the warning near the top of this file. The two files under `assets/` are
  copyrighted/trademarked character art bundled for one user's personal,
  local, unpublished use only. This must be swapped out before any Chrome
  Web Store submission, public repo, or distribution of any kind.
- **Requires being logged into claude.ai in this browser.** The fetch rides
  on the existing claude.ai session cookie (`credentials: "include"`) — if
  you're logged out, the buddy shows "Log in to claude.ai to track usage"
  and retries automatically once you log in. No claude.ai tab needs to be
  open, though; the cookie is enough.
- **Depends on an internal, undocumented claude.ai API**, not a published
  one — Anthropic could change these endpoints' shape without notice, which
  would need a matching update here. This is a meaningfully more reliable
  signal than DOM/text scraping was, but it's still not an officially
  supported integration.
- **`<all_urls>` is a broad permission.** Showing the creature on every site
  (not just claude.ai) is what makes it feel "always on top of the browser,"
  but Chrome will show users a "read and change all your data on all
  websites" warning at install, and the Chrome Web Store review process
  scrutinizes this permission more heavily. If you'd rather ship without
  that warning, flip the default scope in `background.js`
  (`DEFAULT_SETTINGS.scope`) to `"claude-only"` — everything else keeps
  working, just scoped down.
- **Not fully un-closable.** A widget that can never be dismissed on any
  page a user visits is both a poor experience and something the Chrome Web
  Store review process is likely to push back on. Instead, minimizing
  shrinks it to a small dot rather than making it disappear — it's always
  present, just not always full-size.

## Before submitting to the Chrome Web Store

0. **Remove or replace both files under `assets/` first.** They're Marvel's
   Spider-Man, bundled only for personal, unpublished use — see the warning
   near the top of this file. This is a hard blocker, not a nice-to-have.
1. **Privacy policy.** Even though nothing leaves the device, the
   `<all_urls>` content-script permission and the `claude.ai` host permission
   (used to call claude.ai's own usage API with your session cookie) require
   a published privacy policy URL in the store listing. State plainly what
   the extension does: it calls claude.ai's own usage endpoints using your
   existing session to show your usage locally, and sends your data nowhere
   else.
2. **Screenshots/demo.** Use the popup's **Preview moods** button to capture
   all five states without needing to actually exhaust a real account's
   usage.
3. **Icons** in `icons/` were generated by `scripts/generate-icons.ps1`,
   which hand-draws the same "happy" cat as `shared/mascot.js` (ears, tail,
   whiskers, face) as a static PNG. Rerun it after any change to the mascot's
   colors or pixel grid — the two are not auto-synced, so a shape change in
   one needs a matching edit in the other, or replace the script with an
   SVG-to-PNG export if you'd rather not maintain two renderers. The
   toolbar icon always shows the cat regardless of the selected character —
   fine as a stable brand icon, but worth a deliberate call if you'd rather
   it reflect the user's choice.
4. Bump `version` in `manifest.json` on every published update.

## Possible follow-ups

- Firefox/Edge port (MV3 is largely compatible; would need a
  `browser_specific_settings` key and testing).
- More characters beyond Cat / Web-Slinger.
- Configurable auto-refresh interval (currently a fixed 5 minutes).
- Live countdown to each bar's reset time in the tooltip, instead of a
  static "in Xh" snapshot.
- A brief "landed" pose for the hero after falling instead of going fully
  invisible off-screen — currently he just disappears past the bottom of
  the viewport until usage drops back under 100%.
