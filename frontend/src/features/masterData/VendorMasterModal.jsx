import React, { useState, useEffect } from 'react';
import { X, ChevronDown } from 'lucide-react';
import useMasterDataStore from '../../store/masterData.store';

const EMPTY_FORM = {
    id: null,
    vendor_id: '',
    vendor_name: '',
    vendor_is_an_individual_person: false,
    address_line1: '',
    address_line2: '',
    address_line3: '',
    city: '',
    state_or_territory: '',
    zip_or_postal_code: '',
    country_code: '',
    country: '',
    primary_phone: '',
    secondary_phone_no: '',
    mobile_phone: '',
    primary_email_address: '',
    secondary_email_address: '',
    pay_terms: '',
    tax_id: '',
    gst_eligibility: true,
    tds_applicability: false,
    tds_percentage: '',
    tds_section_code: '',
    workflow_applicable: true,
    line_grouping: false,
    entity_id: '',
};

const FormField = ({ label, id, value, onChange, readOnly = false, placeholder = '' }) => (
    <div className="flex flex-col gap-1 w-full">
        <label htmlFor={id} className="text-[13px] font-medium text-[#666666]">
            {label}
        </label>
        <input
            id={id}
            type="text"
            value={value || ''}
            onChange={onChange}
            readOnly={readOnly}
            placeholder={placeholder}
            className={`h-[38px] px-3 border border-[#D9D9D9] rounded-[4px] text-[13px] text-[#333333] outline-none
                focus:border-[#1D71AB] focus:ring-1 focus:ring-[#1D71AB]/20 transition-all bg-white
                ${readOnly ? 'bg-[#F5F5F5] cursor-not-allowed text-gray-400' : ''}`}
        />
    </div>
);

const ToggleSwitch = ({ label, checked, onChange, activeLabel = "Yes", inactiveLabel = "No" }) => (
    <div className="flex flex-col gap-2 w-full">
        <label className="text-[13px] font-medium text-[#666666]">{label}</label>
        <div 
            onClick={() => onChange(!checked)}
            className={`relative w-[64px] h-[24px] rounded-full cursor-pointer transition-all duration-200 flex items-center px-1
                ${checked ? 'bg-[#24A1DD]' : 'bg-[#D1D5DB]'}`}
        >
            <div className={`absolute text-[10px] font-bold text-white transition-all duration-200
                ${checked ? 'left-2 opacity-100' : 'left-6 opacity-0'}`}>
                {activeLabel}
            </div>
            <div className={`absolute text-[10px] font-bold text-white transition-all duration-200
                ${!checked ? 'right-2 opacity-100' : 'right-6 opacity-0'}`}>
                {inactiveLabel}
            </div>
            <div className={`w-[18px] h-[18px] bg-white rounded-full shadow-sm transition-all duration-200 transform
                ${checked ? 'translate-x-[36px]' : 'translate-x-0'}`} 
            />
        </div>
    </div>
);

