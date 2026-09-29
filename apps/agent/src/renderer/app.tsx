import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { RasedApi } from "../preload";
import type { ViewModel } from "../core/types";

declare global {
  interface Window {
    rased: RasedApi;
  }
}
const rased = window.rased;

type MainView = Extract<ViewModel, { screen: "main" }>;

function fmt(ms: number, seconds = true) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return seconds ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${h}:${String(m).padStart(2, "0")}`;
}

function useTick(active: boolean) {
  const [, setT] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setT((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}

function Brand({ sub }: { sub?: string }) {
  return (
    <div className="brand">
      <div className="logo">ر</div>
      <div>
        <b>راصد</b>
        {sub && <small>{sub}</small>}
      </div>
    </div>
  );
}

function Login({ v }: { v: Extract<ViewModel, { screen: "login" }> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [serverUrl, setServerUrl] = useState(v.serverUrl);
  return (
    <form
      className="screen"
      onSubmit={(e) => {
        e.preventDefault();
        void rased.login(serverUrl, email, password);
      }}
    >
      <Brand sub="برنامج متابعة العمل" />
      <div className="spacer" />
      <div>
        <h1>تسجيل الدخول</h1>
        <p className="muted small" style={{ marginTop: 4 }}>ادخل بنفس الإيميل وكلمة المرور بتوع الموقع</p>
      </div>
      {v.error && <div className="alert alert-error">{v.error}</div>}
      <div className="field">
        <label htmlFor="email">البريد الإلكتروني</label>
        <input id="email" type="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label htmlFor="password">كلمة المرور</label>
        <input id="password" type="password" dir="ltr" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <details>
        <summary>إعدادات السيرفر</summary>
        <div className="field" style={{ marginTop: 8 }}>
          <label htmlFor="server">رابط الموقع</label>
          <input id="server" type="url" dir="ltr" required value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} />
        </div>
      </details>
      <button className="btn btn-primary btn-lg" disabled={v.busy}>
        {v.busy ? "جاري الدخول..." : "دخول"}
      </button>
      <div className="spacer" />
    </form>
  );
}

function Consent({ v }: { v: Extract<ViewModel, { screen: "consent" }> }) {
  const [agree, setAgree] = useState(false);
  return (
    <div className="screen">
      <Brand sub={v.companyName} />
      <div>
        <h1>قبل ما تبدأ يا {v.userName.split(" ")[0]}</h1>
        <p className="muted small" style={{ marginTop: 4 }}>البرنامج ده بيسجل الآتي — وبس وانت مسجل حضور:</p>
      </div>
      <ul className="consent-list">
        <li><span className="ico ico-yes">⏱</span><span>وقت الحضور والانصراف والاستراحات</span></li>
        <li><span className="ico ico-yes">📷</span><span>لقطة شاشة في وقت عشوائي كل {v.screenshotIntervalMin} دقايق تقريبًا (هيظهرلك إشعار كل مرة)</span></li>
        <li><span className="ico ico-yes">⌨</span><span><b>عدد</b> ضغطات الكيبورد وحركات الماوس بس — من غير تسجيل أي حاجة بتكتبها</span></li>
        <li><span className="ico ico-yes">🗔</span><span>البرامج والمواقع اللي بتستخدمها</span></li>
        <li><span className="ico ico-no">✕</span><span>مفيش أي تسجيل خارج وقت العمل أو أثناء الاستراحة</span></li>
        <li><span className="ico ico-no">✕</span><span>وقت الخمول (أكتر من {v.idleThresholdMin} دقايق من غير نشاط) ما بيتحسبش ساعات عمل</span></li>
      </ul>
      <p className="muted small">وتقدر تشوف كل حاجة اتسجلت عنك من لوحتك على الموقع.</p>
      {v.error && <div className="alert alert-error">{v.error}</div>}
      <div className="spacer" />
      <label className="check">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        قرأت وأوافق
      </label>
      <button className="btn btn-primary btn-lg" disabled={!agree || v.busy} onClick={() => void rased.consent()}>
        موافق وابدأ
      </button>
    </div>
  );
}

function Main({ v }: { v: MainView }) {
  const [busy, setBusy] = useState(false);
  const live = v.status === "WORKING" && !v.webSession && !v.idleSince;
  useTick(v.status !== "OFFLINE");
  const serverNow = Date.now() + v.clockOffsetMs;
  const worked = v.workedBaseMs + (v.status === "WORKING" && !v.idleSince ? Math.max(0, serverNow - v.baseAt) : 0);
  const pct = Math.min(100, (worked / v.dailyMs) * 100);
  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const pill = v.status === "ON_BREAK" ? ["pill-break", "في استراحة"] : v.status === "OFFLINE" ? ["pill-off", "غير مسجل حضور"] : v.idleSince ? ["pill-idle", "خامل — الوقت متوقف"] : ["pill-working", v.webSession ? "حضور من الموقع" : "يعمل الآن • التتبع شغال"];

  return (
    <div className="screen">
      <div className="row" style={{ alignItems: "center" }}>
        <Brand sub={v.companyName} />
        <div style={{ textAlign: "left", flex: "none" }}>
          <span className={`pill ${pill[0]}`}>{pill[1]}</span>
        </div>
      </div>

      {!v.online && <div className="alert alert-warn">مفيش اتصال بالسيرفر — كل حاجة متسجلة على الجهاز وهتتبعت أول ما النت يرجع{v.pending ? ` (${v.pending})` : ""}.</div>}
      {v.error && <div className="alert alert-error">{v.error}</div>}

      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p className="muted small" style={{ textAlign: "center" }}>
          {v.status === "ON_BREAK" ? "مدة الاستراحة" : "ساعات النهارده"}
        </p>
        <div className="timer">{v.status === "ON_BREAK" && v.breakStartedAt ? fmt(serverNow - v.breakStartedAt) : fmt(worked)}</div>
        <div className={`progress ${pct >= 100 ? "done" : ""}`}>
          <div style={{ width: `${pct}%` }} />
        </div>
        <div className="stat">
          <span className="muted">المطلوب</span>
          <span>{fmt(v.dailyMs, false)} ساعات</span>
        </div>
        {v.status === "ON_BREAK" && (
          <div className="stat">
            <span className="muted">شغلك النهارده</span>
            <span>{fmt(worked, false)}</span>
          </div>
        )}
      </div>

      {v.webSession && (
        <div className="alert alert-info">
          انت مسجل حضور من الموقع (الوقت بس من غير تتبع). اضغط تحت عشان تكمل من البرنامج.
        </div>
      )}
      {v.idleSince && v.status === "WORKING" && <div className="alert alert-warn">مفيش نشاط — الوقت ده مش بيتحسب لحد ما ترجع تشتغل.</div>}
      {v.status === "ON_BREAK" && <div className="alert alert-warn">التتبع متوقف أثناء الاستراحة.</div>}

      <div className="spacer" />

      {v.status === "OFFLINE" && (
        <button className="btn btn-primary btn-lg" disabled={busy} onClick={run(rased.checkIn)}>
          تسجيل حضور
        </button>
      )}
      {v.status === "WORKING" && v.webSession && (
        <button className="btn btn-primary btn-lg" disabled={busy} onClick={run(rased.checkIn)}>
          كمّل من البرنامج
        </button>
      )}
      {v.status === "WORKING" && (
        <div className="row">
          {!v.webSession && (
            <button className="btn btn-warning btn-lg" disabled={busy} onClick={run(rased.startBreak)}>
              استراحة
            </button>
          )}
          <button className="btn btn-danger-outline btn-lg" disabled={busy} onClick={run(rased.checkOut)}>
            تسجيل انصراف
          </button>
        </div>
      )}
      {v.status === "ON_BREAK" && (
        <div className="row">
          <button className="btn btn-primary btn-lg" disabled={busy} onClick={run(rased.endBreak)}>
            استئناف العمل
          </button>
          <button className="btn btn-danger-outline btn-lg" disabled={busy} onClick={run(rased.checkOut)}>
            انصراف
          </button>
        </div>
      )}
      {live && <p className="muted small" style={{ textAlign: "center" }}>قفل الشباك مش هيوقف البرنامج — هيفضل في شريط المهام.</p>}

      <div className="footer">
        <span>
          {v.user.name}
          <br />
          <span className="muted">{v.user.email}</span>
        </span>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <button className="btn-link" onClick={() => void rased.openDashboard()}>
            لوحتي على الموقع
          </button>
          <button
            className="btn-link"
            style={{ color: "var(--muted)" }}
            onClick={() => {
              if (confirm("تسجيل الخروج من البرنامج على الجهاز ده؟")) void rased.logout();
            }}
          >
            تسجيل خروج
          </button>
        </span>
      </div>
    </div>
  );
}

function App() {
  const [v, setV] = useState<ViewModel>({ screen: "loading" });
  useEffect(() => {
    void rased.view().then(setV);
    return rased.onView(setV);
  }, []);
  if (v.screen === "login") return <Login v={v} />;
  if (v.screen === "consent") return <Consent v={v} />;
  if (v.screen === "main") return <Main v={v} />;
  return (
    <div className="screen center">
      <div className="spin" />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
