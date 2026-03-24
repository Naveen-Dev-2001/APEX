import React, { useEffect, useRef, useState } from "react";
import Plotly from "plotly.js-dist-min";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

const DonutChart = ({
    title = "Expense Breakdown",
    linkText = "",
    onLinkClick,
    labels = [],
    values = [40, 25, 15, 12, 8],
    colors = ["#2DD4BF", "#3B82F6", "#F5C518", "#E53935", "#A855F7"],
    hole = 0.6,
    centerText = "Total",
    centerValue = "100%",
}) => {
    const divRef = useRef(null);
    const scaleRef = useRef(1);
    const [scale, setScale] = useState(1);

    const MIN_SCALE = 0.5;
    const MAX_SCALE = 2;
    const STEP = 0.2;

    const getDomain = (s) => {
        const size = Math.min(0.9, 0.9 / s) * s; // grows with scale, capped
        const half = size / 2;
        return [Math.max(0, 0.5 - half), Math.min(1, 0.5 + half)];
    };

    useEffect(() => {
        const el = divRef.current;
        if (!el) return;

        Plotly.newPlot(
            el,
            [{
                labels,
                values,
                type: "pie",
                hole,
                marker: { colors },
                textinfo: "none",
                hovertemplate: "<b>%{label}</b><br>%{value}<extra></extra>",
                domain: { x: getDomain(1), y: getDomain(1) },
            }],
            {
                margin: { t: 10, l: 10, r: 10, b: 10 },
                plot_bgcolor: "transparent",
                paper_bgcolor: "transparent",
                autosize: true,
                showlegend: true,
                legend: {
                    orientation: "v",
                    x: 1,
                    y: 0.5,
                    xanchor: "left",
                    yanchor: "middle",
                    font: { size: 12, color: "#555" },
                },
                annotations: [{
                    text: `<b>${centerValue}</b><br>${centerText}`,
                    x: 0.5,
                    y: 0.5,
                    font: { size: 14, color: "#222" },
                    showarrow: false,
                }],
            },
            { displayModeBar: false, responsive: true }
        );

        scaleRef.current = 1;
        setScale(1);

        return () => Plotly.purge(el);
    }, [labels, values, colors, hole, centerText, centerValue]);

    const applyScale = (newScale) => {
        const el = divRef.current;
        if (!el) return;
        const domain = getDomain(newScale);
        Plotly.restyle(el, { domain: [{ x: domain, y: domain }] });
        scaleRef.current = newScale;
        setScale(newScale);
    };

    const handleZoomIn = () => {
        const next = Math.min(MAX_SCALE, +(scaleRef.current + STEP).toFixed(2));
        applyScale(next);
    };

    const handleZoomOut = () => {
        const next = Math.max(MIN_SCALE, +(scaleRef.current - STEP).toFixed(2));
        applyScale(next);
    };

    const handleReset = () => applyScale(1);

    return (
        <div className="bg-white rounded-xl p-4 w-full shadow-sm">
            <div className="flex justify-between items-center mb-2">
                <span className="font-semibold text-gray-800 text-base">{title}</span>
                <div className="flex items-center gap-2">
                    {/* Zoom Controls */}
                    {/* <div className="flex items-center gap-1 border border-gray-200 rounded-lg p-1">
                        <button
                            onClick={handleZoomIn}
                            disabled={scale >= MAX_SCALE}
                            title="Zoom In"
                            className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <ZoomIn size={15} />
                        </button>
                        <div className="w-px h-4 bg-gray-200" />
                        <button
                            onClick={handleZoomOut}
                            disabled={scale <= MIN_SCALE}
                            title="Zoom Out"
                            className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <ZoomOut size={15} />
                        </button>
                        <div className="w-px h-4 bg-gray-200" />
                        <button
                            onClick={handleReset}
                            title="Reset View"
                            disabled={scale === 1}
                            className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <RotateCcw size={15} />
                        </button>
                    </div> */}

                    {linkText && (
                        <span
                            onClick={onLinkClick}
                            className="text-blue-600 text-sm cursor-pointer hover:underline"
                        >
                            {linkText}
                        </span>
                    )}
                </div>
            </div>
            <div className="w-full h-64">
                <div ref={divRef} className="w-full h-full" />
            </div>
        </div>
    );
};

export default DonutChart;