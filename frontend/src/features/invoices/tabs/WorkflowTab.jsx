
import { CheckOutlined, ExclamationOutlined, ClockCircleOutlined, UserOutlined, CloseOutlined, RollbackOutlined, InboxOutlined } from "@ant-design/icons";

import { Tag } from "antd";

import { useInvoiceStore } from "../../../store/invoice.store";

import { useWorkflowDataSync } from "../../hooks/useWorkflow";

import { useMemo } from "react";
import { formatIST } from "../../../utils/formatters";

const getOrdinal = (n) => {

    const s = ["th", "st", "nd", "rd"];

    const v = n % 100;

    return n + (s[(v - 20) % 10] || s[v] || s[0]);

};



const getStatusConfig = (status) => {
    switch (status?.toLowerCase()) {
        case "completed":
        case "sage_posted":
        case "approved":
            return {
                titleColor: "text-[#1AB394]",
                subtitleColor: "text-gray-600",
                timeColor: "text-gray-400",
                icon: (
                    <div className="w-6 h-6 flex items-center justify-center rounded-full bg-[#1AB394]">
                        <CheckOutlined className="!text-white text-[10px] font-black" />
                    </div>
                ),
                lineColor: "bg-[#1AB394]",
                lineStyle: "solid"
            };
        case "pending":
            return {
                titleColor: "text-[#8A6D3B]",
                subtitleColor: "text-gray-600",
                timeColor: "text-gray-400",
                icon: (
                    <div className="w-6 h-6 flex items-center justify-center rounded-full bg-[#F8AC59]">
                        <ExclamationOutlined className="!text-white text-[12px] font-black" />
                    </div>
                ),
                lineColor: "bg-gray-200",
                lineStyle: "dashed",
                defaultSubtitle: "Awaiting Review"
            };
        case "rejected":
            return {
                titleColor: "text-[#ED5565]",
                subtitleColor: "text-gray-600",
                timeColor: "text-gray-400",
                icon: (
                    <div className="w-6 h-6 flex items-center justify-center rounded-full bg-[#ED5565]">
                        <CloseOutlined className="!text-white text-[10px] font-black" />
                    </div>
                ),
                lineColor: "bg-gray-200",
                lineStyle: "dashed",
                defaultSubtitle: "Rejected"
            };
        case "reworked":
            return {
                titleColor: "text-[#F8AC59]",
                subtitleColor: "text-gray-600",
                timeColor: "text-gray-400",
                icon: (
                    <div className="w-6 h-6 flex items-center justify-center rounded-full bg-[#F8AC59]">
                        <RollbackOutlined className="!text-white text-[10px] font-black" />
                    </div>
                ),
                lineColor: "bg-gray-200",
                lineStyle: "dashed",
                defaultSubtitle: "Sent for Rework"
            };
        case "deleted":
            return {
                titleColor: "text-[#ED5565]",
                subtitleColor: "text-gray-600",
                timeColor: "text-gray-400",
                icon: (
                    <div className="w-6 h-6 flex items-center justify-center rounded-full bg-[#ED5565]">
                        <CloseOutlined className="!text-white text-[10px] font-black" />
                    </div>
                ),
                lineColor: "bg-[#ED5565]",
                lineStyle: "solid",
                defaultSubtitle: "Invoice Deleted"
            };
        case "archived":
            return {
                titleColor: "text-[#4338CA]",
                subtitleColor: "text-gray-600",
                timeColor: "text-gray-400",
                icon: (
                    <div className="w-6 h-6 flex items-center justify-center rounded-full bg-[#4338CA]">
                        <InboxOutlined className="!text-white text-[10px] font-black" />
                    </div>
                ),
                lineColor: "bg-[#4338CA]",
                lineStyle: "solid",
                defaultSubtitle: "Invoice Archived"
            };
        case "queued":
        case "upcoming":
        default:
            return {
                titleColor: "text-gray-500",
                subtitleColor: "text-gray-400",
                timeColor: "text-gray-300",
                icon: (
                    <div className="w-6 h-6 border-2 border-gray-200 rounded-full bg-white" />
                ),
                lineColor: "bg-gray-200",
                lineStyle: "dashed",
                defaultSubtitle: "In Queue"
            };
    }
};



