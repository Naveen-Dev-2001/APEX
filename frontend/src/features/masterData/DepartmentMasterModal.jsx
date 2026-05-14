import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import CustomButton from '../../shared/components/CustomButton';

const EMPTY_FORM = {
    id: null,
    department_id: '',
    department_name: '',
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

const DepartmentMasterModal = ({ mode, rowData, onClose, onSave }) => {
    const isEdit = mode === 'edit';
    const [form, setForm] = useState(EMPTY_FORM);
    const [errors, setErrors] = useState({});

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
        if (!form.department_id) newErrors.department_id = 'Department Id is required';
        if (!form.department_name) newErrors.department_name = 'Department Name is required';

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
                            required
                            error={errors.department_id}
                        />
                        <FormField
                            label="Department Name"
                            id="department_name"
                            value={form.department_name}
                            onChange={handleChange('department_name')}
                            required
                            error={errors.department_name}
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

export default DepartmentMasterModal;
