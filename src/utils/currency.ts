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
  const num = Number(amount) || 0;
  const rounded2Dec = Math.round(num * 100) / 100;
  const isWhole = Math.abs(rounded2Dec % 1) < 0.001;

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: isWhole ? 0 : 2,
      maximumFractionDigits: isWhole ? 0 : 2,
    }).format(rounded2Dec);
  } catch {
    const symbol = currencyCode === 'INR' ? '₹' : `${currencyCode} `;
    const rounded = isWhole
      ? Math.round(Math.abs(rounded2Dec)).toLocaleString(locale)
      : Math.abs(rounded2Dec).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return rounded2Dec < 0 ? `-${symbol}${rounded}` : `${symbol}${rounded}`;
  }
}

