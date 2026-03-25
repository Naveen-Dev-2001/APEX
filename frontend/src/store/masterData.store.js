import { create } from 'zustand';

const useMasterDataStore = create((set, get) => ({
    activeTab: 'Entity Master',
    searchQuery: '',
    currentPage: 1,
    itemsPerPage: 15,
    
    // Mock Data for all masters
    masters: {
        'Entity Master': {
            columns: [
                { header: 'Entity ID', accessor: 'entityId', sortable: true },
                { header: 'Entity Name', accessor: 'entityName', sortable: true },
                { header: 'Address', accessor: 'address', sortable: true },
                { header: 'City', accessor: 'city', sortable: true },
                { header: 'State', accessor: 'state', sortable: true },
                { header: 'Zip Code', accessor: 'zipCode', sortable: true },
                { header: 'Country Code', accessor: 'countryCode', sortable: true },
                { header: 'Actions', accessor: 'actions', sortable: false }
            ],
            data: Array.from({ length: 50 }, (_, i) => ({
                id: i + 1,
                entityId: 101 + i,
                entityName: i % 2 === 0 ? 'Real Property LLC' : 'Apex Solutions Inc',
                address: `${123 + i} Maple Street`,
                city: i % 3 === 0 ? 'Illinois' : 'Chicago',
                state: 'Springfield',
                zipCode: '62629',
                countryCode: '+1'
            }))
        },
        'Vendor Master': {
            columns: [
                { header: 'Vendor ID', accessor: 'vendorId', sortable: true },
                { header: 'Vendor Name', accessor: 'vendorName', sortable: true },
                { header: 'Category', accessor: 'category', sortable: true },
                { header: 'Email', accessor: 'email', sortable: true },
                { header: 'Phone', accessor: 'phone', sortable: true },
                { header: 'Status', accessor: 'status', sortable: true },
                { header: 'Actions', accessor: 'actions', sortable: false }
            ],
            data: Array.from({ length: 30 }, (_, i) => ({
                id: i + 1,
                vendorId: `VEN-${500 + i}`,
                vendorName: `Vendor ${i + 1}`,
                category: i % 2 === 0 ? 'Supplies' : 'Services',
                email: `vendor${i + 1}@example.com`,
                phone: `+1-555-010${i}`,
                status: i % 4 === 0 ? 'Inactive' : 'Active'
            }))
        },
        'Line Items': {
            columns: [
                { header: 'Item Code', accessor: 'itemCode', sortable: true },
                { header: 'Description', accessor: 'description', sortable: true },
                { header: 'Unit Price', accessor: 'unitPrice', sortable: true },
                { header: 'Category', accessor: 'category', sortable: true },
                { header: 'Actions', accessor: 'actions', sortable: false }
            ],
            data: [
                { id: 1, itemCode: 'LI-001', description: 'Office Chair', unitPrice: '150.00', category: 'Furniture' },
                { id: 2, itemCode: 'LI-002', description: 'Desk Lamp', unitPrice: '45.00', category: 'Electronics' },
            ]
        },

        'TDS Rates': {
            columns: [
                { header: 'Section', accessor: 'section', sortable: true },
                { header: 'Nature of Payment', accessor: 'nature', sortable: true },
                { header: 'Threshold', accessor: 'threshold', sortable: true },
                { header: 'Individual Rate (%)', accessor: 'individualRate', sortable: true },
                { header: 'Company Rate (%)', accessor: 'companyRate', sortable: true },
                { header: 'Actions', accessor: 'actions', sortable: false }
            ],
            data: [
                { id: 1, section: '192', nature: 'Salary', threshold: '2.5L', individualRate: 'Slab', companyRate: 'N/A' },
                { id: 2, section: '194C', nature: 'Contractor', threshold: '30K/1L', individualRate: '1', companyRate: '2' },
                { id: 3, section: '194J', nature: 'Professional Fees', threshold: '30K', individualRate: '10', companyRate: '10' },
            ]
        },
        'GL Master': {
            columns: [
                { header: 'GL Code', accessor: 'glCode', sortable: true },
                { header: 'GL Name', accessor: 'glName', sortable: true },
                { header: 'Type', accessor: 'type', sortable: true },
                { header: 'Sub-Type', accessor: 'subType', sortable: true },
                { header: 'Actions', accessor: 'actions', sortable: false }
            ],
            data: [
                { id: 1, glCode: '400010', glName: 'Travel Expenses', type: 'Expense', subType: 'Operating' },
                { id: 2, glCode: '400020', glName: 'Office Rent', type: 'Expense', subType: 'Fixed' },
            ]
        },
        'LOB Master': {
            columns: [
                { header: 'LOB Code', accessor: 'lobCode', sortable: true },
                { header: 'LOB Name', accessor: 'lobName', sortable: true },
                { header: 'Manager', accessor: 'manager', sortable: true },
                { header: 'Actions', accessor: 'actions', sortable: false }
            ],
            data: [
                { id: 1, lobCode: 'LOB-01', lobName: 'Retail Banking', manager: 'John Doe' },
                { id: 2, lobCode: 'LOB-02', lobName: 'Investment Banking', manager: 'Jane Smith' },
            ]
        },
        'Department Master': {
            columns: [
                { header: 'Dept Code', accessor: 'deptCode', sortable: true },
                { header: 'Dept Name', accessor: 'deptName', sortable: true },
                { header: 'Head', accessor: 'head', sortable: true },
                { header: 'Actions', accessor: 'actions', sortable: false }
            ],
            data: [
                { id: 1, deptCode: 'FIN', deptName: 'Finance', head: 'Robert Brown' },
                { id: 2, deptCode: 'HR', deptName: 'Human Resources', head: 'Emily Davis' },
            ]
        },
        'Customer Master': {
            columns: [
                { header: 'Customer ID', accessor: 'customerId', sortable: true },
                { header: 'Customer Name', accessor: 'customerName', sortable: true },
                { header: 'City', accessor: 'city', sortable: true },
                { header: 'Actions', accessor: 'actions', sortable: false }
            ],
            data: [
                { id: 1, customerId: 'CUS-001', customerName: 'Global Corp', city: 'New York' },
            ]
        },
        'Item Master': {
            columns: [
                { header: 'Item Code', accessor: 'itemCode', sortable: true },
                { header: 'Item Name', accessor: 'itemName', sortable: true },
                { header: 'UOM', accessor: 'uom', sortable: true },
                { header: 'Actions', accessor: 'actions', sortable: false }
            ],
            data: [
                { id: 1, itemCode: 'ITM-01', itemName: 'Laptop L340', uom: 'PCS' },
            ]
        },
        'Currency': {
            columns: [
                { header: 'Currency Code', accessor: 'code', sortable: true },
                { header: 'Symbol', accessor: 'symbol', sortable: true },
                { header: 'Exchange Rate (USD)', accessor: 'rate', sortable: true },
                { header: 'Actions', accessor: 'actions', sortable: false }
            ],
            data: [
                { id: 1, code: 'USD', symbol: '$', rate: '1.00' },
                { id: 2, code: 'INR', symbol: '₹', rate: '0.012' },
                { id: 3, code: 'EUR', symbol: '€', rate: '1.09' },
            ]
        }
    },

    setActiveTab: (tab) => set({ activeTab: tab, currentPage: 1, searchQuery: '' }),
    setSearchQuery: (query) => set({ searchQuery: query, currentPage: 1 }),
    setCurrentPage: (page) => set({ currentPage: page }),
    setItemsPerPage: (items) => set({ itemsPerPage: items, currentPage: 1 }),

    getFilteredData: () => {
        const { activeTab, searchQuery, masters } = get();
        const master = masters[activeTab];
        if (!master) return [];

        if (!searchQuery) return master.data;
        
        const lowerQuery = searchQuery.toLowerCase();
        return master.data.filter(item => 
            Object.values(item).some(val => 
                String(val).toLowerCase().includes(lowerQuery)
            )
        );
    }
}));

export default useMasterDataStore;
