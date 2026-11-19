import { BrowserRouter, Route, Routes } from 'react-router';
import { Home } from '@/screens/Home';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}
