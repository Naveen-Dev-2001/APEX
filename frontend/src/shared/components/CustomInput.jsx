import React, { memo } from "react";

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
    ...props
}) => {
    return (
        <div className="w-full mb-4">
            {label && (
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                    {required && <span className="text-red-500 mr-1">*</span>}
                    {label}
                </label>
            )}
            <div className="relative">
                {icon && (
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                        {icon}
                    </div>
                )}
                <input
                    type={type}
                    value={value}
                    onChange={onChange}
                    onBlur={onBlur}
                    placeholder={placeholder}
                    className={`
                        w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors
                        ${icon ? "pl-10" : ""}
                        ${rightIcon ? "pr-10" : ""}
                        ${error ? "border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500" : "border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"}
                    `}
                    {...props}
                />
                {rightIcon && (
                    <button
                        type="button"
                        onClick={onRightIconClick}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                    >
                        {rightIcon}
                    </button>
                )}
            </div>
            {error && (
                <p className="mt-1 text-xs text-red-500">{error}</p>
            )}
        </div>
    );
});

CustomInput.displayName = "CustomInput";

export default CustomInput;
