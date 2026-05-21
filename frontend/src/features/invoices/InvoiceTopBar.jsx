import CustomButton from "../../shared/components/CustomButton";
import { icons } from "../../file";
import { useInvoiceStore } from "../../store/invoice.store";
import { useDuplicateCheck } from "../hooks/useDuplicateCheck";
import { useSaveInvoice } from "../hooks/useSaveInvoice";
import { useInvoicePreviewData } from "../hooks/useInvoicePreviewData";
import toast from "../../utils/toast";
import { saveInvoice, getInvoiceById } from "../../api/invoiceApi";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import workflowActionsAPI from "../../api/workflowActionsAPI";
import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { Modal } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import DelegateModal from "./DelegateModal";
import { QUICK_VIEW_CONFIG } from "./Fields";
import { getInvoiceHeuristics } from "../../utils/invoiceCalculations";




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
        quickViewFormData,
        setActiveInvoiceData,
        setInvoiceData,
        lineItems,
        selectedVendorId,
        navigationOrigin,
        setNavigationOrigin,
        setIsPreviewLoading,
        entityMaster,
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
    }), [selectedVendorId, firstLine.lob, firstLine.department]);

    // ── Parallel fetch: vendor + workflow + coding suggestions fire together ──
    // This warms the React Query cache so downstream hooks (useWorkflowDataSync,
    // useVendorDetailSync in QuickViewTab) return data instantly.
    const { workflowData, vendor } = useInvoicePreviewData({
        invoiceId: viewInvoiceId,
        vendorId: selectedVendorId,
        workflowParams,
    });


    const currentStatus = activeInvoiceData?.status || invoice?.status;
    const isWaitingCoding = currentStatus === "waiting_coding";
    const hasAssignedApprovers = workflowData?.assigned_approvers?.length > 0;
    const isWorkflowMissing = isWaitingCoding && !hasAssignedApprovers;

    // ── Editing toggle — flips local state + notifies the server ───────────
    // Approvers can enable editing, save, and repeat as many times as needed.
    const [editingEnabled, setEditingEnabled] = useState(false);

    const handleEnableEditing = async () => {
        try {
            await workflowActionsAPI.enableEditing(viewInvoiceId, {
                last_updated_at: activeInvoiceData?.updated_at
            });
        } catch (err) {
            // 409 means the backend already recorded a prior enable-editing call.
            // We still unlock locally so the approver can continue editing.
            const status = err?.response?.status;
            if (status !== 409) {
                console.error("Enable editing error:", err);
                toast.error("Failed to enable editing on server. Please try again.");
                return;
            }
        }
        setEditingEnabled(true);
        setActiveInvoiceData({
            ...activeInvoiceData,
            is_editing_enabled: true,
            editing_enabled_by: user?.email,
        });
        toast.success("Editing enabled. Make your changes and save.");
    };

    // ── Approver UI state ──────────────────────────────────────────────────
    const [uiStatus, setUiStatus] = useState(null);
    const [uiStatusLoading, setUiStatusLoading] = useState(false);
    const [uiStatusReady, setUiStatusReady] = useState(false);
    const [actionLoading, setActionLoading] = useState(null);
    const [modal, setModal] = useState(null);
    const [comment, setComment] = useState("");
    const [showDelegateModal, setShowDelegateModal] = useState(false);
    // Track workflow revision with a lightweight counter rather than JSON.stringify
    // which is O(n) on every render and causes micro-lag on large payloads.
    const prevWorkflowIdRef = useRef(null);

    const fetchUIStatus = useCallback(async () => {
        if (!viewInvoiceId || !workflowData) return;
        setUiStatusLoading(true);
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
        } finally {
            setUiStatusLoading(false);
            setUiStatusReady(true);
        }
    }, [viewInvoiceId, workflowData]);

    const isAmountMismatch = useMemo(() => {
        const { hasMismatch } = getInvoiceHeuristics(quickViewFormData, lineItems);
        return hasMismatch;
    }, [quickViewFormData, lineItems]);

    useEffect(() => {
        if (!workflowData) return;
        // Use current_approver_level + current_status as a cheap change signal
        const key = `${workflowData.current_approver_level}_${workflowData.current_status}`;
        if (key === prevWorkflowIdRef.current) return;
        prevWorkflowIdRef.current = key;
        setUiStatusReady(false);
        fetchUIStatus();
    }, [workflowData, fetchUIStatus]);

    const validateRequiredFields = useCallback(() => {
        for (const section of QUICK_VIEW_CONFIG) {
            if (section.type !== "form") continue;
            for (const field of section.fields) {
                if (!field.required) continue;

                // Check if visible
                if (field.visible && !field.visible(quickViewFormData, entityMaster)) continue;

                const value = quickViewFormData?.[field.key];
                if (value === undefined || value === null || String(value).trim() === "") {
                    toast.error(`${field.label} is missing.`);
                    return false;
                }
            }
        }
        return true;
    }, [quickViewFormData]);


    // ── Scanner / Coder actions ────────────────────────────────────────────
    const handleSendToCoding = async () => {
        if (!validateRequiredFields()) return;

        setActionLoading("sendToCoding");

        try {
            const saveRes = await handleSave({}, vendor);

            // If the data save failed (returned null), handleSave already showed
            // an error toast — bail out here to avoid a second cascading error.
            if (!saveRes) {
                return;
            }

            const payload = await saveInvoice(viewInvoiceId, {
                status: "waiting_coding",
                last_updated_at: saveRes?.updated_at || activeInvoiceData?.updated_at
            });

            // FIRST: check for conflict / error
            if (payload?.error || payload?.message?.toLowerCase().includes("modified")) {
                toast.error(payload.message || "This invoice was updated by another user.");
                return;
            }

            // THEN: success case
            if (payload?.status === "waiting_coding") {
                toast.success("Invoice sent for coding successfully!");
                await queryClient.invalidateQueries({ queryKey: ["invoices"] });
                await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
                resetQuickView();
                setInvoiceSection(1);
                navigate("/invoices");
            } else {
                toast.error(payload?.message || "Something went wrong while sending for coding.");
            }

        } catch (err) {
            console.error("Send to coding error:", err);
            toast.error("Failed to send invoice for coding.");
        } finally {
            setActionLoading(null);
        }
    };


    const handleDiscard = () => {
        setIsPreviewLoading(true);
        setTimeout(() => {
            setInvoiceData(activeInvoiceData, true);
            setIsPreviewLoading(false);
            toast.success("Changes discarded!");
        }, 100);
    };

    const handleSendToApproval = async () => {
        if (!validateRequiredFields()) return;

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

        setActionLoading("sendToApproval");
        try {
            const saveRes = await handleSave({}, vendor);

            // If the data save failed (returned null), handleSave already showed
            // an error toast — bail out here to avoid a second cascading error.
            if (!saveRes) {
                return;
            }

            const payload = await saveInvoice(viewInvoiceId, {
                status: "waiting_approval",
                last_updated_at: saveRes?.updated_at || activeInvoiceData?.updated_at
            });
            if (payload?.status === "waiting_approval") {
                toast.success("Invoice sent for approval successfully!");
                await queryClient.invalidateQueries({ queryKey: ["invoices"] });
                await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
                resetQuickView();
                setInvoiceSection(1);
                navigate("/coding");
            } else {
                toast.error(payload?.message || "Something went wrong while sending for approval.");
            }
        } catch (err) {
            console.error("Send to approval error:", err);
            toast.error("Failed to send invoice for approval.");
        } finally {
            setActionLoading(null);
        }
    };



    const handleSaveInvoice = async () => {
        // Save always persists the draft — no mandatory-field validation here.
        // Validation is only enforced on "Send to Coding" / "Send to Approval".
        const extraFields = {};
        if (currentStatus === "reworked") {
            extraFields.status = "waiting_approval";
        }

        setActionLoading("saving");
        setIsPreviewLoading(true);
        try {
            const response = await handleSave(extraFields, vendor);
            if (response) {
                toast.success("Invoice Saved Successfully!");
                await queryClient.invalidateQueries({ queryKey: ["invoices"] });
                await queryClient.invalidateQueries({ queryKey: ["invoice-preview", viewInvoiceId] });
                await queryClient.invalidateQueries({ queryKey: ["dashboard"] });

                // ── Lock fields back to read-only after save ────────────────────
                // Resetting editingEnabled hides the Save button and re-shows
                // "Enable Editing" so the approver can make further edits.
                // IMPORTANT: read from getState() — NOT the stale closure value
                // of activeInvoiceData. handleSave already wrote a fresh
                // updated_at into the store; spreading the closure value would
                // overwrite it with an old timestamp and cause a conflict error
                // on the next save attempt.
                if (editingEnabled) {
                    setEditingEnabled(false);
                    const latestData = useInvoiceStore.getState().activeInvoiceData;
                    setActiveInvoiceData({
                        ...latestData,
                        is_editing_enabled: false,
                        editing_enabled_by: null,
                    });
                }

                if (currentStatus === "reworked") {
                    await fetchUIStatus();
                }
            }
        } catch (err) {
            console.error("Save invoice error:", err);
            toast.error("Failed to save invoice.");
        } finally {
            setActionLoading(null);
            setIsPreviewLoading(false);
        }
    };

    const handleRefresh = async () => {
        setActionLoading("refreshing");
        try {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ["invoice-preview", viewInvoiceId] }),
                queryClient.invalidateQueries({ queryKey: ["workflow", viewInvoiceId] }),
                queryClient.invalidateQueries({ queryKey: ["auditFlow", viewInvoiceId] }),
                queryClient.invalidateQueries({ queryKey: ["vendor", selectedVendorId] }),
                queryClient.invalidateQueries({ queryKey: ["coding-suggestions", viewInvoiceId, selectedVendorId] }),
                queryClient.invalidateQueries({ queryKey: ["invoices"] }),
                queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
            ]);

            const freshInvoice = await getInvoiceById(viewInvoiceId);
            if (freshInvoice) {
                const oldStatus = (activeInvoiceData?.status || "").toLowerCase();
                const newStatus = (freshInvoice?.status || "").toLowerCase();

                setInvoiceData(freshInvoice);

                if (oldStatus === "processed" && newStatus === "waiting_coding") {
                    setInvoiceActiveTab("Coding");
                }
            }

            await fetchUIStatus();
            toast.success("Details refreshed!");
        } catch (err) {
            console.error("Refresh error:", err);
            toast.error("Failed to refresh details.");
        } finally {
            setActionLoading(null);
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
                const saveResponse = await handleSave({}, vendor);
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
            const actionPayload = {
                comment: commentText,
                last_updated_at: activeInvoiceData?.updated_at
            };
            let result;
            switch (action) {
                case "approve":
                    result = await workflowActionsAPI.approve(viewInvoiceId, actionPayload);
                    break;
                case "reject":
                    result = await workflowActionsAPI.reject(viewInvoiceId, actionPayload);
                    break;
                case "rework":
                    result = await workflowActionsAPI.rework(viewInvoiceId, actionPayload);
                    break;
                case "repost-sage":
                    result = await workflowActionsAPI.repostSage(viewInvoiceId, actionPayload);
                    break;
                case "recall":
                    result = await workflowActionsAPI.recall(viewInvoiceId, actionPayload);
                    break;
                default:
                    return;
            }

            if (result?.success) {
                toast.success(result.message || "Action completed successfully.");
            } else {
                toast.error(result?.message || "Action failed. Please try again.");
            }

            // Invalidate cache to ensure fresh data on next view
            queryClient.invalidateQueries({ queryKey: ["workflow", viewInvoiceId] });
            queryClient.invalidateQueries({ queryKey: ["auditFlow", viewInvoiceId] });
            queryClient.invalidateQueries({ queryKey: ["invoices"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard"] });

            resetQuickView();

            // If it was a recall, navigate back to the coding queue
            if (action === "recall") {
                setInvoiceSection(1);
                navigate("/coding");
                return;
            }

            // Return to origin or default to approvals
            if (navigationOrigin) {
                const origin = navigationOrigin;
                setNavigationOrigin(null); // Clear origin
                navigate(origin);
            } else {
                setInvoiceSection(1);
                navigate("/approvals");
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
        if (action === "rework" && uiStatus?.rework_error) {
            toast.error(uiStatus.rework_error);
            return;
        }
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
    const canAction = (key) => uiStatusReady && !!uiStatus?.[key] && !actionLoading;

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
            <div className="h-12 min-h-[50px] bg-white border-b border-[#E0E0E0] px-4 flex items-center justify-between ">
                <div className="flex items-center gap-5">
                    {/* Left — Back */}
                    <div
                        onClick={Back}
                        className="flex items-center gap-1 p-1.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
                    >
                        <img src={icons.arrowLeft} alt="Back" />
                        <span className="text-lg font-bold text-gray-500 custom-font-jura">Back</span>
                    </div>
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

                {/* Right — Action buttons */}
                <div className="flex items-center gap-3">
                    {["rejected", "sage_posted", "deleted", "archived"].includes((currentStatus || "").toLowerCase()) && (
                        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-sm ${(currentStatus || "").toLowerCase() === "sage_posted"
                                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                : (currentStatus || "").toLowerCase() === "archived"
                                    ? "bg-blue-50 border-blue-200 text-blue-700"
                                    : "bg-red-50 border-red-200 text-red-700"
                            }`}>
                            <div className={`w-2 h-2 rounded-full ${(currentStatus || "").toLowerCase() === "sage_posted"
                                    ? "bg-emerald-500"
                                    : (currentStatus || "").toLowerCase() === "archived"
                                        ? "bg-blue-500"
                                        : "bg-red-500"
                                }`} />
                            <span className="text-[11px] font-bold uppercase tracking-wider custom-font-creato leading-none">
                                {(currentStatus || "").toLowerCase() === "sage_posted"
                                    ? "Posted to Sage"
                                    : (currentStatus || "").toLowerCase() === "rejected"
                                        ? "Rejected"
                                        : (currentStatus || "").toLowerCase() === "archived"
                                            ? "Archived"
                                            : "Deleted"}
                            </span>
                        </div>
                    )}
                    {!activeInvoiceData?.is_archived && (
                        <>
                            {/* ── Scanner / Coder buttons ───────────────────────── */}
                            {((["scanner", "coder"].some(r => userRole.includes(r)) && (currentStatus || "").toLowerCase() === "processed") ||
                                (userRole.includes("coder") && (currentStatus || "").toLowerCase() === "waiting_coding")) && (
                                    <>
                                        <div className="w-[130px]">
                                            <CustomButton
                                                variant="outline"
                                                height="h-[34px]"
                                                disabled={!!actionLoading}
                                                onClick={handleRefresh}
                                            >
                                                {busy("refreshing") ? "Refreshing..." : "Refresh"}
                                            </CustomButton>
                                        </div>
                                        <div className="w-[130px]">
                                            <CustomButton variant="outline" height="h-[34px]" onClick={handleDiscard}>Discard</CustomButton>
                                        </div>
                                        <div className="w-[130px]">
                                            <CustomButton
                                                variant="primary"
                                                height="h-[34px]"
                                                disabled={!!actionLoading}
                                                onClick={handleSaveInvoice}
                                            >
                                                {busy("saving") ? "Saving..." : "Save"}
                                            </CustomButton>
                                        </div>
                                        <div className="w-[130px]">
                                            <CustomButton
                                                variant="success"
                                                height="h-[34px]"
                                                disabled={
                                                    isDuplicate ||
                                                    !!actionLoading ||
                                                    (currentStatus === "waiting_coding" && isAmountMismatch)
                                                }
                                                onClick={
                                                    currentStatus === "waiting_coding"
                                                        ? handleSendToApproval
                                                        : handleSendToCoding
                                                }
                                            >
                                                {currentStatus === "waiting_coding"
                                                    ? (busy("sendToApproval") ? "Sending..." : "Send to Approval")
                                                    : (busy("sendToCoding") ? "Sending..." : "Send to Coding")}
                                            </CustomButton>
                                        </div>
                                    </>
                                )}

                            {/* ── Approver buttons ──────────────────────────────── */}
                            {/* ── Admin-only buttons ───────────────────────────── */}
                            {userRole === "admin" && ["waiting_approval", "reworked"].includes(currentStatus) && (
                                <>
                                    <button
                                        onClick={handleRefresh}
                                        disabled={!!actionLoading}
                                        className={getBtnClass("blue", !actionLoading)}
                                    >
                                        {busy("refreshing") ? "Refreshing..." : "Refresh"}
                                    </button>
                                    <button
                                        onClick={() => setShowDelegateModal(true)}
                                        className={getBtnClass("blue", true)}
                                    >
                                        Delegate
                                    </button>
                                </>
                            )}

                            {isApproverView && (
                                <>
                                    {/* Repost to Sage */}
                                    {currentStatus === "sage_post_failed" && (
                                        <button
                                            onClick={() => openModal("repost-sage")}
                                            disabled={!canAction("can_repost_sage")}
                                            className={getBtnClass("orange", canAction("can_repost_sage"))}
                                        >
                                            {busy("repost-sage") ? "Reposting…" : "Repost"}
                                        </button>
                                    )}

                                    {["waiting_approval", "reworked"].includes(currentStatus) && (
                                        <>
                                            {/* Refresh */}
                                            <button
                                                onClick={handleRefresh}
                                                disabled={!!actionLoading}
                                                className={getBtnClass("blue", !actionLoading)}
                                            >
                                                {busy("refreshing") ? "Refreshing..." : "Refresh"}
                                            </button>

                                            {/* Enable Editing — always available when not in active edit session */}
                                            {!editingEnabled && (
                                                <button
                                                    onClick={handleEnableEditing}
                                                    disabled={!canAction("can_enable_editing")}
                                                    className={getBtnClass("blue", canAction("can_enable_editing"))}
                                                >
                                                    Enable Editing
                                                </button>
                                            )}

                                            {/* Save — appears once editing is unlocked */}
                                            {editingEnabled && (currentStatus === "waiting_approval" || currentStatus === "reworked") && (
                                                <div className="w-[130px]">
                                                    <CustomButton
                                                        variant="primary"
                                                        height="h-[34px]"
                                                        disabled={!!actionLoading}
                                                        onClick={handleSaveInvoice}
                                                    >
                                                        {busy("saving") ? "Saving..." : "Save"}
                                                    </CustomButton>
                                                </div>
                                            )}

                                            {/* Rework */}
                                            <button
                                                onClick={() => openModal("rework")}
                                                disabled={!canAction("can_rework")}
                                                className={getBtnClass("yellow", canAction("can_rework"))}
                                            >
                                                {busy("rework") ? "Sending…" : "Rework"}
                                            </button>

                                            {/* Reject */}
                                            <button
                                                onClick={() => openModal("reject")}
                                                disabled={!canAction("can_reject")}
                                                className={getBtnClass("red", canAction("can_reject"))}
                                            >
                                                {busy("reject") ? "Rejecting…" : "Reject"}
                                            </button>

                                            {/* Approve */}
                                            <button
                                                onClick={() => openModal("approve")}
                                                disabled={!canAction("can_approve")}
                                                className={getBtnClass("green", canAction("can_approve"))}
                                            >
                                                {busy("approve") ? "Approving…" : "Approve"}
                                            </button>

                                            {/* Info label */}
                                            {(uiStatusLoading || !uiStatusReady) && (
                                                <span className="text-xs text-gray-400 italic select-none">
                                                    Checking permissions...
                                                </span>
                                            )}
                                            {uiStatusReady && uiStatus &&
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
                    {/* <div className="w-[130px]">
                        <CustomButton
                            variant="outline"
                            height="h-[34px]"
                            onClick={onTogglePdf}
                        >
                            {isPdfVisible ? "Hide PDF" : "Show PDF"}
                        </CustomButton>
                    </div> */}
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
                                {uiStatus?.current_level === 1
                                    ? "The invoice will be sent back to the coder for coding."
                                    : "The invoice will be sent back to the previous Finance Team approver for corrections."}
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

            <DelegateModal
                visible={showDelegateModal}
                onClose={() => setShowDelegateModal(false)}
                invoiceId={viewInvoiceId}
                onDelegateSuccess={handleRefresh}
            />
        </>
    );
};

export default InvoiceTopBar;
