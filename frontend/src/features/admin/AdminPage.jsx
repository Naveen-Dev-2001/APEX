import React, { useEffect } from 'react';
import useAdminStore from '../../store/useAdminStore';
import DelegationsTab from './DelegationsTab';
import RefreshButton from '../../shared/components/RefreshButton';
import SearchInput from '../../shared/components/SearchInput';

const AdminPage = () => {
    const {
        searchQuery, setSearchQuery, setCurrentPage,
        loading, fetchDelegations
    } = useAdminStore();

    return (
        <div className="p-2 sm:p-4 flex flex-col gap-4 sm:gap-5 w-full bg-gray-50 min-h-0">
            <div className="w-full px-2 py-4 flex flex-col relative text-left">
                <div className="flex flex-col sm:flex-row justify-between items-center mb-5 gap-3">
                    <div className="flex border border-gray-200 rounded-md overflow-x-auto h-[36px] w-full sm:w-auto no-scrollbar">
                        <button
                            className="px-5 py-0 text-[13px] font-bold transition-colors border-r border-gray-200 last:border-r-0 h-full flex items-center justify-center whitespace-nowrap bg-[#BAE7FF] text-black"
                        >
                            Delegations
                        </button>
                    </div>

                    <div className="flex flex-row items-center gap-3 w-full sm:w-auto">
                        <SearchInput
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setCurrentPage(1);
                            }}
                            onClear={() => {
                                setSearchQuery('');
                                setCurrentPage(1);
                            }}
                            width="260px"
                        />
                        <RefreshButton
                            onClick={() => {
                                fetchDelegations();
                            }}
                            loading={loading}
                            height="h-[36px]"
                            className="!w-auto !min-w-[110px] !text-[13px] !font-medium"
                        />
                    </div>
                </div>

                <div className="w-full">
                    <DelegationsTab />
                </div>
            </div>
        </div>
    );
};

export default AdminPage;
