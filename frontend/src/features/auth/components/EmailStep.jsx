import React, { useState, useCallback } from 'react';
import CustomInput from '../../../shared/components/CustomInput';
import CustomButton from '../../../shared/components/CustomButton';
import API from '../../services/api';

const EmailStep = ({ email, setEmail, onNext }) => {
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleEmailChange = useCallback((e) => {
        setEmail(e.target.value);
        if (error) setError("");
    }, [setEmail, error]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!email) {
            setError("Email Address is required");
            return;
        }
        
        try {
            setLoading(true);
            await API.post('/auth/send-otp', { email, purpose: 'registration' });
            onNext();
        } catch (err) {
            setError(err.response?.data?.detail || err.response?.data?.message || err.message || "Failed to send OTP");
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="w-full">
            <CustomInput
                label="Email Address"
                type="email"
                placeholder="you@domain.com"
                value={email}
                onChange={handleEmailChange}
                error={error}
                required
                icon={
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                }
            />
            
            <div className="mt-6">
                <CustomButton 
                    type="submit" 
                    variant="primary" 
                    disabled={loading}
                    className="bg-blue-500 hover:bg-blue-600 !text-white !h-11 !rounded font-medium"
                >
                    {loading ? "Sending..." : "Send OTP →"}
                </CustomButton>
            </div>
            
            <div className="mt-6 text-center text-sm text-gray-500">
                Already have an account? <a href="/login" className="text-blue-500 hover:underline">Login</a>
            </div>
        </form>
    );
};

export default EmailStep;
