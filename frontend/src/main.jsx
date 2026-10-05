import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { api, clearToken, setToken, token } from "./api.js";
import "./app.css";

const STATUS_LABEL = { soaking: "浸茧", reeling: "缫丝中", reeled: "已缫完" };
const MIN_MOISTURE = 11;
const MAX_MOISTURE = 13;

function Login({ onOk }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("123456");
  const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault();
    setErr("");
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setToken(data.access_token);
      onOk(data.user);
    } catch (ex) {
      setErr(ex.message);
    }
  }
  return (
    <div class="login">
      <h1>江口缫丝坞</h1>
      <p>汤温环盆作业台，不是列表台账。</p>
      <form onSubmit={submit} autocomplete="off">
        <label>
          用户名
          <input name="username" autocomplete="off" value={username} onInput={(e) => setUsername(e.target.value)} />
        </label>
        <label>
          密码
          <input name="password" type="password" autocomplete="off" value={password} onInput={(e) => setPassword(e.target.value)} />
        </label>
        <p class="hint">已预填 admin / 123456，另有 worker / 123456</p>
        <button type="submit">登录</button>
      </form>
      {err && <p class="err">{err}</p>}
    </div>
  );
}

function TopNav({ view, onView, onLogout }) {
  return (
    <div class="topnav">
      <h1>江口缫丝坞</h1>
      <nav class="navrow">
        <button
          class={view === "yard" ? "navbtn on" : "navbtn"}
          onClick={() => onView("yard")}
        >
          环盆作业台
        </button>
        <button
          class={view === "cards" ? "navbtn on" : "navbtn"}
          onClick={() => onView("cards")}
        >
          回潮卡
        </button>
        <button class="navbtn logout" onClick={onLogout}>
          退出
        </button>
      </nav>
    </div>
  );
}

function fmtTime(s) {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? s
    : d.toLocaleString("zh-CN", { hour12: false });
}

function cardHint(picked) {
  const card = picked.activeCard;
  if (!card) {
    return "无未作废回潮卡：已缫完盆点浸茧会被挡回";
  }
  if (card.qualified) {
    return `回潮卡含水 ${card.moisturePct}%，落在 ${MIN_MOISTURE}～${MAX_MOISTURE}%，可拨回浸茧`;
  }
  return `回潮卡含水 ${card.moisturePct}%，不在 ${MIN_MOISTURE}～${MAX_MOISTURE}%，不能拨回浸茧`;
}

