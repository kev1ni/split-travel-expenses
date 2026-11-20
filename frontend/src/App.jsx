import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { HomePage } from './pages/HomePage';
import { TripsPage } from './pages/TripsPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { SettlementsPage } from './pages/SettlementsPage';
import { TripDetailPage } from './pages/TripDetailPage';
import { TripCreatePage } from './pages/TripCreatePage';
import { InviteAcceptPage } from './pages/InviteAcceptPage';
import { CashExpensePage } from './pages/CashExpensePage';
import { CardExpensePage } from './pages/CardExpensePage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* 공개 라우트 */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          {/* 인증 보호 라우트 */}
          <Route
            path="/home"
            element={
              <ProtectedRoute>
                <HomePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/trips"
            element={
              <ProtectedRoute>
                <TripsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/trips/new"
            element={
              <ProtectedRoute>
                <TripCreatePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/trips/:tripId"
            element={
              <ProtectedRoute>
                <TripDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/trips/:tripId/expenses/cash"
            element={
              <ProtectedRoute>
                <CashExpensePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/trips/:tripId/expenses/card"
            element={
              <ProtectedRoute>
                <CardExpensePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/invite/:inviteCode"
            element={
              <ProtectedRoute>
                <InviteAcceptPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/expenses"
            element={
              <ProtectedRoute>
                <ExpensesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settlements"
            element={
              <ProtectedRoute>
                <SettlementsPage />
              </ProtectedRoute>
            }
          />

          {/* 정의되지 않은 경로 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
