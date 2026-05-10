'use client'
import { Suspense } from 'react'
import BookingForm from '@/components/BookingForm'

export default function EditBookingPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>}>
      <BookingForm bookingId={params.id} />
    </Suspense>
  )
}