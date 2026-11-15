// Three-free data for the LUNA-01 hero, so the main bundle never pulls in three.js.

export type ComponentDef = {id: number; key: string; name: string; detail: string; anchor: [number, number, number] | 'nearest-leg'}

/** Lander components, named from the geometry of the merged LUNA01 mesh in vigil-scene.glb (lander-local metres). */
export const COMPONENTS: ComponentDef[] = [
  {id: 2, key: 'solar', name: 'Solar array', detail: 'Four-panel wing on a side boom', anchor: [4.45, 5.45, 0]},
  {id: 4, key: 'cabin', name: 'Crew cabin', detail: 'Ascent stage · hatch, two windows, four thruster blocks', anchor: [0, 5.3, 1.3]},
  {id: 1, key: 'antenna', name: 'High-gain antenna', detail: 'Dish on a mast above the cabin', anchor: [-0.78, 8.68, -0.25]},
  {id: 5, key: 'descent', name: 'Descent stage', detail: 'Foil-wrapped body · engine bell below', anchor: [0, 2.5, 1.86]},
  {id: 6, key: 'gear', name: 'Landing gear', detail: 'Four braced legs with footpads', anchor: 'nearest-leg'},
  {id: 3, key: 'ladder', name: 'Egress ladder', detail: 'Eight rungs from porch to surface', anchor: [0, 2.2, 2.87]},
]

export const webglAvailable = () => {
  try {
    const c = document.createElement('canvas')
    const ctx = c.getContext('webgl2') || c.getContext('webgl')
    ;(ctx as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context')?.loseContext()
    return !!ctx
  } catch { return false }
}
