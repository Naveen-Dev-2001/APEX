import React from 'react';
import Skeleton from './Skeleton';

const TableSkeleton = ({ rowCount = 8, columnCount = 6 }) => {
    return (
        <div className="w-full flex flex-col bg-white rounded-md border border-gray-100 overflow-hidden shadow-sm animate-in fade-in duration-500">
            {/* Header Skeleton */}
            <div className="bg-[#1D71AB]/5 border-b border-gray-100 px-5 py-4 flex gap-4">
                {Array.from({ length: columnCount }).map((_, i) => (
                    <div key={i} className="flex-1">
                        <Skeleton variant="text" width="60%" className="bg-[#1D71AB]/10" />
                    </div>
                ))}
            </div>

            {/* Rows Skeleton */}
            <div className="divide-y divide-gray-50">
                {Array.from({ length: rowCount }).map((_, rowIndex) => (
                    <div key={rowIndex} className="px-5 py-4 flex gap-4">
                        {Array.from({ length: columnCount }).map((_, colIndex) => (
                            <div key={colIndex} className="flex-1">
                                <Skeleton 
                                    variant="text" 
                                    width={colIndex === 0 ? "40%" : "85%"} 
                                    className="bg-gray-100/80" 
                                />
                            </div>
                        ))}
                    </div>
                ))}
            </div>

            {/* Footer Skeleton */}
            <div className="px-5 py-3 border-t border-gray-100 flex justify-between items-center bg-gray-50/30">
                <Skeleton variant="text" width="120px" className="h-6" />
                <div className="flex gap-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} variant="rect" width="28px" height="28px" className="rounded-md" />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default TableSkeleton;
