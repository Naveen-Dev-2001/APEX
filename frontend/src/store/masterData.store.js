import { create } from 'zustand';
import { masterDataService } from '../api/masterdataAPI';
import { REQUIRED_FIELD, MASTER_DATA_COLUMNS } from '../config/constants';
import { getERPSystem } from '../utils/envHelper';

const erpSystem = getERPSystem();
const defaultTab = REQUIRED_FIELD[erpSystem]?.["Master Data"]?.[0] || 'Entity Master';

const initialMasters = {};
const allTabs = [
    'Entity Master', 'Vendor Master', 'TDS Rates', 'GL Master', 'LOB Master',
    'Department Master', 'Customer Master', 'Item Master', 'Currency', 'Exchange Rate Master'
];

allTabs.forEach(tab => {
    initialMasters[tab] = {
        columns: MASTER_DATA_COLUMNS[erpSystem]?.[tab] || MASTER_DATA_COLUMNS['Sage']?.[tab] || [],
        data: []
    };
});

const useMasterDataStore = create((set, get) => ({
    activeTab: defaultTab,
    searchQuery: '',
    currentPage: 1,
    itemsPerPage: 10,
    sortColumn: '',
    sortDirection: 'asc',
    columnFilters: {},

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

    // Loading / error state for Exchange Rate Master
    exchangeRateLoading: false,
    exchangeRateError: null,
    // Master data for all tabs
    syncingData: false,
    masters: initialMasters,

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
    setColumnFilters: (update) => set((state) => ({
        columnFilters: typeof update === 'function' ? update(state.columnFilters) : update,
        currentPage: 1
    })),


    // ─── Unified Fetcher: Handles all tabs with server-side pagination ──────
    fetchMasterData: async (tabName) => {
        const { currentPage, itemsPerPage, searchQuery, sortColumn, sortDirection, columnFilters } = get();

        const loadingKeyMap = {
            'Entity Master': 'entityLoading',
            'Vendor Master': 'vendorLoading',
            'TDS Rates': 'tdsLoading',
            'GL Master': 'glLoading',
            'LOB Master': 'lobLoading',
            'Department Master': 'departmentLoading',
            'Customer Master': 'customerLoading',
            'Item Master': 'itemLoading',
            'Currency': 'currencyLoading',
            'Exchange Rate Master': 'exchangeRateLoading'
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
            'Currency': 'currencyError',
            'Exchange Rate Master': 'exchangeRateError'
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
            'Currency': masterDataService.getCurrencyData,
            'Exchange Rate Master': masterDataService.getExchangeRateData
        };

        const loadingKey = loadingKeyMap[tabName];
        const errorKey = errorKeyMap[tabName];
        const fetcher = fetcherMap[tabName]?.bind(masterDataService);

        if (!loadingKey || !fetcher) return;

        set({ [loadingKey]: true, [errorKey]: null });
        try {
            // Transform columnFilters for backend
            const backendFilters = {};
            Object.entries(columnFilters).forEach(([accessor, value]) => {
                if (!value) return;
                if (value instanceof Set) {
                    if (value.size > 0) backendFilters[accessor] = Array.from(value);
                } else if (typeof value === 'object' && value.op) {
                    backendFilters[accessor] = value;
                } else {
                    backendFilters[accessor] = value;
                }
            });

            const response = await fetcher({
                page: currentPage,
                page_size: itemsPerPage,
                search: searchQuery,
                filters: backendFilters,
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
    fetchExchangeRateData: async () => get().fetchMasterData('Exchange Rate Master'),

    uploadEntityMaster: async (file) => {
        set({ entityLoading: true, entityError: null });
        try {
            await masterDataService.uploadEntityMaster(file);
            await get().fetchEntityMasterData();
        } catch (err) {
            set({ entityLoading: false });
            throw err;
        }
    },

    uploadTDSRatesData: async (file) => {
        set({ tdsLoading: true, tdsError: null });
        try {
            await masterDataService.uploadTDSRatesData(file);
            await get().fetchTDSRatesData();
        } catch (err) {
            set({ tdsLoading: false });
            throw err;
        }
    },

    uploadVendorMaster: async (file) => {
        set({ vendorLoading: true, vendorError: null });
        try {
            await masterDataService.uploadVendorMaster(file);
            await get().fetchVendorMasterData();
        } catch (err) {
            set({ vendorLoading: false });
            throw err;
        }
    },

    uploadGLMaster: async (file) => {
        set({ glLoading: true, glError: null });
        try {
            await masterDataService.uploadGLMaster(file);
            await get().fetchGLMasterData();
        } catch (err) {
            set({ glLoading: false });
            throw err;
        }
    },

    uploadLOBMaster: async (file) => {
        set({ lobLoading: true, lobError: null });
        try {
            await masterDataService.uploadLOBMaster(file);
            await get().fetchLOBMasterData();
        } catch (err) {
            set({ lobLoading: false });
            throw err;
        }
    },

    uploadDepartmentMaster: async (file) => {
        set({ departmentLoading: true, departmentError: null });
        try {
            await masterDataService.uploadDepartmentMaster(file);
            await get().fetchDepartmentMasterData();
        } catch (err) {
            set({ departmentLoading: false });
            throw err;
        }
    },

    uploadCustomerMaster: async (file) => {
        set({ customerLoading: true, customerError: null });
        try {
            await masterDataService.uploadCustomerMaster(file);
            await get().fetchCustomerMasterData();
        } catch (err) {
            set({ customerLoading: false });
            throw err;
        }
    },

    uploadItemMaster: async (file) => {
        set({ itemLoading: true, itemError: null });
        try {
            await masterDataService.uploadItemMaster(file);
            await get().fetchItemMasterData();
        } catch (err) {
            set({ itemLoading: false });
            throw err;
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
            else if (tabName === 'Exchange Rate Master') await get().fetchExchangeRateData();
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
            set({ entityLoading: false });
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
            set({ entityLoading: false });
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
            set({ entityLoading: false });
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
            set({ vendorLoading: false });
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
            set({ vendorLoading: false });
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
            set({ vendorLoading: false });
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
            set({ tdsLoading: false });
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
            set({ tdsLoading: false });
            throw err;
        }
    },

    deleteTDSRateRow: async (rowIndex) => {
        set({ tdsLoading: true, tdsError: null });
        try {
            await masterDataService.deleteTDSRateRow(rowIndex);
            await get().fetchTDSRatesData();
        } catch (err) {
            set({ tdsLoading: false });
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
            set({ glLoading: false });
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
            set({ glLoading: false });
            throw err;
        }
    },

    deleteGLRow: async (rowIndex) => {
        set({ glLoading: true, glError: null });
        try {
            await masterDataService.deleteGLRow(rowIndex);
            await get().fetchGLMasterData();
        } catch (err) {
            set({ glLoading: false });
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
            set({ lobLoading: false });
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
            set({ lobLoading: false });
            throw err;
        }
    },

    deleteLOBRow: async (rowIndex) => {
        set({ lobLoading: true, lobError: null });
        try {
            await masterDataService.deleteLOBRow(rowIndex);
            await get().fetchLOBMasterData();
        } catch (err) {
            set({ lobLoading: false });
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
            set({ departmentLoading: false });
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
            set({ departmentLoading: false });
            throw err;
        }
    },

    deleteDepartmentRow: async (rowIndex) => {
        set({ departmentLoading: true, departmentError: null });
        try {
            await masterDataService.deleteDepartmentRow(rowIndex);
            await get().fetchDepartmentMasterData();
        } catch (err) {
            set({ departmentLoading: false });
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
                ...(getERPSystem() === 'Zoho' ? {
                    company_name: formData.company_name,
                    display_name: formData.display_name,
                    email_id: formData.email_id,
                    phone: formData.phone,
                    currency_code: formData.currency_code,
                    billing_address: formData.billing_address,
                    billing_street2: formData.billing_street2,
                    billing_city: formData.billing_city,
                } : {})
            };
            await masterDataService.addCustomerRow(payload);
            await get().fetchCustomerMasterData();
        } catch (err) {
            set({ customerLoading: false });
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
                ...(getERPSystem() === 'Zoho' ? {
                    company_name: formData.company_name,
                    display_name: formData.display_name,
                    email_id: formData.email_id,
                    phone: formData.phone,
                    currency_code: formData.currency_code,
                    billing_address: formData.billing_address,
                    billing_street2: formData.billing_street2,
                    billing_city: formData.billing_city,
                } : {})
            };
            await masterDataService.editCustomerRow(rowIndex, payload);
            await get().fetchCustomerMasterData();
        } catch (err) {
            set({ customerLoading: false });
            throw err;
        }
    },

    deleteCustomerRow: async (rowIndex) => {
        set({ customerLoading: true, customerError: null });
        try {
            await masterDataService.deleteCustomerRow(rowIndex);
            await get().fetchCustomerMasterData();
        } catch (err) {
            set({ customerLoading: false });
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
            set({ itemLoading: false });
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
            set({ itemLoading: false });
            throw err;
        }
    },

    deleteItemRow: async (rowIndex) => {
        set({ itemLoading: true, itemError: null });
        try {
            await masterDataService.deleteItemRow(rowIndex);
            await get().fetchItemMasterData();
        } catch (err) {
            set({ itemLoading: false });
            throw err;
        }
    },

    // ─── Exchange Rate Master: Add ───────────────────────────────────────────────────
    addExchangeRateRow: async (formData) => {
        set({ exchangeRateLoading: true, exchangeRateError: null });
        try {
            const payload = {
                rate_key: formData.rate_key,
                rate_type: formData.rate_type,
                base_currency: formData.base_currency,
                target_currency: formData.target_currency,
                exchange_rate: parseFloat(formData.exchange_rate),
                effective_date: formData.effective_date,
                status: formData.status || 'active',
            };
            await masterDataService.addExchangeRateRow(payload);
            await get().fetchExchangeRateData();
        } catch (err) {
            set({ exchangeRateLoading: false });
            throw err;
        }
    },

    // ─── Exchange Rate Master: Edit ──────────────────────────────────────────────────
    updateExchangeRateRow: async (formData, rowIndex) => {
        set({ exchangeRateLoading: true, exchangeRateError: null });
        try {
            const payload = {
                id: formData.id,
                rate_key: formData.rate_key,
                rate_type: formData.rate_type,
                base_currency: formData.base_currency,
                target_currency: formData.target_currency,
                exchange_rate: parseFloat(formData.exchange_rate),
                effective_date: formData.effective_date,
                status: formData.status || 'active',
            };
            await masterDataService.editExchangeRateRow(rowIndex, payload);
            await get().fetchExchangeRateData();
        } catch (err) {
            set({ exchangeRateLoading: false });
            throw err;
        }
    },

    // ─── Exchange Rate Master: Delete ────────────────────────────────────────────────
    deleteExchangeRateRow: async (rowIndex) => {
        set({ exchangeRateLoading: true, exchangeRateError: null });
        try {
            await masterDataService.deleteExchangeRateRow(rowIndex);
            await get().fetchExchangeRateData();
        } catch (err) {
            set({ exchangeRateLoading: false });
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
            set({ currencyLoading: false });
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
            set({ currencyLoading: false });
            throw err;
        }
    },

    deleteCurrencyRow: async (currencyId) => {
        set({ currencyLoading: true, currencyError: null });
        try {
            await masterDataService.deleteCurrencyRow(currencyId);
            await get().fetchCurrencyData();
        } catch (err) {
            set({ currencyLoading: false });
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
        else if (tabIdentifier === 'Exchange Rate Master') await get().fetchExchangeRateData();
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
