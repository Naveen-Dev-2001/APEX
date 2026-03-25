import React from 'react';
import { Search, Trash2, Upload, Plus, Pencil } from 'lucide-react';
import useMasterDataStore from '../../store/masterData.store';
import DataTable from '../../components/ui/DataTable';

const MasterDataPage = () => {
    const {
        activeTab, setActiveTab,
        searchQuery, setSearchQuery,
        currentPage, setCurrentPage,
        itemsPerPage, setItemsPerPage,
        masters, getFilteredData
    } = useMasterDataStore();

    const filteredData = getFilteredData();
    const currentMaster = masters[activeTab];
    const tabs = Object.keys(masters);

    // Prepare columns for DataTable
    const columns = (currentMaster?.columns || []).map(col => {
        if (col.accessor === 'actions') {
            return {
                ...col,
                render: (_, row) => (
                    <div className="flex items-center gap-3">
                        <button className="text-gray-400 hover:text-blue-500 transition-colors">
                            <Pencil size={18} />
                        </button>
                        <button className="text-gray-400 hover:text-red-500 transition-colors">
                            <Trash2 size={18} />
                        </button>
                    </div>
                )
            };
        }
        return col;
    });

    return (
        <div className="p-6 flex flex-col gap-6 w-full bg-[#FBFBFB] min-h-screen">
            {/* Header */}
            <div className="flex items-center gap-3">
                <h1 className="text-[28px] font-semibold text-[#333333]">Master Data Management</h1>
                <span className="bg-[#E5E5E5] text-[#666666] px-2 py-0.5 rounded-full text-sm font-medium">
                    {filteredData.length}
                </span>
            </div>

            {/* Controls Row — tabs + actions on ONE line */}
            <div className="flex items-center gap-3 flex-wrap">

                {/* Tabs */}
                <div className="flex bg-white border border-gray-200 rounded-[4px] overflow-hidden h-[36px] flex-shrink-0">
                    {tabs.map((tab, index) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 h-full text-[13px] font-medium transition-all duration-150 whitespace-nowrap
                                ${index !== tabs.length - 1 ? 'border-r border-gray-200' : ''}
                                ${activeTab === tab
                                    ? 'bg-[#9AD4EF] text-[#333333]'
                                    : 'bg-white text-gray-500 hover:bg-gray-50'
                                }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* Spacer */}
                <div className="flex-1" />

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                    <input
                        type="text"
                        placeholder="Search"
                        className="pl-9 pr-4 h-[36px] w-[220px] border border-gray-200 rounded-[4px] text-[13px] outline-none focus:border-[#1D71AB] transition-all bg-white"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                {/* Action Buttons */}
                <button className="flex items-center gap-1.5 px-3 h-[36px] text-[13px] font-medium text-gray-700 border border-red-300 rounded-[4px] hover:bg-red-50 transition-all whitespace-nowrap">
                    <Trash2 size={15} className="text-red-500" />
                    <span>Clear Tab</span>
                </button>
                <button className="flex items-center gap-1.5 px-3 h-[36px] text-[13px] font-medium text-gray-700 border border-[#24A1DD] rounded-[4px] hover:bg-[#F0F9FF] transition-all whitespace-nowrap">
                    <Upload size={15} className="text-[#24A1DD]" />
                    <span>Reupload</span>
                </button>
                <button className="flex items-center gap-1.5 px-4 h-[36px] text-[13px] font-medium text-white bg-[#24A1DD] rounded-[4px] hover:bg-[#1D71AB] transition-all shadow-sm whitespace-nowrap">
                    <Plus size={16} />
                    <span>Add New</span>
                </button>
            </div>

            {/* Table Area */}
            <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                <DataTable
                    columns={columns}
                    data={filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)}
                    totalItems={filteredData.length}
                    currentPage={currentPage}
                    itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage}
                    onItemsPerPageChange={setItemsPerPage}
                />
            </div>
        </div>
    );
};

export default MasterDataPage;

