import React, { useState, useEffect } from 'react';
import { Search, Trash2, Upload, Plus, Pencil, Loader2, AlertCircle } from 'lucide-react';
import useMasterDataStore from '../../store/masterData.store';
import DataTable from '../../components/ui/DataTable';
import EntityMasterModal from './EntityMasterModal';

const MasterDataPage = () => {
    const {
        activeTab, setActiveTab,
        searchQuery, setSearchQuery,
        currentPage, setCurrentPage,
        itemsPerPage, setItemsPerPage,
        masters, getFilteredData,
        fetchEntityMasterData, entityLoading, entityError,
        addEntityRow, updateEntityRow, deleteEntityRow,
    } = useMasterDataStore();

    const [modalState, setModalState] = useState({ open: false, mode: 'add', rowData: null, rowIndex: null });

    const filteredData = getFilteredData();
    const currentMaster = masters[activeTab];
    const tabs = Object.keys(masters);
    const isEntityTab = activeTab === 'Entity Master';

    // Fetch data on mount or tab change
    useEffect(() => {
        if (isEntityTab) {
            fetchEntityMasterData();
        }
    }, [activeTab, fetchEntityMasterData, isEntityTab]);

    // Open modal helpers
    const openAdd = () => setModalState({ open: true, mode: 'add', rowData: null, rowIndex: null });
    
    const openEdit = (row, indexInPage) => {
        const absoluteIndex = (currentPage - 1) * itemsPerPage + indexInPage;
        // If sorting or filtering is active, absolute index might be tricky.
        // Best to find index in the original data array for the current master
        const masterData = masters[activeTab].data;
        const realIndex = masterData.findIndex(r => r.id === row.id);
        
        setModalState({ 
            open: true, 
            mode: 'edit', 
            rowData: row, 
            rowIndex: realIndex !== -1 ? realIndex : absoluteIndex 
        });
    };

    const closeModal = () => setModalState({ open: false, mode: 'add', rowData: null, rowIndex: null });

    const handleSave = async (formData) => {
        try {
            if (modalState.mode === 'edit') {
                await updateEntityRow(formData, modalState.rowIndex);
            } else {
                await addEntityRow(formData);
            }
            closeModal();
        } catch (err) {
            alert('Failed to save: ' + (err.response?.data?.detail || err.message));
        }
    };

    const handleDelete = async (row, indexInPage) => {
        if (window.confirm(`Are you sure you want to delete entity "${row.entity_name || row.entityName}"?`)) {
            try {
                const masterData = masters[activeTab].data;
                const realIndex = masterData.findIndex(r => r.id === row.id);
                const absoluteIndex = (currentPage - 1) * itemsPerPage + indexInPage;
                
                await deleteEntityRow(realIndex !== -1 ? realIndex : absoluteIndex);
            } catch (err) {
                alert('Failed to delete: ' + (err.response?.data?.detail || err.message));
            }
        }
    };

    // Prepare columns for DataTable
    const columns = (currentMaster?.columns || []).map((col) => {
        if (col.accessor === 'gst_applicable') {
            return {
                ...col,
                render: (val) => (
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium
                        ${val ? 'bg-blue-50 text-blue-600' : 'bg-gray-50 text-gray-500'}`}>
                        {val ? 'Yes' : 'No'}
                    </span>
                )
            };
        }
        if (col.accessor === 'actions') {
            return {
                ...col,
                render: (_, row, index) => (
                    <div className="flex items-center gap-3">
                        <button
                            title="Edit"
                            onClick={() => isEntityTab && openEdit(row, index)}
                            className="text-gray-400 hover:text-blue-500 transition-colors"
                        >
                            <Pencil size={18} />
                        </button>
                        <button
                            title="Delete"
                            onClick={() => isEntityTab && handleDelete(row, index)}
                            className="text-gray-400 hover:text-red-500 transition-colors"
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>
                ),
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

            {/* Controls Row */}
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

                {/* Actions */}
                <button className="flex items-center gap-1.5 px-3 h-[36px] text-[13px] font-medium text-gray-700 border border-red-300 rounded-[4px] hover:bg-red-50 transition-all whitespace-nowrap">
                    <Trash2 size={15} className="text-red-500" />
                    <span>Clear Tab</span>
                </button>
                <button className="flex items-center gap-1.5 px-3 h-[36px] text-[13px] font-medium text-gray-700 border border-[#24A1DD] rounded-[4px] hover:bg-[#F0F9FF] transition-all whitespace-nowrap">
                    <Upload size={15} className="text-[#24A1DD]" />
                    <span>Reupload</span>
                </button>
                <button
                    onClick={isEntityTab ? openAdd : undefined}
                    className="flex items-center gap-1.5 px-4 h-[36px] text-[13px] font-medium text-white bg-[#24A1DD] rounded-[4px] hover:bg-[#1D71AB] transition-all shadow-sm whitespace-nowrap"
                >
                    <Plus size={16} />
                    <span>Add New</span>
                </button>
            </div>

            {/* Table Area */}
            <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden relative min-h-[400px]">
                {entityLoading && isEntityTab ? (
                    <div className="absolute inset-0 z-10 bg-white/60 flex items-center justify-center backdrop-blur-[1px]">
                        <div className="flex flex-col items-center gap-3">
                            <Loader2 className="w-8 h-8 text-[#1D71AB] animate-spin" />
                            <span className="text-sm font-medium text-gray-500">Loading master data...</span>
                        </div>
                    </div>
                ) : null}

                {entityError && isEntityTab ? (
                    <div className="absolute inset-0 z-10 bg-white flex items-center justify-center p-6 text-center">
                        <div className="flex flex-col items-center gap-4 max-w-md">
                            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                                <AlertCircle className="text-red-500" size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900">Failed to load data</h3>
                                <p className="text-sm text-gray-500 mt-1">{entityError}</p>
                            </div>
                            <button
                                onClick={() => fetchEntityMasterData()}
                                className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 transition-all"
                            >
                                Try Again
                            </button>
                        </div>
                    </div>
                ) : (
                    <DataTable
                        columns={columns}
                        data={filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)}
                        totalItems={filteredData.length}
                        currentPage={currentPage}
                        itemsPerPage={itemsPerPage}
                        onPageChange={setCurrentPage}
                        onItemsPerPageChange={setItemsPerPage}
                    />
                )}
            </div>

            {/* Entity Master Modal */}
            {modalState.open && isEntityTab && (
                <EntityMasterModal
                    mode={modalState.mode}
                    rowData={modalState.rowData}
                    onClose={closeModal}
                    onSave={handleSave}
                />
            )}
        </div>
    );
};

export default MasterDataPage;
