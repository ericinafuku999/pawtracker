'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { MeetGreet } from '@/lib/types'
import { formatDate, formatTime } from '@/lib/utils'
import AppShell from '@/components/AppShell'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function MeetGreetsPage() {
  const [meetGreets, setMeetGreets] = useState<MeetGreet[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('meet_greets').select('*').eq('user_id', user.id).order('scheduled_date', { ascending: true })
    setMeetGreets(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const todayStr = new Date().toISOString().split('T')[0]
  const upcoming = meetGreets.filter(mg => mg.status === 'scheduled').sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
  const past = meetGreets.filter(mg => mg.status !== 'scheduled').sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date))

  async function markStatus(id: string, status: 'completed' | 'cancelled') {
    await supabase.from('meet_greets').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    load()
  }

  async function deleteMeetGreet(id: string) {
    if (!confirm('Delete this meet & greet?')) return
    await supabase.from('meet_greets').delete().eq('id', id)
    load()
  }

  function convertToBooking(mg: MeetGreet) {
    const params = new URLSearchParams({ customerName: mg.customer_name, dogNames: mg.dog_names })
    router.push(`/bookings/new?${params.toString()}`)
  }

  function statusBadge(s: string) {
    if (s === 'completed') return <span className="badge badge-green">completed</span>
    if (s === 'cancelled') return <span className="badge badge-red">cancelled</span>
    return <span className="badge badge-blue">scheduled</span>
  }

  function Row({ mg }: { mg: MeetGreet }) {
    const isToday = mg.scheduled_date === todayStr
    return (
      <div className="p-3 md:p-4 flex items-start justify-between gap-3 border-b border-gray-50 last:border-0">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm truncate">{mg.dog_names || mg.customer_name}</span>
            {isToday && <span className="badge bg-emerald-100 text-emerald-700 text-xs flex-shrink-0">Today</span>}
            {statusBadge(mg.status)}
          </div>
          <div className="text-xs text-gray-500">👤 {mg.customer_name}</div>
          <div className="text-xs text-gray-400 mt-0.5">
            {formatDate(mg.scheduled_date)}{mg.scheduled_time ? ` · ${formatTime(mg.scheduled_time)}` : ''}
          </div>
          {mg.notes && <div className="text-xs text-gray-400 mt-1 truncate">{mg.notes}</div>}
        </div>
        <div className="flex flex-col gap-1 flex-shrink-0">
          <button className="btn text-xs py-1.5 px-2" onClick={() => router.push(`/meet-greets/${mg.id}`)}>Edit</button>
          {mg.status === 'scheduled' && (
            <button className="btn text-xs py-1.5 px-2 bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" onClick={() => markStatus(mg.id, 'completed')}>✓ Complete</button>
          )}
          {mg.status === 'completed' && (
            <button className="btn text-xs py-1.5 px-2 bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100" onClick={() => convertToBooking(mg)}>→ Booking</button>
          )}
          <button className="btn btn-danger text-xs py-1.5 px-2" onClick={() => deleteMeetGreet(mg.id)}>✕</button>
        </div>
      </div>
    )
  }

  return (
    <AppShell>
      <div className="flex justify-between items-start mb-5">
        <div><h1 className="text-xl font-semibold">Meet & Greets</h1><p className="text-sm text-gray-500">Pre-booking visits with prospective clients</p></div>
        <Link href="/meet-greets/new" className="btn btn-primary text-xs md:text-sm">+ New</Link>
      </div>

      {loading ? (
        <div className="card text-center text-gray-400 py-8">Loading…</div>
      ) : meetGreets.length === 0 ? (
        <div className="card text-center text-gray-400 py-8">
          No meet & greets yet. <Link href="/meet-greets/new" className="text-emerald-600">Schedule one →</Link>
        </div>
      ) : (
        <>
          <div className="mb-2 px-1 font-semibold text-sm text-gray-700">Upcoming ({upcoming.length})</div>
          <div className="card p-0 overflow-hidden mb-6">
            {upcoming.length === 0
              ? <div className="text-center text-gray-400 text-sm py-6">Nothing scheduled</div>
              : upcoming.map(mg => <Row key={mg.id} mg={mg} />)
            }
          </div>

          <div className="mb-2 px-1 font-semibold text-sm text-gray-700">Past ({past.length})</div>
          <div className="card p-0 overflow-hidden">
            {past.length === 0
              ? <div className="text-center text-gray-400 text-sm py-6">Nothing here yet</div>
              : past.map(mg => <Row key={mg.id} mg={mg} />)
            }
          </div>
        </>
      )}
    </AppShell>
  )
}
