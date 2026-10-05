import { fail, FrameworkError } from '../errors.js';
import { inspectGraph, copyGraph, freezeGraph, zeroUsage } from '../state/data.js';

export function ownValue(value) {
  try {
    const { records, usage } = inspectGraph(value);
    return { value: freezeGraph(copyGraph(value, records).root), usage };
  } catch (cause) {
    throw new FrameworkError(cause.code?.replace(/^STATE_/, 'PAYLOAD_') ?? 'PAYLOAD_INVALID',
      'Input requires bounded supported data.', { cause });
  }
}
export function ownInput(registry, name, args) {
  const spec = registry.get(name);
  if (typeof name !== 'string' || !spec) fail('ACTION_UNKNOWN', 'Unknown registered action name.');
  if (args.length !== (spec.input === 'none' ? 0 : 1)) fail('ACTION_ARITY', 'Input action argument count does not match its schema.');
  if (!args.length) return { name, args: [], usage: zeroUsage() };
  const owned = ownValue(args[0]);
  return { name, args: [owned.value], usage: owned.usage };
}
