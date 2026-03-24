import React from 'react';

const SettingsPage = () => {
    return (
        <div className="p-4 flex flex-col gap-4 w-full bg-gray-50 min-h-0">
            <h1 className="text-2xl font-semibold mb-2 text-[#333333]">Settings</h1>
            <div className="bg-white rounded-lg shadow-sm w-full p-6 text-gray-600 border border-gray-100 min-h-[400px]">
                <p>Welcome to the global Settings page.</p>
                <p className="mt-2 text-sm text-gray-400">Main functionality will be integrated here later.</p>
            </div>
        </div>
    );
};

export default SettingsPage;
