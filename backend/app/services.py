"""缫丝盆门槛：标已缫完须最近汤温 38～42℃；已缫完拨回浸茧须合格回潮卡。"""

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


def active_card(basin: Basin) -> MoistureCard | None:
    """该盆当前未作废的回潮卡（数据库保证最多一张）。"""
    for card in basin.moisture_cards or []:
        if card.voided_at is None:
            return card
    return None


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
        card = active_card(basin)
        if card is None:
            raise RuleError("该盆没有未作废的茧层回潮卡，不能拨回浸茧")
        if card.moisture_pct < MIN_MOISTURE or card.moisture_pct > MAX_MOISTURE:
            raise RuleError(
                f"回潮卡含水 {card.moisture_pct}% 不在 "
                f"{MIN_MOISTURE:.0f}～{MAX_MOISTURE:.0f}%，不能拨回浸茧"
            )
