/**
 * Verlet whip simulation behind the overlay, ported from the reference
 * "真实物理鞭子" demos: a rigid handle with an animated angle drives a
 * charge → strike_forward → strike_back state machine, and a Verlet rope
 * (low damping, many constraint iterations) carries the snap-back wave to the
 * tip. Pure math and state: the React component owns the rAF loop and the
 * canvas; this module owns points, integration, constraints, the handle angle,
 * and the strike state machine. No React, no DOM.
 */

/** One whip point (position + Verlet velocity memory via the previous frame). */
export interface WhipPoint {
  /** Current x. */
  x: number
  /** Current y. */
  y: number
  /** Previous-frame x. */
  px: number
  /** Previous-frame y. */
  py: number
}

/** Strike-phase state machine positions. */
export type WhipPhase = 'idle' | 'charge' | 'strike_forward' | 'strike_back'

/** Construction knobs; defaults mirror the reference whip (30 x 8px segments). */
export interface WhipOptions {
  /** Number of rope segments. */
  points?: number
  /** Rest length of one segment, in pixels. */
  segmentLength?: number
  /** Rigid handle length, in pixels (lever arm). */
  handleLength?: number
  /** Per-frame velocity retention (1 = no air resistance). */
  damping?: number
  /** Distance-constraint iterations per step (rope stiffness). */
  iterations?: number
  /** Gravity added per rop point per step (expressed at 60 fps). */
  gravity?: number
  /** Rest handle angle in degrees (0 = +x, clockwise on screen). */
  idleAngle?: number
  /** Extra rearward handle lean at full charge, in degrees. */
  chargeLean?: number
  /** Forward swing past idle at rest strike, in degrees. */
  strikeSwing?: number
  /** Extra forward swing per unit of strike force, in degrees. */
  strikeForceSwing?: number
}

/** Settled one-shot crack bookkeeping for the renderer + test. */
export interface WhipCrack {
  /** Force (0..1) captured at release. */
  force: number
}

/**
 * The whip. `targetX/targetY` is the grip (the cursor); `rope()[0]` is the
 * handle tip, driven by the animated `currentAngle`. A `charge()` leans the
 * handle back; `release()` whips it forward fast, then snaps it back — the
 * snap-back is what throws the wave down the rope. `struck` latches once when
 * the backward yank begins (the moment to fire audio/message).
 */
export class WhipSimulation {
  private readonly points: WhipPoint[]
  private readonly segmentLength: number
  private readonly handleLength: number
  private readonly damping: number
  private readonly iterations: number
  private readonly gravity: number
  private readonly idleAngle: number
  private readonly chargeLean: number
  private readonly strikeSwing: number
  private readonly strikeForceSwing: number

  /** Grip position x (the cursor). */
  targetX = 0
  /** Grip position y (the cursor). */
  targetY = 0
  /** Animated handle angle in degrees (0 = +x, clockwise on screen). */
  currentAngle: number
  /** Live strike phase. */
  phase: WhipPhase = 'idle'
  /** Charge 0..1 while holding (and the force snapshot once released). */
  chargeLevel = 0
  /** One-shot latch: true for a single read after the snap-back yank begins. */
  struck = false

  private targetAngle: number
  private strikeForce = 0

  /**
   * @param options - optional tuning; the defaults mirror the reference whip.
   */
  constructor(options: WhipOptions = {}) {
    const count = options.points ?? 30
    this.segmentLength = options.segmentLength ?? 8
    this.handleLength = options.handleLength ?? 60
    this.damping = options.damping ?? 0.98
    this.iterations = options.iterations ?? 15
    this.gravity = options.gravity ?? 0.5
    this.idleAngle = options.idleAngle ?? 225
    this.chargeLean = options.chargeLean ?? 80
    this.strikeSwing = options.strikeSwing ?? 90
    this.strikeForceSwing = options.strikeForceSwing ?? 60
    this.currentAngle = this.idleAngle
    this.targetAngle = this.idleAngle
    this.points = []
    for (let i = 0; i < count; i += 1) {
      this.points.push({ x: 0, y: 0, px: 0, py: 0 })
    }
  }

  /** Read-only rope points for rendering (`[0]` is the handle tip). */
  rope(): readonly WhipPoint[] {
    return this.points
  }

