const roundTo2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

const normalizeItems = (items) => {
    return items.map((item, index) => ({
        id: `${index}`,
        qty: Number(item.quantity?.value || 0),
        unitPrice: Number(item.unit_price?.value || 0),
        discount: Number(0),
        netAmount: Number(item.amount?.value || 0),
        description: item.description?.value || "",
        taxAmt: 0,

        lineType: "",
        glCode: "",
        lob: "",
        department: "",
        customer: "",
        item: "",
    }));
};

// const calculateNetAmount = (row) => {
//     const qty = Number(row.qty || 0);
//     const unitPrice = Number(row.unitPrice || 0);
//     const discount = Number(row.discount || 0);

//     return (qty * unitPrice) - discount;
// };


const calculateNetAmount = (row) => {
    const qty = Number(row.qty || 0);
    const unitPrice = Number(row.unitPrice || 0);
    const discount = Number(row.discount || 0);
    const netAmount = Number(row.netAmount || 0);

    //  Case 1: Only when both exist → calculate
    if (qty > 0 && unitPrice > 0) {
        return roundTo2((qty * unitPrice) - discount);
    }

    //  Case 2: Everything missing → trust invoice value
    return netAmount;
};
const mergeIntoFirstRow = (data) => {
    if (!data || data.length === 0) return [];

    const updatedData = JSON.parse(JSON.stringify(data));

    //  sum all rows
    const totalNetAmount = updatedData.reduce((sum, row) => {
        return sum + Number(row.netAmount || 0);
    }, 0);

    const totalQty = updatedData.reduce((sum, row) => {
        return sum + Number(row.qty || 0);
    }, 0);

    const totalUnitPrice = updatedData.reduce((sum, row) => {
        return sum + Number(row.unitPrice || 0);
    }, 0);

    const totalDiscount = updatedData.reduce((sum, row) => {
        return sum + Number(row.discount || 0);
    }, 0);

    //  update first row
    updatedData[0].netAmount = totalNetAmount;
    updatedData[0].qty = totalQty;
    updatedData[0].unitPrice = totalUnitPrice;
    updatedData[0].discount = totalDiscount;

    return [updatedData[0]]; // only one grouped row
};

const addSystemRows = (rows, formData, entityMaster) => {

    let result = [...rows];

    //  GST
    const gstValue = Number(formData?.totalTaxAmount || 0);
    const gstLabel = entityMaster?.gst_applicable === true ? "Total GST" : "Total Tax";

    const gstRow = {
        id: "gst-row",
        type: "GST",
        description: gstLabel,
        qty: 1,
        unitPrice: gstValue,
        discount: 0,
        netAmount: gstValue,
        taxAmt: 0,
        isSystemRow: true,

        lineType: "",
        glCode: "",
        lob: "",
        department: "",
        customer: "",
        item: "",
    };

    result.push(gstRow);
    //  TDS (only if applicable)
    const isTdsApplicable = formData?.tds_applicability;
    const tdsRate = Number(formData?.tds_percentage || 0);
    const totalInvoiceAmount = Number(formData?.totalInvoiceAmount || 0);

    if (isTdsApplicable) {
        const tdsValue = roundTo2(-Math.abs((tdsRate) * totalInvoiceAmount));

        const tdsRow = {
            id: "tds-row",
            type: "TDS",
            description: "TDS Deduction",
            qty: 1,
            unitPrice: tdsValue,
            discount: 0,
            netAmount: tdsValue,
            taxAmt: 0,
            isSystemRow: true,

            lineType: "",
            glCode: "",
            lob: "",
            department: "",
            customer: "",
            item: "",
        };

        result.push(tdsRow);
    }
    return result;
};

const loadLineItemTable = (props) => {
    const { activeInvoiceData, quickViewFormData, vendor, isVendorChanged, entityMaster } = props;

    const isSaved = activeInvoiceData?.extracted_data?.isModified || false;

    let baseItems = [];
    //  CASE 1: Saved + NO vendor change → return snapshot
    if (isSaved && !isVendorChanged) {
        const snapshot = activeInvoiceData?.extracted_data?.lineItemsSnapshot;
        if (snapshot?.length) {
            // Map snake_case from backend snapshot to camelCase for frontend components
            return snapshot.map((item, index) => ({
                ...item,
                id: item.id || `snap-${index}`,
                qty: item.qty ?? item.quantity ?? 0,
                unitPrice: item.unitPrice ?? item.unit_price ?? 0,
                netAmount: item.netAmount ?? item.net_amount ?? 0,
                lineType: item.lineType ?? item.line_type ?? "Expense",
                glCode: item.glCode ?? item.gl_code ?? "",
                lob: item.lob ?? "",
                department: item.department ?? "",
                customer: item.customer ?? "",
                item: item.item ?? "",
                discount: item.discount ?? 0,
                taxAmt: item.taxAmt ?? 0
            }));
        }
    }

    //  CASE 2: Saved + vendor changed → recompute
    if (isSaved && isVendorChanged) {
        const snapshot = activeInvoiceData?.extracted_data?.OriginalItems?.value;
        baseItems = normalizeItems(snapshot).map(row => ({
            ...row,
            netAmount: calculateNetAmount(row)
        }));
    }

    //  CASE 3: Not saved → normal flow
    if (!isSaved) {
        const extracted_items = activeInvoiceData?.extracted_data?.Items?.value || [];

        baseItems = normalizeItems(extracted_items).map(row => ({
            ...row,
            netAmount: calculateNetAmount(row)
        }));
    }

    //  ALWAYS apply derived logic
    let processedRows =
        vendor?.line_grouping
            ? mergeIntoFirstRow(baseItems)
            : baseItems;

    const finalData = addSystemRows(processedRows, quickViewFormData, entityMaster);

    return finalData;
};

export default loadLineItemTable