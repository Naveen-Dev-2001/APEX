import React, { useCallback, useMemo } from 'react';
import Card from './charts/Card';
import { icons } from '../../file';
import BarChart from './charts/BarChart';
import DonutChart from './charts/DonutChart';
import { useDashboardData } from '../hooks/useDashboardData';
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";

const CARD_SKELETONS = Array(4).fill(0);
const CHART_SKELETONS = Array(2).fill(0);

const DashboardPage = React.memo(() => {
    const { summary, aging, status, vendors, topVendors, isLoading } = useDashboardData();

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
            waiting_coding: "Waiting Coding",
            waiting_approval: "Waiting Approval",
            approved: "Approved",
            rejected: "Rejected",
            reworked: "Reworked",
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
        const y = data.map(({ total }) => total || 0);
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
        <div className="bg-[#F7F7F7] p-2 space-y-2 overflow-y-auto h-[calc(90vh-5px)]">

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
                        <Card icon={icons.overdue} title="Total Overdue" value={summary?.total_due} />
                        <Card icon={icons.approved} title="Approved" value={summary?.approved} />
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

        </div>
    );
});

export default DashboardPage;