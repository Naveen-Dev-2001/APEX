import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import CustomButton from '../../shared/components/CustomButton';
import { getERPSystem } from '../../utils/envHelper';

const EMPTY_FORM = {
    id: null,
    customer_id: '',
    customer_name: '',
    company_name: '',
    display_name: '',
    email_id: '',
    phone: '',
    currency_code: '',
    billing_address: '',
    billing_street2: '',
    billing_city: '',
};

const FormField = ({ label, id, value, onChange, readOnly = false, placeholder = '', type = 'text', required = false, error = '' }) => (
    <div className="flex flex-col gap-1.5 w-full">
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

const CustomerMasterModal = ({ mode, rowData, onClose, onSave }) => {
    const isEdit = mode === 'edit';
    const erpSystem = getERPSystem();
    const isZoho = erpSystem === 'Zoho';
    const [form, setForm] = useState(EMPTY_FORM);
    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (isEdit && rowData) {
            setForm({
                id: rowData.id ?? null,
                customer_id: rowData.customer_id ?? '',
                customer_name: rowData.customer_name ?? '',
                company_name: rowData.company_name ?? '',
                display_name: rowData.display_name ?? '',
                email_id: rowData.email_id ?? '',
                phone: rowData.phone ?? '',
                currency_code: rowData.currency_code ?? '',
                billing_address: rowData.billing_address ?? '',
                billing_street2: rowData.billing_street2 ?? '',
                billing_city: rowData.billing_city ?? '',
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
        if (!form.customer_id) newErrors.customer_id = 'Customer Id is required';
        if (!form.customer_name) newErrors.customer_name = 'Customer Name is required';

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
            <div className={`bg-white rounded-[12px] shadow-xl w-full mx-4 flex flex-col transition-all duration-200
                ${isZoho ? 'max-w-[650px]' : 'max-w-[500px]'}`}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <h2 className="text-[18px] font-bold text-[#333333]">
                        {isEdit ? 'Edit Customer' : 'Add to Customer'}
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
                    <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                        <FormField
                            label="Customer Id"
                            id="customer_id"
                            value={form.customer_id}
                            onChange={handleChange('customer_id')}
                            required
                            error={errors.customer_id}
                        />
                        <FormField
                            label="Customer Name"
                            id="customer_name"
                            value={form.customer_name}
                            onChange={handleChange('customer_name')}
                            required
                            error={errors.customer_name}
                        />
                        {isZoho && (
                            <>
                                <FormField
                                    label="Company Name"
                                    id="company_name"
                                    value={form.company_name}
                                    onChange={handleChange('company_name')}
                                />
                                <FormField
                                    label="Display Name"
                                    id="display_name"
                                    value={form.display_name}
                                    onChange={handleChange('display_name')}
                                />
                                <FormField
                                    label="Email ID"
                                    id="email_id"
                                    value={form.email_id}
                                    onChange={handleChange('email_id')}
                                />
                                <FormField
                                    label="Phone"
                                    id="phone"
                                    value={form.phone}
                                    onChange={handleChange('phone')}
                                />
                                <FormField
                                    label="Currency Code"
                                    id="currency_code"
                                    value={form.currency_code}
                                    onChange={handleChange('currency_code')}
                                />
                                <FormField
                                    label="Billing City"
                                    id="billing_city"
                                    value={form.billing_city}
                                    onChange={handleChange('billing_city')}
                                />
                                <div className="col-span-2">
                                    <FormField
                                        label="Billing Address"
                                        id="billing_address"
                                        value={form.billing_address}
                                        onChange={handleChange('billing_address')}
                                    />
                                </div>
                                <div className="col-span-2">
                                    <FormField
                                        label="Billing Street 2"
                                        id="billing_street2"
                                        value={form.billing_street2}
                                        onChange={handleChange('billing_street2')}
                                    />
                                </div>
                            </>
                        )}
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

export default CustomerMasterModal;
