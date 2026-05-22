import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Radio, Checkbox } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import useWorkflowStore from '../../../store/workflow.store';
import { saveCustomInvoiceWorkflow } from '../../../api/invoiceApi';
import toast from '../../../utils/toast';
import Dropdown from '../../../components/ui/Dropdown';
import CustomInput from '../../../shared/components/CustomInput';
import CustomButton from '../../../shared/components/CustomButton';

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
// Validate no duplicate approvers across mandatory + threshold levels only.
// Posting Approver is a special Sage-posting role and is intentionally allowed
// to overlap with regular level approvers.
const allSelected = [
  ...Array.from({ length: form.approver_count }).flatMap((_, i) => form[`mandatory_approver_${i + 1}`] || []),
  ...(form.threshold_approver || [])
];
const duplicate = allSelected.find((email, idx) => allSelected.indexOf(email) !== idx);
if (duplicate) {
  toast.error(`Approver ${duplicate} selected multiple times. Each approver must be unique.`);
  return;
}
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
                amount_threshold: form.enableThreshold === 'Yes' ? Number(form.amount_threshold) : null,
                last_updated_at: invoice?.updated_at
            });
            toast.success('Custom approval chain saved for this invoice!');

            queryClient.invalidateQueries(["invoice-preview", invoice.id]);
            queryClient.invalidateQueries(["invoice-preview", String(invoice.id)]);
            queryClient.invalidateQueries(["workflow", invoice.id]);
            queryClient.invalidateQueries(["workflow", String(invoice.id)]);

            onSuccess?.();
            onClose();
        } catch (err) {
            toast.error(err.response?.data?.detail || err.message || 'Failed to save custom workflow sequence.');
        } finally {
            setIsSubmitting(false);
        }
    };



    const firstLine = invoice?.line_items?.[0] || {};
    const lobVal = firstLine.lob || 'N/A';
    const deptVal = firstLine.department || 'N/A';
    const matchedRuleType = workflowData?.workflow_type || 'None (Default Fallback)';
// Finance team approvers with label "Name - Department"
const financeApprovers = useMemo(() => {
    return (approversList || [])
        .filter(a => a.department?.toLowerCase() === 'finance')
        .map(opt => ({
            ...opt,
            label: `${opt.label.includes(' (') ? opt.label.split(' (')[0] : opt.label} - ${opt.department}`
        }));
}, [approversList]);

// Filter approvers for mandatory/threshold level dropdowns to avoid duplicates.
// posting_approver is intentionally excluded from this filter because it is a
// special Sage-posting role and is allowed to share a person with regular levels.
const getFilteredApprovers = (currentField) => {
    const selected = new Set();
    [
        form.mandatory_approver_1,
        form.mandatory_approver_2,
        form.mandatory_approver_3,
        form.mandatory_approver_4,
        form.mandatory_approver_5,
        form.threshold_approver
        // posting_approver intentionally omitted — allowed to overlap
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
            label: `${opt.label.includes(' (') ? opt.label.split(' (')[0] : opt.label} - ${opt.department}`
        }));
};

