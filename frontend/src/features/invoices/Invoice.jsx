import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CustomInput from "../../shared/components/CustomInput";
import { SearchOutlined, CloseCircleOutlined } from "@ant-design/icons";
import Dropdown from "../../components/ui/Dropdown";
import CustomButton from "../../shared/components/CustomButton";
import ReusableDataTable from "../../shared/components/ReusableDataTable";
import { useInvoiceData } from "../hooks/useInvoiceData";
import { getCondensedColumns, getFullColumns, VIEW_OPTIONS } from "./invoiceColumns";
import { useInvoiceStore } from "../../store/invoice.store";
import { Skeleton } from "antd";
import { v4 as uuidv4 } from 'uuid';
import AddInvoiceModal from "./AddInvoiceModel";
import { deleteInvoice, uploadInvoices, fetchEntityMaster } from "../../api/invoiceApi";
import { message } from "antd";
import API from "../../api/api";
import ViewInvoicePage from "./ViewInvoicePage";
import { useVendorDetailSync } from "../hooks/useInvoiceDetailSync";

const Invoice = () => {
    const {
        invoiceSection, skip, limit, view, setView, setInvoiceSection,
        setIsModalOpen, isModalOpen, setFileName, setViewInvoiceId,
        viewInvoiceId, quickViewFormData, setQuickViewFormData,
        selectedVendorId, setSelectedVendorId, setQuickViewLineItems,
        setEntityMaster, setActiveInvoiceData,
        searchQuery, setSearchQuery, sortColumn, sortDirection, setSort, setSkip, setLimit
    } = useInvoiceStore();

    const [localSearch, setLocalSearch] = useState(searchQuery);

    const { invoices, total, isLoading, refetch } = useInvoiceData({
        skip,
        limit,
        search: searchQuery,
        sort_by: sortColumn,
        sort_dir: sortDirection
    });

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setSearchQuery(localSearch);
        }, 500);
        return () => clearTimeout(timer);
    }, [localSearch, setSearchQuery]);

    const [messageApi, contextHolder] = message.useMessage();
    const [uploadLoading, setUploadLoading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const { isLoadingVendorDetail, vendor } = useVendorDetailSync(selectedVendorId);

    useEffect(() => {
        fetchEntityMaster().then((res) => {
            const data = res.data || [];
            const selectedEntityId = sessionStorage.getItem('selected_entity');
            const selectedEntity = data.filter((item) => item.entity_id === selectedEntityId);
            setEntityMaster(selectedEntity?.[0] || {});
        }).catch((err) => {
            console.error("Failed to fetch entity master", err);
        });
    }, []);

    useEffect(() => {
        if (invoiceSection === 1) {
            refetch();
        }
    }, [invoiceSection]);

    const removeCurrencyFormat = (value) => {
        if (!value) return 0;
        return Number(value.toString().replace(/[^0-9.]/g, ""));
    };

    const handleView = useCallback((data) => {
        const id = Number(data.id);
        if (!id) return;

        // ── isModified guard ─────────────────────────────────────────────────
        // If the invoice was previously saved, extracted_data.isModified === true.
        // We pass this flag through to setQuickViewFormData and setQuickViewLineItems
        // so that _syncSystemRows skips recalculation and preserves the saved values.
        const isModified = !!data?.extracted_data?.isModified;

        setFileName(data.original_filename ?? "");
        setActiveInvoiceData(data);

        setQuickViewFormData({
            // ── isModified flag — read by the store's _syncSystemRows guard ──
            isModified,

            // Header
            vendorId: data.vendor_id ?? "",
            vendorName: data.vendor_name ?? "",
            invoiceNumber: data.invoice_number ?? "",
            invoiceDate: data.extracted_data?.invoice_details?.invoice_date?.value ?? "",
            dueDate: data.extracted_data?.invoice_details?.due_date?.value ?? "",
            paymentTerms: data.extracted_data?.invoice_details?.payment_terms?.value ?? "",
            invoiceCurrency: data.extracted_data?.invoice_details?.currency?.value ?? "",
            exchangeRate: data.exchange_rate ?? "",

            totalAmount: data.extracted_data?.amounts?.total_invoice_amount?.value ?? "",
            totalPayable: data.extracted_data?.amounts?.amount_due?.value ?? "",
            amountPaid: data.extracted_data?.amounts?.amount_paid?.value ?? "",
            memo: data.extracted_data?.additional_info?.notes_terms?.value ?? "",

            invoiceType: data.extracted_data?.invoice_details?.type?.value ?? "",
            poNumber: data.extracted_data?.invoice_details?.po_number?.value ?? "",
            paymentMethod: data.extracted_data?.invoice_details?.payment_method?.value ?? "",
            costCenter: data.extracted_data?.invoice_details?.cost_center?.value ?? "",

            serviceStartDate: data.extracted_data?.service_period?.start_date?.value ?? "",
            serviceEndDate: data.extracted_data?.service_period?.end_date?.value ?? "",

            // Vendor Level
            vendorAddress: data.extracted_data?.vendor_info?.address?.value ?? "",
            vendorCountry: data.extracted_data?.vendor_info?.country?.value ?? "",
            vendorTaxId: data.extracted_data?.vendor_info?.tax_id?.value ?? "",
            vendorEmail: data.extracted_data?.vendor_info?.contact_email?.value ?? "",
            vendorPhone: data.extracted_data?.vendor_info?.phone?.value ?? "",
            vendorBankName: data.extracted_data?.vendor_info?.bank_name?.value ?? "",
            vendorBankAccount: data.extracted_data?.vendor_info?.bank_account_number?.value ?? "",
            vendorContactPerson: data.extracted_data?.vendor_info?.contact_person?.value ?? "",

            // Buyer
            clientName: data.extracted_data?.client_info?.name?.value ?? "",
            billingAddress: data.extracted_data?.client_info?.billing_address?.value ?? "",
            shippingAddress: data.extracted_data?.client_info?.shipping_address?.value ?? "",
            phoneNumber: data.extracted_data?.client_info?.phone?.value ?? "",
            email: data.extracted_data?.client_info?.email?.value ?? "",
            clientTaxId: data.extracted_data?.client_info?.tax_id?.value ?? "",
            contactPerson: data.extracted_data?.client_info?.contact_person?.value ?? "",

            // Taxes
            totalTaxAmount: removeCurrencyFormat(data.extracted_data?.amounts?.total_tax_amount?.value),
            cgst: data.extracted_data?.amounts?.CGST?.value ?? "",
            sgst: data.extracted_data?.amounts?.SGST?.value ?? "",
            igst: data.extracted_data?.amounts?.IGST?.value ?? "",
            withholdingTax: data.extracted_data?.amounts?.withholding_tax?.value ?? "",

            // Totals
            subtotal: removeCurrencyFormat(data.extracted_data?.amounts?.subtotal?.value),
            shippingFees: data.extracted_data?.amounts?.shipping_handling_fees?.value ?? "",
            surcharges: data.extracted_data?.amounts?.surcharges?.value ?? "",
            totalInvoiceAmount: removeCurrencyFormat(data.extracted_data?.amounts?.total_invoice_amount?.value),
            amountDue: removeCurrencyFormat(data.extracted_data?.amounts?.amount_due?.value),

            // Compliance
            notes: data.extracted_data?.additional_info?.notes_terms?.value ?? "",
            qrOrIrn: data.extracted_data?.additional_info?.qr_code_irn?.value ?? "",
            companyRegistrationNumber: data.extracted_data?.additional_info?.company_registration_number?.value ?? "",

            // Vendor master — will be filled by vendor sync in QuickViewTab.
            // tdsApplicability / tdsRate are needed for TDS row visibility,
            // so we also read them from saved amounts if present (isModified path).
            gstEligibility: "",
            tdsApplicability: data.extracted_data?.amounts?.tds_applicability?.value ?? "",
            tdsRate: data.extracted_data?.amounts?.tds_rate?.value ?? "",
            tdsSection: data.extracted_data?.amounts?.tds_section?.value ?? "",
            lineGrouping: "",
        });

        // ── Line items ───────────────────────────────────────────────────────
        // The saved Items array already includes the GST and TDS system rows
        // (saved by useSaveInvoice). We map them back, preserving isSystemRow
        // so _syncSystemRows can identify and keep them as-is when isModified.
        const items = data?.extracted_data?.Items?.value || [];
        const mappedItems = items.map((item, index) => {
            const desc = item.description?.value || "";
            const netAmount = Number(item.amount?.value) || 0;
            const qty = Number(item.qty?.value) || 1;
            const unitPrice = Number(item.unit_price?.value) || 0;
            const discount = Number(item.discount?.value) || 0;
            const taxAmt = Number(item.tax_amount?.value) || 0;

            // Re-attach isSystemRow so the store knows which rows are system rows
            const isGst = desc === "Total GST" || desc === "Total Tax";
            const isTds = desc === "TDS Deduction";

            return {
                id: isGst ? "gst-row" : isTds ? "tds-row" : index + 1,
                type: isGst ? "GST" : isTds ? "TDS" : undefined,
                description: desc,
                qty,
                unitPrice: isGst || isTds ? netAmount : unitPrice,
                discount,
                netAmount,
                taxAmt,
                isSystemRow: isGst || isTds,
                isNetAmountOverridden: false,
            };
        });
        // setQuickViewLineItems([], false);
        // Pass isModified so _syncSystemRows skips recalculation on saved invoices
        setQuickViewLineItems(mappedItems, isModified);
        setViewInvoiceId(id);
        setSelectedVendorId(data.vendor_id);
        setInvoiceSection(2);
    }, [setQuickViewFormData, setViewInvoiceId, setSelectedVendorId, setQuickViewLineItems]);

    const handleDelete = useCallback((data) => {
        deleteInvoice(data.id).then(() => {
            messageApi.success("Invoice deleted successfully");
            refetch();
        }).catch(() => {
            messageApi.error("Failed to delete invoice");
        });
    }, []);

    const columnDefs = useMemo(
        () => view === "condensed"
            ? getCondensedColumns(handleView, handleDelete)
            : getFullColumns(handleView, handleDelete),
        [view]
    );

    const handleCreateInvoice = () => {
        setIsModalOpen(true);
    };

    const handleUpload = async (files) => {
        if (!files || files.length === 0) {
            messageApi.warning("Please select at least one file");
            return;
        }

        let eventSource = null;

        try {
            setUploadLoading(true);
            setUploadProgress(0);

            const taskId = uuidv4();
            const startTime = Date.now();
            const totalFiles = files.length;

            const formData = new FormData();
            files.forEach((f) => formData.append("files", f));

            const progressUrl = `${API.defaults.baseURL}/invoices/upload-progress/${taskId}`;
            eventSource = new EventSource(progressUrl);

            let completedFiles = 0;

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.progress !== undefined) {
                        if (data.progress >= 100) completedFiles += 1;
                        const processingRatio = (completedFiles + data.progress / 100) / totalFiles;
                        const mapped = 50 + Math.round(processingRatio * 49);
                        setUploadProgress(Math.min(mapped, 99));
                    }
                } catch (e) {
                    console.warn("SSE parse error", e);
                }
            };

            eventSource.onerror = () => {
                console.warn("SSE connection error");
            };

            const response = await uploadInvoices(formData, taskId, (progressEvent) => {
                if (progressEvent.total) {
                    const percent = Math.round((progressEvent.loaded / progressEvent.total) * 50);
                    setUploadProgress(percent);
                }
            });

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            setUploadProgress(100);

            messageApi.success(
                `${response?.data?.count ?? files.length} file(s) processed successfully! (${duration}s)`
            );

            await refetch();
            await new Promise((res) => setTimeout(res, 700));

            if (files.length === 1 && response?.data?.invoices?.length > 0) {
                handleView(response.data.invoices[0]);
            } else {
                setInvoiceSection(1);
            }
            setIsModalOpen(false);

        } catch (error) {
            const err = error?.response?.data?.detail || "Upload failed";
            messageApi.error(err);
            setUploadProgress(0);
        } finally {
            if (eventSource) eventSource.close();
            setUploadLoading(false);
            setTimeout(() => setUploadProgress(0), 400);
        }
    };

    return (
        <>
            {contextHolder}
            {invoiceSection === 1 && (
                <>
                    <div className="p-4 bg-[#F7F7F7]">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-3xl font-bold custom-font-jura">
                                Invoices{" "}
                                <span className="text-base font-normal px-2 py-1 rounded-3xl shadow-sm bg-[#E0E0E0] inline-block">
                                    {total || 0}
                                </span>
                            </span>

                            <div className="flex items-center gap-3">
                                <div className="w-[300px]">
                                    <CustomInput
                                        placeholder="Search invoices..."
                                        value={localSearch}
                                        onChange={(e) => setLocalSearch(e.target.value)}
                                        icon={<SearchOutlined />}
                                        rightIcon={localSearch && <CloseCircleOutlined />}
                                        onRightIconClick={() => setLocalSearch("")}
                                        className="mb-0"
                                    />
                                </div>
                                <div className="w-[250px]">
                                    <Dropdown
                                        options={VIEW_OPTIONS}
                                        placeholder="Select View"
                                        value={view}
                                        onChange={(val) => setView(val)}
                                    />
                                </div>
                                <div className="w-[200px]">
                                    <CustomButton variant="primary" type="button" onClick={handleCreateInvoice}>
                                        Create Invoice
                                    </CustomButton>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="overflow-x-auto w-full">
                        {isLoading ? (
                            <Skeleton height={400} borderRadius={16} />
                        ) : (
                            <ReusableDataTable
                                columnDefs={columnDefs}
                                data={invoices ?? []}
                                searchText={searchQuery}
                                tableHeader={false}
                                tableSearch={false}
                                defaultPageSize={10}
                                shouldUseFlex={false}
                                totalItems={total}
                                currentPage={(skip / limit) + 1}
                                itemsPerPage={limit}
                                onPageChange={(page) => setSkip((page - 1) * limit)}
                                onItemsPerPageChange={(newLimit) => {
                                    setLimit(newLimit);
                                    setSkip(0);
                                }}
                                onSortChange={(col, dir) => setSort(col, dir)}
                            />
                        )}
                    </div>
                </>
            )}

            {(invoiceSection === 1 || isModalOpen) && (
                <AddInvoiceModal
                    open={isModalOpen}
                    onCancel={() => {
                        setIsModalOpen(false);
                        setInvoiceSection(1);
                    }}
                    onUpload={handleUpload}
                    uploadProgress={uploadProgress}
                    confirmLoading={uploadLoading}
                />
            )}

            {invoiceSection === 2 && <ViewInvoicePage />}
        </>
    );
};

export default Invoice;