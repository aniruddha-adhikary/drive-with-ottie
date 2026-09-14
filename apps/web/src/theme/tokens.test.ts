import { describe, expect, it } from 'vitest';
import { BRAND_FONT_STACK, BRAND_TOKENS, FEEDBACK_TOKENS, MIN_HIT_AREA_PX, MODULE_STATUS, ROAD_CONTROL_STYLE_POLICY, TYPE_SCALE, themeCssVariables } from './tokens';

/** WCAG 2.x relative luminance contrast for flat sRGB colours. */
function contrast(hexA: string, hexB: string): number {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const [hi, lo] = [lum(hexA), lum(hexB)].sort((a, b) => b - a) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('theme tokens', () => {
  it('matches the documented Sunny Cobalt palette and its measured contrast ratios', () => {
    expect(BRAND_TOKENS['brand.action']).toBe('#285BE3');
    expect(contrast(BRAND_TOKENS['text.ink'], BRAND_TOKENS['surface.paper'])).toBeCloseTo(12.27, 1);
    expect(contrast(BRAND_TOKENS['text.muted'], BRAND_TOKENS['surface.paper'])).toBeCloseTo(7.14, 1);
    expect(contrast(BRAND_TOKENS['surface.white'], BRAND_TOKENS['brand.action'])).toBeCloseTo(5.68, 1);
    expect(contrast(BRAND_TOKENS['text.ink'], BRAND_TOKENS['brand.sun'])).toBeCloseTo(9.0, 1);
    expect(contrast(BRAND_TOKENS['text.ink'], BRAND_TOKENS['brand.mint'])).toBeCloseTo(10.69, 1);
  });

  it('keeps feedback text and white-on-feedback surfaces above WCAG AA for normal text', () => {
    expect(contrast(FEEDBACK_TOKENS['feedback.correct'], FEEDBACK_TOKENS['feedback.correct.surface'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(FEEDBACK_TOKENS['feedback.incorrect'], FEEDBACK_TOKENS['feedback.incorrect.surface'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(BRAND_TOKENS['surface.white'], FEEDBACK_TOKENS['feedback.correct'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(BRAND_TOKENS['surface.white'], FEEDBACK_TOKENS['feedback.incorrect'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(BRAND_TOKENS['text.ink'], FEEDBACK_TOKENS['feedback.correct.surface'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(BRAND_TOKENS['text.ink'], FEEDBACK_TOKENS['feedback.incorrect.surface'])).toBeGreaterThanOrEqual(4.5);
  });

  it('uses the documented type scale, font and hit area', () => {
    expect(TYPE_SCALE.question).toEqual({ sizePx: 24, lineHeightPx: 32, weight: 700 });
    expect(TYPE_SCALE.explanation.sizePx).toBe(18);
    expect(TYPE_SCALE.control.sizePx).toBe(16);
    expect(TYPE_SCALE.metadata.sizePx).toBe(13);
    expect(BRAND_FONT_STACK.startsWith("'Plus Jakarta Sans'")).toBe(true);
    expect(MIN_HIT_AREA_PX).toBe(44);
  });

  it('keeps road-control materials outside the brand theme', () => {
    expect(ROAD_CONTROL_STYLE_POLICY.inheritsBrandTokens).toBe(false);
    expect(ROAD_CONTROL_STYLE_POLICY.inheritsBrandFont).toBe(false);
    const vars = themeCssVariables({ textScale: 1.5, reducedMotion: false });
    for (const key of Object.keys(vars)) expect(key.startsWith('--ottie-')).toBe(true);
    expect(Object.keys(vars).some((k) => k.includes('road'))).toBe(false);
    expect(vars['--ottie-text-scale']).toBe('1.5');
    expect(vars['--ottie-motion-duration']).toBe('160ms');
    expect(MODULE_STATUS.pending.join(' ')).toMatch(/Plus Jakarta Sans files/);
  });
});
