import React, { useEffect, useState } from "react";
import { Modal, Radio, Checkbox } from "antd";
import Dropdown from "../../components/ui/Dropdown";
import CustomInput from "../../shared/components/CustomInput";
import CustomButton from "../../shared/components/CustomButton";
import workflowAPI from "../../api/workflowAPI";
import toast from "../../utils/toast";

const RuleModal = ({ open, onCancel }) => {
    const initialFormState = {
        lob: null,
        dept: null,
        approverCount: 1,
        thresholdEnabled: false,
        approvers: {},
        financeFlags: {},
        thresholdAmount: "",
        thresholdApprover: null,
        postingApprover: null,
    };
    const [form, setForm] = useState(initialFormState);
    const [allApprovers, setAllApprovers] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [lobs, setLobs] = useState([]);

    useEffect(() => {
        getApprover()
        getDepartment()
        getLobs()
    }, [])

    const resetForm = () => {
        setForm(initialFormState);
    };

    const getApprover = async () => {
        try {
            const response = await workflowAPI.getApprovers()
            setAllApprovers(response);
        } catch (error) {
            console.error(`getApprover: ${error}`);

        }
    }

    const getDepartment = async () => {
        try {
            const response = await workflowAPI.getDepartments()
            setDepartments(response)
        } catch (error) {
            console.error(`getDepartment: ${error}`);
        }
    }

    const getLobs = async () => {
        try {
            const response = await workflowAPI.getLobs()
            setLobs(response);
        } catch (error) {
            console.error(`getLobs: ${error}`);
        }
    }

    const getDropdownOptions = (index) => {
        return allApprovers;
    };

    const handleApproverChange = (index, value) => {
        setForm((prev) => ({
            ...prev,
            approvers: { ...prev.approvers, [index]: value },
            financeFlags: {
                ...prev.financeFlags,
                [index]: false   // always disable finance if user interacts
            }
        }));
    };

    const handleFinanceToggle = (index, checked) => {
        const financeUsers = allApprovers
            .filter(a => a.department?.toLowerCase() === "finance")
            .map(a => a.value);

        setForm((prev) => ({
            ...prev,
            financeFlags: { ...prev.financeFlags, [index]: checked },
            approvers: {
                ...prev.approvers,
                [index]: checked ? financeUsers : []
            },
        }));
    };

    const handleClose = () => {
        onCancel(false)
    }

    const validateForm = () => {
        // LOB
        if (!form.lob) return "LOB is required";

        // Dept
        if (!form.dept) return "Department is required";

        // Approvers
        for (let i = 1; i <= form.approverCount; i++) {
            const approver = form.approvers[i];
            const isFinance = form.financeFlags[i];

            if (!isFinance && (!approver || approver.length === 0)) {
                return `Approver ${i} is required`;
            }
        }

        // Threshold validation
        if (form.thresholdEnabled) {
            if (!form.thresholdAmount) {
                return "Amount Threshold is required";
            }

            if (!form.thresholdApprover) {
                return "Threshold Approver is required";
            }
        }

        // Posting Approver
        if (!form.postingApprover) {
            return "Posting Approver is required";
        }

        return null; //  valid
    };

    const handleSave = async () => {
        debugger
        const error = validateForm();

        if (error) {
            toast.error(error)
            return;
        }

        console.log(form);

        const buildApprover = (index) => {
            return form.approvers[index] || [];
        };

        try {
            const payload = {
                lob: form.lob,
                department_id: form.dept,
                approver_count: form.approverCount,

                mandatory_approver_1: buildApprover(1),
                mandatory_approver_2: buildApprover(2),
                mandatory_approver_3: buildApprover(3),
                mandatory_approver_4: buildApprover(4),
                mandatory_approver_5: buildApprover(5),

                is_threshold_enabled: form.thresholdEnabled,
                amount_threshold: form.thresholdEnabled
                    ? Number(form.thresholdAmount)
                    : null,
                threshold_approver: form.thresholdEnabled
                    ? (form.thresholdApprover ? [form.thresholdApprover] : [])
                    : null,

                posting_approver: form.postingApprover
            };
            console.log("FINAL PAYLOAD", payload);

            const response = await workflowAPI.createCodificationWorkflow(payload)
            console.log("RESPONSE", response);
            toast.success("Workflow created successfully");
            resetForm()

        } catch (error) {
            console.log("FULL ERROR", error);
            const backendError = error?.response?.data;
            //  THIS is the key
            const message = backendError?.detail?.message;
            if (message) {
                toast.error(message);
            } else {
                toast.error("Something went wrong");
            }
        }
    }

    return (
        <Modal
            open={open}
            onCancel={handleClose}
            footer={null}
            width={760}
            centered
            closeIcon={null}
            styles={{ content: { padding: 0, borderRadius: 12, overflow: "hidden" } }}
        >
            {/* ── Fixed height container so only body scrolls ── */}
            <div className="bg-white flex flex-col" style={{ maxHeight: "85vh" }}>

                {/* ── HEADER (sticky) ── */}
                <div className="flex justify-between  items-center px-6 py-4 border-b border-[#E0E0E0]  flex-shrink-0">
                    <h2 className="font-semibold custom-font-jura text-[16px] text-gray-800">
                        Add Codification Workflow
                    </h2>
                    <button
                        onClick={handleClose}
                        className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                    >
                        ×
                    </button>
                </div>

                {/* ── BODY (scrollable) ── */}
                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">

                    {/* Row 1 — LOB + Dept side by side */}
                    <div className="grid grid-cols-2 gap-4">
                        <Dropdown
                            label="LOB"
                            required
                            value={form.lob}
                            onChange={(val) => setForm({ ...form, lob: val })}
                            options={lobs}
                            filterOption={(input, option) => {
                                const search = input.toLowerCase();

                                const label = option?.label?.toLowerCase() || "";
                                const value = option?.value?.toLowerCase() || "";

                                return label.includes(search) || value.includes(search);
                            }}
                        />
                        <Dropdown
                            label="Dept ID"
                            required
                            value={form.dept}
                            onChange={(val) => setForm({ ...form, dept: val })}
                            options={departments}
                            filterOption={(input, option) => {
                                const search = input.toLowerCase();

                                const label = option?.label?.toLowerCase() || "";
                                const value = option?.value?.toLowerCase() || "";

                                return label.includes(search) || value.includes(search);
                            }}
                        />
                    </div>

                    {/* Row 2 — Number of Approvers + Threshold toggle — FIXED ALIGNMENT */}
                    <div className="grid grid-cols-2 gap-4 items-end"> {/* ← items-end aligns both to bottom */}
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

                        {/* Mimic the same label+field height structure as the Dropdown */}
                        <div className="flex flex-col gap-1">
                            <label className="text-sm font-medium text-gray-700">
                                Enable Threshold Approver
                            </label>
                            {/* Wrap radio in a field-height box to match dropdown height */}
                            <div
                                className="flex items-center gap-6   rounded-md bg-white px-3"
                                style={{ height: 36 }}
                            >
                                <Radio.Group
                                    value={form.thresholdEnabled}
                                    onChange={(e) =>
                                        setForm({ ...form, thresholdEnabled: e.target.value })
                                    }
                                    className="flex gap-4"
                                >
                                    <Radio value={true}>Yes</Radio>
                                    <Radio value={false}>No</Radio>
                                </Radio.Group>
                            </div>
                        </div>
                    </div>

                    {/* ── Dynamic Approvers — 2-column grid ── */}
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
                                            <span className="ml-1 text-xs text-gray-400 font-normal">
                                                (Mandatory)
                                            </span>
                                        </label>

                                        <Checkbox
                                            checked={form.financeFlags[index]}
                                            onChange={(e) =>
                                                handleFinanceToggle(index, e.target.checked)
                                            }
                                        >
                                            <span className="text-sm text-gray-600">
                                                Assign to Finance Team
                                            </span>
                                        </Checkbox>

                                        <Dropdown
                                            mode="multiple"
                                            placeholder={`Select Approver(s)`}
                                            value={form.approvers[index]}
                                            onChange={(val) => handleApproverChange(index, val)}
                                            options={getDropdownOptions(index)}
                                            disabled={form.financeFlags[index]}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {form.thresholdEnabled && (
                        <div>
                            <p className="text-sm font-semibold text-gray-700 mb-3">
                                Threshold Settings
                            </p>
                            {/* items-end ensures both fields' bottoms align even if labels wrap */}
                            <div className="grid grid-cols-2 gap-4 items-end">
                                <CustomInput
                                    label="Amount Threshold"
                                    required
                                    placeholder="$ 0.00"
                                    value={form.thresholdAmount}
                                    onChange={(e) =>
                                        setForm({ ...form, thresholdAmount: e.target.value })
                                    }
                                    className="mb-0"
                                    height={"40px"}
                                />
                                <Dropdown
                                    label="Threshold Approver"
                                    required
                                    value={form.thresholdApprover}
                                    onChange={(val) =>
                                        setForm({ ...form, thresholdApprover: val })
                                    }
                                    options={allApprovers}
                                />
                            </div>
                        </div>
                    )}

                    {/* ── Final Approver ── */}
                    <div className="grid grid-cols-2 gap-4">
                        <Dropdown
                            label="Posting Approver"
                            required
                            value={form.postingApprover}
                            onChange={(val) => setForm({ ...form, postingApprover: val })}
                            options={allApprovers}
                        />
                    </div>
                </div>

                {/* ── FOOTER (sticky) ── */}
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#E0E0E0]  flex-shrink-0 bg-white">
                    <div className="w-[100px]">
                        <CustomButton onClick={handleClose}>Cancel</CustomButton>
                    </div>
                    <div className="w-[100px]">
                        <CustomButton className="bg-blue-500 text-white" onClick={handleSave}>OK</CustomButton>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default RuleModal;