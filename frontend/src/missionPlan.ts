// LUNA-01 mission plan (fictional). Single source for the timeline, the briefing and the crew map.
export const PHASES = [
  {id: 'prep', label: 'Earth baselines', condition: 'Pre-launch preparation · 1 g', range: 'D−6 to D−1', from: -6, to: -1},
  {id: 'launch', label: 'Launch', condition: 'Launch', range: 'D0', from: 0, to: 0},
  {id: 'transit', label: 'Transit · microgravity', condition: 'Transit microgravity', range: 'D1–D3', from: 1, to: 3},
  {id: 'landing', label: 'Landing', condition: 'Lunar landing', range: 'D4', from: 4, to: 4},
  {id: 'surface', label: 'Lunar surface · 1/6 g', condition: 'Lunar surface · 1/6 g', range: 'D5–D8', from: 5, to: 8},
]
export type Phase = typeof PHASES[number]

/** Plan day as drawn on the timeline (clamped to the LUNA-01 plan: day -6 .. day 8). */
export const planDay = (day: number) => Math.max(-6, Math.min(8, day))
/** The LUNA-01 phase for a mission day: the same lookup the timeline uses, so both always agree. */
export const phaseOf = (day: number): Phase => { const d = planDay(day); return PHASES.find(p => d >= p.from && d <= p.to)! }
