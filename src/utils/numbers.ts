export function sanitizeNumericInput(raw: string) {
  if (!raw) return '';

  if (raw.includes('.')) {
    const [integerPart, decimalPart] = raw.split('.');
    const normalizedInteger = integerPart.replace(/^0+(?=\d)/, '') || '0';
    return `${normalizedInteger}.${decimalPart ?? ''}`;
  }

  return raw.replace(/^0+(?=\d)/, '');
}

export function parseNumericInput(raw: string) {
  const sanitized = sanitizeNumericInput(raw);
  if (!sanitized) return undefined;

  const parsed = Number(sanitized);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function formatNumericInput(value?: number | null) {
  if (value === undefined || value === null || Number.isNaN(value) || value === 0) {
    return '';
  }

  return String(value);
}
