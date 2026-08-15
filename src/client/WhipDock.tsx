/**
 * Ponytail whip dock: a composer-dock toggle plus (while armed) a full-viewport
 * canvas overlay drawing a cursor-following rope whip. Clicking the
 * conversation transcript cracks the whip — the flick wave travels to the tip,
 * a synthesized crack plays, sparks spawn, a hurry-up message is sent
 * through the session input machine, and the DeepSeek Pet is notified via the
 * `deepseek-pet:whip` event. Pure easter egg: all state is
 * component-local, the overlay is a body portal, and no cordis service exists.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { nextHurry } from './hurry.ts'
import { playCrack } from './crack.ts'
import { triggerPetWhip } from './pet.ts'
import { WhipSimulation } from './whipPhysics.ts'
import css from './WhipDock.module.css'

/** Full dock-entry props: InputZone owner share plus the session standard kit. */
export type WhipDockProps = PropsRuntime<'conversation.composer.dock'>

/** Tip speed (px/s) above which a pending crack counts as snapped. */
const CRACK_SPEED = 320
/** Safety window (ms): a flick that never snaps the tip fires anyway. */
const CRACK_DEADLINE_MS = 450
/** Fixed handle direction in radians: 135° counter-clockwise from +x (up-left, second quadrant) on the screen plane. */
const HANDLE_ANGLE = -(Math.PI * 3) / 4

/** One crack spark: position, velocity, and a fade lifetime. */
interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  bornAt: number
  ttl: number
}

/** True when the pointer landed in the transcript (scrollport, not the composer seat). */
function isTranscriptTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target.closest('[data-conversation-scroll]') === null) return false
  return target.closest('[data-composer-seat]') === null
}

/** Interpolate the tail stroke colour from handle brown to tip tan. */
function whipColor(t: number): string {
  const r = Math.round(0x6b + (0xd8 - 0x6b) * t)
  const g = Math.round(0x44 + (0xb0 - 0x44) * t)
  const b = Math.round(0x23 + (0x7a - 0x23) * t)
  return `rgb(${r}, ${g}, ${b})`
}

/**
 * Spawn sparks at the tip, play the crack, notify the DeepSeek Pet, and send
 * the next hurry-up line.
 * @param sim - live simulation (tip position source).
 * @param sparks - in-place spark pool.
 * @param now - frame timestamp for spark birth.
 * @param inputActions - session input write path (setDraft + submit).
 * @param lastHurryRef - rotation memory (never repeats the previous line).
 */
function fireCrack(
  sim: WhipSimulation,
  sparks: Spark[],
  now: number,
  inputActions: WhipDockProps['inputActions'],
  lastHurryRef: { current: string | undefined },
): void {
  const rope = sim.rope()
  const tip = rope[rope.length - 1]
  if (tip === undefined) return
  for (let i = 0; i < 18; i += 1) {
    const angle = Math.random() * Math.PI * 2
    const speed = 120 + Math.random() * 260
    sparks.push({
      x: tip.x,
      y: tip.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      bornAt: now,
      ttl: 220 + Math.random() * 180,
    })
  }
  playCrack()
  triggerPetWhip()
  const line = nextHurry(lastHurryRef.current)
  lastHurryRef.current = line
  inputActions.setDraft(line)
  inputActions.submit()
}

