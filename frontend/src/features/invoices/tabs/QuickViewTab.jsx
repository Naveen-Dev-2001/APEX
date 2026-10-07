import { Collapse } from "antd";
import { QUICK_VIEW_CONFIG } from "../Fields";
import { useInvoiceStore } from "../../../store/invoice.store";
import { useAuthStore } from "../../../store/authStore";
import { useVendorDetailSync } from "../../hooks/useInvoiceDetailSync";
import { useCallback, useEffect, useMemo, useState, useRef, memo } from "react";
import { AutoComplete, Spin } from "antd";
import CustomInput from "../../../shared/components/CustomInput";
import CustomDatePicker from "../../../shared/components/CustomDatePicker";
import CustomDropdown from "../../../shared/components/CustomDropdown";
import { masterDataService } from "../../../api/masterdataAPI";
import InvoiceCalculationModal from "./InvoiceCalculationModal";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import loadLineItemTable from "../../../utils/lineItemLogic";
import { getInvoiceHeuristics } from "../../../utils/invoiceCalculations";
import { getERPSystem } from "../../../utils/envHelper";
import * as XLSX from "xlsx";
import { DownloadOutlined, UploadOutlined } from "@ant-design/icons";
import { Trash2 } from "lucide-react";
import { formatCurrency, formatNumberWithCommas } from "../../../utils/formatters";

dayjs.extend(customParseFormat);

const roundTo2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

const CURRENCY_KEYS = [
    "totalAmount",
    "totalPayable",
    "amountPaid",
    "totalTaxAmount",
    "cgst",
    "sgst",
    "igst",
    "withholdingTax",
    "subtotal",
    "shippingFees",
    "surcharges",
    "totalInvoiceAmount",
    "amountDue"
];

// ─────────────────────────────────────────────────────────────────────────────
// Isolated field component — only re-renders when ITS value changes
// ─────────────────────────────────────────────────────────────────────────────
const FieldRenderer = memo(({ field, storeValue, onCommit, vendorOptions, filterVendors, onVendorSelect, onHover, onLeave, isDuplicate, duplicateMessage, isAmountMismatch, forceDisabled = false, currencyOptions, fetchCurrencyOptions, currencyLoading, onSearch, searchLoading, options: dynamicOptions, loading: dynamicLoading, onOpenChange: dynamicOnOpenChange }) => {
    const isCurrencyField = CURRENCY_KEYS.includes(field.key);
    const [prevStoreValue, setPrevStoreValue] = useState(storeValue);
    const [localValue, setLocalValue] = useState(() => {
        let val = storeValue ?? "";
        if (isCurrencyField && typeof val === "string") {
            val = val.replace(/[^\d.-]/g, '');
            const parts = val.split('.');
            if (parts.length > 2) {
                val = parts[0] + '.' + parts.slice(1).join('');
            }
        }
        return val;
    });
    const [isFocused, setIsFocused] = useState(false);
    const debounceRef = useRef(null);

    if (storeValue !== prevStoreValue) {
        setPrevStoreValue(storeValue);
        let val = storeValue ?? "";
        if (isCurrencyField && typeof val === "string") {
            val = val.replace(/[^\d.-]/g, '');
            const parts = val.split('.');
            if (parts.length > 2) {
                val = parts[0] + '.' + parts.slice(1).join('');
            }
        }
        setLocalValue(val);
    }


    const handleChange = useCallback((value) => {
        let cleanValue = value;
        if (isCurrencyField) {
            cleanValue = value.replace(/[^\d.-]/g, '');
            const parts = cleanValue.split('.');
            if (parts.length > 2) {
                cleanValue = parts[0] + '.' + parts.slice(1).join('');
            }
        }
        setLocalValue(cleanValue);
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => onCommit(field.key, cleanValue), 300);
    }, [field.key, onCommit, isCurrencyField]);

    const handleFocus = useCallback(() => {
        setIsFocused(true);
    }, []);

    const handleBlur = useCallback(() => {
        setIsFocused(false);
    }, []);

    useEffect(() => () => clearTimeout(debounceRef.current), []);

    const displayValue = isCurrencyField && (!isFocused || forceDisabled || !field.editable)
        ? formatNumberWithCommas(localValue)
        : localValue;

    const commonProps = {
        label: field.label,
        value: displayValue,
        disabled: forceDisabled || !field.editable,
        onMouseEnter: () => onHover(field.key),
        onMouseLeave: onLeave,
        onFocus: isCurrencyField ? handleFocus : undefined,
        onBlur: isCurrencyField ? handleBlur : undefined,
        icon: isCurrencyField ? <span className="text-gray-400 font-medium">$</span> : undefined,
    };

    const fieldContent = (() => {
        if (field.key === "vendorId" || field.key === "vendorName") {
            const adaptedOptions = (vendorOptions || []).map(opt => ({
                ...opt,
                value: field.key === "vendorId" ? opt.vendorId : opt.vendorName
            }));

            return (
                <AutoComplete
                    value={localValue}
                    options={adaptedOptions}
                    style={{ width: "100%", height: "40px" }}
                    disabled={commonProps.disabled}
                    filterOption={filterVendors}
                    onSelect={(val, option) => {
                        const id = option.vendorId;
                        const name = option.vendorName;
                        setLocalValue(field.key === "vendorId" ? id : name);
                        onVendorSelect(id, name);
                    }}
                    onChange={(val) => handleChange(val)}
                    onSearch={onSearch}
                    allowClear
                    loading={searchLoading}
                    placeholder="Type to search vendor ID or name"
                    notFoundContent={searchLoading ? <div className="p-2 flex justify-center"><Spin size="small" /></div> : null}
                />
            );
        }

        switch (field.type) {
            case "input":
                return (
                    <CustomInput
                        {...commonProps}
                        label={null}
                        onChange={(e) => handleChange(e.target.value)}
                        height="40px"
                    />
                );
            case "dropdown": {
                let options = dynamicOptions || field.options || [];
                let loading = dynamicLoading || false;
                let onDropdownVisibleChange = dynamicOnOpenChange;

                if (field.key === "invoiceCurrency") {
                    options = currencyOptions;
                    loading = currencyLoading;
                    onDropdownVisibleChange = (open) => {
                        if (open && options.length === 0 && !loading) {
                            fetchCurrencyOptions();
                        }
                    };
                }
                return (
                    <CustomDropdown
                        {...commonProps}
                        label={null}
                        options={options}
                        loading={loading}
                        style={{ width: "100%", borderRadius: "8px", height: "40px" }}
                        onChange={(val) => handleChange(val)}
                        filterOption={filterVendors}
                        placement="bottomLeft"
                        onOpenChange={onDropdownVisibleChange}
                    />
                );
            }
            case "date":
                return (
                    <CustomDatePicker
                        {...commonProps}
                        label={null}
                        value={localValue}
                        onChange={(_date, dateString) => handleChange(dateString)}
                    />
                );
            default:
                return null;
        }
    })();

    return (
        <div
            onMouseEnter={commonProps.onMouseEnter}
            onMouseLeave={commonProps.onMouseLeave}
            className="w-full"
        >
            {field.label && (
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    {field.label} {field.required && <span className="text-red-500">*</span>}
                </label>
            )}
            {fieldContent}
            {field.key === "invoiceNumber" && isDuplicate && duplicateMessage && (
                <div className="text-red-500 text-xs mt-1 font-medium italic">
                    ⚠️ {duplicateMessage}
                </div>
            )}
            {(field.key === "totalPayable") && isAmountMismatch && (
                <div className="text-red-500 text-xs mt-1 font-medium italic">
                    ⚠️ Amount Mismatch
                </div>
            )}
        </div>
    );
});

