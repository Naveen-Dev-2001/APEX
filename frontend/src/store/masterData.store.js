import { create } from 'zustand';
import { masterDataService } from '../api/masterdataAPI';

const useMasterDataStore = create((set, get) => ({
    activeTab: 'Entity Master',
    searchQuery: '',
    currentPage: 1,
    itemsPerPage: 15,

    // Loading / error state for Entity Master
    entityLoading: false,
    entityError: null,

    // Loading / error state for Vendor Master
    vendorLoading: false,
    vendorError: null,

    // Loading / error state for TDS Rates
    tdsLoading: false,
    tdsError: null,

    // Loading / error state for GL Master
    glLoading: false,
    glError: null,

    // Loading / error state for LOB Master
    lobLoading: false,
    lobError: null,

    // Loading / error state for Department Master
    departmentLoading: false,
    departmentError: null,

    // Loading / error state for Customer Master
    customerLoading: false,
    customerError: null,

    // Master data for all tabs
    masters: {
        'Entity Master': {
            columns: [
                { header: 'Entity ID', accessor: 'entity_id', sortable: true },
                { header: 'Entity Name', accessor: 'entity_name', sortable: true },
                { header: 'Registered Address', accessor: 'registered_address', sortable: true },
                { header: 'City', accessor: 'city', sortable: true },
                { header: 'State / Territory', accessor: 'state_or_territory', sortable: true },
                { header: 'Zip / Postal Code', accessor: 'zip_or_postal_code', sortable: true },
                { header: 'Country Code', accessor: 'country_code', sortable: true },
                { 
                    header: 'GST Applicable', 
                    accessor: 'gst_applicable', 
                    sortable: true
                },
                { header: 'Actions', accessor: 'actions', sortable: false },
            ],
            data: [],
        },
        'Vendor Master': {
            columns: [
                { header: 'Vendor ID', accessor: 'vendor_id', sortable: true },
                { header: 'Vendor Name', accessor: 'vendor_name', sortable: true },
                { header: 'Address Line 1', accessor: 'address_line1', sortable: true },
                { header: 'City', accessor: 'city', sortable: true },
                { header: 'State / Territory', accessor: 'state_or_territory', sortable: true },
                { header: 'Zip Code', accessor: 'zip_or_postal_code', sortable: true },
                { header: 'Country', accessor: 'country', sortable: true },
                { header: 'Primary Email', accessor: 'primary_email_address', sortable: true },
                { header: 'TDS %', accessor: 'tds_percentage', sortable: true },
                { header: 'Actions', accessor: 'actions', sortable: false },
            ],
            data: [],
        },
        'TDS Rates': {
            columns: [
                { header: 'Section', accessor: 'section', sortable: true },
                { header: 'Nature Of Payment', accessor: 'nature_of_payment', sortable: true },
                { header: 'TDS Rate', accessor: 'tds_rate', sortable: true },
                { header: 'Actions', accessor: 'actions', sortable: false },
            ],
            data: [],
        },
        'GL Master': {
            columns: [
                { header: 'Account Number', accessor: 'account_number', sortable: true },
                { header: 'Title', accessor: 'title', sortable: true },
                { header: 'Normal Balance', accessor: 'normal_balance', sortable: true },
                { header: 'Require Dept', accessor: 'require_department', sortable: true },
                { header: 'Require Loc', accessor: 'require_location', sortable: true },
                { header: 'Closing Type', accessor: 'period_end_closing_type', sortable: true },
                { header: 'Actions', accessor: 'actions', sortable: false },
            ],
            data: [],
        },
        'LOB Master': {
            columns: [
                { header: 'LOB ID', accessor: 'lob_id', sortable: true },
                { header: 'Name', accessor: 'name', sortable: true },
                { header: 'Parent ID', accessor: 'parent_id', sortable: true },
                { header: 'Actions', accessor: 'actions', sortable: false },
            ],
            data: [],
        },
        'Department Master': {
            columns: [
                { header: 'Department ID', accessor: 'department_id', sortable: true },
                { header: 'Department Name', accessor: 'department_name', sortable: true },
                { header: 'Actions', accessor: 'actions', sortable: false },
            ],
            data: [],
        },
        'Customer Master': {
            columns: [
                { header: 'Customer ID', accessor: 'customer_id', sortable: true },
                { header: 'Customer Name', accessor: 'customer_name', sortable: true },
                { header: 'Actions', accessor: 'actions', sortable: false },
            ],
            data: [],
        },
        'Item Master': {
            columns: [
                { header: 'Item Code', accessor: 'itemCode', sortable: true },
                { header: 'Item Name', accessor: 'itemName', sortable: true },
                { header: 'UOM', accessor: 'uom', sortable: true },
                { header: 'Actions', accessor: 'actions', sortable: false },
            ],
            data: [
                { id: 1, itemCode: 'ITM-01', itemName: 'Laptop L340', uom: 'PCS' },
            ],
        },
        'Currency': {
            columns: [
                { header: 'Currency Code', accessor: 'code', sortable: true },
                { header: 'Symbol', accessor: 'symbol', sortable: true },
                { header: 'Exchange Rate (USD)', accessor: 'rate', sortable: true },
                { header: 'Actions', accessor: 'actions', sortable: false },
            ],
            data: [
                { id: 1, code: 'USD', symbol: '$', rate: '1.00' },
                { id: 2, code: 'INR', symbol: '₹', rate: '0.012' },
                { id: 3, code: 'EUR', symbol: '€', rate: '1.09' },
            ],
        },
    },

    // ─── Tab / Pagination actions ────────────────────────────────────────────
    setActiveTab: (tab) => set({ activeTab: tab, currentPage: 1, searchQuery: '' }),
    setSearchQuery: (query) => set({ searchQuery: query, currentPage: 1 }),
    setCurrentPage: (page) => set({ currentPage: page }),
    setItemsPerPage: (items) => set({ itemsPerPage: items, currentPage: 1 }),

    // ─── Entity Master: Load from backend ────────────────────────────────────
    fetchEntityMasterData: async () => {
        set({ entityLoading: true, entityError: null });
        try {
            const rows = await masterDataService.getEntityMasterData();
            set((state) => ({
                entityLoading: false,
                masters: {
                    ...state.masters,
                    'Entity Master': {
                        ...state.masters['Entity Master'],
                        data: rows,
                    },
                },
            }));
        } catch (err) {
            console.error('[EntityMaster] fetch failed', err);
            set({ entityLoading: false, entityError: err?.response?.data?.detail || err.message });
        }
    },

    uploadEntityMaster: async (file) => {
        set({ entityLoading: true, entityError: null });
        try {
            await masterDataService.uploadEntityMaster(file);
            await get().fetchEntityMasterData();
        } catch (err) {
            set({ entityLoading: false, entityError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    // ─── Vendor Master: Load from backend ────────────────────────────────────
    fetchVendorMasterData: async () => {
        set({ vendorLoading: true, vendorError: null });
        try {
            const rows = await masterDataService.getVendorMasterData();
            set((state) => ({
                vendorLoading: false,
                masters: {
                    ...state.masters,
                    'Vendor Master': {
                        ...state.masters['Vendor Master'],
                        data: rows,
                    },
                },
            }));
        } catch (err) {
            console.error('[VendorMaster] fetch failed', err);
            set({ vendorLoading: false, vendorError: err?.response?.data?.detail || err.message });
        }
    },

    // ─── TDS Rates: Load from backend ────────────────────────────────────────
    fetchTDSRatesData: async () => {
        set({ tdsLoading: true, tdsError: null });
        try {
            const rows = await masterDataService.getTDSRatesData();
            set((state) => ({
                tdsLoading: false,
                masters: {
                    ...state.masters,
                    'TDS Rates': {
                        ...state.masters['TDS Rates'],
                        data: rows,
                    },
                },
            }));
        } catch (err) {
            console.error('[TDSRates] fetch failed', err);
            set({ tdsLoading: false, tdsError: err?.response?.data?.detail || err.message });
        }
    },

    uploadTDSRatesData: async (file) => {
        set({ tdsLoading: true, tdsError: null });
        try {
            await masterDataService.uploadTDSRatesData(file);
            await get().fetchTDSRatesData();
        } catch (err) {
            set({ tdsLoading: false, tdsError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    uploadVendorMaster: async (file) => {
        set({ vendorLoading: true, vendorError: null });
        try {
            await masterDataService.uploadVendorMaster(file);
            await get().fetchVendorMasterData();
        } catch (err) {
            set({ vendorLoading: false, vendorError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    // ─── GL Master: Load from backend ────────────────────────────────────────
    fetchGLMasterData: async () => {
        set({ glLoading: true, glError: null });
        try {
            const rows = await masterDataService.getGLMasterData();
            set((state) => ({
                glLoading: false,
                masters: {
                    ...state.masters,
                    'GL Master': {
                        ...state.masters['GL Master'],
                        data: rows,
                    },
                },
            }));
        } catch (err) {
            console.error('[GLMaster] fetch failed', err);
            set({ glLoading: false, glError: err?.response?.data?.detail || err.message });
        }
    },

    uploadGLMaster: async (file) => {
        set({ glLoading: true, glError: null });
        try {
            await masterDataService.uploadGLMaster(file);
            await get().fetchGLMasterData();
        } catch (err) {
            set({ glLoading: false, glError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    // ─── LOB Master: Load from backend ────────────────────────────────────────
    fetchLOBMasterData: async () => {
        set({ lobLoading: true, lobError: null });
        try {
            const rows = await masterDataService.getLOBMasterData();
            set((state) => ({
                lobLoading: false,
                masters: {
                    ...state.masters,
                    'LOB Master': {
                        ...state.masters['LOB Master'],
                        data: rows,
                    },
                },
            }));
        } catch (err) {
            console.error('[LOBMaster] fetch failed', err);
            set({ lobLoading: false, lobError: err?.response?.data?.detail || err.message });
        }
    },

    uploadLOBMaster: async (file) => {
        set({ lobLoading: true, lobError: null });
        try {
            await masterDataService.uploadLOBMaster(file);
            await get().fetchLOBMasterData();
        } catch (err) {
            set({ lobLoading: false, lobError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    // ─── Department Master: Load from backend ─────────────────────────────────
    fetchDepartmentMasterData: async () => {
        set({ departmentLoading: true, departmentError: null });
        try {
            const rows = await masterDataService.getDepartmentMasterData();
            set((state) => ({
                departmentLoading: false,
                masters: {
                    ...state.masters,
                    'Department Master': {
                        ...state.masters['Department Master'],
                        data: rows,
                    },
                },
            }));
        } catch (err) {
            console.error('[DepartmentMaster] fetch failed', err);
            set({ departmentLoading: false, departmentError: err?.response?.data?.detail || err.message });
        }
    },

    uploadDepartmentMaster: async (file) => {
        set({ departmentLoading: true, departmentError: null });
        try {
            await masterDataService.uploadDepartmentMaster(file);
            await get().fetchDepartmentMasterData();
        } catch (err) {
            set({ departmentLoading: false, departmentError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    // ─── Customer Master: Load from backend ─────────────────────────────────
    fetchCustomerMasterData: async () => {
        set({ customerLoading: true, customerError: null });
        try {
            const rows = await masterDataService.getCustomerMasterData();
            set((state) => ({
                customerLoading: false,
                masters: {
                    ...state.masters,
                    'Customer Master': {
                        ...state.masters['Customer Master'],
                        data: rows,
                    },
                },
            }));
        } catch (err) {
            console.error('[CustomerMaster] fetch failed', err);
            set({ customerLoading: false, customerError: err?.response?.data?.detail || err.message });
        }
    },

    uploadCustomerMaster: async (file) => {
        set({ customerLoading: true, customerError: null });
        try {
            await masterDataService.uploadCustomerMaster(file);
            await get().fetchCustomerMasterData();
        } catch (err) {
            set({ customerLoading: false, customerError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    // ─── Entity Master: Add ───────────────────────────────────────────────────
    addEntityRow: async (formData) => {
        set({ entityLoading: true, entityError: null });
        try {
            const payload = {
                entity_id: formData.entity_id,
                entity_name: formData.entity_name,
                registered_address: formData.registered_address,
                address_line1: formData.address_line1,
                address_line2: formData.address_line2,
                address_line3: formData.address_line3,
                city: formData.city,
                state_or_territory: formData.state_or_territory,
                zip_or_postal_code: formData.zip_or_postal_code,
                country_code: formData.country_code,
                gst_applicable: formData.gst_applicable,
            };
            await masterDataService.addEntityRow(payload);
            await get().fetchEntityMasterData();
        } catch (err) {
            set({ entityLoading: false, entityError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    // ─── Entity Master: Edit ──────────────────────────────────────────────────
    updateEntityRow: async (formData, rowIndex) => {
        set({ entityLoading: true, entityError: null });
        try {
            const payload = {
                id: formData.id,
                entity_id: formData.entity_id,
                entity_name: formData.entity_name,
                registered_address: formData.registered_address,
                address_line1: formData.address_line1,
                address_line2: formData.address_line2,
                address_line3: formData.address_line3,
                city: formData.city,
                state_or_territory: formData.state_or_territory,
                zip_or_postal_code: formData.zip_or_postal_code,
                country_code: formData.country_code,
                gst_applicable: formData.gst_applicable,
            };
            await masterDataService.editEntityRow(rowIndex, payload);
            await get().fetchEntityMasterData();
        } catch (err) {
            set({ entityLoading: false, entityError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    // ─── Entity Master: Delete ────────────────────────────────────────────────
    deleteEntityRow: async (rowIndex) => {
        set({ entityLoading: true, entityError: null });
        try {
            await masterDataService.deleteEntityRow(rowIndex);
            await get().fetchEntityMasterData();
        } catch (err) {
            set({ entityLoading: false, entityError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    updateVendorRow: async (formData, rowIndex) => {
        set({ vendorLoading: true, vendorError: null });
        try {
            const payload = {
                id: formData.id,
                vendor_id: formData.vendor_id,
                vendor_name: formData.vendor_name,
                vendor_is_an_individual_person: formData.vendor_is_an_individual_person,
                address_line1: formData.address_line1,
                address_line2: formData.address_line2,
                address_line3: formData.address_line3,
                city: formData.city,
                state_or_territory: formData.state_or_territory,
                zip_or_postal_code: formData.zip_or_postal_code,
                country_code: formData.country_code,
                country: formData.country,
                primary_phone: formData.primary_phone,
                secondary_phone_no: formData.secondary_phone_no,
                mobile_phone: formData.mobile_phone,
                primary_email_address: formData.primary_email_address,
                secondary_email_address: formData.secondary_email_address,
                pay_terms: formData.pay_terms,
                tax_id: formData.tax_id,
                gst_eligibility: formData.gst_eligibility,
                tds_applicability: formData.tds_applicability,
                tds_percentage: formData.tds_percentage,
                tds_section_code: formData.tds_section_code,
                workflow_applicable: formData.workflow_applicable,
                line_grouping: formData.line_grouping,
                entity_id: formData.entity_id,
            };
            await masterDataService.editVendorRow(rowIndex, payload);
            await get().fetchVendorMasterData();
        } catch (err) {
            set({ vendorLoading: false, vendorError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    addVendorRow: async (formData) => {
        set({ vendorLoading: true, vendorError: null });
        try {
            const payload = {
                vendor_id: formData.vendor_id,
                vendor_name: formData.vendor_name,
                vendor_is_an_individual_person: formData.vendor_is_an_individual_person,
                address_line1: formData.address_line1,
                address_line2: formData.address_line2,
                address_line3: formData.address_line3,
                city: formData.city,
                state_or_territory: formData.state_or_territory,
                zip_or_postal_code: formData.zip_or_postal_code,
                country_code: formData.country_code,
                country: formData.country,
                primary_phone: formData.primary_phone,
                secondary_phone_no: formData.secondary_phone_no,
                mobile_phone: formData.mobile_phone,
                primary_email_address: formData.primary_email_address,
                secondary_email_address: formData.secondary_email_address,
                pay_terms: formData.pay_terms,
                tax_id: formData.tax_id,
                gst_eligibility: formData.gst_eligibility,
                tds_applicability: formData.tds_applicability,
                tds_percentage: formData.tds_percentage,
                tds_section_code: formData.tds_section_code,
                workflow_applicable: formData.workflow_applicable,
                line_grouping: formData.line_grouping,
                entity_id: formData.entity_id,
            };
            await masterDataService.addVendorRow(payload);
            await get().fetchVendorMasterData();
        } catch (err) {
            set({ vendorLoading: false, vendorError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    // ─── Vendor Master: Delete ────────────────────────────────────────────────
    deleteVendorRow: async (rowIndex) => {
        set({ vendorLoading: true, vendorError: null });
        try {
            await masterDataService.deleteVendorRow(rowIndex);
            await get().fetchVendorMasterData();
        } catch (err) {
            set({ vendorLoading: false, vendorError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    // ─── TDS Rates: CRUD ─────────────────────────────────────────────────────
    addTDSRateRow: async (formData) => {
        set({ tdsLoading: true, tdsError: null });
        try {
            const payload = {
                section: formData.section,
                nature_of_payment: formData.nature_of_payment,
                tds_rate: formData.tds_rate,
            };
            await masterDataService.addTDSRateRow(payload);
            await get().fetchTDSRatesData();
        } catch (err) {
            set({ tdsLoading: false, tdsError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    updateTDSRateRow: async (formData, rowIndex) => {
        set({ tdsLoading: true, tdsError: null });
        try {
            const payload = {
                id: formData.id,
                section: formData.section,
                nature_of_payment: formData.nature_of_payment,
                tds_rate: formData.tds_rate,
            };
            await masterDataService.editTDSRateRow(rowIndex, payload);
            await get().fetchTDSRatesData();
        } catch (err) {
            set({ tdsLoading: false, tdsError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    deleteTDSRateRow: async (rowIndex) => {
        set({ tdsLoading: true, tdsError: null });
        try {
            await masterDataService.deleteTDSRateRow(rowIndex);
            await get().fetchTDSRatesData();
        } catch (err) {
            set({ tdsLoading: false, tdsError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    // ─── GL Master: CRUD ─────────────────────────────────────────────────────
    addGLRow: async (formData) => {
        set({ glLoading: true, glError: null });
        try {
            const payload = {
                account_number: formData.account_number,
                title: formData.title,
                normal_balance: formData.normal_balance,
                require_department: formData.require_department,
                require_location: formData.require_location,
                period_end_closing_type: formData.period_end_closing_type,
                close_into_account: formData.close_into_account,
                disallow_direct_posting: formData.disallow_direct_posting,
                internal_rate: formData.internal_rate,
            };
            await masterDataService.addGLRow(payload);
            await get().fetchGLMasterData();
        } catch (err) {
            set({ glLoading: false, glError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    updateGLRow: async (formData, rowIndex) => {
        set({ glLoading: true, glError: null });
        try {
            const payload = {
                id: formData.id,
                account_number: formData.account_number,
                title: formData.title,
                normal_balance: formData.normal_balance,
                require_department: formData.require_department,
                require_location: formData.require_location,
                period_end_closing_type: formData.period_end_closing_type,
                close_into_account: formData.close_into_account,
                disallow_direct_posting: formData.disallow_direct_posting,
                internal_rate: formData.internal_rate,
            };
            await masterDataService.editGLRow(rowIndex, payload);
            await get().fetchGLMasterData();
        } catch (err) {
            set({ glLoading: false, glError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    deleteGLRow: async (rowIndex) => {
        set({ glLoading: true, glError: null });
        try {
            await masterDataService.deleteGLRow(rowIndex);
            await get().fetchGLMasterData();
        } catch (err) {
            set({ glLoading: false, glError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    // ─── LOB Master: CRUD ─────────────────────────────────────────────────────
    addLOBRow: async (formData) => {
        set({ lobLoading: true, lobError: null });
        try {
            const payload = {
                lob_id: formData.lob_id,
                name: formData.name,
                parent_id: formData.parent_id,
            };
            await masterDataService.addLOBRow(payload);
            await get().fetchLOBMasterData();
        } catch (err) {
            set({ lobLoading: false, lobError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    updateLOBRow: async (formData, rowIndex) => {
        set({ lobLoading: true, lobError: null });
        try {
            const payload = {
                id: formData.id,
                lob_id: formData.lob_id,
                name: formData.name,
                parent_id: formData.parent_id,
            };
            await masterDataService.editLOBRow(rowIndex, payload);
            await get().fetchLOBMasterData();
        } catch (err) {
            set({ lobLoading: false, lobError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    deleteLOBRow: async (rowIndex) => {
        set({ lobLoading: true, lobError: null });
        try {
            await masterDataService.deleteLOBRow(rowIndex);
            await get().fetchLOBMasterData();
        } catch (err) {
            set({ lobLoading: false, lobError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    // ─── Department Master: CRUD ──────────────────────────────────────────────
    addDepartmentRow: async (formData) => {
        set({ departmentLoading: true, departmentError: null });
        try {
            const payload = {
                department_id: formData.department_id,
                department_name: formData.department_name,
            };
            await masterDataService.addDepartmentRow(payload);
            await get().fetchDepartmentMasterData();
        } catch (err) {
            set({ departmentLoading: false, departmentError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    updateDepartmentRow: async (formData, rowIndex) => {
        set({ departmentLoading: true, departmentError: null });
        try {
            const payload = {
                id: formData.id,
                department_id: formData.department_id,
                department_name: formData.department_name,
            };
            await masterDataService.editDepartmentRow(rowIndex, payload);
            await get().fetchDepartmentMasterData();
        } catch (err) {
            set({ departmentLoading: false, departmentError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    deleteDepartmentRow: async (rowIndex) => {
        set({ departmentLoading: true, departmentError: null });
        try {
            await masterDataService.deleteDepartmentRow(rowIndex);
            await get().fetchDepartmentMasterData();
        } catch (err) {
            set({ departmentLoading: false, departmentError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    // ─── Customer Master: CRUD ──────────────────────────────────────────────
    addCustomerRow: async (formData) => {
        set({ customerLoading: true, customerError: null });
        try {
            const payload = {
                customer_id: formData.customer_id,
                customer_name: formData.customer_name,
            };
            await masterDataService.addCustomerRow(payload);
            await get().fetchCustomerMasterData();
        } catch (err) {
            set({ customerLoading: false, customerError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    updateCustomerRow: async (formData, rowIndex) => {
        set({ customerLoading: true, customerError: null });
        try {
            const payload = {
                id: formData.id,
                customer_id: formData.customer_id,
                customer_name: formData.customer_name,
            };
            await masterDataService.editCustomerRow(rowIndex, payload);
            await get().fetchCustomerMasterData();
        } catch (err) {
            set({ customerLoading: false, customerError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    deleteCustomerRow: async (rowIndex) => {
        set({ customerLoading: true, customerError: null });
        try {
            await masterDataService.deleteCustomerRow(rowIndex);
            await get().fetchCustomerMasterData();
        } catch (err) {
            set({ customerLoading: false, customerError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    clearMasterData: async (tabIdentifier) => {
        await masterDataService.deleteTabData(tabIdentifier);
        if (tabIdentifier === 'Entity Master') await get().fetchEntityMasterData();
        else if (tabIdentifier === 'Vendor Master') await get().fetchVendorMasterData();
        else if (tabIdentifier === 'TDS Rates') await get().fetchTDSRatesData();
        else if (tabIdentifier === 'GL Master') await get().fetchGLMasterData();
        else if (tabIdentifier === 'LOB Master') await get().fetchLOBMasterData();
        else if (tabIdentifier === 'Department Master') await get().fetchDepartmentMasterData();
        else if (tabIdentifier === 'Customer Master') await get().fetchCustomerMasterData();
    },

    // ─── Filtered data getter ─────────────────────────────────────────────────
    getFilteredData: () => {
        const { activeTab, searchQuery, masters } = get();
        const master = masters[activeTab];
        if (!master) return [];
        if (!searchQuery) return master.data;
        const lowerQuery = searchQuery.toLowerCase();
        return master.data.filter((item) =>
            Object.values(item).some((val) =>
                String(val).toLowerCase().includes(lowerQuery)
            )
        );
    },
}));

export default useMasterDataStore;
