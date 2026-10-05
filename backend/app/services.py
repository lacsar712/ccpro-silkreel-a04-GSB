"""缫丝盆门槛：

- 标成已缫完须最近一次汤温落在 38～42℃；
- 已缫完拨回浸茧，须有一张未作废且含水百分落在 11～13 的茧层回潮卡。
"""

from app.models import Basin, MoistureCard

MIN_TEMP = 38.0
MAX_TEMP = 42.0

MIN_MOISTURE = 11.0
MAX_MOISTURE = 13.0


class RuleError(ValueError):
    pass


def latest_temp(basin: Basin) -> float | None:
    if not basin.readings:
        return None
    latest = max(basin.readings, key=lambda r: r.taken_at)
    return latest.water_temp_c


def active_moisture_card(basin: Basin) -> MoistureCard | None:
    """该盆当前未作废的回潮卡；同一盆至多一张。"""
    for card in basin.moisture_cards or []:
        if card.voided_at is None:
            return card
    return None


def card_qualifies(card: MoistureCard | None) -> bool:
    return card is not None and MIN_MOISTURE <= card.moisture_pct <= MAX_MOISTURE


def assert_can_set_status(basin: Basin, new_status: str) -> None:
    allowed = {Basin.STATUS_SOAKING, Basin.STATUS_REELING, Basin.STATUS_REELED}
    if new_status not in allowed:
        raise RuleError(f"无效状态：{new_status}")

    if new_status == Basin.STATUS_REELED:
        temp = latest_temp(basin)
        if temp is None:
            raise RuleError("该盆尚无汤温记录，不能标已缫完")
        if temp < MIN_TEMP or temp > MAX_TEMP:
            raise RuleError(
                f"最近汤温 {temp}℃ 不在 {MIN_TEMP:.0f}～{MAX_TEMP:.0f}℃，不能标已缫完"
            )

    if new_status == Basin.STATUS_SOAKING and basin.status == Basin.STATUS_REELED:
        card = active_moisture_card(basin)
        if card is None:
            raise RuleError("该盆已缫完，没有未作废的茧层回潮卡，不能拨回浸茧")
        pct = card.moisture_pct
        if pct < MIN_MOISTURE or pct > MAX_MOISTURE:
            raise RuleError(
                f"回潮卡含水 {pct}% 不在 {MIN_MOISTURE:.0f}～{MAX_MOISTURE:.0f}%，"
                "不能拨回浸茧"
            )
