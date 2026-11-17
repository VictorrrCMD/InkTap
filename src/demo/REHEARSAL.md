# Rehearsal: SigningDemo (home hero)

Gold: `device-pair`. Kept its layout: the window inset top and left and running off the foot, a phone straddling the window's right edge over the paper's margin, present from frame one. Changed: an animated story instead of a still, eSign's own look (desk-gray body, white paper, ballpoint blue, Schibsted Grotesk, Phosphor glyphs), the eSign phone page instead of a lock screen, and a compact design for the phone column (the contract scrolled to its signature line, a larger phone under it).

Beats: rest 1.0s, a finger draws the signature on the phone (3.2s, the ink tip under the finger by arc length), taps Enviar firma (label rolls to Enviada), the ink leaves the pad and flies to the contract's line (0.95s) while the panel's status changes to Firma recibida, payoff holds 2.2s, the contract slides to its next page and the button is ready again; loop about 11.5s. Poster: the payoff (signature on the line, Firma recibida, Enviada).

Captured (playground, `?capture=esign-demo`): wide loop at 720, the 390 loop (compact), dark loop, `--states`, the flight beat at about 60ms, the reduced-motion poster. In the app: home at 1440 light and dark, 1024 and 390.

Gate: `rehearsal passed` on the wide loop, the 390 loop, the dark loop and `--states`. Coverage reads `inconclusive` on this machine (sampling gaps over 11ms while headless Chrome films), so motion between samples was judged by eye at the flight beat instead.

Film lines that remain, judged against frames:
- `appears with no entrance` / `vanishes with no exit` on `div.ss-fly.esd-flyer` and `svg.esd-sig`: the Fly hand-off the kit prescribes. At take-off the pad's ink unmounts in the same set the flyer shows; on landing the paper's ink shows and the flyer unmounts in one set, same box. The 60ms sheet (`esd-fly.png`) shows no pop at either end.
- `handoff shift` on `span.ss-roll__item` (0.3px): the kit Button rolling Enviar firma to Enviada inside the phone's scale transform; sub-pixel, not visible at 1x.
- `manual: same-box content change` on `esd-sig` during `draw`: the ink drawing in place under the finger, watched in motion.

Review (fresh eye, 13 items) → response:
- Fixed: surfaces now step off both page grounds (window body #d5dce6 light / #1a2030 dark, phone screen #f1f4f8 / #1d2330); phone text uses the product font; the button's label crossfades in one cell (States) instead of rolling through a shrinking slot; the opening wait is 0.4s instead of 1s.
- Open, deliberately left for a later pass: the QR is still the heaviest mark and the side column takes a fifth of the stage (shrink to one "connected" row and widen the contract); some gray bars where real words would read better; the next page is an identical contract (title it differently); compact could be shorter (about 400) with the window off the foot; the stroke thickens about 15% on landing; the small lock glyph is an outline.

Assumptions: the page ground is the app's canvas (#e8ecf1 / #0e121b); the scene's foot fades into it on the page (mask from 86%), below the phone's button.

Unresolved: none known.

Not checked: real touch input on a device (playback only; the scene takes no input), Safari and Firefox playback, pausing when the tab is hidden beyond the kit's own handling.
