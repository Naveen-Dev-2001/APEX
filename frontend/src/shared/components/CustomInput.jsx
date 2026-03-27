import React, { memo } from "react";
import { Input } from "antd";

const CustomInput = memo(({
    label,
    type = "text",
    placeholder,
    value,
    onChange,
    onBlur,
    error,
    required = false,
    icon,
    rightIcon,
    onRightIconClick,
    className = "mb-4 w-full",
    ...props
}) => {
    const InputComponent = type === "password" ? Input.Password : Input;

    return (
        <div className={`${className}`}>
            {label && (
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                    {required && <span className="text-red-500 mr-1">*</span>}
                    {label}
                </label>
            )}
            <InputComponent
                type={type}
                value={value}
                onChange={onChange}
                onBlur={onBlur}
                placeholder={placeholder}
                prefix={icon}
                suffix={rightIcon && (
                    <div
                        onClick={onRightIconClick}
                        className="cursor-pointer text-gray-400 hover:text-gray-600 flex items-center"
                    >
                        {rightIcon}
                    </div>
                )}
                status={error ? "error" : ""}
                size="large"
                style={{ borderRadius: '8px' }}
                {...props}
            />
            {error && (
                <p className="mt-1 text-xs text-red-500">{error}</p>
            )}
        </div>
    );
});

CustomInput.displayName = "CustomInput";

export default CustomInput;
