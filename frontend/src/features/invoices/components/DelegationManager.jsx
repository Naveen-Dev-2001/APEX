import React, { useState, useEffect, useMemo } from 'react';
import { Form, Select, DatePicker, Button } from 'antd';
import { createDelegation, getDelegations, deleteDelegation } from '../../../api/delegationApi';
import { useAuthStore } from '../../../store/authStore';
import toast from '../../../utils/toast';
import ReusableDataTable from '../../../shared/components/ReusableDataTable';

const { Option } = Select;

const DelegationManager = ({ isAdmin = false, onUpdate, approvers = [] }) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [tableLoading, setTableLoading] = useState(false);
    const [delegations, setDelegations] = useState([]);
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

    const columnDefs = useMemo(() => [
        {
            headerName: "S.no",
            valueGetter: "node.rowIndex + 1",
            width: 80,
            pinned: "left",
        },
        {
            headerName: 'Original Approver',
            field: 'original_approver',
            flex: 1.5,
            minWidth: 200,
        },
        {
            headerName: 'Substitute',
            field: 'substitute_approver',
            flex: 1.5,
            minWidth: 200,
        },
        {
            headerName: 'Start Date',
            field: 'start_date',
            flex: 1,
            minWidth: 120,
        },
        {
            headerName: 'End Date',
            field: 'end_date',
            flex: 1,
            minWidth: 120,
        },
        {
            headerName: 'Status',
            field: 'status',
            flex: 1,
            minWidth: 100,
            cellRenderer: (params) => {
                const now = new Date();
                now.setHours(0, 0, 0, 0);
                const start = new Date(params.data.start_date);
                start.setHours(0, 0, 0, 0);
                const end = new Date(params.data.end_date);
                end.setHours(0, 0, 0, 0);

                let color = 'bg-gray-100 text-gray-600';
                let label = 'Expired';

                if (now.getTime() >= start.getTime() && now.getTime() <= end.getTime()) {
                    color = 'bg-green-100 text-green-600';
                    label = 'Active';
                } else if (now.getTime() < start.getTime()) {
                    color = 'bg-blue-100 text-blue-600';
                    label = 'Scheduled';
                }

                return (
                    <div className="flex items-center h-full">
                        <span className={`px-3 py-1 rounded-full text-[12px] font-medium border ${color}`}>
                            {label}
                        </span>
                    </div>
                );
            }
        },
        {
            headerName: 'Action',
            field: 'action',
            width: 100,
            pinned: 'right',
            cellRenderer: (params) => (
                <div className="flex items-center h-full">
                    <button
                        onClick={() => handleRevert(params.data.id)}
                        className="text-red-500 hover:text-red-700 font-medium transition-colors cursor-pointer"
                    >
                        Revert
                    </button>
                </div>
            )
        }
    ], []);

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

            <div className="mt-6 border border-gray-100 rounded-lg overflow-hidden">
                <ReusableDataTable
                    title="Delegations"
                    columnDefs={columnDefs}
                    data={delegations}
                    loading={tableLoading}
                    tableSearch={false}
                    tableHeader={false}
                    rowHeight={52}
                    shouldUseFlex={true}
                />
            </div>
        </div>
    );
};

export default DelegationManager;
