import { useState } from 'react'
import './App.css'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AppLayout from './layout/AppLayout';
import RegisterPage from './features/auth/RegisterPage';
import LoginPage from './features/auth/LoginPage';
import SelectEntityPage from './features/entity/SelectEntityPage';
import DashboardPage from './features/dashboard/DashboardPage';
import ProtectedRoute from './components/ProtectedRoute';

function App() {

  return (
    <Router>
      {/* <ToastProvider /> */}
      <Routes>
        <Route >
          <Route path="/" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<LoginPage />} />
          {/* <Route path="/signup" element={<SignupForm />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/update-password" element={<UpdatePasswordPage />} /> */}
        </Route>

        {/* Protected Routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="/select-entity" element={<SelectEntityPage />} />
          {/* <Route path="/sso" element={<SSO />} /> */}

          <Route >
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </Router>
  );
}

export default App
