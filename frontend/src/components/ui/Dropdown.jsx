import React from 'react';

const Dropdown = ({ label, value, options, onChange, className = '', error = '' }) => {
    return (
        <div className={`flex flex-col gap-1.5 w-full ${className}`}>
            {label && (
                <label className="text-[13px] font-medium text-gray-700">
                    {label}
                </label>
            )}
            <div className="relative">
                <select
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className={`w-full h-[38px] px-3 bg-white border border-gray-300 rounded-[4px] text-[13px] text-gray-700 outline-none transition-all appearance-none cursor-pointer focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]/20 ${error ? 'border-red-500' : ''}`}
                >
                    {options.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                </div>
            </div>
            {error && <span className="text-[11px] text-red-500 mt-0.5">{error}</span>}
        </div>
    );
};

export default Dropdown;
