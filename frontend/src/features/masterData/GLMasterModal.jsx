import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import CustomButton from '../../shared/components/CustomButton';

const EMPTY_FORM = {
    id: null,
    account_number: '',
    title: '',
    normal_balance: 'Debit',
    require_department: false,
    require_location: false,
    period_end_closing_type: '',
    close_into_account: '',
    disallow_direct_posting: false,
    internal_rate: '',
};

const FormField = ({ label, id, value, onChange, readOnly = false, placeholder = '', type = 'text', required = false, error = '' }) => (
    <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-[14px] font-medium text-[#333333]">
            {label} {required && <span className="text-red-500">*</span>}
        </label>
        <input
            id={id}
            type={type}
            value={value || ''}
            onChange={onChange}
            readOnly={readOnly}
            placeholder={placeholder}
            className={`h-[38px] px-3 border rounded-[6px] text-[14px] text-[#333333] outline-none transition-all bg-white
                ${error ? 'border-red-500 focus:ring-1 focus:ring-red-500/20' : 'border-[#D9D9D9] focus:border-[#1D71AB] focus:ring-1 focus:ring-[#1D71AB]/20'}
                ${readOnly ? 'bg-[#F5F5F5] cursor-not-allowed text-gray-400' : ''}`}
        />
        {error && <span className="text-[11px] text-red-500 mt-0.5">{error}</span>}
    </div>
);

const GLMasterModal = ({ mode, rowData, onClose, onSave }) => {
    const isEdit = mode === 'edit';
    const [form, setForm] = useState(EMPTY_FORM);
    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (isEdit && rowData) {
            setForm({
                id: rowData.id ?? null,
                account_number: rowData.account_number ?? '',
                title: rowData.title ?? '',
                normal_balance: rowData.normal_balance ?? 'Debit',
                require_department: rowData.require_department === true ? 'Yes' : (rowData.require_department === false ? 'No' : (rowData.require_department ?? '')),
                require_location: rowData.require_location === true ? 'Yes' : (rowData.require_location === false ? 'No' : (rowData.require_location ?? '')),
                period_end_closing_type: rowData.period_end_closing_type ?? '',
                close_into_account: rowData.close_into_account ?? '',
                disallow_direct_posting: rowData.disallow_direct_posting === true ? 'Yes' : (rowData.disallow_direct_posting === false ? 'No' : (rowData.disallow_direct_posting ?? '')),
                internal_rate: rowData.internal_rate ?? '',
            });
        } else {
            setForm(EMPTY_FORM);
        }
        setErrors({});
    }, [isEdit, rowData]);

    const handleChange = (field) => (e) => {
        setForm((prev) => ({ ...prev, [field]: e.target.value }));
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: '' }));
        }
    };

    const handleSave = () => {
        const newErrors = {};
        if (!form.account_number) newErrors.account_number = 'Account Number is required';
        if (!form.title) newErrors.title = 'Title is required';

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        // Helper to convert text input to boolean safely
        const toBool = (val) => {
            if (val === true || val === false) return val;
            const s = String(val).toLowerCase().trim();
            return s === 'yes' || s === 'true';
        };

        // Convert inputs to correct types for the backend
        const processedForm = {
            ...form,
            require_department: toBool(form.require_department),
            require_location: toBool(form.require_location),
            disallow_direct_posting: toBool(form.disallow_direct_posting),
            internal_rate: form.internal_rate ? parseFloat(form.internal_rate) : null,
        };
        onSave(processedForm);
        onClose();
    };



    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[1px]"
        >
            <div className="bg-white rounded-[12px] shadow-xl w-full max-w-[580px] mx-4 flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4">
                    <h2 className="text-[18px] font-bold text-[#333333]">
                        {isEdit ? 'Edit GL Master' : 'Add to GL'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-md hover:bg-gray-100 text-gray-500 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="overflow-y-auto px-6 py-2 flex flex-col gap-5">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                        <FormField
                            label="Account Number"
                            id="account_number"
                            value={form.account_number}
                            onChange={handleChange('account_number')}
                            required
                            error={errors.account_number}
                        />
                        <FormField
                            label="Title"
                            id="title"
                            value={form.title}
                            onChange={handleChange('title')}
                            required
                            error={errors.title}
                        />
                        
                        <FormField
                            label="Normal Balance"
                            id="normal_balance"
                            value={form.normal_balance}
                            onChange={handleChange('normal_balance')}
                        />
                        <FormField
                            label="Require Department"
                            id="require_department"
                            value={form.require_department}
                            onChange={handleChange('require_department')}
                        />

                        <FormField
                            label="Require Location"
                            id="require_location"
                            value={form.require_location}
                            onChange={handleChange('require_location')}
                        />
                        <FormField
                            label="Period End Closing Type"
                            id="period_end_closing_type"
                            value={form.period_end_closing_type}
                            onChange={handleChange('period_end_closing_type')}
                        />

                        <FormField
                            label="Close Into Account"
                            id="close_into_account"
                            value={form.close_into_account}
                            onChange={handleChange('close_into_account')}
                        />
                        <FormField
                            label="Disallow Direct Posting"
                            id="disallow_direct_posting"
                            value={form.disallow_direct_posting}
                            onChange={handleChange('disallow_direct_posting')}
                        />

                        <FormField
                            label="Internal Rate"
                            id="internal_rate"
                            type="number"
                            value={form.internal_rate}
                            onChange={handleChange('internal_rate')}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 rounded-b-[12px]">
                    <div className="w-[100px]">
                        <CustomButton
                            variant="outline"
                            onClick={onClose}
                            className="!h-[36px]"
                        >
                            Cancel
                        </CustomButton>
                    </div>
                    <div className="w-[120px]">
                        <CustomButton
                            variant="primary"
                            onClick={handleSave}
                            className="!h-[36px]"
                        >
                            Save
                        </CustomButton>
                    </div>
                </div>
            </div>
        </div>
    );
};


export default GLMasterModal;

