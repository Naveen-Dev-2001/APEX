import { useRef } from "react";

const PdfHighlightOverlay = ({ 
    activeHighlights, 
    highlightRef, 
    canvasWidth, 
    canvasHeight,
    highlightedField 
}) => {
    return (
        <div 
            ref={highlightRef} 
            className="absolute top-0 left-0 pointer-events-none z-[100]"
            style={{ 
                width: canvasWidth || "100%",
                height: canvasHeight || "100%" 
            }}
        >
            {activeHighlights.map((box, idx) => (
                <div
                    key={`${highlightedField}-${idx}`}
                    style={{
                        position: "absolute",
                        left: `${box.left}px`,
                        top: `${box.top}px`,
                        width: `${box.width}px`,
                        height: `${box.height}px`,
                        backgroundColor: "rgba(255, 215, 0, 0.25)",
                        border: "2px solid rgba(255, 165, 0, 0.9)",
                        borderRadius: "2px",
                        pointerEvents: "none",
                        zIndex: 100
                    }}
                />
            ))}
        </div>
    );
};

export default PdfHighlightOverlay;
