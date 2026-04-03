import { CheckOutlined, ExclamationOutlined } from "@ant-design/icons";
import { useInvoiceStore } from "../../../store/invoice.store";
import { getWorkflowApproversSync, useWorkflowDataSync } from "../../hooks/useWorkflow";

const getStatusStyles = (status) => {
    switch (status) {
        case "completed":
            return {
                icon: (
                    <div className="w-5 h-5 flex items-center justify-center rounded-full bg-[#14C9B1]">
                        <CheckOutlined className="!text-white text-[10px]" />
                    </div>
                ),
                line: "bg-[#1BAA8F]",
                title: "text-[#12B7A1]",
            };

        case "pending":
            return {
                icon: (
                    <div className="w-5 h-5 flex items-center justify-center rounded-full bg-[#E8C722]">
                        <ExclamationOutlined className="!text-white text-[10px]" />
                    </div>
                ),
                line: "bg-gray-300",
                title: "text-[#8A6D00]",
            };

        default:
            return {
                icon: (
                    <div className="w-5 h-5 border-2 border-gray-300 rounded-full bg-white" />
                ),
                line: "bg-gray-300",
                title: "text-gray-500",
            };
    }
};

const formatWorkflowData = (workflowData) => {
    const steps = workflowData?.steps || [];
    const currentLevel = workflowData?.current_approver_level || 1;

    return steps.map((step, index) => {
        let status = "upcoming";

        if (step.status === "completed") {
            status = "completed";
        } else if (index + 1 === currentLevel) {
            status = "pending"; // current step
        }

        return {
            title: step.step_name,
            subtitle: step.user || "System",
            time: step.timestamp
                ? new Date(step.timestamp).toLocaleString()
                : "",
            status,
        };
    });
};

const WorkflowTab = () => {

    const { viewInvoiceId } = useInvoiceStore();

    const {
        workflowData,
        isLoadingWorkflowData,
        isWorkflowDataError
    } = useWorkflowDataSync(viewInvoiceId);

    if (isLoadingWorkflowData) {
        return <div className="p-6 text-gray-400">Loading...</div>;
    }

    if (isWorkflowDataError) {
        return <div className="p-6 text-red-500">Error loading workflow</div>;
    }

    if (!workflowData?.steps?.length) {
        return <div className="p-6 text-gray-400">No workflow available</div>;
    }

    const data = formatWorkflowData(workflowData);

    return (
        <div className="bg-white p-6">
            {data.map((item, index) => {
                const styles = getStatusStyles(item.status);
                const isLast = index === data.length - 1;

                return (
                    <div key={index} className="flex gap-4">
                        <div className="flex flex-col items-center">
                            {styles.icon}
                            {!isLast && (
                                <div
                                    className={`w-[2px] flex-1 mt-2 ${styles.line}`}
                                    style={{ minHeight: "40px" }}
                                />
                            )}
                        </div>

                        <div className="pb-6">
                            <div className={`text-[15px] font-medium ${styles.title}`}>
                                {item.title}
                            </div>

                            <div className="text-[13px] text-gray-500 mt-1">
                                {item.subtitle}
                                {item.time && (
                                    <span className="ml-3 text-gray-400">
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