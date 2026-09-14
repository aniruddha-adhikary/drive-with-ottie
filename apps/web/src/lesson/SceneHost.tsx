import { useEffect, useRef, useState } from 'react';
import {
  type CameraPresetName,
  type DeepReadonly,
  type EntityId,
  type EvidenceRequirement,
  type SceneInput,
  type SceneView,
  type ViewChange,
  type ViewerPreferences,
  type Viewport,
  type World,
} from '@ottie/contracts';

interface Props {
  readonly sceneView: SceneView;
  readonly world: DeepReadonly<World>;
  readonly evidence: readonly EvidenceRequirement[];
  readonly preset: CameraPresetName;
  readonly preferences: ViewerPreferences;
  readonly highlightEntityId: EntityId | null;
  readonly label: string;
  readonly onViewChange?: (change: ViewChange) => void;
  /** Fallback size when layout is unavailable (jsdom, display:none). */
  readonly fallbackSizePx?: { readonly width: number; readonly height: number };
}

const NO_INSETS = Object.freeze({ top: 0, right: 0, bottom: 0, left: 0 });

function measure(el: HTMLElement, fallback: { width: number; height: number }): Viewport {
  const width = el.clientWidth > 0 ? el.clientWidth : fallback.width;
  const height = el.clientHeight > 0 ? el.clientHeight : fallback.height;
  return { widthPx: width, heightPx: height, devicePixelRatio: window.devicePixelRatio || 1, safeInsetsPx: NO_INSETS };
}

/**
 * Hosts a `SceneView` port inside a sized container. The host only forwards read-only inputs and
 * relays `onViewChange`; it never reads renderer internals and cannot alter the world. A SceneView
 * is mounted in one container at a time, so the compact scene and the enlarged viewer never share a
 * mount — the lesson renders whichever is visible.
 */
export function SceneHost({ sceneView, world, evidence, preset, preferences, highlightEntityId, label, onViewChange, fallbackSizePx = { width: 320, height: 212 } }: Props): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  const [status, setStatus] = useState<'mounting' | 'ready' | 'failed'>('mounting');
  const [lastChange, setLastChange] = useState<ViewChange | null>(null);

  const fallbackWidth = fallbackSizePx.width;
  const fallbackHeight = fallbackSizePx.height;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    const input: SceneInput = {
      world,
      evidence,
      preset,
      viewport: measure(container, { width: fallbackWidth, height: fallbackHeight }),
      preferences,
      highlightEntityId,
    };
    const unsubscribe = sceneView.onViewChange((change) => {
      if (cancelled) return;
      setLastChange(change);
      onViewChange?.(change);
    });
    sceneView
      .mount(container, input)
      .then(() => {
        if (cancelled) return;
        mountedRef.current = true;
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus('failed');
        console.error('SceneView mount failed', error);
      });
    const observer = new ResizeObserver(() => {
      if (!mountedRef.current) return;
      sceneView.update({ ...input, viewport: measure(container, { width: fallbackWidth, height: fallbackHeight }) });
    });
    observer.observe(container);
    return () => {
      cancelled = true;
      observer.disconnect();
      unsubscribe();
      if (mountedRef.current) {
        mountedRef.current = false;
        sceneView.unmount();
      }
    };
    // Mount once per sceneView/world; presets, preferences and highlights flow through update().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneView, world]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !mountedRef.current) return;
    sceneView.update({
      world,
      evidence,
      preset,
      viewport: measure(container, { width: fallbackWidth, height: fallbackHeight }),
      preferences,
      highlightEntityId,
    });
    sceneView.setPreset(preset);
  }, [sceneView, world, evidence, preset, preferences, highlightEntityId, fallbackWidth, fallbackHeight, status]);

  const hidden = lastChange?.fit.hiddenEvidenceIds ?? [];

  return (
    <div className="ottie-scene-host" data-testid="scene-host" data-status={status} data-preset={preset}>
      <div ref={containerRef} className="ottie-scene-host__surface" role="img" aria-label={label} />
      {status === 'failed' ? (
        <p className="ottie-type-metadata ottie-scene-host__note" role="alert">
          The scene could not be drawn. The question text and answers still work.
        </p>
      ) : null}
      {hidden.length > 0 ? (
        <p className="ottie-type-metadata ottie-scene-host__note" data-testid="hidden-evidence">
          Not visible in this view: {hidden.join(', ')}
        </p>
      ) : null}
    </div>
  );
}
