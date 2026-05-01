/**
 * Formats a number or string as a currency string with a dollar sign and two decimal places.
 * Example: 42.9 => "$ 42.90"
 * 
 * @param {number|string} value - The value to format
 * @returns {string} - The formatted currency string
 */
export const formatCurrency = (value) => {
    if (value === null || value === undefined || value === "") return "-";
    
    // If value is a string, remove currency codes (like USD) and other symbols except digits, dot, and minus
    let cleanValue = value;
    if (typeof value === "string") {
        cleanValue = value.replace(/[A-Z]{3}/g, '').replace(/[^\d.-]/g, '').trim();
    }
    
    const num = parseFloat(cleanValue);
    
    if (isNaN(num)) return value; // Return as is if we still can't parse it
    
    return `$ ${num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
};
