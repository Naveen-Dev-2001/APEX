import { useState, useCallback, useEffect } from "react";
import Split from "react-split";
import InvoiceTopBar from "./InvoiceTopBar";
import InvoicePdfViewer from "./InvoicePdfViewer";
import InvoiceRightPanel from "./InvoiceRightPanel";

const ViewInvoicePage = () => {
    const [sizes, setSizes] = useState([45, 55]);

    const togglePdf = useCallback(() => {
        setSizes(prev => (prev[0] <= 10 ? [45, 55] : [0, 100]));
    }, []);

    return (
        <div className="h-screen flex flex-col bg-[#F7F7F7]">

            {/* Fixed Top Bar */}
            <div className="flex-shrink-0 bg-white border-b border-[#E0E0E0]">
                <InvoiceTopBar isPdfVisible={sizes[0] > 10} onTogglePdf={togglePdf} />
            </div>

            {/* Split Layout - takes remaining space */}
            <div className="flex-1 min-h-0 mb-12">
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
                    <div className="flex flex-col overflow-hidden bg-white border-l border-[#E0E0E0]">
                        <div className="flex-1 min-h-0 p-4">
                            <InvoiceRightPanel />
                        </div>
                    </div>
                </Split>
            </div>
        </div>
    );
};

export default ViewInvoicePage;