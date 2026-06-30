// SSOCallback.jsx

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import axios from "axios";
import { useAuthStore } from "../../store/authStore"; // ← add this

export default function SSOCallback() {
    const navigate = useNavigate();
    const setAuth = useAuthStore((state) => state.setAuth); // ← add this
    const [status, setStatus] = useState("Processing...");
    const hasProcessed = useRef(false);
    const baseURL = window._env_?.VITE_BACKEND_URL;

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

                navigate("/module-select", { replace: true });

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