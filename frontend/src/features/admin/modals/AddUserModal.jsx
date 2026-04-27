import React, { useState, useEffect } from 'react';
import CustomButton from '../../../shared/components/CustomButton';
import Dropdown from '../../../components/ui/Dropdown';
import { X } from 'lucide-react';

const AddUserModal = ({ isOpen, onClose, onAdd, roles = [], isUpdating }) => {
    const [form, setForm] = useState({ 
        username: '', 
        email: '', 
        password: 'Apex2026', 
        role: 'approver', 
        department: '',
        status: 'active'
    });
    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (isOpen) {
            setForm({ 
                username: '', 
                email: '', 
                password: 'Apex2026', 
                role: 'approver', 
                department: '',
                status: 'active'
            });
            setErrors({});
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const validate = () => {
        const newErrors = {};
        if (!form.username.trim()) newErrors.username = 'Username is required';
        if (!form.email.trim()) {
            newErrors.email = 'Email is required';
        } else if (!/\S+@\S+\.\S+/.test(form.email)) {
            newErrors.email = 'Invalid email format';
        }
        if (!form.password.trim()) newErrors.password = 'Password is required';
        if (!form.role) newErrors.role = 'Role is required';
        if (!form.department) {
            newErrors.department = 'Department is required';
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const roleOptions = roles?.map(r => ({ label: r.charAt(0).toUpperCase() + r.slice(1), value: r }));

    const handleSubmit = (e) => {
        e.preventDefault();
        if (validate()) {
            const payload = {
                ...form
            };
            onAdd(payload);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] flex items-center justify-center z-[5000] p-4 animate-fadeIn">
            <div className="bg-white rounded-xl shadow-2xl w-[480px] overflow-hidden animate-scaleIn border border-gray-100">
                {/* Header */}
                <div className="px-5 py-3.5 bg-white border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-gray-50/50 to-white">
                    <div className="flex flex-col">
                        <h3 className="text-lg font-bold text-gray-800 tracking-tight">Create New User</h3>
                        <p className="text-[11px] text-gray-500 mt-0.5">Add a new staff member to the system</p>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-full transition-all duration-200"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body - Scrollable */}
                <form 
                    onSubmit={handleSubmit} 
                    noValidate
                    className="flex flex-col h-full max-h-[calc(85vh-100px)]"
                >
                    <div className="p-5 space-y-4 overflow-y-auto custom-scrollbar flex-1">
                        <div className="grid grid-cols-1 gap-4">
                            <div className="space-y-1 relative">
                                <label className="text-[13px] font-semibold text-gray-700 ml-0.5 flex items-center">
                                    Username <span className="text-red-500 ml-1">*</span>
                                </label>
                                <input
                                    type="text"
                                    className={`w-full border rounded-lg px-4 py-2.5 text-sm outline-none transition-all duration-200 hover:bg-white ${
                                        errors.username 
                                            ? 'border-red-400 focus:ring-4 focus:ring-red-500/10' 
                                            : 'border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 bg-gray-50/30'
                                    }`}
                                    value={form.username}
                                    onChange={(e) => {
                                        setForm({ ...form, username: e.target.value });
                                        if (errors.username) setErrors({ ...errors, username: '' });
                                    }}
                                    placeholder="Enter full name"
                                />
                                {errors.username && <p className="text-[10px] text-red-500 ml-0.5 mt-0.5">{errors.username}</p>}
                            </div>

                            <div className="space-y-1 relative">
                                <label className="text-[13px] font-semibold text-gray-700 ml-0.5 flex items-center">
                                    Email Address <span className="text-red-500 ml-1">*</span>
                                </label>
                                <input
                                    type="email"
                                    className={`w-full border rounded-lg px-4 py-2.5 text-sm outline-none transition-all duration-200 hover:bg-white ${
                                        errors.email 
                                            ? 'border-red-400 focus:ring-4 focus:ring-red-500/10' 
                                            : 'border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 bg-gray-50/30'
                                    }`}
                                    value={form.email}
                                    onChange={(e) => {
                                        setForm({ ...form, email: e.target.value });
                                        if (errors.email) setErrors({ ...errors, email: '' });
                                    }}
                                    placeholder="user@domain.com"
                                />
                                {errors.email && <p className="text-[10px] text-red-500 ml-0.5 mt-0.5">{errors.email}</p>}
                            </div>

                            <div className="space-y-1 relative">
                                <label className="text-[13px] font-semibold text-gray-700 ml-0.5 flex items-center">
                                    Login Password <span className="text-red-500 ml-1">*</span>
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        className={`w-full border rounded-lg px-4 py-2.5 text-sm outline-none transition-all duration-200 hover:bg-white pr-10 ${
                                            errors.password 
                                                ? 'border-red-400 focus:ring-4 focus:ring-red-500/10' 
                                                : 'border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 bg-gray-50/30'
                                        }`}
                                        value={form.password}
                                        onChange={(e) => {
                                            setForm({ ...form, password: e.target.value });
                                            if (errors.password) setErrors({ ...errors, password: '' });
                                        }}
                                        placeholder="••••••••"
                                    />
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 group cursor-help" title="Default password is Apex2026">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                    </div>
                                </div>
                                {errors.password ? (
                                    <p className="text-[10px] text-red-500 ml-0.5 mt-0.5">{errors.password}</p>
                                ) : (
                                    <p className="text-[10px] text-gray-400 italic mt-1 font-medium">Default set to Apex2026. User must change on first login.</p>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <Dropdown
                                        label="User Role"
                                        required
                                        value={form.role}
                                        options={roleOptions}
                                        error={errors.role}
                                        className="!gap-1"
                                        onChange={(val) => {
                                            setForm({ ...form, role: val });
                                            if (errors.role) setErrors({ ...errors, role: '' });
                                        }}
                                    />
                                </div>
                                <div className="space-y-1 animate-fadeIn">
                                    <Dropdown
                                        label="Department"
                                        required
                                        value={form.department || ''}
                                        options={[
                                            { label: 'Finance Team', value: 'finance' },
                                            { label: 'Non-Finance Team', value: 'non-finance' }
                                        ]}
                                        placeholder="Select Dept"
                                        error={errors.department}
                                        className="!gap-1"
                                        onChange={(val) => {
                                            setForm({ ...form, department: val });
                                            if (errors.department) setErrors({ ...errors, department: '' });
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="p-4 bg-gray-50/50 border-t border-gray-100 flex gap-3">
                        <CustomButton
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            className="flex-1 !h-10 !rounded-lg border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold bg-white"
                        >
                            Cancel
                        </CustomButton>
                        <CustomButton
                            type="submit"
                            variant={isUpdating ? "disabled" : "primary"}
                            disabled={isUpdating}
                            className="flex-1 !h-10 !rounded-lg font-bold shadow-md shadow-blue-500/20"
                        >
                            {isUpdating ? (
                                <span className="flex items-center gap-2">
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    Creating...
                                </span>
                            ) : 'Create Account'}
                        </CustomButton>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddUserModal;
