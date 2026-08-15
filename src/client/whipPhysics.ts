/**
 * Verlet whip simulation behind the overlay. Pure math and state: the React
 * component owns the rAF loop and the canvas; this module owns points,
 * integration (with gravity), distance constraints, a rigid-handle/bending
 * pass that keeps the root a stiff rod and the tip soft, and the crack flick.
 * No React, no DOM — the unit test exercises it in isolation.
 */

/** One whip point (position + verlet velocity memory). */
export interface WhipPoint {
  /** Current x. */
  x: number
  /** Current y. */
  y: number
  /** Previous-frame x (verlet velocity memory). */
  px: number
  /** Previous-frame y (verlet velocity memory). */
  py: number
}

/** Live bookkeeping for one crack flick. */
export interface WhipCrack {
  /** Seconds remaining in the flick phase. */
  remaining: number
  /** Total flick duration in seconds. */
  duration: number
  /** Flick direction, unit vector (x). */
  dirX: number
  /** Flick direction, unit vector (y). */
  dirY: number
}

/** Construction knobs; every field has a tuned default for a 22-point whip. */
export interface WhipOptions {
  /** Number of whip points (handle points plus body/tail). */
  points?: number
  /** Rest length of one segment, in pixels. */
  segmentLength?: number
  /** Number of points forming the rigid handle (including the head). */
  handlePoints?: number
  /** Per-frame velocity retention (1 = no damping). */
  damping?: number
  /** Distance-constraint solve iterations per step. */
  iterations?: number
  /** Body bending resistance (0 = limp, 1 = rigid), at the body root. */
  stiffness?: number
  /** How much the tip softens relative to the body root (0..1). */
  tipFlex?: number
  /** Downward gravity in pixels per second squared (tail droop). */
  gravity?: number
  /** Crack flick amplitude, in pixels. */
  flickAmplitude?: number
  /** Crack flick duration, in seconds. */
  flickDuration?: number
  /**
   * Fixed handle angle in radians, measured like a canvas rotation (0 = +x,
   * increasing clockwise toward +y because screen y grows downward). The
   * handle always lays along this direction regardless of pointer motion;
   * the default has no fixed angle (follows the head-to-body axis).
   */
  handleAngle?: number
}

/**
 * The whip: a pinned head chases a target, the handle stays a rigid rod, the
 * body softens toward the tip (thick-and-stiff root, thin-and-soft tail), and
 * gravity droops the tail. A crack is a single fast head flick whose wave
 * travels to the tip; the caller reads {@link tipSpeed} to decide when it
 * fires.
 */
export class WhipSimulation {
  private readonly points: WhipPoint[]
  private readonly segmentLength: number
  private readonly damping: number
  private readonly iterations: number
  private readonly stiffness: number
  private readonly tipFlex: number
  private readonly gravity: number
  private readonly flickAmplitude: number
  private readonly flickDuration: number

  /** Number of points in the rigid handle (including the head). */
  readonly handlePoints: number
  /** Fixed handle angle in radians (screen coords), or undefined to follow motion. */
  readonly handleAngle: number | undefined

  /** Mouse target the head chases. */
  targetX = 0
  /** Mouse target the head chases. */
  targetY = 0
  /** Live crack, or undefined while idle. */
  crack: WhipCrack | undefined
  /** Smoothed tip speed, in pixels per second. */
  tipSpeed = 0

  /**
   * @param options - optional tuning; defaults target the dock overlay's whip.
   */
  constructor(options: WhipOptions = {}) {
    const count = options.points ?? 22
    this.handlePoints = options.handlePoints ?? 5
    this.segmentLength = options.segmentLength ?? 9
    this.damping = options.damping ?? 0.85
    this.iterations = options.iterations ?? 3
    this.stiffness = options.stiffness ?? 0.7
    this.tipFlex = options.tipFlex ?? 0.9
    this.gravity = options.gravity ?? 700
    this.flickAmplitude = options.flickAmplitude ?? 46
    this.flickDuration = options.flickDuration ?? 0.15
    this.handleAngle = options.handleAngle
    this.points = []
    for (let i = 0; i < count; i += 1) {
      this.points.push({ x: 0, y: 0, px: 0, py: 0 })
    }
  }

  /** Read-only whip points for rendering. */
  rope(): readonly WhipPoint[] {
    return this.points
  }

  /**
   * Read one whip point. The array is fully populated at construction and
   * never resized, so every in-bounds index resolves; the assertion satisfies
   * `noUncheckedIndexedAccess`.
   */
  private at(i: number): WhipPoint {
    return this.points[i]!
  }

  /** Bending stiffness at one point index: rigid handle, softening body. */
  private stiffnessAt(i: number): number {
    const n = this.points.length
    if (i < this.handlePoints) return 1
    const bodyPos = (i - this.handlePoints) / (n - 1 - this.handlePoints)
    return this.stiffness * (1 - this.tipFlex * bodyPos)
  }

