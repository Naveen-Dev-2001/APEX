import React, { useState } from 'react';
import { CustomDatePicker } from '../components/ui';

const TestDatePicker = () => {
    const [date, setDate] = useState(null);

    const handleDateChange = (date, dateString) => {
        console.log('Selected Date:', date);
        console.log('Date String:', dateString);
        setDate(date);
    };

    return (
        <div style={{ padding: '50px' }}>
            <h1>Custom Date Picker Test</h1>
            <div style={{ width: '300px' }}>
                <CustomDatePicker 
                    onChange={handleDateChange} 
                    value={date} 
                    placeholder="Pick a date"
                />
            </div>
            {date && (
                <p style={{ marginTop: '20px' }}>
                    Selected Date: {date.format('DD-MM-YYYY')}
                </p>
            )}
        </div>
    );
};

export default TestDatePicker;
