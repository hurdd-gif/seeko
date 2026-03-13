/** RFC 5322-lite email pattern. Used across invite endpoints. */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns true if the value is a non-empty string that looks like a valid email (max 254 chars). */
export function isValidEmail(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 254 &&
    EMAIL_REGEX.test(value)
  );
}
