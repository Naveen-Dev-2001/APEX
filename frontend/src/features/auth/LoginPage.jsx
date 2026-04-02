import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthLayout from '../../layout/AuthLayout';
import CustomInput from '../../shared/components/CustomInput';
import CustomButton from '../../shared/components/CustomButton';
import API from '../services/api';
import { useAuthStore } from '../../store/authStore';
import toast from '../../utils/toast';

const LoginPage = () => {
    const navigate = useNavigate();
    const setAuth = useAuthStore((state) => state.setAuth);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleLogin = async (e) => {
        e.preventDefault();
        if (!email || !password) {
            setError("Email and password are required");
            return;
        }

        try {
            setLoading(true);
            setError("");

            // Backend login route expects { email, password }
            const response = await API.post('/auth/login', { email, password });

            if (response.data && response.data.access_token) {
                // Store the auth token and user via Zustand (uses sessionStorage under the hood)
                const userObj = {
                    username: response.data.username || null,
                    email: response.data.email || null,
                    role: response.data.role || null
                };
                setAuth(response.data.access_token, userObj);

                // Navigate to dashboard upon successful login
                navigate('/select-entity');
            } else {
                setError("Invalid response from server");
            }
        } catch (err) {
            const errMsg = err.response?.data?.detail || err.message || 'Login failed';
            setError(errMsg);
            toast.error(errMsg);
        } finally {
            setLoading(false);
        }
    };


    return (
        <AuthLayout title="Welcome Back">


            <form onSubmit={handleLogin} className="w-full">
                <CustomInput
                    label="Email Address"
                    type="email"
                    placeholder="you@domain.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(""); }}
                    required
                    icon={
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                    }
                />

                <CustomInput
                    label="Password"
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    error={error}
                    required
                    icon={
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                    }
                />

                <div className="flex justify-end mb-6">
                    <a href="/forgot-password" className="text-sm text-blue-500 hover:underline">Forgot password?</a>
                </div>

                <div className="mt-4">
                    <CustomButton
                        type="submit"
                        variant="primary"
                        disabled={loading}
                        className="bg-blue-500 !text-white !h-11 !rounded font-medium w-full"
                    >
                        {loading ? "Signing in..." : "Login →"}
                    </CustomButton>
                </div>

                <div className="mt-6 text-center text-sm text-gray-500">
                    Don't have an account? <a href="/register" className="text-blue-500 hover:underline">Register</a>
                </div>
            </form>
        </AuthLayout>
    );
};

export default LoginPage;
