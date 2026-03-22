import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthLayout from '../../layout/AuthLayout';
import CustomInput from '../../shared/components/CustomInput';
import CustomButton from '../../shared/components/CustomButton';
import API from '../services/api';

const LoginPage = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const toggleShowPassword = useCallback(() => setShowPassword(prev => !prev), []);

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
                // Store the auth token locally
                localStorage.setItem('access_token', response.data.access_token);
                // Also store user info if needed
                if (response.data.username) localStorage.setItem('username', response.data.username);
                if (response.data.role) localStorage.setItem('role', response.data.role);

                // Navigate to dashboard upon successful login
                navigate('/dashboard');
            } else {
                setError("Invalid response from server");
            }
        } catch (err) {
            setError(err.response?.data?.detail || err.message || "Login failed");
        } finally {
            setLoading(false);
        }
    };

    const EyeIcon = (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
    );

    const EyeSlashIcon = (
        <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
        </svg>
    );

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
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    error={error}
                    required
                    icon={
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                    }
                    rightIcon={showPassword ? EyeIcon : EyeSlashIcon}
                    onRightIconClick={toggleShowPassword}
                />

                <div className="flex justify-end mb-6">
                    <a href="/forgot-password" className="text-sm text-blue-500 hover:underline">Forgot password?</a>
                </div>

                <div className="mt-4">
                    <CustomButton
                        type="submit"
                        variant="primary"
                        disabled={loading}
                        className="bg-blue-500 hover:bg-blue-600 !text-white !h-11 !rounded font-medium w-full"
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
