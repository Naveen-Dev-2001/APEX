import { CheckOutlined, ExclamationOutlined } from "@ant-design/icons";

const workflowData = [
    {
        title: "Processed For Approval",
        subtitle: "Jake Thompson",
        time: "02/20/2026 - 3:45 PM",
        status: "completed",
    },
    {
        title: "First-Level Approval Completed",
        subtitle: "Noah Bennett",
        time: "02/20/2026 - 3:45 PM",
        status: "pending",
    },
    {
        title: "Pending Second-Level Approval",
        subtitle: "Awaiting Review",
        time: "",
        status: "pending",
    },
    {
        title: "Third-Level Approval",
        subtitle: "In Queue",
        time: "",
        status: "upcoming",
    },
];

const getStatusStyles = (status) => {
    switch (status) {
        case "completed":
            return {
                icon: (
                    <div className="w-7 h-7 flex items-center justify-center rounded-full bg-[#14C9B1]">
                        <CheckOutlined className="!text-white text-[12px]" />
                    </div>
                ),
                line: "bg-[#1BAA8F]",
                title: "text-[#1BAA8F]",
            };

        case "pending":
            return {
                icon: (
                    <div className="w-7 h-7 flex items-center justify-center rounded-full bg-[#E8C722]">
                        <ExclamationOutlined className="!text-white text-[12px]" />
                    </div>
                ),
                line: "bg-gray-300",
                title: "text-[#8A6D00]",
            };

        default:
            return {
                icon: (
                    <div className="w-7 h-7 border-2 border-gray-300 rounded-full bg-white" />
                ),
                line: "bg-gray-300",
                title: "text-gray-500",
            };
    }
};

const WorkflowTab = () => {
    return (
        <div className="bg-white p-6">
            {workflowData.map((item, index) => {
                const styles = getStatusStyles(item.status);
                const isLast = index === workflowData.length - 1;

                return (
                    <div key={index} className="flex gap-4">

                        {/* LEFT */}
                        <div className="flex flex-col items-center">
                            {styles.icon}

                            {!isLast && (
                                <div
                                    className={`w-[2px] flex-1 mt-1 ${styles.line}`}
                                    style={{ minHeight: "40px" }}
                                />
                            )}
                        </div>

                        {/* RIGHT */}
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