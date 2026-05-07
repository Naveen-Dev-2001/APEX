import React, { useState, useEffect } from 'react';
import { Modal, Select, Spin, Alert } from 'antd';
import { UserPlus, ArrowRightLeft, AlertCircle, Info, UserCheck, ShieldAlert } from 'lucide-react';
import { getDelegationInfo, delegateInvoice } from '../../api/invoiceApi';
import CustomButton from '../../shared/components/CustomButton';
import toast from '../../utils/toast';

const { Option } = Select;

const DelegateModal = ({ visible, onClose, invoiceId, onDelegateSuccess }) => {
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [data, setData] = useState({ current_approvers: [], eligible_users: [] });
    const [replaceValue, setReplaceValue] = useState(null); // Combined email|level
    const [assignToEmail, setAssignToEmail] = useState(null);

    useEffect(() => {
        if (visible && invoiceId) {
            fetchData();
        } else {
            // Reset state when closing
            setReplaceValue(null);
            setAssignToEmail(null);
        }
    }, [visible, invoiceId]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await getDelegationInfo(invoiceId);
            setData(res);
        } catch (err) {
            console.error('Error fetching delegation info:', err);
            toast.error('Failed to load delegation information');
            onClose();
        } finally {
            setLoading(false);
        }
    };

    const handleOk = async () => {
        if (!replaceValue || !assignToEmail) {
            toast.error('Please select both approvers');
            return;
        }

        const [email, level] = replaceValue.split('|');

        setSubmitting(true);
        try {
            const res = await delegateInvoice(invoiceId, {
                replace_email: email,
                assign_to_email: assignToEmail,
                level: parseInt(level)
            });
            if (res.success) {
                toast.success(res.message || 'Delegation successful');
                onDelegateSuccess();
                onClose();
            } else {
                toast.error(res.message || 'Delegation failed');
            }
        } catch (err) {
            console.error('Error delegating:', err);
            toast.error(err?.response?.data?.detail || 'Failed to delegate approvals');
        } finally {
            setSubmitting(false);
        }
    };

    const isActionDisabled = (() => {
        const selectedUser = data.eligible_users.find(u => u.email === assignToEmail);
        const isInvalid = selectedUser && (selectedUser.assigned_levels?.length > 0 || selectedUser.has_acted);
        return !replaceValue || !assignToEmail || isInvalid || submitting;
    })();

    return (
        <Modal
            open={visible}
            onCancel={onClose}
            footer={null}
            centered
            destroyOnClose
            width={520}
            closable={false}
            styles={{
                content: { padding: 0, borderRadius: '12px', overflow: 'hidden' },
                body: { padding: 0 }
            }}
        >
            <div className="flex flex-col bg-white">
                {/* Header */}
                <div className="px-6 py-3 border-b border-[#E0E0E0] flex items-center justify-between">
                    <h2 className="text-[15px] font-semibold text-[#2F3A4C] custom-font-jura">
                        Delegate Approvals
                    </h2>

                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 text-2xl cursor-pointer leading-none"
                    >
                        ×
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5 flex flex-col gap-5">
                    {loading ? (
                        <div className="flex flex-col justify-center items-center py-10 gap-3">
                            <Spin size="large" />
                            <p className="text-gray-400 text-sm">Loading approvers...</p>
                        </div>
                    ) : (
                        <>
                            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3.5 flex gap-3">
                                <Info size={18} className="text-blue-500 mt-0.5 shrink-0" />
                                <p className="text-[13px] text-blue-700 leading-snug">
                                    Replace a specifically assigned approver with another user for this invoice only.
                                </p>
                            </div>

                            {/* Replace User Section */}
                            <div className="space-y-1.5">
                                <label className="text-[13px] font-semibold text-gray-700">Replace User</label>
                                <Select
                                    placeholder="Select current approver"
                                    className="w-full h-10"
                                    value={replaceValue}
                                    onChange={setReplaceValue}
                                >
                                    {data.current_approvers.flatMap(item => {
                                        const email = typeof item === "string" ? item : item.email;
                                        const levels = item?.levels || [];
                                        return levels.map(lvl => ({
                                            email,
                                            level: lvl,
                                            label: `${email} (Level ${lvl})`,
                                            value: `${email}|${lvl}`
                                        }));
                                    }).map(opt => (
                                        <Option key={opt.value} value={opt.value}>
                                            <div className="flex items-center justify-between">
                                                <span>{opt.email}</span>
                                                <span className="text-[11px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded font-bold">
                                                    LEVEL {opt.level}
                                                </span>
                                            </div>
                                        </Option>
                                    ))}
                                </Select>
                                <p className="text-[11px] text-gray-400">Only specifically assigned approvers can be replaced.</p>
                            </div>

                            {/* Assign To Section */}
                            <div className="space-y-1.5">
                                <label className="text-[13px] font-semibold text-gray-700">Assign To</label>
                                <Select
                                    placeholder="Select replacement user"
                                    className="w-full h-10"
                                    showSearch
                                    optionFilterProp="children"
                                    optionLabelProp="label"
                                    value={assignToEmail}
                                    onChange={setAssignToEmail}
                                >
                                    {data.eligible_users.map(user => (
                                        <Option 
                                            key={user.email} 
                                            value={user.email}
                                            label={`${user.username} (${user.email})`}
                                        >
                                            <div className="flex flex-col py-0.5">
                                                <span className="font-medium text-gray-800 leading-tight">
                                                    {user.username} <span className="text-[11px] text-gray-400 font-normal">({user.email})</span>
                                                </span>
                                                <span className="text-[10px] text-blue-500 font-bold uppercase tracking-wider mt-0.5">
                                                    {user.role || 'User'} {user.department ? `• ${user.department}` : ''}
                                                </span>
                                            </div>
                                        </Option>
                                    ))}
                                </Select>
                                <p className="text-[11px] text-gray-400">Users already assigned or who have already acted are excluded.</p>
                            </div>

                            {/* Error Message */}
                            {(() => {
                                const selectedUser = data.eligible_users.find(u => u.email === assignToEmail);
                                if (!selectedUser) return null;

                                const isAlreadyAssigned = selectedUser.assigned_levels && selectedUser.assigned_levels.length > 0;
                                const hasActed = selectedUser.has_acted;

                                if (isAlreadyAssigned || hasActed) {
                                    const reason = isAlreadyAssigned 
                                        ? `they are a Level ${selectedUser.assigned_levels.join(', ')} approver`
                                        : `they have already acted on this invoice`;
                                    return (
                                        <div className="p-3 bg-red-50 border border-red-100 rounded-lg flex gap-2.5 items-start">
                                            <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                                            <p className="text-xs text-red-600 font-medium">
                                                Cannot delegate to {selectedUser.username} because {reason}.
                                            </p>
                                        </div>
                                    );
                                }
                                return null;
                            })()}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 bg-gray-50 border-t border-[#E0E0E0] flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-5 py-1.5 text-[13px] rounded-md border border-gray-300 text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleOk}
                        disabled={isActionDisabled}
                        className={`px-5 py-1.5 text-[13px] rounded-md text-white transition-colors cursor-pointer ${
                            isActionDisabled ? 'bg-gray-300 cursor-not-allowed' : 'bg-[#22B4E6] hover:bg-[#1DA1D1]'
                        }`}
                    >
                        {submitting ? 'Delegating...' : 'Delegate'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default DelegateModal;
