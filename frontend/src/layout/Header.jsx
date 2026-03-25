import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/ui.store';
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

const tabs = [
    { name: 'Dashboard', route: '/dashboard', selectIcon: dashboardSelectIcon, unselectIcon: dashboardUnselectIcon },
    { name: 'Invoices', route: '/invoices', selectIcon: dashboardSelectIcon, unselectIcon: dashboardUnselectIcon },
    { name: 'Master Data', route: '/master-data', selectIcon: masterDataSelectIcon, unselectIcon: masterDataUnselectIcon },
    { name: 'Settings', route: '/settings', selectIcon: settingsSelectIcon, unselectIcon: settingsUnselectIcon },
    { name: 'Admin', route: '/admin', selectIcon: adminSelectIcon, unselectIcon: adminUnselectIcon },
];

const Header = () => {
    const navigate = useNavigate();
    const { activeTab, setActiveTab } = useUIStore();
    const logout = useAuthStore((state) => state.logout);
    const user = useAuthStore((state) => state.user);

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef(null);

    const userInitial = user?.username ? user.username.charAt(0).toUpperCase() : 'U';

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const handleTabClick = (tab) => {
        setActiveTab(tab.name);
        navigate(tab.route);
    };

    // Close dropdown if clicked outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsDropdownOpen(false);
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

            {/* Navigation Tabs */}
            <div className="flex-1 flex h-full">
                {tabs.map((tab) => {
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
                        <div className="absolute right-0 mt-2 w-32 bg-white border border-gray-100 rounded-md shadow-lg py-1 z-50">
                            <button
                                onClick={handleLogout}
                                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 flex items-center transition-colors"
                            >
                                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                                Logout
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
};

export default Header;