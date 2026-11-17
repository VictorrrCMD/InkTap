import { Bar, Button, Fly, Phone, Stage, States, Text, useLook, Window, type Act } from './kit'
import { Glyph } from './icons'
import { QR_PATH, QR_SIZE } from './qr'
import { SIG_H, SIG_PATH, SIG_W, sigPointAt } from './signature'
import './signing-demo.css'

// Home hero: a finger signs on the phone and the ink flies to the contract's
// line. The loop resets by moving to the next page, never by un-signing.

type S = {
  ink: number
  sent: boolean
  go: boolean
  landed: boolean
  received: boolean
  advance: boolean
}

const initial: S = { ink: 0, sent: false, go: false, landed: false, received: false, advance: false }
const POSTER: S = { ink: 1, sent: true, go: false, landed: true, received: true, advance: false }
const REST = { wide: { x: 640, y: 430 }, compact: { x: 300, y: 430 } }

const PARAGRAPHS = [
  [92, 86, 95, 64],
  [90, 94, 82, 88, 40],
]

// Where the stroke is at fraction u, in stage pixels: the pad's signature box
// is drawn at the stroke's own 300 x 112 proportions.
function padPoint(a: Act<S>, u: number) {
  const box = a.rect('pad-sig')
  const p = sigPointAt(u)
  return { x: box.x + (p.x / SIG_W) * box.width, y: box.y + (p.y / SIG_H) * box.height }
}

async function script(a: Act<S>) {
  await a.wait(400)
  a.mark('draw')
  await a.move(padPoint(a, 0))
  let drawn = 0
  await a.drag(padPoint(a, 1), () => a.put({ ink: drawn }), {
    duration: 3200,
    path: (e) => {
      drawn = e
      return padPoint(a, e)
    },
  })
  a.put({ ink: 1 })
  await a.wait(450)
  a.mark('send')
  await a.click('send')
  await a.set({ sent: true })
  await a.wait(300)
  // The ink itself leaves the pad: one object from phone to paper.
  a.mark('fly')
  await a.set({ go: true })
  await a.wait(980)
  // Landed: the paper's own ink shows and the flyer unmounts in one set.
  await a.set({ landed: true, received: true })
  a.mark('payoff')
  await a.wait(2200)
  a.mark('advance')
  await a.set({ advance: true, received: false, sent: false })
  await a.wait(1200)
  // The next page and the ready button now look exactly like the opening.
  await a.snap({ ...initial })
  await a.move(REST[a.layout])
  await a.wait(200)
}

function Signature({ progress = 1 }: { progress?: number }) {
  return (
    <svg className="esd-sig" viewBox={`0 0 ${SIG_W} ${SIG_H}`} aria-hidden>
      {/* Before the first stroke there is nothing, not even a round cap's dot. */}
      {progress > 0 ? <path d={SIG_PATH} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - progress} /> : null}
    </svg>
  )
}

function Page({ signed, arriving, live }: { signed: boolean; arriving: boolean; live: boolean }) {
  return (
    <div className="esd-page">
      <Text className="esd-page__title">Contrato de arrendamiento</Text>
      {PARAGRAPHS.map((widths, p) => (
        <div key={p} className="esd-page__para">
          {widths.map((w, i) => (
            <Bar key={i} w={`${w}%`} h={5} r={2} tone={2} />
          ))}
        </div>
      ))}
      <div className="esd-page__sign">
        <div className="esd-slot" data-hide={signed || arriving || undefined}>
          <span>Firmar aquí</span>
        </div>
        <div className="esd-page__ink" data-target={live ? 'doc-sig' : undefined} data-show={signed || undefined}>
          <Signature />
        </div>
        <div className="esd-page__rule" />
        <Bar w={64} h={4} r={2} tone={2} />
      </div>
      <div className="esd-page__para">
        {[88, 93, 76].map((w, i) => (
          <Bar key={i} w={`${w}%`} h={5} r={2} tone={2} />
        ))}
      </div>
    </div>
  )
}

