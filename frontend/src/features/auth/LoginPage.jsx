import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../../layout/AuthLayout';
import CustomInput from '../../shared/components/CustomInput';
import CustomButton from '../../shared/components/CustomButton';
import API from '../services/api';
import { useAuthStore } from '../../store/authStore';
import toast from '../../utils/toast';
import { icons } from '../../file';
import AlertModal from '../../shared/components/AlertModal';
import { getBackendURL } from '../../utils/getBackendURL';
import { getERPSystem } from '../../utils/envHelper';
import { useCommonStore } from '../../store/common.store';
import { useInvoiceStore } from '../../store/invoice.store';

const LoginPage = () => {
    const navigate = useNavigate();
    const setAuth = useAuthStore((state) => state.setAuth);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showAlert, setShowAlert] = useState(false);
    const [alertMessage, setAlertMessage] = useState('');

    const handleLogin = async (e) => {
        e.preventDefault();
        if (!email || !password) {
            setError('Email and password are required');
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            setAlertMessage('Invalid Email Address');
            setShowAlert(true);
            return;
        }

        try {
            setLoading(true);
            setError('');

            // Backend login route expects { email, password }
            const response = await API.post('/auth/login', { email, password });

            if (response.data && response.data.access_token) {
                // Store the auth token and user via Zustand (uses sessionStorage under the hood)
                const userObj = {
                    id: response.data.id || null,
                    username: response.data.username || null,
                    email: response.data.email || null,
                    role: response.data.role || null,
                    department: response.data.department || null,
                    email_notifications: response.data.email_notifications !== undefined ? response.data.email_notifications : true
                };
                setAuth(response.data.access_token, userObj, response.data.refresh_token);

                // Check if user must change password on first login
                if (response.data.ispasswordchange === false) {
                    toast.info('Please change your password to continue');
                    navigate('/change-password-first-time', { state: { email: response.data.email || email } });
                } else if (response.data.is_module_selection_required) {
                    if (getERPSystem() === 'Zoho') {
                        const entityId = 'DEFAULT';
                        const entityName = 'Top Level';
                        const entityDisplayName = `${entityId} - ${entityName}`;
                        
                        // Set the active role (similar to SelectEntityPage default behavior)
                        const userRoles = userObj.role ? userObj.role.split(',') : [];
                        const activeRole = sessionStorage.getItem('active_role') || userRoles[0] || 'approver';
                        useAuthStore.getState().setActiveRole(activeRole);
                        
                        useCommonStore.getState().setEntity(entityId);
                        sessionStorage.setItem('selected_entity', entityId);
                        sessionStorage.setItem('selected_entity_name', entityDisplayName);

                        const rawEntity = {
                            entity_id: entityId,
                            entity_name: entityName,
                            id: 0
                        };
                        useInvoiceStore.getState().setEntityMaster(rawEntity);

                        navigate('/dashboard');
                    }
                     else {
                        navigate('/select-entity');
                    }
                }
                else{
                     navigate('/module-select');
                }
            } else {
                setError('Invalid response from server');
            }
        } catch (err) {
            const errMsg = err.response?.data?.detail || err.message || 'Login failed';
            setError(errMsg);
            toast.error(errMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleMicrosoftLogin = () => {
        window.location.href = `${getBackendURL()}/ValidateAzureAD`;
    }

    return (
        <AuthLayout title="Welcome Back">
            <form onSubmit={handleLogin} className="w-full" noValidate>
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded mb-4 text-sm text-center font-medium animate-shake">
                        {error}
                    </div>
                )}
                <CustomInput
                    label="Email Address"
                    type="email"
                    placeholder="you@domain.com"
                    value={email}
                    onChange={(e) => {
                        setEmail(e.target.value);
                        setError('');
                    }}
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
                    onChange={(e) => {
                        setPassword(e.target.value);
                        setError('');
                    }}
                    required
                    icon={
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                    }
                />

                <div className="flex justify-end mb-6">
                    <Link to="/forgot-password" className="text-sm text-blue-500 hover:underline">Forgot password?</Link>
                </div>

                <div className="mt-4">
                    <CustomButton
                        type="submit"
                        variant="primary"
                        disabled={loading}
                        className="bg-blue-500 !text-white !h-11 !rounded font-medium w-full"
                    >
                        {loading ? 'Signing in...' : 'Login'}
                    </CustomButton>
                </div>
                <div className="mt-4">
                    <button
                        type="button"
                        onClick={handleMicrosoftLogin}
                        className="
                            w-full h-10
                            flex items-center justify-center gap-3
                            border border-[#0078D4]
                            rounded-lg
                            bg-white
                            hover:bg-[#f5faff]
                            transition
                            cursor-pointer
                        "
                    >
                        <img
                            src={icons.microsoft}
                            alt="Microsoft"
                            className="w-5 h-5"
                        />
                        <span className="text-base font-medium text-gray-800">
                            Microsoft
                        </span>
                    </button>
                </div>

                <div className="mt-6 text-center text-sm text-gray-500">
                    Don't have an account? <Link to="/register" className="text-blue-500 hover:underline">Register</Link>
                </div>
            </form>

            <AlertModal
                isOpen={showAlert}
                onClose={() => setShowAlert(false)}
                onConfirm={() => setShowAlert(false)}
                title="Invalid Input"
                message={alertMessage}
                type="warning"
                confirmText="OK"
            />
        </AuthLayout>
    );
};

export default LoginPage;
