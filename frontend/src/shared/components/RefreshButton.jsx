import React from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * Standard Refresh Button used across the application.
 * Matches the base style requested by the user.
 * 
 * @param {Object} props
 * @param {Function} props.onClick - Function to call on click
 * @param {boolean} props.loading - Loading state to show spinner
 * @param {string} [props.title="Refresh data"] - Tooltip text
 * @param {string} [props.className=""] - Additional CSS classes
 * @param {string} [props.text="Refresh"] - Button text
 */
const RefreshButton = ({ 
    onClick, 
    loading, 
    title = "Refresh data", 
    className = "", 
    text = "Refresh" 
}) => {
    return (
        <button
            onClick={onClick}
            disabled={loading}
            title={title}
            className={`bg-[#24A1DD] hover:bg-[#1D71AB] text-white px-4 py-0 h-[34px] rounded-lg flex items-center justify-center gap-1.5 text-[13px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        >
            {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
                <RefreshCw size={16} />
            )}
            <span>{loading && text === "Refresh" ? "Refreshing..." : text}</span>
        </button>
    );
};

export default RefreshButton;
