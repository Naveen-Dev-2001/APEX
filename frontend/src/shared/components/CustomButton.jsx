import React from "react";

export default function CustomButton({
    children,
    variant = "primary",
    rightIcon = false, // square-box icon
    className = "",
    onClick,
    ...props
}) {

    const baseClasses = `
    w-full h-10 
    inline-flex items-center justify-center
    rounded-lg
    !font-creato custom-font-creato text-base leading-4
    transition-all duration-150 
  `;

    const variantClasses = {
        primary: `
      bg-Colors-Surface-Action-action
      text-Colors-Text-Static-white cursor-pointer
    `,
        disabled: `
      bg-Colors-Surface-Action-action-disabled
      text-Colors-Text-Action-action-disabled
      cursor-not-allowed opacity-80
    `,
        outline: `
      bg-transparent
      outline outline-1 outline-Colors-Border-Action-action
      text-Colors-Text-Base-base cursor-pointer
    `,
        link: `
      bg-transparent
      text-Colors-Text-Primary-primary
      font-medium
      font-creato
      justify-center
      h-auto py-1 cursor-pointer
    `
    };

    const iconColorClass = {
        primary: "outline-Colors-Icon-Static-white",
        disabled: "outline-Colors-Icon-Action-action-disabled",
        outline: "outline-Colors-Border-Action-action",
        link: "hidden"
    }[variant];

    return (
        <button
            onClick={onClick}
            disabled={variant === "disabled"}
            className={`${className} ${baseClasses} ${variantClasses[variant]} `}
            {...props}
        >
            {/* children now render FULLY, including icons */}
            <div className="flex items-center gap-2 px-2 text-[13px] ">
                {children}

                {/* OPTIONAL right icon square (Figma) */}
                {rightIcon && (
                    <div className="w-5 h-5 relative overflow-hidden">
                        <div
                            className={`w-3 h-3 left-[4.17px] top-[4.17px] absolute 
                            outline outline-2 outline-offset-[-1px] ${iconColorClass}`}
                        />
                    </div>
                )}
            </div>
        </button>
    );
}
