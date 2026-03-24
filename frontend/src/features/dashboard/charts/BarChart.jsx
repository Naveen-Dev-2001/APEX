import React, { useEffect, useRef, useState } from "react";
import Plotly from "plotly.js-dist-min";
import { ZoomIn, ZoomOut, RotateCcw, Move } from "lucide-react";

const BarChart = ({
    title = "Payables Aging",
    linkText = "",
    onLinkClick,
    x = [],
    y = [],
    colors = ["#2DD4BF", "#2DD4BF", "#F5C518", "#F5C518", "#E53935"],
    yMax,
    barWidth = 0.5,
    bargap = 0.4,
    unit = "",
    tickCount = 5,
}) => {
    const divRef = useRef(null);
    const [isPanMode, setIsPanMode] = useState(false);

    useEffect(() => {
        const el = divRef.current;
        if (!el) return;

        // ── Compute clean yMax ──────────────────────────────────────────
        const dataMax = y.length ? Math.max(...y) : 0;
        const computedYMax = (yMax ?? Math.ceil(dataMax * 1.2)) || 10;

        // ── Compute clean tick step (no overlapping) ────────────────────
        const rawStep = computedYMax / tickCount;
        const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep || 1)));
        const step = Math.ceil(rawStep / magnitude) * magnitude || 1;
        const tickVals = [];
        for (let v = 0; v <= computedYMax * 1.05; v += step) {
            tickVals.push(parseFloat(v.toFixed(10)));
        }

        // ── Bar colors: default teal/yellow/red gradient for aging ──────
        const barColors = colors.length === x.length
            ? colors
            : Array(x.length).fill(colors[0] || "#2DD4BF");

        Plotly.newPlot(
            el,
            [{
                x,
                y,
                type: "bar",
                marker: { color: barColors },
                width: barWidth,
            }],
            {
                margin: { t: 10, l: 65, r: 20, b: 70 },
                xaxis: {
                    showgrid: false,
                    tickfont: { size: 11, color: "#555" },
                    tickangle: x.length > 4 ? -30 : 0,
                    automargin: true,
                    fixedrange: false,
                },
                yaxis: {
                    showgrid: true,
                    gridcolor: "#f0f0f0",
                    tickvals: tickVals,
                    ticktext: tickVals.map(v =>
                        unit ? `${v}${unit}` : `${v}`
                    ),
                    range: [0, computedYMax],
                    automargin: true,
                    fixedrange: false,
                },
                plot_bgcolor: "transparent",
                paper_bgcolor: "transparent",
                autosize: true,
                bargap,
                dragmode: "zoom",
            },
            { displayModeBar: false, responsive: true }
        );

        return () => Plotly.purge(el);
    }, [x, y, colors, yMax, barWidth, bargap, unit, tickCount]);

    // ── Zoom handlers ───────────────────────────────────────────────────
    const handleZoomIn = () => {
        const el = divRef.current;
        if (!el) return;
        const { yaxis, xaxis } = el.layout;
        const yMid = (yaxis.range[0] + yaxis.range[1]) / 2;
        const ySpan = (yaxis.range[1] - yaxis.range[0]) * 0.35;
        const update = { "yaxis.range": [yMid - ySpan, yMid + ySpan] };
        if (xaxis?.range) {
            const xMid = (xaxis.range[0] + xaxis.range[1]) / 2;
            const xSpan = (xaxis.range[1] - xaxis.range[0]) * 0.35;
            update["xaxis.range"] = [xMid - xSpan, xMid + xSpan];
        }
        Plotly.relayout(el, update);
    };

    const handleZoomOut = () => {
        const el = divRef.current;
        if (!el) return;
        const { yaxis, xaxis } = el.layout;
        const yMid = (yaxis.range[0] + yaxis.range[1]) / 2;
        const ySpan = (yaxis.range[1] - yaxis.range[0]) * 0.65;
        const update = { "yaxis.range": [yMid - ySpan, yMid + ySpan] };
        if (xaxis?.range) {
            const xMid = (xaxis.range[0] + xaxis.range[1]) / 2;
            const xSpan = (xaxis.range[1] - xaxis.range[0]) * 0.65;
            update["xaxis.range"] = [xMid - xSpan, xMid + xSpan];
        }
        Plotly.relayout(el, update);
    };

    const handleReset = () => {
        const el = divRef.current;
        if (!el) return;
        const dataMax = y.length ? Math.max(...y) : 0;
        const computedYMax = (yMax ?? Math.ceil(dataMax * 1.2)) || 10;
        Plotly.relayout(el, {
            "xaxis.autorange": true,
            "yaxis.range": [0, computedYMax],
        });
    };

    const handleTogglePan = () => {
        const el = divRef.current;
        if (!el) return;
        const newMode = isPanMode ? "zoom" : "pan";
        Plotly.relayout(el, { dragmode: newMode });
        setIsPanMode(!isPanMode);
    };

    return (
        <div className="bg-white rounded-xl p-4 w-full shadow-sm">
            <div className="flex justify-between items-center mb-2">
                <span className="font-semibold text-gray-800 text-base">{title}</span>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 border border-gray-200 rounded-lg p-1">
                        <button onClick={handleZoomIn} title="Zoom In"
                            className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors">
                            <ZoomIn size={15} />
                        </button>
                        <div className="w-px h-4 bg-gray-200" />
                        <button onClick={handleZoomOut} title="Zoom Out"
                            className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors">
                            <ZoomOut size={15} />
                        </button>
                        <div className="w-px h-4 bg-gray-200" />
                        <button onClick={handleTogglePan} title={isPanMode ? "Switch to Zoom" : "Pan Mode"}
                            className={`p-1 rounded transition-colors ${isPanMode
                                ? "bg-teal-50 text-teal-600"
                                : "hover:bg-gray-100 text-gray-500 hover:text-gray-800"
                                }`}>
                            <Move size={15} />
                        </button>
                        <div className="w-px h-4 bg-gray-200" />
                        <button onClick={handleReset} title="Reset View"
                            className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors">
                            <RotateCcw size={15} />
                        </button>
                    </div>
                    {linkText && (
                        <span onClick={onLinkClick}
                            className="text-blue-600 text-sm cursor-pointer hover:underline">
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

export default BarChart;