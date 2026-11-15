// Presentation-only state for the sign-in staff animation. Mutated by DOM events,
// read every frame by the WebGL scene; nothing here touches auth state.
export const peek = {
  active: false,      // pointer (or keyboard focus) has entered the sign-in panel
  eyesClosed: false,  // password field focused: "no peeking"
  hasPointer: false,
  clientX: 0,
  clientY: 0,
}

export const peekHandlers = {
  enter: (e: {clientX: number; clientY: number}) => { peek.active = true; peek.hasPointer = true; peek.clientX = e.clientX; peek.clientY = e.clientY },
  move: (e: {clientX: number; clientY: number}) => { peek.hasPointer = true; peek.clientX = e.clientX; peek.clientY = e.clientY },
  focusIn: () => { peek.active = true },
  eyesClose: () => { peek.active = true; peek.eyesClosed = true },
  eyesOpen: () => { peek.eyesClosed = false },
}
