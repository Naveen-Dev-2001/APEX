const GLSummaryTab = ({ invoice = {} }) => {

    const distributionRows = [
        { code: "001-500-08-1951", description: "Copier Supplies", amount: 2000 },
        { code: "001-500-08-1951", description: "Copier Supplies", amount: 4000 },
        { code: "001-500-08-1951", description: "Copier Supplies", amount: 8000 },
        { code: "001-500-08-1951", description: "Copier Supplies", amount: 8000 },
        { code: "001-500-08-1951", description: "Copier Supplies", amount: 8000 },
    ];

    const totalAmount = distributionRows.reduce((sum, r) => sum + r.amount, 0);

    const formatCurrency = (value) =>
        new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

    return (
        <div className="p-2">
            {/* Total Amount Banner */}
            <div
                className="flex items-center justify-between px-6 py-4 rounded-xl mb-5"
                style={{ background: "#11699E" }}
            >
                <span className="text-white text-[15px] font-normal">Total Amount Payable:</span>
                <span className="text-white text-[26px] font-medium tracking-tight">
                    {formatCurrency(totalAmount)}
                </span>
            </div>

            {/* Distribution Summary */}
            <p className="text-[15px] font-medium text-gray-800 mb-2">Distribution Summary</p>

            <div className="border border-gray-200 rounded-xl overflow-hidden">
                {distributionRows.map((row, index) => (
                    <div
                        key={index}
                        className={`flex items-center justify-between px-5 py-3 bg-white ${index !== 0 ? "border-t border-gray-100" : ""
                            }`}
                    >
                        <div className="flex flex-col gap-0.5">
                            <span className="text-[14px] font-medium text-gray-800">{row.code}</span>
                            <span className="text-[12px] text-gray-400">{row.description}</span>
                        </div>
                        <span className="text-[14px] font-medium text-gray-800">
                            {formatCurrency(row.amount)}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default GLSummaryTab;