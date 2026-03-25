import React from 'react';

const Skeleton = ({ className = '', variant = 'text', width, height }) => {
    const baseClass = "bg-gray-200 animate-pulse transition-all duration-300";
    
    // Variant styles
    const variants = {
        text: "rounded-md h-4 w-full",
        circle: "rounded-full",
        rect: "rounded-lg",
    };

    const style = {
        width: width || undefined,
        height: height || undefined,
    };

    return (
        <div 
            className={`${baseClass} ${variants[variant] || variants.text} ${className}`} 
            style={style}
        />
    );
};

export default Skeleton;
