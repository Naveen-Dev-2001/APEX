import React from 'react';
import authBackground from '../assets/auth_background.png';
import logo from '../assets/loandna_logo_dark.png';

const AuthLayout = ({ children, title = "" }) => {
    return (
        <div
            className="min-h-screen w-full flex items-center justify-center bg-white relative overflow-hidden font-creato bg-cover bg-center"
            style={{ backgroundImage: `url(${authBackground})` }}
        >
            {/* Content card */}
            <div className="relative z-10 w-full max-w-md px-4 sm:px-0">
                <div className="bg-white backdrop-blur-sm rounded-xl shadow-2xl overflow-hidden p-6 sm:p-8 w-full border border-gray-100">
                    <div className="flex justify-center mb-6">
                        <img src={logo} alt="LoanDNA Logo" className="h-[48px] object-contain" />
                    </div>
                    <h2 className="text-center text-xl font-medium text-gray-800 mb-6">{title}</h2>

                    {children}
                </div>
            </div>
        </div>
    );
};

export default AuthLayout;
