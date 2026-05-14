import React, { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';

const EMPTY_FORM = {
    id: null,
    entity_id: '',
    entity_name: '',
    registered_address: '',
    address_line1: '',
    address_line2: '',
    address_line3: '',
    city: '',
    state_or_territory: '',
    zip_or_postal_code: '',
    country_code: '',
    gst_applicable: false,
};

const FormField = ({ label, id, value, onChange, readOnly = false, placeholder = '', required = false, error = '' }) => (
    <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-[13px] font-medium text-[#333333]">
            {label} {required && <span className="text-red-500">*</span>}
        </label>
        <input
            id={id}
            type="text"
            value={value || ''}
            onChange={onChange}
            readOnly={readOnly}
            placeholder={placeholder}
            className={`h-[36px] px-3 border rounded-[4px] text-[13px] text-[#333333] outline-none transition-all bg-white
                ${error ? 'border-red-500 focus:ring-1 focus:ring-red-500/20' : 'border-[#D9D9D9] focus:border-[#1D71AB] focus:ring-1 focus:ring-[#1D71AB]/20'}
                ${readOnly ? 'bg-[#F5F5F5] cursor-not-allowed text-gray-400' : ''}`}
        />
        {error && <span className="text-[11px] text-red-500 mt-0.5">{error}</span>}
    </div>
);

const EntityMasterModal = ({ mode, rowData, onClose, onSave }) => {
    const isEdit = mode === 'edit';
    const [form, setForm] = useState(EMPTY_FORM);
    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (isEdit && rowData) {
            setForm({
                id: rowData.id ?? null,
                entity_id: rowData.entity_id ?? '',
                entity_name: (rowData.entity_name === 'Default Entity' ? 'Top Level' : rowData.entity_name) ?? '',
                registered_address: rowData.registered_address ?? '',
                address_line1: rowData.address_line1 ?? '',
                address_line2: rowData.address_line2 ?? '',
                address_line3: rowData.address_line3 ?? '',
                city: rowData.city ?? '',
                state_or_territory: rowData.state_or_territory ?? '',
                zip_or_postal_code: rowData.zip_or_postal_code ?? '',
                country_code: rowData.country_code ?? '',
                gst_applicable: rowData.gst_applicable ?? false,
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

    const handleGstChange = (val) =>
        setForm((prev) => ({ ...prev, gst_applicable: val }));

    const handleSave = () => {
        const newErrors = {};
        if (!form.entity_id) newErrors.entity_id = 'Entity Id is required';
        if (!form.entity_name) newErrors.entity_name = 'Entity Name is required';

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        onSave(form);
        onClose();
    };

    // Close on backdrop click

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
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
                    {(() => {
                        const isFieldReadOnly = isEdit;

                        return (
                            <>
                             
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField
                                        label="Entity Id"
                                        id="entity_id"
                                        value={form.entity_id}
                                        onChange={handleChange('entity_id')}
                                        readOnly={isFieldReadOnly}
                                        required
                                        error={errors.entity_id}
                                    />
                                    <FormField
                                        label="Entity Name"
                                        id="entity_name"
                                        value={form.entity_name}
                                        onChange={handleChange('entity_name')}
                                        readOnly={isFieldReadOnly}
                                        required
                                        error={errors.entity_name}
                                    />
                                </div>
                            </>
                        );
                    })()}

                    {/* Row 2 */}
                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                            label="Registered Address"
                            id="registered_address"
                            value={form.registered_address}
                            onChange={handleChange('registered_address')}
                        />
                        <FormField
                            label="Address Line1"
                            id="address_line1"
                            value={form.address_line1}
                            onChange={handleChange('address_line1')}
                        />
                    </div>

                    {/* Row 3 */}
                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                            label="Address Line2"
                            id="address_line2"
                            value={form.address_line2}
                            onChange={handleChange('address_line2')}
                        />
                        <FormField
                            label="Address Line3"
                            id="address_line3"
                            value={form.address_line3}
                            onChange={handleChange('address_line3')}
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
                            id="state_or_territory"
                            value={form.state_or_territory}
                            onChange={handleChange('state_or_territory')}
                        />
                    </div>

                    {/* Row 5 */}
                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                            label="Zip Or Postal Code"
                            id="zip_or_postal_code"
                            value={form.zip_or_postal_code}
                            onChange={handleChange('zip_or_postal_code')}
                        />
                        <FormField
                            label="Country Code"
                            id="country_code"
                            value={form.country_code}
                            onChange={handleChange('country_code')}
                        />
                    </div>

                    {/* GST Applicable — Radio Buttons */}
                    <div className="flex flex-col gap-2 mt-2">
                        <label className="text-[13px] font-medium text-[#333333]">GST Applicable</label>
                        <div className="flex items-center gap-6 mt-1">
                            <button
                                type="button"
                                onClick={() => handleGstChange(true)}
                                className="flex items-center gap-2 group cursor-pointer"
                            >
                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all
                                    ${form.gst_applicable
                                        ? 'border-[#1D71AB] bg-[#1D71AB]'
                                        : 'border-[#D9D9D9] bg-white group-hover:border-[#1D71AB]'}`}
                                >
                                    {form.gst_applicable && (
                                        <div className="w-2 h-2 rounded-full bg-white shadow-sm" />
                                    )}
                                </div>
                                <span className="text-[14px] text-gray-700">Yes</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => handleGstChange(false)}
                                className="flex items-center gap-2 group cursor-pointer"
                            >
                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all
                                    ${!form.gst_applicable
                                        ? 'border-[#1D71AB] bg-[#1D71AB]'
                                        : 'border-[#D9D9D9] bg-white group-hover:border-[#1D71AB]'}`}
                                >
                                    {!form.gst_applicable && (
                                        <div className="w-2 h-2 rounded-full bg-white shadow-sm" />
                                    )}
                                </div>
                                <span className="text-[14px] text-gray-700">No</span>
                            </button>
                        </div>
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
