/**
 * Normalize a vehicle registration number to a canonical form
 * for indexed lookups against vehicles.reg_no_canonical.
 *
 * Strips all non-alphanumeric characters and uppercases.
 * Examples: "Kxx 123a" → "KXX123A", "kxx-123a" → "KXX123A"
 */
export function normalizeRegNo(input: string | null | undefined): string {
  return (input ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}
