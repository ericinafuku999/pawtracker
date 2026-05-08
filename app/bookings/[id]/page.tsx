import BookingForm from '@/components/BookingForm'
export default function EditBookingPage({ params }: { params: { id: string } }) {
  return <BookingForm bookingId={params.id} />
}
