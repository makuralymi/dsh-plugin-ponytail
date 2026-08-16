/**
 * Ponytail whip dock: a composer-dock toggle plus (while armed) a full-viewport
 * canvas overlay drawing a cursor-following whip. Physics and look are ported
 * from the reference "真实物理鞭子" demo — hold the pointer over the
 * transcript to charge (the handle leans back), release to whip forward and
 * snap back, and the snap-back wave travels to the tip. On the snap-back the
 * crack audio plays, sparks spawn, the DeepSeek Pet is notified, and a
 * hurry-up message is sent through the session input machine. Pure easter egg:
 * all state is component-local, the overlay is a body portal, and no cordis
 * service exists.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { playCrack } from './crack.ts'
import { triggerPetWhip } from './pet.ts'
import { WhipSimulation } from './whipPhysics.ts'
import css from './WhipDock.module.css'

/** Slot inject face supplied by the plugin apply (settings-backed send policy). */
export interface WhipDockInjected {
  /**
   * Pick the next hurry-up line. Returns '' when the user disabled/deleted
   * every prompt — the crack still plays, but nothing is sent to the model.
   */
  pickPrompt: (previous: string | undefined) => string
  /**
   * Whether the user enabled "cancel the running turn before sending"
   * (read at crack time, so settings edits apply without re-registration).
   */
  shouldInterrupt: () => boolean
  /**
   * Cancel the addressed session's in-flight turn. Resolves even when there
   * is nothing to cancel, so callers can always proceed to submit.
   */
  cancelTurn: () => Promise<void>
}

/** Full dock-entry props: owner share + session kit + the registrant inject face. */
export type WhipDockProps = PropsRuntime<'conversation.composer.dock'> & WhipDockInjected

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

/**
 * Spawn sparks at the tip, play the crack, notify the DeepSeek Pet, and send
 * the next hurry-up line.
 * @param sim - live simulation (tip position source).
 * @param sparks - in-place spark pool.
 * @param now - frame timestamp for spark birth.
 * @param inputActions - session input write path (setDraft + submit).
 * @param lastHurryRef - rotation memory (never repeats the previous line).
 * @param pickPrompt - settings-backed prompt picker; '' skips sending.
 * @param shouldInterrupt - cancel-before-send switch, read at crack time.
 * @param cancelTurn - session turn cancellation; failures fall back to queueing.
 */
function fireCrack(
  sim: WhipSimulation,
  sparks: Spark[],
  now: number,
  inputActions: WhipDockProps['inputActions'],
  lastHurryRef: { current: string | undefined },
  pickPrompt: WhipDockInjected['pickPrompt'],
  shouldInterrupt: WhipDockInjected['shouldInterrupt'],
  cancelTurn: WhipDockInjected['cancelTurn'],
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
  const line = pickPrompt(lastHurryRef.current)
  // Empty pool = the user turned every prompt off: keep the crack visual/audio
  // effect but send nothing instead of resurrecting the built-in lines.
  if (line === '') return
  lastHurryRef.current = line
  inputActions.setDraft(line)
  if (!shouldInterrupt()) {
    // Default: the message rides the normal busy-Enter policy (queued behind
    // the running turn).
    inputActions.submit()
    return
  }
  // Interrupt mode: stop the in-flight turn first, then submit so the hurry
  // prompt starts immediately instead of joining the queue. Re-apply the draft
  // right before submit so typing during the (short) cancellation wait cannot
  // replace the hurry line. A cancellation failure (idle session, missing
  // service, transport race) still submits — the ordinary busy policy then
  // decides between direct send and queue.
  void cancelTurn().catch(() => {}).finally(() => {
    inputActions.setDraft(line)
    inputActions.submit()
  })
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

/** Render one frame of the whip onto the overlay canvas (reference-style). */
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
  if (head === undefined) return
  const gripX = sim.targetX
  const gripY = sim.targetY

  // Grip crosshair dot.
  ctx.beginPath()
  ctx.arc(gripX, gripY, 4, 0, Math.PI * 2)
  ctx.fillStyle = '#333'
  ctx.fill()

  // Charge ring.
  if (sim.chargeLevel > 0) {
    ctx.beginPath()
    ctx.arc(gripX, gripY, 20, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sim.chargeLevel)
    ctx.strokeStyle = 'rgba(0, 0, 0, ' + String(sim.chargeLevel) + ')'
    ctx.lineWidth = 2
    ctx.stroke()
  }

  // Rigid wood handle: from the grip to the handle tip (rope[0]).
  ctx.beginPath()
  ctx.moveTo(gripX, gripY)
  ctx.lineTo(head.x, head.y)
  ctx.strokeStyle = '#5a3d2b'
  ctx.lineCap = 'round'
  ctx.lineWidth = 7
  ctx.stroke()

  // Dark leather whip body: tapers from root to tail.
  ctx.strokeStyle = '#222'
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  for (let i = 0; i < n - 1; i += 1) {
    const a = rope[i]!
    const b = rope[i + 1]!
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.lineWidth = Math.max(1, 6 * (1 - i / n))
    ctx.stroke()
  }

  drawSparks(ctx, sparks, now)
}

