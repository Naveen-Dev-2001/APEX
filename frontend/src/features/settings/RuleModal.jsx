import React, { useEffect, useState, useMemo } from "react";
import { Modal, Radio, Checkbox } from "antd";
import Dropdown from "../../components/ui/Dropdown";
import CustomInput from "../../shared/components/CustomInput";
import CustomButton from "../../shared/components/CustomButton";
import workflowAPI from "../../api/workflowAPI";
import toast from "../../utils/toast";
import { useWorkflowFormData } from "../hooks/useWorkflowFormData";

const RuleModal = ({ open, onCancel, mode = "codification", editData = null, onSuccess }) => {
    const isEdit = !!editData;

    const initialFormState = {
        lob: null,
        dept: null,
        vendorName: null,
        approverCount: 1,
        thresholdEnabled: false,
        approvers: {},
        financeFlags: {},
        thresholdAmount: "",
        thresholdApprover: [],
        postingApprover: [],
    };

    const [form, setForm] = useState(initialFormState);
    const [loading, setLoading] = useState(false);

    // Remote Vendor Search State
    const [searchedVendors, setSearchedVendors] = useState([]);
    const [vendorSearchLoading, setVendorSearchLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    const {
        approvers: allApprovers,
        lobs,
        departments,
        vendors,
        approversLoading,
        lobsLoading,
        deptsLoading,
        vendorsLoading,
    } = useWorkflowFormData(mode);

    const formattedApprovers = useMemo(() => {
        return (allApprovers || []).map(a => ({
            ...a,
            label: `${a.value} - ${a.department || 'N/A'}`
        }));
    }, [allApprovers]);

    const financeApprovers = useMemo(() => {
        return (allApprovers || []).filter(a => a.department?.toLowerCase() === 'finance')});


    // ── Cascading Approver Filtering ──

    // Get ALL selected approver IDs across all fields (Mandatory, Threshold, Posting)
    const allSelectedIds = useMemo(() => {
        const selected = new Set();
        Object.values(form.approvers).forEach(ids => {
            if (Array.isArray(ids)) {
                ids.forEach(id => selected.add(id));
            }
        });
        if (Array.isArray(form.thresholdApprover)) {
            form.thresholdApprover.forEach(id => selected.add(id));
        }
        if (Array.isArray(form.postingApprover)) {
            form.postingApprover.forEach(id => selected.add(id));
        }
        return selected;
    }, [form.approvers, form.thresholdApprover, form.postingApprover]);

    // Filtered options for Threshold Approver
    const filteredThresholdOptions = useMemo(() => {
        const otherSelectedIds = new Set(allSelectedIds);
        (form.thresholdApprover || []).forEach(id => otherSelectedIds.delete(id));
        
        return (financeApprovers || []).filter(opt => !otherSelectedIds.has(opt.value));
    }, [financeApprovers, allSelectedIds, form.thresholdApprover]);

    // Filtered options for Posting Approver
    const filteredPostingOptions = useMemo(() => {
        const otherSelectedIds = new Set(allSelectedIds);
        (form.postingApprover || []).forEach(id => otherSelectedIds.delete(id));

        return (financeApprovers || []).filter(opt => !otherSelectedIds.has(opt.value));
    }, [financeApprovers, allSelectedIds, form.postingApprover]);

    // Function to get filtered options for a specific mandatory level
    const getFilteredMandatoryOptions = (currentIndex) => {
        const otherSelectedIds = new Set(allSelectedIds);
        (form.approvers[currentIndex] || []).forEach(id => otherSelectedIds.delete(id));

        return (formattedApprovers || []).filter(opt => !otherSelectedIds.has(opt.value));
    };

    // ── Populate form when editing ──
    useEffect(() => {
        if (isEdit && editData) {
            const approvers = {};
            const financeFlags = {};

            for (let i = 1; i <= 5; i++) {
                const key = `mandatory_approver_${i}`;
                if (editData[key] && editData[key].length > 0) {
                    approvers[i] = editData[key];
                }
                // Support both number and string keys from API
                financeFlags[i] =
                    editData.approver_flags?.[i] ??
                    editData.approver_flags?.[String(i)] ??
                    false;
            }

            // For vendor edit: reconstruct "vendor_id|vendor_name" format used by dropdown
            const vendorValue =
                editData.vendor_id && editData.vendor_name
                    ? `${editData.vendor_id}|${editData.vendor_name}`
                    : editData.vendor_id ?? null;

            setForm({
                lob: editData.lob ?? null,
                dept: editData.department_id ?? null,
                vendorName: vendorValue,
                approverCount: editData.approver_count ?? 1,
                thresholdEnabled: editData.is_threshold_enabled ?? false,
                approvers,
                financeFlags,
                thresholdAmount: editData.amount_threshold ? String(editData.amount_threshold) : "",
                thresholdApprover: Array.isArray(editData.threshold_approver)
                    ? editData.threshold_approver
                    : editData.threshold_approver ? [editData.threshold_approver] : [],
                postingApprover: Array.isArray(editData.posting_approver)
                    ? editData.posting_approver
                    : editData.posting_approver ? [editData.posting_approver] : [],
            });

            // Initialize searchedVendors with the current vendor if editing
            if (mode === 'vendor' && vendorValue) {
                setSearchedVendors([{
                    value: vendorValue,
                    label: editData.vendor_id && editData.vendor_name 
                           ? `${editData.vendor_id} - ${editData.vendor_name}` 
                           : editData.vendor_name
                }]);
            }
        }
    }, [editData, isEdit, mode]);

    // ── Reconcile vendor dropdown value once vendors list loads (edit mode) ──
    useEffect(() => {
        if (!isEdit || !editData?.vendor_id || vendorsLoading || !vendors.length) return;

        const match = vendors.find(
            (v) => typeof v.value === "string" && v.value.startsWith(`${editData.vendor_id}|`)
        );

        if (match) {
            setForm((prev) => ({ ...prev, vendorName: match.value }));
        }
    }, [vendors, vendorsLoading]);

    const resetForm = () => setForm(initialFormState);

    const handleApproverChange = (index, value) => {
        setForm((prev) => ({
            ...prev,
            approvers: { ...prev.approvers, [index]: value },
            financeFlags: { ...prev.financeFlags, [index]: false },
        }));
    };

    const handleFinanceToggle = (index, checked) => {
        setForm((prev) => ({
            ...prev,
            financeFlags: { ...prev.financeFlags, [index]: checked },
            approvers: { ...prev.approvers, [index]: [] },
        }));
    };

    const handleClose = () => {
        resetForm();
        setSearchedVendors([]);
        onCancel(false);
    };

    // ── Debounced Vendor Search Logic ──
    useEffect(() => {
        if (!open || mode !== 'vendor') return;

        // If search is empty, fetch top 10
        if (!searchTerm) {
            const fetchInitial = async () => {
                try {
                    setVendorSearchLoading(true);
                    const data = await workflowAPI.getWorkflowVendors("");
                    
                    // If editing, ensure current vendor is always in the list
                    const vendorValue = editData && editData.vendor_id && editData.vendor_name
                        ? `${editData.vendor_id}|${editData.vendor_name}`
                        : editData?.vendor_id ?? null;

                    if (isEdit && vendorValue) {
                        const exists = (data || []).find(v => v.value === vendorValue);
                        if (!exists) {
                            data.unshift({
                                value: vendorValue,
                                label: editData.vendor_id && editData.vendor_name 
                                       ? `${editData.vendor_id} - ${editData.vendor_name}` 
                                       : editData.vendor_name
                            });
                        }
                    }
                    setSearchedVendors(data || []);
                } catch (err) {
                    console.error("Initial vendor fetch failed", err);
                } finally {
                    setVendorSearchLoading(false);
                }
            };
            fetchInitial();
            return;
        }

        // Only search if term is 2+ chars
        if (searchTerm.length < 2) return;

        const timer = setTimeout(async () => {
            try {
                setVendorSearchLoading(true);
                const data = await workflowAPI.getWorkflowVendors(searchTerm);
                setSearchedVendors(data || []);
            } catch (err) {
                console.error("Vendor search failed", err);
            } finally {
                setVendorSearchLoading(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [searchTerm, mode, open, isEdit, editData]);

    const handleVendorSearch = (val) => {
        setSearchTerm(val);
    };

    const validateForm = () => {
        if (mode === "codification") {
            if (!form.lob) return "LOB is required";
            if (!form.dept) return "Department is required";
        } else {
            if (!form.vendorName) return "Vendor is required";
        }
        for (let i = 1; i <= form.approverCount; i++) {
            const approver = form.approvers[i];
            const isFinance = form.financeFlags[i];
            if (!isFinance && (!approver || approver.length === 0)) {
                return `Approver ${i} is required`;
            }
        }
        if (form.thresholdEnabled) {
            if (!form.thresholdAmount) return "Amount Threshold is required";
            if (!form.thresholdApprover || form.thresholdApprover.length === 0) return "Threshold Approver is required";
        }
        if (!form.postingApprover || form.postingApprover.length === 0) return "Posting Approver is required";
        return null;
    };

    const buildApprover = (index) => form.approvers[index] || [];

    // ── Always store financeFlags with number keys for consistency ──
    const buildFinanceFlags = () => {
        const flags = {};
        for (let i = 1; i <= 5; i++) {
            flags[i] = form.financeFlags[i] ?? false;
        }
        return flags;
    };

    const handleSave = async () => {
        const error = validateForm();
        if (error) {
            toast.error(error);
            return;
        }

        // Safe split — only runs in vendor mode when vendorName is set
        const [vendor_id, vendor_name] =
            mode === "vendor" && form.vendorName
                ? form.vendorName.split("|")
                : [null, null];

        const buildCleanApprover = (index) => {
            if (index > form.approverCount) return [];
            return form.approvers[index] || [];
        };

        const buildCleanFinanceFlags = () => {
            const flags = {};
            for (let i = 1; i <= 5; i++) {
                flags[i] = i <= form.approverCount ? (form.financeFlags[i] ?? false) : false;
            }
            return flags;
        };

        const commonFields = {
            approver_count: form.approverCount,
            mandatory_approver_1: buildCleanApprover(1),
            mandatory_approver_2: buildCleanApprover(2),
            mandatory_approver_3: buildCleanApprover(3),
            mandatory_approver_4: buildCleanApprover(4),
            mandatory_approver_5: buildCleanApprover(5),
            is_threshold_enabled: form.thresholdEnabled,
            amount_threshold: form.thresholdEnabled ? Number(form.thresholdAmount) : null,
            threshold_approver: form.thresholdEnabled
                ? (form.thresholdApprover || [])
                : null,
            posting_approver: form.postingApprover || [],
            approver_flags: buildCleanFinanceFlags(),
        };

        const payload =
            mode === "codification"
                ? {
                    lob: form.lob,
                    department_id: form.dept,
                    ...commonFields,
                }
                : {
                    vendor_id: vendor_id?.trim(),
                    vendor_name: vendor_name?.trim(),
                    ...commonFields,
                };

        try {
            setLoading(true);
            if (isEdit) {
                if (mode === "codification") {
                    await workflowAPI.updateCodificationWorkflow(editData.id, payload);
                } else {
                    await workflowAPI.updateVendorWorkflow(editData.id, payload);
                }
                toast.success("Workflow updated successfully");
            } else {
                if (mode === "codification") {
                    await workflowAPI.createCodificationWorkflow(payload);
                } else {
                    await workflowAPI.createVendorWorkflow(payload);
                }
                toast.success("Workflow created successfully");
            }
            resetForm();
            onSuccess?.();
            onCancel(false);
        } catch (error) {
            const detail = error?.response?.data?.detail;
            if (typeof detail === "object" && detail?.code) {
                switch (detail.code) {
                    case "DUPLICATE_WORKFLOW":
                        toast.error(detail.message);
                        break;
                    case "VALIDATION_ERROR":
                        toast.error(`Validation failed: ${detail.message}`);
                        break;
                    case "DB_ERROR":
                        toast.error("Database error. Please try again.");
                        break;
                    default:
                        toast.error(detail.message ?? "An error occurred.");
                }
            } else if (typeof detail === "string") {
                toast.error(detail);
            } else {
                toast.error("Something went wrong. Please try again.");
            }
        } finally {
            setLoading(false);
        }
    };

    const title =
        mode === "codification"
            ? isEdit ? "Edit Codification Workflow" : "Add Codification Workflow"
            : isEdit ? "Edit Vendor Workflow" : "Add Vendor Workflow";

    const filterOption = (input, option) => {
        const search = input.toLowerCase();
        return (
            option?.label?.toLowerCase().includes(search) ||
            option?.value?.toLowerCase().includes(search)
        );
    };

    return (
        <Modal
            open={open}
            onCancel={handleClose}
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
                        {title}
                    </h2>
                    <button
                        onClick={handleClose}
                        className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                    >
                        ×
                    </button>
                </div>

                {/* BODY */}
                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
                    {/* Row 1 — LOB + Dept OR Vendor */}
                    <div className="grid grid-cols-2 gap-4">
                        {mode === "codification" ? (
                            <>
                                <Dropdown
                                    label="LOB"
                                    required
                                    value={form.lob}
                                    onChange={(val) => setForm({ ...form, lob: val })}
                                    options={lobs}
                                    filterOption={filterOption}
                                    loading={lobsLoading}
                                    disabled={lobsLoading}
                                    placeholder={lobsLoading ? "Loading..." : "Select LOB"}
                                />
                                <Dropdown
                                    label="Dept ID"
                                    required
                                    value={form.dept}
                                    onChange={(val) => setForm({ ...form, dept: val })}
                                    options={departments}
                                    filterOption={filterOption}
                                    loading={deptsLoading}
                                    disabled={deptsLoading}
                                    placeholder={deptsLoading ? "Loading..." : "Select Department"}
                                />
                            </>
                        ) : (
                            <div className="col-span-2">
                                <Dropdown
                                    label="Vendor"
                                    required
                                    value={form.vendorName}
                                    onChange={(val) => setForm({ ...form, vendorName: val })}
                                    options={searchedVendors}
                                    onSearch={handleVendorSearch}
                                    loading={vendorSearchLoading}
                                    disabled={loading}
                                    placeholder={vendorSearchLoading ? "Searching..." : "Type to search vendor (Min 2 chars)..."}
                                />
                            </div>
                        )}
                    </div>

                    {/* Row 2 — Approver count + Threshold toggle */}
                    <div className="grid grid-cols-2 gap-4 items-end">
                        <Dropdown
                            label="Number of Approvers"
                            required
                            value={form.approverCount}
                            onChange={(val) => setForm({ ...form, approverCount: val })}
                            options={[1, 2, 3, 4, 5].map((n) => ({
                                label: `${n} Approver${n > 1 ? "s" : ""}`,
                                value: n,
                            }))}
                        />
                        <div className="flex flex-col gap-1">
                            <label className="text-sm font-medium text-gray-700">
                                Enable Threshold Approver
                            </label>
                            <div className="flex items-center gap-6 rounded-md bg-white px-3" style={{ height: 36 }}>
                                <Radio.Group
                                    value={form.thresholdEnabled}
                                    onChange={(e) => setForm({ ...form, thresholdEnabled: e.target.value })}
                                    className="flex gap-4"
                                >
                                    <Radio value={true}>Yes</Radio>
                                    <Radio value={false}>No</Radio>
                                </Radio.Group>
                            </div>
                        </div>
                    </div>

                    {/* Dynamic Approvers */}
                    <div>
                        <p className="text-sm font-semibold text-gray-700 mb-3">
                            Approver Configuration
                        </p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
                            {[...Array(form.approverCount)].map((_, i) => {
                                const index = i + 1;
                                return (
                                    <div
                                        key={index}
                                        className="flex flex-col gap-2 p-3 rounded-lg bg-gray-50 border border-gray-100"
                                    >
                                        <label className="text-sm font-medium text-gray-700">
                                            <span className="text-red-500 mr-1">*</span>
                                            Approver {index}
                                            <span className="ml-1 text-xs text-gray-400 font-normal">(Mandatory)</span>
                                        </label>
                                        <Checkbox
                                            checked={!!form.financeFlags[index]}
                                            onChange={(e) => handleFinanceToggle(index, e.target.checked)}
                                        >
                                            <span className="text-sm text-gray-600">Assign to Finance Team</span>
                                        </Checkbox>
                                        <Dropdown
                                            mode="multiple"
                                            placeholder={approversLoading ? "Loading..." : "Select Approver(s)"}
                                            value={form.approvers[index]}
                                            onChange={(val) => handleApproverChange(index, val)}
                                            options={getFilteredMandatoryOptions(index)}
                                            loading={approversLoading}
                                            disabled={!!form.financeFlags[index] || approversLoading}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Threshold Settings */}
                    {form.thresholdEnabled && (
                        <div>
                            <p className="text-sm font-semibold text-gray-700 mb-3">Threshold Settings</p>
                            <div className="grid grid-cols-2 gap-4 items-end">
                                <CustomInput
                                    label="Amount Threshold"
                                    required
                                    placeholder="$ 0.00"
                                    value={form.thresholdAmount}
                                    onChange={(e) => setForm({ ...form, thresholdAmount: e.target.value })}
                                    className="mb-0"
                                    height="40px"
                                />
                                <Dropdown
                                    label="Threshold Approver"
                                    required
                                    mode="multiple"
                                    value={form.thresholdApprover}
                                    onChange={(val) => setForm({ ...form, thresholdApprover: val })}
                                    options={filteredThresholdOptions}
                                    loading={approversLoading}
                                    disabled={approversLoading}
                                    placeholder={approversLoading ? "Loading..." : "Select Approver(s)"}
                                />
                            </div>
                        </div>
                    )}

                    {/* Posting Approver */}
                    <div className="grid grid-cols-2 gap-4">
                        <Dropdown
                            label="Posting Approver"
                            required
                            mode="multiple"
                            value={form.postingApprover}
                            onChange={(val) => setForm({ ...form, postingApprover: val })}
                            options={financeApprovers}
                            loading={approversLoading}
                            disabled={approversLoading}
                            placeholder={approversLoading ? "Loading..." : "Select Approver(s)"}
                        />
                    </div>
                </div>

                {/* FOOTER */}
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#E0E0E0] flex-shrink-0 bg-white">
                    <div className="w-[100px]">
                        <CustomButton onClick={handleClose}>Cancel</CustomButton>
                    </div>
                    <div className="w-[100px]">
                        <CustomButton
                            className="bg-blue-500 text-white"
                            onClick={handleSave}
                            disabled={loading}
                        >
                            {loading ? "Saving..." : isEdit ? "Update" : "OK"}
                        </CustomButton>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default RuleModal;