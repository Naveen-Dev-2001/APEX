import { create } from 'zustand';
import { masterDataService } from '../api/masterdataAPI';

const useMasterDataStore = create((set, get) => ({
    activeTab: 'Entity Master',
    searchQuery: '',
    currentPage: 1,
    itemsPerPage: 15,
    sortColumn: '',
    sortDirection: 'asc',

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

    // Loading / error state for Item Master
    itemLoading: false,
    itemError: null,

    // Loading / error state for Currency
    currencyLoading: false,
    currencyError: null,
    // Master data for all tabs
    syncingData: false,
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
                { header: 'Item ID', accessor: 'item_id', sortable: true },
                { header: 'Name', accessor: 'name', sortable: true },
                { header: 'Product Line ID', accessor: 'product_line_id', sortable: true },
                { header: 'GL Group', accessor: 'gl_group', sortable: true },
                { header: 'Actions', accessor: 'actions', sortable: false },
            ],
            data: [],
        },
        'Currency': {
            columns: [
                { header: 'Currency Code', accessor: 'code', sortable: true },
                { header: 'Currency Name', accessor: 'name', sortable: true },
                { header: 'Symbol', accessor: 'symbol', sortable: true },
                { header: 'Actions', accessor: 'actions', sortable: false },
            ],
            data: [],
        },
    },

    // ─── Tab / Pagination actions ────────────────────────────────────────────
    setActiveTab: (tab) => set({ activeTab: tab, currentPage: 1, searchQuery: '' }),
    setSearchQuery: (query) => set({ searchQuery: query, currentPage: 1 }),
    setCurrentPage: (page) => set({ currentPage: page }),
    setItemsPerPage: (items) => set({ itemsPerPage: items, currentPage: 1 }),
    setSort: (column) => {
        const { sortColumn, sortDirection } = get();
        if (sortColumn === column) {
            set({ sortDirection: sortDirection === 'asc' ? 'desc' : 'asc' });
        } else {
            set({ sortColumn: column, sortDirection: 'asc' });
        }
    },

    // ─── Unified Fetcher: Handles all tabs with server-side pagination ──────
    fetchMasterData: async (tabName) => {
        const { currentPage, itemsPerPage, searchQuery, sortColumn, sortDirection } = get();
        const loadingKeyMap = {
            'Entity Master': 'entityLoading',
            'Vendor Master': 'vendorLoading',
            'TDS Rates': 'tdsLoading',
            'GL Master': 'glLoading',
            'LOB Master': 'lobLoading',
            'Department Master': 'departmentLoading',
            'Customer Master': 'customerLoading',
            'Item Master': 'itemLoading',
            'Currency': 'currencyLoading'
        };
        const errorKeyMap = {
            'Entity Master': 'entityError',
            'Vendor Master': 'vendorError',
            'TDS Rates': 'tdsError',
            'GL Master': 'glError',
            'LOB Master': 'lobError',
            'Department Master': 'departmentError',
            'Customer Master': 'customerError',
            'Item Master': 'itemError',
            'Currency': 'currencyError'
        };
        const fetcherMap = {
            'Entity Master': masterDataService.getEntityMasterData,
            'Vendor Master': masterDataService.getVendorMasterData,
            'TDS Rates': masterDataService.getTDSRatesData,
            'GL Master': masterDataService.getGLMasterData,
            'LOB Master': masterDataService.getLOBMasterData,
            'Department Master': masterDataService.getDepartmentMasterData,
            'Customer Master': masterDataService.getCustomerMasterData,
            'Item Master': masterDataService.getItemMasterData,
            'Currency': masterDataService.getCurrencyData
        };

        const loadingKey = loadingKeyMap[tabName];
        const errorKey = errorKeyMap[tabName];
        const fetcher = fetcherMap[tabName]?.bind(masterDataService);

        if (!loadingKey || !fetcher) return;

        set({ [loadingKey]: true, [errorKey]: null });
        try {
            const response = await fetcher({
                page: currentPage,
                page_size: itemsPerPage,
                search: searchQuery,
                sort_by: sortColumn,
                sort_dir: sortDirection
            });

            // Backend returns { data: [], total: 0, ... }
            const rows = response.data || [];
            const total = response.total || 0;

            set((state) => ({
                [loadingKey]: false,
                masters: {
                    ...state.masters,
                    [tabName]: {
                        ...state.masters[tabName],
                        data: rows,
                        total: total,
                    },
                },
            }));
        } catch (err) {
            console.error(`[${tabName}] fetch failed`, err);
            set({ [loadingKey]: false, [errorKey]: err?.response?.data?.detail || err.message });
        }
    },

    // ─── Individual Fetchers (Delegating to unified fetcher) ──────────────────
    fetchEntityMasterData: async () => get().fetchMasterData('Entity Master'),
    fetchVendorMasterData: async () => get().fetchMasterData('Vendor Master'),
    fetchTDSRatesData: async () => get().fetchMasterData('TDS Rates'),
    fetchGLMasterData: async () => get().fetchMasterData('GL Master'),
    fetchLOBMasterData: async () => get().fetchMasterData('LOB Master'),
    fetchDepartmentMasterData: async () => get().fetchMasterData('Department Master'),
    fetchCustomerMasterData: async () => get().fetchMasterData('Customer Master'),
    fetchItemMasterData: async () => get().fetchMasterData('Item Master'),
    fetchCurrencyData: async () => get().fetchMasterData('Currency'),

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

    uploadItemMaster: async (file) => {
        set({ itemLoading: true, itemError: null });
        try {
            await masterDataService.uploadItemMaster(file);
            await get().fetchItemMasterData();
        } catch (err) {
            set({ itemLoading: false, itemError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    fetchCurrencyData: async () => {
        set({ currencyLoading: true, currencyError: null });
        try {
            const rows = await masterDataService.getCurrencyData();
            set((state) => ({
                currencyLoading: false,
                masters: {
                    ...state.masters,
                    'Currency': {
                        ...state.masters['Currency'],
                        data: rows.map(r => ({ ...r, id: r.id })), // backend returns id
                    },
                },
            }));
        } catch (err) {
            console.error('[Currency] fetch failed', err);
            set({ currencyLoading: false, currencyError: err?.response?.data?.detail || err.message });
        }
    },

    syncMasterData: async (tabName) => {
        set({ syncingData: true });
        try {
            await masterDataService.syncTabData(tabName);
            // Refresh data based on the active tab
            if (tabName === 'Entity Master') await get().fetchEntityMasterData();
            else if (tabName === 'Vendor Master') await get().fetchVendorMasterData();
            else if (tabName === 'TDS Rates') await get().fetchTDSRatesData();
            else if (tabName === 'GL Master') await get().fetchGLMasterData();
            else if (tabName === 'LOB Master') await get().fetchLOBMasterData();
            else if (tabName === 'Department Master') await get().fetchDepartmentMasterData();
            else if (tabName === 'Customer Master') await get().fetchCustomerMasterData();
            else if (tabName === 'Item Master') await get().fetchItemMasterData();
            else if (tabName === 'Currency') await get().fetchCurrencyData();
        } finally {
            set({ syncingData: false });
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

    // ─── Item Master: CRUD ────────────────────────────────────────────────
    addItemRow: async (formData) => {
        set({ itemLoading: true, itemError: null });
        try {
            const payload = {
                item_id: formData.item_id,
                name: formData.name,
                product_line_id: formData.product_line_id,
                gl_group: formData.gl_group,
            };
            await masterDataService.addItemRow(payload);
            await get().fetchItemMasterData();
        } catch (err) {
            set({ itemLoading: false, itemError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    updateItemRow: async (formData, rowIndex) => {
        set({ itemLoading: true, itemError: null });
        try {
            const payload = {
                id: formData.id,
                item_id: formData.item_id,
                name: formData.name,
                product_line_id: formData.product_line_id,
                gl_group: formData.gl_group,
            };
            await masterDataService.editItemRow(rowIndex, payload);
            await get().fetchItemMasterData();
        } catch (err) {
            set({ itemLoading: false, itemError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    deleteItemRow: async (rowIndex) => {
        set({ itemLoading: true, itemError: null });
        try {
            await masterDataService.deleteItemRow(rowIndex);
            await get().fetchItemMasterData();
        } catch (err) {
            set({ itemLoading: false, itemError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    // ─── Currency: CRUD ──────────────────────────────────────────────────────
    addCurrencyRow: async (formData) => {
        set({ currencyLoading: true, currencyError: null });
        try {
            const payload = {
                code: formData.code,
                name: formData.name,
                symbol: formData.symbol,
            };
            await masterDataService.addCurrencyRow(payload);
            await get().fetchCurrencyData();
        } catch (err) {
            set({ currencyLoading: false, currencyError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    updateCurrencyRow: async (formData, currencyId) => {
        set({ currencyLoading: true, currencyError: null });
        try {
            const payload = {
                code: formData.code,
                name: formData.name,
                symbol: formData.symbol,
            };
            await masterDataService.editCurrencyRow(currencyId, payload);
            await get().fetchCurrencyData();
        } catch (err) {
            set({ currencyLoading: false, currencyError: err?.response?.data?.detail || err.message });
            throw err;
        }
    },

    deleteCurrencyRow: async (currencyId) => {
        set({ currencyLoading: true, currencyError: null });
        try {
            await masterDataService.deleteCurrencyRow(currencyId);
            await get().fetchCurrencyData();
        } catch (err) {
            set({ currencyLoading: false, currencyError: err?.response?.data?.detail || err.message });
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
        else if (tabIdentifier === 'Item Master') await get().fetchItemMasterData();
        else if (tabIdentifier === 'Currency') await get().fetchCurrencyData();
    },

    // ─── Filtered data getter ─────────────────────────────────────────────────
    getFilteredData: () => {
        const { activeTab, searchQuery, masters, sortColumn, sortDirection } = get();
        const master = masters[activeTab];
        if (!master) return [];
        
        let processed = [...master.data];

        // Sort & Filter (Server-side for everything now)
        // Except for Entity Master where we might want to map names, 
        // but even then, the backend should ideally handle it.
        // For now, let's just bypass client-side search/sort for all.
        
        if (activeTab === 'Entity Master') {
            processed = processed.map(item => ({
                ...item,
                entity_name: item.entity_name === 'Default Entity' ? 'Top Level' : item.entity_name
            }));
        }

        return processed;
    },
}));

export default useMasterDataStore;
