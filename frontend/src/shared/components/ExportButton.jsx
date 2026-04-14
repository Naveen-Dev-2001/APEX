import React, { useState } from 'react';
import { DownloadOutlined } from '@ant-design/icons';
import CustomButton from './CustomButton';
import { exportToExcel } from '../../utils/excelExport';
import toast from '../../utils/toast';

/**
 * Reusable Export Button component.
 * 
 * @param {Array} data - The data to export.
 * @param {Array} columns - Table column definitions.
 * @param {string} fileName - Name of the file.
 * @param {string} className - Optional styling.
 * @param {string} variant - Button variant (primary, outline, etc).
 */
const ExportButton = ({ 
    data, 
    columns, 
    fileName = "export.xlsx", 
    className = "", 
    variant = "primary",
    label = "Export" 
}) => {
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async () => {
        if (!data || data.length === 0) {
            toast.error("No data available to export.");
            return;
        }

        setIsExporting(true);
        try {
            // Small timeout to allow UI to show loading state if data is large
            setTimeout(() => {
                exportToExcel(data, columns, fileName);
                setIsExporting(false);
                toast.success(`Exported ${data.length} records successfully!`);
            }, 100);
        } catch (error) {
            console.error("Export error:", error);
            toast.error("An error occurred during export.");
            setIsExporting(false);
        }
    };

    return (
        <CustomButton
            variant={variant}
            onClick={handleExport}
            disabled={isExporting}
            className={`${className}`}
            loading={isExporting}
        >
            <div className="flex items-center gap-2">
                {!isExporting && <DownloadOutlined />}
                {label}
            </div>
        </CustomButton>
    );
};

export default ExportButton;
