import { CheckOutlined, ExclamationOutlined, ClockCircleOutlined, UserOutlined } from "@ant-design/icons";
import { Tag } from "antd";
import { useInvoiceStore } from "../../../store/invoice.store";
import { useWorkflowDataSync } from "../../hooks/useWorkflow";

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

    // Pass the same preview params as InvoiceTopBar so codification workflows resolve correctly
    const firstLine = lineItems?.[0] || {};
    const {
        workflowData,
        isLoadingWorkflowData
    } = useWorkflowDataSync(!isArchived ? viewInvoiceId : null, {
        preview_vendor_id: selectedVendorId,
        preview_lob: firstLine.lob,
        preview_department_id: firstLine.department,
    });

    if (isLoadingWorkflowData) {
        return <div className="p-6 text-gray-400 font-normal">Loading analysis...</div>;
    }

    const currentStatus = (activeInvoiceData?.status || "processed").toLowerCase();
    const historySteps = workflowData?.steps || [];
    const steps = [];

    // Step 1: Processed
    const processedStep = historySteps.find(s => s.step_type === "processed");
    steps.push({
        title: "Processed For Approval",
        subtitle: processedStep?.user || activeInvoiceData?.uploaded_by || "Scanner",
        time: processedStep?.timestamp ? new Date(processedStep.timestamp).toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true }) : "",
        status: "completed"
    });

    // Step 2: Coding
    const codingStep = historySteps.find(s => s.step_type === "coding");
    const isCodingFinished = !!codingStep || !["processed", "waiting_coding"].includes(currentStatus);
    steps.push({
        title: isCodingFinished ? "Coding Completed" : "Pending Coding",
        subtitle: codingStep?.user || (isCodingFinished ? (activeInvoiceData?.uploaded_by || "") : ""),
        time: codingStep?.timestamp ? new Date(codingStep.timestamp).toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true }) : "",
        status: isCodingFinished ? "completed" : (currentStatus === "waiting_coding" ? "pending" : "queued")
    });

    // Step 3: Approvers
    const assignedApprovers = workflowData?.assigned_approvers || [];
    const currentApproverLevel = workflowData?.current_approver_level || 1;
    const isWaitingApproval = currentStatus === "waiting_approval";
    // delegations: { original_email: [delegate_email, ...] }
    const delegations = workflowData?.delegations || {};

    assignedApprovers.forEach((stage, index) => {
        const level = index + 1;
        const type = `approver_${level}`;
        const historicalActions = historySteps.filter(s => s.step_type === type && (s.status === 'approved' || s.status === 'completed'));
        
        const stageType = stage?.type || "mandatory";
        const emails = Array.isArray(stage?.emails) ? stage.emails : (stage?.emails ? [stage.emails] : []);
        
        // Dynamic Finance Team logic
        const isFinanceTeam = stage?.is_finance || emails.some(e => String(e).toLowerCase().includes("finance team")) || (stageType === "mandatory" && stage?.level === 2 && emails.length === 0);
        
        // Define Title based on status
        let status = "queued";
        if (historicalActions.length > 0) status = "approved";
        else if (level === currentApproverLevel && isWaitingApproval) status = "pending";

        const ord = getOrdinal(level);
        let title = `${ord} Approver`;
        if (stageType === "threshold") title = "Threshold Approver";
        if (stageType === "posting") title = "Posting Approver";

        if (status === "approved") title = `${title} Completed`;
        else if (status === "pending") title = `Pending ${title}`;

        let subtitle = isFinanceTeam ? "Finance Team" : emails.filter(e => e).join(", ");
        let time = "";

        if (historicalActions.length > 0) {
            const lastAction = historicalActions[historicalActions.length - 1];
            subtitle = lastAction.user;
            time = new Date(lastAction.timestamp).toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true });
        }

        steps.push({ title, subtitle, status, time });
    });

    // Step 4: Sage Posting
    const isSageCompleted = currentStatus === "sage_posted";
    steps.push({
        title: isSageCompleted ? "Posted to Sage" : (currentStatus === "approved" ? "Pending Final Posting" : "Final Posting"),
        subtitle: isSageCompleted ? "System" : "",
        status: isSageCompleted ? "completed" : (currentStatus === "approved" ? "pending" : "queued")
    });

    return (
        <div className="bg-white p-10 overflow-y-auto max-h-full font-sans">
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

                        <div className="pb-5 flex-1 flex flex-col justify-start">
                            <div className={`text-[13px] font-normal tracking-wide ${config.titleColor}`}>
                                {item.title}
                            </div>

                            <div className="mt-1 flex items-baseline gap-3">
                                <span className={`text-[12px] font-normal ${config.subtitleColor}`}>
                                    {item.subtitle || config.defaultSubtitle}
                                </span>
                                {item.time && (
                                    <span className={`text-[12px] font-normal ${config.timeColor}`}>
                                        {item.time}
                                    </span>
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