  /**
   * Snap the whole whip to a start position so the first mount does not let
   * the tail fly in from the origin.
   * @param x - head x.
   * @param y - head y.
   */
  seed(x: number, y: number): void {
    for (let i = 0; i < this.points.length; i += 1) {
      const p = this.at(i)
      p.x = x
      p.y = y + i * this.segmentLength
      p.px = p.x
      p.py = p.y
    }
    this.targetX = x
    this.targetY = y

    if (this.handleAngle !== undefined) {
      const head = this.at(0)
      const dx = Math.cos(this.handleAngle) * this.segmentLength
      const dy = Math.sin(this.handleAngle) * this.segmentLength
      for (let i = 1; i <= this.handlePoints; i += 1) {
        const p = this.at(i)
        p.x = head.x + dx * i
        p.y = head.y + dy * i
        p.px = p.x
        p.py = p.y
      }
    }
  }

  /**
   * Trigger a crack at a point. The head flick runs perpendicular to the
   * whip's head tangent so the wave snaps sideways, like a real whip crack.
   * @param mx - mouse x (also snapped into the target).
   * @param my - mouse y (also snapped into the target).
   */
  crackAt(mx: number, my: number): void {
    this.targetX = mx
    this.targetY = my
    const head = this.at(0)
    const neck = this.points.length > 1 ? this.at(1) : head
    let tx = head.x - neck.x
    let ty = head.y - neck.y
    const len = Math.hypot(tx, ty)
    if (len < 1e-3) {
      tx = 1
      ty = 0
    } else {
      tx /= len
      ty /= len
    }
    this.crack = {
      remaining: this.flickDuration,
      duration: this.flickDuration,
      dirX: -ty,
      dirY: tx,
    }
  }

  /**
   * Advance the simulation.
   * @param dt - frame delta in seconds (clamped to 50ms for tab-switch stability).
   */
  step(dt: number): void {
    const clamped = Math.min(dt, 0.05)
    const dtSq = clamped * clamped

    let headX = this.targetX
    let headY = this.targetY
    if (this.crack !== undefined) {
      const p = 1 - this.crack.remaining / this.crack.duration
      const envelope = Math.sin(p * Math.PI)
      // A single out-and-back snap, not a multi-wave thrash.
      const wave = Math.sin(p * Math.PI * 2)
      const amp = this.flickAmplitude * envelope * wave
      headX += this.crack.dirX * amp
      headY += this.crack.dirY * amp
      this.crack.remaining -= dt
      if (this.crack.remaining <= 0) this.crack = undefined
    }

    const head = this.at(0)
    head.px = head.x
    head.py = head.y
    head.x = headX
    head.y = headY

    // Fixed handle: each handle point stays exactly its offset along
    // handleAngle from the head, anchoring the 135° grip direction.
    if (this.handleAngle !== undefined) {
      const dx = Math.cos(this.handleAngle) * this.segmentLength
      const dy = Math.sin(this.handleAngle) * this.segmentLength
      for (let i = 1; i <= this.handlePoints; i += 1) {
        const p = this.at(i)
        p.px = p.x
        p.py = p.y
        p.x = head.x + dx * i
        p.y = head.y + dy * i
      }
    }

    const friction = this.damping
    for (let i = 1; i < this.points.length; i += 1) {
      const p = this.at(i)
      const vx = (p.x - p.px) * friction
      const vy = (p.y - p.py) * friction
      p.px = p.x
      p.py = p.y
      p.x += vx
      p.y += vy + this.gravity * dtSq
    }

    // Distance constraints; the head stays pinned to its target.
    for (let iter = 0; iter < this.iterations; iter += 1) {
      for (let i = 1; i < this.points.length; i += 1) {
        const a = this.at(i - 1)
        const b = this.at(i)
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.hypot(dx, dy) || 1e-3
        const diff = (dist - this.segmentLength) / dist
        b.x -= dx * diff
        b.y -= dy * diff
      }
    }

    // Bending resistance: pull each interior point toward its neighbours'
    // midpoint. The handle is fully rigid (stiffness 1); the body softens
    // toward the tip so the tail droops and cracks.
    for (let i = 1; i < this.points.length - 1; i += 1) {
      const p = this.at(i)
      const prev = this.at(i - 1)
      const next = this.at(i + 1)
      const s = this.stiffnessAt(i)
      const midX = (prev.x + next.x) * 0.5
      const midY = (prev.y + next.y) * 0.5
      p.x += (midX - p.x) * s
      p.y += (midY - p.y) * s
    }

    const tip = this.at(this.points.length - 1)
    const frameDt = Math.max(clamped, 1e-3)
    const speed = Math.hypot((tip.x - tip.px) / frameDt, (tip.y - tip.py) / frameDt)
    this.tipSpeed += (speed - this.tipSpeed) * 0.2
  }
}
