import React from 'react';
import { Select } from 'antd';

const Dropdown = ({
    label,
    value,
    options,
    onChange,
    className = '',
    error = '',
    required = false,
    placeholder = 'Select',
    getPopupContainer,
    style = {},
    mode,
    filterOption,
    onSearch,
    loading,
    onClear,
    searchValue,
    disabled
}) => {
    return (
        <div className={`flex flex-col gap-1.5 ${className}`}>

            {label && (
                <label className="text-sm font-medium text-gray-700 flex items-center">
                    {required && <span className="text-red-500 mr-1">*</span>}
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
                size="large"
                status={error ? 'error' : ''}
                loading={loading}
                onSearch={onSearch}
                onClear={onClear}
                searchValue={searchValue}
                disabled={disabled}
                allowClear
                className={`${mode ? 'min-h-[40px]' : 'h-[40px]'}`}
                style={{
                    borderRadius: '8px',
                    width: '100%',
                    fontSize: '13px',
                    ...style
                }}
                optionFilterProp="label"
                filterOption={onSearch ? false : filterOption}
                getPopupContainer={getPopupContainer ?? (node => node.parentNode)}
                styles={{
                    popup: { root: { zIndex: 9999 } }
                }}
            />

            {error && (
                <span className="text-xs text-red-500">{error}</span>
            )}
        </div>
    );
};

export default Dropdown;