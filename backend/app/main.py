from quart import Quart, g, jsonify, request
from quart.helpers import make_response

from app.db import SessionLocal
from app.models import Basin, MoistureCard
from app.repositories import BasinRepo, DuplicateActiveCard, MoistureCardRepo, UserRepo
from app.security import make_token, parse_token, verify_password
from app.services import RuleError, active_card, assert_can_set_status, latest_temp

app = Quart(__name__)


def _bearer() -> str | None:
    header = request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        return header[7:]
    return None


@app.before_request
async def load_user():
    g.user = None
    token = _bearer()
    if not token:
        return
    username = parse_token(token)
    if not username:
        return
    async with SessionLocal() as session:
        g.user = await UserRepo(session).by_username(username)


def require_user():
    if g.user is None:
        return jsonify({"detail": "未登录"}), 401
    return None


@app.route("/api/health")
async def health():
    return {"status": "ok", "service": "SilkReel"}


@app.route("/api/auth/login", methods=["POST"])
async def login():
    body = await request.get_json(force=True)
    username = (body or {}).get("username", "")
    password = (body or {}).get("password", "")
    async with SessionLocal() as session:
        user = await UserRepo(session).by_username(username)
        if user is None or not verify_password(password, user.password_hash):
            return jsonify({"detail": "用户名或密码错误"}), 401
        return {
            "access_token": make_token(user.username),
            "user": {"username": user.username, "role": user.role},
        }


@app.route("/api/auth/me")
async def me():
    denied = require_user()
    if denied:
        return denied
    return {"username": g.user.username, "role": g.user.role}


def _basin_json(basin: Basin) -> dict:
    card = active_card(basin)
    return {
        "id": basin.id,
        "code": basin.code,
        "status": basin.status,
        "ringIndex": basin.ring_index,
        "latestTempC": latest_temp(basin),
        "readingCount": len(basin.readings or []),
        "activeMoisturePct": card.moisture_pct if card else None,
    }


def _card_json(card: MoistureCard) -> dict:
    return {
        "id": card.id,
        "basinId": card.basin_id,
        "basinCode": card.basin.code if card.basin else None,
        "moisturePct": card.moisture_pct,
        "measuredAt": card.measured_at.isoformat() if card.measured_at else None,
        "measuredBy": card.measured_by,
        "voidedAt": card.voided_at.isoformat() if card.voided_at else None,
    }


@app.route("/api/board")
async def board():
    denied = require_user()
    if denied:
        return denied
    async with SessionLocal() as session:
        mill = await BasinRepo(session).board()
        if mill is None:
            return jsonify({"detail": "尚无缫丝坞"}), 404
        basins = sorted(mill.basins, key=lambda b: b.ring_index)
        return {
            "filature": mill.name,
            "riverside": mill.riverside,
            "basins": [_basin_json(b) for b in basins],
        }


@app.route("/api/basins/<int:basin_id>/readings", methods=["POST"])
async def add_reading(basin_id: int):
    denied = require_user()
    if denied:
        return denied
    body = await request.get_json(force=True)
    try:
        temp = float((body or {}).get("waterTempC"))
    except (TypeError, ValueError):
        return jsonify({"detail": "汤温必须是数字"}), 400
    async with SessionLocal() as session:
        repo = BasinRepo(session)
        basin = await repo.get(basin_id)
        if basin is None:
            return jsonify({"detail": "盆不存在"}), 404
        await repo.add_reading(basin, temp, g.user.username)
        basin = await repo.get(basin_id)
        return _basin_json(basin)


@app.route("/api/basins/<int:basin_id>/status", methods=["POST"])
async def set_status(basin_id: int):
    denied = require_user()
    if denied:
        return denied
    body = await request.get_json(force=True)
    status = (body or {}).get("status", "")
    async with SessionLocal() as session:
        repo = BasinRepo(session)
        basin = await repo.get(basin_id)
        if basin is None:
            return jsonify({"detail": "盆不存在"}), 404
        try:
            assert_can_set_status(basin, status)
        except RuleError as exc:
            return jsonify({"detail": str(exc)}), 400
        await repo.save_status(basin, status)
        basin = await repo.get(basin_id)
        return _basin_json(basin)


@app.route("/api/moisture-cards")
async def list_moisture_cards():
    denied = require_user()
    if denied:
        return denied
    basin_id = request.args.get("basinId", type=int)
    async with SessionLocal() as session:
        rows = await MoistureCardRepo(session).list(basin_id)
        return {"cards": [_card_json(c) for c in rows]}


@app.route("/api/moisture-cards", methods=["POST"])
async def create_moisture_card():
    denied = require_user()
    if denied:
        return denied
    body = await request.get_json(force=True)
    try:
        basin_id = int((body or {}).get("basinId"))
        moisture_pct = float((body or {}).get("moisturePct"))
    except (TypeError, ValueError):
        return jsonify({"detail": "盆和含水百分必须填数字"}), 400
    async with SessionLocal() as session:
        basin = await BasinRepo(session).get(basin_id)
        if basin is None:
            return jsonify({"detail": "盆不存在"}), 404
        try:
            row = await MoistureCardRepo(session).create(basin, moisture_pct, g.user.username)
        except DuplicateActiveCard:
            return jsonify({"detail": "该盆已有未作废的回潮卡，不能重复建卡"}), 409
        return _card_json(row), 201


@app.route("/api/moisture-cards/<int:card_id>/void", methods=["POST"])
async def void_moisture_card(card_id: int):
    denied = require_user()
    if denied:
        return denied
    if g.user.role != "admin":
        return jsonify({"detail": "只有管理员能作废回潮卡"}), 403
    async with SessionLocal() as session:
        repo = MoistureCardRepo(session)
        card = await repo.get(card_id)
        if card is None:
            return jsonify({"detail": "回潮卡不存在"}), 404
        if card.voided_at is not None:
            return jsonify({"detail": "该卡已作废"}), 400
        await repo.void(card)
        return _card_json(card)
