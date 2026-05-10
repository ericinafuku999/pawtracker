'use client'
import { useState } from 'react'
import { Booking } from '@/lib/types'
import { useRouter } from 'next/navigation'
import { formatDate, formatCurrency } from '@/lib/utils'
import { createClient } from '@/lib/supabase'

const COLORS = [
  'bg-emerald-100 text-emerald-800 border-emerald-200',
  'bg-blue-100 text-blue-800 border-blue-200',
  'bg-violet-100 text-violet-800 border-violet-200',
  'bg-purple-100 text-purple-800 border-purple-200',
  'bg-pink-100 text-pink-800 border-pink-200',
  'bg-teal-100 text-teal-800 border-teal-200',
  'bg-orange-100 text-orange-800 border-orange-200',
  'bg-cyan-100 text-cyan-800 border-cyan-200',
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
  if (count >= 8) return <div className="flex items-center gap-0.5 bg-red-500 text-white text-xs font-bold px-1 py-0.5 rounded animate-pulse">🚨 {count}</div>
  if (count >= 5) return <div className="flex items-center gap-0.5 bg-amber-400 text-amber-900 text-xs font-bold px-1 py-0.5 rounded">⚠️ {count}</div>
  if (count > 0) return <div className="text-xs text-gray-400 px-1">{count}🐾</div>
  return null
}

function matchesSearch(b: Booking, q: string) {
  if (!q) return true
  const lower = q.toLowerCase()
  return (b.customer_name || '').toLowerCase().includes(lower) ||
    (b.dog_names || '').toLowerCase().includes(lower)
}

function displayName(b: Booking) {
  return b.dog_names && b.dog_names.trim() !== '' ? b.dog_names : b.customer_name || 'Unnamed'
}

interface DogProfile {
  id: string
  dog_name: string
  owner_name: string
  photo_url: string | null
}

interface Props {
  bookings: Booking[]
  compact?: boolean
  onRefresh?: () => void
  searchQuery?: string
  dogProfiles?: DogProfile[]
}

