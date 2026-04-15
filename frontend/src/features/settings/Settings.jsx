import React, { useState, useEffect } from 'react';
import { Plus, RotateCcw, AlertCircle } from 'lucide-react';
import useWorkflowStore from '../../store/workflow.store';
import { useAuthStore } from '../../store/authStore';
import useToastStore from '../../store/useToastStore';
import toast from '../../utils/toast';
import ReusableDataTable from '../../shared/components/ReusableDataTable';
import VendorWorkflowModal from './VendorWorkflowModal';
import CodificationWorkflowModal from './CodificationWorkflowModal';
import CustomTabs from '../invoices/CustomTabs';
import { useSettingsStore } from '../../store/settings.store';
import CustomButton from '../../shared/components/CustomButton';
import RuleModal from './RuleModal';

const TABS = ['Vendor Based Workflow', 'Config Based Workflow'];



const Settings = () => {
    const { activeSettingsTab, setActiveSettingsTab, addRule, setAddRule } = useSettingsStore();


    return (
        <div className="h-screen flex flex-col bg-[#f8fafc] p-4">

            {/* HEADER (NO SCROLL) */}
            <div className="bg-white rounded-md shadow-sm p-3 flex-shrink-0">

                <h1 className="text-2xl font-bold mb-3 custom-font-jura">
                    Approval Workflow Settings
                </h1>

                <div className="flex items-center justify-between gap-3">

                    {/* Tabs */}
                    <div className="flex-shrink-0">
                        <CustomTabs
                            tabs={TABS}
                            activeTab={activeSettingsTab}
                            onChange={setActiveSettingsTab}
                        />
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-2 ml-auto">
                        <input
                            type="text"
                            placeholder="Search..."
                            className="border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-[200px]"
                        />

                        <div className="w-[140px]">
                            <CustomButton className="w-full h-9 bg-blue-500 !text-white" onClick={() => setAddRule(true)}>
                                + Add Rule
                            </CustomButton>
                        </div>

                        <div className="w-[120px]">
                            <CustomButton className="w-full h-9 border">
                                Refresh
                            </CustomButton>
                        </div>
                    </div>
                </div>
            </div>

            {/* TAB BODY (ONLY SCROLL HERE) */}
            <div className="flex-1 bg-white rounded-md shadow-sm mt-3 overflow-hidden">

                <div className="h-full overflow-y-auto p-4">

                    {activeSettingsTab === 'Vendor Based Workflow' && (
                        <div>
                            {/* Your Vendor Table / UI */}
                        </div>
                    )}

                    {activeSettingsTab === 'Config Based Workflow' && (
                        <div>
                            {/* Your Config UI */}
                        </div>
                    )}

                </div>
            </div>
            {
                addRule && <RuleModal open={addRule} onCancel={setAddRule} />
            }
        </div>
    );
};

export default Settings;