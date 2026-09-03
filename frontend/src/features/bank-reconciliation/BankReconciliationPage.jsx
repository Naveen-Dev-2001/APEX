import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import logo from '../../assets/loandna_logo_dark.png';
import '../../layout/AuthLayout.css';
import { getTopLevelEntityName } from './components/shared';

import BankStatementTab from './tabs/BankStatementTab';
import BankAccountsTab from './tabs/BankAccountsTab';
import SageGLTab from './tabs/SageGLTab';
import MatchCompareTab from './tabs/MatchCompareTab';
import UnmatchedTab from './tabs/UnmatchedTab';

/* ────────────────────────────── Sidebar Tabs ────────────────────────────── */
const TABS = [
  {
    id: 'bank-statement', label: 'Bank Statement',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>,
  },
  {
    id: 'bank-accounts', label: 'Bank Accounts',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M5 7l1 12h12l1-12M9 11v5m6-5v5" /></svg>,
  },
  {
    id: 'sage-gl', label: 'Sage Transactions',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2" /></svg>,
  },
  {
    id: 'match-compare', label: 'Match & Compare',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>,
  },
  {
    id: 'unmatched', label: 'Unmatched',
    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
];

/* ────────────────────────────── Main Page ────────────────────────────── */
const BankReconciliationPage = () => {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const activeRole = useAuthStore((state) => state.activeRole);
  const [activeTab, setActiveTab] = useState('bank-statement');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef();

  const userInitial = user?.username ? user.username.charAt(0).toUpperCase() : 'U';
  const rawEntityName = sessionStorage.getItem('selected_entity_name');
  const selectedEntityName = getTopLevelEntityName(rawEntityName) || 'Top Level';
  const handleLogout = () => { logout(); navigate('/login'); };

  React.useEffect(() => {
    const handle = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsDropdownOpen(false); };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  return (
    <div className="min-h-screen bg-[#f5f6fa] flex flex-col">
      {/* Header */}
      <header className="fixed top-0 left-0 w-full h-[60px] bg-white border-b border-[#e8e8e8] shadow-sm flex items-center px-6 justify-between z-[2000]">
        {/* Logo */}
        <div className="flex items-center space-x-8 pr-8 border-r border-gray-100 h-full cursor-pointer" onClick={() => navigate('/module-select')}>
          <img src={logo} alt="Logo" className="h-[35px] w-auto flex-shrink-0" onError={(e) => { e.target.style.display = 'none'; }} />
        </div>
        {/* Navigation Tabs (Desktop) */}
        <div className="hidden lg:flex flex-1 h-full">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <div
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-5 h-full cursor-pointer transition-colors relative ${isActive ? 'text-[#1e9bd8]' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
              >
                <span className={isActive ? 'text-[#1e9bd8]' : 'text-gray-400'}>{tab.icon}</span>
                <span className={`text-[14px] whitespace-nowrap ${isActive ? 'font-bold' : 'font-normal'}`}>
                  {tab.label}
                </span>
                {isActive && (
                  <div className="absolute bottom-0 left-0 w-full h-[3px] bg-[#3ba5d8] rounded-t-sm" />
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4">
          <div className="relative cursor-pointer" ref={dropdownRef}>
            <div
              className="bg-[#1e9bd8] text-white w-[34px] h-[34px] rounded-full flex justify-center items-center text-[15px] font-semibold"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            >
              {userInitial}
            </div>
            {isDropdownOpen && (
              <div className="absolute right-0 mt-3 w-[280px] bg-white border border-gray-100 rounded-2xl shadow-2xl z-50 overflow-hidden">
                <div className="absolute -top-[6px] right-2.5 w-3 h-3 bg-white border-l border-t border-gray-100 rotate-45 z-0"></div>
                <div className="relative z-10 p-4">
                  <div className="flex justify-between items-center mb-4">
                    <span
                      className="text-[11px] font-bold text-[#333] tracking-tighter uppercase opacity-60 truncate mr-2"
                      title={selectedEntityName}
                    >
                      {selectedEntityName}
                    </span>
                    <button
                      onClick={handleLogout}
                      className="text-[13px] text-[#ff5a5f] hover:text-red-600 font-semibold transition-colors shrink-0"
                    >
                      Logout
                    </button>
                  </div>
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
                  <div className="h-[1px] w-full bg-gray-50 mb-3"></div>
                  <button
                    onClick={() => {
                      navigate('/module-select');
                      setIsDropdownOpen(false);
                    }}
                    className="flex items-center space-x-3 w-full group transition-all duration-200 py-0.5"
                  >
                    <div className="p-1 rounded-lg text-[#3ba5d8]">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                      </svg>
                    </div>
                    <span className="text-[14px] font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
                      Switch Module
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 pt-[60px]">
        {/* Main */}
        <main className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            {/* Mobile Navigation */}
            <nav className="lg:hidden mb-4 bg-white border border-[#e8e8e8] shadow-sm overflow-x-auto">
              <div className="flex items-center min-w-max">
                {TABS.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <div
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center space-x-2 px-4 py-3 cursor-pointer transition-colors relative ${isActive ? 'text-[#1e9bd8]' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                      <span className={isActive ? 'text-[#1e9bd8]' : 'text-gray-400'}>{tab.icon}</span>
                      <span className={`text-[13px] whitespace-nowrap ${isActive ? 'font-bold' : 'font-normal'}`}>
                        {tab.label}
                      </span>
                      {isActive && (
                        <div className="absolute bottom-0 left-0 w-full h-[3px] bg-[#3ba5d8] rounded-t-sm" />
                      )}
                    </div>
                  );
                })}
              </div>
            </nav>
            {activeTab === 'bank-statement' && <BankStatementTab />}
            {activeTab === 'bank-accounts' && <BankAccountsTab />}
            {activeTab === 'sage-gl' && <SageGLTab />}
            {activeTab === 'match-compare' && <MatchCompareTab onGoToUnmatched={() => setActiveTab('unmatched')} />}
            {activeTab === 'unmatched' && <UnmatchedTab />}
          </div>
        </main>
      </div>
    </div>
  );
};

export default BankReconciliationPage;
