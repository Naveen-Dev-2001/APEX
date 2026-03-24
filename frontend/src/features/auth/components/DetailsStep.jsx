import React, { useState, useCallback } from 'react';
import CustomInput from '../../../shared/components/CustomInput';
import CustomButton from '../../../shared/components/CustomButton';

const DetailsStep = ({ username, setUsername, password, setPassword, confirmPassword, setConfirmPassword, onSubmit }) => {
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!username || !password || !confirmPassword) {
            setError("All fields are required");
            return;
        }
        if (password !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }
        if (password.length < 8) {
            setError("Password must be at least 8 characters");
            return;
        }

        try {
            setLoading(true);
            await onSubmit();
        } catch (err) {
            setError(err.message || "Failed to complete registration");
        } finally {
            setLoading(false);
        }
    };


    return (
        <form onSubmit={handleSubmit} className="w-full">
            <CustomInput
                label="Username"
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError(""); }}
                icon={
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                }
                required
            />

            <CustomInput
                label="Password"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                icon={
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                }
                required
            />

            <CustomInput
                label="Confirm Password"
                type="password"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
                error={error}
                icon={
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                }
                required
            />
            
            <div className="mt-8">
                <CustomButton 
                    type="submit" 
                    variant="primary" 
                    disabled={loading}
                    className="bg-blue-500 hover:bg-blue-600 !text-white !h-11 !rounded font-medium w-full"
                >
                    {loading ? "Registering..." : "Complete Registration →"}
                </CustomButton>
            </div>
            
            <div className="mt-6 text-center text-sm text-gray-500">
                Already have an account? <a href="/login" className="text-blue-500 hover:underline">Login</a>
            </div>
        </form>
    );
};

export default DetailsStep;
