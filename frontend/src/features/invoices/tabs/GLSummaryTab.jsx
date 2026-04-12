import { useMemo } from "react";
import { useInvoiceStore } from "../../../store/invoice.store";
import { useGLMasterSync } from "../../hooks/useMasterDataSync";

const GLSummaryTab = ({ invoice = {} }) => {
    const { lineItems } = useInvoiceStore();
    const { data: glData } = useGLMasterSync();

    // ── Optimized GL Lookup Map ──────────────────────────────────────────────
    const glMap = useMemo(() => {
        const data = glData?.data || glData || [];
        const map = {};
        data.forEach(item => {
            if (item.account_number) {
                map[item.account_number.trim()] = item.title;
            }
        });
        return map;
    }, [glData]);

    const distributionRows = useMemo(() => {
        if (!lineItems?.length) return [];

        const groups = {};
        lineItems.forEach(item => {
            const rawCode = (item.glCode || "").trim();
            const code = rawCode || "Uncoded";
            
            if (!groups[code]) {
                groups[code] = {
                    code,
                    title: glMap[rawCode] || "",
                    amount: 0
                };
            }
            groups[code].amount += (Number(item.netAmount) || 0);
        });

        return Object.values(groups);
    }, [lineItems, glMap]);

    const totalAmount = useMemo(() =>
        distributionRows.reduce((sum, r) => sum + r.amount, 0),
        [distributionRows]
    );

    const formatCurrency = (value) =>
        new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value);

    return (
        <div className="p-2 h-full overflow-y-auto">
            {/* Total Amount Banner */}
            <div
                className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 rounded-xl mb-5"
                style={{ background: "#11699E" }}
            >
                <span className="text-white text-[15px] font-normal">
                    Total Amount Payable:
                </span>
                <span className="text-white text-[26px] font-medium tracking-tight">
                    {formatCurrency(totalAmount)}
                </span>
            </div>

            {/* Distribution Summary */}
            <p className="text-[15px] font-medium text-gray-800 mb-2">
                Distribution Summary
            </p>

            <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm bg-white">
                {distributionRows.length > 0 ? (
                    distributionRows.map((row, index) => (
                        <div
                            key={row.code}
                            className={`flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors ${index !== 0 ? "border-t border-gray-100" : ""
                                }`}
                        >
                            <div className="flex flex-col gap-0.5">
                                <span className="text-[14px] font-semibold text-[#11699E]">
                                    {row.code} {row.title ? ` - ${row.title}` : ""}
                                </span>
                            </div>
                            <span className="text-[15px] font-semibold text-gray-900">
                                {formatCurrency(row.amount)}
                            </span>
                        </div>
                    ))
                ) : (
                    <div className="px-5 py-8 text-center text-gray-400">
                        No line items found for distribution
                    </div>
                )}
            </div>
        </div>
    );
};

export default GLSummaryTab;

