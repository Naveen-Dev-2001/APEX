import { toast as hotToast } from 'react-hot-toast';

const baseStyle = {
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 500,
    padding: '10px 14px',
    maxWidth: '360px',
};

const toast = {
    success: (message) =>
        hotToast.success(message, {
            style: {
                ...baseStyle,
                background: '#f0fdf4',
                color: '#166534',
                border: '1px solid #bbf7d0',
            },
            iconTheme: {
                primary: '#22c55e',
                secondary: '#fff',
            },
            duration: 3500,
        }),

    error: (message) =>
        hotToast.error(message, {
            style: {
                ...baseStyle,
                background: '#fef2f2',
                color: '#991b1b',
                border: '1px solid #fecaca',
            },
            iconTheme: {
                primary: '#ef4444',
                secondary: '#fff',
            },
            duration: 4500,
        }),

    warning: (message) =>
        hotToast(message, {
            icon: '⚠️',
            style: {
                ...baseStyle,
                background: '#fffbeb',
                color: '#92400e',
                border: '1px solid #fde68a',
            },
            duration: 4000,
        }),

    info: (message) =>
        hotToast(message, {
            icon: 'ℹ️',
            style: {
                ...baseStyle,
                background: '#eff6ff',
                color: '#1e40af',
                border: '1px solid #bfdbfe',
            },
            duration: 3500,
        }),

    loading: (message) =>
        hotToast.loading(message, {
            style: {
                ...baseStyle,
                background: '#fff',
                color: '#374151',
                border: '1px solid #e5e7eb',
            },
        }),

    dismiss: (id) => hotToast.dismiss(id),
};

export default toast;
