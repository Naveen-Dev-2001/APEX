import React, { useCallback, useMemo } from 'react';
import { formatCurrency } from '../../utils/formatters';
import Card from './charts/Card';
import { icons } from '../../file';
import BarChart from './charts/BarChart';
import DonutChart from './charts/DonutChart';
import { useDashboardData } from '../hooks/useDashboardData';
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";
import { Spin } from "antd";

const CARD_SKELETONS = Array(4).fill(0);
const CHART_SKELETONS = Array(2).fill(0);

const DashboardPage = React.memo(() => {
    const { summary, aging, status, vendors, topVendors, isLoading, isFetching } = useDashboardData();

    // ─── Mappers ────────────────────────────────────────────────────────────────

    const mapAgingDynamic = useCallback((data = {}) => {
        const order = ["0_30", "31_60", "61_90", "91_120", "120_plus"];
        const entries = order
            .filter(key => key in data)
            .map(key => [key, data[key]]);
        const x = entries.map(([key]) =>
            key === "120_plus" ? "120+ Days" : key.replaceAll("_", " - ")
        );
        const y = entries.map(([, value]) => value || 0);
        const yMax = y.length ? Math.ceil(Math.max(...y) * 1.2) : 10;
        return { x, y, yMax };
    }, []);

    const mapStatusData = useCallback((data = {}) => {
        const labelMap = {
            processed: "Processed",
            waiting_coding: "Waiting For Coding",
            waiting_approval: "Waiting Approval",
            approved: "Approved",
            rejected: "Rejected",
            reworked: "Reworked",
            uploading: "Uploading",
            sage_posted: "Sage Posted",
            sage_post_failed: "Sage Post Failed",
            archived: "Archived",
            deleted: "Deleted",
        };
        const entries = Object.entries(data).filter(([, value]) => value > 0);
        const labels = entries.map(([key]) => labelMap[key] || key);
        const values = entries.map(([, value]) => value);
        const total = values.reduce((sum, v) => sum + v, 0);
        return { labels, values, total };
    }, []);

    const mapVendorsByAmount = useCallback((data = {}) => {
        const items = data?.by_amount || [];
        const x = items.map(({ vendor }) => vendor.replace(/\s+/g, " ").trim());
        const y = items.map(({ amount }) => amount || 0);
        const yMax = y.length ? Math.ceil(Math.max(...y) * 1.2) : 10;
        return { x, y, yMax };
    }, []);

    const mapTopVendors = useCallback((data = []) => {
        const x = data.map(({ vendor }) => vendor.replace(/\s+/g, " ").trim());
        const y = data.map(({ count }) => count || 0);
        const yMax = y.length ? Math.ceil(Math.max(...y) * 1.2) : 10;
        return { x, y, yMax };
    }, []);

    // ─── Derived Data ────────────────────────────────────────────────────────────

    const { x: agingX, y: agingY, yMax: agingYMax } = useMemo(
        () => mapAgingDynamic(aging),
        [aging, mapAgingDynamic]
    );

    const { labels: statusLabels, values: statusValues, total: statusTotal } = useMemo(
        () => mapStatusData(status),
        [status, mapStatusData]
    );

    const { x: vendorX, y: vendorY, yMax: vendorYMax } = useMemo(
        () => mapVendorsByAmount(vendors),
        [vendors, mapVendorsByAmount]
    );

    const { x: topVendorX, y: topVendorY, yMax: topVendorYMax } = useMemo(
        () => mapTopVendors(topVendors),
        [topVendors, mapTopVendors]
    );

    // ─── Memoized Colors ─────────────────────────────────────────────────────────

    const vendorColors = useMemo(
        () => Array(vendorY.length).fill("#24A1DD"),
        [vendorY.length]
    );

    const topVendorColors = useMemo(
        () => Array(topVendorY.length).fill("#24A1DD"),
        [topVendorY.length]
    );

    // ─── Render ──────────────────────────────────────────────────────────────────

    return (
        <div className="relative bg-[#F7F7F7] p-2 space-y-4 min-h-[400px]">
            {/* Header Area */}
            {/* <div className="flex flex-col gap-1 px-2">
                <h1 className="text-2xl font-extrabold text-[#333333]">Dashboard</h1>
            </div> */}

            {/* Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {isLoading ? (
                    CARD_SKELETONS.map((_, i) => (
                        <Skeleton
                            key={i}
                            height={100}
                            borderRadius={16}
                            baseColor="#e5e7eb"
                            highlightColor="#f9fafb"
                            duration={1.5}
                        />
                    ))
                ) : (
                    <>
                        <Card icon={icons.invoice} title="Total Invoices" value={summary?.total_invoices} />
                        <Card
                            icon={icons.overdue}
                            title="Total Overdue"
                            value={formatCurrency(summary?.total_due || 0)}
                        />
                        <Card icon={icons.approved} title="Posted to Sage" value={summary?.sage_posted} />
                        <Card icon={icons.pending} title="Pending Approval" value={summary?.waiting_approval} />
                    </>
                )}
            </div>

            {/* Charts Row 1 — Aging + Status */}
            <div className="flex gap-4">
                <div className="w-[50%]">
                    {isLoading ? (
                        <Skeleton height={300} borderRadius={16} />
                    ) : (
                        <BarChart
                            title="Payables Aging"
                            x={agingX}
                            y={agingY}
                            yMax={agingYMax}
                            unit=""
                        />
                    )}
                </div>
                <div className="w-[50%]">
                    {isLoading ? (
                        <Skeleton height={300} borderRadius={16} />
                    ) : (
                        <DonutChart
                            title="Status Breakdown"
                            labels={statusLabels}
                            values={statusValues}
                            centerText="Total"
                            centerValue={statusTotal}
                        />
                    )}
                </div>
            </div>

            {/* Charts Row 2 — Vendors */}
            <div className="flex gap-4">
                <div className="w-[50%]">
                    {isLoading ? (
                        <Skeleton height={300} borderRadius={16} />
                    ) : (
                        <BarChart
                            title="Vendors by Amount"
                            x={vendorX}
                            y={vendorY}
                            yMax={vendorYMax}
                            colors={vendorColors}
                            unit=""
                        />
                    )}
                </div>
                <div className="w-[50%]">
                    {isLoading ? (
                        <Skeleton height={300} borderRadius={16} />
                    ) : (
                        <BarChart
                            title="Top Vendors"
                            x={topVendorX}
                            y={topVendorY}
                            yMax={topVendorYMax}
                            colors={topVendorColors}
                            unit=""
                        />
                    )}
                </div>
            </div>

            {isFetching && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
                    <div className="flex flex-col items-center gap-3">
                        <Spin size="large" />
                        <span className="text-xs font-semibold tracking-wide text-[#2F5D7C] uppercase">
                            Loading Dashboard Data...
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
});

export default DashboardPage;