const WorkflowTab = () => {

    const { viewInvoiceId, activeInvoiceData, lineItems, selectedVendorId } = useInvoiceStore();

    const isArchived = activeInvoiceData?.is_archived;



    // Pass preview params only for invoices that have NOT yet entered the approval cycle.
    // Once an invoice is waiting_approval / reworked the backend returns the locked snapshot;
    // sending preview params would trigger a live config re-evaluation and overwrite the snapshot.
    const currentStatus = (activeInvoiceData?.status || "").toLowerCase();
    const isInApproval = ["waiting_approval", "reworked"].includes(currentStatus);

    const firstLine = lineItems?.[0] || {};

    // Memoize so React Query doesn't see a new key object on every render → prevents re-fetches
    const workflowParams = useMemo(() => {
        // For in-approval invoices send no preview overrides — backend reads the DB snapshot.
        if (isInApproval) return {};
        return {
            preview_vendor_id: selectedVendorId,
            preview_lob: firstLine.lob,
            preview_department_id: firstLine.department,
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isInApproval, selectedVendorId, firstLine.lob, firstLine.department]);

    const {
        workflowData: liveWorkflowData,
        isLoadingWorkflowData
    } = useWorkflowDataSync(!isArchived ? viewInvoiceId : null, workflowParams);

    const workflowData = useMemo(() => {
        if (!isArchived) return liveWorkflowData;

        return {
            steps: activeInvoiceData?.workflow_steps || [],
            assigned_approvers: activeInvoiceData?.assigned_approvers || [],
            current_approver_level: activeInvoiceData?.current_approver_level || 1,
            delegations: {},
            user_names: activeInvoiceData?.user_names || {},
            workflow_type: activeInvoiceData?.workflow_type || "archived",
            required_approvers: activeInvoiceData?.required_approvers || (activeInvoiceData?.assigned_approvers?.length || 0)
        };
    }, [isArchived, liveWorkflowData, activeInvoiceData]);

    if (isLoadingWorkflowData) {
        return <div className="p-6 text-gray-400 font-normal">Loading analysis...</div>;
    }

    const renderStatus = currentStatus || "processed";
    const historySteps = workflowData?.steps || [];
    const assignedApprovers = workflowData?.assigned_approvers || [];
    const currentApproverLevel = workflowData?.current_approver_level || 1;
    const delegations = workflowData?.delegations || {};
    const userNamesMap = workflowData?.user_names || {};

    const getUserDisplayName = (email) => userNamesMap[email?.toLowerCase()] || email;



    const steps = [];



    // Part 1: History (Audit Trail)

    historySteps.forEach(s => {

        let title = s.step_name;

        let status = "completed";

        if (["reworked", "rejected", "post_failed"].includes(s.step_type)) {

            status = s.step_type === "reworked" ? "reworked" : "rejected";

        }



        // Format titles for approver stages

        if (s.approver_number) {

            const ord = getOrdinal(s.approver_number);

            if (s.step_type === "level_approved") title = `${ord} Approver Completed`;

            else if (s.step_type === "reworked") title = `${ord} Approver Reworked`;

            else if (s.step_type === "rejected") title = `${ord} Approver Rejected`;

        }



        steps.push({

            title,

            subtitle: getUserDisplayName(s.user),

            time: formatIST(s.timestamp),

            comment: s.comment,

            status

        });

    });



    // Part 2: Pending and Future Stages (if not finished)

    const isFinished = ["sage_posted", "rejected", "deleted", "archived"].includes(renderStatus);

    if (!isFinished) {

        // 1. Coding

        const hasCoding = historySteps.some(s => s.step_type === "coding");

        if (!hasCoding && (renderStatus === "waiting_coding" || renderStatus === "processed")) {

            steps.push({

                title: renderStatus === "waiting_coding" ? "Waiting For Coding" : "Coding Stage",

                status: renderStatus === "waiting_coding" ? "pending" : "queued"

            });

        }



        // 2. Approvers

        const isWaitingApproval = ["waiting_approval", "reworked"].includes(renderStatus);

        if (isWaitingApproval || renderStatus === "waiting_coding" || renderStatus === "processed") {

            assignedApprovers.forEach((stage, index) => {

                const level = index + 1;

                const stageType = stage?.type || "mandatory";

                const emails = Array.isArray(stage?.emails) ? stage.emails : (stage?.emails ? [stage.emails] : []);



                const isFinanceTeam = stage?.is_finance || emails.some(e => String(e).toLowerCase().includes("finance team")) || (stageType === "mandatory" && stage?.level === 2 && emails.length === 0);

                const subtitle = isFinanceTeam ? "Finance Team" : emails.map(email => {

                    if (!email) return "";

                    const displayName = getUserDisplayName(email);

                    const substitutes = delegations[email.toLowerCase()];

                    if (substitutes?.length > 0) {

                        const subNames = substitutes.map(s => getUserDisplayName(s)).join(", ");

                        return `${displayName} (Delegated to ${subNames})`;

                    }

                    return displayName;

                }).join(", ");



                if (level === currentApproverLevel && isWaitingApproval) {

                    let title = `Pending ${getOrdinal(level)} Approver`;

                    if (stageType === "threshold") title = "Pending Threshold Approver";

                    if (stageType === "posting") title = "Pending Posting Approver";



                    steps.push({ title, subtitle, status: "pending" });

                } else if (level > currentApproverLevel || (level === currentApproverLevel && !isWaitingApproval)) {

                    let title = `${getOrdinal(level)} Approver`;

                    if (stageType === "threshold") title = "Threshold Approver";

                    if (stageType === "posting") title = "Posting Approver";



                    steps.push({ title, subtitle, status: "queued" });

                }

            });

        }



        // 3. Final Posting

        if (renderStatus !== "sage_posted") {

            steps.push({

                title: renderStatus === "approved" ? "Pending Final Posting" : "Final Posting",

                status: renderStatus === "approved" ? "pending" : "queued"

            });

        }

    }



    return (
        <div className="bg-white p-10 font-sans">
            {steps.map((item, index) => {
                const config = getStatusConfig(item.status);
                const isLast = index === steps.length - 1;

                return (
                    <div key={index} className="flex gap-6 relative items-stretch">
                        <div className="flex flex-col items-center">
                            <div className="z-10 bg-white py-1">
                                {config.icon}
                            </div>
                            {!isLast && (
                                <div
                                    className={`w-[2px] flex-1 ${config.lineStyle === 'dashed' ? 'border-l-2 border-dashed border-gray-200' : config.lineColor}`}
                                    style={{ minHeight: "20px" }}
                                />
                            )}
                        </div>

                        <div className="pb-5 pt-1 flex-1 flex flex-col justify-start">
                            <div className={`text-[13px] font-normal tracking-wide ${config.titleColor}`}>
                                {item.title}
                            </div>

                            <div className="mt-1 flex flex-col gap-1">
                                <div className="flex items-baseline gap-3">
                                    <span className={`text-[12px] font-normal ${config.subtitleColor}`}>
                                        {item.subtitle || config.defaultSubtitle}
                                    </span>
                                    {item.time && (
                                        <span className={`text-[12px] font-normal ${config.timeColor}`}>
                                            {item.time}
                                        </span>
                                    )}
                                </div>
                                {item.comment && (
                                    <div className={`mt-1 text-[11px] italic text-gray-500 bg-gray-50 p-2 rounded border-l-2 ${item.status === 'rejected' ? 'border-[#ED5565]' : (item.status === 'reworked' ? 'border-[#F8AC59]' : 'border-[#1AB394]')} max-w-md shadow-sm`}>
                                        "{item.comment}"
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};



export default WorkflowTab;

