import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthLayout from '../../layout/AuthLayout';
import Stepper from '../../shared/components/Stepper';
import EmailStep from './components/EmailStep';
import VerifyStep from './components/VerifyStep';
import NewPasswordStep from './components/NewPasswordStep';
import toast from '../../utils/toast';

const STEPS = [
    { number: 1, label: 'Email' },
    { number: 2, label: 'Verify' },
    { number: 3, label: 'Reset' }
];

const ForgotPasswordPage = () => {
    const navigate = useNavigate();
    const [currentStep, setCurrentStep] = useState(1);

    // Form State
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');

    const handleNextStep = useCallback(() => {
        setCurrentStep(prev => prev + 1);
    }, []);

    const handleBackToEmail = useCallback(() => {
        setCurrentStep(1);
        setOtp('');
    }, []);

    const handleFinalSubmit = async () => {
        toast.success("Password reset successfully!");
        navigate('/login');
    };

    return (
        <AuthLayout title="Reset Password">
            <Stepper steps={STEPS} currentStep={currentStep} />

            <div className="mt-8 transition-all duration-300">
                {currentStep === 1 && (
                    <EmailStep
                        email={email}
                        setEmail={setEmail}
                        onNext={handleNextStep}
                        purpose="forgot_password"
                    />
                )}

                {currentStep === 2 && (
                    <VerifyStep
                        email={email}
                        otp={otp}
                        setOtp={setOtp}
                        onNext={handleNextStep}
                        onBack={handleBackToEmail}
                        purpose="forgot_password"
                    />
                )}

                {currentStep === 3 && (
                    <NewPasswordStep
                        email={email}
                        onSubmit={handleFinalSubmit}
                    />
                )}
            </div>
        </AuthLayout>
    );
};

export default ForgotPasswordPage;
