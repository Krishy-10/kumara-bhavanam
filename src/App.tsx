import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AccessGate } from '@/session/AccessGate';
import { RequireUser } from '@/session/RequireUser';
import { UserProvider } from '@/session/UserContext';
import { Home } from '@/screens/Home';
import { NewBooking } from '@/screens/NewBooking/NewBooking';
import { Picker } from '@/screens/Picker';
import { StayDetail } from '@/screens/Stay/StayDetail';
import { Stays } from '@/screens/Stays/Stays';
import { Message } from '@/screens/Message/Message';
import { GuestPage } from '@/screens/Guests/GuestPage';
import { Guests } from '@/screens/Guests/Guests';
import { Pipeline } from '@/screens/Pipeline/Pipeline';
import { Ledger } from '@/screens/Ledger/Ledger';
import { AddPastStay } from '@/screens/Ledger/AddPastStay';
import { Tasks } from '@/screens/Tasks/Tasks';
import { Checklists } from '@/screens/Tasks/Checklists';

// Charts are heavy; load Insights only when it's opened.
const Insights = lazy(() => import('@/screens/Insights/Insights').then((m) => ({ default: m.Insights })));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true },
    mutations: { retry: 0 },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Respect the phone's "reduce motion" setting everywhere. */}
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <AccessGate>
            <UserProvider>
              <ErrorBoundary>
              <Routes>
                <Route path="/who" element={<Picker />} />
                <Route path="/" element={<RequireUser><Home /></RequireUser>} />
                <Route path="/book" element={<RequireUser><NewBooking /></RequireUser>} />
                <Route path="/stays/:stayId" element={<RequireUser><StayDetail /></RequireUser>} />
                <Route path="/stays/:stayId/message" element={<RequireUser><Message /></RequireUser>} />
                <Route path="/stays" element={<RequireUser><Stays /></RequireUser>} />
                <Route path="/ledger" element={<RequireUser><Ledger /></RequireUser>} />
                <Route path="/ledger/past" element={<RequireUser><AddPastStay /></RequireUser>} />
                <Route path="/pipeline" element={<RequireUser><Pipeline /></RequireUser>} />
                <Route path="/tasks" element={<RequireUser><Tasks /></RequireUser>} />
                <Route path="/checklists" element={<RequireUser><Checklists /></RequireUser>} />
                <Route path="/guests" element={<RequireUser><Guests /></RequireUser>} />
                <Route path="/guests/:guestId" element={<RequireUser><GuestPage /></RequireUser>} />
                <Route path="/insights" element={<RequireUser><Suspense fallback={null}><Insights /></Suspense></RequireUser>} />
                <Route path="*" element={<RequireUser><Home /></RequireUser>} />
              </Routes>
              </ErrorBoundary>
            </UserProvider>
          </AccessGate>
        </BrowserRouter>
      </MotionConfig>
    </QueryClientProvider>
  );
}
