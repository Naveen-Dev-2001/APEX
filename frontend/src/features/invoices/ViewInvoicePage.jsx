import { useState, useCallback } from "react";
import Split from "react-split";
import { Spin } from "antd";
import InvoiceTopBar from "./InvoiceTopBar";
import InvoicePdfViewer from "./InvoicePdfViewer";
import InvoiceRightPanel from "./InvoiceRightPanel";
import { useInvoiceStore } from "../../store/invoice.store";

const ViewInvoicePage = () => {
    const [sizes, setSizes] = useState([45, 55]);
    const isPreviewLoading = useInvoiceStore((state) => state.isPreviewLoading);
    const activeInvoiceData = useInvoiceStore((state) => state.activeInvoiceData);
    const showBootLoader = isPreviewLoading || !activeInvoiceData;

    const togglePdf = useCallback(() => {
        setSizes(prev => (prev[0] <= 10 ? [45, 55] : [0, 100]));
    }, []);

    return (
        <div className="h-full flex flex-col bg-[#F7F7F7]">
            {/* Fixed Top Bar */}
            <div className="flex-shrink-0 bg-white border-b border-[#E0E0E0]">
                <InvoiceTopBar isPdfVisible={sizes[0] > 10} onTogglePdf={togglePdf} />
            </div>

            {/* Split Layout - takes remaining space */}
            <div className="relative flex-1 min-h-0">
                <Split
                    className="flex h-full"
                    sizes={sizes}
                    minSize={[0, 320]}
                    gutterSize={6}
                    direction="horizontal"
                    onDragEnd={(newSizes) => setSizes(newSizes)}
                    transitionSpeed={300}
                >
                    {/* LEFT - PDF */}
                    <div className="flex flex-col overflow-hidden bg-[#EFEFEF]">
                        <div className="flex-1 min-h-0 overflow-y-auto">
                            <InvoicePdfViewer />
                        </div>
                    </div>

                    {/* RIGHT - Details */}
                    <div className="flex flex-col overflow-hidden bg-white border-l border-[#E0E0E0] right-side-preview-container">
                        <div className="flex-1 min-h-0 p-4">
                            <InvoiceRightPanel />
                        </div>
                    </div>
                </Split>
                {showBootLoader && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
                        <div className="flex flex-col items-center gap-3">
                            <Spin size="large" />
                            <span className="text-xs font-semibold tracking-wide text-gray-600 uppercase">
                                Opening invoice preview...
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ViewInvoicePage;
