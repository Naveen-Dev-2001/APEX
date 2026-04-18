import CustomButton from "../../shared/components/CustomButton";
import { icons } from "../../file";
import { useInvoiceStore } from "../../store/invoice.store";
import { useDuplicateCheck } from "../hooks/useDuplicateCheck";
import { useSaveInvoice } from "../hooks/useSaveInvoice";
import { useWorkflowDataSync } from "../hooks/useWorkflow";
import toast from "../../utils/toast";
import { saveInvoice } from "../../api/invoiceApi";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import workflowActionsAPI from "../../api/workflowActionsAPI";
import { useEffect, useState, useRef } from "react";
import { Modal } from "antd";

// Actions that open the comment modal before executing
const MODAL_ACTIONS = {
    approve: { label: "Approve", okText: "Approve", danger: false },
    reject: { label: "Reject Invoice", okText: "Reject", danger: true },
    rework: { label: "Send for Rework", okText: "Send for Rework", danger: false },
    "enable-editing": { label: "Enable Editing", okText: "Enable Editing", danger: false },
    "repost-sage": { label: "Repost to Sage", okText: "Repost", danger: false },
};

const InvoiceTopBar = ({ invoice = {} }) => {
    const navigate = useNavigate();
    const user = useAuthStore((state) => state.user);
    const userRole = user?.role?.toLowerCase();

    const {
        setInvoiceSection,
        isDuplicate,
        viewInvoiceId,
        resetQuickView,
        setInvoiceActiveTab,
        activeInvoiceData,
        lineItems,
        selectedVendorId,
    } = useInvoiceStore();

    const { handleSave } = useSaveInvoice();
    useDuplicateCheck();

    const firstLine = lineItems?.[0] || {};
    const { workflowData } = useWorkflowDataSync(viewInvoiceId, {
        preview_vendor_id: selectedVendorId,
        preview_lob: firstLine.lob,
        preview_department_id: firstLine.department,
    });

    const currentStatus = activeInvoiceData?.status || invoice?.status;
    const isWaitingCoding = currentStatus === "waiting_coding";
    const isWorkflowMissing = isWaitingCoding && !selectedVendorId && workflowData?.workflow_type !== "codification";

    // ── Approver UI state ──────────────────────────────────────────────────
    const [uiStatus, setUiStatus] = useState(null);
    const [actionLoading, setActionLoading] = useState(null); // action key currently running
    const [modal, setModal] = useState(null); // { action } | null
    const [comment, setComment] = useState("");
    const prevWorkflowRef = useRef(null);



    useEffect(() => {
        if (!workflowData) return;

        // Only re-fetch if workflowData actually changed in value
        const key = JSON.stringify(workflowData);
        if (key === prevWorkflowRef.current) return;
        prevWorkflowRef.current = key;

        fetchUIStatus();
    }, [workflowData]);

    // ── Fetch approver button states from backend ──────────────────────────
    const fetchUIStatus = async () => {
        debugger
        if (!viewInvoiceId || !workflowData) return;
        try {
            const payload = {
                invoice_id: viewInvoiceId,
                assigned_approvers: workflowData.assigned_approvers,
                current_approver_level: workflowData.current_approver_level,
                current_status: workflowData.current_status,
                workflow_type: workflowData.workflow_type
            };
            const result = await workflowActionsAPI.getApproverUIStatus(payload);
            setUiStatus(result);
            console.log("res", result);

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
            resetQuickView();
            setInvoiceSection(1);
            navigate("/invoices");
        } else {
            toast.error(payload?.message || "Something went wrong while sending for coding.");
        }
    };

    const handleSendToApproval = async () => {
        await handleSave();
        const payload = await saveInvoice(viewInvoiceId, { status: "waiting_approval" });
        if (payload?.status === "waiting_approval") {
            toast.success("Invoice sent for approval successfully!");
            resetQuickView();
            setInvoiceSection(1);
            navigate("/invoices");
        } else {
            toast.error(payload?.message || "Something went wrong while sending for approval.");
        }
    };

    const handleSaveInvoice = async () => {
        const response = await handleSave();
        if (response) toast.success("Invoice Saved Successfully!");
    };

    const Back = () => {
        resetQuickView();
        setInvoiceSection(1);
        setInvoiceActiveTab("Quick View");
    };

    // ── Core action executor (runs after modal confirms) ───────────────────
    const executeAction = async (action, commentText = "") => {
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
                case "enable-editing":
                    result = await workflowActionsAPI.enableEditing(viewInvoiceId, { comment: commentText });
                    break;
                case "repost-sage":
                    result = await workflowActionsAPI.repostSage(viewInvoiceId, { comment: commentText });
                    break;
                default:
                    return;
            }

            if (result?.success) {
                toast.success(result.message || "Action completed successfully.");

                // Leave the invoice view for terminal / handoff statuses
                const leaveStatuses = ["rejected", "sage_posted", "reworked", "approved"];
                if (leaveStatuses.includes(result.new_status)) {
                    resetQuickView();
                    setInvoiceSection(1);
                    navigate("/invoices");
                } else {
                    // Level advanced, sage failed after approve, etc. → refresh buttons
                    await fetchUIStatus();
                }
            } else {
                // Non-throwing failure (e.g. sage_post_failed returned from approve endpoint)
                toast.error(result?.message || "Action failed. Please try again.");
                await fetchUIStatus();
            }
        } catch (err) {
            const detail = err?.response?.data?.detail;

            // Rework: no previous finance approver → show warning modal, not toast
            if (detail?.code === "NO_FINANCE_APPROVER") {
                Modal.warning({
                    title: "Cannot Send for Rework",
                    content: detail.message,
                    okText: "Got it",
                    centered: true,
                });
            } else {
                const msg =
                    typeof detail === "string"
                        ? detail
                        : detail?.message || "An error occurred. Please try again.";
                toast.error(msg);
            }
        } finally {
            setActionLoading(null);
            setModal(null);
            setComment("");
        }
    };

    // ── Modal open / confirm / cancel ──────────────────────────────────────
    const openModal = (action) => {
        setComment("");
        setModal({ action });
    };

    const handleModalOk = () => {
        if (!modal) return;
        // Reject requires a comment
        if (modal.action === "reject" && !comment.trim()) {
            toast.error("A comment is required when rejecting an invoice.");
            return;
        }
        executeAction(modal.action, comment.trim());
    };

    const handleModalCancel = () => {
        if (actionLoading) return; // block close while request is in-flight
        setModal(null);
        setComment("");
    };

    const busy = (key) => actionLoading === key;

    // ── Derived render flags ───────────────────────────────────────────────
    const isApproverView =
        userRole === "approver" &&
        ["waiting_approval", "reworked", "sage_post_failed"].includes(currentStatus);

    // ── Render ─────────────────────────────────────────────────────────────
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
                            {((userRole === "scanner" && currentStatus !== "waiting_coding") ||
                                (userRole === "coder" && currentStatus === "waiting_coding")) && (
                                    <>
                                        <div className="w-[100px]">
                                            <CustomButton variant="outline">Discard</CustomButton>
                                        </div>
                                        <div className="w-[100px]">
                                            <CustomButton variant="primary" onClick={handleSaveInvoice}>
                                                Save
                                            </CustomButton>
                                        </div>
                                        <div className="w-[220px]">
                                            <CustomButton
                                                variant="success"
                                                disabled={isDuplicate || isWorkflowMissing}
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
                                    {/* Repost to Sage — only visible when post previously failed */}
                                    {currentStatus === "sage_post_failed" && uiStatus?.can_repost_sage && (
                                        <button
                                            onClick={() => openModal("repost-sage")}
                                            disabled={busy("repost-sage")}
                                            className="px-6 py-2 rounded-xl border border-orange-500 text-orange-600
                                                       hover:bg-orange-50 bg-white transition text-sm font-medium
                                                       disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {busy("repost-sage") ? "Reposting…" : "Repost to Sage"}
                                        </button>
                                    )}

                                    {/* Waiting_approval / Reworked actions */}
                                    {["waiting_approval", "reworked"].includes(currentStatus) && (
                                        <>
                                            {/* Enable Editing — finance team approvers only */}
                                            {uiStatus?.can_enable_editing && (
                                                <button
                                                    onClick={() => openModal("enable-editing")}
                                                    disabled={busy("enable-editing")}
                                                    className="px-6 py-2 rounded-xl border border-blue-500 text-blue-600
                                                               hover:bg-blue-50 bg-white transition text-sm font-medium
                                                               disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {busy("enable-editing") ? "Enabling…" : "Enable Editing"}
                                                </button>
                                            )}

                                            {/* Rework */}
                                            <button
                                                onClick={() => openModal("rework")}
                                                disabled={!uiStatus?.can_rework || !!actionLoading}
                                                className={`px-6 py-2 rounded-xl border bg-white transition text-sm font-medium
                                                    ${uiStatus?.can_rework && !actionLoading
                                                        ? "border-yellow-500 text-yellow-600 hover:bg-yellow-50"
                                                        : "border-gray-300 text-gray-400 cursor-not-allowed opacity-50"}`}
                                            >
                                                {busy("rework") ? "Sending…" : "Rework"}
                                            </button>

                                            {/* Reject */}
                                            <button
                                                onClick={() => openModal("reject")}
                                                disabled={!uiStatus?.can_reject || !!actionLoading}
                                                className={`px-6 py-2 rounded-xl border bg-white transition text-sm font-medium
                                                    ${uiStatus?.can_reject && !actionLoading
                                                        ? "border-red-500 text-red-600 hover:bg-red-50"
                                                        : "border-gray-300 text-gray-400 cursor-not-allowed opacity-50"}`}
                                            >
                                                {busy("reject") ? "Rejecting…" : "Reject"}
                                            </button>

                                            {/* Approve */}
                                            <button
                                                onClick={() => openModal("approve")}
                                                disabled={!uiStatus?.can_approve || !!actionLoading}
                                                className={`px-6 py-2 rounded-xl border bg-white transition text-sm font-medium
                                                    ${uiStatus?.can_approve && !actionLoading
                                                        ? "border-green-500 text-green-600 hover:bg-green-50"
                                                        : "border-gray-300 text-gray-400 cursor-not-allowed opacity-50"}`}
                                            >
                                                {busy("approve") ? "Approving…" : "Approve"}
                                            </button>

                                            {/* Informational label when user has no available action */}
                                            {uiStatus &&
                                                !uiStatus.can_approve &&
                                                !uiStatus.can_reject &&
                                                !uiStatus.can_rework &&
                                                !uiStatus.can_enable_editing && (
                                                    <span className="text-xs text-gray-400 italic select-none">
                                                        {uiStatus.level_already_approved
                                                            ? "Your level has been approved"
                                                            : uiStatus.already_acted
                                                                ? "You have already acted on this invoice"
                                                                : "Awaiting another approver"}
                                                    </span>
                                                )}
                                        </>
                                    )}
                                </>
                            )}
                        </>
                    )}
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
            >
                {modal && (
                    <div className="py-2 flex flex-col gap-3">

                        {/* Contextual info banners */}
                        {modal.action === "reject" && (
                            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                                ⚠ This action is <strong>permanent</strong>. No further actions
                                will be possible on this invoice once rejected.
                            </div>
                        )}
                        {modal.action === "rework" && (
                            <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-700">
                                The invoice will be sent back to the previous Finance Team
                                approver for corrections.
                            </div>
                        )}
                        {modal.action === "enable-editing" && (
                            <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
                                You will have full edit access to all invoice tabs.
                                Re-submit for approval once your changes are complete.
                            </div>
                        )}

                        {/* Comment input */}
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