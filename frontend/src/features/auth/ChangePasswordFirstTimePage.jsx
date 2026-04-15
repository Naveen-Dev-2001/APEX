import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import AuthLayout from '../../layout/AuthLayout';
import CustomInput from '../../shared/components/CustomInput';
import CustomButton from '../../shared/components/CustomButton';
import API from '../services/api';
import toast from '../../utils/toast';

const ChangePasswordFirstTimePage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const email = location.state?.email || '';
    
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

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
            setError('');
            
            await API.post('/auth/change-password-first-time', { 
                email, 
                new_password: newPassword 
            });

            toast.success('Password updated successfully! Please login again.');
            navigate('/login');
        } catch (err) {
            const errMsg = err.response?.data?.detail || err.message || 'Failed to update password';
            setError(errMsg);
            toast.error(errMsg);
        } finally {
            setLoading(false);
        }
    };

    if (!email) {
        navigate('/login');
        return null;
    }

    return (
        <AuthLayout title="Change Password">
            <div className="text-center text-sm text-gray-600 mb-8">
                Since your account was created by an admin, you must set a new password for <span className="font-semibold text-gray-900">{email}</span>
            </div>

            <form onSubmit={handleSubmit} className="w-full space-y-5">
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

                <div className="mt-8">
                    <CustomButton 
                        type="submit" 
                        variant="primary" 
                        disabled={loading}
                        className="bg-blue-500 hover:bg-blue-600 !text-white !h-11 !rounded font-medium w-full shadow-lg shadow-blue-500/20"
                    >
                        {loading ? "Updating..." : "Update Password →"}
                    </CustomButton>
                </div>

                <div className="mt-6 text-center text-sm text-gray-500">
                    Back to <button type="button" onClick={() => navigate('/login')} className="text-blue-500 hover:underline">Login</button>
                </div>
            </form>
        </AuthLayout>
    );
};

export default ChangePasswordFirstTimePage;
