import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import CustomButton from '../../shared/components/CustomButton';

const EMPTY_FORM = {
    id: null,
    section: '',
    nature_of_payment: '',
    tds_rate: '',
};

const FormField = ({ label, id, value, onChange, placeholder = '', type = "text", required = false, error = '' }) => (
    <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-[13px] font-medium text-[#333333]">
            {label} {required && <span className="text-red-500">*</span>}
        </label>
        <input
            id={id}
            type={type}
            value={value || ''}
            onChange={onChange}
            placeholder={placeholder}
            className={`h-[36px] px-3 border rounded-[4px] text-[13px] text-[#333333] outline-none transition-all bg-white
                ${error ? 'border-red-500 focus:ring-1 focus:ring-red-500/20' : 'border-[#D9D9D9] focus:border-[#1D71AB] focus:ring-1 focus:ring-[#1D71AB]/20'}`}
        />
        {error && <span className="text-[11px] text-red-500 mt-0.5">{error}</span>}
    </div>
);

const TDSRatesModal = ({ mode, rowData, onClose, onSave }) => {
    const isEdit = mode === 'edit';
    const [form, setForm] = useState(EMPTY_FORM);
    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (isEdit && rowData) {
            setForm({
                id: rowData.id ?? null,
                section: rowData.section ?? '',
                nature_of_payment: rowData.nature_of_payment ?? '',
                tds_rate: rowData.tds_rate ?? '',
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
        if (!form.section) newErrors.section = 'Section is required';
        if (!form.nature_of_payment) newErrors.nature_of_payment = 'Nature of Payment is required';
        if (form.tds_rate === '' || form.tds_rate === null) newErrors.tds_rate = 'TDS Rate is required';

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        onSave(form);
        onClose();
    };


    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
        >
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-[480px] mx-4 flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
                    <h2 className="text-[17px] font-semibold text-[#1a2235]">
                        {isEdit ? 'Edit TDS Rate' : 'Add TDS Rate'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all"
                    >
                        <X size={17} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5 flex flex-col gap-4">
                    <FormField
                        label="Section"
                        id="section"
                        value={form.section}
                        onChange={handleChange('section')}
                        placeholder="e.g. 194C"
                        required
                        error={errors.section}
                    />
                    <FormField
                        label="Nature of Payment"
                        id="nature_of_payment"
                        value={form.nature_of_payment}
                        onChange={handleChange('nature_of_payment')}
                        placeholder="e.g. Contractor (Others)"
                        required
                        error={errors.nature_of_payment}
                    />
                    <FormField
                        label="TDS Rate"
                        id="tds_rate"
                        type="number"
                        value={form.tds_rate}
                        onChange={handleChange('tds_rate')}
                        placeholder="e.g. 0.02"
                        required
                        error={errors.tds_rate}
                    />
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
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

export default TDSRatesModal;
