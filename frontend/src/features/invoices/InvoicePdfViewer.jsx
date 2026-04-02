import { useInvoiceStore } from "../../store/invoice.store";
import { useInvoicePdf } from "../hooks/useInvoicePdf";
import { Spin } from "antd";

// Custom Hooks
import { usePdfRenderer } from "./hooks/usePdfRenderer";
import { usePdfHighlights } from "./hooks/usePdfHighlights";

// Components
import InvoicePdfToolbar from "./components/InvoicePdfToolbar";
import PdfHighlightOverlay from "./components/PdfHighlightOverlay";
import PdfPlaceholder from "./components/PdfPlaceholder";

const InvoicePdfViewer = () => {
    const { fileName, viewInvoiceId, highlightedField, activeInvoiceData } = useInvoiceStore();

    // Data Hooks
    const { data: pdfBlob, isLoading: isPdfLoading } = useInvoicePdf(viewInvoiceId);
    
    // PDF Rendering Hook
    const {
        pdfObj,
        page,
        setPage,
        rotation,
        autoFit,
        setAutoFit,
        isRendering,
        viewerRef,
        canvasRef,
        autoFitWidth,
        changePage,
        zoom,
        rotate,
        fitToPage,
        resetView,
        getViewport,
        renderPage,
        scale
    } = usePdfRenderer(pdfBlob);

    // PDF Highlights Hook
    const {
        activeHighlights,
        highlightRef
    } = usePdfHighlights({
        invoiceData: activeInvoiceData,
        highlightedField,
        page,
        scale,
        rotation,
        pdfObj,
        viewerRef,
        getViewport,
        setPage,
        autoFit,
        autoFitWidth,
        renderPage
    });

    return (
        <div className="flex flex-col h-full bg-[#EAECF0] rounded-xl shadow-inner border border-[#E1E6EB] overflow-hidden">
            {/* 🛠 Toolbar */}
            <InvoicePdfToolbar 
                fileName={fileName}
                page={page}
                numPages={pdfObj?.numPages}
                changePage={changePage}
                rotate={rotate}
                zoom={zoom}
                autoFit={autoFit}
                setAutoFit={setAutoFit}
                autoFitWidth={autoFitWidth}
                fitToPage={fitToPage}
                resetView={resetView}
                pdfObj={pdfObj}
                rotation={rotation}
            />

            {/*  Document Content Area */}
            <div
                ref={viewerRef}
                id="pdf-container"
                className="flex-1 overflow-auto p-4 flex justify-center items-start relative scrollbar-thin scrollbar-thumb-gray-400"
            >
                {(isPdfLoading || isRendering) && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#FDFDFD]/80 z-50 backdrop-blur-sm">
                        <Spin size="large" />
                        <span className="mt-4 text-[12px] font-bold text-[#101828] tracking-widest uppercase animate-pulse">
                            {isRendering ? "RENDERING PAGE..." : "FETCHING DOCUMENT..."}
                        </span>
                    </div>
                )}

                {pdfObj ? (
                    <div className="relative inline-block bg-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.15)] rounded-lg transition-all overflow-hidden">
                        <canvas ref={canvasRef} className="block" />
                        
                        {/* React-rendered highlights overlay */}
                        <PdfHighlightOverlay 
                            activeHighlights={activeHighlights}
                            highlightRef={highlightRef}
                            canvasWidth={canvasRef.current?.style?.width}
                            canvasHeight={canvasRef.current?.style?.height}
                            highlightedField={highlightedField}
                        />
                    </div>
                ) : (
                    <PdfPlaceholder isPdfLoading={isPdfLoading} />
                )}
            </div>
        </div>
    );
};

export default InvoicePdfViewer;