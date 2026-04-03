import { icons } from "../../../file";


const Card = ({ icon, title, value, subtitle }) => {
    return (
        <div className="relative mt-3 h-[100px] w-full bg-[#FFF] border border-gray-300 rounded-2xl px-5 py-4 overflow-hidden flex flex-col justify-between">

            {/* Top Right Pattern */}
            {icons && (
                <img
                    src={icons.cardFrame}
                    alt=""
                    className="absolute top-0 right-0 w-24 opacity-30 pointer-events-none select-none"
                />
            )}

            {/* Header */}
            <div className="flex items-center gap-3">
                <img src={icon} alt="" className="w-5 h-5" />
                <span className="text-[16px] text-primary font-[400] custom-font-jura ">
                    {title}
                </span>
            </div>

            {/* Value Section */}
            <div className="flex items-end gap-3">
                <span className="text-[32px] font-creato text-[#303030] font-[700] leading-none">
                    {value}
                </span>
                {subtitle && (
                    <span className="text-[16px] text-[#969696] pb-1">
                        {subtitle}
                    </span>
                )}
            </div>
        </div>
    );
};

export default Card;