/** Draw sparks, dropping expired ones (mutates the pool in place). */
function drawSparks(ctx: CanvasRenderingContext2D, sparks: Spark[], now: number): void {
  if (sparks.length === 0) return
  for (let i = sparks.length - 1; i >= 0; i -= 1) {
    const s = sparks[i]
    if (s === undefined) continue
    const age = now - s.bornAt
    if (age > s.ttl) {
      sparks.splice(i, 1)
      continue
    }
    const t = age / s.ttl
    ctx.globalAlpha = 1 - t
    ctx.fillStyle = '#ffd98a'
    ctx.beginPath()
    ctx.arc(s.x + (s.vx * age) / 1000, s.y + (s.vy * age) / 1000, 1.6, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

/** Render one frame of the whip onto the overlay canvas. */
function draw(canvas: HTMLCanvasElement | null, sim: WhipSimulation, sparks: Spark[], now: number): void {
  if (canvas === null) return
  const dpr = window.devicePixelRatio || 1
  const w = window.innerWidth
  const h = window.innerHeight
  const pw = Math.round(w * dpr)
  const ph = Math.round(h * dpr)
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw
    canvas.height = ph
  }
  const ctx = canvas.getContext('2d')
  if (ctx === null) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const rope = sim.rope()
  const n = rope.length
  const head = rope[0]
  const tip = rope[n - 1]
  if (head === undefined || tip === undefined) return

  const handleEnd = sim.handlePoints - 1

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // Handle: a rigid dark rod from the cursor (thick, stiff root).
  const handleTip = rope[handleEnd]
  if (handleTip !== undefined) {
    ctx.strokeStyle = '#3a2412'
    ctx.lineWidth = 8
    ctx.beginPath()
    ctx.moveTo(head.x, head.y)
    ctx.lineTo(handleTip.x, handleTip.y)
    ctx.stroke()
  }

  // Body: tapering from the handle end (thick) to the tip (thin).
  for (let i = sim.handlePoints; i < n; i += 1) {
    const a = rope[i - 1]!
    const b = rope[i]!
    const t = (i - sim.handlePoints) / (n - sim.handlePoints)
    ctx.strokeStyle = whipColor(t)
    ctx.lineWidth = 5 * (1 - t) + 1.2
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }

  // Grip knob at the cursor (where the hand holds the handle).
  ctx.fillStyle = '#2b1a0d'
  ctx.beginPath()
  ctx.arc(head.x, head.y, 5, 0, Math.PI * 2)
  ctx.fill()

  // Cracker tip knot.
  ctx.fillStyle = '#e8c39a'
  ctx.beginPath()
  ctx.arc(tip.x, tip.y, 3, 0, Math.PI * 2)
  ctx.fill()

  drawSparks(ctx, sparks, now)
}

interface WhipOverlayProps {
  inputActions: WhipDockProps['inputActions']
  onDisarm: () => void
}

/**
 * Body-portal overlay: binds the global pointer/keyboard listeners, runs the
 * rAF loop, and owns the cursor: none swap for the armed lifetime.
 */
function WhipOverlay({ inputActions, onDisarm }: WhipOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const lastHurryRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    const previousCursor = document.body.style.cursor
    document.body.style.cursor = 'none'

    const sim = new WhipSimulation({ handleAngle: HANDLE_ANGLE })
    sim.seed(window.innerWidth / 2, window.innerHeight / 2)
    const sparks: Spark[] = []
    let pendingCrack = false
    let pendingDeadline = 0

    const onMove = (event: PointerEvent): void => {
      sim.targetX = event.clientX
      sim.targetY = event.clientY
    }

    const onDown = (event: PointerEvent): void => {
      if (event.button !== 0) return
      if (!isTranscriptTarget(event.target)) return
      sim.targetX = event.clientX
      sim.targetY = event.clientY
      sim.crackAt(event.clientX, event.clientY)
      pendingCrack = true
      pendingDeadline = performance.now() + CRACK_DEADLINE_MS
    }

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onDisarm()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)

    let raf = 0
    let last = performance.now()
    const frame = (now: number): void => {
      const dt = (now - last) / 1000
      last = now
      sim.step(dt)
      if (pendingCrack && (sim.tipSpeed > CRACK_SPEED || now > pendingDeadline)) {
        pendingCrack = false
        fireCrack(sim, sparks, now, inputActions, lastHurryRef)
      }
      draw(canvasRef.current, sim, sparks, now)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
      document.body.style.cursor = previousCursor
    }
  }, [inputActions, onDisarm])

  return createPortal(
    <canvas ref={canvasRef} className={css.overlay} aria-hidden="true" />,
    document.body,
  )
}

/** The dock toggle: a small pill that arms/disarms the whip. */
export function WhipDock(props: WhipDockProps) {
  const { inputActions } = props
  const [armed, setArmed] = useState(false)
  const toggle = useCallback(() => { setArmed(prev => !prev) }, [])

  return (
    <div className={css.dock} data-ponytail-dock>
      <button
        type="button"
        className={armed ? css.buttonArmed : css.button}
        data-ponytail-toggle
        aria-pressed={armed}
        title={armed ? '鞭子已就绪：点击对话区抽鞭催促；再次点击取消' : '鞭子模式：把鼠标变成鞭子，点击对话区抽鞭催促模型'}
        onClick={toggle}
      >
        <span aria-hidden="true">🪢</span>
        <span>{armed ? '鞭子就绪' : '鞭子'}</span>
      </button>
      {armed && <WhipOverlay inputActions={inputActions} onDisarm={toggle} />}
    </div>
  )
}
