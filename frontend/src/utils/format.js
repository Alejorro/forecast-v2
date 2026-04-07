/**
 * Format a number as USD currency.
 * Large numbers: no decimals. e.g. $1,250,000
 * If value is 0, returns blank (for Q columns).
 */
export function formatUSD(value, showZero = true) {
  if (value == null || value === '') return ''
  const num = Number(value)
  if (isNaN(num)) return ''
  if (num === 0 && !showZero) return ''
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num)
}

/**
 * Format a plain number with commas.
 */
export function formatNumber(value) {
  if (value == null) return ''
  const num = Number(value)
  if (isNaN(num)) return ''
  return new Intl.NumberFormat('en-US').format(num)
}

/**
 * Format a decimal allocation (0.25) as percentage string ("25%").
 */
export function formatPercent(value) {
  if (value == null || value === '') return ''
  const num = Number(value)
  if (isNaN(num)) return ''
  return `${Math.round(num * 100)}%`
}
