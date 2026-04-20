import { useInvoiceStore } from "../../store/invoice.store";
import CustomTabs from "./CustomTabs";
import { lazy, Suspense } from "react";

const QuickViewTab = lazy(() => import("./tabs/QuickViewTab"));
const GLSummaryTab = lazy(() => import("./tabs/GLSummaryTab"));
const WorkflowTab = lazy(() => import("./tabs/WorkflowTab"));
const AuditTrailTab = lazy(() => import("./tabs/AuditTrailTab"));
const AllFieldsTab = lazy(() => import("./tabs/AllFieldsTab"));
const CodingTab = lazy(() => import("./tabs/CodingTab"));

const TAB_COMPONENTS = {
    "Quick View": QuickViewTab,
    "All Fields": AllFieldsTab,
    "GL Summary": GLSummaryTab,
    "Workflow": WorkflowTab,
    "Audit Trail": AuditTrailTab,
    "Coding": CodingTab,
};

const InvoiceRightPanel = ({ invoice = {} }) => {

    const { invoiceActiveTab, setInvoiceActiveTab, tabList } = useInvoiceStore();
    
    // Determine status and explicitly filter out Coding tab if processed
    const status = (invoice?.status || "").toLowerCase();
    const visibleTabs = tabList.filter(t => status === "processed" ? t !== "Coding" : true);
    
    // Safety check just in case state gets out of sync with the visible tabs
    const validActiveTab = visibleTabs.includes(invoiceActiveTab) ? invoiceActiveTab : "Quick View";
    const ActiveComponent = TAB_COMPONENTS[validActiveTab];

    return (
        <div className="h-full flex flex-col">

            {/* Tabs (FIXED) */}
            <div className="flex-shrink-0">
                <CustomTabs
                    tabs={visibleTabs}
                    activeTab={validActiveTab}
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