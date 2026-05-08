'use client'
import { useState } from 'react'
import { Booking } from '@/lib/types'
import { useRouter } from 'next/navigation'

const COLORS = [
  'bg-emerald-100 text-emerald-800 border-emerald-200',
  'bg-blue-100 text-blue-800 border-blue-200',
  'bg-amber-100 text-amber-800 border-amber-200',
  'bg-purple-100 text-purple-800 border-purple-200',
  'bg-pink-100 text-pink-800 border-pink-200',
  'bg-teal-100 text-teal-800 border-teal-200',
]

function getColor(index: number) { return COLORS[index % COLORS.length] }
function parseD(s: string) { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d) }
function sameDay(a: Date, b: Date) { return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate() }
function isBetween(date: Date, start: Date, end: Date) { return date.getTime()>=start.getTime()&&date.getTime()<end.getTime() }

function getDogCountForDay(date: Date, bookings: Booking[]) {
  return bookings
    .filter(b => b.status !== 'cancelled')
    .filter(b => isBetween(date, parseD(b.arrival_date), parseD(b.departure_date)) || sameDay(date, parseD(b.arrival_date)))
    .reduce((sum, b) => sum + b.number_of_dogs, 0)
}

function DogCapacityBadge({ count }: { count: number }) {
  if (count >= 8) return (
    <div className="flex items-center gap-0.5 bg-red-500 text-white text-xs font-bold px-1 py-0.5 rounded animate-pulse">
      🚨 {count} dogs
    </div>
  )
  if (count >= 5) return (
    <div className="flex items-center gap-0.5 bg-amber-400 text-amber-900 text-xs font-bold px-1 py-0.5 rounded">
      ⚠️ {count} dogs
    </div>
  )
  if (count > 0) return (
    <div className="text-xs text-gray-400 px-1">{count} 🐾</div>
  )
  return null
}

interface Props {
  bookings: Booking[]
  compact?: boolean
}

export default function BookingCalendar({ bookings, compact = false }: Props) {
  const [view, setView] = useState<'month' | 'week'>('month')
  const [current, setCurrent] = useState(new Date())
  const router = useRouter()

  const activeBookings = bookings.filter(b => b.status !== 'cancelled')

  function prev() {
    const d = new Date(current)
    if (view === 'month') d.setMonth(d.getMonth() - 1)
    else d.setDate(d.getDate() - 7)
    setCurrent(d)
  }
  function next() {
    const d = new Date(current)
    if (view === 'month') d.setMonth(d.getMonth() + 1)
    else d.setDate(d.getDate() + 7)
    setCurrent(d)
  }
  function goToday() { setCurrent(new Date()) }

  function getMonthDays() {
    const year = current.getFullYear(), month = current.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const days: Date[] = []
    for (let i = 0; i < firstDay.getDay(); i++) days.push(new Date(year, month, -firstDay.getDay() + i + 1))
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(year, month, d))
    while (days.length % 7 !== 0) days.push(new Date(year, month + 1, days.length - lastDay.getDate() - firstDay.getDay() + 1))
    return days
  }

  function getWeekDays() {
    const start = new Date(current)
    start.setDate(start.getDate() - start.getDay())
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
  }

  function getBookingsForDay(date: Date) {
    return activeBookings.filter(b => isBetween(date, parseD(b.arrival_date), parseD(b.departure_date)) || sameDay(date, parseD(b.arrival_date)))
  }

  const days = view === 'month' ? getMonthDays() : getWeekDays()
  const today = new Date()
  const monthName = current.toLocaleString('en-US', { month: 'long', year: 'numeric' })
  const weekRange = view === 'week' ? `${days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''

  const colorMap: Record<string, string> = {}
  activeBookings.forEach((b, i) => { colorMap[b.id] = getColor(i) })

  const overbookedDays = days.filter(d => getDogCountForDay(d, bookings) >= 8)
  const warningDays = days.filter(d => { const c = getDogCountForDay(d, bookings); return c >= 5 && c < 8 })

  return (
    <div>
      {overbookedDays.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 mb-3 flex items-center gap-2">
          <span className="text-lg">🚨</span>
          <div>
            <span className="font-semibold text-red-700 text-sm">Overbooked! </span>
            <span className="text-red-600 text-sm">8+ dogs on: {overbookedDays.map(d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })).join(', ')}</span>
          </div>
        </div>
      )}
      {warningDays.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 mb-3 flex items-center gap-2">
          <span className="text-lg">⚠️</span>
          <div>
            <span className="font-semibold text-amber-700 text-sm">Near capacity: </span>
            <span className="text-amber-600 text-sm">5+ dogs on: {warningDays.map(d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })).join(', ')}</span>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button onClick={prev} className="btn py-1 px-2 text-xs">‹</button>
          <button onClick={goToday} className="btn py-1 px-2 text-xs">Today</button>
          <button onClick={next} className="btn py-1 px-2 text-xs">›</button>
          <span className="font-medium text-sm ml-1">{view === 'month' ? monthName : weekRange}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400 inline-block"></span> 5+ dogs</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500 inline-block"></span> 8+ dogs</span>
          </div>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            <button onClick={() => setView('month')} className={`px-3 py-1 rounded-md text-xs transition-colors ${view === 'month' ? 'bg-white font-medium shadow-sm' : 'text-gray-500'}`}>Month</button>
            <button onClick={() => setView('week')} className={`px-3 py-1 rounded-md text-xs transition-colors ${view === 'week' ? 'bg-white font-medium shadow-sm' : 'text-gray-500'}`}>Week</button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const isToday = sameDay(day, today)
          const isCurrentMonth = view === 'week' || day.getMonth() === current.getMonth()
          const dayBookings = getBookingsForDay(day)
          const dogCount = getDogCountForDay(day, bookings)
          const isOverbooked = dogCount >= 8
          const isWarning = dogCount >= 5 && dogCount < 8
          return (
            <div key={i} className={`${view === 'month' ? 'min-h-[90px]' : 'min-h-[130px]'} border border-gray-100 p-1 ${isOverbooked ? 'bg-red-50 border-red-200' : isWarning ? 'bg-amber-50 border-amber-200' : isCurrentMonth ? 'bg-white' : 'bg-gray-50'}`}>
              <div className="flex items-center justify-between mb-0.5">
                <div className={`text-xs w-6 h-6 flex items-center justify-center rounded-full font-medium ${isToday ? 'bg-emerald-500 text-white' : isCurrentMonth ? 'text-gray-700' : 'text-gray-300'}`}>
                  {day.getDate()}
                </div>
                <DogCapacityBadge count={dogCount} />
              </div>
              <div className="space-y-0.5">
                {dayBookings.slice(0, compact ? 1 : 3).map(b => (
                  <div key={b.id} onClick={() => router.push(`/bookings/${b.id}`)} className={`text-xs px-1 py-0.5 rounded border truncate cursor-pointer hover:opacity-80 ${colorMap[b.id]}`}>
                    {b.customer_name} {b.dog_names ? `(${b.dog_names})` : ''}
                  </div>
                ))}
                {dayBookings.length > (compact ? 1 : 3) && (
                  <div className="text-xs text-gray-400 pl-1">+{dayBookings.length - (compact ? 1 : 3)} more</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {activeBookings.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {activeBookings.slice(0, 6).map((b, i) => (
            <div key={b.id} className={`text-xs px-2 py-0.5 rounded-full border ${getColor(i)}`}>
              {b.customer_name} ({b.number_of_dogs} 🐾)
            </div>
          ))}
        </div>
      )}
    </div>
  )
}