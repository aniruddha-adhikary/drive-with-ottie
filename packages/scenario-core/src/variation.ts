import { type Conditions, type Diagnostic, type Rng, type Template } from '@ottie/contracts';

export type Daylight = Conditions['daylight'];
const DAYLIGHT_VALUES: readonly Daylight[] = ['day', 'dusk', 'night'];

/** The fields a template may declare under `safeVariation`; anything else fails generation. */
export const SAFE_VARIATION_FIELDS = Object.freeze({
  nonEgoProgress: 'actors[!ego].progressM',
  daylight: 'conditions.daylight',
});

/** Progress is drawn on a 0.5 m grid so canonical JSON never carries binary fraction noise. */
const PROGRESS_STEP_M = 0.5;

export interface SafeVariationDraw {
  /** Longitudinal progress for every non-ego actor, or null when the template declares no such variation. */
  readonly nonEgoProgressM: number | null;
  readonly daylight: Daylight | null;
  readonly diagnostics: readonly Diagnostic[];
}

function error(code: string, message: string, data: Readonly<Record<string, unknown>>): Diagnostic {
  return { validator: 'structural_integrity', severity: 'error', code, message, entityIds: [], data };
}

/**
 * Draws the template's declared safe variation from the seeded RNG, in declaration order. Only
 * these fields are ever randomised; answer-bearing state (parameters, priorities, conflicts,
 * control regime, signal state, IDs) is never touched by the RNG.
 */
export function drawSafeVariation(template: Template, rng: Rng): SafeVariationDraw {
  const diagnostics: Diagnostic[] = [];
  let nonEgoProgressM: number | null = null;
  let daylight: Daylight | null = null;

  for (const variation of template.safeVariation) {
    switch (variation.field) {
      case SAFE_VARIATION_FIELDS.nonEgoProgress: {
        const { minM, maxM } = variation.range;
        if (typeof minM !== 'number' || typeof maxM !== 'number' || !(minM >= 0) || !(maxM >= minM)) {
          diagnostics.push(error('generator.safe_variation_range', `invalid progress range for ${variation.field}`, { range: variation.range }));
          break;
        }
        const steps = Math.floor((maxM - minM) / PROGRESS_STEP_M);
        nonEgoProgressM = minM + rng.int(0, steps) * PROGRESS_STEP_M;
        break;
      }
      case SAFE_VARIATION_FIELDS.daylight: {
        const allowed = variation.range.allowed;
        const values = Array.isArray(allowed) ? allowed.filter((v): v is Daylight => DAYLIGHT_VALUES.includes(v as Daylight)) : [];
        if (values.length === 0 || !Array.isArray(allowed) || values.length !== allowed.length) {
          diagnostics.push(error('generator.safe_variation_range', `invalid daylight range for ${variation.field}`, { range: variation.range }));
          break;
        }
        daylight = rng.pick(values);
        break;
      }
      default:
        diagnostics.push(
          error('generator.unsupported_safe_variation', `template declares safe variation "${variation.field}" that this generator cannot honour`, { field: variation.field }),
        );
    }
  }

  return { nonEgoProgressM, daylight, diagnostics };
}
