const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_LIKE_PATTERN = /\b0\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4}\b/;
const POSTAL_CODE_PATTERN = /\b\d{3}-\d{4}\b/;
const DATE_OF_BIRTH_LIKE_PATTERN =
  /\b(?:19|20)\d{2}[/-](?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])\b/;
const LONG_ID_LIKE_PATTERN = /\b\d{8,}\b/;

export function detectPotentialPersonalInfoPattern(text: string): boolean {
  return (
    EMAIL_PATTERN.test(text) ||
    PHONE_LIKE_PATTERN.test(text) ||
    POSTAL_CODE_PATTERN.test(text) ||
    DATE_OF_BIRTH_LIKE_PATTERN.test(text) ||
    LONG_ID_LIKE_PATTERN.test(text)
  );
}
