import os
import importlib
import logging

logger = logging.getLogger("ai_app")

def get_erp_function(module_path: str, function_name: str):
    """
    Dynamically load a function from either the 'sage' or 'zoho' directory 
    based on the ERP_SYSTEM environment variable.
    
    Args:
        module_path: e.g. 'postapbill' or 'services.pdf_service'
        function_name: e.g. 'post_ap_bill' or 'generate_approval_pdf'
    """
    erp = os.getenv("ERP_SYSTEM", "Sage").lower()
    
    if erp not in ["sage", "zoho"]:
        logger.warning(f"Unknown ERP_SYSTEM: {erp}, defaulting to sage")
        erp = "sage"
        
    full_module_path = f"{erp}.{module_path}"
    
    try:
        module = importlib.import_module(full_module_path)
        return getattr(module, function_name)
    except ModuleNotFoundError as e:
        logger.error(f"Could not find ERP module {full_module_path}")
        raise NotImplementedError(f"Module {full_module_path} is missing for ERP {erp}.") from e
    except AttributeError as e:
        logger.error(f"Could not find function {function_name} in {full_module_path}")
        raise NotImplementedError(f"Function {function_name} not implemented in {full_module_path}.") from e

def get_erp_class(module_path: str, class_name: str):
    """Alias for get_erp_function specifically for classes."""
    return get_erp_function(module_path, class_name)
