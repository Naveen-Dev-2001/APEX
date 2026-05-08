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
/**
 * Formats a date string into IST format: MM/DD/YYYY, HH:MM AM/PM IST
 * Example: 05/08/2026, 01:15 PM IST
 * 
 * @param {string} dateString - The ISO date string or date object
 * @returns {string} - The formatted IST string
 */
export const formatIST = (dateString) => {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "-";

    const options = {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    };

    // Use en-US to get MM/DD/YYYY as requested in user's example "05/08/2026" for May 8th
    const formatted = new Intl.DateTimeFormat('en-US', options).format(date);
    
    // formatted is like "05/08/2026, 01:15 PM"
    return `${formatted} IST`;
};
