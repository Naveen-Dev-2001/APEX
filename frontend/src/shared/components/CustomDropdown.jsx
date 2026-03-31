import React from "react";
import { Select } from "antd";

const { Option } = Select;

const CustomDropdown = ({
    label,
    value,
    onChange,
    options = [],
    placeholder = "Select",
    error,
    required = false,
    className = "mb-4 w-full",
    showSearch = false,
    filterOption,
    ...props
}) => {
    return (
        <div className={className}>
            {label && (
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                    {required && <span className="text-red-500 mr-1">*</span>}
                    {label}
                </label>
            )}

            <Select
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                showSearch={showSearch}
                filterOption={filterOption}
                style={{ width: "100%" }}
                size="large"
                status={error ? "error" : ""}
                {...props}
            >
                {options.map((opt) => (
                    <Option key={opt.value} value={opt.value}>
                        {opt.label}
                    </Option>
                ))}
            </Select>

            {error && (
                <p className="mt-1 text-xs text-red-500">{error}</p>
            )}
        </div>
    );
};

export default CustomDropdown;