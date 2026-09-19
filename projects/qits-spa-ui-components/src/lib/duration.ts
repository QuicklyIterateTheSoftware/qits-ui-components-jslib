/**
 * The two subtractions the chrome and the step track both do, in one place.
 *
 * <p>They lived as private helpers inside `main-layout.ts` while exactly one thing drew a duration.
 * A second one now does — {@link QitsStepProgress} — and the spelling of a span is the one thing
 * about it that must not drift: a reader sees `4m 12s` in the bolt, clicks the row, and has to see
 * `4m 12s` on qits-ci's run page. Two copies in one package is how that drift starts at home,
 * before it has even had the chance to start across repositories.
 */

/** `value` held between `low` and `high`, both ends included. */
export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

/**
 * `41s`, `4m 12s`, `1h 04m` — a span, at the precision worth reading at that length.
 *
 * A **copy** of qits-ci's own `formatElapsed`, character for character, rather than an import: this
 * package depends on no qits module, and a duration a reader sees in the bolt has to be the same
 * string they see on the run page they click through to. Copying is the policy; drifting is not.
 *
 * <p>Negative input is zero rather than a minus sign. Only two things produce one — a clock skewed
 * against the service's, and a step whose `startedAt` is a moment in this browser's future — and
 * `-0s` says nothing true about either.
 */
export function formatElapsed(millis: number): string {
  const total = Math.max(0, Math.round(millis / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  if (hours > 0) return `${hours}h ${pad(minutes)}m`;
  if (minutes > 0) return `${minutes}m ${pad(seconds)}s`;
  return `${seconds}s`;
}

/** An ISO instant as epoch milliseconds — `undefined` for absent, empty or unparseable. */
export function instantMs(iso: string | undefined | null): number | undefined {
  if (!iso) return undefined;
  const millis = Date.parse(iso);
  return Number.isNaN(millis) ? undefined : millis;
}
