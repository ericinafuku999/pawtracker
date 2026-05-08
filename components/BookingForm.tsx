'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { calcDogDays, splitRevenueByMonth } from '@/lib/utils'
import AppShell from '@/components/AppShell'
import { useRouter } from 'next/navigation'
import { Booking } from '@/lib/types'

export default function BookingForm({ bookingId }: { bookingId?: string }) {
  const isEdit = !!bookingId
  const [form, setForm] = useState({
    customer_name: '', dog_names: '', number_of_dogs: '1', rate_per_dog_day: '50',
    arrival_date: '', departure_date: '', dog_days_override: '',
    payment_type: 'Rover', payment_status: 'unpaid', amount_received: '0',
    status: 'active', cancellation_reason: '', notes: ''
  })
  const [calc, setCalc] = useState<{ days: number; dogDays: number; revenue: number; splits: any[] } | null>(null)
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    if (bookingId) {
      supabase.from('bookings').select('*').eq('id', bookingId).single().then(({ data }) => {
        if (data) {
          const b = data as Booking
          setForm({
            customer_name: b.customer_name, dog_names: b.dog_names,
            number_of_dogs: String(b.number_of_dogs), rate_per_dog_day: String(b.rate_per_dog_day),
            arrival_date: b.arrival_date, departure_date: b.departure_date,
            dog_days_override: b.dog_days_override ? String(b.dog_days_override) : '',
            payment_type: b.payment_type, payment_status: b.payment_status,
            amount_received: String(b.amount_received), status: b.status,
            cancellation_reason: b.cancellation_reason || '', notes: b.notes || ''
          })
        }
      })
    }
  }, [bookingId])

  useEffect(() => {
    const { arrival_date, departure_date, number_of_dogs, rate_per_dog_day, dog_days_override } = form
    if (!arrival_date || !departure_date) { setCalc(null); return }
    const n = parseInt(number_of_dogs) || 1
    const rate = parseFloat(rate_per_dog_day) || 0
    const ov = parseInt(dog_days_override) || 0
    const { days, dogDays } = calcDogDays(arrival_date, departure_date, n)
    const dd = ov || dogDays
    const splits = splitRevenueByMonth(arrival_date, departure_date, n, rate, ov || undefined)
    setCalc({ days, dogDays: dd, revenue: dd * rate, splits })
  }, [form.arrival_date, form.departure_date, form.number_of_dogs, form.rate_per_dog_day, form.dog_days_override])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  async function save() {
    if (!form.customer_name || !form.arrival_date || !form.departure_date) { alert('Fill required fields'); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const n = parseInt(form.number_of_dogs) || 1
    const rate = parseFloat(form.rate_per_dog_day) || 0
    const ov = parseInt(form.dog_days_override) || null
    const { days, dogDays } = calcDogDays(form.arrival_date, form.departure_date, n)
    const dd = ov || dogDays
    const ma = splitRevenueByMonth(form.arrival_date, form.departure_date, n, rate, ov || undefined)
    const payload = {
      user_id: user.id,
      customer_name: form.customer_name,
      dog_names: form.dog_names,
      number_of_dogs: n,
      arrival_date: form.arrival_date,
      departure_date: form.departure_date,
      number_of_days: days,
      dog_days: dd,
      dog_days_override: ov,
      rate_per_dog_day: rate,
      total_revenue: dd * rate,
      payment_type: form.payment_type as any,
      payment_status: form.payment_status as any,
      amount_received: parseFloat(form.amount_received) || 0,
      status: form.status as any,
      cancellation_reason: form.cancellation_reason || null,
      notes: form.notes || null,
      month_allocations: ma,
      updated_at: new Date().toISOString(),
    }
    if (isEdit) {
      await supabase.from('bookings').update(payload).eq('id', bookingId)
    } else {
      await supabase.from('bookings').insert({ ...payload, created_at: new Date().toISOString() })
    }
    setSaving(false)
    router.push('/bookings')
  }

  async function deleteBooking() {
    if (!confirm('Delete this booking?')) return
    await supabase.from('bookings').delete().eq('id', bookingId)
    router.push('/bookings')
  }

  return (
    <AppShell>
      <div className="mb-5">
        <h1 className="text-xl font-semibold">{isEdit ? 'Edit Booking' : 'New Booking'}</h1>
        <p className="text-sm text-gray-500">Schedule a dog care appointment</p>
      </div>

      <div className="card max-w-2xl">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div><label className="label">Customer Name *</label><input className="input" value={form.customer_name} onChange={set('customer_name')} placeholder="e.g. Smith" /></div>
          <div><label className="label">Dog Name(s)</label><input className="input" value={form.dog_names} onChange={set('dog_names')} placeholder="e.g. Max, Bella" /></div>
        </div>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div><label className="label"># of Dogs *</label><input className="input" type="number" min="1" value={form.number_of_dogs} onChange={set('number_of_dogs')} /></div>
          <div><label className="label">Rate / Dog-Day ($) *</label><input className="input" type="number" value={form.rate_per_dog_day} onChange={set('rate_per_dog_day')} /></div>
          <div><label className="label">Override Dog-Days</label><input className="input" type="number" placeholder="Auto" value={form.dog_days_override} onChange={set('dog_days_override')} /></div>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div><label className="label">Arrival Date *</label><input className="input" type="date" value={form.arrival_date} onChange={set('arrival_date')} /></div>
          <div><label className="label">Departure Date *</label><input className="input" type="date" value={form.departure_date} onChange={set('departure_date')} /></div>
        </div>

        {calc && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 mb-4 text-sm">
            <div className="flex gap-6 mb-1">
              <span>Days: <strong>{calc.days}</strong></span>
              <span>Dog-Days: <strong>{calc.dogDays}</strong></span>
              <span>Revenue: <strong>${calc.revenue.toLocaleString()}</strong></span>
            </div>
            {calc.splits.length > 1 && (
              <div className="text-xs text-emerald-700 mt-1">
                Split: {calc.splits.map(s => `${s.monthKey}: ${s.dogDays} dog-days = $${s.revenue}`).join(' | ')}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div><label className="label">Payment Type</label>
            <select className="input" value={form.payment_type} onChange={set('payment_type')}>
              <option>Rover</option><option>Venmo</option>
            </select>
          </div>
          <div><label className="label">Pay Status</label>
            <select className="input" value={form.payment_status} onChange={set('payment_status')}>
              <option>unpaid</option><option>partially paid</option><option>paid</option>
            </select>
          </div>
          <div><label className="label">Amount Received ($)</label><input className="input" type="number" value={form.amount_received} onChange={set('amount_received')} /></div>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div><label className="label">Booking Status</label>
            <select className="input" value={form.status} onChange={set('status')}>
              <option>active</option><option>completed</option><option>cancelled</option>
            </select>
          </div>
          <div><label className="label">Cancellation Reason</label><input className="input" value={form.cancellation_reason} onChange={set('cancellation_reason')} placeholder="Optional" /></div>
        </div>
        <div className="mb-4"><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes} onChange={set('notes')} placeholder="Any special notes…" /></div>

        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Booking'}</button>
          <button className="btn" onClick={() => router.push('/bookings')}>Cancel</button>
          {isEdit && <button className="btn btn-danger ml-auto" onClick={deleteBooking}>Delete</button>}
        </div>
      </div>
    </AppShell>
  )
}
