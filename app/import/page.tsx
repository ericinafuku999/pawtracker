'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { calcDogDays, splitRevenueByMonth } from '@/lib/utils'
import AppShell from '@/components/AppShell'
import Papa from 'papaparse'

export default function ImportPage() {
  const [rows, setRows] = useState<any[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) setUserId(session.user.id)
    })
  }, [])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (r) => { setRows(r.data as any[]); setHeaders(Object.keys(r.data[0] || {})) }
    })
  }

  function convertDate(d: string): string {
    if (!d) return ''
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d
    if (/^\d{1,2}-[A-Za-z]{3}$/.test(d)) {
      const months: Record<string,string> = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'}
      const [day, mon] = d.split('-')
      const year = new Date().getFullYear()
      return `${year}-${months[mon] || '01'}-${day.padStart(2,'0')}`
    }
    const parsed = new Date(d)
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0]
    return d
  }

  function getCol(r: any, ...keys: string[]): string {
    for (const k of keys) {
      if (r[k] !== undefined && r[k] !== '') return String(r[k]).trim()
      const found = Object.keys(r).find(rk => rk.trim().toLowerCase() === k.toLowerCase())
      if (found && r[found] !== undefined && r[found] !== '') return String(r[found]).trim()
    }
    return ''
  }

  async function doImport() {
    if (!userId) { setResult('Error: not logged in'); return }
    setImporting(true)
    const { data: existing } = await supabase.from('bookings').select('arrival_date,departure_date,customer_name').eq('user_id', userId)
    let imported = 0, skipped = 0
    const toInsert = []

    for (const r of rows) {
      const arr = convertDate(getCol(r, 'Arrival Date', 'arrival_date', 'Arrival', 'arrival'))
      const dep = convertDate(getCol(r, 'Departure Date', 'departure_date', 'Departure', 'departure'))
      const cust = getCol(r, 'Customer Name', 'Customer', 'customer_name', 'customer') || 'Imported'

      if (!arr || !dep) { skipped++; continue }

      const dup = (existing || []).some((b: any) => b.arrival_date === arr && b.departure_date === dep && b.customer_name === cust)
      if (dup) { skipped++; continue }

      const n = parseInt(getCol(r, '# of Dogs', 'Num Dogs', 'Number of Dogs', 'num_dogs', 'number_of_dogs')) || 1
      const rate = parseFloat(getCol(r, 'Rate/Dog-Day($)', 'Rate/Dog-Day', 'Rate', 'rate', 'rate_per_dog_day')) || 50
      const ddOv = parseInt(getCol(r, 'Override Dog-Days', 'Dog-Days', 'dog_days', 'DogDays')) || 0
      const dogNames = getCol(r, 'Dog Name', 'Dog Names', 'dog_names', 'dogs')
      const payType = getCol(r, 'Payment Type', 'payment_type') || 'Rover'
      const payStatus = getCol(r, 'Pay Status', 'Payment Status', 'payment_status') || 'unpaid'
      const amtRec = parseFloat(getCol(r, 'Amount Received ($)', 'Amount Received', 'amount_received') || '0') || 0
      const status = getCol(r, 'Booking Status', 'Status', 'status') || 'active'
      const cancelReason = getCol(r, 'Cancellation Reason', 'cancellation_reason') || null
      const notes = getCol(r, 'Notes', 'notes') || null

      const { days, dogDays } = calcDogDays(arr, dep, n)
      const dd = ddOv || dogDays

      toInsert.push({
        user_id: userId,
        customer_name: cust,
        dog_names: dogNames,
        number_of_dogs: n,
        arrival_date: arr,
        departure_date: dep,
        number_of_days: days,
        dog_days: dd,
        dog_days_override: ddOv || null,
        rate_per_dog_day: rate,
        total_revenue: dd * rate,
        payment_type: payType.includes('Rover') ? 'Rover' : payType.includes('Venmo') ? 'Venmo' : 'Rover',
        payment_status: payStatus.toLowerCase().includes('partial') ? 'partially paid' : payStatus.toLowerCase().includes('paid') ? 'paid' : 'unpaid',
        amount_received: amtRec,
        status: status.toLowerCase().includes('cancel') ? 'cancelled' : status.toLowerCase().includes('complet') ? 'completed' : 'active',
        cancellation_reason: cancelReason,
        notes: notes,
        month_allocations: splitRevenueByMonth(arr, dep, n, rate, ddOv || undefined),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      imported++
    }

    if (toInsert.length) {
      const { error } = await supabase.from('bookings').insert(toInsert)
      if (error) { setResult('Error: ' + error.message); setImporting(false); return }
    }
    setImporting(false)
    setResult(`✓ Imported ${imported} bookings, skipped ${skipped} duplicates/invalid.`)
    setRows([]); setHeaders([])
  }

  return (
    <AppShell>
      <div className="mb-5"><h1 className="text-xl font-semibold">Import CSV</h1><p className="text-sm text-gray-500">Upload existing booking data from Excel or CSV</p></div>
      <div className="card max-w-2xl">
        {!userId && <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">Not logged in — please refresh the page</div>}
        <label className="block border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:bg-gray-50 transition-colors mb-4">
          <div className="text-3xl mb-2">↑</div>
          <div className="font-medium text-gray-700">Click to upload CSV file</div>
          <div className="text-xs text-gray-400 mt-1">Supports your PawTracker CSV format</div>
          <input type="file" accept=".csv" className="hidden" onChange={handleFile} />
        </label>
        {result && <div className={`text-sm rounded-lg p-3 mb-4 ${result.startsWith('Error') ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>{result}</div>}
        {rows.length > 0 && (
          <div>
            <div className="bg-blue-50 text-blue-700 text-sm rounded-lg p-3 mb-4">
              <strong>{rows.length} rows found.</strong> Columns: {headers.join(', ')}
            </div>
            <div className="overflow-x-auto max-h-64 mb-4 border border-gray-100 rounded-lg">
              <table className="w-full text-xs">
                <thead><tr>{headers.map(h => <th key={h} className="th">{h}</th>)}</tr></thead>
                <tbody>{rows.slice(0, 10).map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50">{headers.map(h => <td key={h} className="td">{row[h]}</td>)}</tr>
                ))}</tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary" onClick={doImport} disabled={importing || !userId}>{importing ? 'Importing…' : `Import ${rows.length} Rows`}</button>
              <button className="btn" onClick={() => { setRows([]); setHeaders([]) }}>Clear</button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}