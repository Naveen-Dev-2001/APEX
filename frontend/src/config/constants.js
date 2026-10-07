export const REQUIRED_FIELD = {
    "Zoho": {
        "Master Data": [
            "Entity Master",
            "Vendor Master",
            "GL Master",
            "Currency",
            "Customer Master"
        ],
        "Settings": [
            "Vendor Based Workflow",
            "Reminder Settings"
        ],
        "Admin": [
            "User Management",
            "Global Config",
            "Delegations"
        ]
    },
    "Sage": {
        "Master Data": [
            "Entity Master",
            "Vendor Master",
            "TDS Rates",
            "GL Master",
            "LOB Master",
            "Department Master",
            "Customer Master",
            "Item Master",
            "Currency",
            "Exchange Rate Master"
        ],
        "Settings": [
            "Vendor Based Workflow",
            "Codification Based Workflow",
            "Reminder Settings"
        ],
        "Admin": [
            "User Management",
            "Delegations"
        ]
    }
};

export const MASTER_DATA_COLUMNS = {
    "Zoho": {
        "Entity Master": [
            { header: 'Entity ID', accessor: 'entity_id', sortable: true, filterable: true },
            { header: 'Entity Name', accessor: 'entity_name', sortable: true, filterable: true },
            { header: 'Registered Address', accessor: 'registered_address', sortable: true, filterable: true },
            { header: 'City', accessor: 'city', sortable: true, filterable: true },
            { header: 'State / Territory', accessor: 'state_or_territory', sortable: true, filterable: true },
            { header: 'Zip / Postal Code', accessor: 'zip_or_postal_code', sortable: true, filterable: true },
            { header: 'Country Code', accessor: 'country_code', sortable: true, filterable: true },
            { header: 'GST Applicable', accessor: 'gst_applicable', sortable: true, filterable: true },
            { header: 'Actions', accessor: 'actions', sortable: false },
        ],
        "Vendor Master": [
            { header: 'Company Name', accessor: 'company_name', sortable: true, filterable: true },
            { header: 'Display Name', accessor: 'display_name', sortable: true, filterable: true },
            { header: 'Email ID', accessor: 'email_id', sortable: true, filterable: true },
            { header: 'Phone', accessor: 'phone', sortable: true, filterable: true },
            { header: 'Mobile Phone', accessor: 'mobile_phone', sortable: true, filterable: true },
            { header: 'Currency Code', accessor: 'currency_code', sortable: true, filterable: true },
            { header: 'Payment Terms Label', accessor: 'payment_terms_label', sortable: true, filterable: true },
            { header: 'Billing Address', accessor: 'billing_address', sortable: true, filterable: true },
            { header: 'City', accessor: 'city', sortable: true, filterable: true },
            { header: 'Actions', accessor: 'actions', sortable: false },
        ],
        "GL Master": [
            { header: 'Account Name', accessor: 'account_name', sortable: true, filterable: true },
            { header: 'Account Code', accessor: 'account_code', sortable: true, filterable: true },
            { header: 'Account Type', accessor: 'account_type', sortable: true, filterable: true },
            { header: 'Actions', accessor: 'actions', sortable: false },
        ],
        "Customer Master": [
            { header: 'Customer ID', accessor: 'customer_id', sortable: true, filterable: true },
            { header: 'Customer Name', accessor: 'customer_name', sortable: true, filterable: true },
            { header: 'Company Name', accessor: 'company_name', sortable: true, filterable: true },
            { header: 'Display Name', accessor: 'display_name', sortable: true, filterable: true },
            { header: 'Email ID', accessor: 'email_id', sortable: true, filterable: true },
            { header: 'Phone', accessor: 'phone', sortable: true, filterable: true },
            { header: 'Currency Code', accessor: 'currency_code', sortable: true, filterable: true },
            { header: 'Billing Address', accessor: 'billing_address', sortable: true, filterable: true },
            { header: 'Billing Street2', accessor: 'billing_street2', sortable: true, filterable: true },
            { header: 'Billing City', accessor: 'billing_city', sortable: true, filterable: true },
            { header: 'Actions', accessor: 'actions', sortable: false },
        ],
    },
    "Sage": {
        "Entity Master": [
            { header: 'Entity ID', accessor: 'entity_id', sortable: true, filterable: true },
            { header: 'Entity Name', accessor: 'entity_name', sortable: true, filterable: true },
            { header: 'Registered Address', accessor: 'registered_address', sortable: true, filterable: true },
            { header: 'City', accessor: 'city', sortable: true, filterable: true },
            { header: 'State / Territory', accessor: 'state_or_territory', sortable: true, filterable: true },
            { header: 'Zip / Postal Code', accessor: 'zip_or_postal_code', sortable: true, filterable: true },
            { header: 'Country Code', accessor: 'country_code', sortable: true, filterable: true },
            { header: 'GST Applicable', accessor: 'gst_applicable', sortable: true, filterable: true },
            { header: 'Actions', accessor: 'actions', sortable: false },
        ],
        "Vendor Master": [
            { header: 'Vendor ID', accessor: 'vendor_id', sortable: true, filterable: true },
            { header: 'Vendor Name', accessor: 'vendor_name', sortable: true, filterable: true },
            { header: 'Address Line 1', accessor: 'address_line1', sortable: true, filterable: true },
            { header: 'City', accessor: 'city', sortable: true, filterable: true },
            { header: 'State / Territory', accessor: 'state_or_territory', sortable: true, filterable: true },
            { header: 'Zip Code', accessor: 'zip_or_postal_code', sortable: true, filterable: true },
            { header: 'Country', accessor: 'country', sortable: true, filterable: true },
            { header: 'Primary Email', accessor: 'primary_email_address', sortable: true, filterable: true },
            { header: 'TDS %', accessor: 'tds_percentage', sortable: true, filterable: true },
            { header: 'Actions', accessor: 'actions', sortable: false },
        ],
        "TDS Rates": [
            { header: 'Section', accessor: 'section', sortable: true, filterable: true },
            { header: 'Nature Of Payment', accessor: 'nature_of_payment', sortable: true, filterable: true },
            { header: 'TDS Rate', accessor: 'tds_rate', sortable: true, filterable: true },
            { header: 'Actions', accessor: 'actions', sortable: false },
        ],
        "GL Master": [
            { header: 'Account Number', accessor: 'account_number', sortable: true, filterable: true },
            { header: 'Title', accessor: 'title', sortable: true, filterable: true },
            { header: 'Normal Balance', accessor: 'normal_balance', sortable: true, filterable: true },
            { header: 'Require Dept', accessor: 'require_department', sortable: true, filterable: true },
            { header: 'Require Loc', accessor: 'require_location', sortable: true, filterable: true },
            { header: 'Closing Type', accessor: 'period_end_closing_type', sortable: true, filterable: true },
            { header: 'Actions', accessor: 'actions', sortable: false },
        ],
        "LOB Master": [
            { header: 'LOB ID', accessor: 'lob_id', sortable: true, filterable: true },
            { header: 'Name', accessor: 'name', sortable: true, filterable: true },
            { header: 'Parent ID', accessor: 'parent_id', sortable: true, filterable: true },
            { header: 'Actions', accessor: 'actions', sortable: false },
        ],
        "Department Master": [
            { header: 'Department ID', accessor: 'department_id', sortable: true, filterable: true },
            { header: 'Department Name', accessor: 'department_name', sortable: true, filterable: true },
            { header: 'Actions', accessor: 'actions', sortable: false },
        ],
        "Customer Master": [
            { header: 'Customer ID', accessor: 'customer_id', sortable: true, filterable: true },
            { header: 'Customer Name', accessor: 'customer_name', sortable: true, filterable: true },
            { header: 'Actions', accessor: 'actions', sortable: false },
        ],
        "Item Master": [
            { header: 'Item ID', accessor: 'item_id', sortable: true, filterable: true },
            { header: 'Name', accessor: 'name', sortable: true, filterable: true },
            { header: 'Product Line ID', accessor: 'product_line_id', sortable: true, filterable: true },
            { header: 'GL Group', accessor: 'gl_group', sortable: true, filterable: true },
            { header: 'Actions', accessor: 'actions', sortable: false },
        ],
        "Currency": [
            { header: 'Currency Code', accessor: 'code', sortable: true, filterable: true },
            { header: 'Currency Name', accessor: 'name', sortable: true, filterable: true },
            { header: 'Symbol', accessor: 'symbol', sortable: true, filterable: true },
            { header: 'Actions', accessor: 'actions', sortable: false },
        ],
        "Exchange Rate Master": [
            { header: 'Base Currency', accessor: 'base_currency', sortable: true, filterable: true },
            { header: 'Target Currency', accessor: 'target_currency', sortable: true, filterable: true },
            { header: 'Exchange Rate', accessor: 'exchange_rate', sortable: true, filterable: true },
            { header: 'Effective Date', accessor: 'effective_date', sortable: true, filterable: true },
            { header: 'Rate Type', accessor: 'rate_type', sortable: true, filterable: true },
            { header: 'Rate Key', accessor: 'rate_key', sortable: true, filterable: true },
            { header: 'Actions', accessor: 'actions', sortable: false },
        ],
    }
};
