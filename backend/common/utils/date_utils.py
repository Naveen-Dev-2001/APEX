from datetime import datetime, timedelta, timezone

def get_ist_now():
    """
    Returns current time in IST (UTC+5:30) as a naive datetime object.
    This is used to store 'as like IST' in the database.
    """
    # IST is UTC + 5:30
    ist_offset = timezone(timedelta(hours=5, minutes=30))
    return datetime.now(ist_offset).replace(tzinfo=None)
