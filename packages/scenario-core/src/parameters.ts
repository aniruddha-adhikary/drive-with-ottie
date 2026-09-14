import { type Diagnostic, type GenerationRequest, type Template } from '@ottie/contracts';

export type ParameterValue = string | number | boolean;
export type ResolvedParameters = Readonly<Record<string, ParameterValue>>;

export interface ParameterResolution {
  readonly parameters: ResolvedParameters;
  readonly diagnostics: readonly Diagnostic[];
}

function diagnostic(code: string, message: string, data?: Readonly<Record<string, unknown>>): Diagnostic {
  return { validator: 'structural_integrity', severity: 'error', code, message, entityIds: [], ...(data ? { data } : {}) };
}

/**
 * Resolves request parameters against the template's declared parameters. Every declared parameter
 * gets an explicit value (request value or template default); undeclared names and disallowed
 * values are errors. Parameters are never sampled: the RNG only ever touches `safeVariation`.
 */
export function resolveParameters(template: Template, request: GenerationRequest): ParameterResolution {
  const diagnostics: Diagnostic[] = [];
  const declared = new Map(template.parameters.map((p) => [p.name, p] as const));
  const resolved: Record<string, ParameterValue> = {};

  for (const name of Object.keys(request.parameters).sort()) {
    if (!declared.has(name)) {
      diagnostics.push(diagnostic('generator.unknown_parameter', `template ${template.id}@${template.version} declares no parameter "${name}"`, { name }));
    }
  }

  for (const parameter of template.parameters) {
    const supplied = request.parameters[parameter.name];
    const value = supplied ?? parameter.default;
    const kindOk =
      (parameter.kind === 'enum' && typeof value === 'string') ||
      (parameter.kind === 'integer' && typeof value === 'number' && Number.isInteger(value)) ||
      (parameter.kind === 'boolean' && typeof value === 'boolean');
    if (!kindOk) {
      diagnostics.push(
        diagnostic('generator.parameter_kind', `parameter "${parameter.name}" must be ${parameter.kind}, received ${typeof value}`, { name: parameter.name, value }),
      );
      continue;
    }
    if (!parameter.allowed.includes(value)) {
      diagnostics.push(
        diagnostic('generator.parameter_not_allowed', `parameter "${parameter.name}" = ${JSON.stringify(value)} is not one of ${JSON.stringify(parameter.allowed)}`, {
          name: parameter.name,
          value,
          allowed: parameter.allowed,
        }),
      );
      continue;
    }
    resolved[parameter.name] = value;
  }

  return { parameters: resolved, diagnostics };
}

/** Reads an enum parameter already validated by `resolveParameters`; throws on programmer error. */
export function enumParameter<T extends string>(parameters: ResolvedParameters, name: string, allowed: readonly T[]): T {
  const value = parameters[name];
  const match = allowed.find((candidate) => candidate === value);
  if (match === undefined) throw new RangeError(`parameter "${name}" = ${JSON.stringify(value)} not in ${JSON.stringify(allowed)}`);
  return match;
}
