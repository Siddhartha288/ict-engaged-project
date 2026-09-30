import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Claim from './pages/Claim';
import Assessment from './pages/Assessment';
import Dashboard from './pages/Dashboard';
import AdvisorPortal from './pages/AdvisorPortal';
import BusinessDetail from './pages/BusinessDetail';
import AdvisorRunAssessment from './pages/AdvisorRunAssessment';
import ProblemsAndSolutions from './pages/ProblemsAndSolutions';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen">
          <Navbar />
          <main>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/problems-solutions" element={<ProblemsAndSolutions />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/claim" element={<Claim />} />
              <Route
                path="/assessment"
                element={
                  <ProtectedRoute>
                    <Assessment />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/advisor"
                element={
                  <ProtectedRoute roles={['advisor']}>
                    <AdvisorPortal />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/advisor/businesses/:id"
                element={
                  <ProtectedRoute roles={['advisor']}>
                    <BusinessDetail />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/advisor/businesses/:id/assessment"
                element={
                  <ProtectedRoute roles={['advisor']}>
                    <AdvisorRunAssessment />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
