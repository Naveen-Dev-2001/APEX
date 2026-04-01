import React from "react";
import { DatePicker } from "antd";
import dayjs from "dayjs";

const CustomDatePicker = ({
    label,
    value,
    onChange,
    error,
    required = false,
    className = "mb-4 w-full",
}) => {

    return (
        <div className={className}>
            {label && (
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                    {required && <span className="text-red-500 mr-1">*</span>}
                    {label}
                </label>
            )}

            <DatePicker
                value={value ? dayjs(value) : null}
                format="MM-DD-YYYY"
                onChange={(date, dateString) => {
                    onChange(dateString);
                }}
                style={{ width: "100%", borderRadius: "8px", height: "40px" }}
                status={error ? "error" : ""}
                placement="bottomLeft"
                getPopupContainer={() => document.body}
                styles={{
                    popup: {
                        root: { zIndex: 1050 }
                    }
                }}
            />

            {error && (
                <p className="mt-1 text-xs text-red-500">{error}</p>
            )}
        </div>
    );
};

export default CustomDatePicker;