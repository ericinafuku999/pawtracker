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

// Combines a 'YYYY-MM-DD' date with an optional 'HH:MM' time into a real Date.
// If no time is given, falls back to the provided hour/minute (e.g. start or end of day).
export function toDateTime(dateStr: string, timeStr: string | null | undefined, fallbackHour: number, fallbackMinute: number) {
  const [y, m, d] = dateStr.split('-').map(Number)
  if (timeStr) {
    const [hh, mm] = timeStr.split(':').map(Number)
    return new Date(y, m - 1, d, hh, mm)
  }
  return new Date(y, m - 1, d, fallbackHour, fallbackMinute)
}

// Same idea as toDateTime, but interprets the date/time as wall-clock time in a
// specific IANA timezone (e.g. 'America/New_York') rather than whatever timezone
// the JS runtime happens to be running in. This matters on servers (Vercel
// functions run in UTC) so a booking time like "7:07 PM" entered by someone in
// Eastern time isn't misread as "7:07 PM UTC" (a 4-5 hour error).
function getTimeZoneOffsetMs(timeZone: string, date: Date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts = dtf.formatToParts(date).reduce((acc: Record<string, string>, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value
    return acc
  }, {})
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second)
  )
  return asUtc - date.getTime()
}

export function toDateTimeInZone(
  dateStr: string,
  timeStr: string | null | undefined,
  timeZone: string,
  fallbackHour: number,
  fallbackMinute: number
) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr ? timeStr.split(':').map(Number) : [fallbackHour, fallbackMinute]
  // Guess: treat the wall-clock numbers as if they were UTC.
  const guessUtc = new Date(Date.UTC(y, m - 1, d, hh, mm))
  // See how that guess actually reads inside the target timezone, and correct for the gap.
  const offsetMs = getTimeZoneOffsetMs(timeZone, guessUtc)
  return new Date(guessUtc.getTime() - offsetMs)
}

// Formats 'HH:MM' (24hr) into e.g. '2:00 PM'
export function formatTime(t: string | null | undefined) {
  if (!t) return ''
  const [hh, mm] = t.split(':').map(Number)
  const d = new Date(2000, 0, 1, hh, mm)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
