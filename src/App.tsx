import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useStore } from './store/useStore';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Calendar from './pages/Calendar';
import Admin from './pages/Admin';
import Profile from './pages/Profile';
import Layout from './components/Layout';

import { NotificationProvider } from './context/NotificationContext';

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, user, fetchUsers, fetchTasks, fetchOccurrenceOverrides, fetchSmtpSettings, fetchAppSettings, fetchCategories, fetchTemplates } = useStore();
  const location = useLocation();

  React.useEffect(() => {
    if (isAuthenticated) {
      fetchUsers();
      fetchTasks();
      fetchOccurrenceOverrides();
      fetchAppSettings();
      fetchCategories();
      if (user?.role === 'admin') {
        fetchSmtpSettings();
        fetchTemplates();
      }
    }
  }, [isAuthenticated, user?.role]);

  const redirectTarget = `${location.pathname}${location.search}${location.hash}`;
  return isAuthenticated ? <>{children}</> : <Navigate to={`/login?redirect=${encodeURIComponent(redirectTarget)}`} replace />;
};

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useStore();
  return user?.role === 'admin' ? <>{children}</> : <Navigate to="/" replace />;
};

function App() {
  const { checkAuth, isLoading } = useStore();

  React.useEffect(() => {
    checkAuth();
  }, []);

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>;
  }

  return (
    <Router>
      <NotificationProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <PrivateRoute>
                <Routes>
                  <Route element={<Layout />}>
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/calendar" element={<Calendar />} />
                    <Route path="/profile" element={<Profile />} />
                    <Route
                      path="/admin"
                      element={
                        <AdminRoute>
                          <Admin />
                        </AdminRoute>
                      }
                    />
                  </Route>
                </Routes>
              </PrivateRoute>
            }
          />
        </Routes>
      </NotificationProvider>
    </Router>
  );
}

export default App;
