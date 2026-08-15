import { describe, expect, it } from 'vitest'
import { HURRIES, nextHurry } from '../src/client/hurry.ts'
import { WhipSimulation } from '../src/client/whipPhysics.ts'

describe('WhipSimulation', () => {
  it('seeds a straight rope hanging below the head', () => {
    const sim = new WhipSimulation({ points: 5, segmentLength: 10 })
    sim.seed(100, 100)
    const rope = sim.rope()
    expect(rope[0]?.x).toBe(100)
    expect(rope[0]?.y).toBe(100)
    expect(rope[4]?.y).toBe(140)
  })

  it('crack flick travels the rope and finishes', () => {
    const sim = new WhipSimulation({ points: 20, segmentLength: 8, flickAmplitude: 60, flickDuration: 0.15 })
    sim.seed(200, 200)
    sim.crackAt(200, 200)
    expect(sim.crack).toBeDefined()
    let peak = 0
    for (let i = 0; i < 60; i += 1) {
      sim.step(1 / 60)
      peak = Math.max(peak, sim.tipSpeed)
    }
    expect(peak).toBeGreaterThan(0)
    expect(sim.crack).toBeUndefined()
  })
})

describe('nextHurry', () => {
  it('rotates through HURRIES without an immediate repeat', () => {
    let previous: string | undefined
    for (let i = 0; i < 60; i += 1) {
      const line = nextHurry(previous)
      expect(HURRIES).toContain(line)
      expect(line).not.toBe(previous)
      previous = line
    }
  })
})
