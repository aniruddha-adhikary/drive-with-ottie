import { type SourceLocator } from './source';

/** Named semantic validators from docs/SCENARIO-SYSTEM.md §6. V1/R2 implement; every diagnostic names one. */
export const VALIDATOR_NAMES = [
  'source_applicability',
  'lane_topology',
  'marking_context',
  'control_completeness',
  'mount_integrity',
  'approach_facing',
  'signal_movements',
  'question_evidence',
  'camera_evidence',
  'state_invariance',
  /** Structural/referential integrity only (IDs resolve, conventions match). Not a semantic check. */
  'structural_integrity',
] as const;

export type ValidatorName = (typeof VALIDATOR_NAMES)[number];

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  readonly validator: ValidatorName;
  readonly severity: DiagnosticSeverity;
  /** Stable machine code, e.g. `mount_integrity.floating_face`. */
  readonly code: string;
  readonly message: string;
  readonly entityIds: readonly string[];
  readonly sourceRefs?: readonly SourceLocator[];
  readonly data?: Readonly<Record<string, unknown>>;
}

export interface ValidationReport {
  readonly diagnostics: readonly Diagnostic[];
  readonly ok: boolean;
  /** Validators that actually ran; a report that omits a required validator is not a pass. */
  readonly validatorsRun: readonly ValidatorName[];
}

export function summariseReport(diagnostics: readonly Diagnostic[], validatorsRun: readonly ValidatorName[]): ValidationReport {
  return {
    diagnostics,
    ok: diagnostics.every((d) => d.severity !== 'error'),
    validatorsRun,
  };
}

/** A validator over a value of type T. Pure: no I/O, no clock, no randomness. */
export type Validator<T> = (input: T) => readonly Diagnostic[];
