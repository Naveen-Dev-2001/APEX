// SSOCallback.jsx

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import axios from "axios";

export default function SSOCallback() {

    const navigate = useNavigate();

    const [status, setStatus] = useState("Processing...");

    const hasProcessed = useRef(false);

    // BACKEND URL
    const baseURL = window._env_?.VITE_BACKEND_URL;

    useEffect(() => {

        // Prevent double execution in StrictMode
        if (hasProcessed.current) {
            return;
        }

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

                const response = await axios.post(
                    `${baseURL}/sso-exchange`,
                    {
                        token: token
                    }
                );

                const res = response.data;

                // STORE TOKENS
                // STORE IN SESSION STORAGE

                sessionStorage.setItem("access_token", res.access_token);

                sessionStorage.setItem("refresh_token", res.refresh_token);

                sessionStorage.setItem(
                    "user",
                    JSON.stringify({
                        email: res.email,
                        role: res.role,
                        user_id: res.user_id,
                        username: res.username
                    })
                );

                setStatus("Redirecting...");

                toast.success("SSO Login Successful");

                navigate("/select-entity", {
                    replace: true
                });

            } catch (err) {

                console.error("SSO exchange failed:", err);

                toast.error(
                    err?.response?.data?.detail ||
                    "SSO login failed"
                );

                navigate("/");
            }
        };

        exchangeSSOToken();

    }, [navigate, baseURL]);

    return (
        <div className="h-screen flex items-center justify-center">
            <div className="text-center">

                <span className="text-gray-500 text-sm block mb-2">
                    Signing you in with Microsoft…
                </span>

                <span className="text-gray-400 text-xs">
                    {status}
                </span>

            </div>
        </div>
    );
}