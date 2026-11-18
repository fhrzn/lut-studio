/** Unwraps a WebGL `create*` result, which is null when the context is lost or out of memory. */
export function must<T>(value: T | null, what: string): T {
  if (value === null) throw new Error(`WebGL could not create ${what}`);
  return value;
}
