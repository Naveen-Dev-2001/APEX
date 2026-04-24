import { useState, useEffect, useRef, useCallback } from "react";
import { pdfjs } from "react-pdf";

// Specific Worker for PDF.js direct rendering
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export const usePdfRenderer = (pdfBlob) => {
    // Refs
    const viewerRef = useRef(null);
    const canvasRef = useRef(null);
    const renderTaskRef = useRef(null);
    const renderSeqRef = useRef(0);
    const pageCacheRef = useRef(new Map());
    const objectUrlRef = useRef(null);
    const resizeTimerRef = useRef(null);
    const rafMeasureRef = useRef(null);
    const initializedRef = useRef(false);
    const firstAutoFitDoneRef = useRef(false);

    // State
    const [pdfObj, setPdfObj] = useState(null);
    const [page, setPage] = useState(1);
    const [scale, setScale] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [autoFit, setAutoFit] = useState(true);
    const [containerWidth, setContainerWidth] = useState(0);
    const [isRendering, setIsRendering] = useState(false);

    /* ---------------- Helper: Coordinate transformations ---------------- */
    const getEffectiveRotation = useCallback((pageObj, rot = rotation) =>
        ((rot + (pageObj.rotate || 0)) % 360 + 360) % 360, [rotation]);

    const getViewport = useCallback((pageObj, scaleVal, rot = rotation) =>
        pageObj.getViewport({
            scale: scaleVal,
            rotation: getEffectiveRotation(pageObj, rot)
        }), [getEffectiveRotation, rotation]);

    const getPageCached = useCallback(async (pdf, pageNum) => {
        if (!pdf || !pageNum) return null;
        const cacheKey = `${pageNum}`;
        if (pageCacheRef.current.has(cacheKey)) {
            return pageCacheRef.current.get(cacheKey);
        }
        const pageObj = await pdf.getPage(pageNum);
        pageCacheRef.current.set(cacheKey, pageObj);
        return pageObj;
    }, []);

    /* ---------------- CORE: Render Page to Canvas ---------------- */
    const renderPage = useCallback(async (pdf, pageNum, scaleVal, rotationVal = rotation, onRenderComplete) => {
        if (!pdf || !canvasRef.current) return;
        const renderSeq = ++renderSeqRef.current;

        try {
            setIsRendering(true);
            const pageObj = await getPageCached(pdf, pageNum);
            if (!pageObj) return;
            const viewport = getViewport(pageObj, scaleVal, rotationVal);

            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d");
            const dpr = window.devicePixelRatio || 1;

            canvas.width = viewport.width * dpr;
            canvas.height = viewport.height * dpr;
            canvas.style.width = `${viewport.width}px`;
            canvas.style.height = `${viewport.height}px`;

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            if (renderTaskRef.current) {
                renderTaskRef.current.cancel();
            }

            renderTaskRef.current = pageObj.render({
                canvasContext: ctx,
                viewport
            });

            await renderTaskRef.current.promise;
            if (renderSeq !== renderSeqRef.current) return;
            
            if (onRenderComplete) {
                onRenderComplete(pageObj, viewport);
            }
        } catch (err) {
            if (err.name !== "RenderingCancelledException") {
                console.error("PDF Rendering Error:", err);
            }
        } finally {
            if (renderSeq === renderSeqRef.current) {
                setIsRendering(false);
            }
        }
    }, [getPageCached, getViewport, rotation]);

    /* ---------------- Logic: Auto-Fit Width ---------------- */
    const autoFitWidth = useCallback(async (pdf, pageNum, rotationVal = rotation) => {
        if (!pdf || !viewerRef.current) return;

        try {
            const pageObj = await getPageCached(pdf, pageNum);
            if (!pageObj) return;
            const viewport = getViewport(pageObj, 1, rotationVal);

            const width = viewerRef.current.clientWidth - 32;
            const newScale = width / viewport.width;

            setScale(newScale);
            await renderPage(pdf, pageNum, newScale, rotationVal);

            if (!firstAutoFitDoneRef.current) {
                firstAutoFitDoneRef.current = true;
                viewerRef.current.scrollTop = 0;
            }
        } catch (err) {
            console.error("AutoFit Error:", err);
        }
    }, [rotation, getPageCached, getViewport, renderPage]);

    /* ---------------- Measure Container (ResizeObserver) ---------------- */
    useEffect(() => {
        if (!viewerRef.current) return;

        const measureNow = () => {
            if (!viewerRef.current) return;
            const w = viewerRef.current.clientWidth;
            if (w > 0) {
                setContainerWidth((prev) => (Math.abs(prev - w) < 2 ? prev : w));
            }
        };

        const measure = () => {
            if (rafMeasureRef.current) {
                cancelAnimationFrame(rafMeasureRef.current);
            }
            rafMeasureRef.current = requestAnimationFrame(() => {
                clearTimeout(resizeTimerRef.current);
                resizeTimerRef.current = setTimeout(measureNow, 100);
            });
        };

        measureNow();
        const ro = new ResizeObserver(measure);
        ro.observe(viewerRef.current);

        return () => {
            ro.disconnect();
            clearTimeout(resizeTimerRef.current);
            if (rafMeasureRef.current) {
                cancelAnimationFrame(rafMeasureRef.current);
            }
        };
    }, []);

    /* ---------------- Lifecycle: Initial Load ---------------- */
    useEffect(() => {
        if (!pdfBlob || !containerWidth || initializedRef.current) {
            if (!pdfBlob) {
                setPdfObj(null);
                initializedRef.current = false;
                pageCacheRef.current.clear();
            }
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                if (!pdfBlob) return;
                initializedRef.current = true;
                firstAutoFitDoneRef.current = false;
                pageCacheRef.current.clear();
                renderSeqRef.current += 1;

                if (objectUrlRef.current) {
                    URL.revokeObjectURL(objectUrlRef.current);
                    objectUrlRef.current = null;
                }

                const url = URL.createObjectURL(pdfBlob);
                objectUrlRef.current = url;
                const pdf = await pdfjs.getDocument(url).promise;
                if (cancelled) return;

                setPdfObj(pdf);
                setPage(1);
                setRotation(0);
                setAutoFit(true);

                await autoFitWidth(pdf, 1, 0);
            } catch (err) {
                console.error("Failed to initialize PDF:", err);
                initializedRef.current = false;
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [pdfBlob, containerWidth, autoFitWidth]);

    useEffect(() => {
        const cachedPages = pageCacheRef.current;
        return () => {
            renderSeqRef.current += 1;
            if (renderTaskRef.current) {
                renderTaskRef.current.cancel();
            }
            if (objectUrlRef.current) {
                URL.revokeObjectURL(objectUrlRef.current);
                objectUrlRef.current = null;
            }
            cachedPages.clear();
        };
    }, []);

    /* ---------------- Lifecycle: Refit on Resize ---------------- */
    useEffect(() => {
        if (!pdfObj || !autoFit || !firstAutoFitDoneRef.current) return;
        autoFitWidth(pdfObj, page, rotation);
    }, [containerWidth, pdfObj, autoFit, page, rotation, autoFitWidth]);

    /* ---------------- Controls ---------------- */
    const changePage = useCallback((d) => {
        const next = page + d;
        if (!pdfObj || next < 1 || next > pdfObj.numPages) return;
        setPage(next);
        if (autoFit) {
            autoFitWidth(pdfObj, next, rotation);
        } else {
            renderPage(pdfObj, next, scale, rotation);
        }
    }, [page, pdfObj, autoFit, autoFitWidth, renderPage, rotation, scale]);

    const zoom = useCallback((d) => {
        setAutoFit(false);
        const s = Math.max(0.3, scale + d);
        setScale(s);
        renderPage(pdfObj, page, s, rotation);
    }, [page, pdfObj, renderPage, rotation, scale]);

    const rotate = useCallback((d) => {
        const r = (rotation + d + 360) % 360;
        setRotation(r);
        if (autoFit) {
            autoFitWidth(pdfObj, page, r);
        } else {
            renderPage(pdfObj, page, scale, r);
        }
    }, [page, pdfObj, autoFit, autoFitWidth, renderPage, rotation, scale]);

    const fitToPage = useCallback(async () => {
        if (!pdfObj || !viewerRef.current) return;
        const pageObj = await pdfObj.getPage(page);
        const viewport = getViewport(pageObj, 1, rotation);
        const h = viewerRef.current.clientHeight - 32;
        const s = h / viewport.height;
        setAutoFit(false);
        setScale(s);
        renderPage(pdfObj, page, s, rotation);
    }, [page, pdfObj, getViewport, renderPage, rotation]);

    const resetView = useCallback(() => {
        if (!pdfObj) return;
        setRotation(0);
        setAutoFit(true);
        autoFitWidth(pdfObj, page, 0);
    }, [page, pdfObj, autoFitWidth]);

    return {
        pdfObj,
        page,
        setPage,
        scale,
        rotation,
        autoFit,
        setAutoFit,
        isRendering,
        viewerRef,
        canvasRef,
        renderPage,
        autoFitWidth,
        changePage,
        zoom,
        rotate,
        fitToPage,
        resetView,
        getViewport,
        getPageCached
    };
};
