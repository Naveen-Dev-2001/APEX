import React, { useEffect, useState } from 'react';
import useAdminStore from '../../../store/useAdminStore';
import { fetchEntityMaster } from '../../../api/invoiceApi';

const CronjobConfig = () => {
    const { cronjobConfig, saveCronjobConfig, isUpdating } = useAdminStore();
    const [enabled, setEnabled] = useState(false);
    const [folderDirectory, setFolderDirectory] = useState('');
    const [intervalMinutes, setIntervalMinutes] = useState(5);
    const [entityId, setEntityId] = useState('DEFAULT');
    const [entityOptions, setEntityOptions] = useState([{ entity_id: 'DEFAULT', entity_name: 'Top Level' }]);

    useEffect(() => {
        if (cronjobConfig) {
            setEnabled(cronjobConfig.enabled || false);
            setFolderDirectory(cronjobConfig.folder_directory || '');
            setIntervalMinutes(cronjobConfig.interval_minutes || 5);
            setEntityId(cronjobConfig.entity_id || 'DEFAULT');
        }
    }, [cronjobConfig]);

    useEffect(() => {
        fetchEntityMaster()
            .then(res => {
                const data = res.data || [];
                const formatted = data.map(e => ({
                    entity_id: e.entity_id,
                    entity_name: e.entity_id === 'DEFAULT' ? 'Top Level' : `${e.entity_name} (${e.entity_id})`
                }));
                // Ensure DEFAULT is present in list as first option (Top Level)
                if (!formatted.some(e => e.entity_id === 'DEFAULT')) {
                    formatted.unshift({ entity_id: 'DEFAULT', entity_name: 'Top Level' });
                }
                setEntityOptions(formatted);
            })
            .catch(err => {
                console.error("Failed to fetch entity master for cronjob config", err);
            });
    }, []);

    const handleSave = async () => {
        const interval = parseInt(intervalMinutes, 10);
        
        if (enabled && !folderDirectory.trim()) {
            return;
        }
        
        if (isNaN(interval) || interval < 1) {
            return;
        }

        await saveCronjobConfig({
            enabled,
            folder_directory: folderDirectory.trim(),
            interval_minutes: interval,
            entity_id: entityId
        });
    };

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden text-left">
            <div className="px-6 py-4 flex justify-between items-center border-b border-gray-100">
                <h3 className="text-[15px] font-medium text-[#444444]">Cronjob Config</h3>
                <div className="flex items-center">
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                            type="checkbox" 
                            className="sr-only peer" 
                            checked={enabled} 
                            onChange={(e) => setEnabled(e.target.checked)} 
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#24a0ed]"></div>
                        <span className="ml-3 text-xs font-semibold text-gray-700">
                            {enabled ? 'Active / Enabled' : 'Disabled'}
                        </span>
                    </label>
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
                <div className="md:col-span-2 space-y-1">
                    <label className="text-[13px] font-medium text-gray-700 block">
                        {enabled && <span className="text-red-500">* </span>}Folder Directory
                    </label>
                    <input
                        type="text"
                        className={`w-full border rounded px-3 py-2 text-sm outline-none transition-colors ${
                            !enabled 
                                ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed' 
                                : 'border-gray-300 focus:border-[#24a0ed]'
                        }`}
                        placeholder="e.g. C:/Invoices/Watch"
                        value={folderDirectory}
                        onChange={(e) => setFolderDirectory(e.target.value)}
                        disabled={!enabled}
                    />
                    <p className="text-[11px] text-gray-400">
                        The absolute directory path on the server where invoice documents will be fetched from.
                    </p>
                </div>
                
                <div className="space-y-1">
                    <label className="text-[13px] font-medium text-gray-700 block">
                        {enabled && <span className="text-red-500">* </span>}Target Entity
                    </label>
                    <select
                        className={`w-full border rounded px-3 py-2 text-sm outline-none transition-colors ${
                            !enabled 
                                ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed' 
                                : 'border-gray-300 focus:border-[#24a0ed] bg-white text-gray-800'
                        }`}
                        value={entityId}
                        onChange={(e) => setEntityId(e.target.value)}
                        disabled={!enabled}
                    >
                        {entityOptions.map(ent => (
                            <option key={ent.entity_id} value={ent.entity_id}>
                                {ent.entity_name}
                            </option>
                        ))}
                    </select>
                    <p className="text-[11px] text-gray-400">
                        The business entity to assign to fetched invoices (default: "Top Level").
                    </p>
                </div>
                
                <div className="space-y-1">
                    <label className="text-[13px] font-medium text-gray-700 block">
                        {enabled && <span className="text-red-500">* </span>}Scan Interval (minutes)
                    </label>
                    <input
                        type="number"
                        min="1"
                        className={`w-full border rounded px-3 py-2 text-sm outline-none transition-colors ${
                            !enabled 
                                ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed' 
                                : 'border-gray-300 focus:border-[#24a0ed]'
                        }`}
                        value={intervalMinutes}
                        onChange={(e) => setIntervalMinutes(e.target.value)}
                        disabled={!enabled}
                    />
                    <p className="text-[11px] text-gray-400">
                        How often the cron watcher scans the folder. Default is 5 minutes. Minimum is 1 minute.
                    </p>
                </div>
            </div>

            <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-100 flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={isUpdating || (enabled && !folderDirectory.trim()) || parseInt(intervalMinutes, 10) < 1}
                    className={`px-8 py-1.5 text-xs font-semibold bg-[#24a0ed] hover:bg-[#1c8ad1] text-white rounded-[4px] shadow-sm transition-colors flex items-center gap-2 ${
                        isUpdating || (enabled && !folderDirectory.trim()) || parseInt(intervalMinutes, 10) < 1
                            ? 'opacity-70 cursor-not-allowed' 
                            : ''
                    }`}
                >
                    {isUpdating ? 'Saving...' : 'Save Settings'}
                </button>
            </div>
        </div>
    );
};

export default CronjobConfig;
