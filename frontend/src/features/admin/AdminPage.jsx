import React from 'react';

const AdminPage = () => {
    return (
        <div className="pt-[100px] px-[30px] w-full h-full flex flex-col bg-[#f8f9fa] min-h-screen">
            <h1 className="text-2xl font-semibold mb-4 text-[#202020]">Admin</h1>
            <div className="bg-white rounded-lg shadow-sm w-full p-6 text-gray-600 border border-gray-100 min-h-[400px]">
                <p>Welcome to the System Administration page.</p>
                <p className="mt-2 text-sm text-gray-400">Main functionality will be integrated here later.</p>
            </div>
        </div>
    );
};

export default AdminPage;
