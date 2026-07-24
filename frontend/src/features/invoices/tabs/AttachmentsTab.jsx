import React, { useState, useEffect, useRef } from "react";
import { Modal, Table, Space, message } from "antd";
import { Trash2, Download, Paperclip, FileText, Image, FileSpreadsheet } from "lucide-react";
import { useInvoiceStore } from "../../../store/invoice.store";
import { useAuthStore } from "../../../store/authStore";
import {
    uploadInvoiceAttachments,
    deleteInvoiceAttachment,
    getInvoiceAttachmentLink,
    getInvoiceById
} from "../../../api/invoiceApi";
import CustomButton from "../../../shared/components/CustomButton";

const formatSize = (bytes) => {
    if (bytes === undefined || bytes === null) return "-";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (dateStr) => {
    if (!dateStr) return "-";
    try {
        const d = new Date(dateStr);
        return d.toLocaleString();
    } catch {
        return dateStr;
    }
};

const AttachmentsTab = () => {
    const { activeInvoiceData, setActiveInvoiceData, viewInvoiceId } = useInvoiceStore();
    const { activeRole } = useAuthStore();
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [itemToDelete, setItemToDelete] = useState(null);
    const [loading, setLoading] = useState(false);

    const canModify = ["scanner", "coder", "admin"].includes(activeRole?.toLowerCase());

    const attachments = activeInvoiceData?.attachments || [];

    useEffect(() => {
        const loadFreshData = async () => {
            if (viewInvoiceId) {
                try {
                    setLoading(true);
                    const updated = await getInvoiceById(viewInvoiceId);
                    setActiveInvoiceData(updated);
                } catch (err) {
                    console.error("Failed to load invoice attachments:", err);
                } finally {
                    setLoading(false);
                }
            }
        };
        loadFreshData();
    }, [viewInvoiceId, setActiveInvoiceData]);

    const handleDownload = async (attachment) => {
        try {
            const res = await getInvoiceAttachmentLink(viewInvoiceId, attachment.blob_name);
            if (res.sas_url) {
                window.open(res.sas_url, "_blank");
            } else {
                message.error("Failed to generate download link.");
            }
        } catch (err) {
            console.error("Error downloading attachment:", err);
            message.error("Failed to download attachment.");
        }
    };

    const handleDelete = (attachment) => {
        setItemToDelete(attachment);
    };

    const confirmDelete = async () => {
        if (!itemToDelete) return;
        try {
            setLoading(true);
            await deleteInvoiceAttachment(viewInvoiceId, itemToDelete.blob_name);
            message.success("Attachment deleted successfully.");
            setItemToDelete(null);
            // Reload invoice data
            const updated = await getInvoiceById(viewInvoiceId);
            setActiveInvoiceData(updated);
        } catch (err) {
            console.error("Error deleting attachment:", err);
            message.error(err.response?.data?.detail || "Failed to delete attachment.");
        } finally {
            setLoading(false);
        }
    };

    const handleUploadSuccess = async () => {
        try {
            const updated = await getInvoiceById(viewInvoiceId);
            setActiveInvoiceData(updated);
        } catch (err) {
            console.error("Failed to reload invoice details after upload:", err);
        }
    };

    const columns = [
        {
            title: "File Name",
            dataIndex: "filename",
            key: "filename",
            render: (text) => {
                const lower = text.toLowerCase();
                const isPdf = lower.endsWith(".pdf");
                const isExcel = lower.endsWith(".xls") || lower.endsWith(".xlsx") || lower.endsWith(".csv");
                return (
                     <div className="flex items-center gap-2">
                        {isPdf ? (
                            <FileText size={16} className="text-[#22B4E6]" />
                        ) : isExcel ? (
                            <FileSpreadsheet size={16} className="text-[#22B4E6]" />
                        ) : (
                            <Image size={16} className="text-[#22B4E6]" />
                        )}
                        <span className="font-medium text-gray-800">{text}</span>
                     </div>
                );
            }
        },
        {
            title: "Size",
            dataIndex: "size",
            key: "size",
            render: (size) => formatSize(size)
        },
        {
            title: "Uploaded By",
            dataIndex: "uploaded_by",
            key: "uploaded_by",
            render: (val) => val || "-"
        },
        {
            title: "Uploaded At",
            dataIndex: "uploaded_at",
            key: "uploaded_at",
            render: (val) => formatDate(val)
        },
        {
            title: "Actions",
            key: "actions",
            render: (_, record) => (
                <Space size="middle">
                    <button
                        onClick={() => handleDownload(record)}
                        className="text-[#22B4E6] hover:text-[#198cb4] flex items-center gap-1 cursor-pointer bg-transparent border-0"
                        title="Download/Open"
                    >
                        <Download size={16} />
                    </button>
                    {canModify && (
                        <button
                            onClick={() => handleDelete(record)}
                            className="text-[#F87171] hover:text-red-600 flex items-center gap-1 cursor-pointer bg-transparent border-0"
                            title="Delete"
                        >
                            <Trash2 size={16} />
                        </button>
                    )}
                </Space>
            )
        }
    ];

    return (
        <div className="p-4 h-full flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2">
                    <Paperclip size={18} className="text-[#11699E]" />
                    <span className="text-[16px] font-semibold text-gray-800 custom-font-jura">
                        Attachments ({attachments.length})
                    </span>
                </div>
                {canModify && (
                    <button
                        onClick={() => setIsUploadModalOpen(true)}
                        className="px-4 h-9 flex items-center justify-center text-[13px] font-semibold rounded-lg text-white bg-[#22B4E6] hover:opacity-90 transition-all border-0 cursor-pointer"
                    >
                        Add Attachment
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-auto bg-white rounded-xl border border-gray-100 shadow-sm">
                <Table
                    columns={columns}
                    dataSource={attachments.map((att, idx) => ({ ...att, key: idx }))}
                    pagination={false}
                    locale={{
                        emptyText: (
                            <div className="py-12 text-center text-gray-400 flex flex-col items-center gap-2">
                                <Paperclip size={32} strokeWidth={1} />
                                <span>No attachments found</span>
                                {canModify && (
                                    <span className="text-xs text-gray-400">
                                        Click "Add Attachment" to upload pdf, jpg, jpeg, png files
                                    </span>
                                )}
                            </div>
                        )
                    }}
                />
            </div>

            <Modal
                open={!!itemToDelete}
                onCancel={() => setItemToDelete(null)}
                footer={null}
                title={null}
                width={340}
                centered
                destroyOnClose
                closeIcon={null}
                styles={{
                    content: {
                        padding: 0,
                        borderRadius: "16px",
                        border: "1px solid #fee2e2",
                        overflow: "hidden"
                    },
                    body: {
                        padding: 0
                    }
                }}
            >
                <div className="flex flex-col items-center text-center bg-white" style={{ padding: "32px", boxSizing: "border-box" }}>
                    {/* Trash Icon */}
                    <div className="text-[#ef4444] bg-[#fef2f2] p-3 rounded-full mb-3 flex items-center justify-center">
                        <Trash2 size={36} />
                    </div>

                    {/* Title */}
                    <h3 className="text-[18px] font-bold text-[#111827] custom-font-jura mb-2">
                        Delete Attachment
                    </h3>

                    {/* Content */}
                    <p className="text-[13px] text-[#4b5563] custom-font-creato leading-relaxed mb-6 w-full break-all" style={{ paddingLeft: "8px", paddingRight: "8px" }}>
                        Are you sure you want to delete <strong>{itemToDelete?.filename}</strong>?
                    </p>

                    {/* Buttons */}
                    <div className="flex justify-center gap-3 w-full">
                        <button
                            onClick={() => setItemToDelete(null)}
                            disabled={loading}
                            className="flex-1 h-9 flex items-center justify-center text-[13px] font-semibold rounded-lg border border-gray-300 text-gray-600 bg-white hover:bg-gray-50 transition-all cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={confirmDelete}
                            disabled={loading}
                            className="flex-1 h-9 flex items-center justify-center text-[13px] font-semibold rounded-lg text-white bg-[#ef4444] hover:bg-[#dc2626] transition-all border-0 cursor-pointer shadow-sm"
                        >
                            {loading ? "Deleting..." : "Yes, Delete"}
                        </button>
                    </div>
                </div>
            </Modal>

            <AddAttachmentModal
                open={isUploadModalOpen}
                invoiceId={viewInvoiceId}
                onCancel={() => setIsUploadModalOpen(false)}
                onSuccess={handleUploadSuccess}
            />
        </div>
    );
};

// Modal matching Invoice Upload styling
const AddAttachmentModal = ({ open, invoiceId, onCancel, onSuccess }) => {
    const [files, setFiles] = useState([]);
    const [isDragging, setIsDragging] = useState(false);
    const [confirmLoading, setConfirmLoading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    const fileInputRef = useRef(null);

    useEffect(() => {
        if (!open) {
            setFiles([]);
            setIsDragging(false);
            setConfirmLoading(false);
            setUploadProgress(0);
        }
    }, [open]);

    const handleFiles = (incoming) => {
        const allFiles = Array.from(incoming);
        const allowedTypes = [
            "application/pdf", 
            "image/jpeg", 
            "image/jpg", 
            "image/png",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "text/csv"
        ];
        const allowedExts = [".pdf", ".jpg", ".jpeg", ".png", ".xls", ".xlsx", ".csv"];

        const validFiles = allFiles.filter((f) => {
            const ext = f.name.substring(f.name.lastIndexOf(".")).toLowerCase();
            return allowedTypes.includes(f.type) || allowedExts.includes(ext);
        });

        if (validFiles.length < allFiles.length) {
            message.warning("Some files were skipped. Only PDF, JPG, JPEG, PNG, XLS, XLSX, and CSV are allowed.");
        }

        setFiles((prev) => {
            const existing = new Set(prev.map(f => f.name));
            const newFiles = validFiles.filter((f) => !existing.has(f.name));
            return [...prev, ...newFiles];
        });
    };

    const handleFileInput = (e) => handleFiles(e.target.files);

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        handleFiles(e.dataTransfer.files);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => setIsDragging(false);

    const handleDelete = (fileToDelete) => {
        setFiles((prev) => prev.filter((f) => f.name !== fileToDelete.name));
    };

    const handleUpload = async () => {
        if (files.length === 0) return;
        setConfirmLoading(true);
        setUploadProgress(10);

        try {
            const formData = new FormData();
            files.forEach((file) => {
                formData.append("files", file);
            });

            // Simulate progress up to 90%
            const interval = setInterval(() => {
                setUploadProgress((p) => {
                    if (p >= 90) {
                        clearInterval(interval);
                        return p;
                    }
                    return p + 15;
                });
            }, 200);

            await uploadInvoiceAttachments(invoiceId, formData);
            clearInterval(interval);
            setUploadProgress(100);
            message.success("Attachments uploaded successfully.");
            onSuccess?.();
            onCancel();
        } catch (err) {
            console.error("Error uploading attachments:", err);
            message.error(err.response?.data?.detail || "Upload failed.");
            setUploadProgress(0);
        } finally {
            setConfirmLoading(false);
        }
    };

    return (
        <Modal
            open={open}
            onCancel={onCancel}
            footer={null}
            title={null}
            width={660}
            centered
            destroyOnClose
            maskClosable={false}
            closeIcon={null}
            styles={{
                content: {
                    padding: 0,
                    borderRadius: "12px",
                    overflow: "hidden"
                },
                body: {
                    padding: 0
                }
            }}
        >
            <div className="flex flex-col bg-white">
                {/* Header */}
                <div className="px-6 py-3 border-b border-[#E0E0E0] flex items-center justify-between">
                    <h2 className="text-[15px] font-semibold text-[#2F3A4C] custom-font-jura">
                        Add Attachments
                    </h2>
                    <button
                        onClick={onCancel}
                        disabled={confirmLoading}
                        className="text-gray-400 hover:text-gray-600 text-lg cursor-pointer bg-transparent border-0"
                    >
                        ×
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5 flex flex-col gap-4">
                    <p className="text-[14px] text-[#22B4E6] custom-font-jura font-medium">
                        Upload Attachment Files
                    </p>

                    {/* Drop Zone */}
                    <div
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        className={`
                            border border-dashed rounded-xl
                            flex flex-col items-center justify-center
                            py-8 px-4 transition-all
                            ${isDragging ? "border-[#22B4E6] bg-[#F0FAFF]" : "border-[#D9E1E7] bg-[#FAFCFE]"}
                        `}
                    >
                        {/* Icon */}
                        <div className="mb-2">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                                <path d="M12 15V5M12 5L8.5 8.5M12 5L15.5 8.5"
                                    stroke="#94A3B8"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                />
                                <path d="M4 19H20"
                                    stroke="#94A3B8"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                />
                            </svg>
                        </div>

                        {/* Text */}
                        <p className="text-[13px] text-gray-500 text-center mb-3">
                            Drag and drop files here
                        </p>

                        {/* Upload Button */}
                        <CustomButton
                            type="button"
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={confirmLoading}
                        >
                            Upload File
                        </CustomButton>

                        {/* Hidden Input */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,image/jpeg,image/jpg,image/png,.xls,.xlsx,.csv"
                            multiple
                            className="hidden"
                            onChange={handleFileInput}
                        />
                    </div>

                    {/* File List */}
                    {files.length > 0 && (
                        <div className="flex flex-col gap-2 max-h-[160px] overflow-y-auto pr-1">
                            {files.map((file, index) => (
                                <div
                                    key={index}
                                    className="flex items-center justify-between px-3 py-2 rounded-lg border border-[#E6ECF1]"
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className="w-7 h-7 rounded-md bg-[#E8F7FD] flex items-center justify-center">
                                            <Paperclip size={14} className="text-[#22B4E6]" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[13px] text-[#2F3A4C] truncate font-medium">
                                                {file.name}
                                            </p>
                                            <p className="text-[11px] text-gray-400">
                                                {formatSize(file.size)}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete(file);
                                        }}
                                        disabled={confirmLoading}
                                        className="text-[#F87171] hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed bg-transparent border-0 cursor-pointer"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {confirmLoading && (
                    <div className="px-6 pb-3">
                        {/* Track */}
                        <div className="w-full h-2 bg-[#E8EEF4] rounded-full overflow-hidden relative">
                            <div
                                className="h-full rounded-full transition-all duration-500 ease-out relative"
                                style={{
                                    width: `${uploadProgress}%`,
                                    background: "linear-gradient(90deg, #22B4E6 0%, #7B5EF8 55%, #E040FB 100%)",
                                    backgroundSize: "200% 100%",
                                    animation: "shimmer 2s linear infinite",
                                }}
                            >
                                <span
                                    className="absolute top-0 right-0 bottom-0 w-14 rounded-full"
                                    style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.35))" }}
                                />
                            </div>
                        </div>

                        {/* Labels */}
                        <div className="flex items-center justify-between mt-1.5">
                            <span className="flex items-center gap-1.5 text-xs text-gray-400">
                                <span
                                    className="w-1.5 h-1.5 rounded-full bg-[#22B4E6]"
                                    style={{ animation: uploadProgress >= 100 ? "none" : "pulse 1.2s ease-in-out infinite" }}
                                />
                                {uploadProgress >= 100 ? "Upload complete!" : "Uploading..."}
                            </span>
                            <span
                                className="text-xs font-semibold"
                                style={{
                                    background: "linear-gradient(90deg, #22B4E6, #7B5EF8)",
                                    WebkitBackgroundClip: "text",
                                    WebkitTextFillColor: "transparent",
                                }}
                            >
                                {uploadProgress}%
                            </span>
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="flex justify-end gap-3 py-3 px-6 border-t border-[#E0E0E0]">
                    <button
                        onClick={onCancel}
                        disabled={confirmLoading}
                        className="px-5 py-1.5 text-[13px] rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 cursor-pointer bg-white"
                    >
                        Discard
                    </button>
                    <button
                        onClick={handleUpload}
                        disabled={files.length === 0 || confirmLoading}
                        className="px-5 py-1.5 text-[13px] rounded-md bg-[#22B4E6] text-white hover:bg-[#1DA1D1] disabled:opacity-50 cursor-pointer border-0 font-medium"
                    >
                        {confirmLoading ? "Uploading..." : "Upload"}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default AttachmentsTab;
