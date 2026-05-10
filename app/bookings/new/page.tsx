import { Suspense } from 'react'
import BookingForm from '@/components/BookingForm'

export default function NewBookingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">Loading…</div>}>
      <BookingForm />
    </Suspense>
  )
}