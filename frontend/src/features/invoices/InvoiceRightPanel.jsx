import { useInvoiceStore } from "../../store/invoice.store";
import CustomTabs from "./CustomTabs";
import { lazy, Suspense, useState, useEffect } from "react";
import React from "react";
import { Skeleton } from "antd";

const QuickViewTab = React.memo(lazy(() => import("./tabs/QuickViewTab")));
const GLSummaryTab = React.memo(lazy(() => import("./tabs/GLSummaryTab")));
const WorkflowTab = React.memo(lazy(() => import("./tabs/WorkflowTab")));
const AuditTrailTab = React.memo(lazy(() => import("./tabs/AuditTrailTab")));
const AllFieldsTab = React.memo(lazy(() => import("./tabs/AllFieldsTab")));
const CodingTab = React.memo(lazy(() => import("./tabs/CodingTab")));

const TAB_COMPONENTS = {
    "Quick View": QuickViewTab,
    "All Fields": AllFieldsTab,
    "GL Summary": GLSummaryTab,
    "Workflow": WorkflowTab,
    "Audit Trail": AuditTrailTab,
    "Coding": CodingTab,
};

const TabContent = React.memo(({ tabName, isActive }) => {
    const Component = TAB_COMPONENTS[tabName];
    if (!Component) return null;

    return (
        <div
            className="h-full overflow-y-auto"
            style={{ display: isActive ? 'block' : 'none' }}
        >
            <Suspense fallback={<div className="p-4"><Skeleton active paragraph={{ rows: 12 }} /></div>}>
                {/* Pass isActive so heavy tabs (e.g. CodingTab) can defer data fetching */}
                <Component isActive={isActive} />
            </Suspense>
        </div>
    );
});

const InvoiceRightPanel = ({ invoice = {} }) => {

    const { invoiceActiveTab, setInvoiceActiveTab, tabList, activeInvoiceData } = useInvoiceStore();

    // Determine status and explicitly filter out Coding tab if processed
    const status = (activeInvoiceData?.status || "").toLowerCase();
    const visibleTabs = status === "processed" ? tabList.filter(t => t !== "Coding") : tabList;

    // Safety check just in case state gets out of sync with the visible tabs
    const validActiveTab = visibleTabs.includes(invoiceActiveTab) ? invoiceActiveTab : (visibleTabs[0] || "Quick View");

    // Keep track of which tabs have been rendered to avoid mounting them until needed
    const [renderedTabs, setRenderedTabs] = useState(() => new Set([validActiveTab]));

    useEffect(() => {
        setRenderedTabs(prev => {
            if (prev.has(validActiveTab)) return prev;
            const next = new Set(prev);
            next.add(validActiveTab);
            return next;
        });
    }, [validActiveTab]);

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
            <div className="flex-1 overflow-hidden mt-4 relative">
                {visibleTabs.map(tabName => {
                    // Only render tabs that have been visited
                    if (!renderedTabs.has(tabName)) return null;

                    return (
                        <TabContent
                            key={tabName}
                            tabName={tabName}
                            isActive={validActiveTab === tabName}
                        />
                    );
                })}
            </div>

        </div>
    );
};

export default InvoiceRightPanel;