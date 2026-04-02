import React from 'react';
import { Select } from 'antd';

const Dropdown = ({ label, value, options, onChange, className = '', error = '', placeholder = 'Select an option', getPopupContainer, style = {}, mode }) => {
    return (
        <div className={`flex flex-col gap-1.5 ${className}`}>
            {label && (
                <label className="text-[13px] font-medium text-gray-700">
                    {label}
                </label>
            )}
            <Select
                showSearch
                mode={mode}
                maxTagCount="responsive"
                value={value}
                onChange={onChange}
                options={options}
                placeholder={placeholder}
                className={`${mode ? 'min-h-[40px]' : 'h-[40px] shadow-sm'}`}
                status={error ? 'error' : ''}
                size="large"
                style={{ borderRadius: '8px', width: '100%', fontSize: '10px', ...style }}
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
