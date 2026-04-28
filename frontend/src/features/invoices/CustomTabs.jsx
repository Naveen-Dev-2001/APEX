const CustomTabs = ({ tabs = [], activeTab, onChange }) => {
    return (
        <div className="w-full overflow-hidden ">

            <div className="overflow-x-auto no-scrollbar">

                <div className="border border-gray-300 inline-flex h-[38px] rounded-tr-md rounded-br-md rounded-bl-md rounded-tl-md">
                    {tabs.map((tab, i) => {
                        const isActive = activeTab === tab;
                        return (
                            <button
                                key={tab}
                                onClick={() => onChange(tab)}
                                className={`px-5 py-0 h-full text-[14px] ${isActive ? 'font-bold' : 'font-medium'} border-r border-gray-200 last:border-r-0 flex items-center justify-center  whitespace-nowrap transition-colors
                                    ${i === tabs.length - 1 ? "rounded-tr-md rounded-br-md" : ""}
                                    ${i === 0 ? "rounded-tl-md rounded-bl-md" : ""}
                                    ${isActive
                                        ? "bg-[#8dc3e3] text-black"
                                        : "bg-white text-black hover:text-black hover:bg-gray-50 "
                                    }`}
                            >
                                {tab}
                            </button>
                        );
                    })}
                </div>

            </div>
        </div>
    );
};

export default CustomTabs;