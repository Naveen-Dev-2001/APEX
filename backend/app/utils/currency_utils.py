import re

def remove_currency_format(value):
    """
    Robustly removes currency symbols ($, ₹, €, £) and codes (USD, INR, EUR, GBP) 
    from a string and converts it to a float.
    
    Handles:
    - Commas and whitespace
    - Specific currency symbols: $, ₹, €, £
    - Currency codes (case-insensitive): USD, INR, EUR, GBP
    - Parentheses for negative numbers: (100.00) -> -100.00
    - Placeholder values: "N/A", "—"
    """
    if value is None or value == "" or value == "N/A" or value == "—":
        return None
        
    try:
        # Convert to string and strip whitespace
        s_val = str(value).strip()
        
        # Remove commas, currency symbols, and specified currency codes
        # The regex pattern matches symbols directly or specified codes
        clean_val = re.sub(r'[,$₹€£]|usd|inr|eur|gbp', '', s_val, flags=re.IGNORECASE).strip()
        
        if not clean_val:
            return None
            
        # Handle parentheses for negative numbers (common in accounting)
        if clean_val.startswith('(') and clean_val.endswith(')'):
            clean_val = '-' + clean_val[1:-1]
        
        # Final attempt to strip any remaining non-numeric characters except . and -
        # This acts as a safety net similar to the dashboard to_float function
        final_clean = re.sub(r'[^\d.-]', '', clean_val)
        
        if not final_clean:
            return None
            
        return float(final_clean)
    except (ValueError, TypeError):
        return None
