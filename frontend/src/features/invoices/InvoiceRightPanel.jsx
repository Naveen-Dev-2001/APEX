import { useInvoiceStore } from "../../store/invoice.store";
import CustomTabs from "./CustomTabs";
import { lazy, Suspense } from "react";
import { Skeleton } from "antd";

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

    const { invoiceActiveTab, setInvoiceActiveTab, tabList, activeInvoiceData } = useInvoiceStore();
    
    // Determine status and explicitly filter out Coding tab if processed
    const status = (activeInvoiceData?.status || "").toLowerCase();
    const visibleTabs = status === "processed" ? tabList.filter(t => t !== "Coding") : tabList;
    
    // Safety check just in case state gets out of sync with the visible tabs
    const validActiveTab = visibleTabs.includes(invoiceActiveTab) ? invoiceActiveTab : (visibleTabs[0] || "Quick View");
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
                <Suspense fallback={<div className="p-4"><Skeleton active paragraph={{ rows: 12 }} /></div>}>
                    {ActiveComponent && <ActiveComponent invoice={invoice} />}
                </Suspense>
            </div>

        </div>
    );
};

export default InvoiceRightPanel;