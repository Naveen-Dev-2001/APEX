import React from 'react';

const DataTable = ({ 
  columns, 
  data, 
  totalItems, 
  itemsPerPageOptions = [15, 30, 50],
  onPageChange,
  onItemsPerPageChange,
  currentPage = 1,
  itemsPerPage = 15,
  sortColumn,
  sortDirection
}) => {
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);

    const handlePageClick = (page) => {
        if (page >= 1 && page <= totalPages && onPageChange) {
            onPageChange(page);
        }
    };

    const renderPaginationNumbers = () => {
        let pages = [];
        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            if (currentPage <= 4) {
                pages = [1, 2, 3, 4, 5, '...', totalPages - 1, totalPages];
            } else if (currentPage >= totalPages - 3) {
                pages = [1, 2, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
            } else {
                pages = [1, 2, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages - 1, totalPages];
            }
        }

        return pages.map((page, idx) => (
            <button
                key={idx}
                onClick={() => typeof page === 'number' ? handlePageClick(page) : null}
                className={`w-7 h-7 flex items-center justify-center rounded-md text-sm mx-0.5 
                    ${page === currentPage ? 'bg-[#24a0ed] text-white font-medium' : 'text-gray-500 hover:bg-gray-100'} 
                    ${typeof page !== 'number' ? 'cursor-default' : 'cursor-pointer'}`}
            >
                {page}
            </button>
        ));
    };

    return (
        <div className="w-full flex flex-col bg-white rounded-md border border-gray-200 overflow-hidden shadow-sm">
            <div className="w-full overflow-x-auto">
                <table className="w-full text-left text-[13px] text-gray-700">
                    <thead className="bg-[#1D71AB] text-white">
                        <tr>
                            {columns.map((col, idx) => {
                                const isSortedColumn = sortColumn === col.accessor;
                                return (
                                    <th 
                                        key={idx} 
                                        className={`px-5 py-3 font-medium whitespace-nowrap border-b border-gray-200 ${col.sortable ? 'cursor-pointer select-none hover:bg-[#1a669a]' : ''}`}
                                        onClick={() => col.sortable && col.onClick ? col.onClick() : null}
                                    >
                                        <div className="flex items-center gap-2">
                                            {col.header}
                                            {col.sortable && (
                                                <div className="flex flex-col text-[10px] leading-[6px] opacity-70">
                                                    <span className={isSortedColumn && sortDirection === 'asc' ? 'text-white font-bold opacity-100' : 'opacity-40'}>▲</span>
                                                    <span className={isSortedColumn && sortDirection === 'desc' ? 'text-white font-bold opacity-100' : 'opacity-40'}>▼</span>
                                                </div>
                                            )}
                                        </div>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {data.map((row, rowIdx) => (
                            <tr key={rowIdx} className="hover:bg-gray-50 transition-colors">
                                {columns.map((col, colIdx) => (
                                    <td key={colIdx} className="px-5 py-3.5 whitespace-nowrap border-r border-transparent last:border-none">
                                        {col.render ? col.render(row[col.accessor], row) : row[col.accessor] || '-'}
                                    </td>
                                ))}
                            </tr>
                        ))}
                        {data.length === 0 && (
                            <tr>
                                <td colSpan={columns.length} className="px-5 py-8 text-center text-gray-500">
                                    No data available
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 bg-white">
                <div className="flex items-center gap-4 text-[13px] text-gray-600">
                    <div className="flex items-center gap-2">
                        <span>Items per page:</span>
                        <select 
                            className="border border-gray-300 rounded px-2 py-1 bg-white outline-none focus:border-blue-500 cursor-pointer text-gray-700"
                            value={itemsPerPage}
                            onChange={(e) => onItemsPerPageChange && onItemsPerPageChange(Number(e.target.value))}
                        >
                            {itemsPerPageOptions.map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                    </div>
                    <span>{startItem} - {endItem} of {totalItems} items</span>
                </div>

                <div className="flex items-center gap-1">
                    {renderPaginationNumbers()}
                    <button 
                        onClick={() => handlePageClick(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed ml-2 font-bold"
                    >
                        &lt;
                    </button>
                    <button 
                        onClick={() => handlePageClick(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed font-bold"
                    >
                        &gt;
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DataTable;
