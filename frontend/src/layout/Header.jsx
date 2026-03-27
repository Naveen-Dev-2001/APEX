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
import useAdminStore from '../store/useAdminStore';

const tabs = [
    { name: 'Dashboard', route: '/dashboard', selectIcon: dashboardSelectIcon, unselectIcon: dashboardUnselectIcon },
    { name: 'Invoices', route: '/invoices', selectIcon: dashboardSelectIcon, unselectIcon: dashboardUnselectIcon },
    { name: 'Master Data', route: '/master-data', selectIcon: masterDataSelectIcon, unselectIcon: masterDataUnselectIcon },
    { name: 'Settings', route: '/settings', selectIcon: settingsSelectIcon, unselectIcon: settingsUnselectIcon },
    { name: 'Admin', route: '/admin', selectIcon: adminSelectIcon, unselectIcon: adminUnselectIcon },
];
// Map of names/labels to icons
const iconMap = {
    'Dashboard': { select: dashboardSelectIcon, unselect: dashboardUnselectIcon },
    'Invoices': { select: dashboardSelectIcon, unselect: dashboardUnselectIcon },
    'Master Data': { select: masterDataSelectIcon, unselect: masterDataUnselectIcon },
    'Settings': { select: settingsSelectIcon, unselect: settingsUnselectIcon },
    'Admin': { select: adminSelectIcon, unselect: adminUnselectIcon },
    // Default icons for others if not found
    'default': { select: dashboardSelectIcon, unselect: dashboardUnselectIcon }
};

// Remove hardcoded tabs as we will use dynamic navigation
// const tabs = [ ... ];

const Header = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { activeTab, setActiveTab } = useUIStore();
    const logout = useAuthStore((state) => state.logout);
    const user = useAuthStore((state) => state.user);
    const entity = useCommonStore((state) => state.entity);
    const selectedEntityName = entity || sessionStorage.getItem('selected_entity') || 'consolidated analytics';

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const dropdownRef = useRef(null);
    const mobileMenuRef = useRef(null);
    const hamburgerRef = useRef(null);

    const userInitial = user?.username ? user.username.charAt(0).toUpperCase() : 'U';

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
        
        const filtered = navigation
            .filter(nav => {
                // Check if role has access
                const roles = nav.roles || [];
                return roles.some(r => r.toLowerCase() === 'all' || r.toLowerCase() === userRole);
            })
            .map(nav => ({
                name: nav.label,
                route: nav.path,
                selectIcon: iconMap[nav.label]?.select || iconMap.default.select,
                unselectIcon: iconMap[nav.label]?.unselect || iconMap.default.unselect
            }));
            
        setFilteredTabs(filtered);
    }, [navigation, user]);

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
        setActiveTab(tab.name);
        navigate(tab.route);
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
                            <span className={`text-[14px] ${isActive ? 'font-medium' : 'font-normal'}`}>
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
                                    <span className={`text-[15px] ${isActive ? 'font-bold' : 'font-medium'}`}>
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
                {/* Search / Help Button */}
                {/* <button className="flex items-center space-x-2 px-4 py-[6px] border border-[#a2d5f2] rounded-full text-sm text-gray-600 hover:bg-[#f0f8ff] transition-colors focus:outline-none">
                    <svg className="w-4 h-4 text-[#1e9bd8]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    <span>How can I help you?</span>
                </button> */}

                {/* Notification Bell */}
                <div className="relative cursor-pointer text-gray-500 hover:text-[#1e9bd8] transition-colors p-1">
                    <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    <div className="absolute top-[3px] right-[4px] w-2 h-2 bg-[#1e9bd8] rounded-full border border-white"></div>
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
                        <div className="absolute right-0 mt-3 w-[240px] bg-white border border-gray-100 rounded-2xl shadow-2xl z-50 overflow-hidden">
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
                                        <span className="text-[13px] text-gray-400 font-medium truncate">
                                            {user?.role || 'Admin'}
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
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
};

export default Header;