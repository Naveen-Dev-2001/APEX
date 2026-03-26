import { create } from 'zustand';
import workflowAPI from '../api/workflowAPI';

const useWorkflowStore = create((set, get) => ({
    // Vendor Workflow State
    vendorWorkflows: [],
    vendorLoading: false,
    vendorError: null,
    workflowVendors: [], // Eligible vendors for rules
    approversList: [],

    // Codification Workflow State
    codificationWorkflows: [],
    codificationLoading: false,
    codificationError: null,
    lobsList: [],
    departmentsList: [],

    // Shared UI State
    activeTab: 'Vendor Based Workflow',
    searchQuery: '',

    // Actions
    setActiveTab: (tab) => set({ activeTab: tab, searchQuery: '' }),
    setSearchQuery: (query) => set({ searchQuery: query }),

    // Fetch Vendor Workflows
    fetchVendorWorkflows: async () => {
        set({ vendorLoading: true, vendorError: null });
        try {
            const data = await workflowAPI.getVendorWorkflows();
            set({ vendorWorkflows: data, vendorLoading: false });
        } catch (err) {
            set({ vendorError: err.response?.data?.detail || err.message, vendorLoading: false });
        }
    },

    // Fetch Metadata for Vendor Workflow
    fetchVendorMetadata: async () => {
        try {
            const [vendors, approvers] = await Promise.all([
                workflowAPI.getWorkflowVendors(),
                workflowAPI.getApprovers()
            ]);
            set({
                workflowVendors: (vendors || []).map(v => ({
                    value: `${v.vendor_id}|${v.vendor_name}`,
                    label: `${v.vendor_id} - ${v.vendor_name}`
                })),
                approversList: approvers
            });
        } catch (err) {
            console.error('Failed to fetch vendor metadata', err);
        }
    },

    // CRUD Vendor Workflow
    addVendorWorkflow: async (data) => {
        try {
            const newWorkflow = await workflowAPI.createVendorWorkflow(data);
            set((state) => ({
                vendorWorkflows: [...state.vendorWorkflows, newWorkflow]
            }));
            return newWorkflow;
        } catch (err) {
            throw err;
        }
    },

    updateVendorWorkflow: async (id, data) => {
        try {
            const updated = await workflowAPI.updateVendorWorkflow(id, data);
            set((state) => ({
                vendorWorkflows: state.vendorWorkflows.map((w) => (w.id === id ? updated : w))
            }));
            return updated;
        } catch (err) {
            throw err;
        }
    },

    deleteVendorWorkflow: async (id) => {
        try {
            await workflowAPI.deleteVendorWorkflow(id);
            set((state) => ({
                vendorWorkflows: state.vendorWorkflows.filter((w) => w.id !== id)
            }));
        } catch (err) {
            throw err;
        }
    },

    // Fetch Codification Workflows
    fetchCodificationWorkflows: async () => {
        set({ codificationLoading: true, codificationError: null });
        try {
            const data = await workflowAPI.getCodificationWorkflows();
            set({ codificationWorkflows: data, codificationLoading: false });
        } catch (err) {
            set({ codificationError: err.response?.data?.detail || err.message, codificationLoading: false });
        }
    },

    // Fetch Metadata for Codification Workflow
    fetchCodificationMetadata: async () => {
        try {
            const [lobs, depts, approvers] = await Promise.all([
                workflowAPI.getLobs(),
                workflowAPI.getDepartments(),
                workflowAPI.getApprovers()
            ]);
            set({ 
                lobsList: (lobs || []).map(l => ({ 
                    value: typeof l === 'string' ? l : (l.lob_id || l.id), 
                    label: typeof l === 'string' ? l : (l.lob_name || l.name || (l.lob_id || l.id))
                })), 
                departmentsList: (depts || []).map(d => ({ 
                    value: typeof d === 'string' ? d : (d.dept_id || d.id), 
                    label: typeof d === 'string' ? d : (d.dept_name || d.name || (d.dept_id || d.id))
                })), 
                approversList: (approvers || []).map(a => ({ 
                    value: a.email, 
                    label: `${a.first_name} ${a.last_name} (${a.email})` 
                })) 
            });
        } catch (err) {
            console.error('Failed to fetch codification metadata', err);
        }
    },

    // Filter Logic
    getFilteredData: () => {
        const { activeTab, vendorWorkflows, codificationWorkflows, searchQuery } = get();
        const query = searchQuery.toLowerCase();

        if (activeTab === 'Vendor Based Workflow') {
            return vendorWorkflows.filter(w => 
                w.vendor_name?.toLowerCase().includes(query) || 
                w.vendor_id?.toLowerCase().includes(query)
            );
        } else if (activeTab === 'Config Based Workflow') {
             return codificationWorkflows.filter(w => 
                w.lob?.toLowerCase().includes(query) || 
                w.department_id?.toLowerCase().includes(query)
            );
        }
        return [];
    }
}));

export default useWorkflowStore;
