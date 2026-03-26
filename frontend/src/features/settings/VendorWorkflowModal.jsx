import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import useWorkflowStore from '../../store/workflow.store';
import toast from '../../utils/toast';
import Dropdown from '../../components/ui/Dropdown';

const EMPTY_FORM = {
    vendor_id: '',
    vendor_name: '',
    mandatory_approver_1: '',
    mandatory_approver_2: '',
    mandatory_approver_3: '',
    mandatory_approver_4: '',
    mandatory_approver_5: '',
    threshold_approver: '',
    amount_threshold: '',
    approver_count: 1,
    enableThreshold: 'No'
};

const FormField = ({ label, id, value, onChange, type = "text", placeholder = '', required = false }) => (
    <div className="flex flex-col gap-1 w-full text-left">
        <label htmlFor={id} className="text-[13px] font-medium text-[#333333]">
            {required && <span className="text-red-500 mr-1">*</span>}
            {label}
        </label>
        <input
            id={id}
            type={type}
            value={value || ''}
            onChange={onChange}
            placeholder={placeholder}
            className="h-[40px] px-3 border border-[#D9D9D9] rounded-[8px] text-[14px] text-[#333333] outline-none
                focus:border-[#24A1DD] focus:ring-1 focus:ring-[#24A1DD]/20 transition-all bg-white shadow-sm"
        />
    </div>
);

const RadioGroup = ({ label, value, options, onChange }) => (
    <div className="flex flex-col gap-2 w-full text-left">
        <label className="text-[14px] font-medium text-[#333333]">{label}</label>
        <div className="flex items-center gap-6">
            {options.map((opt) => (
                <label key={opt} className="flex items-center gap-2 cursor-pointer group">
                    <div className="relative flex items-center justify-center">
                        <input
                            type="radio"
                            className="sr-only"
                            name={label}
                            value={opt}
                            checked={value === opt}
                            onChange={() => onChange(opt)}
                        />
                        <div className={`w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center
                            ${value === opt ? 'border-[#24A1DD]' : 'border-gray-300'}`}>
                            {value === opt && <div className="w-2.5 h-2.5 rounded-full bg-[#24A1DD]" />}
                        </div>
                    </div>
                    <span className="text-[14px] text-gray-700">{opt}</span>
                </label>
            ))}
        </div>
    </div>
);

const VendorWorkflowModal = ({ mode, rowData, onClose }) => {
    const isEdit = mode === 'edit';
    const [form, setForm] = useState(EMPTY_FORM);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const {
        workflowVendors, approversList,
        addVendorWorkflow, updateVendorWorkflow
    } = useWorkflowStore();

    useEffect(() => {
        if (isEdit && rowData) {
            setForm({
                vendor_id: rowData.vendor_id || '',
                vendor_name: rowData.vendor_name || '',
                mandatory_approver_1: rowData.mandatory_approver_1 || '',
                mandatory_approver_2: rowData.mandatory_approver_2 || '',
                mandatory_approver_3: rowData.mandatory_approver_3 || '',
                mandatory_approver_4: rowData.mandatory_approver_4 || '',
                mandatory_approver_5: rowData.mandatory_approver_5 || '',
                threshold_approver: rowData.threshold_approver || '',
                amount_threshold: rowData.amount_threshold || '',
                approver_count: rowData.approver_count || 2,
                enableThreshold: rowData.threshold_approver ? 'Yes' : 'No'
            });
        }
    }, [isEdit, rowData]);

    const handleVendorChange = (val) => {
        if (!val) {
            setForm(prev => ({ ...prev, vendor_id: '', vendor_name: '' }));
            return;
        }
        const [id, name] = val.split('|');
        setForm(prev => ({ ...prev, vendor_id: id, vendor_name: name }));
    };

    const handleSave = async () => {
        // Validation
        if (!form.vendor_name) {
            toast.error('Vendor Name is required');
            return;
        }

        // Validate mandatory approvers
        for (let i = 1; i <= form.approver_count; i++) {
            if (!form[`mandatory_approver_${i}`]) {
                toast.error(`Approver ${i} (Mandatory) is required`);
                return;
            }
        }

        if (form.enableThreshold === 'Yes' && (!form.threshold_approver || !form.amount_threshold)) {
            toast.error('Please fill threshold approver and amount');
            return;
        }

        const payload = {
            ...form,
            threshold_approver: form.enableThreshold === 'Yes' ? form.threshold_approver : null,
            amount_threshold: form.enableThreshold === 'Yes' ? parseFloat(form.amount_threshold) : null,
        };

        setIsSubmitting(true);
        try {
            if (isEdit) {
                await updateVendorWorkflow(rowData.id, payload);
                toast.success('Workflow rule updated successfully');
            } else {
                await addVendorWorkflow(payload);
                toast.success('Workflow rule added successfully');
            }
            onClose();
        } catch (err) {
            toast.error('Failed to save: ' + (err.response?.data?.detail || err.message));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBackdrop = (e) => {
        if (e.target === e.currentTarget) onClose();
    };

    // Filter approvers to avoid selecting the same person twice and clean labels
    const getFilteredApprovers = (currentField) => {
        const selected = [
            form.mandatory_approver_1,
            form.mandatory_approver_2,
            form.mandatory_approver_3,
            form.mandatory_approver_4,
            form.mandatory_approver_5,
            form.threshold_approver
        ].filter(v => v && v !== form[currentField]);

        return approversList
            .filter(apt => !selected.includes(apt.value))
            .map(opt => ({
                ...opt,
                label: opt.label.includes(' (') ? opt.label.split(' (')[0] : opt.label
            }));
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px]"
            onClick={handleBackdrop}
        >
            <div className="bg-white rounded-[12px] shadow-2xl w-full max-w-[550px] mx-4 flex flex-col max-h-[92vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-8 py-6 border-b border-gray-100">
                    <h2 className="text-[19px] font-bold text-[#1a2235]">
                        {isEdit ? 'Edit Vendor Workflow' : 'Add Vendor Workflow'}
                    </h2>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-all font-bold"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="overflow-y-auto px-10 py-8 flex flex-col gap-8">
                    {/* Vendor Selection */}
                    <div className="flex flex-col gap-6">
                        <Dropdown
                            label="Vendor Name *"
                            value={form.vendor_id ? `${form.vendor_id}|${form.vendor_name}` : ''}
                            options={workflowVendors}
                            onChange={handleVendorChange}
                            placeholder="Select Vendor"
                        />

                        <Dropdown
                            label="Number of Approvers *"
                            value={form.approver_count}
                            options={[
                                { value: 1, label: '1 Approver' },
                                { value: 2, label: '2 Approvers' },
                                { value: 3, label: '3 Approvers' },
                                { value: 4, label: '4 Approvers' },
                                { value: 5, label: '5 Approvers' },
                            ]}
                            onChange={(val) => setForm(prev => ({ ...prev, approver_count: val }))}
                        />

                        <RadioGroup
                            label="Enable Threshold Approver"
                            value={form.enableThreshold}
                            options={['Yes', 'No']}
                            onChange={(val) => setForm(prev => ({ ...prev, enableThreshold: val }))}
                        />
                    </div>

                    {/* Mandatory Approvers List */}
                    <div className="flex flex-col gap-6">
                        {Array.from({ length: form.approver_count }).map((_, idx) => (
                            <Dropdown
                                key={idx}
                                label={`Approver ${idx + 1} (Mandatory) *`}
                                value={form[`mandatory_approver_${idx + 1}`]}
                                options={getFilteredApprovers(`mandatory_approver_${idx + 1}`)}
                                onChange={(val) => setForm(prev => ({ ...prev, [`mandatory_approver_${idx + 1}`]: val }))}
                                placeholder={`Select Approver ${idx + 1}`}
                            />
                        ))}
                    </div>

                    {/* Threshold Approver Section */}
                    {form.enableThreshold === 'Yes' && (
                        <div className="flex flex-col gap-6 border-t pt-2 border-gray-50">
                            <Dropdown
                                label="Threshold Approver *"
                                value={form.threshold_approver}
                                options={getFilteredApprovers('threshold_approver')}
                                onChange={(val) => setForm(prev => ({ ...prev, threshold_approver: val }))}
                                placeholder="Select Threshold Approver"
                            />
                            <FormField
                                label="Amount Threshold"
                                required={true}
                                id="amount_threshold"
                                type="number"
                                value={form.amount_threshold}
                                onChange={(e) => setForm(prev => ({ ...prev, amount_threshold: e.target.value }))}
                                placeholder="Enter threshold amount"
                            />
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-4 px-8 py-6 border-t border-gray-100">
                    <button
                        onClick={onClose}
                        className="px-8 h-[44px] text-[15px] font-medium text-gray-600 border border-gray-200 rounded-[8px] hover:bg-gray-50 transition-all"
                        disabled={isSubmitting}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className={`px-10 h-[44px] text-[15px] font-medium text-white bg-[#1a9fff] rounded-[8px] hover:bg-[#0088ff] transition-all shadow-md
                            ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? 'Processing...' : 'OK'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VendorWorkflowModal;
