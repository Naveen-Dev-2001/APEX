import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthLayout from '../../layout/AuthLayout';
import Stepper from '../../shared/components/Stepper';
import EmailStep from './components/EmailStep';
import VerifyStep from './components/VerifyStep';
import DetailsStep from './components/DetailsStep';
import API from '../services/api';

const STEPS = [
    { number: 1, label: 'Email' },
    { number: 2, label: 'Verify' },
    { number: 3, label: 'Details' }
];

const RegisterPage = () => {
    const navigate = useNavigate();
    const [currentStep, setCurrentStep] = useState(1);

    // Form State
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const handleNextStep = useCallback(() => {
        setCurrentStep(prev => prev + 1);
    }, []);

    const handleBackToEmail = useCallback(() => {
        setCurrentStep(1);
        setOtp('');
    }, []);

    const handleFinalSubmit = async () => {
        try {
            // Replace with real registration endpoint
            const payload = {
                email,
                username,
                password
            };
            console.log("Submitting:", payload);

            // Real API call
            await API.post('/auth/register', payload);

            navigate('/login');
        } catch (error) {
            throw new Error(error.response?.data?.message || "Registration failed");
        }
    };

    return (
        <AuthLayout>
            <Stepper steps={STEPS} currentStep={currentStep} />

            <div className="mt-8 transition-all duration-300">
                {currentStep === 1 && (
                    <EmailStep
                        email={email}
                        setEmail={setEmail}
                        onNext={handleNextStep}
                    />
                )}

                {currentStep === 2 && (
                    <VerifyStep
                        email={email}
                        otp={otp}
                        setOtp={setOtp}
                        onNext={handleNextStep}
                        onBack={handleBackToEmail}
                    />
                )}

                {currentStep === 3 && (
                    <DetailsStep
                        username={username}
                        setUsername={setUsername}
                        password={password}
                        setPassword={setPassword}
                        confirmPassword={confirmPassword}
                        setConfirmPassword={setConfirmPassword}
                        onSubmit={handleFinalSubmit}
                    />
                )}
            </div>
        </AuthLayout>
    );
};

export default RegisterPage;
