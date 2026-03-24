import Header from "./Header";
import { Outlet } from "react-router-dom";

const AppLayout = () => {
    return (
        <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
            {/* Fixed Header */}
            <Header />

            {/* Scrollable Content */}
            <main className="flex-1 overflow-y-auto px-2 py-6 pt-[60px]">
                <Outlet />
            </main>
        </div>
    );
};

export default AppLayout;