  /**
   * Read one rope point. The array is fully populated at construction and
   * never resized, so every in-bounds index resolves; the assertion satisfies
   * `noUncheckedIndexedAccess`.
   */
  private at(i: number): WhipPoint {
    return this.points[i]!
  }

  /**
   * Snap the whip to a start position: the handle tip and rope hang straight
   * down from the grip, with everything at rest.
   * @param x - grip x.
   * @param y - grip y.
   */
  seed(x: number, y: number): void {
    this.targetX = x
    this.targetY = y
    this.currentAngle = this.idleAngle
    this.targetAngle = this.idleAngle
    this.phase = 'idle'
    this.chargeLevel = 0
    this.strikeForce = 0
    this.struck = false
    const rad = this.currentAngle * Math.PI / 180
    const tipX = x + Math.cos(rad) * this.handleLength
    const tipY = y + Math.sin(rad) * this.handleLength
    for (let i = 0; i < this.points.length; i += 1) {
      const p = this.at(i)
      p.x = tipX
      p.y = tipY + i * this.segmentLength
      p.px = p.x
      p.py = p.y
    }
  }

  /** Begin charging (pointer held down over the transcript). */
  charge(): void {
    if (this.phase !== 'idle') return
    this.phase = 'charge'
    this.chargeLevel = 0
  }

  /** Release: whip forward with the accumulated force, then snap back. */
  release(): void {
    if (this.phase !== 'charge') return
    this.strikeForce = this.chargeLevel
    this.chargeLevel = 0
    this.phase = 'strike_forward'
  }

  /**
   * Advance the simulation one frame.
   * @param dt - frame delta in seconds (frame-rate normalization applied).
   */
  step(dt: number): void {
    // Frame-rate normalization: the reference updates once per rAF frame.
    const frameScale = Math.max(dt, 1e-3) * 60

    if (this.phase === 'charge') {
      this.chargeLevel = Math.min(1, this.chargeLevel + 0.03 * frameScale)
      this.targetAngle = this.idleAngle + this.chargeLevel * this.chargeLean
      this.currentAngle += (this.targetAngle - this.currentAngle) * 0.15
    } else if (this.phase === 'strike_forward') {
      this.targetAngle = this.idleAngle - this.strikeSwing - this.strikeForce * this.strikeForceSwing
      this.currentAngle += (this.targetAngle - this.currentAngle) * 0.6
      if (Math.abs(this.currentAngle - this.targetAngle) < 15) {
        this.phase = 'strike_back'
        this.struck = true
      }
    } else if (this.phase === 'strike_back') {
      this.targetAngle = this.idleAngle
      this.currentAngle += (this.targetAngle - this.currentAngle) * 0.5
      if (Math.abs(this.currentAngle - this.targetAngle) < 2) {
        this.phase = 'idle'
        this.strikeForce = 0
      }
    } else {
      this.targetAngle = this.idleAngle
      this.currentAngle += (this.targetAngle - this.currentAngle) * 0.1
    }

    // Handle tip from the animated angle.
    const rad = this.currentAngle * Math.PI / 180
    const tipX = this.targetX + Math.cos(rad) * this.handleLength
    const tipY = this.targetY + Math.sin(rad) * this.handleLength

    // The tip is pinned; every following point integrates with low damping.
    const head = this.at(0)
    head.x = tipX
    head.y = tipY
    head.px = tipX
    head.py = tipY

    for (let i = 1; i < this.points.length; i += 1) {
      const p = this.at(i)
      const vx = (p.x - p.px) * this.damping
      const vy = (p.y - p.py) * this.damping
      p.px = p.x
      p.py = p.y
      p.x += vx
      p.y += vy + this.gravity * frameScale
    }

    // Distance constraints, keeping the tip anchored (index 0).
    for (let iter = 0; iter < this.iterations; iter += 1) {
      for (let i = 0; i < this.points.length - 1; i += 1) {
        const a = this.at(i)
        const b = this.at(i + 1)
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.hypot(dx, dy)
        if (dist === 0) continue
        const diff = this.segmentLength - dist
        const percent = diff / dist / 2
        const ox = dx * percent
        const oy = dy * percent
        if (i !== 0) {
          a.x -= ox
          a.y -= oy
        }
        b.x += ox
        b.y += oy
      }
    }
    head.x = tipX
    head.y = tipY
    head.px = tipX
    head.py = tipY
  }
}
