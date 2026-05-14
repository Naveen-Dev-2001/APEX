import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import CustomButton from '../../shared/components/CustomButton';

const EMPTY_FORM = {
    id: null,
    rate_key: '',
    rate_type: 'Daily',
    base_currency: '',
    target_currency: '',
    exchange_rate: '',
    effective_date: '',
    status: 'active',
};

const FormField = ({ label, id, value, onChange, readOnly = false, placeholder = '', type = 'text', required = false, error = '' }) => (
    <div className="flex flex-col gap-1.5 w-full">
        <label htmlFor={id} className="text-[14px] font-medium text-[#333333]">
            {required && <span className="text-red-500 mr-1">*</span>}
            {label}
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

const ExchangeRateMasterModal = ({ mode, rowData, onClose, onSave }) => {
    const isEdit = mode === 'edit';
    const [form, setForm] = useState(EMPTY_FORM);
    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (isEdit && rowData) {
            setForm({
                id: rowData.id ?? null,
                rate_key: rowData.rate_key ?? '',
                rate_type: rowData.rate_type ?? 'Daily',
                base_currency: rowData.base_currency ?? '',
                target_currency: rowData.target_currency ?? '',
                exchange_rate: rowData.exchange_rate ?? '',
                effective_date: rowData.effective_date ? rowData.effective_date.split('T')[0] : '',
                status: rowData.status ?? 'active',
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
        if (!form.base_currency) newErrors.base_currency = 'Base Currency is required';
        if (!form.target_currency) newErrors.target_currency = 'Target Currency is required';
        if (!form.exchange_rate) newErrors.exchange_rate = 'Exchange Rate is required';

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        onSave(form);
        onClose();
    };


    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[1px]"
        >
            <div className="bg-white rounded-[12px] shadow-xl w-full max-w-[550px] mx-4 flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <h2 className="text-[18px] font-bold text-[#333333]">
                        {isEdit ? 'Edit Exchange Rate' : 'Add Exchange Rate'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-md hover:bg-gray-100 text-gray-500 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-6 flex flex-col gap-5 overflow-y-auto max-h-[70vh]">
                    <div className="grid grid-cols-2 gap-5">
                        <FormField
                            label="Base Currency"
                            id="base_currency"
                            value={form.base_currency}
                            onChange={handleChange('base_currency')}
                            placeholder="e.g. USD"
                            required
                            error={errors.base_currency}
                        />
                        <FormField
                            label="Target Currency"
                            id="target_currency"
                            value={form.target_currency}
                            onChange={handleChange('target_currency')}
                            placeholder="e.g. INR"
                            required
                            error={errors.target_currency}
                        />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-5">
                        <FormField
                            label="Exchange Rate"
                            id="exchange_rate"
                            type="number"
                            value={form.exchange_rate}
                            onChange={handleChange('exchange_rate')}
                            required
                            error={errors.exchange_rate}
                        />
                        <FormField
                            label="Effective Date"
                            id="effective_date"
                            type="date"
                            value={form.effective_date}
                            onChange={handleChange('effective_date')}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-5">
                        <div className="flex flex-col gap-1.5 w-full">
                            <label htmlFor="rate_type" className="text-[14px] font-medium text-[#333333]">
                                Rate Type
                            </label>
                            <select
                                id="rate_type"
                                value={form.rate_type}
                                onChange={handleChange('rate_type')}
                                className="h-[38px] px-3 border border-[#D9D9D9] rounded-[6px] text-[14px] text-[#333333] outline-none focus:border-[#1D71AB] bg-white"
                            >
                                <option value="Daily">Daily</option>
                                <option value="Monthly">Monthly</option>
                                <option value="Annual">Annual</option>
                            </select>
                        </div>
                        <FormField
                            label="Rate Key"
                            id="rate_key"
                            value={form.rate_key}
                            onChange={handleChange('rate_key')}
                            placeholder="Auto-generated if empty"
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

export default ExchangeRateMasterModal;
