import { CheckOutlined } from "@ant-design/icons";

const auditTrailData = [
    {
        type: "coding_saved",
        label: "Coding Saved",
        user: "Noah Bennett",
        time: "02/20/2026 - 3:45 PM",
        details: [{ label: "Line Item Count", value: "12" }],
    },
    {
        type: "coding_saved",
        label: "Coding Saved",
        user: "Noah Bennett",
        time: "02/20/2026 - 3:45 PM",
        details: [{ label: "Line Item Count", value: "12" }],
    },
    {
        type: "coding_saved",
        label: "Coding Saved",
        user: "Noah Bennett",
        time: "02/20/2026 - 3:45 PM",
        details: [{ label: "Line Item Count", value: "12" }],
    },
    {
        type: "sent_for_coding",
        label: "Sent for Coding",
        user: "Noah Bennett",
        time: "02/20/2026 - 3:45 PM",
        details: [
            {
                label: "Status",
                oldValue: "In-Progress",
                newValue: "Queued for Coding",
                isStatus: true,
            },
        ],
    },
    {
        type: "invoice_updated",
        label: "Invoice Updated",
        user: "Noah Bennett",
        time: "02/20/2026 - 3:45 PM",
        details: [
            {
                label: "Extracted Vendor Address",
                oldValue: "10 Madera Del Presidio Drive, Corte Madera, CA 94026",
                newValue: "210 North McDuffie St, Ste 106, Anderson SC 29621, United States",
            },
            {
                label: "Total Invoice Amount",
                oldValue: "$12,008.40",
                newValue: "$13,326.22",
            },
            {
                label: "Total Amount Payable",
                oldValue: "null",
                newValue: "$13,326.22",
            },
        ],
    },
];

const eventConfig = {
    coding_saved: {
        iconBg: "#14C9B1",
        labelBg: "#E1F5EE",
        labelColor: "#0F6E56",
        lineBg: "#1BAA8F",
        icon: <CheckOutlined className="!text-white text-[12px]" />,
    },
    sent_for_coding: {
        iconBg: "#3B82F6",
        labelBg: "#DBEAFE",
        labelColor: "#1E40AF",
        lineBg: "#D1D5DB",
        icon: <span className="text-white text-[10px] font-bold">→</span>,
    },
    invoice_updated: {
        iconBg: "#8B5CF6",
        labelBg: "#EDE9FE",
        labelColor: "#5B21B6",
        lineBg: "#D1D5DB",
        icon: <span className="text-white text-[10px]">✎</span>,
    },
};

const ArrowIcon = () => (
    <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        className="inline mx-1 text-gray-400"
    >
        <polyline
            points="9 18 15 12 9 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
        />
        <polyline
            points="15 18 21 12 15 6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
        />
    </svg>
);

const AuditTrailTab = () => {
    return (
        <div className="bg-white p-6">
            {auditTrailData.map((item, index) => {
                const config = eventConfig[item.type];
                const isLast = index === auditTrailData.length - 1;

                return (
                    <div key={index} className="flex gap-4">

                        {/* LEFT — icon + connector line */}
                        <div className="flex flex-col items-center">
                            <div
                                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{ background: config.iconBg }}
                            >
                                {config.icon}
                            </div>
                            {!isLast && (
                                <div
                                    className="w-[2px] flex-1 mt-1"
                                    style={{
                                        minHeight: "40px",
                                        background: config.lineBg,
                                    }}
                                />
                            )}
                        </div>

                        {/* RIGHT — header + detail card */}
                        <div className="pb-5 flex-1">
                            {/* Header row */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <span
                                    className="text-[12px] font-medium px-2 py-[2px] rounded"
                                    style={{
                                        background: config.labelBg,
                                        color: config.labelColor,
                                    }}
                                >
                                    {item.label}
                                </span>
                                <span className="text-[13px] font-medium text-gray-800">
                                    {item.user}
                                </span>
                                {item.time && (
                                    <span className="text-[12px] text-gray-400">
                                        {item.time}
                                    </span>
                                )}
                            </div>

                            {/* Detail card */}
                            {item.details?.length > 0 && (
                                <div className="mt-2 bg-gray-50 rounded-md px-3 py-2 text-[13px] text-gray-500 space-y-1">
                                    {item.details.map((d, i) => (
                                        <div key={i} className="flex items-start flex-wrap gap-1">
                                            <span>{d.label} :</span>
                                            {d.oldValue !== undefined ? (
                                                <>
                                                    {d.isStatus ? (
                                                        <span className="bg-green-100 text-green-800 px-2 rounded text-[12px]">
                                                            {d.oldValue}
                                                        </span>
                                                    ) : (
                                                        <span className="line-through text-gray-400">
                                                            {d.oldValue}
                                                        </span>
                                                    )}
                                                    <ArrowIcon />
                                                    <span className="text-gray-800 font-medium">
                                                        {d.newValue}
                                                    </span>
                                                </>
                                            ) : (
                                                <span className="text-gray-800 font-medium">
                                                    {d.value}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default AuditTrailTab;