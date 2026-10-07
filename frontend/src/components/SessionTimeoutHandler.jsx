import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from 'antd';
import { ExclamationCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useAuthStore } from '../store/authStore';
import API from '../api/api';
import CustomButton from '../shared/components/CustomButton';

const SessionTimeoutHandler = () => {
    const navigate = useNavigate();
    const token = useAuthStore((state) => state.token);
    const logout = useAuthStore((state) => state.logout);

    const [timeoutMinutes, setTimeoutMinutes] = useState(30);
    const [isWarningOpen, setIsWarningOpen] = useState(sessionStorage.getItem('session_expired_flag') === 'true');
    const [countdown, setCountdown] = useState(sessionStorage.getItem('session_expired_flag') === 'true' ? 0 : 60);
    const [isExpired, setIsExpired] = useState(sessionStorage.getItem('session_expired_flag') === 'true');

    // Keep references to intervals so we can clear them easily
    const timerRef = useRef(null);

    // Fetch session timeout configuration on mount
    useEffect(() => {
        if (!token) return;

        const fetchTimeout = async () => {
            try {
                const response = await API.get('/auth/session-timeout');
                if (response.data && response.data.session_timeout) {
                    setTimeoutMinutes(response.data.session_timeout);
                }
            } catch (error) {
                console.error("Failed to fetch session timeout config:", error);
                // Defaults to 30 mins as fallback
                setTimeoutMinutes(30);
            }
        };

        fetchTimeout();
    }, [token]);

    // Track timer
    useEffect(() => {
        if (!token) {
            // Clean up if logged out
            if (timerRef.current) clearInterval(timerRef.current);
            setTimeout(() => {
                setIsWarningOpen(false);
                setIsExpired(false);
            }, 0);
            return;
        }

        if (isExpired) {
            if (timerRef.current) clearInterval(timerRef.current);
            return;
        }

        // Initialize session_start_time if not already set
        if (!sessionStorage.getItem('session_start_time')) {
            sessionStorage.setItem('session_start_time', Date.now().toString());
        }

        const checkSession = () => {
            const startTimeStr = sessionStorage.getItem('session_start_time');
            if (!startTimeStr) return;

            const startTime = parseInt(startTimeStr, 10);
            const totalTimeoutMs = timeoutMinutes * 60 * 1000;
            const elapsedMs = Date.now() - startTime;
            const remainingMs = totalTimeoutMs - elapsedMs;
            const remainingSec = Math.ceil(remainingMs / 1000);

            // Warning threshold is 60 seconds (or half of total timeout if timeout is less than 60 seconds)
            const warningThresholdSec = timeoutMinutes * 60 <= 60 ? Math.floor(timeoutMinutes * 60 / 2) : 60;

            if (remainingSec <= 0) {
                // Session expired!
                if (!isExpired) {
                    setIsExpired(true);
                    setIsWarningOpen(true); // Ensure modal is open
                    sessionStorage.setItem('session_expired_flag', 'true');
                    sessionStorage.removeItem('session_start_time');
                    if (timerRef.current) clearInterval(timerRef.current);
                }
                setCountdown(0);
            } else if (remainingSec <= warningThresholdSec) {
                // Show warning modal
                setIsWarningOpen(true);
                setCountdown(remainingSec);
            } else {
                // If the user extended session elsewhere or timer is reset
                if (isWarningOpen && !isExpired) {
                    setIsWarningOpen(false);
                }
            }
        };

        // Run check immediately on mount/update
        checkSession();

        // Run check every second
        timerRef.current = setInterval(checkSession, 1000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [token, timeoutMinutes, logout, isExpired, isWarningOpen]);

    // Listen to user activity to extend session automatically (activity timeout)
    useEffect(() => {
        if (!token || isExpired || isWarningOpen) return;

        const handleActivity = () => {
            const now = Date.now();
            const lastActiveStr = sessionStorage.getItem('session_start_time');
            if (lastActiveStr) {
                const lastActive = parseInt(lastActiveStr, 10);
                // Throttle: only update sessionStorage if it's been more than 5 seconds since the last update
                if (now - lastActive > 5000) {
                    sessionStorage.setItem('session_start_time', now.toString());
                }
            } else {
                sessionStorage.setItem('session_start_time', now.toString());
            }
        };

        const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
        events.forEach((event) => window.addEventListener(event, handleActivity, { passive: true }));

        return () => {
            events.forEach((event) => window.removeEventListener(event, handleActivity));
        };
    }, [token, isExpired, isWarningOpen]);

    const handleExtendSession = () => {
        // Reset the start time
        sessionStorage.setItem('session_start_time', Date.now().toString());
        setIsWarningOpen(false);
        setCountdown(60);
    };

    const handleLogout = () => {
        // Clear timer and close modal
        if (timerRef.current) clearInterval(timerRef.current);
        setIsWarningOpen(false);
        setIsExpired(false);
        sessionStorage.removeItem('session_expired_flag');
        
        // Log out and navigate
        logout();
        navigate('/login');
    };

    return (
        <Modal
            open={isWarningOpen}
            footer={null}
            closable={false}
            centered
            width={420}
            modalRender={(node) => React.cloneElement(node, { style: { padding: 0 } })}
            maskClosable={false}
        >
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden relative">
                <div className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 mt-1">
                            {isExpired ? (
                                <ExclamationCircleOutlined className="text-red-500 text-2xl animate-pulse" />
                            ) : (
                                <ClockCircleOutlined className="text-amber-500 text-2xl" />
                            )}
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                {isExpired ? "Session Expired" : "Session Expiring Soon"}
                            </h3>
                            <p className="text-sm text-gray-600 mb-1">
                                {isExpired 
                                    ? "Your session has timed out due to inactivity." 
                                    : `You will be logged out in ${countdown} seconds due to inactivity.`}
                            </p>
                            {!isExpired && (
                                <p className="text-xs text-gray-500 mt-2">
                                    Would you like to extend your session?
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="bg-gray-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-100">
                    {!isExpired ? (
                        <>
                            <div className="w-24">
                                <CustomButton 
                                    variant="outline" 
                                    onClick={handleLogout}
                                    className="bg-white"
                                >
                                    Log Out
                                </CustomButton>
                            </div>
                            <div className="w-auto min-w-[150px]">
                                <CustomButton 
                                    variant="primary" 
                                    onClick={handleExtendSession}
                                >
                                    Keep me logged in
                                </CustomButton>
                            </div>
                        </>
                    ) : (
                        <div className="w-32">
                            <CustomButton 
                                variant="danger" 
                                onClick={handleLogout}
                            >
                                Log Out
                            </CustomButton>
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default SessionTimeoutHandler;
