import { useEffect, useRef } from 'react';
import { Scene, WebGLRenderer } from 'three';
import { type CameraPresetName, type DeepReadonly, type Viewport, type World } from '@ottie/contracts';
import { presetToThreeCamera } from '@ottie/renderer-cameras';
import { buildSchematicScene } from '@ottie/renderer-geometry';

interface Props {
  readonly world: DeepReadonly<World>;
  readonly preset: CameraPresetName;
}

/** Whether a WebGL context can be created; false in jsdom and on headless machines. */
export function canRenderWebGL(canvas: HTMLCanvasElement): boolean {
  try {
    return canvas.getContext('webgl2') !== null || canvas.getContext('webgl') !== null;
  } catch {
    return false;
  }
}

/**
 * The one Three.js world. Rendering is presentation only: it reads `world` and `preset` and
 * never writes back. Falls back to a text label when WebGL is unavailable.
 */
export function SceneCanvas({ world, preset }: Props): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const label = labelRef.current;
    if (!canvas || !container || !label) return;
    if (!canRenderWebGL(canvas)) {
      label.textContent = `${world.id} — WebGL unavailable; schematic scene not drawn`;
      return;
    }
    const renderer = new WebGLRenderer({ canvas, antialias: true });
    const scene = new Scene();
    const schematic = buildSchematicScene(world);
    scene.add(schematic.root);
    const cameraPreset = world.cameraPresets.find((p) => p.name === preset) ?? world.cameraPresets[0];
    if (!cameraPreset) return;

    const draw = () => {
      const viewport: Viewport = {
        widthPx: container.clientWidth,
        heightPx: container.clientHeight,
        devicePixelRatio: window.devicePixelRatio,
        safeInsetsPx: { top: 0, right: 0, bottom: 0, left: 0 },
      };
      renderer.setPixelRatio(viewport.devicePixelRatio);
      renderer.setSize(viewport.widthPx, viewport.heightPx, false);
      renderer.render(scene, presetToThreeCamera(cameraPreset, viewport));
    };
    draw();
    label.textContent = `${world.id} — ${cameraPreset.name} — schematic: ${schematic.laneCount} lanes, ${schematic.anchorCount} anchors`;
    const observer = new ResizeObserver(draw);
    observer.observe(container);
    return () => {
      observer.disconnect();
      renderer.dispose();
    };
  }, [world, preset]);

  return (
    <div ref={containerRef} className="ottie-scene" data-testid="scene">
      <canvas ref={canvasRef} aria-label={`Schematic view of ${world.id}`} />
      <span ref={labelRef} className="ottie-scene-label" data-testid="scene-label" />
    </div>
  );
}
