/**
 * src/App.jsx
 */
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth, AuthProvider } from './store/AuthContext';
import { HOSProvider }           from './store/HOSContext';
import './i18n/index.js';

import LoginPage     from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import LogbookPage   from './pages/LogbookPage';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center',
        justifyContent:'center', background:'#0f172a', color:'#64748b' }}>
        Loading...
      </div>
    );
  }
  return user ? children : <Navigate to="/login" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={
        <PrivateRoute>
          <HOSProvider>
            <DashboardPage />
          </HOSProvider>
        </PrivateRoute>
      } />
      <Route path="/logbook" element={
        <PrivateRoute>
          <HOSProvider>
            <LogbookPage />
          </HOSProvider>
        </PrivateRoute>
      } />
      <Route path="/dvir"       element={<PrivateRoute><div style={{color:'#fff',padding:20}}>DVIR — coming soon</div></PrivateRoute>} />
      <Route path="/transfer"   element={<PrivateRoute><div style={{color:'#fff',padding:20}}>DOT Transfer — coming soon</div></PrivateRoute>} />
      <Route path="/violations" element={<PrivateRoute><div style={{color:'#fff',padding:20}}>Violations — coming soon</div></PrivateRoute>} />
      <Route path="*"           element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
