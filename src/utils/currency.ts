export function formatCurrency(amount: number, currencyCode = 'INR') {
  const locale = currencyCode === 'INR' ? 'en-IN' : 'en';

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

export function formatStatCurrency(amount: number, currencyCode = 'INR') {
  const locale = currencyCode === 'INR' ? 'en-IN' : 'en';

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    const symbol = currencyCode === 'INR' ? '₹' : `${currencyCode} `;
    const rounded = Math.round(Math.abs(amount)).toLocaleString(locale);
    return amount < 0 ? `-${symbol}${rounded}` : `${symbol}${rounded}`;
  }
}

