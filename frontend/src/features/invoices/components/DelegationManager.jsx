import React, { useState, useEffect } from 'react';
import { Modal, Form, Select, DatePicker, Button, Table, Space, Tag } from 'antd';
import { createDelegation, getDelegations, deleteDelegation } from '../../../api/delegationApi';
import { useAuthStore } from '../../../store/authStore';
import toast from '../../../utils/toast';

const { Option } = Select;

const DelegationManager = ({ isAdmin = false, onUpdate, approvers = [] }) => {
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(false);
    const [delegations, setDelegations] = useState([]);
    const user = useAuthStore((state) => state.user);

    const fetchDelegations = async () => {
        try {
            const data = await getDelegations();
            setDelegations(data);
        } catch (error) {
            console.error('Failed to fetch delegations:', error);
            toast.error('Failed to fetch delegations');
        }
    };

    useEffect(() => {
        fetchDelegations();
        if (!isAdmin && user?.email) {
            form.setFieldsValue({ original_approver: user.email });
        }
    }, [isAdmin, user?.email, form]);

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

    const columns = [
        {
            title: 'Original Approver',
            dataIndex: 'original_approver',
            key: 'original_approver',
            render: (email) => <span className="text-gray-700">{email}</span>
        },
        {
            title: 'Substitute',
            dataIndex: 'substitute_approver',
            key: 'substitute_approver',
            render: (email) => <span className="text-gray-700">{email}</span>
        },
        {
            title: 'Start Date',
            dataIndex: 'start_date',
            key: 'start_date',
            render: (date) => <span className="text-gray-600">{date}</span>
        },
        {
            title: 'End Date',
            dataIndex: 'end_date',
            key: 'end_date',
            render: (date) => <span className="text-gray-600">{date}</span>
        },
        {
            title: 'Status',
            key: 'status',
            render: (_, record) => {
                const now = new Date();
                now.setHours(0, 0, 0, 0);
                const start = new Date(record.start_date);
                start.setHours(0, 0, 0, 0);
                const end = new Date(record.end_date);
                end.setHours(0, 0, 0, 0);

                if (now.getTime() >= start.getTime() && now.getTime() <= end.getTime()) {
                    return <Tag color="green">Active</Tag>;
                } else if (now.getTime() < start.getTime()) {
                    return <Tag color="blue">Scheduled</Tag>;
                } else {
                    return <Tag color="default">Expired</Tag>;
                }
            }
        },
        {
            title: 'Action',
            key: 'action',
            render: (_, record) => (
                <Button type="link" danger onClick={() => handleRevert(record.id)} className="p-0">
                    Revert
                </Button>
            ),
        },
    ];

    return (
        <div className="bg-white p-6 rounded-lg shadow-sm">
            <Form form={form} layout="vertical" onFinish={handleCreate} className="mb-8">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                    <Form.Item
                        name="original_approver"
                        label="From Approver"
                        rules={[{ required: true }]}
                        className="mb-0"
                    >
                        <Select disabled={!isAdmin} placeholder="Select Approver" className="w-full">
                            {approvers.map(a => (
                                <Option key={a.value} value={a.value}>{a.label}</Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item
                        name="substitute_approver"
                        label="To Substitute"
                        rules={[{ required: true }]}
                        className="mb-0"
                    >
                        <Select showSearch optionFilterProp="children" placeholder="Select Substitute" className="w-full">
                            {approvers.map(a => (
                                <Option key={a.value} value={a.value}>{a.label}</Option>
                            ))}
                        </Select>
                    </Form.Item>
                    <Form.Item
                        name="start_date"
                        label="Start Date"
                        rules={[{ required: true }]}
                        className="mb-0"
                    >
                        <DatePicker className="w-full" />
                    </Form.Item>
                    <Form.Item
                        name="end_date"
                        label="End Date"
                        rules={[{ required: true }]}
                        className="mb-0"
                    >
                        <DatePicker className="w-full" />
                    </Form.Item>
                    <div className="flex justify-end">
                        <Button type="primary" htmlType="submit" loading={loading} className="bg-[#1e9bd8] hover:bg-[#1589c3]">
                            Add Delegation
                        </Button>
                    </div>
                </div>
            </Form>

            <Table
                dataSource={delegations}
                columns={columns}
                rowKey="id"
                pagination={{ pageSize: 5 }}
                size="middle"
                className="delegation-table"
                locale={{ emptyText: 'No delegations found' }}
            />
        </div>
    );
};

export default DelegationManager;
