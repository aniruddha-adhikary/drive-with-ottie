/**
 * Every downstream module exports a `MODULE_STATUS` so the web shell and review CLI can show what
 * is real and what is a skeleton. A skeleton is not a working module and never implies approval.
 */
export interface ModuleStatus {
  readonly module: string;
  /** Execution-plan job that owns the module (C1, C2, V1, R1 ...). */
  readonly owner: string;
  readonly implemented: readonly string[];
  readonly pending: readonly string[];
}

export function isSkeleton(status: ModuleStatus): boolean {
  return status.implemented.length === 0;
}
