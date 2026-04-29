import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/ui.store';
import { useCommonStore } from '../store/common.store';
import logo from '../assets/loandna_logo_dark.png';

// Tab Icons
import dashboardSelectIcon from '../assets/header-icons/dashboard-icon-select.png';
import dashboardUnselectIcon from '../assets/header-icons/dashboard-icon-unselect.png';
import masterDataSelectIcon from '../assets/header-icons/master-data-icon-select.png';
import masterDataUnselectIcon from '../assets/header-icons/master-data-icon-unselect.png';
import settingsSelectIcon from '../assets/header-icons/settings-icon-select.png';
import settingsUnselectIcon from '../assets/header-icons/settings-icon-unselect.png';
import adminSelectIcon from '../assets/header-icons/admin-icon-select.png';
import adminUnselectIcon from '../assets/header-icons/admin-icon-unselect.png';
import codingSelectIcon from '../assets/header-icons/coding-icon-select.png';
import codingUnselectIcon from '../assets/header-icons/coding-icon-unselect.png';
import approvalSelectIcon from '../assets/header-icons/approval-icon-select.png';
import approvalUnselectIcon from '../assets/header-icons/approval-icon-unselect.png';
import invoiceSelectIcon from '../assets/header-icons/invoics-icon-select.png';
import invoiceUnselectIcon from '../assets/header-icons/invoics-icon-unselect.png';
import useAdminStore from '../store/useAdminStore';
import { useInvoiceStore } from '../store/invoice.store';
import API from '../api/api';

const tabs = [
    { name: 'Dashboard', route: '/dashboard', selectIcon: dashboardSelectIcon, unselectIcon: dashboardUnselectIcon },
    { name: 'Invoices', route: '/invoices', selectIcon: invoiceSelectIcon, unselectIcon: invoiceUnselectIcon },
    { name: 'Master Data', route: '/master-data', selectIcon: masterDataSelectIcon, unselectIcon: masterDataUnselectIcon },
    { name: 'Settings', route: '/settings', selectIcon: settingsSelectIcon, unselectIcon: settingsUnselectIcon },
    { name: 'Admin', route: '/admin', selectIcon: adminSelectIcon, unselectIcon: adminUnselectIcon },
];
// Map of names/labels to icons
const iconMap = {
    'Dashboard': { select: dashboardSelectIcon, unselect: dashboardUnselectIcon },
    'Invoices': { select: invoiceSelectIcon, unselect: invoiceUnselectIcon },
    'Master Data': { select: masterDataSelectIcon, unselect: masterDataUnselectIcon },
    'Settings': { select: settingsSelectIcon, unselect: settingsUnselectIcon },
    'Admin': { select: adminSelectIcon, unselect: adminUnselectIcon },
    'Coding': { select: codingSelectIcon, unselect: codingUnselectIcon },
    'Approvals': { select: approvalSelectIcon, unselect: approvalUnselectIcon },
    // Default icons for others if not found
    'default': { select: dashboardSelectIcon, unselect: dashboardUnselectIcon }
};

// Remove hardcoded tabs as we will use dynamic navigation
// const tabs = [ ... ];

