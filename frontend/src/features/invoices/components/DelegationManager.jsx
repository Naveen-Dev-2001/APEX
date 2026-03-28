import React, { useState, useEffect, useMemo } from 'react';
import { Form, Select, DatePicker, Button } from 'antd';
import { createDelegation, getDelegations, deleteDelegation } from '../../../api/delegationApi';
import { useAuthStore } from '../../../store/authStore';
import toast from '../../../utils/toast';
import DataTable from '../../../components/ui/DataTable';

const { Option } = Select;

const DelegationManager = ({ isAdmin = false, onUpdate, approvers = [] }) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [tableLoading, setTableLoading] = useState(false);
    const [delegations, setDelegations] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(15);
    const [sortColumn, setSortColumn] = useState(null);
    const [sortDirection, setSortDirection] = useState('asc');
    const user = useAuthStore((state) => state.user);

    const fetchDelegations = async () => {
        setTableLoading(true);
        try {
            const data = await getDelegations();
            // Transform data for the data table
            setDelegations(data.map((d, index) => ({ ...d, s_no: index + 1 })));
        } catch (error) {
            console.error('Failed to fetch delegations:', error);
            toast.error('Failed to fetch delegations');
        } finally {
            setTableLoading(false);
        }
    };

    useEffect(() => {
        fetchDelegations();
        if (user?.email) {
            form.setFieldsValue({ original_approver: user.email });
        }
    }, [user?.email, form]);

    const handleCreate = async (values) => {
        setLoading(true);
        try {
            const startDate = values.start_date.format('YYYY-MM-DD');
            const endDate = values.end_date.format('YYYY-MM-DD');

            if (new Date(startDate) > new Date(endDate)) {
                toast.error('End date cannot be before start date');
                setLoading(false);
                return;
            }

            const payload = {
                original_approver: values.original_approver,
                substitute_approver: values.substitute_approver,
                start_date: startDate,
                end_date: endDate,
            };
            await createDelegation(payload);
            toast.success('Delegation created successfully');
            form.resetFields();
            if (!isAdmin && user?.email) {
                form.setFieldsValue({ original_approver: user.email });
            }
            fetchDelegations();
            if (onUpdate) onUpdate();
        } catch (error) {
            toast.error(error.response?.data?.detail || 'Failed to create delegation');
        } finally {
            setLoading(false);
        }
    };

    const handleRevert = async (id) => {
        try {
            await deleteDelegation(id);
            toast.success('Delegation reverted');
            fetchDelegations();
            if (onUpdate) onUpdate();
        } catch (error) {
            toast.error('Failed to revert delegation');
        }
    };

    const handleSort = (column) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    const columnDefs = useMemo(() => [
        {
            header: 'Original Approver',
            accessor: 'original_approver',
            sortable: true,
            onClick: () => handleSort('original_approver')
        },
        {
            header: 'Substitute',
            accessor: 'substitute_approver',
            sortable: true,
            onClick: () => handleSort('substitute_approver')
        },
        {
            header: 'Start Date',
            accessor: 'start_date',
            sortable: true,
            onClick: () => handleSort('start_date'),
            render: (val) => val ? val.split('T')[0] : '-'
        },
        {
            header: 'End Date',
            accessor: 'end_date',
            sortable: true,
            onClick: () => handleSort('end_date'),
            render: (val) => val ? val.split('T')[0] : '-'
        },
        {
            header: 'Status',
            accessor: 'status',
            render: (val, row) => {
                const now = new Date();
                now.setHours(0, 0, 0, 0);
                const start = new Date(row.start_date);
                start.setHours(0, 0, 0, 0);
                const end = new Date(row.end_date);
                end.setHours(0, 0, 0, 0);

                let color = 'bg-green-50 text-green-500 border-green-100';
                let label = 'Active';

                if (now.getTime() < start.getTime()) {
                    color = 'bg-blue-50 text-blue-500 border-blue-100';
                    label = 'Scheduled';
                } else if (now.getTime() > end.getTime()) {
                    color = 'bg-gray-50 text-gray-400 border-gray-100';
                    label = 'Expired';
                }

                return (
                    <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${color}`}>
                        {label}
                    </span>
                );
            }
        },
        {
            header: 'Action',
            accessor: 'action',
            render: (val, row) => (
                <button
                    onClick={() => handleRevert(row.id)}
                    className="text-red-500 hover:text-red-700 font-medium transition-colors cursor-pointer text-[13px]"
                >
                    Revert
                </button>
            )
        }
    ], [sortColumn, sortDirection]);

    const sortedAndPaginatedDelegations = useMemo(() => {
        let result = [...delegations];
        
        // Sort
        if (sortColumn) {
            result.sort((a, b) => {
                const valA = a[sortColumn] || '';
                const valB = b[sortColumn] || '';
                if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
                if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
                return 0;
            });
        }

        // Paginate
        const start = (currentPage - 1) * itemsPerPage;
        return result.slice(start, start + itemsPerPage);
    }, [delegations, currentPage, itemsPerPage, sortColumn, sortDirection]);

    return (
        <div className="bg-white p-6 rounded-lg shadow-sm">
            <Form 
                form={form} 
                layout="vertical" 
                onFinish={handleCreate} 
                className="mb-8"
                requiredMark={false} 
            >
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                    <Form.Item
                        name="original_approver"
                        label={<span className="font-creato">* From Approver</span>}
                        rules={[{ required: true }]}
                        className="mb-0"
                    >
                        <Select disabled={true} placeholder="Select Approver" className="w-full font-creato custom-input-height">
                            {[
                                ...approvers,
                                // Add current user to options if not present so it shows the label instead of email
                                ...(!approvers.some(a => a.value === user?.email) && user?.email ? [{
                                    value: user.email, 
                                    label: `${user.username || user.email.split('@')[0]} (${user.email})` 
                                }] : [])
                            ].map(a => (
                                <Option key={a.value} value={a.value}>{a.label}</Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item
                        name="substitute_approver"
                        label={<span className="font-creato">* To Substitute</span>}
                        rules={[{ required: true }]}
                        className="mb-0"
                    >
                        <Select 
                            showSearch 
                            optionFilterProp="children" 
                            placeholder="Select Approver" 
                            className="w-full font-creato custom-input-height"
                        >
                            {approvers.map(a => (
                                <Option key={a.value} value={a.value}>{a.label}</Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item
                        name="start_date"
                        label={<span className="font-creato">* Start Date</span>}
                        rules={[{ required: true }]}
                        className="mb-0"
                    >
                        <DatePicker placeholder="Start Date" className="w-full font-creato custom-input-height" />
                    </Form.Item>
                    <Form.Item
                        name="end_date"
                        label={<span className="font-creato">* End Date</span>}
                        rules={[{ required: true }]}
                        className="mb-0"
                    >
                        <DatePicker placeholder="End Date" className="w-full font-creato custom-input-height" />
                    </Form.Item>
                    <Form.Item label=" " className="mb-0">
                        <Button 
                            type="primary" 
                            htmlType="submit" 
                            loading={loading} 
                            className="w-full custom-input-height bg-[#1e9bd8] hover:bg-[#1589c3] rounded-lg font-medium font-creato border-none flex items-center justify-center text-[14px]"
                        >
                            Add Delegation
                        </Button>
                    </Form.Item>
                </div>
            </Form>

            <div className="mt-6">
                <DataTable
                    columns={columnDefs}
                    data={sortedAndPaginatedDelegations}
                    loading={tableLoading}
                    totalItems={delegations.length}
                    currentPage={currentPage}
                    itemsPerPage={itemsPerPage}
                    onPageChange={setCurrentPage}
                    onItemsPerPageChange={setItemsPerPage}
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                />
            </div>
        </div>
    );
};

export default DelegationManager;
