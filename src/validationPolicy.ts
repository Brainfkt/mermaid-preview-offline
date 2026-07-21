const LARGE_VALIDATION_CHARACTERS = 1024 * 1024;
const VERY_LARGE_VALIDATION_CHARACTERS = 5 * 1024 * 1024;

export function mermaidValidationDelay(
  characterCount: number,
  requestedDelay: number,
): number {
  if (characterCount >= VERY_LARGE_VALIDATION_CHARACTERS) {
    return Math.max(requestedDelay, 600);
  }
  if (characterCount >= LARGE_VALIDATION_CHARACTERS) {
    return Math.max(requestedDelay, 350);
  }
  return requestedDelay;
}
