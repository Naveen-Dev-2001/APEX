import { useState } from 'react'
import './App.css'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import AppLayout from './layout/AppLayout';

function App() {

  return (
    <>
      {/* <ToastProvider /> */}
      <Routes>
        <Route >
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
    </>
  );
}

export default App
