"""Which study day a moment belongs to. Math is studied late at night, so a day runs 04:00 → 04:00 (Asia/Shanghai)."""
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Asia/Shanghai")
DAY_START_HOUR = 4


def now() -> datetime:
    return datetime.now(TZ)


def study_day(moment: datetime) -> date:
    return (moment.astimezone(TZ) - timedelta(hours=DAY_START_HOUR)).date()


def calendar_day(moment: datetime) -> date:
    """The Shanghai calendar date, which turns at midnight: for the date and exam countdown at the top of the home page."""
    return moment.astimezone(TZ).date()
