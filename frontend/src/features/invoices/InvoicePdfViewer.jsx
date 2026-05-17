import { useInvoiceStore } from "../../store/invoice.store";
import { useInvoicePdf } from "../hooks/useInvoicePdf";
import { Spin } from "antd";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";

// Custom Hooks
import { usePdfRenderer } from "./hooks/usePdfRenderer";
import { usePdfHighlights } from "./hooks/usePdfHighlights";

// Components
import InvoicePdfToolbar from "./components/InvoicePdfToolbar";
import PdfHighlightOverlay from "./components/PdfHighlightOverlay";
import PdfPlaceholder from "./components/PdfPlaceholder";

const InvoicePdfViewer = () => {
    const { fileName, viewInvoiceId, highlightedField, activeInvoiceData } = useInvoiceStore();
    const queryClient = useQueryClient();
    const [canLoadPdf, setCanLoadPdf] = useState(false);

    // Reset when invoice changes
    useEffect(() => {
        setCanLoadPdf(false);
    }, [viewInvoiceId]);

    const isPreviewFetching = useIsFetching({ queryKey: ["invoice-preview", viewInvoiceId] });

    useEffect(() => {
        if (isPreviewFetching === 0) {
            const queries = queryClient.getQueryCache().findAll({ queryKey: ["invoice-preview", viewInvoiceId] });
            const isSettled = queries.length > 0 && queries.some(q => q.state.status === "success" || q.state.status === "error");
            if (isSettled) {
                setCanLoadPdf(true);
            }
        }
    }, [isPreviewFetching, viewInvoiceId, queryClient]);

    // Data Hooks
    const { data: pdfBlob, isLoading: isPdfLoading } = useInvoicePdf(viewInvoiceId, canLoadPdf);
    
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
        changePage,
        zoom,
        rotate,
        fitToPage,
        resetView,
        getViewport,
        getPageCached,
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
        getPageCached
    });

    return (
        <div className="flex flex-col h-full bg-[#EAECF0] shadow-inner border border-[#E1E6EB] overflow-hidden">
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
                fitToPage={fitToPage}
                resetView={resetView}
                pdfObj={pdfObj}
                rotation={rotation}
            />

            {/*  Document Content Area */}
            <div
                ref={viewerRef}
                id="pdf-container"
                className="flex-1 overflow-auto flex justify-center items-start relative scrollbar-thin scrollbar-thumb-gray-400"
            >
                {(!canLoadPdf || isPdfLoading || isRendering) && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#FDFDFD]/80 z-50 backdrop-blur-sm">
                        <Spin size="large" />
                        <span className="mt-4 text-[12px] font-bold text-[#101828] tracking-widest uppercase animate-pulse">
                            {!canLoadPdf ? "WAITING FOR DATA..." : isRendering ? "RENDERING PAGE..." : "FETCHING DOCUMENT..."}
                        </span>
                    </div>
                )}

                {pdfObj ? (
                    <div className="relative inline-block bg-white shadow-[0_25px_50px_-12px_rgba(0,0,0,0.15)] transition-all overflow-hidden">
                        <canvas ref={canvasRef} className="block" />
                        
                        {/* React-rendered highlights overlay */}
                        <PdfHighlightOverlay 
                            activeHighlights={activeHighlights}
                            highlightRef={highlightRef}
                            highlightedField={highlightedField}
                        />
                    </div>
                ) : (
                    <PdfPlaceholder isPdfLoading={isPdfLoading || !canLoadPdf} />
                )}
            </div>
        </div>
    );
};

export default InvoicePdfViewer;
