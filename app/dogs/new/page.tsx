'use client'
import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import AppShell from '@/components/AppShell'
import { useRouter } from 'next/navigation'

interface DogFormData {
  dog_name: string
  owner_name: string
  owner_phone: string
  number_of_dogs: string
  default_rate: string
  notes: string
}

interface BookingSuggestion {
  dog_names: string
  customer_name: string
  number_of_dogs: number
  rate_per_dog_day: number
}

export default function DogFormContent({ dogId }: { dogId?: string }) {
  const isEdit = !!dogId
  const [form, setForm] = useState<DogFormData>({
    dog_name: '', owner_name: '', owner_phone: '',
    number_of_dogs: '1', default_rate: '50', notes: ''
  })
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [existingPhoto, setExistingPhoto] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // Booking suggestions for pre-fill
  const [allBookings, setAllBookings] = useState<BookingSuggestion[]>([])
  const [suggestions, setSuggestions] = useState<BookingSuggestion[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const suggestRef = useRef<HTMLDivElement>(null)

  const router = useRouter()
  const supabase = createClient()

  // Load existing bookings for suggestions
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase.from('bookings')
        .select('dog_names, customer_name, number_of_dogs, rate_per_dog_day')
        .eq('user_id', user.id)
        .neq('status', 'cancelled')
        .then(({ data }) => {
          if (!data) return
          // Deduplicate by dog_names
          const seen = new Set<string>()
          const unique = data.filter(b => {
            if (seen.has(b.dog_names)) return false
            seen.add(b.dog_names)
            return true
          })
          setAllBookings(unique)
        })
    })
  }, [])

  // Load existing dog profile if editing
  useEffect(() => {
    if (dogId) {
      supabase.from('dogs').select('*').eq('id', dogId).single().then(({ data }) => {
        if (data) {
          setForm({
            dog_name: data.dog_name || '',
            owner_name: data.owner_name || '',
            owner_phone: data.owner_phone || '',
            number_of_dogs: String(data.number_of_dogs || 1),
            default_rate: String(data.default_rate || 50),
            notes: data.notes || ''
          })
          setExistingPhoto(data.photo_url || null)
        }
      })
    }
  }, [dogId])

  // Search bookings as user types dog name
  function handleDogNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setForm(f => ({ ...f, dog_name: val }))
    if (!val.trim()) { setSuggestions([]); setShowSuggestions(false); return }
    const q = val.toLowerCase()
    const matches = allBookings.filter(b =>
      b.dog_names.toLowerCase().includes(q) ||
      b.customer_name.toLowerCase().includes(q)
    )
    setSuggestions(matches)
    setShowSuggestions(matches.length > 0)
  }

  function selectSuggestion(b: BookingSuggestion) {
    setForm(f => ({
      ...f,
      dog_name: b.dog_names,
      owner_name: b.customer_name,
      number_of_dogs: String(b.number_of_dogs),
      default_rate: String(b.rate_per_dog_day),
    }))
    setSuggestions([])
    setShowSuggestions(false)
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (suggestRef.current && !suggestRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const set = (k: keyof DogFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  async function save() {
    if (!form.dog_name) { alert('Dog name is required'); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    let photoUrl = existingPhoto

    if (photo) {
      const ext = photo.name.split('.').pop()
      const path = `${user.id}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('dog-photos').upload(path, photo)
      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage.from('dog-photos').getPublicUrl(path)
        photoUrl = publicUrl
      }
    }

    const payload = {
      user_id: user.id,
      dog_name: form.dog_name,
      owner_name: form.owner_name,
      owner_phone: form.owner_phone,
      number_of_dogs: parseInt(form.number_of_dogs) || 1,
      default_rate: parseFloat(form.default_rate) || 50,
      notes: form.notes || null,
      photo_url: photoUrl,
      updated_at: new Date().toISOString()
    }

    if (isEdit) {
      await supabase.from('dogs').update(payload).eq('id', dogId)
    } else {
      await supabase.from('dogs').insert({ ...payload, created_at: new Date().toISOString() })
    }

    setSaving(false)
    router.push('/dogs')
  }

  async function deleteDog() {
    if (!confirm('Delete this dog profile?')) return
    await supabase.from('dogs').delete().eq('id', dogId)
    router.push('/dogs')
  }

  return (
    <AppShell>
      <div className="mb-5">
        <h1 className="text-xl font-semibold">{isEdit ? 'Edit Dog Profile' : 'New Dog Profile'}</h1>
        <p className="text-sm text-gray-500">
          {isEdit ? 'Update this dog profile' : 'Start typing a dog name to pull from existing bookings'}
        </p>
      </div>

      <div className="card max-w-lg">
        {/* Photo upload */}
        <div className="flex flex-col sm:flex-row items-center gap-4 mb-5">
          <div className="w-28 h-28 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-emerald-50 flex items-center justify-center border-2 border-dashed border-emerald-200 flex-shrink-0">
            {photoPreview || existingPhoto ? (
              <img src={photoPreview || existingPhoto!} alt="Dog" className="w-full h-full object-cover" />
            ) : (
              <span className="text-4xl sm:text-3xl">🐾</span>
            )}
          </div>
          <div className="text-center sm:text-left">
            <label className="btn btn-primary cursor-pointer py-3 px-5 sm:py-1.5 sm:px-3 text-base sm:text-xs">
              📷 {photoPreview || existingPhoto ? 'Change Photo' : 'Upload Photo'}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />
            </label>
            <div className="text-xs text-gray-400 mt-1">Tap to use camera or choose from library</div>
          </div>
        </div>

        {/* Dog name with type-ahead from existing bookings */}
        <div className="mb-4">
          <label className="label">Dog Name(s) *</label>
          <div className="relative" ref={suggestRef}>
            <input
              className="input text-base sm:text-sm"
              value={form.dog_name}
              onChange={handleDogNameChange}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder="Type to search existing bookings…"
            />
            {showSuggestions && (
              <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50 mt-1 max-h-56 overflow-y-auto">
                {suggestions.map((b, i) => (
                  <div key={i}
                    className="flex items-center justify-between px-3 py-3 hover:bg-emerald-50 cursor-pointer border-b border-gray-50 last:border-0"
                    onMouseDown={() => selectSuggestion(b)}>
                    <div>
                      <div className="font-medium text-sm">{b.dog_names}</div>
                      <div className="text-xs text-gray-400">👤 {b.customer_name} · {b.number_of_dogs} dog{b.number_of_dogs !== 1 ? 's' : ''} · ${b.rate_per_dog_day}/day</div>
                    </div>
                    <span className="text-xs text-emerald-600 font-medium">Use this →</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {!isEdit && allBookings.length > 0 && (
            <div className="text-xs text-gray-400 mt-1">
              {allBookings.length} existing booking{allBookings.length !== 1 ? 's' : ''} available to pull from
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Number of Dogs</label>
            <input className="input text-base sm:text-sm" type="number" min="1" value={form.number_of_dogs} onChange={set('number_of_dogs')} />
          </div>
          <div>
            <label className="label">Default Rate ($/day)</label>
            <input className="input text-base sm:text-sm" type="number" value={form.default_rate} onChange={set('default_rate')} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="label">Owner Name</label>
            <input className="input text-base sm:text-sm" value={form.owner_name} onChange={set('owner_name')} placeholder="e.g. Smith" />
          </div>
          <div>
            <label className="label">Owner Phone</label>
            <input className="input text-base sm:text-sm" type="tel" value={form.owner_phone} onChange={set('owner_phone')} placeholder="e.g. 617-555-1234" />
          </div>
        </div>

        <div className="mb-5">
          <label className="label">Notes</label>
          <textarea className="input text-base sm:text-sm" rows={3} value={form.notes} onChange={set('notes')} placeholder="e.g. Anxious around other dogs, needs extra attention…" />
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <button className="btn btn-primary justify-center py-3 sm:py-1.5 text-base sm:text-sm" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
          <button className="btn justify-center py-3 sm:py-1.5 text-base sm:text-sm" onClick={() => router.push('/dogs')}>
            Cancel
          </button>
          {isEdit && (
            <button className="btn btn-danger justify-center py-3 sm:py-1.5 text-base sm:text-sm sm:ml-auto" onClick={deleteDog}>
              Delete
            </button>
          )}
        </div>
      </div>
    </AppShell>
  )
}