FieldRenderer.displayName = "FieldRenderer";

// ─────────────────────────────────────────────────────────────────────────────
// Line-item cell — isolated so only the changed cell re-renders
// ─────────────────────────────────────────────────────────────────────────────
const LINE_ITEM_CURRENCY_KEYS = ["unitPrice", "discount", "netAmount", "taxAmt"];

// ─── FIX 1: LineItemCell — change the useEffect condition ────────────────────
const LineItemCell = memo(
    ({ value, disabled, rowId, colKey, onUpdate, onHover, onLeave }) => {
        const isCurrency = LINE_ITEM_CURRENCY_KEYS.includes(colKey);
        const [local, setLocal] = useState(() => {
            let val = value ?? "";
            if (isCurrency && typeof val === "string") {
                val = val.replace(/[^\d.-]/g, '');
                const parts = val.split('.');
                if (parts.length > 2) {
                    val = parts[0] + '.' + parts.slice(1).join('');
                }
            }
            return val;
        });
        const [isFocused, setIsFocused] = useState(false);
        const isEditing = useRef(false);
        const editTimerRef = useRef(null);

        useEffect(() => {
            if (!isEditing.current) {
                let val = value ?? "";
                if (isCurrency && typeof val === "string") {
                    val = val.replace(/[^\d.-]/g, '');
                    const parts = val.split('.');
                    if (parts.length > 2) {
                        val = parts[0] + '.' + parts.slice(1).join('');
                    }
                }
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setLocal(val);
            }
        }, [value, isCurrency]);


        const handleChange = useCallback((e) => {
            let v = e.target.value;
            if (isCurrency) {
                v = v.replace(/[^\d.-]/g, '');
                const parts = v.split('.');
                if (parts.length > 2) {
                    v = parts[0] + '.' + parts.slice(1).join('');
                }
            }
            isEditing.current = true;
            setLocal(v);
            clearTimeout(editTimerRef.current);
            editTimerRef.current = setTimeout(() => {
                isEditing.current = false;
            }, 300);
            onUpdate(rowId, colKey, v);
        }, [rowId, colKey, onUpdate, isCurrency]);

        const handleFocus = useCallback(() => {
            setIsFocused(true);
        }, []);

        const handleBlur = useCallback(() => {
            isEditing.current = false;
            setIsFocused(false);
        }, []);

        useEffect(() => () => clearTimeout(editTimerRef.current), []);

        const displayValue = isCurrency && (!isFocused || disabled)
            ? formatNumberWithCommas(local)
            : local;

        return (
            <div
                onMouseEnter={() => onHover(rowId, colKey)}
                onMouseLeave={onLeave}
                className="w-full h-full min-h-[40px] flex items-center"
                title={displayValue}
            >
                <CustomInput
                    value={displayValue}
                    disabled={disabled}
                    onChange={handleChange}
                    onFocus={isCurrency ? handleFocus : undefined}
                    onBlur={handleBlur}
                    icon={isCurrency ? <span className="text-gray-400 font-medium">$</span> : undefined}
                    className="mb-0 w-full"
                />
            </div>
        );
    },
    // ── Custom comparator: only re-render when data props change ──────────────
    // Ignores onUpdate/onHover/onLeave — if those references change due to
    // a store-wide re-render, the cell must NOT re-render because of it.
    (prevProps, nextProps) =>
        prevProps.value === nextProps.value &&
        prevProps.disabled === nextProps.disabled &&
        prevProps.rowId === nextProps.rowId &&
        prevProps.colKey === nextProps.colKey
);

