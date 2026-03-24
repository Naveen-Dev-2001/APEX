import React from 'react';
import { DatePicker } from 'antd';
import dayjs from 'dayjs';
import PropTypes from 'prop-types';

/**
 * CustomDatePicker component - A reusable wrapper around Ant Design's DatePicker.
 * 
 * @param {Object} props - Any props accepted by Ant Design's DatePicker
 * @returns {JSX.Element} The styled DatePicker component
 */
const CustomDatePicker = ({ 
  format = 'DD-MM-YYYY', 
  placeholder = 'Select Date',
  style = {},
  className = '',
  onChange,
  value,
  ...restProps 
}) => {
  // Convert value to dayjs object if it's a string or date object
  const dateValue = value ? dayjs(value) : null;

  const handleChange = (date, dateString) => {
    if (onChange) {
      onChange(date, dateString);
    }
  };

  return (
    <DatePicker
      format={format}
      placeholder={placeholder}
      className={`custom-datepicker ${className}`}
      size="large"
      style={{
        width: '100%',
        borderRadius: '8px',
        ...style
      }}
      value={dateValue}
      onChange={handleChange}
      {...restProps}
    />
  );
};

CustomDatePicker.propTypes = {
  format: PropTypes.string,
  placeholder: PropTypes.string,
  style: PropTypes.object,
  className: PropTypes.string,
  onChange: PropTypes.func,
  value: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.object,
    PropTypes.instanceOf(Date)
  ])
};

export default CustomDatePicker;
