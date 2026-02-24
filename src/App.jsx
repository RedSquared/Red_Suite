import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import HomePage from './pages/HomePage';
import EveMultisellPage from './pages/EveMultisellPage';
import EveOrdersPage from './pages/EveOrdersPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<HomePage />} />
        <Route path="eve-multisell" element={<EveMultisellPage />} />
        <Route path="eve-orders" element={<EveOrdersPage />} />
        <Route path="home" element={<Navigate to="/" replace />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
