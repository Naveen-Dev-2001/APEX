import { useMemo, useState } from "react";
import CustomInput from "../../shared/components/CustomInput";
import { SearchOutlined, CloseCircleOutlined } from "@ant-design/icons";
import Dropdown from "../../components/ui/Dropdown";
import CustomButton from "../../shared/components/CustomButton";
import ReusableDataTable from "../../shared/components/ReusableDataTable";
import { useInvoiceData } from "../hooks/useInvoiceData";
import { getCondensedColumns, getFullColumns, VIEW_OPTIONS } from "./invoiceColumns";
import { useInvoiceStore } from "../../store/invoice.store";
import { Skeleton } from "antd";

const Invoice = () => {
    const [search, setSearch] = useState("");
    const { invoiceSection, skip, limit, view, setView, setInvoiceSection } = useInvoiceStore();
    const { invoices, total, isLoading } = useInvoiceData({ skip, limit });

    const handleView = (data) => {
        console.log("View", data);
        setInvoiceSection(2);
    }
    const handleDelete = (data) => {
        console.log("Delete", data);
    };

    const columnDefs = useMemo(
        () => view === "condensed"
            ? getCondensedColumns(handleView, handleDelete)
            : getFullColumns(handleView, handleDelete),
        [view]   // ← recompute only when view changes
    );


    return (
        <>
            {
                invoiceSection === 1 && (<>
                    <div className="p-4 bg-[#F7F7F7]">
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-3xl font-bold custom-font-jura">
                                Invoices <span className="text-base font-normal  px-2 py-1 rounded-3xl shadow-sm bg-[#E0E0E0] inline-block">
                                    234
                                </span>
                            </span>

                            <div className="flex items-center gap-3">
                                <div className="w-[300px]">
                                    <CustomInput
                                        placeholder="Search invoices..."
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        icon={<SearchOutlined />}
                                        rightIcon={search && <CloseCircleOutlined />}
                                        onRightIconClick={() => setSearch("")}
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
                                    <CustomButton variant="primary" type="button" >
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
                                searchText={search}
                                tableHeader={false}
                                tableSearch={false}
                                defaultPageSize={10}
                                shouldUseFlex={false}
                            />
                        )}
                    </div>
                </>)
            }
            {
                invoiceSection === 2 && (
                    <div className="p-4">
                        <h2 className="text-2xl font-bold mb-4">Invoice Details</h2>
                    </div>
                )

            }
        </>

    );
};

export default Invoice;