const Header = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { setInvoiceSection } = useInvoiceStore()
    const { activeTab, setActiveTab } = useUIStore();
    const { logout, user, activeRole, setActiveRole, updateUser } = useAuthStore();
    const entity = useCommonStore((state) => state.entity);
    // Use the display name for UI; fall back to entity_id or a default
    const selectedEntityName = sessionStorage.getItem('selected_entity_name') || entity || sessionStorage.getItem('selected_entity') || 'consolidated analytics';

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [showChangeRoleModal, setShowChangeRoleModal] = useState(false);
    const dropdownRef = useRef(null);
    const mobileMenuRef = useRef(null);
    const hamburgerRef = useRef(null);

    const userInitial = user?.username ? user.username.charAt(0).toUpperCase() : 'U';

    // Resolve target role for the Change Role feature
    const allRoles = user?.role ? user.role.split(',').map(r => r.trim()) : [];
    const getTargetRole = () => {
        const current = (activeRole || '').toLowerCase().trim();
        // If we have admin/approver combo, prioritize switching between them
        if (allRoles.includes('admin') && allRoles.includes('approver')) {
            if (current === 'admin') return 'approver';
            if (current === 'approver') return 'admin';
        }
        // General logic for other combinations: find the first available role that is not the current one
        return allRoles.find(r => r.toLowerCase().trim() !== current) || allRoles[0] || 'admin';
    };
    const targetRole = getTargetRole();
    
    const handleConfirmRoleChange = () => {
        setActiveRole(targetRole);
        setShowChangeRoleModal(false);
        setIsDropdownOpen(false);
        
        let targetRoute = '/dashboard';
        const role = targetRole.toLowerCase();
        if (role === 'scanner') {
            targetRoute = '/invoices';
        } else if (role === 'coder') {
            targetRoute = '/coding';
        } else if (role === 'approver') {
            targetRoute = '/approvals';
        }
        
        navigate(targetRoute);
    };

    const { navigation, fetchSettings } = useAdminStore();
    const [filteredTabs, setFilteredTabs] = useState([]);

    // Fetch settings on mount to ensure we have navigation
    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    // Filter navigation based on user role
    useEffect(() => {
        if (!navigation || navigation.length === 0) {
            setFilteredTabs([]);
            return;
        }

        const userRole = user?.role?.toLowerCase() || '';
        const currentRole = (activeRole || '').toLowerCase();
        const userDept = user?.department?.toLowerCase() || '';

        const filtered = navigation
            .filter(nav => {
                // Check if role has access
                const roles = nav.roles || [];
                const roleAccess = roles.some(r => r.toLowerCase() === 'all' || r.toLowerCase() === currentRole);
                
                // Show Master Data for scanner and coder as well
                if (nav.label === 'Master Data' && (currentRole === 'scanner' || currentRole === 'coder')) {
                    return true;
                }

                // Specific block: non-finance approvers cannot see dashboard
                if (nav.label === 'Dashboard' && currentRole === 'approver' && userDept === 'non-finance') {
                    return false;
                }
                
                return roleAccess;
            })
            .map(nav => ({
                name: nav.label,
                route: nav.path,
                selectIcon: iconMap[nav.label]?.select || iconMap.default.select,
                unselectIcon: iconMap[nav.label]?.unselect || iconMap.default.unselect
            }));

        setFilteredTabs(filtered);
    }, [navigation, user, activeRole]);

    // Sync active tab with route on path change or refresh
    useEffect(() => {
        const currentPath = location.pathname;
        const matchingTab = filteredTabs.find(tab => currentPath.startsWith(tab.route));
        if (matchingTab && activeTab !== matchingTab.name) {
            setActiveTab(matchingTab.name);
        }
    }, [location.pathname, activeTab, setActiveTab, filteredTabs]);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const handleTabClick = (tab) => {
        if (tab.name == "Invoices") {
            setInvoiceSection(1)
        }
        setActiveTab(tab.name);
        navigate(tab.route);
    };

    const handleToggleEmail = async () => {
        try {
            const newValue = user?.email_notifications === false ? true : false;
            await API.post(`/auth/toggle-email-notifications?enabled=${newValue}`);
            updateUser({ email_notifications: newValue });
        } catch (error) {
            console.error("Failed to toggle email notifications:", error);
        }
    };

    // Close dropdowns if clicked outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsDropdownOpen(false);
            }
            if (mobileMenuRef.current &&
                !mobileMenuRef.current.contains(event.target) &&
                !hamburgerRef.current?.contains(event.target)) {
                setIsMobileMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    return (
        <header className="w-full h-[60px] bg-white border-b border-[#e8e8e8] shadow-sm flex items-center px-6 justify-between z-50 fixed top-0 left-0">
            {/* Logo area */}
            <div className="flex items-center space-x-8 pr-8 border-r border-gray-100 h-full cursor-pointer" onClick={() => navigate('/dashboard')}>
                <img
                    src={logo}
                    alt="loanDNA Logo"
                    className="h-[35px] w-auto flex-shrink-0"
                    onError={(e) => {
                        e.target.style.display = 'none';
                        if (e.target.parentElement) {
                            const h2 = document.createElement('h2');
                            h2.style.color = '#3ba5d8';
                            h2.style.margin = '0';
                            h2.style.fontSize = '20px';
                            h2.style.fontWeight = 'bold';
                            h2.innerText = 'loanDNA';
                            e.target.parentElement.appendChild(h2);
                        }
                    }}
                />
            </div>

            {/* Hamburger Menu Icon (Mobile Only) */}
            <div className="md:hidden flex items-center" ref={hamburgerRef}>
                <button
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    className="text-gray-500 hover:text-[#1e9bd8] focus:outline-none p-2"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {isMobileMenuOpen ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                        )}
                    </svg>
                </button>
            </div>

            {/* Navigation Tabs (Desktop) */}
            <div className="hidden md:flex flex-1 h-full">
                {filteredTabs.map((tab) => {
                    const isActive = activeTab === tab.name;
                    return (
                        <div
                            key={tab.name}
                            onClick={() => handleTabClick(tab)}
                            className={`flex items-center space-x-2 px-6 h-full cursor-pointer transition-colors relative ${isActive ? 'text-[#1e9bd8]' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}
                        >
                            <img
                                src={isActive ? tab.selectIcon : tab.unselectIcon}
                                alt={`${tab.name} icon`}
                                className="w-4 h-4 object-contain"
                            />
                            <span className={`text-[14px] whitespace-nowrap ${isActive ? 'font-bold' : 'font-normal'}`}>
                                {tab.name}
                            </span>
                            {/* Active Bottom Border */}
                            {isActive && (
                                <div className="absolute bottom-0 left-0 w-full h-[3px] bg-[#3ba5d8] rounded-t-sm" />
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Mobile Navigation Menu */}
            {isMobileMenuOpen && (
                <div
                    ref={mobileMenuRef}
                    className="absolute top-[60px] left-0 w-full bg-white border-b border-gray-100 shadow-lg md:hidden z-40 transition-all duration-300 ease-in-out"
                >
                    <div className="flex flex-col p-4 space-y-2">
                        {filteredTabs.map((tab) => {
                            const isActive = activeTab === tab.name;
                            return (
                                <div
                                    key={tab.name}
                                    onClick={() => {
                                        handleTabClick(tab);
                                        setIsMobileMenuOpen(false);
                                    }}
                                    className={`flex items-center space-x-3 p-3 rounded-xl cursor-pointer transition-colors ${isActive ? 'bg-blue-50 text-[#1e9bd8]' : 'text-gray-500 hover:bg-gray-50'}`}
                                >
                                    <img
                                        src={isActive ? tab.selectIcon : tab.unselectIcon}
                                        alt={`${tab.name} icon`}
                                        className="w-5 h-5 object-contain"
                                    />
                                    <span className={`text-[15px] whitespace-nowrap ${isActive ? 'font-bold' : 'font-medium'}`}>
                                        {tab.name}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Right side controls */}
            <div className="flex items-center space-x-5">
                {/* Entity Badge */}
                <div className="hidden md:flex items-center space-x-2 bg-[#f0f8ff] border border-[#a2d5f2] rounded-full px-4 py-1.5">
                    <svg className="w-4.5 h-4.5 text-[#1e9bd8] shrink-0" style={{width:'18px',height:'18px'}} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>

                    <span className="text-[13px] font-medium text-[#1e9bd8] max-w-[160px] truncate leading-none capitalize">{selectedEntityName}</span>
                </div>

                {/* Divider */}
                <div className="hidden md:block h-6 w-px bg-gray-200"></div>

                {/* Search / Help Button */}
                {/* <button className="flex items-center space-x-2 px-4 py-[6px] border border-[#a2d5f2] rounded-full text-sm text-gray-600 hover:bg-[#f0f8ff] transition-colors focus:outline-none">
                    <svg className="w-4 h-4 text-[#1e9bd8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    <span>How can I help you?</span>
                </button> */}

                {/* User Guide Icon */}
                <div 
                    className="relative cursor-pointer text-gray-500 hover:text-[#1e9bd8] transition-colors p-1"
                    onClick={() => {
                        const width = 1200;
                        const height = 800;
                        const left = (window.screen.width / 2) - (width / 2);
                        const top = (window.screen.height / 2) - (height / 2);
                        window.open(
                            '/AP_User_Guide_Current_Workflow_updated_1.pdf',
                            'UserGuide',
                            `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=no,menubar=no,toolbar=no`
                        );
                    }}
                    title="User Guide"
                >
                    <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                </div>

                {/* Divider */}
                <div className="h-6 w-px bg-gray-200"></div>

                {/* User Dropdown */}
                <div className="relative ml-auto cursor-pointer" ref={dropdownRef}>
                    <div
                        className="bg-[#1e9bd8] text-white w-[34px] h-[34px] rounded-full flex justify-center items-center text-[15px] font-semibold"
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    >
                        {userInitial}
                    </div>

                    {isDropdownOpen && (
                        <div className="absolute right-0 mt-3 w-[280px] bg-white border border-gray-100 rounded-2xl shadow-2xl z-50 overflow-hidden">
                            {/* Arrow Pointer - Centered with the 34px icon at the right edge */}
                            <div className="absolute -top-[6px] right-2.5 w-3 h-3 bg-white border-l border-t border-gray-100 rotate-45 z-0"></div>

                            <div className="relative z-10 p-4">
                                {/* Dropdown Header */}
                                <div className="flex justify-between items-center mb-4">
                                    <span className="text-[11px] font-bold text-[#333] tracking-tighter uppercase opacity-60 truncate mr-2">
                                        {selectedEntityName}
                                    </span>
                                    <button
                                        onClick={handleLogout}
                                        className="text-[13px] text-[#ff5a5f] hover:text-red-600 font-semibold transition-colors shrink-0"
                                    >
                                        Logout
                                    </button>
                                </div>

                                {/* User Profile section */}
                                <div className="flex items-center space-x-3 mb-4">
                                    <div className="w-12 h-12 bg-[#3ba5d8] rounded-xl flex items-center justify-center text-white text-xl font-bold shadow-sm shrink-0">
                                        {userInitial}
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-[16px] font-bold text-gray-900 truncate leading-none mb-1">
                                            {user?.username || 'admin'}
                                        </span>
                                        <span className="text-[13px] text-gray-400 font-medium truncate capitalize">
                                            {activeRole || 'User'} - {user?.department?.toLowerCase() === 'finance' ? 'Finance' : 'Non-Finance'}
                                        </span>
                                    </div>
                                </div>

                                {/* Divider */}
                                <div className="h-[1px] w-full bg-gray-50 mb-4"></div>

                                {/* Change Entity Action */}
                                <button
                                    onClick={() => {
                                        navigate('/select-entity');
                                        setIsDropdownOpen(false);
                                    }}
                                    className="flex items-center space-x-3 w-full group transition-all duration-200 py-0.5"
                                >
                                    <div className="p-1 rounded-lg text-[#3ba5d8] group-hover:bg-blue-50">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    </div>
                                    <span className="text-[14px] font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
                                        Change Entity
                                    </span>
                                </button>

                                {/* Change Role Action (only if user has multiple roles and not on select-entity route) */}
                                {Array.isArray(allRoles) && allRoles.length >= 2 && location.pathname !== '/select-entity' && (
                                    <button
                                        onClick={() => {
                                            setShowChangeRoleModal(true);
                                            setIsDropdownOpen(false);
                                        }}
                                        className="flex items-center space-x-3 w-full group transition-all duration-200 py-0.5 mt-2"
                                    >
                                        <div className="p-1 rounded-lg text-[#3ba5d8] group-hover:bg-blue-50">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                            </svg>
                                        </div>
                                        <span className="text-[14px] font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
                                            Change Role
                                        </span>
                                    </button>
                                )}

                                {/* Email Notification Toggle */}
                                <div className="flex items-center justify-between w-full mt-2 py-0.5">
                                    <div className="flex items-center space-x-3">
                                        <div className="p-1 rounded-lg text-[#3ba5d8]">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                            </svg>
                                        </div>
                                        <span className="text-[14px] font-medium text-gray-700">
                                            Email Notification
                                        </span>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleToggleEmail();
                                        }}
                                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${user?.email_notifications !== false ? 'bg-[#1e9bd8]' : 'bg-gray-200'}`}
                                    >
                                        <span
                                            className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${user?.email_notifications !== false ? 'translate-x-5' : 'translate-x-1'}`}
                                        />
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Change Role Confirmation Modal */}
                    {showChangeRoleModal && (
                        <div
                            className="fixed inset-0 z-[9999] flex items-center justify-center"
                            style={{ backgroundColor: 'rgba(0,0,0,0.40)' }}
                            onClick={() => setShowChangeRoleModal(false)}
                        >
                            <div
                                className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
                                onClick={(e) => e.stopPropagation()}
                            >
                                {/* Modal Header */}
                                <div className="bg-[#1e9bd8] px-6 py-4 flex items-center gap-3">
                                    <div className="bg-white/20 rounded-full p-2">
                                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                    </div>
                                    <h3 className="text-white font-semibold text-[16px] tracking-wide">Change Role</h3>
                                </div>

                                {/* Modal Body */}
                                <div className="px-6 py-5">
                                    <p className="text-gray-600 text-[14px] leading-relaxed">
                                        Do you want to change your role from{' '}
                                        <span className="font-semibold text-gray-900 capitalize">{activeRole}</span>
                                        {' '}to{' '}
                                        <span className="font-semibold text-[#1e9bd8] capitalize">{targetRole}</span>?
                                    </p>
                                    <p className="text-gray-400 text-[12px] mt-2">
                                        Your current entity selection will be preserved.
                                    </p>
                                </div>

                                {/* Modal Footer */}
                                <div className="px-6 pb-5 flex justify-end gap-3">
                                    <button
                                        onClick={() => setShowChangeRoleModal(false)}
                                        className="px-5 py-2 text-[13px] font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
                                    >
                                        Close
                                    </button>
                                    <button
                                        onClick={handleConfirmRoleChange}
                                        className="px-5 py-2 text-[13px] font-medium text-white bg-[#1e9bd8] hover:bg-[#1580b5] active:bg-[#116a96] rounded-xl transition-colors shadow-sm"
                                    >
                                        OK
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
};

export default Header;