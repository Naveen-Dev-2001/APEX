import React, { useState, useCallback } from 'react';
import CustomInput from '../../../shared/components/CustomInput';
import CustomButton from '../../../shared/components/CustomButton';
import API from '../../services/api';

const NewPasswordStep = ({ email, onSubmit }) => {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (newPassword.length < 8) {
            setError("Password must be at least 8 characters long");
            return;
        }

        if (newPassword !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }
        
        try {
            setLoading(true);
            await API.post('/auth/reset-password', { email, new_password: newPassword });
            onSubmit();
        } catch (err) {
            setError(err.response?.data?.detail || err.response?.data?.message || err.message || "Failed to reset password");
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="w-full">
            <div className="text-center text-sm text-gray-600 mb-6">
                Set a new password for <span className="font-semibold text-gray-900">{email}</span>
            </div>

            <CustomInput
                label="New Password"
                type="password"
                placeholder="Minimum 8 characters"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setError(""); }}
                required
                icon={
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                }
            />

            <CustomInput
                label="Confirm New Password"
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
                error={error}
                required
                icon={
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                }
            />
            
            <div className="mt-6">
                <CustomButton 
                    type="submit" 
                    variant="primary" 
                    disabled={loading}
                    className="bg-blue-500 hover:bg-blue-600 !text-white !h-11 !rounded font-medium"
                >
                    {loading ? "Updating..." : "Reset Password →"}
                </CustomButton>
            </div>
            
            <div className="mt-6 text-center text-sm text-gray-500">
                Back to <a href="/login" className="text-blue-500 hover:underline">Login</a>
            </div>
        </form>
    );
};

export default NewPasswordStep;
