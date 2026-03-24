import React from 'react';
import { Select } from 'antd';

const Dropdown = ({ label, value, options, onChange, className = '', error = '', placeholder = 'Select an option', getPopupContainer }) => {
    return (
        <div className={`flex flex-col gap-1.5 w-full ${className}`}>
            {label && (
                <label className="text-[13px] font-medium text-gray-700">
                    {label}
                </label>
            )}
            <Select
                value={value}
                onChange={onChange}
                options={options}
                placeholder={placeholder}
                className="w-full h-[40px]"
                status={error ? 'error' : ''}
                size="large"
                style={{ width: '100%', borderRadius: '8px' }}
                getPopupContainer={getPopupContainer ?? (triggerNode => triggerNode.parentNode)}
                dropdownStyle={{ zIndex: 9999 }}
                popupStyle={{ zIndex: 9999 }}
            />
            {error && <span className="text-[11px] text-red-500 mt-0.5">{error}</span>}
        </div>
    );
};

export default Dropdown;