// The phone's screen follows the stage's look: InkTap's dark page keeps a white
// pad, and the status bar turns light over it.
function PhoneScene({ s, width }: { s: S; width: number }) {
  const { theme } = useLook()
  const dark = theme === 'dark'
  return (
    <Phone width={width} frame="pro" dark={dark} wallpaper={dark ? '#1d2330' : '#f1f4f8'} className="esd-phone">
      <div className="esd-body">
        <div className="esd-body__head">
          <span className="esd-body__title">Firma aquí</span>
          <Bar w={120} h={9} r={4} tone={2} />
        </div>
        <div className="esd-pad">
          <span className="esd-pad__cross">×</span>
          <span className="esd-pad__line" />
          <div className="esd-pad__sig" data-target="pad-sig">
            {/* At take-off the pad's ink goes in the same set the flyer appears: one object. */}
            {s.go || s.landed ? null : <Signature progress={s.ink} />}
          </div>
        </div>
        <Button variant="primary" size="large" className="esd-send" data-target="send">
          <States value={s.sent ? 'sent' : 'send'} states={{ send: 'Enviar firma', sent: 'Enviada' }} />
        </Button>
        <span className="esd-body__note">
          <Glyph name="lock" size={16} />
          <Bar w={168} h={7} r={3} tone={2} />
        </span>
      </div>
    </Phone>
  )
}

export default function InkTapDemo({ theme = 'light' }: { theme?: 'light' | 'dark' }) {
  return (
    <Stage<S>
      width={720}
      height={500}
      compact={{ below: 560, width: 358, height: 520 }}
      initial={initial}
      poster={POSTER}
      script={script}
      cursor={{ at: REST, style: 'touch' }}
      theme={theme}
      className="esd"
    >
      {(s, rect, layout) => (
        <>
          <Window title="InkTap" className="esd-window">
            <div className="esd-app">
              <aside className="esd-side">
                {/* The three ways to sign, as the signature dialog lists them */}
                <div className="esd-methods">
                  <span className="esd-method">
                    <Glyph name="pencil" />
                    <Bar w={54} h={6} r={3} tone={3} />
                  </span>
                  <span className="esd-method">
                    <Glyph name="text" />
                    <Bar w={62} h={6} r={3} tone={3} />
                  </span>
                  <span className="esd-method" data-on>
                    <Glyph name="phone" />
                    Con el celular
                  </span>
                </div>
                <div className="esd-card">
                  <svg className="esd-qr" viewBox={`0 0 ${QR_SIZE} ${QR_SIZE}`} shapeRendering="crispEdges" aria-hidden>
                    <path d={QR_PATH} />
                  </svg>
                  <States
                    className="esd-status"
                    align="start"
                    value={s.received ? 'received' : 'connected'}
                    states={{
                      connected: <span className="esd-status__row">Celular conectado</span>,
                      received: (
                        <span className="esd-status__row esd-status__row--done">
                          <Glyph name="check" size={16} />
                          Firma recibida
                        </span>
                      ),
                    }}
                  />
                  <span className="esd-copy">
                    <Glyph name="copy" size={14} />
                    <Bar w={70} h={6} r={3} tone={3} />
                  </span>
                </div>
              </aside>
              {/* A deliberate crop: the contract is a scrolled page inside its window. */}
              <div className="esd-doc" data-crop>
                <div className="esd-pages" data-advance={s.advance || undefined} data-snap>
                  <Page signed={s.landed} arriving={s.go} live />
                  <Page signed={false} arriving={false} live={false} />
                </div>
              </div>
            </div>
          </Window>

          <PhoneScene s={s} width={layout === 'compact' ? 244 : 228} />

          {s.landed ? null : (
            <Fly from={rect('pad-sig')} to={rect('doc-sig')} go={s.go} duration={950} className="esd-flyer">
              <Signature />
            </Fly>
          )}
        </>
      )}
    </Stage>
  )
}