const CustomDropdown = ({ label, value, options, onChange, disabled = false }) => (
    <div className="flex flex-col gap-1 w-full">
        <label className="text-[13px] font-medium text-[#666666]">{label}</label>
        <div className="relative">
            <select
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                className={`h-[38px] w-full px-3 pr-8 border border-[#D9D9D9] rounded-[4px] text-[13px] text-[#333333] outline-none appearance-none
                    focus:border-[#1D71AB] focus:ring-1 focus:ring-[#1D71AB]/20 transition-all bg-white
                    ${disabled ? 'bg-[#F5F5F5] cursor-not-allowed text-gray-400' : 'cursor-pointer'}`}
            >
                <option value="">Select...</option>
                {options.map((opt, idx) => (
                    <option key={idx} value={opt.value}>{opt.label}</option>
                ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
    </div>
);

const VendorMasterModal = ({ mode, rowData, onClose, onSave }) => {
    const isEdit = mode === 'edit';
    const [form, setForm] = useState(EMPTY_FORM);
    const { masters } = useMasterDataStore();
    
    const tdsRates = masters['TDS Rates']?.data || [];

    useEffect(() => {
        if (isEdit && rowData) {
            setForm({
                id: rowData.id ?? null,
                vendor_id: rowData.vendor_id ?? '',
                vendor_name: rowData.vendor_name ?? '',
                vendor_is_an_individual_person: rowData.vendor_is_an_individual_person ?? false,
                address_line1: rowData.address_line1 ?? '',
                address_line2: rowData.address_line2 ?? '',
                address_line3: rowData.address_line3 ?? '',
                city: rowData.city ?? '',
                state_or_territory: rowData.state_or_territory ?? '',
                zip_or_postal_code: rowData.zip_or_postal_code ?? '',
                country_code: rowData.country_code ?? '',
                country: rowData.country ?? '',
                primary_phone: rowData.primary_phone ?? '',
                secondary_phone_no: rowData.secondary_phone_no ?? '',
                mobile_phone: rowData.mobile_phone ?? '',
                primary_email_address: rowData.primary_email_address ?? '',
                secondary_email_address: rowData.secondary_email_address ?? '',
                pay_terms: rowData.pay_terms ?? '',
                tax_id: rowData.tax_id ?? '',
                gst_eligibility: rowData.gst_eligibility ?? true,
                tds_applicability: rowData.tds_applicability ?? false,
                tds_percentage: rowData.tds_percentage ?? '',
                tds_section_code: rowData.tds_section_code ?? '',
                workflow_applicable: rowData.workflow_applicable ?? true,
                line_grouping: rowData.line_grouping ?? false,
                entity_id: rowData.entity_id ?? '',
            });
        } else {
            setForm(EMPTY_FORM);
        }
    }, [isEdit, rowData]);

    const handleChange = (field) => (e) =>
        setForm((prev) => ({ ...prev, [field]: e.target.value }));

    const handleToggle = (field) => (val) => {
        setForm((prev) => {
            const newState = { ...prev, [field]: val };
            // Clear TDS fields if applicability is turned off
            if (field === 'tds_applicability' && !val) {
                newState.tds_percentage = '';
                newState.tds_section_code = '';
            }
            return newState;
        });
    };

    const handleTdsSectionChange = (val) => {
        const matched = tdsRates.find(r => {
            const code = r.section || '';
            const nature = r.nature || '';
            return `${code} - ${nature}` === val;
        });
        
        setForm(prev => ({
            ...prev,
            tds_section_code: val,
            tds_percentage: matched ? (matched.individualRate || matched.companyRate || '') : prev.tds_percentage
        }));
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px]"
            onClick={handleBackdrop}
        >
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-[700px] mx-4 flex flex-col max-h-[95vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
                    <h2 className="text-[17px] font-semibold text-[#1a2235]">
                        {isEdit ? 'Edit Row' : 'Add to Vendor Master'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all"
                    >
                        <X size={17} />
                    </button>
                </div>

                {/* Body */}
                <div className="overflow-y-auto px-8 py-6 flex flex-col gap-5">
                    {/* Row 1 */}
                    <div className="grid grid-cols-2 gap-6">
                        <FormField
                            label="Vendor Id"
                            id="vendor_id"
                            value={form.vendor_id}
                            onChange={handleChange('vendor_id')}
                        />
                        <FormField
                            label="Vendor Name"
                            id="vendor_name"
                            value={form.vendor_name}
                            onChange={handleChange('vendor_name')}
                        />
                    </div>

                    {/* Row 2 */}
                    <div className="grid grid-cols-2 gap-6">
                        <FormField
                            label="Vendor Is An Individual Person"
                            id="vendor_is_an_individual_person"
                            value={form.vendor_is_an_individual_person ? 'true' : 'false'}
                            onChange={(e) => setForm(prev => ({ ...prev, vendor_is_an_individual_person: e.target.value === 'true' }))}
                            placeholder="true / false"
                        />
                        <FormField
                            label="Address Line1"
                            id="address_line1"
                            value={form.address_line1}
                            onChange={handleChange('address_line1')}
                        />
                    </div>

                    {/* Row 3 */}
                    <div className="grid grid-cols-2 gap-6">
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
                    <div className="grid grid-cols-2 gap-6">
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
                    <div className="grid grid-cols-2 gap-6">
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

                    {/* Row 6 */}
                    <div className="grid grid-cols-2 gap-6">
                        <FormField
                            label="Country"
                            id="country"
                            value={form.country}
                            onChange={handleChange('country')}
                        />
                        <FormField
                            label="Primary Phone"
                            id="primary_phone"
                            value={form.primary_phone}
                            onChange={handleChange('primary_phone')}
                        />
                    </div>

                    {/* Row 7 */}
                    <div className="grid grid-cols-2 gap-6">
                        <FormField
                            label="Secondary Phone No"
                            id="secondary_phone_no"
                            value={form.secondary_phone_no}
                            onChange={handleChange('secondary_phone_no')}
                        />
                        <FormField
                            label="Mobile Phone"
                            id="mobile_phone"
                            value={form.mobile_phone}
                            onChange={handleChange('mobile_phone')}
                        />
                    </div>

                    {/* Row 8 */}
                    <div className="grid grid-cols-2 gap-6">
                        <FormField
                            label="Primary Email Address"
                            id="primary_email_address"
                            value={form.primary_email_address}
                            onChange={handleChange('primary_email_address')}
                        />
                        <FormField
                            label="Secondary Email Address"
                            id="secondary_email_address"
                            value={form.secondary_email_address}
                            onChange={handleChange('secondary_email_address')}
                        />
                    </div>

                    {/* Row 9 */}
                    <div className="grid grid-cols-2 gap-6">
                        <FormField
                            label="Pay Terms"
                            id="pay_terms"
                            value={form.pay_terms}
                            onChange={handleChange('pay_terms')}
                        />
                        <FormField
                            label="Tax Id"
                            id="tax_id"
                            value={form.tax_id}
                            onChange={handleChange('tax_id')}
                        />
                    </div>

                    {/* Row 10 (Toggles) */}
                    <div className="grid grid-cols-2 gap-6">
                        <ToggleSwitch
                            label="GST / Use Tax Eligibility Configuration"
                            checked={form.gst_eligibility}
                            onChange={handleToggle('gst_eligibility')}
                            activeLabel="Eligible"
                            inactiveLabel="Ineligible"
                        />
                        <ToggleSwitch
                            label="TDS/Withhold Tax Applicability Configuration"
                            checked={form.tds_applicability}
                            onChange={handleToggle('tds_applicability')}
                        />
                    </div>

                    {/* Row 11 (TDS Dropdowns) */}
                    <div className="grid grid-cols-2 gap-6">
                        <CustomDropdown
                            label="TDS Percentage"
                            value={form.tds_percentage}
                            disabled={!form.tds_applicability}
                            options={tdsRates.map(r => ({
                                value: r.individualRate || r.companyRate || '',
                                label: r.individualRate || r.companyRate || ''
                            }))}
                            onChange={(val) => setForm(prev => ({ ...prev, tds_percentage: val }))}
                        />
                        <CustomDropdown
                            label="TDS Section Code and Description"
                            value={form.tds_section_code}
                            disabled={!form.tds_applicability}
                            options={tdsRates.map(r => {
                                const code = r.section || '';
                                const nature = r.nature || '';
                                const combined = `${code} - ${nature}`;
                                return { value: combined, label: combined };
                            })}
                            onChange={handleTdsSectionChange}
                        />
                    </div>

                    {/* Row 12 (Toggles) */}
                    <div className="grid grid-cols-2 gap-6">
                        <ToggleSwitch
                            label="Workflow Applicability Configuration"
                            checked={form.workflow_applicable}
                            onChange={handleToggle('workflow_applicable')}
                        />
                        <ToggleSwitch
                            label="Line Grouping"
                            checked={form.line_grouping}
                            onChange={handleToggle('line_grouping')}
                        />
                    </div>

                    {/* Row 13 */}
                    <div className="grid grid-cols-2 gap-6">
                        <FormField
                            label="Entity Id"
                            id="entity_id"
                            value={form.entity_id}
                            onChange={handleChange('entity_id')}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 mt-auto">
                    <button
                        onClick={onClose}
                        className="px-6 h-[40px] text-[14px] font-medium text-gray-600 border border-gray-200 rounded-[6px] hover:bg-gray-50 transition-all font-inter"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-8 h-[40px] text-[14px] font-medium text-white bg-[#24A1DD] rounded-[6px] hover:bg-[#1D71AB] transition-all shadow-sm font-inter"
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VendorMasterModal;
