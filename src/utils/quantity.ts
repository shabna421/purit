const DECIMAL_UNITS = new Set([
  'kg',
  'kgs',
  'kilogram',
  'kilograms',
  'g',
  'gm',
  'gms',
  'gram',
  'grams',
  'mg',
  'lb',
  'lbs',
  'pound',
  'pounds',
  'ton',
  'tons',
  'tonne',
  'tonnes',
  'l',
  'ltr',
  'ltrs',
  'liter',
  'liters',
  'litre',
  'litres',
  'ml',
  'm',
  'meter',
  'meters',
  'metre',
  'metres',
  'cm',
  'mm',
  'ft',
  'feet',
  'inch',
  'inches',
  'yd',
  'yard',
  'yards',
]);

function normalizeUnit(unit?: string) {
  return (unit || '').trim().toLowerCase();
}

export function supportsDecimalQuantity(unit?: string) {
  return DECIMAL_UNITS.has(normalizeUnit(unit));
}

export function getMinimumQuantity(unit?: string) {
  return supportsDecimalQuantity(unit) ? 0.01 : 1;
}

export function getQuantityInputStep(unit?: string) {
  return supportsDecimalQuantity(unit) ? 0.01 : 1;
}

export function getQuantityAdjustStep(unit?: string) {
  return supportsDecimalQuantity(unit) ? 0.5 : 1;
}

export function normalizeQuantityValue(value: number | undefined, unit?: string) {
  if (value === undefined || Number.isNaN(value)) return undefined;
  return Math.max(getMinimumQuantity(unit), value);
}

export function isValidQuantityForUnit(value: number, unit?: string) {
  if (!Number.isFinite(value) || value <= 0) return false;
  if (supportsDecimalQuantity(unit)) return true;
  return Number.isInteger(value);
}
