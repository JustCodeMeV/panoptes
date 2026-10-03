import { PostProcessStage, type Viewer } from 'cesium'
import { useEffect } from 'react'
import { SENSORS, useGlobeUi, type Sensor } from '../globeUi'
import { useViewer } from '../viewerContext'
import { nightVisionShader, retroShader, thermalShader, type SensorShader } from './shaders'

const SHADER: Record<Exclude<Sensor, 'eo'>, SensorShader> = { nvg: nightVisionShader, flir: thermalShader, crt: retroShader }

/** Adds the look's stage and keeps its clock running; returns the cleanup. */
function attach(viewer: Viewer, sensor: Exclude<Sensor, 'eo'>): () => void {
  const shader = SHADER[sensor]
  const uniforms: Record<string, number> = { intensity: 1, time: 0 }
  for (const [k, u] of Object.entries(shader.uniforms)) uniforms[k] = u.default
  const stage = new PostProcessStage({ name: `sensor_${sensor}`, fragmentShader: shader.fragmentShader, uniforms })
  const scene = viewer.scene
  scene.postProcessStages.add(stage)
  const wasOnDemand = scene.requestRenderMode
  scene.requestRenderMode = false
  const t0 = performance.now()
  const tick = scene.preRender.addEventListener(() => {
    ;(stage.uniforms as Record<string, number>).time = (performance.now() - t0) / 1000
  })
  return () => {
    tick()
    scene.postProcessStages.remove(stage)
    scene.requestRenderMode = wasOnDemand
    scene.requestRender()
  }
}

/**
 * Applies the selected sensor look as one Cesium post-process stage. The
 * shaders animate (noise, flicker), so the scene renders continuously while a
 * look is on and goes back to render-on-demand when it is off.
 * Hotkey: V cycles through the looks.
 */
export function SensorModes() {
  const viewer = useViewer()!
  const sensor = useGlobeUi((s) => s.sensor)
  const setSensor = useGlobeUi((s) => s.setSensor)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'v' && e.key !== 'V') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const i = SENSORS.findIndex((s) => s.id === useGlobeUi.getState().sensor)
      setSensor(SENSORS[(i + 1) % SENSORS.length].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setSensor])

  useEffect(() => (sensor === 'eo' ? undefined : attach(viewer, sensor)), [sensor, viewer])

  return (
    <div className="sensor-modes" role="radiogroup" aria-label="Sensor look (V)">
      {SENSORS.map((s) => (
        <button key={s.id} role="radio" aria-checked={sensor === s.id} className={sensor === s.id ? 'on' : ''} title={`${s.title} (V)`} onClick={() => setSensor(s.id)}>
          {s.label}
        </button>
      ))}
    </div>
  )
}
