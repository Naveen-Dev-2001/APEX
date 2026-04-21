import React from 'react';
import { Modal } from 'antd';
import { ExclamationCircleOutlined, CheckCircleOutlined, InfoCircleOutlined, CloseOutlined } from '@ant-design/icons';
import CustomButton from './CustomButton';

const AlertModal = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    subMessage,
    highlightText,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    type = 'danger', // 'danger' | 'warning' | 'info' | 'success'
    loading = false,
    confirmBtnVariant
}) => {
    const config = {
        danger: { icon: <ExclamationCircleOutlined className="text-red-500 text-2xl" />, btnVariant: 'danger' },
        warning: { icon: <ExclamationCircleOutlined className="text-amber-500 text-2xl" />, btnVariant: 'warning' },
        info: { icon: <InfoCircleOutlined className="text-blue-500 text-2xl" />, btnVariant: 'primary' },
        success: { icon: <CheckCircleOutlined className="text-green-500 text-2xl" />, btnVariant: 'success' },
    };

    const currentConfig = config[type] || config.info;

    return (
        <Modal
            open={isOpen}
            onCancel={loading ? undefined : onClose}
            footer={null}
            closable={false}
            centered
            width={420}
            modalRender={(node) => React.cloneElement(node, { style: { padding: 0 } })}
            maskClosable={!loading}
        >
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden relative">
                {!loading && (
                    <button 
                        onClick={onClose} 
                        className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <CloseOutlined />
                    </button>
                )}
                
                <div className="p-6">
                    <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 mt-1">
                            {currentConfig.icon}
                        </div>
                        <div className="flex-1">
                            {title && <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>}
                            {message && <p className="text-sm text-gray-600 mb-1">{message}</p>}
                            {highlightText && (
                                <div className="mt-3 py-2 px-3 bg-gray-50 rounded border border-gray-100 flex items-center justify-center">
                                    <span className="font-semibold text-gray-800 tracking-wide">
                                        {highlightText}
                                    </span>
                                </div>
                            )}
                            {subMessage && <p className="text-xs text-gray-500 mt-4 leading-relaxed">{subMessage}</p>}
                        </div>
                    </div>
                </div>

                <div className="bg-gray-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-100">
                    <div className="w-24">
                        <CustomButton 
                            variant="outline" 
                            onClick={onClose} 
                            disabled={loading}
                            className="bg-white"
                        >
                            {cancelText}
                        </CustomButton>
                    </div>
                    <div className="w-auto min-w-[120px]">
                        <CustomButton 
                            variant={confirmBtnVariant || currentConfig.btnVariant} 
                            onClick={onConfirm} 
                            disabled={loading}
                        >
                            {loading ? 'Processing...' : confirmText}
                        </CustomButton>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default AlertModal;
