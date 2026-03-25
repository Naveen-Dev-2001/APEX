import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const EMPTY_FORM = {
    entityId: '',
    entityName: '',
    registeredAddress: '',
    addressLine1: '',
    addressLine2: '',
    addressLine3: '',
    city: '',
    state: '',
    zipCode: '',
    countryCode: '',
    gstApplicable: false,
};

const FormField = ({ label, id, value, onChange, readOnly = false, placeholder = '' }) => (
    <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-[13px] font-medium text-[#333333]">
            {label}
        </label>
        <input
            id={id}
            type="text"
            value={value}
            onChange={onChange}
            readOnly={readOnly}
            placeholder={placeholder}
            className={`h-[36px] px-3 border border-[#D9D9D9] rounded-[4px] text-[13px] text-[#333333] outline-none
                focus:border-[#1D71AB] focus:ring-1 focus:ring-[#1D71AB]/20 transition-all bg-white
                ${readOnly ? 'bg-[#F5F5F5] cursor-not-allowed text-gray-400' : ''}`}
        />
    </div>
);

const EntityMasterModal = ({ mode, rowData, onClose, onSave }) => {
    const isEdit = mode === 'edit';
    const [form, setForm] = useState(EMPTY_FORM);

    useEffect(() => {
        if (isEdit && rowData) {
            setForm({
                entityId: rowData.entityId ?? '',
                entityName: rowData.entityName ?? '',
                registeredAddress: rowData.registeredAddress ?? rowData.address ?? '',
                addressLine1: rowData.addressLine1 ?? '',
                addressLine2: rowData.addressLine2 ?? '',
                addressLine3: rowData.addressLine3 ?? '',
                city: rowData.city ?? '',
                state: rowData.state ?? '',
                zipCode: rowData.zipCode ?? '',
                countryCode: rowData.countryCode ?? '',
                gstApplicable: rowData.gstApplicable ?? false,
            });
        } else {
            setForm(EMPTY_FORM);
        }
    }, [isEdit, rowData]);

    const handleChange = (field) => (e) =>
        setForm((prev) => ({ ...prev, [field]: e.target.value }));

    const handleToggle = () =>
        setForm((prev) => ({ ...prev, gstApplicable: !prev.gstApplicable }));

    const handleSave = () => {
        onSave({ ...form, id: rowData?.id ?? Date.now() });
        onClose();
    };

    // Close on backdrop click
    const handleBackdrop = (e) => {
        if (e.target === e.currentTarget) onClose();
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
            onClick={handleBackdrop}
        >
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-[580px] mx-4 flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
                    <h2 className="text-[17px] font-semibold text-[#1a2235]">
                        {isEdit ? 'Edit Row' : 'Add to Entity Master'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all"
                    >
                        <X size={17} />
                    </button>
                </div>

                {/* Body */}
                <div className="overflow-y-auto px-6 py-5 flex flex-col gap-4">
                    {/* Row 1 */}
                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                            label="Entity Id"
                            id="entityId"
                            value={form.entityId}
                            onChange={handleChange('entityId')}
                            readOnly={isEdit}
                        />
                        <FormField
                            label="Entity Name"
                            id="entityName"
                            value={form.entityName}
                            onChange={handleChange('entityName')}
                        />
                    </div>

                    {/* Row 2 */}
                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                            label="Registered Address"
                            id="registeredAddress"
                            value={form.registeredAddress}
                            onChange={handleChange('registeredAddress')}
                        />
                        <FormField
                            label="Address Line1"
                            id="addressLine1"
                            value={form.addressLine1}
                            onChange={handleChange('addressLine1')}
                        />
                    </div>

                    {/* Row 3 */}
                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                            label="Address Line2"
                            id="addressLine2"
                            value={form.addressLine2}
                            onChange={handleChange('addressLine2')}
                        />
                        <FormField
                            label="Address Line3"
                            id="addressLine3"
                            value={form.addressLine3}
                            onChange={handleChange('addressLine3')}
                        />
                    </div>

                    {/* Row 4 */}
                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                            label="City"
                            id="city"
                            value={form.city}
                            onChange={handleChange('city')}
                        />
                        <FormField
                            label="State Or Territory"
                            id="state"
                            value={form.state}
                            onChange={handleChange('state')}
                        />
                    </div>

                    {/* Row 5 */}
                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                            label="Zip Or Postal Code"
                            id="zipCode"
                            value={form.zipCode}
                            onChange={handleChange('zipCode')}
                        />
                        <FormField
                            label="Country Code"
                            id="countryCode"
                            value={form.countryCode}
                            onChange={handleChange('countryCode')}
                        />
                    </div>

                    {/* GST Toggle */}
                    <div className="flex flex-col gap-2">
                        <label className="text-[13px] font-medium text-[#333333]">GST Applicable</label>
                        <button
                            type="button"
                            onClick={handleToggle}
                            className={`relative inline-flex items-center w-[56px] h-[26px] rounded-full transition-colors duration-200 focus:outline-none
                                ${form.gstApplicable ? 'bg-[#1D71AB]' : 'bg-gray-300'}`}
                        >
                            <span
                                className={`absolute left-[3px] top-[3px] w-5 h-5 bg-white rounded-full shadow transition-transform duration-200
                                    ${form.gstApplicable ? 'translate-x-[30px]' : 'translate-x-0'}`}
                            />
                            <span
                                className={`absolute text-[10px] font-semibold text-white transition-all duration-200
                                    ${form.gstApplicable ? 'left-[6px]' : 'left-auto right-[5px] text-gray-100'}`}
                            >
                                {form.gstApplicable ? 'Yes' : 'No'}
                            </span>
                        </button>
                    </div>
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

export default EntityMasterModal;
