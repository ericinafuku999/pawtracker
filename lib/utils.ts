export function calcDogDays(arrival: string, departure: string, numDogs: number) {
  const a = new Date(arrival + 'T00:00:00')
  const d = new Date(departure + 'T00:00:00')
  const days = Math.max(1, Math.round((d.getTime() - a.getTime()) / 86400000))
  return { days, dogDays: days * numDogs }
}

export interface MonthAllocation {
  monthKey: string
  days: number
  dogDays: number
  revenue: number
}

export function splitRevenueByMonth(
  arrival: string,
  departure: string,
  numDogs: number,
  rate: number,
  overrideDogDays?: number
): MonthAllocation[] {
  const a = new Date(arrival + 'T00:00:00')
  const dep = new Date(departure + 'T00:00:00')
  const totalDays = Math.max(1, Math.round((dep.getTime() - a.getTime()) / 86400000))
  const totalDD = overrideDogDays || totalDays * numDogs
  if (totalDays === 0) return []

  const splits: Record<string, number> = {}
  const cur = new Date(a)
  while (cur < dep) {
    const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`
    splits[key] = (splits[key] || 0) + 1
    cur.setDate(cur.getDate() + 1)
  }

  return Object.entries(splits).map(([monthKey, days]) => {
    const dogDays = Math.round((days / totalDays) * totalDD)
    return { monthKey, days, dogDays, revenue: dogDays * rate }
  })
}

export function formatCurrency(n: number) {
  return '$' + Math.round(n).toLocaleString()
}

export function formatDate(s: string) {
  if (!s) return ''
  const d = new Date(s + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function monthLabel(key: string) {
  const [y, m] = key.split('-')
  return new Date(+y, +m - 1).toLocaleString('en-US', { month: 'short', year: '2-digit' })
}
