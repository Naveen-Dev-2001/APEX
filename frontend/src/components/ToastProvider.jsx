import React from 'react';
import { Toaster } from 'react-hot-toast';
import useToastStore from '../store/useToastStore';

const VARIANT_STYLES = {
    danger: {
        confirmBtn: 'bg-[#ef4444] hover:bg-[#dc2626] text-white',
        icon: (
            <div className="w-10 h-10 rounded-full bg-[#fef2f2] flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-[#ef4444]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            </div>
        ),
    },
    warning: {
        confirmBtn: 'bg-[#f59e0b] hover:bg-[#d97706] text-white',
        icon: (
            <div className="w-10 h-10 rounded-full bg-[#fffbeb] flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-[#f59e0b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            </div>
        ),
    },
    info: {
        confirmBtn: 'bg-[#3b82f6] hover:bg-[#2563eb] text-white',
        icon: (
            <div className="w-10 h-10 rounded-full bg-[#eff6ff] flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-[#3b82f6]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>
        ),
    },
};

const ConfirmDialog = () => {
    const { confirm, hideConfirm } = useToastStore();

    if (!confirm.open) return null;

    const styles = VARIANT_STYLES[confirm.variant] || VARIANT_STYLES.danger;

    const handleConfirm = () => {
        hideConfirm();
        confirm.onConfirm?.();
    };

    const handleCancel = () => {
        hideConfirm();
        confirm.onCancel?.();
    };

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.45)' }}
            onClick={handleCancel}
        >
            <div
                className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden"
                style={{ animation: 'scaleIn 0.15s ease-out' }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="p-6">
                    <div className="flex items-start gap-4">
                        {styles.icon}
                        <div className="flex-1 min-w-0">
                            <p className="text-[15px] font-semibold text-gray-800 leading-snug">
                                {confirm.message}
                            </p>
                            {confirm.subMessage && (
                                <p className="mt-1.5 text-[13px] text-gray-500 leading-relaxed">
                                    {confirm.subMessage}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="px-6 pb-5 flex justify-end gap-2.5">
                    <button
                        onClick={handleCancel}
                        className="px-5 py-2 text-[13px] font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                        {confirm.cancelLabel}
                    </button>
                    <button
                        onClick={handleConfirm}
                        className={`px-5 py-2 text-[13px] font-medium rounded-lg transition-colors shadow-sm ${styles.confirmBtn}`}
                    >
                        {confirm.confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

const ToastProvider = () => {
    return (
        <>
            <Toaster
                position="bottom-right"
                gutter={8}
                containerStyle={{ top: 80, right: 20, zIndex: 9998 }}
                toastOptions={{
                    style: {
                        fontFamily: '"Creato Display", sans-serif',
                    },
                }}
            />
            <ConfirmDialog />
        </>
    );
};

export default ToastProvider;
