import CustomButton from "../../shared/components/CustomButton";
import { icons } from "../../file";
import { useInvoiceStore } from "../../store/invoice.store";
import { useDuplicateCheck } from "../hooks/useDuplicateCheck";
import { useSaveInvoice } from "../hooks/useSaveInvoice";
import { useInvoicePreviewData } from "../hooks/useInvoicePreviewData";
import toast from "../../utils/toast";
import { saveInvoice } from "../../api/invoiceApi";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import workflowActionsAPI from "../../api/workflowActionsAPI";
import { useEffect, useState, useRef, useMemo } from "react";
import { Modal } from "antd";
import { useQueryClient } from "@tanstack/react-query";



const MODAL_ACTIONS = {
    approve: { label: "Approve", okText: "Approve", danger: false },
    reject: { label: "Reject Invoice", okText: "Reject", danger: true },
    rework: { label: "Send for Rework", okText: "Send for Rework", danger: false },
    "repost-sage": { label: "Repost to Sage", okText: "Repost", danger: false },
    recall: { label: "Recall Invoice", okText: "Recall", danger: true },
};

const InvoiceTopBar = ({ invoice = {}, isPdfVisible, onTogglePdf }) => {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { user, activeRole } = useAuthStore();
    const userRole = (activeRole || user?.role || "").toLowerCase();

    const {
        setInvoiceSection,
        isDuplicate,
        viewInvoiceId,
        resetQuickView,
        setInvoiceActiveTab,
        activeInvoiceData,
        setActiveInvoiceData,
        setInvoiceData,
        lineItems,
        selectedVendorId,
        navigationOrigin,
        setNavigationOrigin
    } = useInvoiceStore();

    const { handleSave } = useSaveInvoice();
    useDuplicateCheck();

    const firstLine = lineItems?.[0] || {};

    // Memoize workflowParams so the React Query key stays stable between renders
    // (inline object literals always get a new reference → triggers unnecessary re-fetches)
    const workflowParams = useMemo(() => ({
        preview_vendor_id: selectedVendorId,
        preview_lob: firstLine.lob,
        preview_department_id: firstLine.department,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [selectedVendorId, firstLine.lob, firstLine.department]);

    // ── Parallel fetch: vendor + workflow + coding suggestions fire together ──
    // This warms the React Query cache so downstream hooks (useWorkflowDataSync,
    // useVendorDetailSync in QuickViewTab) return data instantly.
    const { workflowData } = useInvoicePreviewData({
        invoiceId: viewInvoiceId,
        vendorId: selectedVendorId,
        workflowParams,
    });


    const currentStatus = activeInvoiceData?.status || invoice?.status;
    const isWaitingCoding = currentStatus === "waiting_coding";
    const hasAssignedApprovers = workflowData?.assigned_approvers?.length > 0;
    const isWorkflowMissing = isWaitingCoding && !hasAssignedApprovers;

    // ── Editing toggle — purely local, no API call needed ─────────────────
    // Clicking "Enable Editing" just flips this and updates activeInvoiceData
    // so QuickViewTab's isViewOnly useMemo immediately returns false.
    const [editingEnabled, setEditingEnabled] = useState(false);

    const handleEnableEditing = async () => {
        try {
            await workflowActionsAPI.enableEditing(viewInvoiceId);
            setEditingEnabled(true);
            setActiveInvoiceData({
                ...activeInvoiceData,
                is_editing_enabled: true,
                editing_enabled_by: user?.email,
            });
            toast.success("Editing enabled. Make your changes and save.");
        } catch (err) {
            console.error("Enable editing error:", err);
            toast.error("Failed to enable editing on server. Please try again.");
        }
    };

    // ── Approver UI state ──────────────────────────────────────────────────
    const [uiStatus, setUiStatus] = useState(null);
    const [actionLoading, setActionLoading] = useState(null);
    const [modal, setModal] = useState(null);
    const [comment, setComment] = useState("");
    // Track workflow revision with a lightweight counter rather than JSON.stringify
    // which is O(n) on every render and causes micro-lag on large payloads.
    const prevWorkflowIdRef = useRef(null);

    useEffect(() => {
        if (!workflowData) return;
        // Use current_approver_level + current_status as a cheap change signal
        const key = `${workflowData.current_approver_level}_${workflowData.current_status}`;
        if (key === prevWorkflowIdRef.current) return;
        prevWorkflowIdRef.current = key;
        fetchUIStatus();
    }, [workflowData]);

    const fetchUIStatus = async () => {
        if (!viewInvoiceId || !workflowData) return;
        try {
            const payload = {
                invoice_id: viewInvoiceId,
                assigned_approvers: workflowData.assigned_approvers,
                current_approver_level: workflowData.current_approver_level,
                current_status: workflowData.current_status,
                workflow_type: workflowData.workflow_type,
            };
            const result = await workflowActionsAPI.getApproverUIStatus(payload);
            setUiStatus(result);
        } catch (err) {
            console.error("fetchUIStatus error:", err);
            setUiStatus(null);
        }
    };

    // ── Scanner / Coder actions ────────────────────────────────────────────
    const handleSendToCoding = async () => {
        await handleSave();
        const payload = await saveInvoice(viewInvoiceId, { status: "waiting_coding" });
        if (payload?.status === "waiting_coding") {
            toast.success("Invoice sent for coding successfully!");
            queryClient.invalidateQueries(["invoices"]);
            resetQuickView();
            setInvoiceSection(1);
            navigate("/invoices");
        } else {
            toast.error(payload?.message || "Something went wrong while sending for coding.");
        }
    };

     const handleDiscard = () => {
        setInvoiceData(activeInvoiceData);
        toast.success("Changes discarded!");
    };

    const handleSendToApproval = async () => {
        // 1. Mandatory field validation (all rows)
        const hasMissingCoding = lineItems
            .some(item => !item.glCode || !item.lob || !item.department);

        if (hasMissingCoding) {
            toast.error("GL, LOB, and Department are mandatory for all line items.");
            return;
        }

        // 2. Workflow validation
        if (isWorkflowMissing) {
            toast.error("No workflow defined for this invoice. Please configure a vendor or codification workflow.");
            return;
        }
        await handleSave();
        const payload = await saveInvoice(viewInvoiceId, { status: "waiting_approval" });
        if (payload?.status === "waiting_approval") {
            toast.success("Invoice sent for approval successfully!");
            queryClient.invalidateQueries(["invoices"]);
            resetQuickView();
            setInvoiceSection(1);
            navigate("/coding");
        } else {
            toast.error(payload?.message || "Something went wrong while sending for approval.");
        }
    };



    const handleSaveInvoice = async () => {
        const extraFields = {};
        if (currentStatus === "reworked") {
            extraFields.status = "waiting_approval";
        }
        
        const response = await handleSave(extraFields);
        if (response) {
            toast.success("Invoice Saved Successfully!");
            if (currentStatus === "reworked") {
                await fetchUIStatus();
            }
        }
    };

    const Back = () => {
        resetQuickView();
        
        if (navigationOrigin) {
            const origin = navigationOrigin;
            setNavigationOrigin(null); // Clear origin
            navigate(origin);
        } else {
            setInvoiceSection(1);
            setInvoiceActiveTab("Quick View");
        }
    };

    // ── Approver workflow actions ──────────────────────────────────────────
    const executeAction = async (action, commentText = "") => {
        if (editingEnabled) {
            try {
                const saveResponse = await handleSave();
                if (!saveResponse) {
                    toast.error("Failed to save changes before action.");
                    return;
                }
            } catch (err) {
                console.error("Auto-save failed:", err);
                toast.error("Failed to save changes. Please try again.");
                return;
            }
        }

        setActionLoading(action);
        try {
            let result;
            switch (action) {
                case "approve":
                    result = await workflowActionsAPI.approve(viewInvoiceId, { comment: commentText });
                    break;
                case "reject":
                    result = await workflowActionsAPI.reject(viewInvoiceId, { comment: commentText });
                    break;
                case "rework":
                    result = await workflowActionsAPI.rework(viewInvoiceId, { comment: commentText });
                    break;
                case "repost-sage":
                    result = await workflowActionsAPI.repostSage(viewInvoiceId, { comment: commentText });
                    break;
                case "recall":
                    result = await workflowActionsAPI.recall(viewInvoiceId, { comment: commentText });
                    break;
                default:
                    return;
            }

            if (result?.success) {
                toast.success(result.message || "Action completed successfully.");
                
                // Invalidate cache to ensure fresh data on next view
                queryClient.invalidateQueries(["workflow", viewInvoiceId]);
                queryClient.invalidateQueries(["auditFlow", viewInvoiceId]);
                queryClient.invalidateQueries(["invoices"]);
                
                // If it was a recall, navigate back to the coding queue
                if (action === "recall") {
                    resetQuickView();
                    setInvoiceSection(1);
                    navigate("/coding");
                    return;
                }

                // For any other successful approver action, go to approvals page
                resetQuickView();
                setInvoiceSection(1);
                navigate("/approvals");
            } else {
                toast.error(result?.message || "Action failed. Please try again.");
                await fetchUIStatus();
            }

        } catch (err) {
            const errorData = err?.response?.data;
            let detail = errorData?.detail;
            if (typeof detail === "string") detail = { message: detail };

            if (detail?.code === "NO_FINANCE_APPROVER") {
                toast.error(detail.message || "Cannot send for rework");
            } else {
                toast.error(detail?.message || "Something went wrong");
            }
        } finally {
            setActionLoading(null);
            setModal(null);
            setComment("");
        }
    };

    const openModal = (action) => {
        setComment("");
        setModal({ action });
    };

    const handleModalOk = () => {
        if (!modal) return;
        if (modal.action === "reject" && !comment.trim()) {
            toast.error("A comment is required when rejecting an invoice.");
            return;
        }
        executeAction(modal.action, comment.trim());
    };

    const handleModalCancel = () => {
        if (actionLoading) return;
        setModal(null);
        setComment("");
    };

    const busy = (key) => actionLoading === key;

    const isApproverView =
        userRole.includes("approver") &&
        ["waiting_approval", "reworked", "sage_post_failed"].includes((currentStatus || "").toLowerCase());

    const btnBase =
        "w-[130px] h-[34px] flex items-center justify-center rounded-lg border bg-white transition text-[13px] font-medium custom-font-creato disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";

    const getBtnClass = (type, enabled) => {
        if (!enabled) return `${btnBase} border-gray-300 text-gray-400`;
        const styles = {
            green: "border-green-500 text-green-600 hover:bg-green-50",
            red: "border-red-500 text-red-600 hover:bg-red-50",
            yellow: "border-yellow-500 text-yellow-600 hover:bg-yellow-50",
            blue: "border-blue-500 text-blue-600 hover:bg-blue-50",
            orange: "border-orange-500 text-orange-600 hover:bg-orange-50",
        };
        return `${btnBase} ${styles[type]}`;
    };

    return (
        <>
            <div className="h-12 min-h-[50px] bg-white border-b border-[#E0E0E0] px-4 flex items-center justify-between">

                {/* Left — Back */}
                <div
                    onClick={Back}
                    className="flex items-center gap-1 p-1.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                >
                    <img src={icons.arrowLeft} alt="Back" />
                    <span className="text-lg font-bold text-gray-500 custom-font-jura">Back</span>
                </div>

                {/* Right — Action buttons */}
                <div className="flex items-center gap-3">
                    {!activeInvoiceData?.is_archived && (
                        <>
                            {/* ── Scanner / Coder buttons ───────────────────────── */}
                            {((userRole.includes("scanner") && (currentStatus || "").toLowerCase() === "processed") ||
                                (userRole.includes("coder") && (currentStatus || "").toLowerCase() === "waiting_coding")) && (
                                    <>
                                        <div className="w-[130px]">
                                            <CustomButton variant="outline" height="h-[34px]" onClick={handleDiscard}>Discard</CustomButton>
                                        </div>
                                        <div className="w-[130px]">
                                            <CustomButton variant="primary" height="h-[34px]" onClick={handleSaveInvoice}>
                                                Save
                                            </CustomButton>
                                        </div>
                                        <div className="w-[130px]">
                                            <CustomButton
                                                variant="success"
                                                height="h-[34px]"
                                                disabled={isDuplicate}
                                                onClick={
                                                    currentStatus === "waiting_coding"
                                                        ? handleSendToApproval
                                                        : handleSendToCoding
                                                }
                                            >
                                                {currentStatus === "waiting_coding"
                                                    ? "Send to Approval"
                                                    : "Send to Coding"}
                                            </CustomButton>
                                        </div>
                                    </>
                                )}

                            {/* ── Approver buttons ──────────────────────────────── */}
                            {isApproverView && (
                                <>
                                    {/* Repost to Sage */}
                                    {currentStatus === "sage_post_failed" && uiStatus?.can_repost_sage && (
                                        <button
                                            onClick={() => openModal("repost-sage")}
                                            disabled={busy("repost-sage")}
                                            className={getBtnClass("orange", true)}
                                        >
                                            {busy("repost-sage") ? "Reposting…" : "Repost"}
                                        </button>
                                    )}

                                    {["waiting_approval", "reworked"].includes(currentStatus) && (
                                        <>
                                            {/* Enable Editing — no API, flips local state only */}
                                            {uiStatus?.can_enable_editing && !editingEnabled && (
                                                <button
                                                    onClick={handleEnableEditing}
                                                    className={getBtnClass("blue", true)}
                                                >
                                                    Enable Editing
                                                </button>
                                            )}

                                            {/* Save — appears once editing is unlocked */}
                                            {editingEnabled &&(currentStatus === "waiting_approval" || currentStatus === "reworked") && (
                                                <div className="w-[130px]">
                                                    <CustomButton variant="primary" height="h-[34px]" onClick={handleSaveInvoice}>
                                                        Save
                                                    </CustomButton>
                                                </div>
                                            )}

                                            {/* Rework */}
                                            <button
                                                onClick={() => openModal("rework")}
                                                disabled={!uiStatus?.can_rework || !!actionLoading}
                                                className={getBtnClass("yellow", uiStatus?.can_rework && !actionLoading)}
                                            >
                                                {busy("rework") ? "Sending…" : "Rework"}
                                            </button>

                                            {/* Reject */}
                                            <button
                                                onClick={() => openModal("reject")}
                                                disabled={!uiStatus?.can_reject || !!actionLoading}
                                                className={getBtnClass("red", uiStatus?.can_reject && !actionLoading)}
                                            >
                                                {busy("reject") ? "Rejecting…" : "Reject"}
                                            </button>

                                            {/* Approve */}
                                            <button
                                                onClick={() => openModal("approve")}
                                                disabled={!uiStatus?.can_approve || !!actionLoading}
                                                className={getBtnClass("green", uiStatus?.can_approve && !actionLoading)}
                                            >
                                                {busy("approve") ? "Approving…" : "Approve"}
                                            </button>

                                            {/* Info label */}
                                            {uiStatus &&
                                                !uiStatus.can_approve &&
                                                !uiStatus.can_reject &&
                                                !uiStatus.can_rework &&
                                                !uiStatus.can_enable_editing && (
                                                    <span className="text-xs text-gray-400 italic select-none">
                                                        {uiStatus.level_already_approved
                                                            ? "Your level approved"
                                                            : uiStatus.already_acted
                                                                ? "Already acted"
                                                                : "Awaiting approver"}
                                                    </span>
                                                )}
                                        </>
                                    )}
                                </>
                            )}

                             {/* Recall (Coder only, if level 1) */}
                            {userRole.includes("coder") &&
                                (currentStatus || "").toLowerCase().includes("waiting_approval") &&
                                (workflowData?.current_approver_level === 1 || !workflowData) && (
                                    <button
                                        onClick={() => openModal("recall")}
                                        disabled={!!actionLoading}
                                        className={getBtnClass("red", !actionLoading)}
                                    >
                                        {busy("recall") ? "Recalling…" : "Recall"}
                                    </button>
                                )}
                        </>
                    )}
                    <div className="w-[130px]">
                        <CustomButton 
                            variant="outline" 
                            height="h-[34px]"
                            onClick={onTogglePdf}
                        >
                            {isPdfVisible ? "Hide PDF" : "Show PDF"}
                        </CustomButton>
                    </div>
                </div>
            </div>

            {/* ── Comment / Confirm Modal ──────────────────────────────────────── */}
            <Modal
                open={!!modal}
                title={modal ? MODAL_ACTIONS[modal.action]?.label : ""}
                onOk={handleModalOk}
                onCancel={handleModalCancel}
                okText={modal ? MODAL_ACTIONS[modal.action]?.okText : "OK"}
                cancelText="Cancel"
                confirmLoading={!!actionLoading}
                okButtonProps={{ danger: !!modal && MODAL_ACTIONS[modal.action]?.danger }}
                centered
                maskClosable={!actionLoading}
                destroyOnHidden
                styles={{
                    content: { padding: 20 },
                    header: { padding: "15px 20px" },
                    footer: { padding: "10px 20px" },
                }}
            >
                {modal && (
                    <div className="px-4 flex flex-col gap-3">
                        {modal.action === "reject" && (
                            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                                This invoice will be marked as <strong>Rejected</strong>.
                                No further approval actions will be possible.
                            </div>
                        )}
                        {modal.action === "rework" && (
                            <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-700">
                                The invoice will be sent back to the previous Finance Team
                                approver for corrections.
                            </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                Comment{" "}
                                {modal.action === "reject"
                                    ? <span className="text-red-400 font-normal">(required)</span>
                                    : <span className="text-gray-400 font-normal">(optional)</span>}
                            </label>
                            <textarea
                                className="w-full border border-gray-300 rounded-lg p-2.5 text-sm resize-none
                                           focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400
                                           placeholder-gray-300 transition"
                                rows={3}
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                placeholder="Add a comment..."
                                autoFocus
                            />
                        </div>
                    </div>
                )}
            </Modal>
        </>
    );
};

export default InvoiceTopBar;