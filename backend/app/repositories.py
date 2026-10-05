from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Basin, BathReading, Filature, MoistureCard, User, utcnow


class DuplicateActiveCard(Exception):
    """同一盆已存在未作废的回潮卡（唯一索引拦截，含并发双交）。"""


class UserRepo:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def by_username(self, username: str) -> User | None:
        result = await self.session.execute(select(User).where(User.username == username))
        return result.scalar_one_or_none()


class BasinRepo:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def board(self) -> Filature | None:
        result = await self.session.execute(
            select(Filature).options(
                selectinload(Filature.basins).selectinload(Basin.readings),
                selectinload(Filature.basins).selectinload(Basin.moisture_cards),
            )
        )
        return result.scalars().first()

    async def get(self, basin_id: int) -> Basin | None:
        result = await self.session.execute(
            select(Basin)
            .options(
                selectinload(Basin.readings),
                selectinload(Basin.moisture_cards),
            )
            .where(Basin.id == basin_id)
        )
        return result.scalar_one_or_none()

    async def add_reading(self, basin: Basin, temp_c: float, operator: str) -> BathReading:
        row = BathReading(basin=basin, water_temp_c=temp_c, operator=operator)
        self.session.add(row)
        await self.session.commit()
        await self.session.refresh(row)
        return row

    async def save_status(self, basin: Basin, status: str) -> None:
        basin.status = status
        await self.session.commit()


class MoistureCardRepo:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list(self, basin_id: int | None = None) -> list[MoistureCard]:
        stmt = (
            select(MoistureCard)
            .options(selectinload(MoistureCard.basin))
            .order_by(MoistureCard.id.desc())
        )
        if basin_id is not None:
            stmt = stmt.where(MoistureCard.basin_id == basin_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get(self, card_id: int) -> MoistureCard | None:
        result = await self.session.execute(
            select(MoistureCard)
            .options(selectinload(MoistureCard.basin))
            .where(MoistureCard.id == card_id)
        )
        return result.scalar_one_or_none()

    async def create(self, basin: Basin, moisture_pct: float, measured_by: str) -> MoistureCard:
        row = MoistureCard(basin=basin, moisture_pct=moisture_pct, measured_by=measured_by)
        self.session.add(row)
        try:
            await self.session.commit()
        except IntegrityError:
            await self.session.rollback()
            raise DuplicateActiveCard()
        return row

    async def void(self, card: MoistureCard) -> None:
        card.voided_at = utcnow()
        await self.session.commit()
