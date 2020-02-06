/**
 * Wraps the given `value` as an Error -- if it already was an instance of
 * Error, it returns it without modification
 *
 * @param value value to ensure is returned as an Error
 */
export function wrapError(value: any): Error {
  return value instanceof Error ? value : Error(value);
}
