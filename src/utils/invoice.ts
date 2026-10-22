/**
 * Increments an invoice number sequence.
 * Handles prefixes and zero-padding, e.g.:
 * - "INV-0105" -> "INV-0106"
 * - "105" -> "106"
 * - "INV-XYZ" -> "INV-XYZ1"
 * - "" -> "1"
 */
export function getNextInvoiceNumber(lastNumber?: string): string {
  if (!lastNumber) return '1';
  const match = lastNumber.match(/^(.*?)(\d+)$/);
  if (!match) {
    // If there is no trailing digit, just append '1'
    return lastNumber + '1';
  }
  const prefix = match[1];
  const numberStr = match[2];
  const nextNumber = parseInt(numberStr, 10) + 1;
  const paddedNumber = nextNumber.toString().padStart(numberStr.length, '0');
  return prefix + paddedNumber;
}
