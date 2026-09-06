'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import AppShell from '@/components/AppShell'
import { useRouter, useSearchParams } from 'next/navigation'
import { MeetGreet, MeetGreetStatus } from '@/lib/types'

interface DogProfile {
  id: string
  dog_name: string
  owner_name: string
  number_of_dogs: number
  default_rate: number
  photo_url: string | null
}

export default function MeetGreetForm({ meetGreetId }: { meetGreetId?: string }) {
  const isEdit = !!meetGreetId
  const [form, setForm] = useState({
    customer_name: '', dog_names: '', scheduled_date: '', scheduled_time: '',
    status: 'scheduled' as MeetGreetStatus, notes: ''
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dogSearch, setDogSearch] = useState('')
  const [dogResults, setDogResults] = useState<DogProfile[]>([])
  const [allDogs, setAllDogs] = useState<DogProfile[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedDog, setSelectedDog] = useState<DogProfile | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const originalTime = useRef<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('dogs').select('*').eq('user_id', user.id).order('dog_name').then(({ data }) => {
        setAllDogs(data || [])
      })
    })
  }, [])

  useEffect(() => {
    if (!dogSearch.trim()) { setDogResults([]); setShowDropdown(false); return }
    const q = dogSearch.toLowerCase()
    const results = allDogs.filter(d =>
      d.dog_name.toLowerCase().includes(q) ||
      d.owner_name.toLowerCase().includes(q)
    )
    setDogResults(results)
    setShowDropdown(true)
  }, [dogSearch, allDogs])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function selectDog(dog: DogProfile) {
    setSelectedDog(dog)
    setDogSearch('')
    setShowDropdown(false)
    setForm(f => ({ ...f, customer_name: dog.owner_name, dog_names: dog.dog_name }))
  }

  function clearDog() {
    setSelectedDog(null)
    setDogSearch('')
  }

  useEffect(() => {
    if (meetGreetId) {
      supabase.from('meet_greets').select('*').eq('id', meetGreetId).single().then(({ data }) => {
        if (data) {
          const mg = data as MeetGreet
          originalTime.current = mg.scheduled_time
          setForm({
            customer_name: mg.customer_name, dog_names: mg.dog_names,
            scheduled_date: mg.scheduled_date, scheduled_time: mg.scheduled_time || '',
            status: mg.status, notes: mg.notes || ''
          })
        }
      })
    } else {
      // Prefill from a query string (e.g. quick-linked from elsewhere)
      const customerName = searchParams?.get('customerName')
      const dogNames = searchParams?.get('dogNames')
      if (customerName || dogNames) {
        setForm(f => ({ ...f, customer_name: customerName || f.customer_name, dog_names: dogNames || f.dog_names }))
      }
    }
  }, [meetGreetId])

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  function goBack() {
    router.push('/meet-greets')
  }

  async function save(addAnother = false) {
    if (!form.customer_name || !form.scheduled_date) { alert('Customer name and date are required'); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const newTime = form.scheduled_time || null
    // If the time actually changed, clear the "reminder sent" flag so the new
    // time gets its own 15-min-before push instead of staying silenced.
    const timeChanged = isEdit && newTime !== originalTime.current

    const payload = {
      user_id: user.id,
      customer_name: form.customer_name,
      dog_names: form.dog_names,
      scheduled_date: form.scheduled_date,
      scheduled_time: newTime,
      ...(timeChanged ? { reminder_sent: false } : {}),
      status: form.status,
      notes: form.notes || null,
      updated_at: new Date().toISOString(),
    }

    const { error } = isEdit
      ? await supabase.from('meet_greets').update(payload).eq('id', meetGreetId)
      : await supabase.from('meet_greets').insert({ ...payload, created_at: new Date().toISOString() })

    setSaving(false)
    if (error) {
      alert(`Couldn't save meet & greet: ${error.message}\n\nIf this mentions "meet_greets" not existing, that database migration hasn't been run yet in Supabase.`)
      return
    }

    if (addAnother) {
      setForm({ customer_name: '', dog_names: '', scheduled_date: '', scheduled_time: '', status: 'scheduled', notes: '' })
      setSelectedDog(null)
      setDogSearch('')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } else {
      goBack()
    }
  }

  async function deleteMeetGreet() {
    if (!confirm('Delete this meet & greet?')) return
    await supabase.from('meet_greets').delete().eq('id', meetGreetId)
    goBack()
  }

  function convertToBooking() {
    const params = new URLSearchParams({
      customerName: form.customer_name,
      dogNames: form.dog_names,
    })
    router.push(`/bookings/new?${params.toString()}`)
  }

  return (
    <AppShell>
      <div className="mb-5">
        <h1 className="text-xl font-semibold">{isEdit ? 'Edit Meet & Greet' : 'New Meet & Greet'}</h1>
        <p className="text-sm text-gray-500">Schedule a pre-booking visit with a prospective client</p>
      </div>

      {saved && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-700 font-medium">
          ✓ Meet & greet saved! Fill in the form below to add another.
        </div>
      )}

      <div className="card max-w-2xl">
        {/* Dog search type-ahead */}
        {!isEdit && (
          <div className="mb-5 pb-5 border-b border-gray-100">
            <label className="label">Quick fill from dog profile</label>
            {selectedDog ? (
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-white flex-shrink-0 flex items-center justify-center border border-emerald-100">
                  {selectedDog.photo_url
                    ? <img src={selectedDog.photo_url} alt={selectedDog.dog_name} className="w-full h-full object-cover" />
                    : <span className="text-2xl">🐾</span>
                  }
                </div>
                <div className="flex-1">
                  <div className="font-medium text-sm text-emerald-800">{selectedDog.dog_name}</div>
                  <div className="text-xs text-emerald-600">👤 {selectedDog.owner_name}</div>
                </div>
                <button className="btn text-xs py-2 px-3" onClick={clearDog}>Change</button>
              </div>
            ) : (
              <div className="relative" ref={searchRef}>
                <input
                  className="input pl-8 text-base sm:text-sm py-3 sm:py-2"
                  placeholder="Type a dog name to search profiles…"
                  value={dogSearch}
                  onChange={e => setDogSearch(e.target.value)}
                  onFocus={() => dogSearch && setShowDropdown(true)}
                />
                <span className="absolute left-2.5 top-3 sm:top-2.5 text-gray-400 text-xs">🔍</span>
                {showDropdown && dogResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50 mt-1 max-h-64 overflow-y-auto">
                    {dogResults.map(d => (
                      <div key={d.id}
                        className="flex items-center gap-3 px-3 py-3 hover:bg-emerald-50 cursor-pointer border-b border-gray-50 last:border-0"
                        onMouseDown={() => selectDog(d)}>
                        <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 flex items-center justify-center">
                          {d.photo_url
                            ? <img src={d.photo_url} alt={d.dog_name} className="w-full h-full object-cover" />
                            : <span className="text-lg">🐾</span>
                          }
                        </div>
                        <div>
                          <div className="font-medium text-sm">{d.dog_name}</div>
                          <div className="text-xs text-gray-400">👤 {d.owner_name}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {showDropdown && dogResults.length === 0 && dogSearch.trim() && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50 mt-1 px-3 py-3 text-sm text-gray-400">
                    No profiles found — fill in manually below, or this may be a brand new prospective client
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div><label className="label">Customer Name *</label><input className="input text-base sm:text-sm" value={form.customer_name} onChange={set('customer_name')} placeholder="e.g. Smith" /></div>
          <div><label className="label">Dog Name(s)</label><input className="input text-base sm:text-sm" value={form.dog_names} onChange={set('dog_names')} placeholder="e.g. Max" /></div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Date *</label>
            <input className="input text-base sm:text-sm" type="date" value={form.scheduled_date} onChange={set('scheduled_date')} />
          </div>
          <div>
            <label className="label">Time</label>
            <input className="input text-base sm:text-sm" type="time" value={form.scheduled_time} onChange={set('scheduled_time')} title="Meet & greet time (optional)" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Status</label>
            <select className="input text-base sm:text-sm" value={form.status} onChange={set('status')}>
              <option value="scheduled">scheduled</option>
              <option value="completed">completed</option>
              <option value="cancelled">cancelled</option>
            </select>
          </div>
        </div>

        {isEdit && form.status === 'completed' && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-sm text-emerald-700">✓ This meet & greet is complete — ready to turn into a real booking?</div>
            <button className="btn btn-primary text-xs py-2 px-3 flex-shrink-0" onClick={convertToBooking}>
              → Convert to Booking
            </button>
          </div>
        )}

        <div className="mb-5"><label className="label">Notes</label><textarea className="input text-base sm:text-sm" rows={2} value={form.notes} onChange={set('notes')} placeholder="Any special notes…" /></div>

        <div className="flex flex-col sm:flex-row gap-2">
          <button className="btn btn-primary justify-center py-3 sm:py-1.5 text-base sm:text-sm" onClick={() => save(false)} disabled={saving}>
            {saving ? 'Saving…' : 'Save Meet & Greet'}
          </button>
          {!isEdit && (
            <button className="btn justify-center py-3 sm:py-1.5 text-base sm:text-sm bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" onClick={() => save(true)} disabled={saving}>
              {saving ? 'Saving…' : '+ Save & Add Another'}
            </button>
          )}
          <button className="btn justify-center py-3 sm:py-1.5 text-base sm:text-sm" onClick={goBack}>Cancel</button>
          {isEdit && <button className="btn btn-danger justify-center py-3 sm:py-1.5 text-base sm:text-sm sm:ml-auto" onClick={deleteMeetGreet}>Delete</button>}
        </div>
      </div>
    </AppShell>
  )
}
