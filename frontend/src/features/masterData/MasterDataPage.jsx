import React, { useState, useEffect } from 'react';
import { Search, Trash2, Upload, Plus, Pencil, Loader2, AlertCircle } from 'lucide-react';
import useMasterDataStore from '../../store/masterData.store';
import useToastStore from '../../store/useToastStore';
import toast from '../../utils/toast';
import DataTable from '../../components/ui/DataTable';
import EntityMasterModal from './EntityMasterModal';
import VendorMasterModal from './VendorMasterModal';
import TDSRatesModal from './TDSRatesModal';

const MasterDataPage = () => {
    const {
        activeTab, setActiveTab,
        searchQuery, setSearchQuery,
        currentPage, setCurrentPage,
        itemsPerPage, setItemsPerPage,
        masters, getFilteredData,
        fetchEntityMasterData, entityLoading, entityError, uploadEntityMaster,
        fetchVendorMasterData, vendorLoading, vendorError, uploadVendorMaster,
        fetchTDSRatesData, tdsLoading, tdsError, uploadTDSRatesData,
        clearMasterData,
        addEntityRow, updateEntityRow, deleteEntityRow,
        addVendorRow, updateVendorRow, deleteVendorRow,
        addTDSRateRow, updateTDSRateRow, deleteTDSRateRow,
    } = useMasterDataStore();
    const { showConfirm } = useToastStore();

    const [modalState, setModalState] = useState({ open: false, mode: 'add', rowData: null, rowIndex: null });

    const filteredData = getFilteredData();
    const currentMaster = masters[activeTab];
    const tabs = Object.keys(masters);
    const isEntityTab = activeTab === 'Entity Master';
    const isVendorTab = activeTab === 'Vendor Master';
    const isTDSTab = activeTab === 'TDS Rates';

    // Fetch data on mount or tab change
    useEffect(() => {
        if (isEntityTab) {
            fetchEntityMasterData();
        } else if (isVendorTab) {
            fetchVendorMasterData();
        } else if (isTDSTab) {
            fetchTDSRatesData();
        }
    }, [activeTab, fetchEntityMasterData, fetchVendorMasterData, fetchTDSRatesData, isEntityTab, isVendorTab, isTDSTab]);

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
            if (isEntityTab) {
                if (modalState.mode === 'edit') {
                    await updateEntityRow(formData, modalState.rowIndex);
                    toast.success('Entity updated successfully');
                } else {
                    await addEntityRow(formData);
                    toast.success('Entity added successfully');
                }
            } else if (isVendorTab) {
                if (modalState.mode === 'edit') {
                    await updateVendorRow(formData, modalState.rowIndex);
                    toast.success('Vendor updated successfully');
                } else {
                    await addVendorRow(formData);
                    toast.success('Vendor added successfully');
                }
            } else if (isTDSTab) {
                if (modalState.mode === 'edit') {
                    await updateTDSRateRow(formData, modalState.rowIndex);
                    toast.success('TDS Rate updated successfully');
                } else {
                    await addTDSRateRow(formData);
                    toast.success('TDS Rate added successfully');
                }
            }
            closeModal();
        } catch (err) {
            toast.error('Failed to save: ' + (err.response?.data?.detail || err.message));
        }
    };

    const handleDelete = (row, indexInPage) => {
        const itemName = row.entity_name || row.entityName || row.vendor_name || row.vendorName || 'this item';
        
        showConfirm({
            message: `Delete ${activeTab}?`,
            subMessage: `Are you sure you want to delete "${itemName}"? This action cannot be undone.`,
            confirmLabel: 'Delete',
            variant: 'danger',
            onConfirm: async () => {
                const loadingToast = toast.loading(`Deleting ${itemName}...`);
                try {
                    const masterData = masters[activeTab].data;
                    const realIndex = masterData.findIndex(r => r.id === row.id);
                    const absoluteIndex = (currentPage - 1) * itemsPerPage + indexInPage;
                    const indexToDelete = realIndex !== -1 ? realIndex : absoluteIndex;

                    if (isEntityTab) {
                        await deleteEntityRow(indexToDelete);
                    } else if (isVendorTab) {
                        await deleteVendorRow(indexToDelete);
                    } else if (isTDSTab) {
                        await deleteTDSRateRow(indexToDelete);
                    }
                    toast.dismiss(loadingToast);
                    toast.success(`${activeTab} deleted successfully`);
                } catch (err) {
                    toast.dismiss(loadingToast);
                    toast.error('Failed to delete: ' + (err.response?.data?.detail || err.message));
                }
            }
        });
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
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => (isEntityTab || isVendorTab || isTDSTab) && openEdit(row, index)}
                            className="text-gray-500 hover:text-gray-700 transition-colors p-1"
                            title="Edit"
                        >
                            <Pencil size={18} />
                        </button>
                        <button
                            onClick={() => (isEntityTab || isVendorTab || isTDSTab) && handleDelete(row, index)}
                            className="text-[#ff4d4f] hover:text-[#d32f2f] transition-colors p-1"
                            title="Delete"
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>
                ),
            };
        }
        return col;
    });
    
    // Vendor Upload View Component
    const VendorUploadView = () => {
        const [isDragging, setIsDragging] = useState(false);
        const fileInputRef = React.useRef(null);
        
        const handleDragOver = (e) => {
            e.preventDefault();
            setIsDragging(true);
        };
        
        const handleDragLeave = () => {
            setIsDragging(false);
        };
        
        const handleDrop = async (e) => {
            e.preventDefault();
            setIsDragging(false);
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                await onUpload(files[0]);
            }
        };
        
        const onUpload = async (file) => {
            try {
                await uploadVendorMaster(file);
                // Success - fetchVendorMasterData will be called by store
            } catch (err) {
                toast.error('Upload failed: ' + (err.response?.data?.detail || err.message));
            }
        };
        
        const handleFileSelect = async (e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
                await onUpload(files[0]);
            }
        };
        
        return (
            <div className="flex flex-col items-center justify-center p-12 h-full min-h-[400px]">
                <div 
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`w-full max-w-2xl border-2 border-dashed rounded-xl p-12 transition-all duration-200 flex flex-col items-center gap-6
                        ${isDragging 
                            ? 'border-[#24A1DD] bg-[#F0F9FF]' 
                            : 'border-gray-200 bg-[#FAFAFA] hover:border-[#24A1DD] hover:bg-white'}`}
                >
                    <div className="w-20 h-20 rounded-full bg-[#EBF8FE] flex items-center justify-center">
                        <Upload className="text-[#24A1DD]" size={36} />
                    </div>
                    
                    <div className="text-center">
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">Upload Vendor Master</h3>
                        <p className="text-gray-500 max-w-md mx-auto">
                            To start, please upload your Excel or CSV file containing vendor information. 
                            The system will automatically extract and process the data.
                        </p>
                    </div>
                    
                    <div className="flex flex-col items-center gap-3 w-full">
                        <input 
                            type="file" 
                            ref={fileInputRef}
                            onChange={handleFileSelect}
                            style={{ display: 'none' }}
                            accept=".xls,.xlsx,.csv"
                        />
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="bg-[#24A1DD] text-white px-8 py-3 rounded-lg font-semibold hover:bg-[#1D71AB] transition-all shadow-md flex items-center gap-2"
                        >
                            <Plus size={20} />
                            Select File
                        </button>
                        <span className="text-sm text-gray-400">Supported formats: .xls, .xlsx, .csv</span>
                    </div>
                </div>
                
                <div className="mt-8 flex items-center gap-8">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#24A1DD]" />
                        <span className="text-xs font-medium text-gray-400 tracking-wider uppercase">1. Upload</span>
                    </div>
                    <div className="w-8 h-px bg-gray-200" />
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-gray-200" />
                        <span className="text-xs font-medium text-gray-400 tracking-wider uppercase">2. Validate</span>
                    </div>
                    <div className="w-8 h-px bg-gray-200" />
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-gray-200" />
                        <span className="text-xs font-medium text-gray-400 tracking-wider uppercase">3. Activate</span>
                    </div>
                </div>
            </div>
        );
    };

    const reuploadInputRef = React.useRef(null);

    const handleClearTab = () => {
        showConfirm({
            message: `Clear ${activeTab}?`,
            subMessage: 'This will remove all data from this tab permanently. Are you sure?',
            confirmLabel: 'Clear All',
            variant: 'danger',
            onConfirm: async () => {
                const loadingToast = toast.loading(`Clearing ${activeTab}...`);
                try {
                    await clearMasterData(activeTab);
                    toast.dismiss(loadingToast);
                    toast.success(`${activeTab} cleared successfully`);
                } catch (err) {
                    toast.dismiss(loadingToast);
                    toast.error('Failed to clear: ' + (err.response?.data?.detail || err.message));
                }
            }
        });
    };

    const handleReuploadSelect = async (e) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            try {
                if (isEntityTab) {
                    await uploadEntityMaster(files[0]);
                    toast.success('Entity Master reuploaded successfully');
                } else if (isVendorTab) {
                    await uploadVendorMaster(files[0]);
                    toast.success('Vendor Master reuploaded successfully');
                } else if (isTDSTab) {
                    await uploadTDSRatesData(files[0]);
                    toast.success('TDS Rates reuploaded successfully');
                } else {
                    toast.info('Reupload not supported for this tab yet.');
                }
            } catch (err) {
                toast.error('Upload failed: ' + (err.response?.data?.detail || err.message));
            }
        }
    };

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

                {/* Hidden Input for Reupload */}
                <input 
                    type="file" 
                    ref={reuploadInputRef}
                    onChange={handleReuploadSelect}
                    style={{ display: 'none' }}
                    accept=".xls,.xlsx,.csv"
                />

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
                <button 
                    onClick={handleClearTab}
                    className="flex items-center gap-1.5 px-3 h-[36px] text-[13px] font-medium text-gray-700 border border-red-300 rounded-[4px] hover:bg-red-50 transition-all whitespace-nowrap"
                >
                    <Trash2 size={15} className="text-red-500" />
                    <span>Clear Tab</span>
                </button>
                <button 
                    onClick={() => reuploadInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 h-[36px] text-[13px] font-medium text-gray-700 border border-[#24A1DD] rounded-[4px] hover:bg-[#F0F9FF] transition-all whitespace-nowrap"
                >
                    <Upload size={15} className="text-[#24A1DD]" />
                    <span>Reupload</span>
                </button>
                <button
                    onClick={(isEntityTab || isVendorTab || isTDSTab) ? openAdd : undefined}
                    className="flex items-center gap-1.5 px-4 h-[36px] text-[13px] font-medium text-white bg-[#24A1DD] rounded-[4px] hover:bg-[#1D71AB] transition-all shadow-sm whitespace-nowrap"
                >
                    <Plus size={16} />
                    <span>Add New</span>
                </button>
            </div>

            {/* Table Area */}
            <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden relative min-h-[400px]">
                {(entityError && isEntityTab) || (vendorError && isVendorTab) || (tdsError && isTDSTab) ? (
                    <div className="absolute inset-0 z-10 bg-white flex items-center justify-center p-6 text-center">
                        <div className="flex flex-col items-center gap-4 max-w-md">
                            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                                <AlertCircle className="text-red-500" size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900">Failed to load data</h3>
                                <p className="text-sm text-gray-500 mt-1">{entityError || vendorError || tdsError}</p>
                            </div>
                            <button
                                onClick={() => {
                                    if (isEntityTab) fetchEntityMasterData();
                                    else if (isVendorTab) fetchVendorMasterData();
                                    else if (isTDSTab) fetchTDSRatesData();
                                }}
                                className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 transition-all"
                            >
                                Try Again
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        {isVendorTab && currentMaster?.data?.length === 0 && !vendorLoading ? (
                            <VendorUploadView />
                        ) : (
                            <DataTable
                                columns={columns}
                                data={filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)}
                                loading={isEntityTab ? entityLoading : isVendorTab ? vendorLoading : tdsLoading}
                                skeletonRows={itemsPerPage}
                                totalItems={filteredData.length}
                                currentPage={currentPage}
                                itemsPerPage={itemsPerPage}
                                onPageChange={setCurrentPage}
                                onItemsPerPageChange={setItemsPerPage}
                            />
                        )}
                    </>
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

            {/* Vendor Master Modal */}
            {modalState.open && isVendorTab && (
                <VendorMasterModal
                    mode={modalState.mode}
                    rowData={modalState.rowData}
                    onClose={closeModal}
                    onSave={handleSave}
                />
            )}

            {/* TDS Rates Modal */}
            {modalState.open && isTDSTab && (
                <TDSRatesModal
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
