import {
    FullscreenOutlined,
    LeftOutlined,
    RightOutlined,
    FilePdfOutlined,
    RotateLeftOutlined,
    RotateRightOutlined,
    ReloadOutlined,
    ColumnWidthOutlined,
    PlusOutlined,
    MinusOutlined
} from "@ant-design/icons";
import { Tooltip, Button } from "antd";

const InvoicePdfToolbar = ({
    fileName,
    page,
    numPages,
    changePage,
    rotate,
    zoom,
    autoFit,
    setAutoFit,
    autoFitWidth,
    fitToPage,
    resetView,
    pdfObj,
    rotation
}) => {
    return (
        <div className="h-12 min-h-[48px] bg-white border-b border-[#E1E6EB] px-4 flex items-center justify-between shadow-sm z-20">
            {/* Left: Metadata & Filename */}
            <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0 border border-red-100">
                    <FilePdfOutlined className="text-red-500" style={{ fontSize: 16 }} />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[12px] font-bold text-[#101828] truncate" title={fileName}>
                        {fileName || "No document loaded"}
                    </span>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                    <Button 
                        size="small" 
                        icon={<LeftOutlined style={{ fontSize: 10 }} />} 
                        onClick={() => changePage(-1)} 
                        disabled={page === 1} 
                    />
                    <Button 
                        size="small" 
                        icon={<RightOutlined style={{ fontSize: 10 }} />} 
                        onClick={() => changePage(1)} 
                        disabled={page === numPages} 
                    />
                    <span className="text-[11px] font-bold text-[#344054] ml-1 whitespace-nowrap">
                        {page}/{numPages || 1}
                    </span>
                </div>
            </div>

            {/* Right: Specialized Controls */}
            <div className="flex items-center gap-1 flex-shrink-0">
                <div className="flex items-center gap-0.5 p-0.5 bg-gray-50 rounded-lg border border-gray-100">
                    <Tooltip title="Rotate Left">
                        <Button size="small" type="text" icon={<RotateLeftOutlined />} onClick={() => rotate(-90)} />
                    </Tooltip>
                    <Tooltip title="Rotate Right">
                        <Button size="small" type="text" icon={<RotateRightOutlined />} onClick={() => rotate(90)} />
                    </Tooltip>

                    <div className="w-px h-4 bg-gray-200 mx-0.5" />

                    <Tooltip title="Zoom Out">
                        <Button size="small" type="text" icon={<MinusOutlined />} onClick={() => zoom(-0.2)} />
                    </Tooltip>
                    <Tooltip title="Zoom In">
                        <Button size="small" type="text" icon={<PlusOutlined />} onClick={() => zoom(0.2)} />
                    </Tooltip>

                    <div className="w-px h-4 bg-gray-200 mx-0.5" />

                    <Tooltip title="Fit to Width">
                        <Button
                            size="small"
                            type={autoFit ? "primary" : "text"}
                            icon={<ColumnWidthOutlined />}
                            onClick={() => { setAutoFit(true); autoFitWidth(pdfObj, page, rotation); }}
                        />
                    </Tooltip>
                    <Tooltip title="Fit to Page">
                        <Button size="small" type="text" icon={<FullscreenOutlined />} onClick={fitToPage} />
                    </Tooltip>
                    <Tooltip title="Reset View">
                        <Button size="small" type="text" icon={<ReloadOutlined />} onClick={resetView} />
                    </Tooltip>
                </div>
            </div>
        </div>
    );
};

export default InvoicePdfToolbar;
