import starterClosureJson from '@ottie/content/registry/starter-closure.json';
import { type StarterClosure, parseStarterClosure } from './closure';

let cached: StarterClosure | null = null;

/** The committed closure file, parsed and self-hash-checked once. */
export function loadStarterClosure(): StarterClosure {
  cached ??= parseStarterClosure(starterClosureJson);
  return cached;
}