export default function BookingCalendar({ bookings, compact = false, onRefresh, searchQuery = '', dogProfiles = [] }: Props) {
  const [view, setView] = useState<'month' | 'week'>('month')
  const [current, setCurrent] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [localBookings, setLocalBookings] = useState<Booking[]>(bookings)
  const router = useRouter()
  const supabase = createClient()

  if (JSON.stringify(bookings.map(b => b.id)) !== JSON.stringify(localBookings.map(b => b.id))) {
    setLocalBookings(bookings)
  }

  const activeBookings = localBookings.filter(b => b.status !== 'cancelled')
  const hasSearch = searchQuery.trim().length > 0
  const matchedBookings = activeBookings.filter(b => matchesSearch(b, searchQuery))
  const matchedIds = new Set(matchedBookings.map(b => b.id))

  function getDogProfile(booking: Booking): DogProfile | null {
    // If owner is known, match on both dog name + owner name
    if ((booking.customer_name || '').toLowerCase() !== 'imported') {
      const exact = dogProfiles.find(d =>
        d.dog_name.toLowerCase() === (booking.dog_names || '').toLowerCase() &&
        d.owner_name.toLowerCase() === (booking.customer_name || '').toLowerCase()
      )
      if (exact) return exact
    }
    // Fall back to dog name only (covers Imported bookings)
    return dogProfiles.find(d =>
      d.dog_name.toLowerCase() === (booking.dog_names || '').toLowerCase()
    ) || null
  }

  function handleProfileClick(e: React.MouseEvent, booking: Booking) {
    e.stopPropagation()
    const profile = getDogProfile(booking)
    if (profile) {
      router.push(`/dogs/${profile.id}`)
    } else {
      const params = new URLSearchParams({
        dogName: booking.dog_names || '',
        customerName: booking.customer_name || '',
        numDogs: String(booking.number_of_dogs),
        rate: String(booking.rate_per_dog_day),
      })
      router.push(`/dogs/new?${params.toString()}`)
    }
  }

  async function deleteBooking(id: string) {
    if (!confirm('Permanently delete this booking? This cannot be undone.')) return
    await supabase.from('bookings').delete().eq('id', id)
    setLocalBookings(prev => prev.filter(b => b.id !== id))
    if (onRefresh) onRefresh()
  }

  function prev() {
    const d = new Date(current)
    if (view === 'month') d.setMonth(d.getMonth() - 1); else d.setDate(d.getDate() - 7)
    setCurrent(d); setSelectedDay(null)
  }
  function next() {
    const d = new Date(current)
    if (view === 'month') d.setMonth(d.getMonth() + 1); else d.setDate(d.getDate() + 7)
    setCurrent(d); setSelectedDay(null)
  }
  function goToday() { setCurrent(new Date()); setSelectedDay(null) }

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
  const weekRange = view === 'week'
    ? `${days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : ''

  const colorMap: Record<string, string> = {}
  activeBookings.forEach((b, i) => { colorMap[b.id] = getColor(i) })

  const overbookedDays = days.filter(d => getDogCountForDay(d, localBookings) >= 8)
  const warningDays = days.filter(d => { const c = getDogCountForDay(d, localBookings); return c >= 5 && c < 8 })

  const rows: Date[][] = []
  for (let i = 0; i < days.length; i += 7) rows.push(days.slice(i, i + 7))
  const selectedRowIndex = selectedDay ? rows.findIndex(row => row.some(d => sameDay(d, selectedDay))) : -1
  const selectedDayBookings = selectedDay ? getBookingsForDay(selectedDay) : []
  const selectedDogCount = selectedDay ? getDogCountForDay(selectedDay, localBookings) : 0

  function handleDayClick(day: Date) {
    if (selectedDay && sameDay(day, selectedDay)) setSelectedDay(null)
    else setSelectedDay(new Date(day))
  }

  return (
    <div>
      {overbookedDays.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
          <span>🚨</span>
          <span className="font-semibold text-red-700 text-xs md:text-sm">Overbooked! </span>
          <span className="text-red-600 text-xs md:text-sm">{overbookedDays.map(d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })).join(', ')}</span>
        </div>
      )}
      {warningDays.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
          <span>⚠️</span>
          <span className="font-semibold text-amber-700 text-xs md:text-sm">Near capacity: </span>
          <span className="text-amber-600 text-xs md:text-sm">{warningDays.map(d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })).join(', ')}</span>
        </div>
      )}

      {hasSearch && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3">
          {matchedBookings.length === 0 ? (
            <span className="text-sm text-gray-500">No bookings found for "{searchQuery}"</span>
          ) : (
            <div>
              <span className="text-sm font-semibold text-emerald-700">{matchedBookings.length} booking{matchedBookings.length !== 1 ? 's' : ''} matching "{searchQuery}"</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {matchedBookings.map((b, i) => (
                  <span key={i} className="text-xs bg-white border border-emerald-200 rounded-full px-2 py-0.5 text-emerald-800">
                    🐾 {displayName(b)} · {formatDate(b.arrival_date)} → {formatDate(b.departure_date)} · {b.number_of_days} days
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1 md:gap-2">
          <button onClick={prev} className="btn py-1.5 px-2.5 md:py-1 md:px-2 text-sm">‹</button>
          <button onClick={goToday} className="btn py-1.5 px-2.5 md:py-1 md:px-2 text-xs">Today</button>
          <button onClick={next} className="btn py-1.5 px-2.5 md:py-1 md:px-2 text-sm">›</button>
          <span className="font-medium text-xs md:text-sm ml-1">{view === 'month' ? monthName : weekRange}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400 inline-block"></span> 5+</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500 inline-block"></span> 8+</span>
          </div>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            <button onClick={() => { setView('month'); setSelectedDay(null) }} className={`px-2 md:px-3 py-1 rounded-md text-xs transition-colors ${view === 'month' ? 'bg-white font-medium shadow-sm' : 'text-gray-500'}`}>Month</button>
            <button onClick={() => { setView('week'); setSelectedDay(null) }} className={`px-2 md:px-3 py-1 rounded-md text-xs transition-colors ${view === 'week' ? 'bg-white font-medium shadow-sm' : 'text-gray-500'}`}>Week</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <div key={i} className="text-center text-xs font-medium text-gray-400 py-1 md:hidden">{d}</div>
        ))}
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 py-1 hidden md:block">{d}</div>
        ))}
      </div>

      {rows.map((row, rowIdx) => (
        <div key={rowIdx}>
          <div className="grid grid-cols-7">
            {row.map((day, i) => {
              const isToday = sameDay(day, today)
              const isSelected = !!selectedDay && sameDay(day, selectedDay)
              const isCurrentMonth = view === 'week' || day.getMonth() === current.getMonth()
              const dayBookings = getBookingsForDay(day)
              const dogCount = getDogCountForDay(day, localBookings)
              const isOverbooked = dogCount >= 8
              const isWarning = dogCount >= 5 && dogCount < 8
              const hasMatch = hasSearch && dayBookings.some(b => matchedIds.has(b.id))

              return (
                <div key={i}
                  onClick={() => handleDayClick(day)}
                  className={`min-h-[60px] md:min-h-[90px] border p-0.5 md:p-1 cursor-pointer transition-all
                    ${isSelected ? 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-300' :
                      hasMatch ? 'border-emerald-300 bg-emerald-50 ring-1 ring-emerald-200' :
                      isOverbooked ? 'border-red-200 bg-red-50' :
                      isWarning ? 'border-amber-200 bg-amber-50' :
                      isCurrentMonth ? 'border-gray-100 bg-white hover:bg-gray-50' : 'border-gray-100 bg-gray-50'}
                    ${hasSearch && !hasMatch ? 'opacity-40' : ''}`}>
                  <div className="flex items-center justify-between mb-0.5">
                    <div className={`text-xs w-5 h-5 md:w-6 md:h-6 flex items-center justify-center rounded-full font-medium
                      ${isToday ? 'bg-emerald-500 text-white' : isCurrentMonth ? 'text-gray-700' : 'text-gray-300'}`}>
                      {day.getDate()}
                    </div>
                    <DogCapacityBadge count={dogCount} />
                  </div>
                  <div className="space-y-0.5">
                    {dayBookings.slice(0, 1).map(b => {
                      const isMatch = hasSearch && matchedIds.has(b.id)
                      const isNotMatch = hasSearch && !matchedIds.has(b.id)
                      return (
                        <div key={b.id} className={`text-xs px-0.5 md:px-1 py-0.5 rounded border truncate transition-all
                          ${isMatch ? 'ring-1 ring-emerald-400 font-bold ' + colorMap[b.id] :
                            isNotMatch ? 'opacity-30 ' + colorMap[b.id] :
                            colorMap[b.id]}`}>
                          <span className="hidden md:inline">{isMatch && '★ '}{displayName(b)}</span>
                          <span className="md:hidden">{displayName(b).split(' ')[0]}</span>
                        </div>
                      )
                    })}
                    {dayBookings.length > 1 && (
                      <div className="text-xs text-gray-400 pl-0.5">+{dayBookings.length - 1}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {selectedDay && selectedRowIndex === rowIdx && (
            <div className="border border-emerald-200 rounded-xl bg-white shadow-sm overflow-hidden mb-1">
              <div className="flex items-center justify-between px-3 md:px-4 py-2.5 bg-emerald-50 border-b border-emerald-100">
                <div className="flex items-center gap-2 md:gap-3">
                  <span className="font-semibold text-xs md:text-sm">
                    {selectedDay.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <span className={`badge text-xs ${selectedDogCount >= 8 ? 'bg-red-100 text-red-700' : selectedDogCount >= 5 ? 'bg-amber-100 text-amber-700' : 'badge-green'}`}>
                    {selectedDogCount} 🐾
                  </span>
                </div>
                <button onClick={() => setSelectedDay(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none px-1">✕</button>
              </div>
              {selectedDayBookings.length === 0 ? (
                <div className="px-4 py-5 text-center text-gray-400 text-sm">No bookings on this day</div>
              ) : (
                <div className="overflow-y-auto" style={{ maxHeight: '320px' }}>
                  {selectedDayBookings.map((b) => {
                    const isMatch = hasSearch && matchedIds.has(b.id)
                    const profile = getDogProfile(b)
                    return (
                      <div key={b.id}
                        className={`flex items-start justify-between px-3 md:px-4 py-3 border-b border-gray-50 last:border-0
                          ${isMatch ? 'bg-emerald-50' : 'hover:bg-gray-50'}`}>
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          {/* Dog photo — click to open profile */}
                          <div
                            className="w-12 h-12 rounded-xl overflow-hidden bg-emerald-50 flex-shrink-0 flex items-center justify-center border border-emerald-100 cursor-pointer hover:ring-2 hover:ring-emerald-400 transition-all relative group"
                            onClick={e => handleProfileClick(e, b)}
                            title={profile ? `View ${b.dog_names}'s profile` : `Create profile for ${b.dog_names}`}>
                            {profile?.photo_url
                              ? <img src={profile.photo_url} alt={b.dog_names} className="w-full h-full object-cover" />
                              : <span className="text-xl">🐾</span>
                            }
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-xl">
                              <span className="text-white text-xs font-bold">{profile ? '✏️' : '+'}</span>
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            {/* Clickable dog name → profile */}
                            <button
                              onClick={e => handleProfileClick(e, b)}
                              className="font-semibold text-sm text-left hover:text-emerald-600 hover:underline transition-colors truncate block w-full">
                              {isMatch && '★ '}{b.dog_names || b.customer_name || 'Unnamed'}
                              {!profile && <span className="ml-1 text-xs text-gray-400 font-normal">(no profile)</span>}
                            </button>
                            <div className="text-xs text-gray-500">👤 {b.customer_name}</div>
                            <div className="text-xs text-gray-400">{formatDate(b.arrival_date)} → {formatDate(b.departure_date)} · {formatCurrency(b.total_revenue)}</div>
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              <span className={`badge text-xs ${b.payment_type === 'Rover' ? 'badge-teal' : 'badge-amber'}`}>{b.payment_type}</span>
                              <span className={`badge text-xs ${b.payment_status === 'paid' ? 'badge-green' : b.payment_status === 'partially paid' ? 'badge-amber' : 'badge-gray'}`}>{b.payment_status}</span>
                              <span className={`badge text-xs ${b.status === 'active' ? 'badge-blue' : b.status === 'completed' ? 'badge-green' : 'badge-red'}`}>{b.status}</span>
                            </div>
                          </div>
                        </div>
                        {/* Edit button → edit booking only */}
                        <div className="flex flex-col gap-1 flex-shrink-0 ml-2">
                          <button
                            onClick={e => { e.stopPropagation(); router.push(`/bookings/${b.id}`) }}
                            className="btn text-xs py-1.5 px-2 md:py-1">
                            Edit
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); deleteBooking(b.id) }}
                            className="btn btn-danger text-xs py-1.5 px-2 md:py-1">
                            Del
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {activeBookings.length > 0 && (
        <div className="mt-3 hidden md:flex flex-wrap gap-2">
          {activeBookings.slice(0, 8).map((b, i) => {
            const isMatch = hasSearch && matchedIds.has(b.id)
            const isNotMatch = hasSearch && !matchedIds.has(b.id)
            return (
              <div key={b.id} className={`text-xs px-2 py-0.5 rounded-full border transition-all ${getColor(i)} ${isMatch ? 'ring-2 ring-emerald-400 font-bold' : isNotMatch ? 'opacity-30' : ''}`}>
                {isMatch && '★ '}{displayName(b)} ({b.number_of_dogs}🐾)
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}