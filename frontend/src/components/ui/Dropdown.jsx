import React from 'react';
import { Select } from 'antd';

const Dropdown = ({ label, value, options, onChange, className = '', error = '', placeholder = 'Select an option', getPopupContainer, style = {} }) => {
    return (
        <div className={`flex flex-col gap-1.5 ${className}`}>
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
                className="h-[40px]"
                status={error ? 'error' : ''}
                size="large"
                style={{ borderRadius: '8px', width: '100%', ...style }}
                getPopupContainer={getPopupContainer ?? (triggerNode => triggerNode.parentNode)}
                styles={{
                    popup: {
                        root: { zIndex: 9999 }
                    }
                }}
            />
            {error && <span className="text-[11px] text-red-500 mt-0.5">{error}</span>}
        </div>
    );
};

export default Dropdown;
