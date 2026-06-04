import './App.css'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AppLayout from './layout/AppLayout';
import LoginPage from './features/auth/LoginPage';
import SelectEntityPage from './features/entity/SelectEntityPage';
import DashboardPage from './features/dashboard/DashboardPage';
import MasterDataPage from './features/masterData/MasterDataPage';
import SettingsPage from './features/settings/SettingsPage';
import AdminPage from './features/admin/AdminPage';
import SuperAdminPage from './features/admin/SuperAdminPage';
import ProtectedRoute from './components/ProtectedRoute';
import TestDatePicker from './pages/TestDatePicker';
import ToastProvider from './components/ToastProvider';
import ChangePasswordFirstTimePage from './features/auth/ChangePasswordFirstTimePage';
import SSOCallback from './features/auth/SSOCallback';

import { ConfigProvider } from 'antd';
import Invoice from './features/invoices/Invoice';
import CodingPage from './features/invoices/CodingPage';
import ApprovalsPage from './features/invoices/ApprovalsPage';

import ForgotPasswordPage from './features/auth/ForgotPasswordPage';

function App() {

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#24A1DD',
          fontFamily: '"Creato Display", sans-serif',
        },
      }}
    >
      <Router>
        <ToastProvider />
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LoginPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/test-date-picker" element={<TestDatePicker />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/sso" element={<SSOCallback />} />

          {/* Protected Routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/select-entity" element={<SelectEntityPage />} />
            <Route path="/change-password-first-time" element={<ChangePasswordFirstTimePage />} />

            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/invoices" element={<Invoice />} />
              <Route path="/coding" element={<CodingPage />} />
              <Route path="/approvals" element={<ApprovalsPage />} />
              <Route path="/master-data" element={<MasterDataPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/superadmin" element={<SuperAdminPage />} />
            </Route>
          </Route>
        </Routes>
      </Router>
    </ConfigProvider>
  );
}

export default App
