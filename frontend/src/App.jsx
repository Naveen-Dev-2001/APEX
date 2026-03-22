import { useState } from 'react'
import './App.css'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AppLayout from './layout/AppLayout';
import RegisterPage from './features/auth/RegisterPage';

function App() {

  return (
    <Router>
      {/* <ToastProvider /> */}
      <Routes>
        <Route >
          <Route path="/" element={<RegisterPage />} />
          {/* <Route path="/" element={<LoginPage />} /> */}
          {/* <Route path="/signup" element={<SignupForm />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/update-password" element={<UpdatePasswordPage />} /> */}
        </Route>
        {/* <Route path="/sso" element={<SSO />} /> */}

        <Route >
          <Route element={<AppLayout />}>
            {/* <Route path="/dashboard" element={<ChatPage />} /> */}
          </Route>
        </Route>
      </Routes>
    </Router>
  );
}

export default App
