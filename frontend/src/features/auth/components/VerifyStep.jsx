import React, { useState, useCallback } from 'react';
import CustomInput from '../../../shared/components/CustomInput';
import CustomButton from '../../../shared/components/CustomButton';
import API from '../../services/api';

const VerifyStep = ({ email, otp, setOtp, onNext, onBack }) => {
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleOtpChange = useCallback((e) => {
        setOtp(e.target.value);
        if (error) setError("");
    }, [setOtp, error]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!otp || otp.length < 6) {
            setError("Please enter a valid 6-digit code");
            return;
        }
        
        try {
            setLoading(true);
            await API.post('/auth/verify-otp', { email, otp_code: otp, purpose: 'registration' });
            onNext();
        } catch (err) {
            setError(err.message || "Failed to verify OTP");
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="w-full">
            <div className="text-center text-sm text-gray-600 mb-6">
                Verification code sent to <span className="font-semibold text-gray-900">{email}</span>
            </div>

            <CustomInput
                label="Enter OTP"
                type="text"
                placeholder="6-digit code"
                value={otp}
                onChange={handleOtpChange}
                error={error}
                maxLength={6}
                required
                icon={
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                }
            />
            
            <div className="mt-6 space-y-3">
                <CustomButton 
                    type="submit" 
                    variant="primary" 
                    disabled={loading}
                    className="bg-blue-500 hover:bg-blue-600 !text-white !h-11 !rounded font-medium mb-3"
                >
                    {loading ? "Verifying..." : "Verify OTP →"}
                </CustomButton>

                <button 
                    type="button" 
                    onClick={onBack}
                    className="w-full text-center text-blue-500 text-sm hover:underline py-2"
                >
                    Change Email
                </button>
            </div>
            
            <div className="mt-4 text-center text-sm text-gray-500 relative top-2">
                Already have an account? <a href="/login" className="text-blue-500 hover:underline">Login</a>
            </div>
        </form>
    );
};

export default VerifyStep;
