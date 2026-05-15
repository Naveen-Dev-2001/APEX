import { useState, useEffect, useRef, useCallback } from "react";
import { pdfjs } from "react-pdf";

// Use CDN worker since pdfjs-dist is not hoisted in node_modules
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
            } catch (err) {
                console.error("Failed to initialize PDF:", err);
                initializedRef.current = false;
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [pdfBlob, containerWidth]);

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

    /* ---------------- Lifecycle: Centralized Render Trigger ---------------- */
    useEffect(() => {
        if (!pdfObj) return;

        let cancelled = false;

        const doRender = async () => {
            try {
                let currentScale = scale;

                if (autoFit && viewerRef.current) {
                    const pageObj = await getPageCached(pdfObj, page);
                    if (!pageObj || cancelled) return;
                    
                    const viewport = getViewport(pageObj, 1, rotation);
                    const width = viewerRef.current.clientWidth - 32;
                    currentScale = width / viewport.width;

                    if (Math.abs(scale - currentScale) > 0.001) {
                        setScale(currentScale);
                        // Changing scale triggers a re-render and re-runs this effect
                        return;
                    }
                }

                await renderPage(pdfObj, page, currentScale, rotation);

                if (!firstAutoFitDoneRef.current && autoFit) {
                    firstAutoFitDoneRef.current = true;
                    if (viewerRef.current) viewerRef.current.scrollTop = 0;
                }
            } catch (err) {
                if (err.name !== "RenderingCancelledException") {
                    console.error("Render trigger error:", err);
                }
            }
        };

        doRender();

        return () => {
            cancelled = true;
        };
    }, [pdfObj, page, scale, rotation, autoFit, containerWidth, getViewport, getPageCached, renderPage]);

    /* ---------------- Controls ---------------- */
    const changePage = useCallback((d) => {
        const next = page + d;
        if (!pdfObj || next < 1 || next > pdfObj.numPages) return;
        setPage(next);
    }, [page, pdfObj]);

    const zoom = useCallback((d) => {
        setAutoFit(false);
        setScale(s => Math.max(0.3, s + d));
    }, []);

    const rotate = useCallback((d) => {
        setRotation(r => (r + d + 360) % 360);
    }, []);

    const fitToPage = useCallback(async () => {
        if (!pdfObj || !viewerRef.current) return;
        const pageObj = await pdfObj.getPage(page);
        const viewport = getViewport(pageObj, 1, rotation);
        const h = viewerRef.current.clientHeight - 32;
        const s = h / viewport.height;
        setAutoFit(false);
        setScale(s);
    }, [page, pdfObj, getViewport, rotation]);

    const resetView = useCallback(() => {
        if (!pdfObj) return;
        setRotation(0);
        setAutoFit(true);
    }, [pdfObj]);

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
        changePage,
        zoom,
        rotate,
        fitToPage,
        resetView,
        getViewport,
        getPageCached
    };
};
