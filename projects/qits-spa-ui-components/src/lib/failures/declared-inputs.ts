import { reflectComponentType, type Type } from '@angular/core';

/**
 * `inputs` narrowed to the ones `component` declares, by template name.
 *
 * An outlet that hands a component an input it does not declare trips NG0303, so a slot that
 * offers more than its oldest consumer takes — qits-990's preview slot, which gained `failure`
 * beside `coordinates` — offers each input only to a component that asked for it. Internal to the
 * library; nothing outside it needs this.
 */
export function declaredInputs(
  component: Type<unknown>,
  inputs: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const declared = new Set(
    (reflectComponentType(component)?.inputs ?? []).map((input) => input.templateName),
  );
  const narrowed: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(inputs)) {
    if (declared.has(name)) narrowed[name] = value;
  }
  return narrowed;
}
