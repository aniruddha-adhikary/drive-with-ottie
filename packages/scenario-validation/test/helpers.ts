import { expect } from 'vitest';
import {
  type DeepReadonly,
  type Diagnostic,
  type Mutable,
  type ValidationReport,
  type World,
  cloneMutable,
  freezeDeep,
} from '@ottie/contracts';

export function mutate(
  base: DeepReadonly<World>,
  edit: (draft: Mutable<World>) => void,
): DeepReadonly<World> {
  const draft = cloneMutable<World>(base);
  edit(draft);
  return freezeDeep<World>(draft);
}

export function errors(report: ValidationReport): readonly Diagnostic[] {
  return report.diagnostics.filter((d) => d.severity === 'error');
}

export function warnings(report: ValidationReport): readonly Diagnostic[] {
  return report.diagnostics.filter((d) => d.severity === 'warning');
}

export function codes(diagnostics: readonly Diagnostic[]): readonly string[] {
  return [...new Set(diagnostics.map((d) => d.code))].sort();
}

/** The report must be invalid AND carry an error with exactly this `family.code`. */
export function expectError(report: ValidationReport, code: string): Diagnostic {
  const found = errors(report).find((d) => d.code === code);
  expect(codes(errors(report)), `expected error ${code}`).toContain(code);
  expect(report.ok).toBe(false);
  if (!found) throw new Error(`no error ${code}`);
  expect(found.validator).toBe(code.split('.')[0]);
  return found;
}

export function expectValid(report: ValidationReport): void {
  expect(errors(report).map((d) => `${d.code}: ${d.message}`)).toEqual([]);
  expect(report.ok).toBe(true);
}

export function summarise(report: ValidationReport): string {
  return report.diagnostics
    .filter((d) => d.severity !== 'info')
    .map((d) => `${d.severity} ${d.code}: ${d.message}`)
    .join('\n');
}
