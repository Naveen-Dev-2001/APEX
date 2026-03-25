import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const EMPTY_FORM = {
    id: null,
    section: '',
    nature_of_payment: '',
    tds_rate: '',
};

const FormField = ({ label, id, value, onChange, placeholder = '', type = "text" }) => (
    <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-[13px] font-medium text-[#333333]">
            {label}
        </label>
        <input
            id={id}
            type={type}
            value={value || ''}
            onChange={onChange}
            placeholder={placeholder}
            className="h-[36px] px-3 border border-[#D9D9D9] rounded-[4px] text-[13px] text-[#333333] outline-none focus:border-[#1D71AB] focus:ring-1 focus:ring-[#1D71AB]/20 transition-all bg-white"
        />
    </div>
);

const TDSRatesModal = ({ mode, rowData, onClose, onSave }) => {
    const isEdit = mode === 'edit';
    const [form, setForm] = useState(EMPTY_FORM);

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
    }, [isEdit, rowData]);

    const handleChange = (field) => (e) =>
        setForm((prev) => ({ ...prev, [field]: e.target.value }));

    const handleSave = () => {
        onSave(form);
        onClose();
    };

    const handleBackdrop = (e) => {
        if (e.target === e.currentTarget) onClose();
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
            onClick={handleBackdrop}
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
                    />
                    <FormField
                        label="Nature of Payment"
                        id="nature_of_payment"
                        value={form.nature_of_payment}
                        onChange={handleChange('nature_of_payment')}
                        placeholder="e.g. Contractor (Others)"
                    />
                    <FormField
                        label="TDS Rate"
                        id="tds_rate"
                        type="number"
                        value={form.tds_rate}
                        onChange={handleChange('tds_rate')}
                        placeholder="e.g. 0.02"
                    />
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
                    <button
                        onClick={onClose}
                        className="px-5 h-[36px] text-[13px] font-medium text-gray-600 border border-gray-300 rounded-[4px] hover:bg-gray-50 transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-5 h-[36px] text-[13px] font-medium text-white bg-[#1D71AB] rounded-[4px] hover:bg-[#155a8a] transition-all shadow-sm"
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TDSRatesModal;
