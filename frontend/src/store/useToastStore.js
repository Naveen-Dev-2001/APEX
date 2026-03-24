import { create } from 'zustand';

/**
 * useToastStore — manages the global confirmation dialog state.
 *
 * For simple toasts (success/error/warning/info) import `toast` from
 * `src/utils/toast.js` and call it directly — no store needed.
 *
 * Usage:
 *   const { showConfirm } = useToastStore();
 *   showConfirm('Are you sure?', () => doSomething());
 */
const useToastStore = create((set) => ({
    confirm: {
        open: false,
        message: '',
        subMessage: '',
        confirmLabel: 'Confirm',
        cancelLabel: 'Cancel',
        variant: 'danger', // 'danger' | 'warning' | 'info'
        onConfirm: null,
        onCancel: null,
    },

    showConfirm: ({ message, subMessage = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', variant = 'danger', onConfirm, onCancel }) =>
        set({
            confirm: {
                open: true,
                message,
                subMessage,
                confirmLabel,
                cancelLabel,
                variant,
                onConfirm: onConfirm || null,
                onCancel: onCancel || null,
            },
        }),

    hideConfirm: () =>
        set((state) => ({
            confirm: { ...state.confirm, open: false, onConfirm: null, onCancel: null },
        })),
}));

export default useToastStore;
