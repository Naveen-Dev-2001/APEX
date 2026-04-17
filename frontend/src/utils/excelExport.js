import * as XLSX from "xlsx";

/**
 * Generic utility to export JSON data to Excel.
 * 
 * @param {Array} data - Array of objects to export.
 * @param {Array} columns - Column definitions. Each should have { header: string, accessor: string|function }.
 * @param {string} fileName - Name of the file to save.
 */
export const exportToExcel = (data, columns, fileName = "export.xlsx") => {
    if (!data || !data.length) {
        console.warn("No data to export");
        return;
    }

    // Helper to get nested value
    const getNestedValue = (obj, path) => {
        if (typeof path === 'function') return path(obj);
        return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined) ? acc[part] : undefined, obj);
    };

    // Filter out technical columns (Actions, Checkbox, etc.)
    const exportableColumns = columns.filter(col => {
        const header = (col.header || col.headerName || "").toLowerCase();
        return header && !header.includes("action") && !header.includes("checkbox") && !header.includes("s.no");
    });

    // Prepare data for Excel
    const excelData = data.map(row => {
        const formattedRow = {};
        exportableColumns.forEach(col => {
            const header = col.header || col.headerName;
            const accessor = col.accessor || col.field || col.valueGetter;
            
            let value = "";
            const getFilterValue = col.getFilterValue;
            const render = col.render;

            if (typeof getFilterValue === 'function') {
                value = getFilterValue(row) || "";
            } else if (typeof accessor === 'function') {
                try {
                    value = accessor({ data: row }) || "";
                } catch (e) {
                    value = row[col.field] || "";
                }
            } else if (typeof accessor === 'string') {
                value = getNestedValue(row, accessor);
            }

            // Fallback to render if value is still empty/undefined and render is a simple function
            if ((value === undefined || value === "" || value === "-") && typeof render === 'function') {
                try {
                    const rendered = render(value, row);
                    // If render returns a string or number, use it. If it returns JSX, it won't work well here.
                    if (typeof rendered === 'string' || typeof rendered === 'number') {
                        value = rendered;
                    }
                } catch (e) {
                    // Ignore render errors for excel export
                }
            }

            // Fallback to field if nothing else
            if (value === undefined || value === "" || value === "-") {
                value = row[col.field] || "";
            }

            // Deep extract if it's an object with a .value (common in this codebase)
            if (value && typeof value === 'object' && value.value !== undefined) {
                value = value.value;
            }

            formattedRow[header] = value;
        });
        return formattedRow;
    });

    // Create workbook and worksheet
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

    // Fix column widths (optional but nice)
    const maxWidths = {};
    excelData.forEach(row => {
        Object.keys(row).forEach(key => {
            const val = String(row[key] || "");
            maxWidths[key] = Math.max(maxWidths[key] || 10, val.length + 2);
        });
    });
    worksheet["!cols"] = Object.keys(maxWidths).map(key => ({ wch: maxWidths[key] }));

    // Export the file
    XLSX.writeFile(workbook, fileName);
};
