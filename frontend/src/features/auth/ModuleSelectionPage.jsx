import React, { useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import logo from '../../assets/loandna_logo_dark.png';
import '../../layout/AuthLayout.css';
import { getERPSystem } from '../../utils/envHelper';

const ModuleSelectionPage = () => {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [hoveredCard, setHoveredCard] = useState(null);
  const dropdownRef = useRef(null);
  const isSage = getERPSystem() === 'Sage';

  const userInitial = user?.username ? user.username.charAt(0).toUpperCase() : 'U';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const modules = [
    {
      id: 'accounts-payable',
      title: 'Accounts Payable',
      subtitle: 'Invoice processing, approvals & Sage posting',
      route: '/select-entity',
      gradient: 'from-[#1e9bd8] to-[#0d6ea3]',
      hoverGradient: 'from-[#1887c0] to-[#095b88]',
      iconBg: 'bg-white/20',
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      ),
      features: ['Invoice Upload & AI Extraction', 'Multi-Level Approvals', 'Sage Intacct Posting'],
      badge: 'Core Module',
      badgeStyle: 'bg-white/20 text-white border-white/30',
    },
    {
      id: 'bank-reconciliation',
      title: 'Bank Reconciliation',
      subtitle: 'Match bank statements with Sage transactions',
      route: '/bank-reconciliation',
      gradient: 'from-[#6c48c5] to-[#4b2fa8]',
      hoverGradient: 'from-[#5c3aaa] to-[#3b2388]',
      iconBg: 'bg-white/20',
      icon: (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
          <path d="M7 15h2" />
          <path d="M11 15h6" />
        </svg>
      ),
      features: ['Bank Statement Upload', 'Sage GL Sync', 'Auto Match & Compare'],
      badge: 'New Module',
      badgeStyle: 'bg-amber-400/90 text-slate-900 border-amber-300 font-extrabold',
    },
  ].filter((module) => isSage || module.id !== 'bank-reconciliation');

  return (
    <div className="auth-background min-h-screen w-full flex flex-col font-creato relative">
      {/* Background elements */}
      <div className="auth-circle auth-circle-left" />
      <div className="auth-circle auth-circle-right" />
      <div className="auth-bottom-curve" />

      {/* Header */}
      <header className="fixed top-0 left-0 w-full h-[70px] bg-white border-b border-[#e8e8e8] shadow-[0_2px_8px_rgba(0,0,0,0.05)] px-[30px] flex justify-between items-center z-[2000]">
        <img
          src={logo}
          alt="loanDNA Logo"
          className="h-[45px] w-auto flex-shrink-0"
          onError={(e) => {
            e.target.style.display = 'none';
          }}
        />
        <div className="relative ml-auto cursor-pointer" ref={dropdownRef}>
          <div
            className="bg-[#1e9bd8] hover:bg-[#1887c0] transition-colors text-white w-[38px] h-[38px] rounded-full flex justify-center items-center text-[17px] font-semibold shadow-md"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            {userInitial}
          </div>
          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-100 rounded-xl shadow-xl py-1 z-50 animate-in fade-in duration-150">
              <div className="px-4 py-2 border-b border-gray-100">
                <p className="text-xs text-gray-400 font-medium">Signed in as</p>
                <p className="text-sm font-semibold text-gray-800 truncate">{user?.username || 'User'}</p>
              </div>
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 flex items-center transition-colors font-medium"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Content Container */}
      <div className="flex-1 flex flex-col items-center justify-center pt-[70px] px-4 py-10 z-10 relative">
        {/* Welcome Banner */}
        <div className="text-center mb-8 space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight drop-shadow-sm">
            Welcome, {user?.username || 'User'}!
          </h1>
          <p className="text-blue-100 text-sm sm:text-base font-normal drop-shadow-xs max-w-md mx-auto">
            Choose an APEX module below to get started
          </p>
        </div>

        {/* Module Selection Cards */}
        <div className="flex flex-col sm:flex-row gap-5 sm:gap-6 w-full max-w-3xl justify-center items-stretch">
          {modules.map((mod) => {
            const isHovered = hoveredCard === mod.id;
            return (
              <div
                key={mod.id}
                onClick={() => navigate(mod.route)}
                onMouseEnter={() => setHoveredCard(mod.id)}
                onMouseLeave={() => setHoveredCard(null)}
                className="relative flex-1 min-w-[270px] max-w-[350px] rounded-2xl cursor-pointer overflow-hidden transition-all duration-300 flex flex-col border border-white/20"
                style={{
                  transform: isHovered ? 'translateY(-6px)' : 'translateY(0)',
                  boxShadow: isHovered
                    ? '0 20px 40px -10px rgba(0, 0, 0, 0.22)'
                    : '0 8px 20px -4px rgba(0, 0, 0, 0.10)',
                }}
              >
                {/* Card Gradient Background */}
                <div
                  className={`bg-gradient-to-br ${
                    isHovered ? mod.hoverGradient : mod.gradient
                  } p-6 flex-1 flex flex-col justify-between transition-all duration-300 relative`}
                >
                  {/* Badge */}
                  {mod.badge && (
                    <span
                      className={`absolute top-4 right-4 text-[10px] font-bold px-2.5 py-0.5 rounded-full border backdrop-blur-sm shadow-sm ${mod.badgeStyle}`}
                    >
                      {mod.badge}
                    </span>
                  )}

                  {/* Icon & Title Group */}
                  <div className="space-y-3.5">
                    <div className={`w-12 h-12 rounded-xl ${mod.iconBg} flex items-center justify-center text-white shadow-inner backdrop-blur-md`}>
                      {mod.icon}
                    </div>

                    <div>
                      <h2 className="text-xl font-bold text-white tracking-tight">{mod.title}</h2>
                      <p className="text-white/80 text-xs mt-1 leading-relaxed font-normal">{mod.subtitle}</p>
                    </div>

                    {/* Features List */}
                    <div className="pt-2 border-t border-white/15">
                      <ul className="space-y-1.5">
                        {mod.features.map((f) => (
                          <li key={f} className="flex items-center gap-2 text-white/90 text-xs font-medium">
                            <div className="w-3.5 h-3.5 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                              <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* CTA Link */}
                  <div className="mt-8 pt-3 border-t border-white/15 flex items-center justify-between text-white font-semibold text-sm group">
                    <span>Open Module</span>
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition-colors">
                      <svg
                        className="w-4 h-4 transition-transform duration-200"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        style={{
                          transform: isHovered ? 'translateX(3px)' : 'translateX(0)',
                        }}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ModuleSelectionPage;

