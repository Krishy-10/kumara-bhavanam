import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { monthRange } from '@/lib/dates';
import { createBooking, fetchBlockedDates, fetchGuestByPhone, fetchPaymentsBetween, fetchStays } from './api';
import type { BookingPayload } from './types';

export const keys = {
  stays: ['stays'] as const,
  payments: (month: string) => ['payments', month] as const,
  blocked: ['blocked'] as const,
  guestByPhone: (phone: string) => ['guest', 'phone', phone] as const,
};

export function useStays() {
  return useQuery({ queryKey: keys.stays, queryFn: fetchStays });
}

/** Payments dated in one calendar month ('YYYY-MM'). */
export function useMonthPayments(month: string) {
  const { start, end } = monthRange(month);
  return useQuery({ queryKey: keys.payments(month), queryFn: () => fetchPaymentsBetween(start, end) });
}

export function useBlockedDates() {
  return useQuery({ queryKey: keys.blocked, queryFn: fetchBlockedDates });
}

/** Looks a guest up once a full phone number has been typed. */
export function useGuestByPhone(phone: string | null) {
  return useQuery({
    queryKey: keys.guestByPhone(phone ?? ''),
    queryFn: () => fetchGuestByPhone(phone!),
    enabled: phone !== null,
    staleTime: 10_000,
  });
}

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: BookingPayload) => createBooking(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.stays });
      void qc.invalidateQueries({ queryKey: ['payments'] });
      void qc.invalidateQueries({ queryKey: ['guest'] });
    },
  });
}
