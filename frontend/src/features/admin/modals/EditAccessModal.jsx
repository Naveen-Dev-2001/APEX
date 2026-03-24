import React, { useState, useRef, useEffect } from 'react';
import useAdminStore from '../../../store/useAdminStore';

const EditAccessModal = ({ roleName, onClose }) => {
    const { navigation, updateRoleAccess, isUpdating } = useAdminStore();
    const [isOpen, setIsOpen] = useState(false);
    
    // Get all unique labels from navigation
    const allLabels = Array.from(new Set(navigation.map(nav => nav.label)));
    
    // Get currently selected labels for this role
    const initialSelected = navigation
        .filter(nav => nav.roles.includes('all') || nav.roles.includes(roleName.toLowerCase()))
        .map(nav => nav.label);
        
    const [selectedLabels, setSelectedLabels] = useState(initialSelected);
    const dropdownRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleLabel = (label) => {
        if (selectedLabels.includes(label)) {
            setSelectedLabels(selectedLabels.filter(l => l !== label));
        } else {
            setSelectedLabels([...selectedLabels, label]);
        }
    };

    const handleSave = async () => {
        const success = await updateRoleAccess(roleName, selectedLabels);
        if (success) onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[3000] p-4 text-left">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-visible animate-scaleIn">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-gray-800 uppercase">Edit Access : {roleName}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
                </div>
                
                <div className="p-6 space-y-6">
                    {/* Role Display */}
                    <div className="space-y-2">
                        <label className="text-[13px] font-medium text-gray-600 block">Role</label>
                        <span className="inline-block px-3 py-1 rounded bg-red-50 text-red-500 text-xs font-bold uppercase border border-red-100">
                            {roleName}
                        </span>
                    </div>

                    {/* Multi-select Dropdown */}
                    <div className="space-y-1 relative" ref={dropdownRef}>
                        <label className="text-[13px] font-medium text-gray-700 block">
                            <span className="text-red-500">*</span> Accessible Labels
                        </label>
                        
                        <div 
                            onClick={() => setIsOpen(!isOpen)}
                            className={`min-h-[42px] w-full border border-gray-300 rounded-[4px] px-3 py-1.5 flex flex-wrap gap-2 items-center cursor-pointer transition-all focus-within:border-[#3b82f6] focus-within:ring-1 focus-within:ring-[#3b82f6]/20 bg-white ${isOpen ? 'border-[#3b82f6] ring-1 ring-[#3b82f6]/20' : ''}`}
                        >
                            {selectedLabels.map(label => (
                                <span key={label} className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 text-[#444444] rounded text-xs border border-gray-200">
                                    {label}
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); toggleLabel(label); }}
                                        className="hover:text-red-500 scale-125"
                                    >
                                        &times;
                                    </button>
                                </span>
                            ))}
                            {selectedLabels.length === 0 && <span className="text-gray-400 text-sm">Select labels...</span>}
                            
                            <div className="ml-auto text-gray-400">
                                <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </div>

                        {/* Dropdown Menu */}
                        {isOpen && (
                            <div className="absolute z-[3100] left-0 right-0 mt-1 bg-white border border-gray-200 rounded shadow-lg py-1 max-h-[250px] overflow-y-auto animate-fadeInSlow">
                                {allLabels.map(label => (
                                    <div 
                                        key={label}
                                        onClick={() => toggleLabel(label)}
                                        className="px-4 py-2 hover:bg-gray-50 flex justify-between items-center cursor-pointer group transition-colors"
                                    >
                                        <span className={`text-[13px] ${selectedLabels.includes(label) ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>
                                            {label}
                                        </span>
                                        {selectedLabels.includes(label) && (
                                            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                            </svg>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3 rounded-b-lg mt-10">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-200 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isUpdating}
                        className={`px-8 py-2 text-sm font-medium bg-[#3b82f6] text-white hover:bg-blue-600 rounded shadow-sm transition-colors flex items-center gap-2 ${isUpdating ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                        {isUpdating ? 'Saving...' : 'OK'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EditAccessModal;