// Finance-only filtered approvers for threshold level.
// posting_approver is intentionally excluded from this filter.
const getFilteredFinanceApprovers = (currentField) => {
    const selected = new Set();
    [
        form.mandatory_approver_1,
        form.mandatory_approver_2,
        form.mandatory_approver_3,
        form.mandatory_approver_4,
        form.mandatory_approver_5,
        form.threshold_approver
        // posting_approver intentionally omitted — allowed to overlap
    ].forEach(field => {
        if (field === form[currentField]) return;
        if (Array.isArray(field)) {
            field.forEach(email => selected.add(email));
        }
    });
    return financeApprovers.filter(opt => !selected.has(opt.value));
};

    return (
        <Modal
            open={true}
            onCancel={onClose}
            footer={null}
            width={760}
            centered
            maskClosable={false}
            closeIcon={null}
            styles={{ content: { padding: 0, borderRadius: 12, overflow: "hidden" } }}
        >
            <div className="bg-white flex flex-col" style={{ maxHeight: "85vh" }}>
                {/* HEADER */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-[#E0E0E0] flex-shrink-0">
                    <h2 className="font-semibold custom-font-jura text-[16px] text-gray-800">
                        Edit Invoice Approval Chain
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                    >
                        ×
                    </button>
                </div>

                {/* BODY */}
                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
                    {/* Read-Only Criteria Section */}
                    {/* <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 grid grid-cols-2 gap-x-6 gap-y-4 text-left">
                        <div className="flex flex-col">
                            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Vendor Match</span>
                            <span className="text-[13px] font-semibold text-gray-700 mt-0.5 truncate" title={invoice?.vendor_name}>
                                {invoice?.vendor_name || 'N/A'} {invoice?.vendor_id ? `(${invoice?.vendor_id})` : ''}
                            </span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Matched Rule Type</span>
                            <span className="text-[13px] font-bold text-blue-500 mt-0.5 capitalize">
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
                    </div> */}

                    {/* Step Configuration */}
                    <div className="grid grid-cols-2 gap-4 items-end">
                        <Dropdown
                            label="Number of Approval Levels *"
                            value={form.approver_count}
                            onChange={(val) => setForm(prev => ({ ...prev, approver_count: val }))}
                            options={[
                                { value: 1, label: '1 Level' },
                                { value: 2, label: '2 Levels' },
                                { value: 3, label: '3 Levels' },
                                { value: 4, label: '4 Levels' },
                                { value: 5, label: '5 Levels' },
                            ]}
                        />
                        <div className="flex flex-col gap-1">
                            <label className="text-sm font-medium text-gray-700">
                                Enable Threshold Approver
                            </label>
                            <div className="flex items-center gap-6 rounded-md bg-white px-3" style={{ height: 36 }}>
                                <Radio.Group
                                    value={form.enableThreshold}
                                    onChange={(e) => setForm(prev => ({ ...prev, enableThreshold: e.target.value }))}
                                    className="flex gap-4"
                                >
                                    <Radio value="Yes">Yes</Radio>
                                    <Radio value="No">No</Radio>
                                </Radio.Group>
                            </div>
                        </div>
                    </div>

                    {/* Mandatory Levels List */}
                    <div>
                        <p className="text-sm font-semibold text-gray-700 mb-3">
                            Approver Configuration
                        </p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                            {Array.from({ length: form.approver_count }).map((_, idx) => (
                                <div key={idx} className="flex flex-col gap-2 p-3 rounded-lg bg-gray-50 border border-gray-100 text-left">
                                    <label className="text-sm font-medium text-gray-700">
                                        <span className="text-red-500 mr-1">*</span>
                                        Level {idx + 1} Approver(s)
                                        <span className="ml-1 text-xs text-gray-400 font-normal">(Mandatory)</span>
                                    </label>
                                    <Checkbox
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
                                    >
                                        <span className="text-sm text-gray-600">Assign to Finance Team</span>
                                    </Checkbox>
                                    <Dropdown
                                        placeholder={form.financeFlags?.[idx + 1] ? "Assigned to whole Finance Team" : `Select Approver(s)`}
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
                    </div>

                    {/* Threshold Section */}
                    {form.enableThreshold === 'Yes' && (
                        <div>
                            <p className="text-sm font-semibold text-gray-700 mb-3">Threshold Settings</p>
                            <div className="grid grid-cols-2 gap-4 items-end text-left">
                                <CustomInput
                                    label="Amount Threshold *"
                                    type="number"
                                    step="0.01"
                                    placeholder="$ 0.00"
                                    value={form.amount_threshold || ''}
                                    onChange={(e) => setForm(prev => ({ ...prev, amount_threshold: e.target.value }))}
                                    className="mb-0"
                                    height="40px"
                                />
                                <Dropdown
                                    label="Threshold Approver *"
                                    value={form.threshold_approver || []}
                                    mode="multiple"
                                    options={getFilteredFinanceApprovers('threshold_approver')}
                                    onChange={(val) => setForm(prev => ({ ...prev, threshold_approver: val }))}
                                    placeholder="Select Threshold Approver(s)"
                                />
                            </div>
                        </div>
                    )}

                    {/* Posting Section (Always Mandatory and Required!) */}
                    <div>
                        <p className="text-sm font-semibold text-gray-700 mb-3">Posting Approver Settings</p>
                        <div className="grid grid-cols-2 gap-4 items-end text-left">
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
                </div>

                {/* FOOTER */}
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#E0E0E0] flex-shrink-0 bg-white">
                    <div className="w-[100px]">
                        <CustomButton onClick={onClose} disabled={isSubmitting}>Cancel</CustomButton>
                    </div>
                    <div className="w-[120px]">
                        <CustomButton
                            className="bg-blue-500 text-white"
                            onClick={handleSave}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? "Saving..." : "Save Workflow"}
                        </CustomButton>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default EditInvoiceWorkflowModal;
