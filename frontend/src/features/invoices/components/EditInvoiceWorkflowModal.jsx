import React, { useState, useEffect, useMemo } from 'react';
import { X, Layers, ShieldCheck, DollarSign, Send } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import useWorkflowStore from '../../../store/workflow.store';
import { saveCustomInvoiceWorkflow } from '../../../api/invoiceApi';
import toast from '../../../utils/toast';
import Dropdown from '../../../components/ui/Dropdown';

const EMPTY_FORM = {
    approver_count: 1,
    mandatory_approver_1: [],
    mandatory_approver_2: [],
    mandatory_approver_3: [],
    mandatory_approver_4: [],
    mandatory_approver_5: [],
    financeFlags: { 1: false, 2: false, 3: false, 4: false, 5: false },
    enableThreshold: 'No',
    threshold_approver: [],
    amount_threshold: '',
    posting_approver: []
};

const RadioGroup = ({ label, value, options, onChange }) => (
    <div className="flex flex-col gap-2 w-full text-left">
        <label className="text-[13px] font-semibold text-gray-700">{label}</label>
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
                    <span className="text-[14px] text-gray-600 font-medium">{opt}</span>
                </label>
            ))}
        </div>
    </div>
);

const EditInvoiceWorkflowModal = ({ invoice, workflowData, onClose, onSuccess }) => {
    const queryClient = useQueryClient();
    const [form, setForm] = useState(EMPTY_FORM);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const {
        approversList,
        fetchVendorMetadata
    } = useWorkflowStore();

    useEffect(() => {
        if (!approversList || approversList.length === 0) {
            fetchVendorMetadata();
        }
    }, [fetchVendorMetadata, approversList]);

    useEffect(() => {
        if (workflowData?.assigned_approvers) {
            const breakdown = workflowData.approver_breakdown || {};
            const hasThreshold = breakdown.has_threshold_approver || false;
            const hasPosting = breakdown.has_posting_approver || false;

            let stages = [...workflowData.assigned_approvers];
            let thresholdEmails = [];
            let postingEmails = [];
            let amountThreshold = breakdown.amount_threshold || '';

            // 1. Extract Posting Approver if present (always the last level)
            if (hasPosting && stages.length > 0) {
                const pStage = stages[stages.length - 1];
                postingEmails = Array.isArray(pStage?.emails) ? pStage.emails : (pStage?.emails ? [pStage.emails] : []);
                stages.pop(); // Remove posting from standard stages list
            }

            // 2. Extract Threshold Approver if present (now the last remaining level if hasPosting, or previously last)
            if (hasThreshold && stages.length > 0) {
                const thresholdIdx = stages.length - 1;
                const tStage = stages[thresholdIdx];
                thresholdEmails = Array.isArray(tStage?.emails) ? tStage.emails : (tStage?.emails ? [tStage.emails] : []);
                stages.splice(thresholdIdx, 1); // Remove threshold from standard stages list
            }

            // 3. Map remaining standard stages
            const count = Math.min(Math.max(stages.length, 1), 5);
            const financeFlags = { 1: false, 2: false, 3: false, 4: false, 5: false };

            const initialForm = {
                approver_count: count,
                enableThreshold: hasThreshold ? 'Yes' : 'No',
                threshold_approver: thresholdEmails,
                amount_threshold: amountThreshold,
                posting_approver: postingEmails
            };

            stages.forEach((stage, idx) => {
                const isFinance = stage?.is_finance || false;
                financeFlags[idx + 1] = isFinance;
                const emails = Array.isArray(stage?.emails) ? stage.emails : (stage?.emails ? [stage.emails] : []);
                initialForm[`mandatory_approver_${idx + 1}`] = isFinance ? [] : emails.filter(e => typeof e === 'string');
            });
            initialForm.financeFlags = financeFlags;

            setForm(prev => ({
                ...prev,
                ...initialForm
            }));
        }
    }, [workflowData]);

    const handleSave = async () => {
        const approversPayload = [];

        // 1. Add Mandatory Levels
        for (let i = 1; i <= form.approver_count; i++) {
            const isFinance = form.financeFlags?.[i] || false;
            const emails = form[`mandatory_approver_${i}`] || [];
            if (!isFinance && emails.length === 0) {
                toast.error(`Please select at least one approver for Level ${i}`);
                return;
            }
            approversPayload.push({
                level: approversPayload.length + 1,
                emails: emails,
                is_finance: isFinance
            });
        }

        // 2. Add Threshold Level
        if (form.enableThreshold === 'Yes') {
            if (!form.amount_threshold || Number(form.amount_threshold) <= 0) {
                toast.error('Amount Threshold must be greater than 0');
                return;
            }
            if (!form.threshold_approver || form.threshold_approver.length === 0) {
                toast.error('Please select at least one threshold approver');
                return;
            }
            approversPayload.push({
                level: approversPayload.length + 1,
                emails: form.threshold_approver,
                is_finance: false
            });
        }

        // 3. Add Posting Level (Mandatory and required!)
        if (!form.posting_approver || form.posting_approver.length === 0) {
            toast.error('Posting Approver is required');
            return;
        }
        approversPayload.push({
            level: approversPayload.length + 1,
            emails: form.posting_approver,
            is_finance: false
        });

        setIsSubmitting(true);
        try {
            await saveCustomInvoiceWorkflow(invoice.id, {
                approvers: approversPayload,
                has_posting_approver: true,
                has_threshold_approver: form.enableThreshold === 'Yes',
                amount_threshold: form.enableThreshold === 'Yes' ? Number(form.amount_threshold) : null
            });
            toast.success('Custom approval chain saved for this invoice!');

            // Invalidate React Query caches for this invoice's preview and workflow configuration
            queryClient.invalidateQueries(["invoice-preview", invoice.id]);
            queryClient.invalidateQueries(["invoice-preview", String(invoice.id)]);
            queryClient.invalidateQueries(["workflow", invoice.id]);
            queryClient.invalidateQueries(["workflow", String(invoice.id)]);

            onSuccess?.();
            onClose();
        } catch (err) {
            toast.error(err.message || 'Failed to save custom workflow sequence.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Filtered options for Posting / Threshold Approvers (finance approvers only, showing ALL members as per RuleModal.jsx)
    const financeApprovers = useMemo(() => {
        return (approversList || [])
            .filter(a => a.department?.toLowerCase() === 'finance')
            .map(opt => ({
                ...opt,
                label: opt.label.includes(' (') ? opt.label.split(' (')[0] : opt.label
            }));
    }, [approversList]);

    const getFilteredApprovers = (currentField) => {
        const selected = new Set();
        [
            form.mandatory_approver_1,
            form.mandatory_approver_2,
            form.mandatory_approver_3,
            form.mandatory_approver_4,
            form.mandatory_approver_5,
            form.threshold_approver,
            form.posting_approver
        ].forEach(field => {
            if (field === form[currentField]) return;
            if (Array.isArray(field)) {
                field.forEach(email => selected.add(email));
            }
        });

        return (approversList || [])
            .filter(apt => !selected.has(apt.value))
            .map(opt => ({
                ...opt,
                label: opt.label.includes(' (') ? opt.label.split(' (')[0] : opt.label
            }));
    };

    const firstLine = invoice?.line_items?.[0] || {};
    const lobVal = firstLine.lob || 'N/A';
    const deptVal = firstLine.department || 'N/A';
    const matchedRuleType = workflowData?.workflow_type || 'None (Default Fallback)';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[4px]">
            <div className="bg-white rounded-[16px] shadow-2xl w-full max-w-[680px] mx-4 flex flex-col max-h-[92vh] border border-gray-100 transform scale-100 transition-all duration-300">
                {/* Header */}
                <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100 bg-[#f9fafb] rounded-t-[16px]">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-[#24A1DD]/10 flex items-center justify-center text-[#24A1DD]">
                            <Layers size={18} />
                        </div>
                        <div>
                            <h2 className="text-[17px] font-bold text-gray-900 leading-none">
                                Edit Invoice Approval Chain
                            </h2>
                            <p className="text-[12px] text-gray-500 mt-1 font-medium">
                                Invoice #{invoice?.invoice_number || invoice?.id} &bull; Custom override for this invoice only
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-all"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="overflow-y-auto px-8 py-6 flex flex-col gap-6">
                    {/* Read-Only Criteria Section */}
                    <div className="bg-gray-50 p-4 rounded-[12px] border border-gray-100 grid grid-cols-2 gap-x-6 gap-y-4 text-left">
                        <div className="flex flex-col">
                            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Vendor Match</span>
                            <span className="text-[13px] font-semibold text-gray-700 mt-0.5 truncate" title={invoice?.vendor_name}>
                                {invoice?.vendor_name || 'N/A'} {invoice?.vendor_id ? `(${invoice?.vendor_id})` : ''}
                            </span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Matched Rule Type</span>
                            <span className="text-[13px] font-bold text-[#24A1DD] mt-0.5 capitalize">
                                {matchedRuleType.replace(/_/g, ' ')}
                            </span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Line of Business (LOB)</span>
                            <span className="text-[13px] font-semibold text-gray-700 mt-0.5">{lobVal}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Department</span>
                            <span className="text-[13px] font-semibold text-gray-700 mt-0.5">{deptVal}</span>
                        </div>
                    </div>

                    {/* Step Configuration */}
                    <div className="flex flex-col gap-5 border-t pt-5 border-gray-100">
                        <Dropdown
                            label="Number of Approval Levels *"
                            value={form.approver_count}
                            options={[
                                { value: 1, label: '1 Level' },
                                { value: 2, label: '2 Levels' },
                                { value: 3, label: '3 Levels' },
                                { value: 4, label: '4 Levels' },
                                { value: 5, label: '5 Levels' },
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

                    {/* Mandatory Levels List */}
                    <div className="flex flex-col gap-5 border-t pt-5 border-gray-100">
                        <h3 className="text-[13px] font-bold text-gray-900 text-left flex items-center gap-1.5 mb-1">
                            <ShieldCheck size={16} className="text-[#1AB394]" />
                            Mandatory Approval Levels
                        </h3>
                        {Array.from({ length: form.approver_count }).map((_, idx) => (
                            <div key={idx} className="flex flex-col gap-2 p-4 rounded-lg bg-gray-50 border border-gray-100 text-left">
                                <label className="text-[13px] font-semibold text-gray-700">
                                    Level {idx + 1} Approvers *
                                </label>
                                <div className="flex items-center gap-2 mb-1">
                                    <input
                                        type="checkbox"
                                        id={`finance_flag_${idx + 1}`}
                                        checked={!!form.financeFlags?.[idx + 1]}
                                        onChange={(e) => {
                                            const checked = e.target.checked;
                                            setForm(prev => ({
                                                ...prev,
                                                financeFlags: {
                                                    ...prev.financeFlags,
                                                    [idx + 1]: checked
                                                },
                                                [`mandatory_approver_${idx + 1}`]: []
                                            }));
                                        }}
                                        className="w-4 h-4 rounded border-gray-300 text-[#24A1DD] focus:ring-[#24A1DD] cursor-pointer"
                                    />
                                    <label htmlFor={`finance_flag_${idx + 1}`} className="text-sm text-gray-600 font-medium cursor-pointer">
                                        Assign to Finance Team
                                    </label>
                                </div>
                                <Dropdown
                                    placeholder={form.financeFlags?.[idx + 1] ? "Assigned to whole Finance Team" : `Select Approver(s) for Level ${idx + 1}`}
                                    value={form[`mandatory_approver_${idx + 1}`] || []}
                                    mode="multiple"
                                    options={getFilteredApprovers(`mandatory_approver_${idx + 1}`)}
                                    onChange={(val) => setForm(prev => ({
                                        ...prev,
                                        [`mandatory_approver_${idx + 1}`]: val,
                                        financeFlags: {
                                            ...prev.financeFlags,
                                            [idx + 1]: false
                                        }
                                    }))}
                                    disabled={!!form.financeFlags?.[idx + 1]}
                                />
                            </div>
                        ))}
                    </div>

                    {/* Threshold Section */}
                    {form.enableThreshold === 'Yes' && (
                        <div className="flex flex-col gap-5 border-t pt-5 border-gray-100 text-left">
                            <h3 className="text-[13px] font-bold text-gray-900 text-left flex items-center gap-1.5 mb-1">
                                <DollarSign size={16} className="text-amber-500" />
                                Threshold Settings
                            </h3>
                            <div className="grid grid-cols-2 gap-6 items-end">
                                <div className="flex flex-col gap-1 w-full text-left">
                                    <label htmlFor="amount_threshold" className="text-[13px] font-medium text-gray-700">
                                        <span className="text-red-500 mr-1">*</span>
                                        Amount Threshold
                                    </label>
                                    <input
                                        id="amount_threshold"
                                        type="number"
                                        step="0.01"
                                        placeholder="$ 0.00"
                                        value={form.amount_threshold || ''}
                                        onChange={(e) => setForm(prev => ({ ...prev, amount_threshold: e.target.value }))}
                                        className="h-[40px] px-3 border border-[#D9D9D9] rounded-[8px] text-[14px] text-[#333333] outline-none
                                            focus:border-[#24A1DD] focus:ring-1 focus:ring-[#24A1DD]/20 transition-all bg-white shadow-sm"
                                    />
                                </div>
                                <Dropdown
                                    label="Threshold Approver *"
                                    value={form.threshold_approver || []}
                                    mode="multiple"
                                    options={financeApprovers}
                                    onChange={(val) => setForm(prev => ({ ...prev, threshold_approver: val }))}
                                    placeholder="Select Threshold Approver(s)"
                                />
                            </div>
                        </div>
                    )}

                    {/* Posting Section (Always Mandatory and Required!) */}
                    <div className="flex flex-col gap-5 border-t pt-5 border-gray-100">
                        <h3 className="text-[13px] font-bold text-gray-900 text-left flex items-center gap-1.5 mb-1">
                            <Send size={16} className="text-[#24A1DD]" />
                            Posting Approver Settings
                        </h3>
                        <Dropdown
                            label="Posting Approver *"
                            required
                            value={form.posting_approver || []}
                            mode="multiple"
                            options={financeApprovers}
                            onChange={(val) => setForm(prev => ({ ...prev, posting_approver: val }))}
                            placeholder="Select Posting Approver(s)"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-8 py-5 border-t border-gray-100 bg-[#f9fafb] rounded-b-[16px]">
                    <button
                        onClick={onClose}
                        className="px-6 h-[40px] text-[14px] font-medium text-gray-600 border border-gray-300 rounded-[8px] hover:bg-gray-100 hover:text-gray-800 transition-all"
                        disabled={isSubmitting}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className={`px-8 h-[40px] text-[14px] font-semibold text-white bg-[#24A1DD] hover:bg-[#1d8cb8] rounded-[8px] transition-all shadow-sm flex items-center justify-center gap-2
                            ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? (
                            <>
                                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Saving...
                            </>
                        ) : 'Save Workflow'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EditInvoiceWorkflowModal;
