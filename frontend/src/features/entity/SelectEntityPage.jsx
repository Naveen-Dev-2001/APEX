import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import authBg from '../../assets/auth_background.png';
import logo from '../../assets/loandna_logo_dark.png';

const SelectEntityPage = () => {
  const navigate = useNavigate();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Mocked state for selected entity - will need to integrate with actual context later 
  const [selectedEntity, setSelectedEntity] = useState('Select Entity');
  const [isSelectOpen, setIsSelectOpen] = useState(false);

  const entities = [
    { id: 1, name: 'consolidated analytics' },
    // more entities can be added here
  ];

  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  
  const userInitial = user?.username ? user.username.charAt(0).toUpperCase() : 'U';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleSelectEntity = (entity) => {
    setSelectedEntity(entity.name);
    setIsSelectOpen(false);
    // Add logic to save to session storage and context like old frontend
    // setEntity(entity.name)
    // navigate("/dashboard")
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
    <div
      className="min-h-screen w-full flex justify-center items-center relative overflow-hidden font-sans"
      style={{
        background: `url(${authBg}) no-repeat center center fixed`,
        backgroundSize: 'cover'
      }}
    >
      {/* Header */}
      <header className="fixed top-0 left-0 w-full h-[70px] bg-white border-b border-[#e8e8e8] shadow-[0_2px_8px_rgba(0,0,0,0.05)] px-[30px] flex justify-between items-center z-[2000]">
        <img
          src={logo}
          alt="loanDNA Logo"
          className="h-[45px] w-auto flex-shrink-0"
          onError={(e) => {
            e.target.style.display = 'none';
            if (e.target.parentElement) {
              const h2 = document.createElement('h2');
              h2.style.color = '#3ba5d8';
              h2.style.margin = '0';
              h2.style.fontSize = '24px';
              h2.style.fontWeight = 'bold';
              h2.innerText = 'loanDNA';
              e.target.parentElement.appendChild(h2);
            }
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
      </header>

      {/* Main Content */}
      <div className="pt-[100px] w-full flex justify-center items-center px-4">
        <div className="bg-white rounded-xl py-8 px-10 shadow-[0_10px_40px_rgba(0,0,0,0.15)] w-full max-w-[380px] text-center z-10 relative">
          <h2 className="text-[24px] mb-2 text-gray-800 font-medium">Select Entity</h2>
          <p className="text-[14px] text-gray-500 mb-6">Choose which entity you want to work with.</p>

          <div className="relative w-full text-left mt-6">
            <button
              type="button"
              className="w-full flex justify-between items-center h-[40px] px-4 rounded-md text-[15px] bg-[#1e9bd8] hover:bg-[#1880b3] text-white font-medium transition-colors focus:outline-none"
              onClick={() => setIsSelectOpen(!isSelectOpen)}
            >
              <span>{selectedEntity}</span>
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${isSelectOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isSelectOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
                <ul className="py-1">
                  {entities.map((entity) => (
                    <li key={entity.id}>
                      <button
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                        onClick={() => handleSelectEntity(entity)}
                      >
                        {entity.name}
                      </button>
                    </li>
                  ))}
                  {entities.length === 0 && (
                    <li className="px-4 py-2 text-sm text-gray-500 italic text-center disabled">
                      No entities found.
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SelectEntityPage;
