import { type Diagnostic, type DiagnosticSeverity, type ValidatorName } from '@ottie/contracts';

export const REGISTRY_VALIDATOR: ValidatorName = 'source_applicability';

export function registryDiagnostic(
  code: string,
  severity: DiagnosticSeverity,
  message: string,
  entityIds: readonly string[],
  data?: Readonly<Record<string, unknown>>,
): Diagnostic {
  return {
    validator: REGISTRY_VALIDATOR,
    severity,
    code: `asset_registry.${code}`,
    message,
    entityIds,
    ...(data ? { data } : {}),
  };
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}
