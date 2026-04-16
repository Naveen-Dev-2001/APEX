import CustomButton from "../../shared/components/CustomButton";
import { icons } from "../../file";
import { useInvoiceStore } from "../../store/invoice.store";
import { useDuplicateCheck } from "../hooks/useDuplicateCheck";
import { useSaveInvoice } from "../hooks/useSaveInvoice";
import toast from "../../utils/toast";
import { saveInvoice } from "../../api/invoiceApi";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";

const InvoiceTopBar = ({ invoice = {} }) => {
    const navigate = useNavigate()
    const user = useAuthStore((state) => state.user);
    const userRole = user?.role?.toLowerCase();
    const { setInvoiceSection, isDuplicate, viewInvoiceId, resetQuickView, setInvoiceActiveTab, activeInvoiceData } = useInvoiceStore();
    const { handleSave } = useSaveInvoice();
    useDuplicateCheck();

    const handleSendToCoding = async () => {
        const response = await handleSave()
        const payload = await saveInvoice(viewInvoiceId, { status: 'waiting_coding' })
        console.log("Send to coding →", payload);
        if (payload.status == "waiting_coding") {
            toast.success("Invoice sent for coding successfully!")
            resetQuickView();
            setInvoiceSection(1);
            navigate('/invoices')
        } else {
            toast.error(payload?.message || "Something went wrong while sending for coding.");
        }
    };

    const handleSendToApproval = async () => {
        const response = await handleSave()
        const payload = await saveInvoice(viewInvoiceId, { status: 'waiting_approval' })
        if (payload.status == "waiting_approval") {
            toast.success("Invoice sent for approval successfully!")
            resetQuickView();
            setInvoiceSection(1);
            navigate('/invoices')
        } else {
            toast.error(payload?.message || "Something went wrong while sending for approval.");
        }
    };

    const handleSaveInvoice = async () => {
        const response = await handleSave()
        if (response) {
            toast.success("Invoice Saved Successfully!")
        }
    }

    const currentStatus = activeInvoiceData?.status || invoice?.status;

    const Back = () => {
        resetQuickView();
        setInvoiceSection(1)
        setInvoiceActiveTab("Quick View")
    }

    return (
        <div className="h-12 min-h-[50px] bg-white border-b border-[#E0E0E0] px-4  flex items-center justify-between ">

            {/* Left — back + title */}
            <div
                onClick={Back}
                className="flex items-center gap-1 p-1.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
            >
                <img src={icons.arrowLeft} alt="Back" />
                <span className="text-lg font-bold text-gray-500 custom-font-jura">
                    Back
                </span>
            </div>

            {/* Right — actions */}
            <div className="flex items-center gap-3">
                {!activeInvoiceData?.is_archived && ((userRole === 'scanner' && currentStatus !== 'waiting_coding') || (userRole === 'coder' && currentStatus === 'waiting_coding')) && (
                    <>
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
                        <div className="w-[220px]">

                            {/* Send to Coding / Send to Approval - Green button */}
                            <CustomButton
                                variant="success"
                                className="w-40"
                                disabled={isDuplicate}
                                onClick={currentStatus === 'waiting_coding' ? handleSendToApproval : handleSendToCoding}
                            >
                                {currentStatus === 'waiting_coding'
                                    ? "Send to Approval"
                                    : currentStatus === 'processed'
                                        ? "Send to Coding"
                                        : "Send to Coding"}
                            </CustomButton>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default InvoiceTopBar;