interface WhipOverlayProps {
  inputActions: WhipDockProps['inputActions']
  pickPrompt: WhipDockInjected['pickPrompt']
  shouldInterrupt: WhipDockInjected['shouldInterrupt']
  cancelTurn: WhipDockInjected['cancelTurn']
  onDisarm: () => void
}

/**
 * Body-portal overlay: binds the global pointer/keyboard listeners, runs the
 * rAF loop, and owns the cursor: none swap for the armed lifetime. Holding the
 * pointer over the transcript charges the whip; releasing strikes it.
 */
function WhipOverlay({ inputActions, pickPrompt, shouldInterrupt, cancelTurn, onDisarm }: WhipOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const lastHurryRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    const previousCursor = document.body.style.cursor
    document.body.style.cursor = 'none'

    const sim = new WhipSimulation()
    sim.seed(window.innerWidth / 2, window.innerHeight / 2)
    const sparks: Spark[] = []
    let struckConsumed = false

    const onMove = (event: PointerEvent): void => {
      sim.targetX = event.clientX
      sim.targetY = event.clientY
    }

    const onDown = (event: PointerEvent): void => {
      if (event.button !== 0) return
      if (!isTranscriptTarget(event.target)) return
      sim.targetX = event.clientX
      sim.targetY = event.clientY
      sim.charge()
    }

    const onUp = (): void => {
      if (sim.phase !== 'charge') return
      struckConsumed = false
      sim.release()
    }

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onDisarm()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKey)

    let raf = 0
    let last = performance.now()
    const frame = (now: number): void => {
      const dt = (now - last) / 1000
      last = now
      sim.step(dt)
      if (sim.struck && !struckConsumed) {
        struckConsumed = true
        fireCrack(sim, sparks, now, inputActions, lastHurryRef, pickPrompt, shouldInterrupt, cancelTurn)
      }
      draw(canvasRef.current, sim, sparks, now)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKey)
      document.body.style.cursor = previousCursor
    }
  }, [inputActions, pickPrompt, shouldInterrupt, cancelTurn, onDisarm])

  return createPortal(
    <canvas ref={canvasRef} className={css.overlay} aria-hidden="true" />,
    document.body,
  )
}

/** The dock toggle: a small pill that arms/disarms the whip. */
export function WhipDock(props: WhipDockProps) {
  const { inputActions, pickPrompt, shouldInterrupt, cancelTurn } = props
  const [armed, setArmed] = useState(false)
  const toggle = useCallback(() => { setArmed(prev => !prev) }, [])

  return (
    <div className={css.dock} data-ponytail-dock>
      <button
        type="button"
        className={armed ? css.buttonArmed : css.button}
        data-ponytail-toggle
        aria-pressed={armed}
        title={armed ? '鞭子已就绪：按住对话区蓄力，松开抽鞭催促；再次点击取消' : '鞭子模式：把鼠标变成鞭子，按住对话区蓄力、松开抽鞭催促模型'}
        onClick={toggle}
      >
        <span aria-hidden="true">🪢</span>
        <span>{armed ? '鞭子就绪' : '鞭子'}</span>
      </button>
      {armed && (
        <WhipOverlay
          inputActions={inputActions}
          pickPrompt={pickPrompt}
          shouldInterrupt={shouldInterrupt}
          cancelTurn={cancelTurn}
          onDisarm={toggle}
        />
      )}
    </div>
  )
}
