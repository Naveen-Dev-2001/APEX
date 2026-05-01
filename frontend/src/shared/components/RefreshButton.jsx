import React from 'react';
import { RefreshCw } from 'lucide-react';
import CustomButton from './CustomButton';

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
        <CustomButton
            onClick={onClick}
            disabled={loading}
            title={title}
            className={`${className}`}
            variant="primary"
        >
            {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
                <RefreshCw size={16} />
            )}
            <span>{loading && text === "Refresh" ? "Refreshing..." : text}</span>
        </CustomButton>
    );
};

export default RefreshButton;
