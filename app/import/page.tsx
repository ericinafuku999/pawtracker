'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { calcDogDays, splitRevenueByMonth } from '@/lib/utils'
import AppShell from '@/components/AppShell'
import Papa from 'papaparse'

export default function ImportPage() {
  const [rows, setRows] = useState<any[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState('')
  const supabase = createClient()

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: (r) => { setRows(r.data as any[]); setHeaders(Object.keys(r.data[0] || {})) }
    })
  }

  async function doImport() {
    setImporting(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: existing } = await supabase.from('bookings').select('arrival_date,departure_date,customer_name').eq('user_id', user.id)
    let imported = 0, skipped = 0
    const toInsert = []
    for (const r of rows) {
      const arr = r['Arrival Date'] || r['arrival_date'] || r['Arrival'] || r['arrival'] || ''
      const dep = r['Departure Date'] || r['departure_date'] || r['Departure'] || r['departure'] || ''
      const cust = r['Customer'] || r['customer'] || r['Customer Name'] || 'Imported'
      if (!arr || !dep) { skipped++; continue }
      const dup = (existing || []).some((b: any) => b.arrival_date === arr && b.departure_date === dep && b.customer_name === cust)
      if (dup) { skipped++; continue }
      const n = parseInt(r['Num Dogs'] || r['num_dogs'] || r['Number of Dogs'] || '1') || 1
      const rate = parseFloat(r['Rate'] || r['rate'] || '50') || 50
      const ddOv = parseInt(r['Dog-Days'] || r['dog_days'] || '') || 0
      const { days, dogDays } = calcDogDays(arr, dep, n)
      const dd = ddOv || dogDays
      toInsert.push({
        user_id: user.id, customer_name: cust, dog_names: r['Dogs'] || r['dogs'] || '',
        number_of_dogs: n, arrival_date: arr, departure_date: dep, number_of_days: days,
        dog_days: dd, dog_days_override: ddOv || null, rate_per_dog_day: rate,
        total_revenue: dd * rate, payment_type: r['Payment Type'] || r['payment_type'] || 'Rover',
        payment_status: 'unpaid', amount_received: 0, status: 'active',
        month_allocations: splitRevenueByMonth(arr, dep, n, rate, ddOv || undefined),
        notes: 'Imported from CSV', created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      })
      imported++
    }
    if (toInsert.length) await supabase.from('bookings').insert(toInsert)
    setImporting(false)
    setResult(`✓ Imported ${imported} bookings, skipped ${skipped} duplicates/invalid.`)
    setRows([]); setHeaders([])
  }

  return (
    <AppShell>
      <div className="mb-5"><h1 className="text-xl font-semibold">Import CSV</h1><p className="text-sm text-gray-500">Upload existing booking data from Excel or CSV</p></div>
      <div className="card max-w-2xl">
        <label className="block border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:bg-gray-50 transition-colors mb-4">
          <div className="text-3xl mb-2">↑</div>
          <div className="font-medium text-gray-700">Click to upload CSV file</div>
          <div className="text-xs text-gray-400 mt-1">Columns: Customer, Arrival Date, Departure Date, Dogs, Payment Type, Rate</div>
          <input type="file" accept=".csv" className="hidden" onChange={handleFile} />
        </label>

        {result && <div className="bg-emerald-50 text-emerald-700 text-sm rounded-lg p-3 mb-4">{result}</div>}

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
              <button className="btn btn-primary" onClick={doImport} disabled={importing}>{importing ? 'Importing…' : `Import ${rows.length} Rows`}</button>
              <button className="btn" onClick={() => { setRows([]); setHeaders([]) }}>Clear</button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
