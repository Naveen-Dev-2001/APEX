# import logging
# import sys
# from logging.handlers import RotatingFileHandler

# def setup_logger():
#     logger = logging.getLogger("ai_app")
#     logger.setLevel(logging.INFO)

#     formatter = logging.Formatter(
#         "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
#     )

#     # Console handler
#     console_handler = logging.StreamHandler(sys.stdout)
#     console_handler.setFormatter(formatter)

#     # File handler (rotates after 5MB)
#     file_handler = RotatingFileHandler(
#         "app.log", maxBytes=5*1024*1024, backupCount=3
#     )
#     file_handler.setFormatter(formatter)

#     logger.addHandler(console_handler)
#     logger.addHandler(file_handler)

#     return logger

# # Instantiate the logger so it can be imported
# logger = setup_logger()





import logging
import sys



from contextvars import ContextVar
from typing import Optional, Dict

# Scoped user context variable
current_user_var: ContextVar[Optional[Dict[str, str]]] = ContextVar("current_user", default=None)


class UserContextFilter(logging.Filter):
    """
    Ensures every log record has username and email fields.
    """

    def filter(self, record):
        user_info = current_user_var.get()
        if user_info:
            if not hasattr(record, "username") or record.username == "System":
                record.username = user_info.get("username", "System")
            if not hasattr(record, "email") or record.email == "N/A":
                record.email = user_info.get("email", "N/A")
        else:
            if not hasattr(record, "username"):
                record.username = "System"
            if not hasattr(record, "email"):
                record.email = "N/A"

        return True


def setup_logger():
    logger = logging.getLogger("ai_app")

    # Prevent duplicate handlers
    if logger.handlers:
        return logger

    logger.setLevel(logging.INFO)

    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(name)s | "
        "User=%(username)s | Email=%(email)s | %(message)s"
    )

    user_filter = UserContextFilter()

    # Console Handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    console_handler.addFilter(user_filter)

    # Standard File Handler
    file_handler = logging.FileHandler(
        filename="app.log",
        encoding="utf-8"
    )

    file_handler.setFormatter(formatter)
    file_handler.addFilter(user_filter)

    logger.addHandler(console_handler)
    logger.addHandler(file_handler)
    logger.propagate = False

    return logger


# Global logger instance
logger = setup_logger()


def log_message(level, message, user=None):
    """
    Generic logging function.

    Args:
        level: info, warning, error, debug, critical
        message: Log message
        user: Current user object (optional)
    """
    user_info = current_user_var.get()
    username = getattr(user, "username", None) or (user_info.get("username") if user_info else "System")
    email = getattr(user, "email", None) or (user_info.get("email") if user_info else "N/A")

    extra = {
        "username": username,
        "email": email
    }

    log_func = getattr(logger, level.lower(), logger.info)
    log_func(message, extra=extra)


def log_info(message, user=None):
    log_message("info", message, user)


def log_warning(message, user=None):
    log_message("warning", message, user)


def log_error(message, user=None):
    log_message("error", message, user)


def log_debug(message, user=None):
    log_message("debug", message, user)


def log_critical(message, user=None):
    log_message("critical", message, user)