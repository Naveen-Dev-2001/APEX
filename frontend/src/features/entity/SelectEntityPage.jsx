import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/ui.store';
import '../../layout/AuthLayout.css';
import logo from '../../assets/loandna_logo_dark.png';
import { useCommonStore } from '../../store/common.store';
import useMasterDataStore from '../../store/masterData.store';
import { useInvoiceStore } from '../../store/invoice.store';
import { getERPSystem } from '../../utils/envHelper';

const SelectEntityPage = () => {
  const navigate = useNavigate();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const entityContainerRef = useRef(null);
  const roleContainerRef = useRef(null);
  const setEntity = useCommonStore((state) => state.setEntity)

  // State for selected entity display and dropdown visibility
  const [selectedEntity, setSelectedEntity] = useState('Choose Entity');
  const [isSelectOpen, setIsSelectOpen] = useState(false);



  const { masters, entityLoading } = useMasterDataStore();
  const [entityData, setEntityData] = useState([]);

  useEffect(() => {
    const fetchAllEntities = async () => {
      try {
        const { masterDataService } = await import('../../api/masterdataAPI');
        const response = await masterDataService.getEntityMasterData({ page: 1, page_size: 1000 });
        let data = response.data || [];
        if (getERPSystem() === 'Zoho') {
          const hasDefault = data.some(entity => entity.entity_id === 'DEFAULT');
          if (!hasDefault) {
            data = [{ id: 0, entity_id: 'DEFAULT', entity_name: 'Consolidated Analytics' }, ...data];
          }
        }
        setEntityData(data);
      } catch (err) {
        console.error("Failed to load entities:", err);
        if (getERPSystem() === 'Zoho') {
          setEntityData([{ id: 0, entity_id: 'DEFAULT', entity_name: 'Consolidated Analytics' }]);
        }
      }
    };
    fetchAllEntities();
  }, []);

  // Format entities for dropdown
  const entities = entityData.map((entity, index) => {
    const isZoho = getERPSystem() === 'Zoho';
    let baseName = entity.entity_name;
    if (isZoho && entity.entity_id === 'DEFAULT') {
      baseName = 'Consolidated Analytics';
    } else if (entity.entity_name === 'Default Entity') {
      baseName = 'Top Level';
    }
    const combinedName = `${entity.entity_id} - ${baseName}`;
    return {
      id: entity.id || index,
      entityId: entity.entity_id,   // FK value used in DB
      name: baseName,               // Original display name
      displayName: combinedName      // Combined display name for dropdown
    };
  });

  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const setAuth = useAuthStore((state) => state.setAuth);
  const setActiveRole = useAuthStore((state) => state.setActiveRole);
  const setActiveTab = useUIStore((state) => state.setActiveTab);

  // Parse user roles
  const userRoles = user?.role ? user.role.split(',') : [];
  const hasMultipleRoles = userRoles.length > 1;
  const [activeRole, setLocalActiveRole] = useState(
    sessionStorage.getItem('active_role') || userRoles[0] || 'approver'
  );
  const [isRoleSelectOpen, setIsRoleSelectOpen] = useState(false);

  // Dynamic dropdown max-height calculations based on remaining screen space
  const roleButtonRef = useRef(null);
  const entityButtonRef = useRef(null);
  const [maxRoleDropdownHeight, setMaxRoleDropdownHeight] = useState('240px');
  const [maxEntityDropdownHeight, setMaxEntityDropdownHeight] = useState('240px');

  useEffect(() => {
    const calculateHeights = () => {
      if (isRoleSelectOpen && roleButtonRef.current) {
        const rect = roleButtonRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom - 24; // 24px safe margin from bottom
        setMaxRoleDropdownHeight(`${Math.max(120, spaceBelow)}px`);
      }
      if (isSelectOpen && entityButtonRef.current) {
        const rect = entityButtonRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom - 24; // 24px safe margin from bottom
        setMaxEntityDropdownHeight(`${Math.max(120, spaceBelow)}px`);
      }
    };

    calculateHeights();
    window.addEventListener('resize', calculateHeights);
    return () => window.removeEventListener('resize', calculateHeights);
  }, [isRoleSelectOpen, isSelectOpen]);



  const userInitial = user?.username ? user.username.charAt(0).toUpperCase() : 'U';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleSelectEntity = (entity) => {
    setSelectedEntity(entity.displayName);
    setIsSelectOpen(false);

    // Store active role context without mutating the primary user object
    setActiveRole(activeRole);

    // Store the entity_id as the FK value sent in X-Entity header to the backend
    setEntity(entity.entityId || entity.name);
    sessionStorage.setItem('selected_entity', entity.entityId || entity.name); // entity_id for DB FK
    sessionStorage.setItem('selected_entity_name', entity.displayName);         // Display name for UI

    // Sync selected entity details immediately to useInvoiceStore
    const rawEntity = entityData.find((item) => item.entity_id === entity.entityId);
    if (rawEntity) {
      useInvoiceStore.getState().setEntityMaster(rawEntity);
    }

    let targetRoute = "/dashboard";
    const roleForRouting = activeRole.toLowerCase();

    if (roleForRouting === 'scanner') {
      targetRoute = "/invoices";
    } else if (roleForRouting === 'coder') {
      targetRoute = "/coding";
    } else if (roleForRouting === 'approver') {
      targetRoute = "/approvals";
    }

    navigate(targetRoute);
  };

  // Close dropdown if clicked outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
      if (entityContainerRef.current && !entityContainerRef.current.contains(event.target)) {
        setIsSelectOpen(false);
      }
      if (roleContainerRef.current && !roleContainerRef.current.contains(event.target)) {
        setIsRoleSelectOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div className="auth-background min-h-screen w-full flex justify-center items-center font-creato">
      {/* Background elements */}
      <div className="auth-circle auth-circle-left"></div>
      <div className="auth-circle auth-circle-right"></div>
      <div className="auth-bottom-curve"></div>

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
            <div className="absolute right-0 mt-2 w-44 bg-white border border-gray-100 rounded-md shadow-lg py-1 z-50">
              {/* Logout button */}
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

          {hasMultipleRoles && (
            <div className="relative w-full text-left mt-6" ref={roleContainerRef}>
              <label className="text-[12px] text-gray-500 mb-1 block font-medium">Login As</label>
              <button
                ref={roleButtonRef}
                type="button"
                className="w-full flex justify-between items-center h-[40px] px-4 rounded-md text-[15px] bg-[#f8f9fa] border border-gray-200 hover:bg-gray-50 active:bg-gray-100 text-gray-700 font-medium transition-all focus:outline-none"
                onClick={() => setIsRoleSelectOpen(!isRoleSelectOpen)}
              >
                <span className="capitalize">{activeRole}</span>
                <svg
                  className={`w-4 h-4 transition-transform duration-200 ${isRoleSelectOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isRoleSelectOpen && (
                <div 
                  className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-[60] overflow-y-auto"
                  style={{ maxHeight: maxRoleDropdownHeight }}
                >
                  <ul className="py-1">
                    {userRoles.map((role) => (
                      <li key={role}>
                        <button
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors capitalize"
                          onClick={() => {
                            setLocalActiveRole(role);
                            setIsRoleSelectOpen(false);
                          }}
                        >
                          {role}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="relative w-full text-left mt-6" ref={entityContainerRef}>
            <label className="text-[12px] text-gray-500 mb-1 block font-medium">Select Entity</label>
            <button
              ref={entityButtonRef}
              type="button"
              className="w-full flex justify-between items-center h-[40px] px-4 rounded-md text-[15px] bg-[#1e9bd8] hover:opacity-85 active:opacity-75 text-white font-medium transition-all focus:outline-none"
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
              <div 
                className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 overflow-y-auto"
                style={{ maxHeight: maxEntityDropdownHeight }}
              >
                <ul className="py-1">
                  {entities.map((entity) => (
                    <li key={entity.id}>
                      <button
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                        onClick={() => handleSelectEntity(entity)}
                      >
                        {entity.displayName}
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
