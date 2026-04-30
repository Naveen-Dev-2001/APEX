import React from 'react';
import { Search, X } from 'lucide-react';

const SearchInput = ({ 
    value, 
    onChange, 
    placeholder = "Search", 
    className = "",
    width = "220px",
    onClear
}) => {
    return (
        <div className={`relative flex items-center ${className}`} style={{ width }}>
            <Search 
                className="absolute left-3 text-gray-400 pointer-events-none" 
                size={16} 
            />
            <input
                type="text"
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                className="w-full h-[36px] pl-10 pr-10 border border-gray-200 rounded-[4px] text-[13px] outline-none focus:border-[#24A1DD] focus:ring-1 focus:ring-[#24A1DD]/20 transition-all bg-white placeholder:text-gray-400"
            />
            {value && onClear && (
                <button
                    onClick={onClear}
                    className="absolute right-3 text-gray-400 hover:text-gray-600 transition-colors"
                >
                    <X size={14} />
                </button>
            )}
        </div>
    );
};

export default SearchInput;
