import CustomButton from "../../shared/components/CustomButton";
import { icons } from "../../file";
import { useInvoiceStore } from "../../store/invoice.store";

const InvoiceTopBar = ({ invoice = {} }) => {
    const { setInvoiceSection } = useInvoiceStore();

    return (
        <div className="h-12 min-h-[50px] bg-white border-b border-[#E0E0E0] px-4  flex items-center justify-between ">

            {/* Left — back + title */}
            <div
                onClick={() => setInvoiceSection(1)}
                className="flex items-center gap-1 p-1.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
            >
                <img src={icons.arrowLeft} alt="Back" />
                <span className="text-lg font-bold text-gray-500 custom-font-jura">
                    Back
                </span>
            </div>

            {/* Right — actions */}
            <div className="flex items-center gap-3">
                <div className="w-[100px]">

                    <CustomButton
                        variant="outline"
                        className="w-32"
                        onClick={() => {/* handle discard */ }}
                    >
                        Discard
                    </CustomButton>
                </div>
                <div className="w-[100px]">

                    {/* Save - Primary button */}
                    <CustomButton
                        variant="primary"
                        className="w-24"
                        onClick={() => {/* handle save */ }}
                    >
                        Save
                    </CustomButton>
                </div>
                <div className="w-[180px]">

                    {/* Send to Coding - Green button */}
                    <CustomButton
                        variant="success"
                        className="w-40"
                        onClick={() => {/* handle send to coding */ }}
                    >
                        Send to Coding
                    </CustomButton>
                </div>
            </div>
        </div>
    );
};

export default InvoiceTopBar;