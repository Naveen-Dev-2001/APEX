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
      hoverGradient: 'from-[#1887c0] to-[#0a5c8a]',
      icon: (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      ),
      features: ['Invoice Upload & AI Extraction', 'Multi-Level Approvals', 'Sage Intacct Posting'],
      badge: null,
    },
    {
      id: 'bank-reconciliation',
      title: 'Bank Reconciliation',
      subtitle: 'Match bank statements with Sage transactions',
      route: '/bank-reconciliation',
      gradient: 'from-[#6c48c5] to-[#4b2fa8]',
      hoverGradient: 'from-[#5c3aaa] to-[#3d2490]',
      icon: (
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
          <path d="M7 15h2" />
          <path d="M11 15h6" />
        </svg>
      ),
      features: ['Bank Statement Upload', 'Sage GL Sync', 'Auto Match & Compare'],
      badge: 'New',
    },
  ].filter((module) => isSage || module.id !== 'bank-reconciliation');

  return (
    <div className="auth-background min-h-screen w-full flex flex-col font-creato">
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
            className="bg-[#1e9bd8] text-white w-[38px] h-[38px] rounded-full flex justify-center items-center text-[17px] font-semibold shadow-md"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            {userInitial}
          </div>
          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-44 bg-white border border-gray-100 rounded-md shadow-lg py-1 z-50">
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 flex items-center transition-colors"
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

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center pt-[70px] px-4 py-10 z-10 relative">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Welcome, {user?.username || 'User'}!</h1>
          <p className="text-gray-500 text-base">Choose a module to get started</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-6 w-full max-w-3xl justify-center">
          {modules.map((mod) => (
            <div
              key={mod.id}
              onClick={() => navigate(mod.route)}
              onMouseEnter={() => setHoveredCard(mod.id)}
              onMouseLeave={() => setHoveredCard(null)}
              className="relative flex-1 min-w-[260px] max-w-[340px] rounded-2xl cursor-pointer overflow-hidden shadow-xl transition-all duration-300"
              style={{
                transform: hoveredCard === mod.id ? 'translateY(-6px) scale(1.02)' : 'translateY(0) scale(1)',
                boxShadow: hoveredCard === mod.id
                  ? '0 20px 60px rgba(0,0,0,0.18)'
                  : '0 8px 30px rgba(0,0,0,0.10)',
              }}
            >
              {/* Card gradient background */}
              <div className={`bg-gradient-to-br ${hoveredCard === mod.id ? mod.hoverGradient : mod.gradient} p-7 flex flex-col gap-4 transition-all duration-300`}>
                {/* Badge */}
                {mod.badge && (
                  <span className="absolute top-4 right-4 bg-white/20 text-white text-xs font-bold px-2.5 py-0.5 rounded-full border border-white/30">
                    {mod.badge}
                  </span>
                )}

                {/* Icon */}
                <div className="w-16 h-16 rounded-xl bg-white/20 flex items-center justify-center text-white">
                  {mod.icon}
                </div>

                {/* Title & Subtitle */}
                <div>
                  <h2 className="text-xl font-bold text-white mb-1">{mod.title}</h2>
                  <p className="text-white/80 text-sm leading-relaxed">{mod.subtitle}</p>
                </div>

                {/* Feature list */}
                <ul className="space-y-1.5 mt-2">
                  {mod.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-white/90 text-sm">
                      <svg className="w-3.5 h-3.5 flex-shrink-0 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <div className="mt-4 flex items-center text-white font-semibold text-sm gap-2 group">
                  <span>Open Module</span>
                  <svg
                    className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    style={{ transform: hoveredCard === mod.id ? 'translateX(4px)' : 'translateX(0)', transition: 'transform 0.2s' }}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ModuleSelectionPage;
