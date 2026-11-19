import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { AccessGate } from '@/session/AccessGate';
import { RequireUser } from '@/session/RequireUser';
import { UserProvider } from '@/session/UserContext';
import { Home } from '@/screens/Home';
import { NewBooking } from '@/screens/NewBooking/NewBooking';
import { Picker } from '@/screens/Picker';
import { ComingNext, StaySummary } from '@/screens/Placeholder';

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
              <Routes>
                <Route path="/who" element={<Picker />} />
                <Route path="/" element={<RequireUser><Home /></RequireUser>} />
                <Route path="/book" element={<RequireUser><NewBooking /></RequireUser>} />
                <Route path="/stays/:stayId" element={<RequireUser><StaySummary /></RequireUser>} />
                <Route path="/stays" element={<RequireUser><ComingNext title="Stays" /></RequireUser>} />
                <Route path="/guests" element={<RequireUser><ComingNext title="Guests" /></RequireUser>} />
                <Route path="/insights" element={<RequireUser><ComingNext title="Insights" /></RequireUser>} />
                <Route path="*" element={<RequireUser><Home /></RequireUser>} />
              </Routes>
            </UserProvider>
          </AccessGate>
        </BrowserRouter>
      </MotionConfig>
    </QueryClientProvider>
  );
}