function Yard() {
  const [board, setBoard] = useState(null);
  const [picked, setPicked] = useState(null);
  const [temp, setTemp] = useState("40");
  const [err, setErr] = useState("");

  async function refresh() {
    const data = await api("/api/board");
    setBoard(data);
    if (picked) {
      setPicked(data.basins.find((b) => b.id === picked.id) || data.basins[0]);
    }
  }

  useEffect(() => {
    refresh().catch((e) => setErr(e.message));
  }, []);

  if (!board) {
    return (
      <div class="yard">
        {err || "装载环盆…"}
      </div>
    );
  }

  const n = board.basins.length;
  async function writeTemp() {
    setErr("");
    try {
      const row = await api(`/api/basins/${picked.id}/readings`, {
        method: "POST",
        body: JSON.stringify({ waterTempC: Number(temp) }),
      });
      await refresh();
      setPicked(row);
    } catch (ex) {
      setErr(ex.message);
    }
  }
  async function setStatus(status) {
    setErr("");
    try {
      const row = await api(`/api/basins/${picked.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      await refresh();
      setPicked(row);
    } catch (ex) {
      // 已缫完拨回浸茧的回潮卡门槛、汤温门槛均由后端中文挡住
      setErr(ex.message);
      await refresh();
    }
  }

  return (
    <div class="yard">
      <p class="sub">{board.riverside} · 点盆登记汤温；已缫完须最近汤温 38～42℃；拨回浸茧须合格回潮卡</p>
      <div class="ring">
        {board.basins.map((b, i) => {
          const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
          const left = 50 + Math.cos(angle) * 38;
          const top = 50 + Math.sin(angle) * 38;
          return (
            <button
              key={b.id}
              class={`basin ${b.status}`}
              style={{ left: `${left}%`, top: `${top}%` }}
              onClick={() => setPicked(b)}
            >
              <strong>{b.code}</strong>
              <span>{STATUS_LABEL[b.status]}</span>
            </button>
          );
        })}
      </div>
      {picked && (
        <div class="drawer">
          <h3>
            {picked.code} · {STATUS_LABEL[picked.status]}
          </h3>
          <p>最近汤温：{picked.latestTempC ?? "无"} ℃ · 记录 {picked.readingCount} 次</p>
          <p class={picked.activeCard && picked.activeCard.qualified ? "ok" : "warn"}>
            {cardHint(picked)}
          </p>
          <input value={temp} onInput={(e) => setTemp(e.target.value)} />
          <button onClick={writeTemp}>登记汤温</button>
          <div>
            <button onClick={() => setStatus("soaking")}>浸茧</button>
            <button onClick={() => setStatus("reeling")}>缫丝中</button>
            <button onClick={() => setStatus("reeled")}>已缫完</button>
          </div>
          {err && <p class="err">{err}</p>}
        </div>
      )}
    </div>
  );
}

function MoisturePage({ me }) {
  const [basins, setBasins] = useState([]);
  const [filterBasin, setFilterBasin] = useState("");
  const [cards, setCards] = useState([]);
  const [formBasin, setFormBasin] = useState("");
  const [pct, setPct] = useState("12");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const isAdmin = me && me.role === "admin";
  const basinCode = (id) => basins.find((b) => b.id === id)?.code || `#${id}`;

  async function loadBasins() {
    const data = await api("/api/board");
    setBasins(data.basins);
    if (!formBasin && data.basins.length) setFormBasin(String(data.basins[0].id));
  }

  async function loadCards() {
    const qs = filterBasin ? `?basin_id=${encodeURIComponent(filterBasin)}` : "";
    const data = await api(`/api/moisture-cards${qs}`);
    setCards(data.cards);
  }

  useEffect(() => {
    loadBasins().catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    loadCards().catch((e) => setErr(e.message));
  }, [filterBasin]);

  async function createCard(e) {
    e.preventDefault();
    setErr("");
    setMsg("");
    try {
      await api("/api/moisture-cards", {
        method: "POST",
        body: JSON.stringify({
          basinId: Number(formBasin),
          moisturePct: Number(pct),
        }),
      });
      setMsg("回潮卡已入库");
      await loadCards();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  async function voidCard(card) {
    setErr("");
    setMsg("");
    try {
      await api(`/api/moisture-cards/${card.id}/void`, { method: "POST" });
      setMsg("回潮卡已作废");
      await loadCards();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  return (
    <div class="cards-page">
      <p class="sub">
        茧层回潮卡 · 含水 {MIN_MOISTURE}～{MAX_MOISTURE}% 才能放行已缫完盆拨回浸茧 · 同盆未作废卡至多一张
      </p>

      <div class="card-bar">
        <label>
          按盆筛
          <select value={filterBasin} onChange={(e) => setFilterBasin(e.target.value)}>
            <option value="">全部盆</option>
            {basins.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code}（{STATUS_LABEL[b.status]}）
              </option>
            ))}
          </select>
        </label>
      </div>

      <form class="card-form" onSubmit={createCard}>
        <label>
          盆
          <select value={formBasin} onChange={(e) => setFormBasin(e.target.value)}>
            {basins.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code}（{STATUS_LABEL[b.status]}）
              </option>
            ))}
          </select>
        </label>
        <label>
          含水百分
          <input
            type="number"
            step="0.1"
            value={pct}
            onInput={(e) => setPct(e.target.value)}
          />
        </label>
        <button type="submit">新建回潮卡</button>
        <span class="hint">缫丝工可建卡；测定人记为当前登录人</span>
      </form>

      {msg && <p class="ok">{msg}</p>}
      {err && <p class="err">{err}</p>}

      <table class="card-table">
        <thead>
          <tr>
            <th>盆</th>
            <th>含水百分</th>
            <th>测定时刻</th>
            <th>测定人</th>
            <th>状态</th>
            <th>作废</th>
          </tr>
        </thead>
        <tbody>
          {cards.length === 0 && (
            <tr>
              <td colspan="6" class="hint">暂无回潮卡</td>
            </tr>
          )}
          {cards.map((c) => {
            const inRange = c.moisturePct >= MIN_MOISTURE && c.moisturePct <= MAX_MOISTURE;
            return (
              <tr key={c.id} class={c.active ? "" : "voided"}>
                <td>{basinCode(c.basinId)}</td>
                <td>
                  {c.moisturePct}%
                  {c.active && (
                    <span class={inRange ? "tag ok" : "tag bad"}>
                      {inRange ? "合格" : "出区间"}
                    </span>
                  )}
                </td>
                <td>{fmtTime(c.measuredAt)}</td>
                <td>{c.measurer || "—"}</td>
                <td>
                  {c.active ? (
                    "未作废"
                  ) : (
                    <span class="hint">已于 {fmtTime(c.voidedAt)} 作废</span>
                  )}
                </td>
                <td>
                  {c.active &&
                    (isAdmin ? (
                      <button class="danger" onClick={() => voidCard(c)}>
                        作废
                      </button>
                    ) : (
                      <span class="hint">仅管理员</span>
                    ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Shell({ onExpired }) {
  const [me, setMe] = useState(null);
  const [bootErr, setBootErr] = useState("");
  const [view, setView] = useState("yard");

  useEffect(() => {
    if (!token()) return;
    api("/api/auth/me")
      .then(setMe)
      .catch(() => {
        clearToken();
        onExpired();
      });
  }, []);

  function logout() {
    clearToken();
    location.reload();
  }

  if (!me) {
    return bootErr ? <div class="login"><p class="err">{bootErr}</p></div> : null;
  }

  return (
    <div class="shell">
      <TopNav view={view} onView={setView} onLogout={logout} />
      {view === "yard" ? <Yard /> : <MoisturePage me={me} />}
    </div>
  );
}

function App() {
  const [authed, setAuthed] = useState(Boolean(token()));
  return authed ? (
    <Shell onExpired={() => setAuthed(false)} />
  ) : (
    <Login onOk={() => setAuthed(true)} />
  );
}

render(<App />, document.getElementById("app"));
