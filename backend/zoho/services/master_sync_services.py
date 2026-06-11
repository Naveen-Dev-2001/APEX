import logging
logger = logging.getLogger("ai_app")

class GLSyncService:
    def __init__(self, db):
        self.db = db
    async def sync_gl_accounts(self):
        logger.warning("Zoho GLSyncService.sync_gl_accounts is not implemented yet.")

class LOBSyncService:
    def __init__(self, db):
        self.db = db
    async def sync_lob(self):
        logger.warning("Zoho LOBSyncService.sync_lob is not implemented yet.")

class DepartmentSyncService:
    def __init__(self, db):
        self.db = db
    async def sync_departments(self):
        logger.warning("Zoho DepartmentSyncService.sync_departments is not implemented yet.")

class CustomerSyncService:
    def __init__(self, db):
        self.db = db
    async def sync_customers(self):
        logger.warning("Zoho CustomerSyncService.sync_customers is not implemented yet.")

class ItemSyncService:
    def __init__(self, db):
        self.db = db
    async def sync_items(self):
        logger.warning("Zoho ItemSyncService.sync_items is not implemented yet.")

class ExchangeRateSyncService:
    def __init__(self, db):
        self.db = db
    async def sync_exchange_rates(self):
        logger.warning("Zoho ExchangeRateSyncService.sync_exchange_rates is not implemented yet.")

class EntitySyncService:
    def __init__(self, db):
        self.db = db
    async def sync_entities(self):
        logger.warning("Zoho EntitySyncService.sync_entities is not implemented yet.")
