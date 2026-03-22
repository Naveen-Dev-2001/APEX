import React, { memo } from "react";

const Stepper = memo(({ steps, currentStep }) => {
    return (
        <div className="flex items-center justify-between w-full mb-8 relative">
            {/* Background connecting line */}
            <div className="absolute left-[10%] top-1/2 transform -translate-y-1/2 w-[80%] h-[1px] bg-gray-200 z-0"></div>

            {steps.map((step, index) => {
                const isCompleted = currentStep > step.number;
                const isCurrent = currentStep === step.number;
                const isUpcoming = currentStep < step.number;

                return (
                    <div key={step.number} className="relative z-10 flex items-center  px-2">
                        <div
                            className={`
                                flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold
                                ${isCurrent ? "bg-blue-500 text-white" :
                                    isCompleted ? "bg-blue-100 text-blue-500" :
                                        "bg-gray-200 text-gray-500"}
                            `}
                        >
                            {isCompleted ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            ) : (
                                step.number
                            )}
                        </div>
                        <span
                            className={`ml-2 text-xs sm:text-sm ${isCurrent || isCompleted ? "text-gray-900 font-medium" : "text-gray-500"}`}
                        >
                            {step.label}
                        </span>
                    </div>
                );
            })}
        </div>
    );
});

Stepper.displayName = "Stepper";

export default Stepper;
