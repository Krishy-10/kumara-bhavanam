/** Row shapes as Supabase returns them. Dates are 'YYYY-MM-DD' strings. */
import type { ISODate } from '@/lib/dates';
import type { ChargeKind, PaymentType, PricingMode, StayStatus } from '@/lib/money';

export type PaymentMode = 'cash' | 'upi' | 'bank_transfer' | 'card' | 'other';
export type Language = 'en' | 'ta';

/** One row of the stay_totals view: the stay, its guest, and its money. */
export interface StayRow {
  stay_id: string;
  guest_id: string;
  guest_name: string;
  guest_phone: string;
  bill_no: string;
  check_in: ISODate;
  check_out: ISODate;
  guests_count: number;
  status: StayStatus;
  pricing_mode: PricingMode;
  nightly_rate: number | null;
  fixed_amount: number | null;
  occasion: string | null;
  /** How they found us: none, one or several of SOURCES. */
  sources: string[];
  /** Who referred them (only when sources includes Referral). */
  referrer_id: string | null;
  referrer_name: string | null;
  notes: string | null;
  created_at: string;
  created_by: string;
  nights: number;
  base: number;
  charges: number;
  discounts: number;
  final: number;
  paid: number;
  refunded: number;
  net_paid: number;
  balance: number;
  /** Referrer commission (migration 004). Never on the guest's bill. */
  commission_id: string | null;
  commission: number;
  commission_paid: number;
  /** commission − commission_paid, from the view. */
  commission_owed: number;
}

/** Someone who sends guests: a past guest, priest, agent or driver. */
export interface ReferrerRow {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  created_by: string;
}

export interface GuestRow {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  language: Language;
  nationality: string;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  created_by: string;
}

export interface PaymentRow {
  id: string;
  stay_id: string;
  amount: number;
  type: PaymentType;
  mode: PaymentMode;
  paid_on: ISODate;
  reference: string | null;
  voided: boolean;
  void_reason: string | null;
  voided_at: string | null;
  voided_by: string | null;
  created_at: string;
  created_by: string;
}

export interface ChargeRow {
  id: string;
  stay_id: string;
  kind: ChargeKind;
  label: string;
  amount: number;
  voided: boolean;
  void_reason: string | null;
  created_at: string;
  created_by: string;
}

export interface BlockedRow {
  id: string;
  start_date: ISODate;
  end_date: ISODate;
  reason: string;
  created_by: string;
}

/** What New booking sends to the create_booking() database function. */
export interface BookingPayload {
  created_by: string;
  guest: {
    phone: string;
    name: string;
    city: string | null;
    email: string | null;
    language: Language;
    nationality: string;
  };
  stay: {
    check_in: ISODate;
    check_out: ISODate;
    guests_count: number;
    status: StayStatus;
    pricing_mode: PricingMode;
    nightly_rate: number | null;
    fixed_amount: number | null;
    occasion: string | null;
    sources: string[];
    notes: string | null;
  };
  /** Only for a Referral booking: an existing referrer, or a new one to add. */
  referrer: { id: string } | { name: string; phone: string | null } | null;
  charges: { kind: ChargeKind; label: string; amount: number }[];
  /** The first payment. `type` 'payment' is for a past stay paid at the time; default 'advance'. */
  advance: { amount: number; mode: PaymentMode; paid_on: ISODate; reference: string | null; type?: 'advance' | 'payment' } | null;
}

export interface BookingResult {
  stay_id: string;
  bill_no: string;
  guest_id: string;
  referrer_id: string | null;
}

export type DocType = 'aadhaar' | 'passport' | 'driving_licence' | 'voter_id' | 'other';

/** That an ID was seen. Never the ID itself: type and last 4 only. */
export interface IdCheckRow {
  id: string;
  stay_id: string;
  doc_type: DocType;
  last4: string | null;
  checked_by: string;
  checked_at: string;
  created_by: string;
}

export type TemplateKind = 'thank_you' | 'review_request';

export interface TemplateRow {
  id: string;
  kind: TemplateKind;
  language: Language;
  title: string;
  body: string;
  is_preset: boolean;
  sort_order: number;
  archived_at: string | null;
  created_at: string;
  created_by: string;
}

export interface SettingsRow {
  property_name: string;
  contact_phone: string | null;
  address: string | null;
  google_review_link: string | null;
}

/** Commission typed on a booking, owed to its referrer (migration 004). Void-only. */
export interface CommissionRow {
  id: string;
  stay_id: string;
  amount: number;
  voided: boolean;
  void_reason: string | null;
  voided_at: string | null;
  voided_by: string | null;
  created_at: string;
  created_by: string;
}

/** Commission paid to the referrer, in full. Counted by paid_on. Void-only. */
export interface CommissionPayoutRow {
  id: string;
  commission_id: string;
  amount: number;
  mode: PaymentMode;
  paid_on: ISODate;
  reference: string | null;
  voided: boolean;
  void_reason: string | null;
  voided_at: string | null;
  voided_by: string | null;
  created_at: string;
  created_by: string;
}

export interface NewCommission {
  stay_id: string;
  amount: number;
  created_by: string;
}

export interface NewCommissionPayout {
  commission_id: string;
  amount: number;
  mode: PaymentMode;
  paid_on: ISODate;
  reference: string | null;
  created_by: string;
}

export interface NewPayment {
  stay_id: string;
  amount: number;
  type: PaymentType;
  mode: PaymentMode;
  paid_on: ISODate;
  reference: string | null;
  created_by: string;
}

export interface NewCharge {
  stay_id: string;
  kind: ChargeKind;
  label: string;
  amount: number;
  created_by: string;
}

export interface NewBlocked {
  start_date: ISODate;
  end_date: ISODate;
  reason: string;
  created_by: string;
}

export interface NewTemplate {
  kind: TemplateKind;
  language: Language;
  title: string;
  body: string;
  created_by: string;
}

export interface GuestEdit {
  name: string;
  email: string | null;
  city: string | null;
  notes: string | null;
  language: Language;
}
