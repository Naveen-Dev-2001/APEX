import { FilePdfOutlined } from "@ant-design/icons";

const PdfPlaceholder = ({ isPdfLoading }) => {
    if (isPdfLoading) return null;

    return (
        <div className="flex flex-col items-center justify-center text-center mt-32 opacity-40">
            <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mb-6">
                <FilePdfOutlined style={{ fontSize: 36, color: "#98A2B3" }} />
            </div>
            <h4 className="text-[14px] font-bold text-[#101828]">No Invoice Selected</h4>
        </div>
    );
};

export default PdfPlaceholder;
