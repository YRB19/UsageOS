import { Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import AccountHistoryPage from './pages/AccountHistoryPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/account/:id" element={<AccountHistoryPage />} />
    </Routes>
  );
}