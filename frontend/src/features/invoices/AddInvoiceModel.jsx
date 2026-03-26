import React, { useState, useRef } from "react";
import { Modal } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import CustomButton from "../../shared/components/CustomButton";

const AddInvoiceModal = ({
    open,
    onCancel,
    onUpload,
    confirmLoading = false,
    uploadProgress = 0,
}) => {
    const [files, setFiles] = useState([]);
    const [isDragging, setIsDragging] = useState(false);

    const fileInputRef = useRef(null);
    const folderInputRef = useRef(null);

    //  Handle files (supports folder)
    const handleFiles = (incoming) => {
        const allFiles = Array.from(incoming);

        const pdfs = allFiles.filter(
            (f) => f.type === "application/pdf"
        );

        setFiles((prev) => {
            const existing = new Set(
                prev.map(f => f.name + (f.webkitRelativePath || ""))
            );

            const newFiles = pdfs.filter(
                (f) => !existing.has(f.name + (f.webkitRelativePath || ""))
            );

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

    //  Safe delete (folder-aware)
    const handleDelete = (fileToDelete) => {
        setFiles((prev) =>
            prev.filter(
                (f) =>
                    f.name !== fileToDelete.name ||
                    (f.webkitRelativePath || "") !== (fileToDelete.webkitRelativePath || "")
            )
        );
    };

    const handleUpload = () => {
        if (files.length === 0) return;
        onUpload?.(files);
    };

    const handleCancel = () => {
        setFiles([]);
        onCancel();
    };

    const formatSize = (bytes) => {
        if (bytes < 1024) return `${bytes}B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    };

    return (
        <Modal
            open={open}
            onCancel={handleCancel}
            footer={null}
            title={null}
            width={660}
            centered
            destroyOnHidden
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
                        Add Invoices
                    </h2>

                    <button
                        onClick={handleCancel}
                        className="text-gray-400 hover:text-gray-600 text-lg cursor-pointer"
                    >
                        ×
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5 flex flex-col gap-4">

                    <p className="text-[14px] text-[#22B4E6] custom-font-jura">
                        Upload Invoice Files
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
        ${isDragging
                                ? "border-[#22B4E6] bg-[#F0FAFF]"
                                : "border-[#D9E1E7] bg-[#FAFCFE]"
                            }
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
                        <p className="text-[13px] text-gray-500 text-center">
                            Drag and drop files or folders here
                        </p>

                        {/* Buttons */}
                        <div className="flex gap-3 mt-3 w-[50%] justify-center">

                            <CustomButton
                                type="submit"
                                variant="outline"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                {"Upload File"}
                            </CustomButton>


                            <CustomButton
                                type="submit"
                                variant="primary"
                                onClick={() => folderInputRef.current?.click()}
                            >
                                {"Upload Folder"}
                            </CustomButton>

                        </div>

                        {/* Hidden Inputs */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf"
                            multiple
                            className="hidden"
                            onChange={handleFileInput}
                        />

                        <input
                            ref={folderInputRef}
                            type="file"
                            webkitdirectory="true"
                            directory=""
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
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                                <path
                                                    d="M14 2H6C5 2 5 2 5 3V21C5 22 5 22 6 22H18C19 22 19 22 19 21V7L14 2Z"
                                                    stroke="#22B4E6"
                                                    strokeWidth="1.5"
                                                />
                                            </svg>
                                        </div>

                                        <div className="min-w-0">
                                            <p className="text-[13px] text-[#2F3A4C] truncate font-medium">
                                                {file.webkitRelativePath || file.name}
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
                                        className="text-[#F87171] hover:text-red-600"
                                    >
                                        <DeleteOutlined style={{ fontSize: 14 }} />
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
                                {/* Shine tip */}
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
                        onClick={handleCancel}
                        className="px-5 py-1.5 text-[13px] rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
                    >
                        Discard
                    </button>

                    <button
                        onClick={handleUpload}
                        disabled={files.length === 0 || confirmLoading}
                        className="px-5 py-1.5 text-[13px] rounded-md bg-[#22B4E6] text-white hover:bg-[#1DA1D1] disabled:opacity-50"
                    >
                        {confirmLoading ? "Uploading..." : "Upload"}
                    </button>
                </div>

            </div>
        </Modal>
    );
};

export default AddInvoiceModal;