import logging
logger = logging.getLogger("ai_app")

class BaseSyncService:
    def __init__(self, *args, **kwargs):
        pass
        
    def sync(self, *args, **kwargs):
        logger.warning("Zoho BaseSyncService.sync is not implemented yet.")
        pass
