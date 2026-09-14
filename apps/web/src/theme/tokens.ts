import { type ModuleStatus, type Preferences } from '@ottie/contracts';

/**
 * Sunny Cobalt brand tokens (docs/VISUAL-SYSTEM.md). These style the INTERFACE layer only: answer
 * controls, glossary sheets, camera controls, feedback. Nothing here may be applied to road-control
 * materials (sign faces, paint, signal heads) — see `ROAD_CONTROL_STYLE_POLICY`.
 */
export const BRAND_TOKENS = Object.freeze({
  'brand.action': '#285BE3',
  'brand.sun': '#FFD34E',
  'brand.mint': '#CEF1EE',
  'surface.paper': '#FFF9ED',
  'surface.white': '#FFFFFF',
  'text.ink': '#18344B',
  'text.muted': '#42576A',
} as const);

export type BrandToken = keyof typeof BRAND_TOKENS;

/**
 * Feedback colours are interface-layer tokens with a non-colour cue always present (label text and
 * icon glyph). Coral is excluded for normal text: 2.99:1 against white fails WCAG AA.
 */
export const FEEDBACK_TOKENS = Object.freeze({
  'feedback.correct': '#1F7A4D',
  'feedback.correct.surface': '#E4F5EC',
  'feedback.incorrect': '#9A3B1F',
  'feedback.incorrect.surface': '#FBE9E2',
} as const);

/** Type scale from the visual system, in CSS px at textScale 1. */
export const TYPE_SCALE = Object.freeze({
  question: { sizePx: 24, lineHeightPx: 32, weight: 700 },
  explanation: { sizePx: 18, lineHeightPx: 27, weight: 400 },
  control: { sizePx: 16, lineHeightPx: 24, weight: 600 },
  metadata: { sizePx: 13, lineHeightPx: 18, weight: 500 },
} as const);

/**
 * Font stack. Plus Jakarta Sans is the proposed family; the font files are NOT bundled by U1
 * (font provenance/OFL notices belong to D4 under assets/brand/). Until then the stack falls back to
 * system sans-serif faces with matching metrics-ish behaviour.
 */
export const BRAND_FONT_STACK =
  "'Plus Jakarta Sans', 'Plus Jakarta Sans Variable', 'Segoe UI', 'Helvetica Neue', Arial, system-ui, sans-serif";

/** Minimum accessible hit area for tap targets (CSS px). */
export const MIN_HIT_AREA_PX = 44;

/**
 * Road-control assets keep their official appearance. The theme never supplies colour, typeface or
 * shape for them; the renderer reads asset definitions instead. This constant exists so tests and
 * reviewers can assert the separation, and so no `brand.*` token is ever passed to the SceneView.
 */
export const ROAD_CONTROL_STYLE_POLICY = Object.freeze({
  inheritsBrandTokens: false,
  inheritsBrandFont: false,
  layers: ['physical_road', 'teaching_overlay', 'interface'] as const,
  note: 'roadControl.* materials come from source-backed asset definitions, not from theme tokens.',
});

export type TextScale = Preferences['textScale'];

/** CSS custom properties for a theme scope. Every value is a plain string for `style` attributes. */
export function themeCssVariables(prefs: Pick<Preferences, 'textScale' | 'reducedMotion'>): Readonly<Record<string, string>> {
  return {
    '--ottie-brand-action': BRAND_TOKENS['brand.action'],
    '--ottie-brand-sun': BRAND_TOKENS['brand.sun'],
    '--ottie-brand-mint': BRAND_TOKENS['brand.mint'],
    '--ottie-surface-paper': BRAND_TOKENS['surface.paper'],
    '--ottie-surface-white': BRAND_TOKENS['surface.white'],
    '--ottie-text-ink': BRAND_TOKENS['text.ink'],
    '--ottie-text-muted': BRAND_TOKENS['text.muted'],
    '--ottie-feedback-correct': FEEDBACK_TOKENS['feedback.correct'],
    '--ottie-feedback-correct-surface': FEEDBACK_TOKENS['feedback.correct.surface'],
    '--ottie-feedback-incorrect': FEEDBACK_TOKENS['feedback.incorrect'],
    '--ottie-feedback-incorrect-surface': FEEDBACK_TOKENS['feedback.incorrect.surface'],
    '--ottie-font-brand': BRAND_FONT_STACK,
    '--ottie-text-scale': String(prefs.textScale),
    '--ottie-motion-duration': prefs.reducedMotion ? '0ms' : '160ms',
    '--ottie-min-hit': `${MIN_HIT_AREA_PX}px`,
  };
}

export const MODULE_STATUS: ModuleStatus = {
  module: '@ottie/web/theme',
  owner: 'U1',
  implemented: [
    'Sunny Cobalt brand tokens (interface layer only)',
    'type scale, brand font stack (no font files bundled)',
    'text-scale and reduced-motion CSS variables via ThemeScope',
    'road-control style separation policy',
  ],
  pending: [
    'bundled Plus Jakarta Sans files with OFL notice (D4, assets/brand/)',
    'dark theme palette audit',
    'Soft Plum alternative palette',
  ],
};
