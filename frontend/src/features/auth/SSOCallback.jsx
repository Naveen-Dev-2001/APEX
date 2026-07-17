// SSOCallback.jsx

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import axios from "axios";
import { useAuthStore } from "../../store/authStore";
import { getBackendURL } from "../../utils/getBackendURL";
import { getERPSystem } from "../../utils/envHelper";
import { useCommonStore } from "../../store/common.store";
import { useInvoiceStore } from "../../store/invoice.store";

export default function SSOCallback() {
    const navigate = useNavigate();
    const setAuth = useAuthStore((state) => state.setAuth);
    const [status, setStatus] = useState("Processing...");
    const hasProcessed = useRef(false);
    const baseURL = getBackendURL();

    useEffect(() => {
        if (hasProcessed.current) return;
        hasProcessed.current = true;

        const token = new URLSearchParams(window.location.search).get("token");

        if (!token) {
            toast.error("Invalid SSO response");
            navigate("/");
            return;
        }

        const exchangeSSOToken = async () => {
            try {
                setStatus("Exchanging token...");

                const response = await axios.post(`${baseURL}/sso-exchange`, { token });
                const res = response.data;

                // ← Use setAuth instead of raw sessionStorage
                const userObj = {
                    id: res.user_id || null,
                    username: res.username || null,
                    email: res.email || null,
                    role: res.role || null,
                    department: res.department || null,
                    email_notifications: res.email_notifications !== undefined ? res.email_notifications : true,
                };
                setAuth(res.access_token, userObj, res.refresh_token);

                setStatus("Redirecting...");
                toast.success("SSO Login Successful");

                const userRoles = userObj.role ? userObj.role.split(',').map(r => r.trim()) : [];
                const activeRole = sessionStorage.getItem('active_role') || userRoles[0] || 'approver';
                useAuthStore.getState().setActiveRole(activeRole);

                if (getERPSystem() === 'Zoho' && userRoles.length <= 1) {
                    const entityId = 'DEFAULT';
                    const entityName = 'Consolidated Analytics';
                    const entityDisplayName = `${entityId} - ${entityName}`;
                    
                    useCommonStore.getState().setEntity(entityId);
                    sessionStorage.setItem('selected_entity', entityId);
                    sessionStorage.setItem('selected_entity_name', entityDisplayName);

                    const rawEntity = {
                        entity_id: entityId,
                        entity_name: entityName,
                        id: 0
                    };
                    useInvoiceStore.getState().setEntityMaster(rawEntity);

                    navigate('/dashboard', { replace: true });
                } else {
                    navigate("/select-entity", { replace: true });
                }

            } catch (err) {
                console.error("SSO exchange failed:", err);
                toast.error(err?.response?.data?.detail || "SSO login failed");
                navigate("/");
            }
        };

        exchangeSSOToken();
    }, [navigate, baseURL, setAuth]);

    return (
        <div className="h-screen flex items-center justify-center">
            <div className="text-center">
                <span className="text-gray-500 text-sm block mb-2">
                    Signing you in with Microsoft…
                </span>
                <span className="text-gray-400 text-xs">{status}</span>
            </div>
        </div>
    );
}