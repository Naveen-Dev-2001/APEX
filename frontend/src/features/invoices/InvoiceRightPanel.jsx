import { useInvoiceStore } from "../../store/invoice.store";
import CustomTabs from "./CustomTabs";
import { lazy, Suspense } from "react";

const QuickViewTab = lazy(() => import("./tabs/QuickViewTab"));
const GLSummaryTab = lazy(() => import("./tabs/GLSummaryTab"));
const WorkflowTab = lazy(() => import("./tabs/WorkflowTab"));
const AuditTrailTab = lazy(() => import("./tabs/AuditTrailTab"));
const AllFieldsTab = lazy(() => import("./tabs/AllFieldsTab"));
const LineItemsTable = lazy(() => import("./tabs/LineItemsTable"));

const TAB_COMPONENTS = {
    "Quick View": QuickViewTab,
    "All Fields": AllFieldsTab,
    "GL Summary": GLSummaryTab,
    "Workflow": WorkflowTab,
    "Audit Trail": AuditTrailTab,
    "Line Items": LineItemsTable,
};

const InvoiceRightPanel = ({ invoice = {} }) => {

    const { invoiceActiveTab, setInvoiceActiveTab, tabList } = useInvoiceStore();
    const ActiveComponent = TAB_COMPONENTS[invoiceActiveTab];

    return (
        <div className="h-full flex flex-col">

            {/* Tabs (FIXED) */}
            <div className="flex-shrink-0">
                <CustomTabs
                    tabs={tabList}
                    activeTab={invoiceActiveTab}
                    onChange={setInvoiceActiveTab}
                />
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto mt-4">
                <Suspense fallback={<div className="p-4">Loading...</div>}>
                    {ActiveComponent && <ActiveComponent invoice={invoice} />}
                </Suspense>
            </div>

        </div>
    );
};

export default InvoiceRightPanel;