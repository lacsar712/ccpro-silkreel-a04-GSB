import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { api, clearToken, role, setRole, setToken, token } from "./api.js";
import "./app.css";

const STATUS_LABEL = { soaking: "浸茧", reeling: "缫丝中", reeled: "已缫完" };

function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN", { hour12: false });
}

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
      setRole(data.user.role);
      onOk();
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
      setErr(ex.message);
    }
  }

  return (
    <div class="yard">
      <div class="topbar">
        <div>
          <h1>{board.filature}</h1>
          <p>{board.riverside} · 点盆登记汤温；已缫完须最近汤温 38～42℃；已缫完拨回浸茧须含水 11～13% 的未作废回潮卡</p>
        </div>
      </div>
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
          <p>
            回潮卡：
            {picked.activeMoisturePct != null ? `未作废 · 含水 ${picked.activeMoisturePct}%` : "无未作废卡"}
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

function MoistureCards() {
  const [basins, setBasins] = useState([]);
  const [cards, setCards] = useState([]);
  const [filter, setFilter] = useState("");
  const [basinId, setBasinId] = useState("");
  const [pct, setPct] = useState("12");
  const [err, setErr] = useState("");
  const isAdmin = role() === "admin";

  async function loadBasins() {
    const data = await api("/api/board");
    setBasins(data.basins);
    if (!basinId && data.basins.length) setBasinId(String(data.basins[0].id));
  }

  async function loadCards() {
    const q = filter ? `?basinId=${filter}` : "";
    const data = await api(`/api/moisture-cards${q}`);
    setCards(data.cards);
  }

  useEffect(() => {
    loadBasins().catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    loadCards().catch((e) => setErr(e.message));
  }, [filter]);

  async function create(e) {
    e.preventDefault();
    setErr("");
    try {
      await api("/api/moisture-cards", {
        method: "POST",
        body: JSON.stringify({ basinId: Number(basinId), moisturePct: Number(pct) }),
      });
      await loadCards();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  async function voidCard(id) {
    setErr("");
    try {
      await api(`/api/moisture-cards/${id}/void`, { method: "POST" });
      await loadCards();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  return (
    <div class="yard">
      <div class="topbar">
        <div>
          <h1>茧层回潮卡</h1>
          <p>已缫完拨回浸茧须一张未作废且含水 11～13% 的回潮卡；同盆未作废卡最多一张。</p>
        </div>
      </div>

      <div class="panel">
        <label>
          按盆筛选
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">全部盆</option>
            {basins.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code}
              </option>
            ))}
          </select>
        </label>
      </div>

      <form class="panel" onSubmit={create}>
        <h3>新建回潮卡</h3>
        <label>
          盆
          <select value={basinId} onChange={(e) => setBasinId(e.target.value)}>
            {basins.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code}（{STATUS_LABEL[b.status]}）
              </option>
            ))}
          </select>
        </label>
        <label>
          含水百分
          <input value={pct} onInput={(e) => setPct(e.target.value)} />
        </label>
        <button type="submit">建卡</button>
        <p class="hint">测定时刻、测定人由系统登记；含水不在 11～13% 的卡不能放行拨回。</p>
      </form>

      <div class="panel">
        <table class="cards">
          <thead>
            <tr>
              <th>盆</th>
              <th>含水百分</th>
              <th>测定时刻</th>
              <th>测定人</th>
              <th>作废时刻</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cards.map((c) => (
              <tr key={c.id} class={c.voidedAt ? "voided" : ""}>
                <td>{c.basinCode}</td>
                <td>{c.moisturePct}%</td>
                <td>{fmtTime(c.measuredAt)}</td>
                <td>{c.measuredBy}</td>
                <td>{c.voidedAt ? fmtTime(c.voidedAt) : "未作废"}</td>
                <td>
                  {!c.voidedAt && isAdmin && <button onClick={() => voidCard(c.id)}>作废</button>}
                </td>
              </tr>
            ))}
            {!cards.length && (
              <tr>
                <td colspan="6">暂无回潮卡</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {err && <p class="err">{err}</p>}
    </div>
  );
}

function App() {
  const [ready, setReady] = useState(Boolean(token()));
  const [view, setView] = useState("yard");
  if (!ready) {
    return <Login onOk={() => setReady(true)} />;
  }
  return (
    <div>
      <nav class="topnav">
        <button class={view === "yard" ? "active" : ""} onClick={() => setView("yard")}>
          环盆作业台
        </button>
        <button class={view === "cards" ? "active" : ""} onClick={() => setView("cards")}>
          回潮卡
        </button>
        <span class="spacer" />
        <button
          onClick={() => {
            clearToken();
            location.reload();
          }}
        >
          退出
        </button>
      </nav>
      {view === "yard" ? <Yard /> : <MoistureCards />}
    </div>
  );
}

render(<App />, document.getElementById("app"));
