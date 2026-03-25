import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const EMPTY_FORM = {
    id: null,
    department_id: '',
    department_name: '',
};

const FormField = ({ label, id, value, onChange, readOnly = false, placeholder = '', type = 'text' }) => (
    <div className="flex flex-col gap-1.5 w-full">
        <label htmlFor={id} className="text-[14px] font-medium text-[#333333]">
            {label}
        </label>
        <input
            id={id}
            type={type}
            value={value || ''}
            onChange={onChange}
            readOnly={readOnly}
            placeholder={placeholder}
            className={`h-[38px] px-3 border border-[#D9D9D9] rounded-[6px] text-[14px] text-[#333333] outline-none
                focus:border-[#1D71AB] focus:ring-1 focus:ring-[#1D71AB]/20 transition-all bg-white
                ${readOnly ? 'bg-[#F5F5F5] cursor-not-allowed text-gray-400' : ''}`}
        />
    </div>
);

const DepartmentMasterModal = ({ mode, rowData, onClose, onSave }) => {
    const isEdit = mode === 'edit';
    const [form, setForm] = useState(EMPTY_FORM);

    useEffect(() => {
        if (isEdit && rowData) {
            setForm({
                id: rowData.id ?? null,
                department_id: rowData.department_id ?? '',
                department_name: rowData.department_name ?? '',
            });
        } else {
            setForm(EMPTY_FORM);
        }
    }, [isEdit, rowData]);

    const handleChange = (field) => (e) => {
        setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

    const handleSave = () => {
        onSave(form);
        onClose();
    };

    const handleBackdrop = (e) => {
        if (e.target === e.currentTarget) onClose();
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[1px]"
            onClick={handleBackdrop}
        >
            <div className="bg-white rounded-[12px] shadow-xl w-full max-w-[500px] mx-4 flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <h2 className="text-[18px] font-bold text-[#333333]">
                        {isEdit ? 'Edit Department' : 'Add to Department'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-md hover:bg-gray-100 text-gray-500 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-6 flex flex-col gap-5">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-5">
                        <FormField
                            label="Department Id"
                            id="department_id"
                            value={form.department_id}
                            onChange={handleChange('department_id')}
                        />
                        <FormField
                            label="Department Name"
                            id="department_name"
                            value={form.department_name}
                            onChange={handleChange('department_name')}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 rounded-b-[12px]">
                    <button
                        onClick={onClose}
                        className="px-6 h-[40px] text-[14px] font-medium text-gray-600 border border-gray-300 rounded-[6px] hover:bg-gray-50 transition-all font-sans"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-8 h-[40px] text-[14px] font-medium text-white bg-[#1D94FF] rounded-[6px] hover:bg-[#1578d0] transition-all shadow-sm font-sans"
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DepartmentMasterModal;
