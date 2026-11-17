import { ArrowsClockwise, Camera, DeviceMobile, ImageSquare } from '@phosphor-icons/react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { INK_COLORS, type Signature } from '../pdf/model'
import { extractInk, loadPhoto, NoSignatureFound, traceInk, type PhotoSource } from './photo'
import { SignatureArt } from './SignatureArt'

interface Props {
  photo: Blob | null
  fromPhone: boolean
  color: string
  phoneAllowed: boolean
  onPhoto: (photo: Blob | null, fromPhone?: boolean) => void
  onColor: (color: string) => void
  onResult: (signature: Signature | null) => void
  onUsePhone: () => void
  inkPicker: ReactNode
}

const touchOnly = () => !window.matchMedia('(any-pointer: fine)').matches
const canUseCamera = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

export function PhotoPanel({ photo, fromPhone, color, phoneAllowed, onPhoto, onColor, onResult, onUsePhone, inkPicker }: Props) {
  const pick = useRef<HTMLInputElement>(null)
  const shoot = useRef<HTMLInputElement>(null)
  const [camera, setCamera] = useState(false)
  const [source, setSource] = useState<PhotoSource | null>(null)
  const [sensitivity, setSensitivity] = useState(0.5)
  const [weight, setWeight] = useState(0)
  const [traced, setTraced] = useState<Signature | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'working' | 'empty' | 'bad-file'>('idle')
  const sensId = useId()
  const weightId = useId()

  // A new photo: decode it once, and start from the ink color it was signed in.
  useEffect(() => {
    if (!photo) {
      setSource(null)
      setTraced(null)
      setStatus('idle')
      return
    }
    let live = true
    setStatus('loading')
    setTraced(null)
    loadPhoto(photo)
      .then((src) => {
        if (!live) return
        setSensitivity(0.5)
        setWeight(0)
        setSource(src)
      })
      .catch(() => live && setStatus('bad-file'))
    return () => {
      live = false
    }
  }, [photo])

  // Re-trace when the cleanup or the weight changes; color is applied on top.
  useEffect(() => {
    if (!source) return
    let live = true
    setStatus('working')
    const timer = window.setTimeout(async () => {
      try {
        const ink = extractInk(source, { sensitivity, weight })
        const signature = await traceInk(ink, color)
        if (!live) return
        if (!traced) onColor(ink.inkColor === 'blue' ? INK_COLORS.blue : INK_COLORS.black)
        setTraced(signature)
        setStatus('idle')
      } catch (error) {
        if (!live) return
        setTraced(null)
        setStatus(error instanceof NoSignatureFound ? 'empty' : 'bad-file')
      }
    }, 120)
    return () => {
      live = false
      window.clearTimeout(timer)
    }
    // `traced` and `color` don't change the tracing itself.
  }, [source, sensitivity, weight])

  useEffect(() => {
    onResult(traced ? { ...traced, color } : null)
  }, [traced, color, onResult])

  const fileInputs = (
    <>
      <input
        ref={pick}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onPhoto(file)
        }}
      />
      <input
        ref={shoot}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) onPhoto(file)
        }}
      />
    </>
  )

  if (camera) {
    return (
      <CameraView
        onCancel={() => setCamera(false)}
        onShot={(blob) => {
          setCamera(false)
          onPhoto(blob)
        }}
      />
    )
  }

  if (!photo) {
    return (
      <div className="photo-start">
        {fileInputs}
        <p className="photo-start__lead">Firma en una hoja blanca y súbela en foto: quitamos el fondo y la convertimos en trazos que puedes ajustar.</p>
        <div className="photo-start__options">
          <button type="button" className="photo-option" onClick={() => pick.current?.click()}>
            <ImageSquare size={24} aria-hidden />
            <span className="photo-option__title">Elegir foto</span>
            <span className="photo-option__hint">De tus archivos o galería</span>
          </button>
          <button
            type="button"
            className="photo-option"
            onClick={() => (touchOnly() || !canUseCamera() ? shoot.current?.click() : setCamera(true))}
          >
            <Camera size={24} aria-hidden />
            <span className="photo-option__title">Tomar foto</span>
            <span className="photo-option__hint">{touchOnly() ? 'Con la cámara del celular' : 'Con la cámara de esta computadora'}</span>
          </button>
          {phoneAllowed ? (
            <button type="button" className="photo-option" onClick={onUsePhone}>
              <DeviceMobile size={24} aria-hidden />
              <span className="photo-option__title">Desde el celular</span>
              <span className="photo-option__hint">Escanea un código o comparte el enlace</span>
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="photo-edit">
      {fileInputs}
      <div className="photo-edit__paper" aria-live="polite">
        {status === 'loading' || (status === 'working' && !traced) ? (
          <p className="photo-edit__state">
            <span className="spinner" aria-hidden />
            Quitando el fondo
          </p>
        ) : null}
        {status === 'empty' ? <p className="photo-edit__state photo-edit__state--bad">No encontramos una firma. Sube la sensibilidad o usa una foto con más luz sobre papel blanco.</p> : null}
        {status === 'bad-file' ? <p className="photo-edit__state photo-edit__state--bad">No pudimos leer esa imagen. Prueba con una foto JPG o PNG.</p> : null}
        {traced && status !== 'empty' && status !== 'bad-file' ? <SignatureArt signature={{ ...traced, color }} className="photo-edit__art" /> : null}
      </div>
      {fromPhone ? <p className="photo-edit__note">Foto recibida desde el celular.</p> : null}

      <div className="photo-edit__controls">
        <div className="slider">
          <label htmlFor={sensId} className="slider__label">
            Sensibilidad
          </label>
          <input id={sensId} type="range" min={0} max={1} step={0.05} value={sensitivity} onChange={(e) => setSensitivity(Number(e.target.value))} aria-describedby={`${sensId}-hint`} />
          <span id={`${sensId}-hint`} className="slider__hint">
            Sube si faltan trazos; baja si aparecen manchas.
          </span>
        </div>
        <div className="slider">
          <label htmlFor={weightId} className="slider__label">
            Grosor
          </label>
          <input id={weightId} type="range" min={-2} max={3} step={1} value={weight} onChange={(e) => setWeight(Number(e.target.value))} aria-valuetext={weight === 0 ? 'Original' : weight > 0 ? `Más gruesa, ${weight}` : `Más delgada, ${-weight}`} />
          <span className="slider__hint">{weight === 0 ? 'Original' : weight > 0 ? 'Más gruesa' : 'Más delgada'}</span>
        </div>
      </div>

      <div className="sign__row">
        {inkPicker}
        <button type="button" className="btn btn-quiet" onClick={() => onPhoto(null)}>
          <ArrowsClockwise size={18} aria-hidden />
          Cambiar foto
        </button>
      </div>
    </div>
  )
}

function CameraView({ onShot, onCancel }: { onShot: (blob: Blob) => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let stream: MediaStream | null = null
    let live = true
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((s) => {
        if (!live) return s.getTracks().forEach((t) => t.stop())
        stream = s
        if (video.current) video.current.srcObject = s
      })
      .catch(() => live && setError('No pudimos usar la cámara. Revisa el permiso del navegador o elige una foto.'))
    return () => {
      live = false
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const capture = () => {
    const el = video.current
    if (!el || !el.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = el.videoWidth
    canvas.height = el.videoHeight
    canvas.getContext('2d')!.drawImage(el, 0, 0)
    canvas.toBlob((blob) => blob && onShot(blob), 'image/jpeg', 0.92)
  }

  return (
    <div className="camera">
      {error ? (
        <p className="photo-edit__state photo-edit__state--bad" role="alert">
          {error}
        </p>
      ) : (
        <video ref={video} className="camera__video" autoPlay playsInline muted aria-label="Vista de la cámara" />
      )}
      <p className="camera__hint">Pon la hoja firmada frente a la cámara, con buena luz.</p>
      <div className="sign__row">
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" className="btn btn-primary" onClick={capture} disabled={!!error}>
          <Camera size={18} aria-hidden />
          Tomar foto
        </button>
      </div>
    </div>
  )
}