LineItemCell.displayName = "LineItemCell";

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
const QuickViewTab = ({ isAllFields = false, showOnlyHeader = false }) => {
    const fileInputRef = useRef(null);
    const [currencyOptions, setCurrencyOptions] = useState([]);
    const [currencyLoading, setCurrencyLoading] = useState(false);
    const [tdsOptions, setTdsOptions] = useState([]);
    const [tdsLoading, setTdsLoading] = useState(false);

    const fetchTDSOptions = useCallback(async () => {
        setTdsLoading(true);
        try {
            const res = await masterDataService.getTDSRatesData({ page_size: 1000 });
            const data = res.data || [];
            const options = data.map(t => ({
                label: `${t.section || t.section_code} - ${t.nature_of_payment}`,
                value: t.section || t.section_code,
                rate: t.tds_rate || t.percentage
            }));
            setTdsOptions(options);
        } catch (err) {
            console.error("Failed to fetch TDS options:", err);
        } finally {
            setTdsLoading(false);
        }
    }, []);

    const fetchCurrencyOptions = useCallback(async () => {
        setCurrencyLoading(true);
        try {
            const res = await masterDataService.getCurrencyData();
            // Paginated response: { data: [...], total: ... }
            const data = res.data || [];
            const options = data.map(c => ({ label: `${c.symbol ? c.symbol + ' ' : ''}${c.code}`, value: c.code }));
            setCurrencyOptions(options);
        } finally {
            setCurrencyLoading(false);
        }
    }, []);
    const quickViewFormData = useInvoiceStore(s => s.quickViewFormData);
    const setQuickViewField = useInvoiceStore(s => s.setQuickViewField);
    const activeInvoiceData = useInvoiceStore(s => s.activeInvoiceData);
    const selectedVendorId = useInvoiceStore(s => s.selectedVendorId);
    const setQuickViewFormData = useInvoiceStore(s => s.setQuickViewFormData);
    const setSelectedVendorId = useInvoiceStore(s => s.setSelectedVendorId);
    const setHighlightedField = useInvoiceStore(s => s.setHighlightedField);
    const entityMaster = useInvoiceStore(s => s.entityMaster);
    const isDuplicate = useInvoiceStore(s => s.isDuplicate);
    const duplicateMessage = useInvoiceStore(s => s.duplicateMessage);
    const lineItems = useInvoiceStore(s => s.lineItems);
    const setLineItems = useInvoiceStore(s => s.setLineItems);
    const isVendorSynced = useInvoiceStore(s => s.isVendorSynced);

    // ── Vendor Logic (Optimized for 35k+ vendors) ──────────────────────────
    const { vendor } = useVendorDetailSync(selectedVendorId);

    // ── Exchange Rate Auto-Fetch Logic ──────────────────────────────────────────
    const rateCache = useRef({}); // { 'CURRENCY_DATE': rate }

    useEffect(() => {
        const currency = quickViewFormData?.invoiceCurrency;
        const date = quickViewFormData?.invoiceDate;

        if (!currency || currency === "USD" || !date) {
            // No fetch needed for USD or missing fields
            return;
        }

        const cacheKey = `${currency}_${date}`;
        if (rateCache.current[cacheKey] !== undefined) {
            const cachedRate = rateCache.current[cacheKey];
            if (quickViewFormData.exchangeRate !== cachedRate) {
                setQuickViewField("exchangeRate", cachedRate);
            }
            return;
        }

        let isMounted = true;
        const fetchRate = async () => {
            try {
                // Fetch rate: Base = Invoice Currency, Target = USD (Standardizing on USD as company base)
                const res = await masterDataService.getExchangeRate(currency, "USD", date);
                if (isMounted) {
                    if (res?.exchange_rate) {
                        const newRate = res.exchange_rate;
                        rateCache.current[cacheKey] = newRate;
                        setQuickViewField("exchangeRate", newRate);
                    } else {
                        setQuickViewField("exchangeRate", "");
                    }
                }
            } catch (err) {
                console.error("Failed to auto-fetch exchange rate:", err);
                if (isMounted) setQuickViewField("exchangeRate", "");
            }
        };

        fetchRate();
        return () => { isMounted = false; };
    }, [quickViewFormData?.invoiceCurrency, quickViewFormData?.invoiceDate, setQuickViewField]);

    const handleCommit = useCallback((key, value) => {
        if (key === "invoiceDate") {
            // Get current form data
            const state = useInvoiceStore.getState();
            const prev = state.quickViewFormData;

            // Helper functions
            const parseDateFlexible = (dateStr) => {
                if (!dateStr) return null;
                const formats = ["MM-DD-YYYY", "YYYY-MM-DD", "DD-MM-YYYY", "MM/DD/YYYY", "YYYY/MM/DD"];
                for (const fmt of formats) {
                    const d = dayjs(dateStr, fmt, true);
                    if (d.isValid()) return d;
                }
                const d = dayjs(dateStr);
                return d.isValid() ? d : null;
            };
            const extractDays = (payTerms) => {
                if (!payTerms) return null;
                const match = payTerms.match(/\d+/);
                return match ? parseInt(match[0], 10) : null;
            };
            const getDueDate = (existingDueDate, invoiceDate, invoicePayTerms, vendorPayTerms) => {
                const baseDate = parseDateFlexible(invoiceDate);
                if (!baseDate) return "";
                const invoiceDays = extractDays(invoicePayTerms);
                if (invoiceDays !== null) return baseDate.add(invoiceDays, "day").format("MM-DD-YYYY");
                const vendorDays = extractDays(vendorPayTerms);
                if (vendorDays !== null) return baseDate.add(vendorDays, "day").format("MM-DD-YYYY");
                return "";
            };
            const newDueDate = getDueDate(null, value, prev?.paymentTerms, vendor?.pay_terms);
            setQuickViewField("invoiceDate", value);
            setQuickViewField("dueDate", newDueDate);
        } else if (key === "tdsSection") {
            const selectedTds = tdsOptions.find(opt => opt.value === value);
            if (selectedTds) {
                // If the selected section matches the vendor's default, use the vendor's specific rate
                // otherwise use the default rate from the TDS master list.
                const rate = (value === vendor?.tds_section_code) ? vendor.tds_percentage : selectedTds.rate;

                setQuickViewField("tdsSection", value);
                setQuickViewField("tdsRate", rate);
                setQuickViewField("tds_percentage", rate);
            } else {
                setQuickViewField("tdsSection", value);
            }
        } else {
            setQuickViewField(key, value);
        }

        // ── Trigger Recalculation if specific fields change ───────────────────
        const triggerFields = ["gstEligibility", "tdsApplicability", "tdsRate", "tdsSection", "lineGrouping", "totalTaxAmount"];
        if (triggerFields.includes(key)) {
            const state = useInvoiceStore.getState();
            // Start with current store state
            const updatedFormData = { ...state.quickViewFormData, [key]: value };

            // Ensure booleans and numbers are correctly typed for the calculation logic
            updatedFormData.tds_applicability = (updatedFormData.tdsApplicability === "Yes");
            updatedFormData.tds_percentage = parseFloat(updatedFormData.tdsRate || 0);
            updatedFormData.gst_eligibility = (updatedFormData.gstEligibility === "Eligible");

            // When section changes, also patch in the derived rate
            if (key === "tdsSection") {
                const selectedTds = tdsOptions.find(opt => opt.value === value);
                if (selectedTds) {
                    const rate = (value === vendor?.tds_section_code) ? vendor.tds_percentage : selectedTds.rate;
                    updatedFormData.tdsRate = rate;
                    updatedFormData.tds_percentage = parseFloat(rate || 0);
                }
            }

            const result = loadLineItemTable({
                activeInvoiceData: state.activeInvoiceData,
                quickViewFormData: updatedFormData,
                vendor: vendor,
                isVendorChanged: false,
                entityMaster: state.entityMaster,
                storeOriginalLineItems: state.originalLineItems
            });
            if (result) setLineItems(result);
        }
    }, [setQuickViewField, tdsOptions, setLineItems, vendor]);

    const [searchedVendors, setSearchedVendors] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const searchTimeoutRef = useRef(null);

    // Populate initial vendor if available
    useEffect(() => {
        if (vendor) {
            setSearchedVendors([{
                value: vendor.vendor_id,
                label: `${vendor.vendor_id} - ${vendor.vendor_name}`,
                vendorId: vendor.vendor_id,
                vendorName: vendor.vendor_name
            }]);
        }
    }, [vendor]);

    const handleVendorSearch = useCallback((val) => {
        if (!val || val.length < 2) {
            setSearchedVendors([]);
            return;
        }

        setIsSearching(true);
        if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

        searchTimeoutRef.current = setTimeout(async () => {
            try {
                const res = await masterDataService.getVendorMasterData({ search: val, page_size: 50 });
                const data = res.data || [];
                const options = data.map(v => ({
                    value: v.vendor_id,
                    label: `${v.vendor_id} - ${v.vendor_name}`,
                    vendorId: v.vendor_id,
                    vendorName: v.vendor_name
                }));
                setSearchedVendors(options);
            } catch (err) {
                console.error("Vendor search failed:", err);
            } finally {
                setIsSearching(false);
            }
        }, 500);
    }, []);

    // Also handle vendor name changes (which triggers manual ID update)
    const handleVendorFieldCommit = useCallback((key, value) => {
        handleCommit(key, value);
        // If they manually cleared it, clear search too
        if (!value) {
            setSearchedVendors([]);
            setSelectedVendorId(null);
        }
    }, [handleCommit, setSelectedVendorId]);
    const [showCalcModal, setShowCalcModal] = useState(false);

    const prevVendorRef = useRef(null);


    // ── Vendor sync ───────────────────────────────────────────────────────────
    useEffect(() => {
        if (!vendor || !selectedVendorId) return;
        if (vendor.vendor_id !== selectedVendorId) return;

        const storeState = useInvoiceStore.getState();
        const isVendorSynced = storeState.isVendorSynced;
        const prevVendorId = prevVendorRef.current;

        prevVendorRef.current = vendor?.vendor_id;

        const isVendorChanged = prevVendorId !== null          // not first load
            && prevVendorId !== vendor?.vendor_id;

        if (!isVendorChanged && isVendorSynced) {
            return;
        }

        const TERMS = ['NET 7', 'NET 8', 'NET 12', 'NET 15', 'NET 20', 'NET 30', 'NET 45', 'NET 60', 'NET 90'];

        const parseDateFlexible = (dateStr) => {
            if (!dateStr) return null;
            const formats = ["MM-DD-YYYY", "YYYY-MM-DD", "DD-MM-YYYY", "MM/DD/YYYY", "YYYY/MM/DD"];
            for (const fmt of formats) {
                const d = dayjs(dateStr, fmt, true);
                if (d.isValid()) return d;
            }
            const d = dayjs(dateStr);
            return d.isValid() ? d : null;
        };

        const extractDays = (payTerms) => {
            if (!payTerms) return null;
            const match = payTerms.match(/\d+/);
            return match ? parseInt(match[0], 10) : null;
        };

        const getDueDate = (existingDueDate, invoiceDate, invoicePayTerms, vendorPayTerms) => {
            if (existingDueDate) {
                const d = parseDateFlexible(existingDueDate);
                if (d) return d.format("MM-DD-YYYY");
            }
            const baseDate = parseDateFlexible(invoiceDate);
            if (!baseDate) return "";
            const invoiceDays = extractDays(invoicePayTerms);
            if (invoiceDays !== null) return baseDate.add(invoiceDays, "day").format("MM-DD-YYYY");
            const vendorDays = extractDays(vendorPayTerms);
            if (vendorDays !== null) return baseDate.add(vendorDays, "day").format("MM-DD-YYYY");
            return "";
        };

        const prev = storeState.quickViewFormData;

        const extractedPayTerms = prev?.paymentTerms;
        const computedDueDate = getDueDate(
            prev?.dueDate,
            prev?.invoiceDate,
            extractedPayTerms,
            vendor?.pay_terms
        );
        // When the invoice is already saved AND the vendor hasn't changed,
        // preserve the user's saved overrides — don't overwrite with vendor master.
        const isSavedInvoice = !!prev?.isModified;
        const useVendorDefaults = isVendorChanged || !isSavedInvoice;

        const updatedFormData = {
            ...prev,
            // Only apply vendor defaults for GST/TDS/Grouping when appropriate
            gstEligibility: useVendorDefaults
                ? (vendor?.gst_eligibility ? "Eligible" : "Ineligible")
                : (prev?.gstEligibility || (vendor?.gst_eligibility ? "Eligible" : "Ineligible")),
            lineGrouping: useVendorDefaults
                ? (vendor?.line_grouping ? "Yes" : "No")
                : (prev?.lineGrouping || (vendor?.line_grouping ? "Yes" : "No")),
            tdsApplicability: useVendorDefaults
                ? (vendor?.tds_applicability ? "Yes" : "No")
                : (prev?.tdsApplicability || (vendor?.tds_applicability ? "Yes" : "No")),
            tdsRate: useVendorDefaults
                ? (vendor?.tds_percentage ?? 0)
                : (prev?.tdsRate ?? vendor?.tds_percentage ?? 0),
            tdsSection: useVendorDefaults
                ? (vendor?.tds_section_code ?? "NA")
                : (prev?.tdsSection || vendor?.tds_section_code || "NA"),
            // Always sync payment terms and due date
            paymentTerms: TERMS.includes(extractedPayTerms) ? extractedPayTerms : vendor?.pay_terms || vendor?.payment_terms_label || "",
            dueDate: computedDueDate,
            // Keep internal flags in sync
            gst_eligibility: useVendorDefaults ? vendor?.gst_eligibility : prev?.gst_eligibility,
            tds_applicability: useVendorDefaults ? vendor?.tds_applicability : prev?.tds_applicability,
            tds_percentage: useVendorDefaults
                ? (vendor?.tds_percentage ?? 0)
                : (prev?.tds_percentage ?? vendor?.tds_percentage ?? 0),
            totalTaxAmount: prev?.totalTaxAmount,
        };

        // Commit to store
        setQuickViewFormData(updatedFormData);
        if (!activeInvoiceData) return;
        // const prevVendorId = prevVendorRef.current;
        // const isVendorChanged = prevVendorId !== vendor?.vendor_id;
        const result = loadLineItemTable({
            activeInvoiceData,
            quickViewFormData: updatedFormData,
            vendor,
            isVendorChanged,
            entityMaster,
            storeOriginalLineItems: storeState.originalLineItems
        });

        if (result) setLineItems(result);
        useInvoiceStore.setState({ isVendorSynced: true });

    }, [vendor, selectedVendorId, isVendorSynced]);

    // ── Vendor options ─────────────────────────────────────────────────────────
    // No longer needed: full mapping of 35k vendors
    const vendorOptions = searchedVendors;


    const filterVendors = useCallback((input, option) =>
        option?.label?.toLowerCase().includes(input.toLowerCase()), []);

    const handleVendorSelect = useCallback((vendorId, vendorName) => {
        setQuickViewField("vendorId", vendorId);
        setQuickViewField("vendorName", vendorName);
        setSelectedVendorId(vendorId);
    }, [setQuickViewField, setSelectedVendorId]);

    const handleUpdateLineItem = useCallback((id, key, value) => {
        setLineItems(prev => {
            const updatedItems = prev.map(item => {
                if (item.id !== id) return item;

                // Keep value as-is (string) — don't cast to Number here.
                // Casting kills partial input like "1." or "" mid-type.
                let updated = { ...item, [key]: value };

                if (!item.isSystemRow) {
                    if (key === "netAmount") {
                        // User manually typed netAmount — mark as overridden,
                        // do NOT recalculate from qty/unitPrice/discount.
                        updated.isNetAmountOverridden = true;
                        updated.netAmount = roundTo2(parseFloat(value) || 0);
                    } else if (["qty", "unitPrice", "discount"].includes(key)) {
                        // These fields drive the auto-calculation.
                        updated.isNetAmountOverridden = false;

                        // Use parseFloat so partial input ("1.", "") doesn't
                        // corrupt the calculation — it just treats them as 0.
                        const qty = parseFloat(updated.qty) || 0;
                        const price = parseFloat(updated.unitPrice) || 0;
                        const discount = parseFloat(updated.discount) || 0;

                        updated.netAmount = roundTo2(qty * price - discount);
                    }
                    // "description" and other string fields: no calculation needed.
                } else {
                    // System rows (GST / TDS): keep unitPrice and netAmount in sync.
                    if (key === "unitPrice" || key === "netAmount") {
                        const numVal = roundTo2(parseFloat(value) || 0);
                        updated.unitPrice = numVal;
                        updated.netAmount = numVal;

                        if (updated.type === "GST") {
                            useInvoiceStore.getState().setQuickViewField("totalTaxAmount", numVal);
                        }
                    }
                }
                return updated;
            });

            if (key === "taxAmt") {
                const regularItems = updatedItems.filter(item => !item.isSystemRow);
                const sumTax = regularItems.reduce((sum, item) => sum + (parseFloat(item.taxAmt) || 0), 0);

                // Update quickViewFormData in store
                useInvoiceStore.getState().setQuickViewField("totalTaxAmount", sumTax);

                // Update the GST/Total Tax row in updatedItems
                return updatedItems.map(item => {
                    if (item.isSystemRow && item.type === "GST") {
                        return {
                            ...item,
                            unitPrice: sumTax,
                            netAmount: sumTax
                        };
                    }
                    return item;
                });
            }

            return updatedItems;
        });
        // Sync to original items for persistence across grouping toggles
        useInvoiceStore.getState().syncFieldToOriginals(id, key, value);
    }, [setLineItems]);

    const handleDeleteLineItem = useCallback((id) => {
        setLineItems(prev => {
            const deletedItem = prev.find(item => item.id === id);
            const filtered = prev.filter(item => item.id !== id);
            const regularItems = filtered.filter(item => !item.isSystemRow);

            if (deletedItem && (parseFloat(deletedItem.taxAmt) || 0) > 0) {
                const sumTax = regularItems.reduce((sum, item) => sum + (parseFloat(item.taxAmt) || 0), 0);

                // Update quickViewFormData in store
                useInvoiceStore.getState().setQuickViewField("totalTaxAmount", sumTax);

                // Update the GST/Total Tax row in filtered
                return filtered.map(item => {
                    if (item.isSystemRow && item.type === "GST") {
                        return {
                            ...item,
                            unitPrice: sumTax,
                            netAmount: sumTax
                        };
                    }
                    return item;
                });
            }
            return filtered;
        });

        if (id === "gst-row") {
            useInvoiceStore.getState().setQuickViewField("isGstDeleted", true);
            useInvoiceStore.getState().setQuickViewField("totalTaxAmount", 0);
        } else if (id === "tds-row") {
            useInvoiceStore.getState().setQuickViewField("tdsApplicability", "No");
            useInvoiceStore.getState().setQuickViewField("tdsRate", 0);
            useInvoiceStore.getState().setQuickViewField("tds_percentage", 0);
        } else {
            // Also sync deletion to originalLineItems in store
            const isGrouped = useInvoiceStore.getState().quickViewFormData?.lineGrouping === "Yes";
            useInvoiceStore.setState(state => ({
                originalLineItems: isGrouped ? [] : state.originalLineItems.filter(item => item.id !== id)
            }));
        }
    }, [setLineItems]);

    const handleHoverField = useCallback((key) => {
        setHighlightedField(key);
    }, [setHighlightedField]);

    const lineItemsRef = useRef(lineItems);
    useEffect(() => {
        lineItemsRef.current = lineItems;
    }, [lineItems]);


    const handleHoverLineItem = useCallback((rowId, colKey) => {
        const index = lineItemsRef.current.findIndex(item => item.id === rowId);
        if (index !== -1) {
            setHighlightedField(`LineItem_${index}_${colKey}`);
        }
    }, [setHighlightedField]);

    const handleLeaveField = useCallback(() => {
        setHighlightedField(null);
    }, [setHighlightedField]);

    const handleAddLineItem = useCallback(() => {
        const newItem = {
            id: Date.now(),
            description: "",
            qty: 0,
            unitPrice: 0,
            discount: 0,
            netAmount: 0,
            taxAmt: 0,

            lineType: "",
            glCode: "",
            lob: "",
            department: "",
            customer: "",
            item: "",
        };

        setLineItems(prev => {
            const systemRows = prev.filter(r => r.isSystemRow);
            const regularRows = prev.filter(r => !r.isSystemRow);

            return [...regularRows, newItem, ...systemRows];
        });

        useInvoiceStore.setState(state => ({
            originalLineItems: [...(state.originalLineItems || []), newItem]
        }));
    }, [setLineItems]);

    // ── Totals — derived directly from quickViewLineItems (single source of truth) ──
    //
    // regularItemsSum: sum of all non-system rows (used for "Total Sum Excl GST" label)
    // totalAmountPayable: regularItemsSum + GST row + TDS row
    //
    // Because quickViewLineItems always reflects exactly what is on screen
    // (grouping was applied at load time, edits mutate the state directly),
    // these values are always correct.
    const { regularItemsSum, totalAmountPayable } = useMemo(() => {
        const regularItems = lineItems?.filter(row => !row.isSystemRow);
        const gstRow = lineItems.find(r => r.type === "GST");
        const tdsRow = lineItems.find(r => r.type === "TDS");

        const regularItemsSum = regularItems.reduce(
            (sum, row) => sum + (Number(row.netAmount) || 0),
            0
        );
        const totalAmountPayable = roundTo2(
            regularItemsSum + (Number(gstRow?.netAmount) || 0) + (Number(tdsRow?.netAmount) || 0)
        );

        return { regularItemsSum, totalAmountPayable };
    }, [lineItems]);

    // added by pricilla
    useEffect(() => {
        setQuickViewField("totalPayable", Number(totalAmountPayable).toFixed(2));
    }, [totalAmountPayable, setQuickViewField]);

    // ── Amount Mismatch Warning ──────────────────────────────────────────────
    const isAmountMismatch = useMemo(() => {
        const { hasMismatch } = getInvoiceHeuristics(quickViewFormData, lineItems);
        return hasMismatch;
    }, [quickViewFormData, lineItems]);

    // Label for the GST/VAT system row
    const isZoho = getERPSystem() === "Zoho";
    const gstTaxLabel = entityMaster?.gst_applicable === true ? (isZoho ? "Total VAT" : "Total GST") : "Total Tax";

    const { user, activeRole } = useAuthStore();
    const userRole = (activeRole || user?.role || "").toLowerCase();

    const isViewOnly = useMemo(() => {
        if (activeInvoiceData?.is_archived) return true;
        const status = activeInvoiceData?.status?.toLowerCase();
        if (!status) return false;

        if (userRole === 'admin') return true;

        // ── Finance approver with active editing session → unlock all fields ──
        const isMyEditingSession =
            activeInvoiceData?.is_editing_enabled === true &&
            activeInvoiceData?.editing_enabled_by?.toLowerCase() === user?.email?.toLowerCase();

        if (isMyEditingSession) return false;


        if (userRole === 'scanner') {
            return status !== 'processed';
        }

        if (userRole === 'coder') {
            if (status === 'waiting_approval') return true;
            if (status === 'waiting_coding' || status === 'processed') return false;
            return true;
        }

        // All approvers are view-only unless editing session is active (handled above)
        if (userRole === 'approver') return true;

        const VIEW_ONLY_STATUSES = ["waiting_coding"];
        return VIEW_ONLY_STATUSES.includes(status);
    }, [activeInvoiceData, userRole, user?.email]);

    const filteredSections = useMemo(() => {
        return QUICK_VIEW_CONFIG.filter(section => {
            if (section.visible && !section.visible(quickViewFormData, entityMaster)) return false;
            return (showOnlyHeader
                ? section.section === "Header"
                : (isAllFields || !section.showInAllFields));
        });
    }, [isAllFields, showOnlyHeader, quickViewFormData, entityMaster]);

    const handleExportExcel = useCallback(() => {
        const isZoho = getERPSystem() === "Zoho";
        const dataToExport = (lineItems || [])
            .filter(item => !item.isSystemRow)
            .map((item, index) => {
                const rowData = {
                "S.No": index + 1,
                "Description": item.description || "",
                "Qty": item.qty || 0,
                "Unit Price": item.unitPrice || 0,
                "Discount": item.discount || 0,
                "Net Amount": item.netAmount || 0,
                "Tax Amt": item.taxAmt || 0,
                "Line Type": item.lineType || "",
                "GL Code": item.glCode || "",
                };
                if (!isZoho) {
                    rowData["LOB"] = item.lob || "";
                    rowData["Department"] = item.department || "";
                }
                if (!isZoho) {
                    rowData["Customer"] = item.customer || "";
                }
                if (!isZoho) {
                    rowData["Item"] = item.item || "";
                }
                return rowData;
            });

        if (dataToExport.length === 0) {
            return;
        }

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Line Items");
        XLSX.writeFile(workbook, `Invoice_${activeInvoiceData?.invoice_number || "LineItems"}_${dayjs().format("YYYYMMDD")}.xlsx`);
    }, [lineItems, activeInvoiceData]);

    const handleImportExcel = useCallback((file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(worksheet);

            const isZoho = getERPSystem() === "Zoho";
            const newItems = json.map(row => ({
                id: Date.now() + Math.random(),
                description: row["Description"] || "",
                qty: parseFloat(row["Qty"]) || 0,
                unitPrice: parseFloat(row["Unit Price"]) || 0,
                discount: parseFloat(row["Discount"]) || 0,
                netAmount: parseFloat(row["Net Amount"]) || 0,
                taxAmt: parseFloat(row["Tax Amt"]) || 0,
                lineType: row["Line Type"] || "",
                glCode: row["GL Code"] || "",
                lob: isZoho ? "" : (row["LOB"] || ""),
                department: isZoho ? "" : (row["Department"] || ""),
                customer: isZoho ? "" : (row["Customer"] || ""),
                item: isZoho ? "" : (row["Item"] || ""),
                isSystemRow: false,
                isNetAmountOverridden: true
            }));

            setLineItems(prev => {
                const systemRows = prev.filter(r => r.isSystemRow);
                const regularRows = prev.filter(r => !r.isSystemRow);
                const updatedRegular = [...regularRows, ...newItems];
                const sumTax = updatedRegular.reduce((sum, item) => sum + (parseFloat(item.taxAmt) || 0), 0);

                // Update quickViewFormData in store
                useInvoiceStore.getState().setQuickViewField("totalTaxAmount", sumTax);

                const updatedSystem = systemRows.map(item => {
                    if (item.type === "GST") {
                        return {
                            ...item,
                            unitPrice: sumTax,
                            netAmount: sumTax
                        };
                    }
                    return item;
                });

                return [...updatedRegular, ...updatedSystem];
            });
        };
        reader.readAsArrayBuffer(file);
    }, [setLineItems]);


    const headerButtons = (
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
            <button
                onClick={(e) => { e.stopPropagation(); handleExportExcel(); }}
                className="flex items-center justify-center gap-1.5 w-[120px] py-1.5 bg-white border border-gray-300 rounded hover:bg-gray-50 text-gray-600 transition-colors text-[12px] font-medium shadow-sm"
            >
                <DownloadOutlined style={{ fontSize: 12 }} /> Export
            </button>
            {userRole === "coder" && activeInvoiceData?.status?.toLowerCase() === "waiting_coding" && (
                <>
                    <button
                        onClick={(e) => { e.stopPropagation(); fileInputRef.current.click(); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 rounded hover:bg-gray-50 text-gray-600 transition-colors text-[12px] font-medium shadow-sm"
                    >
                        <UploadOutlined style={{ fontSize: 12 }} /> Import from Excel
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept=".xlsx, .xls"
                        onChange={(e) => {
                            if (e.target.files?.[0]) {
                                handleImportExcel(e.target.files[0]);
                                e.target.value = null;
                            }
                        }}
                    />
                </>
            )}
        </div>
    );

    return (
        <div className="p-2">

            {filteredSections.map((section) => {
                const content = (
                    <>
                        {/* ── FORM ── */}
                        {section.type === "form" && (
                            <div className="grid grid-cols-2 gap-4">
                                {section.fields
                                    .filter(field => {
                                        if (!isAllFields && field.showInAllFields) return false;
                                        if (!field.visible) return true;
                                        return field.visible(quickViewFormData, entityMaster);
                                    })
                                    .map(field => (
                                        <div key={field.key} className="flex flex-col justify-start">
                                            {field.key === "exchangeRate" && (quickViewFormData?.invoiceCurrency ?? "USD") === "USD"
                                                ? null
                                                : (
                                                    <FieldRenderer
                                                        field={field}
                                                        storeValue={
                                                            field.key === "totalPayable"
                                                                ? totalAmountPayable
                                                                : (quickViewFormData?.[field.key] ?? "")
                                                        }
                                                        currencyOptions={currencyOptions}
                                                        fetchCurrencyOptions={fetchCurrencyOptions}
                                                        currencyLoading={currencyLoading}
                                                        // Inject TDS options dynamically
                                                        {...(field.key === "tdsSection" ? {
                                                            options: tdsOptions,
                                                            loading: tdsLoading,
                                                            onOpenChange: (open) => {
                                                                if (open && tdsOptions.length === 0 && !tdsLoading) {
                                                                    fetchTDSOptions();
                                                                }
                                                            }
                                                        } : {})}
                                                        onCommit={field.key === "vendorId" || field.key === "vendorName" ? handleVendorFieldCommit : handleCommit}
                                                        vendorOptions={(field.key === "vendorId" || field.key === "vendorName") ? vendorOptions : undefined}
                                                        filterVendors={filterVendors}
                                                        onVendorSelect={handleVendorSelect}
                                                        onHover={handleHoverField}
                                                        onLeave={handleLeaveField}
                                                        isDuplicate={isDuplicate}
                                                        duplicateMessage={duplicateMessage}
                                                        isAmountMismatch={isAmountMismatch}
                                                        forceDisabled={isViewOnly}
                                                        onSearch={field.key === "vendorId" || field.key === "vendorName" ? handleVendorSearch : undefined}
                                                        searchLoading={isSearching}
                                                    />
                                                )
                                            }
                                        </div>
                                    ))}
                            </div>
                        )}

                        {/* ── TABLE ── */}
                        {section.type === "table" && (
                            <div className="w-full">
                                <div className="overflow-x-auto">
                                    <div className="overflow-y-auto max-h-[300px]">
                                        <table className="w-full border-separate border-spacing-y-2" style={{ minWidth: "800px" }}>
                                            <thead className="bg-[#2F5D7C] text-white sticky top-0 z-10">
                                                <tr>
                                                    <th className="p-2 w-[60px]">S.No</th>
                                                    {section.columns.map(col => (
                                                        <th key={col.key} className="p-2 text-left min-w-[150px]">{col.label}</th>
                                                    ))}
                                                    <th className="p-2 w-[60px]">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {/* ── Render quickViewLineItems directly — no derived processedItems ── */}
                                                {lineItems?.map((row, index) => {
                                                    const isSystem = !!row.isSystemRow;
                                                    const rowLabel = row.type === "GST" ? gstTaxLabel : row.description;

                                                    return (
                                                        <tr
                                                            key={row.id || index}
                                                            className={`shadow-sm ${isSystem ? "bg-gray-50" : "bg-white"}`}
                                                        >
                                                            <td className="p-2 text-center w-[60px]">{index + 1}</td>
                                                            {section.columns.map((col, colIndex) => (
                                                                <td key={col.key} className="p-2 min-w-[150px]">
                                                                    {isSystem ? (
                                                                        // System rows: read-only display
                                                                        <LineItemCell
                                                                            value={
                                                                                colIndex === 0
                                                                                    ? rowLabel
                                                                                    : col.key === "qty"
                                                                                        ? "1"
                                                                                        : col.key === "unitPrice"
                                                                                            ? row.unitPrice
                                                                                            : col.key === "discount"
                                                                                                ? "0"
                                                                                                : col.key === "netAmount"
                                                                                                    ? row.netAmount
                                                                                                    : col.key === "taxAmt"
                                                                                                        ? "0"
                                                                                                        : ""
                                                                            }
                                                                            disabled={isViewOnly}
                                                                            rowId={row.id ?? index}
                                                                            colKey={col.key}
                                                                            onUpdate={handleUpdateLineItem}
                                                                            onHover={handleHoverLineItem}
                                                                            onLeave={handleLeaveField}
                                                                        />
                                                                    ) : (
                                                                        // Regular / grouped rows: fully editable
                                                                        <LineItemCell
                                                                            value={row[col.key]}
                                                                            disabled={!col.editable || isViewOnly}
                                                                            rowId={row.id}
                                                                            colKey={col.key}
                                                                            onUpdate={handleUpdateLineItem}
                                                                            onHover={handleHoverLineItem}
                                                                            onLeave={handleLeaveField}

                                                                        />
                                                                    )}
                                                                </td>
                                                            ))}
                                                            <td className="p-2 w-[60px]">
                                                                {!isSystem && !isViewOnly && (
                                                                    <span
                                                                        className="text-red-500 cursor-pointer flex justify-center hover:text-red-700 transition-colors"
                                                                        onClick={() => handleDeleteLineItem(row.id)}
                                                                        title="Delete line item"
                                                                    >
                                                                        <Trash2 size={16} />
                                                                    </span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                {!isViewOnly && (
                                    <button
                                        onClick={handleAddLineItem}
                                        className="w-full flex items-center justify-center gap-2 py-2 mt-1 mb-4 border border-dashed border-[#2F5D7C] rounded-md text-[#2F5D7C] hover:bg-[#eaf2f8] transition-colors font-medium text-sm"
                                    >
                                        <span className="text-lg leading-none">+</span>
                                        Add Line Item
                                    </button>
                                )}

                                <div className="border-t border-gray-200 pt-3 space-y-2">
                                    <div className="flex justify-end items-center gap-4 pr-2">
                                        <span className="text-sm text-gray-500">
                                            Total Sum of Line Items <span className="text-xs">(Excl GST)</span> :
                                        </span>
                                        <span className="text-sm font-semibold text-gray-800 min-w-[120px] text-right">
                                            {formatCurrency(regularItemsSum)}
                                        </span>
                                    </div>
                                    <div className="flex justify-end items-center gap-4 pr-2 pb-2">
                                        <span className="text-sm text-gray-500">Total Amount Payable :</span>
                                        <span className="text-base font-bold text-[#2F5D7C] min-w-[120px] text-right">
                                            {formatCurrency(totalAmountPayable)}
                                        </span>
                                        <button
                                            className="text-[#2F5D7C] hover:text-[#1e4560] transition-colors"
                                            title="View breakdown"
                                            onClick={() => setShowCalcModal(true)}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"
                                                viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                <circle cx="12" cy="12" r="3" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                );

                return (
                    <Collapse
                        key={section.section}
                        defaultActiveKey={[section.section]}
                        className="bg-white rounded-md border border-gray-200 shadow-sm"
                        style={{ marginBottom: "16px" }}
                        items={[{
                            key: section.section,
                            label: section.section,
                            children: content,
                            extra: section.section === "Line Items" ? headerButtons : null
                        }]}
                    />
                );
            })}

            <InvoiceCalculationModal open={showCalcModal} onClose={() => setShowCalcModal(false)} />
        </div>
    );
};

export default QuickViewTab;