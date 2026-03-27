import { useState } from "react";
import { ZoomInOutlined, ZoomOutOutlined, FullscreenOutlined } from "@ant-design/icons";

const InvoicePdfViewer = ({ pdfUrl = "" }) => {
    const [zoom, setZoom] = useState(100);

    const handleZoomIn = () => setZoom((z) => Math.min(z + 10, 200));
    const handleZoomOut = () => setZoom((z) => Math.max(z - 10, 50));

    return (
        <div className="flex flex-col h-full">

            {/* PDF toolbar */}
            <div className="h-10 min-h-[40px] bg-[#F0F0F0] border-b border-[#E0E0E0] px-3 flex items-center justify-between">
                <span className="text-xs text-gray-500">invoice_document.pdf</span>
                <div className="flex items-center gap-1">
                    <button
                        onClick={handleZoomOut}
                        className="p-1 rounded hover:bg-gray-200 text-gray-500 text-xs transition-colors"
                    >
                        <ZoomOutOutlined />
                    </button>
                    <span className="text-xs text-gray-600 w-10 text-center">{zoom}%</span>
                    <button
                        onClick={handleZoomIn}
                        className="p-1 rounded hover:bg-gray-200 text-gray-500 text-xs transition-colors"
                    >
                        <ZoomInOutlined />
                    </button>
                    <div className="w-px h-4 bg-gray-300 mx-1" />
                    <button className="p-1 rounded hover:bg-gray-200 text-gray-500 text-xs transition-colors">
                        <FullscreenOutlined />
                    </button>
                </div>
            </div>

            {/* PDF Frame */}
            <div className="flex-1 overflow-auto flex items-start justify-center p-4">
                {pdfUrl ? (
                    <iframe
                        src={pdfUrl}
                        title="Invoice PDF"
                        className="rounded shadow"
                        style={{
                            width: `${zoom}%`,
                            minWidth: "400px",
                            height: "100%",
                            border: "none",
                        }}
                    />
                ) : (
                    // Empty state
                    <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                            <path d="M14 2H6C5 2 5 2 5 3V21C5 22 5 22 6 22H18C19 22 19 22 19 21V7L14 2Z"
                                stroke="#CBD5E1" strokeWidth="1.5" />
                            <path d="M14 2V7H19" stroke="#CBD5E1" strokeWidth="1.5" />
                        </svg>
                        <p className="text-sm">No PDF available</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default InvoicePdfViewer;