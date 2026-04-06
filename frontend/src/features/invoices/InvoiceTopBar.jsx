import CustomButton from "../../shared/components/CustomButton";
import { icons } from "../../file";
import { useInvoiceStore } from "../../store/invoice.store";
import { useDuplicateCheck } from "../hooks/useDuplicateCheck";
import { useSaveInvoice } from "../hooks/useSaveInvoice";
import toast from "../../utils/toast";
import { saveInvoice } from "../../api/invoiceApi";
import { useNavigate } from "react-router-dom";

const InvoiceTopBar = ({ invoice = {} }) => {
    const navigate = useNavigate()
    const { setInvoiceSection, isDuplicate, viewInvoiceId } = useInvoiceStore();
    const { handleSave } = useSaveInvoice();
    useDuplicateCheck();

    const handleSendToCoding = async () => {
        const response = await handleSave()
        const payload = await saveInvoice(viewInvoiceId, { status: 'waiting_coding' })
        console.log("Send to coding →", payload);
        if (payload.status == "waiting_coding") {
            toast.success("Invoice sent for coding successfully!")
            navigate('/coding')
        } else {
            toast.error(payload?.message || "Something went wrong while sending for coding.");
        }
    };

    const handleSaveInvoice = async () => {
        const response = await handleSave()
        if (response) {
            toast.success("Invoice Saved Successfully!")
        }
    }

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
                        onClick={handleSaveInvoice}
                    >
                        Save
                    </CustomButton>
                </div>
                <div className="w-[180px]">

                    {/* Send to Coding - Green button */}
                    <CustomButton
                        variant="success"
                        className="w-40"
                        disabled={isDuplicate}
                        onClick={handleSendToCoding}
                    >
                        Send to Coding
                    </CustomButton>
                </div>
            </div>
        </div>
    );
};

export default InvoiceTopBar;