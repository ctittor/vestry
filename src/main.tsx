import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  createContext,
  useContext,
} from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  Users,
  House,
  BookOpen,
  Archive,
  ScanLine,
  FileBadge,
  ChartNoAxesCombined,
  Settings,
  History,
  Search,
  Plus,
  X,
  Menu,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  Check,
  Clock,
  Upload,
  LogOut,
  ShieldCheck,
  ExternalLink,
  Download,
  FolderOpen,
  FileText,
  ZoomIn,
  ZoomOut,
  RotateCw,
  CheckCheck,
  Church,
  Mail,
  LockKeyhole,
  Bell,
  Command,
  RefreshCw,
  Ellipsis,
  Leaf,
  Info,
  AlertCircle,
  Sun,
  Layers,
  LoaderCircle,
} from "lucide-react";
import {
  api,
  post,
  patch,
  setCsrf,
  setParish,
  setChangeReason,
  parishQuery,
  type Row,
} from "./api";
import "./styles.css";
import {
  activityCategories,
  observationLabels,
  initialChecklist,
} from "../shared/forane";
type ContextType = {
  session: Row;
  refresh: () => void;
  notify: (message: string) => void;
  can: (p: string) => boolean;
  navigate: (page: string) => void;
};
const Ctx = createContext<ContextType>(null!);
const useApp = () => useContext(Ctx);
const icons: Record<string, any> = {
  Overview: LayoutDashboard,
  Members: Users,
  Households: House,
  Registers: BookOpen,
  "Digital archive": Archive,
  Digitisation: ScanLine,
  Certificates: FileBadge,
  Reports: ChartNoAxesCombined,
  Administration: Settings,
  "Audit history": History,
  Platform: Church,
  Alerts: Bell,
  "Record management": Layers,
  "Forane activities": Clock,
};
const navGroups = [
  {
    title: "WORKSPACE",
    items: [
      ["Overview", "registers.view"],
      ["Members", "members.view"],
      ["Households", "members.view"],
      ["Registers", "registers.view"],
      ["Digital archive", "archive.view"],
      ["Digitisation", "ocr.review"],
      ["Certificates", "registers.certify"],
    ],
  },
  {
    title: "MANAGEMENT",
    items: [
      ["Reports", "reports.view"],
      ["Administration", "tenant.manage"],
      ["Audit history", "audit.view"],
      ["Alerts", "members.view"],
      ["Record management", "tenant.manage"],
      ["Forane activities", "members.view"],
    ],
  },
];
const fmt = (v: unknown) => Number(v || 0).toLocaleString("en-IN");
const date = (v: string) =>
  v
    ? new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(v))
    : "Not recorded";
function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={"brand " + (small ? "small" : "")}>
      <div className="brand-mark">
        <BookOpen size={23} />
        <span>✦</span>
      </div>
      <span>
        vestry<span className="brand-period">.</span>
      </span>
    </div>
  );
}
function Badge({ status, label }: { status: string; label?: string }) {
  return (
    <span className={"badge " + status}>
      {label ||
        (status === "submitted"
          ? "Awaiting approval"
          : status === "manual"
            ? "Manual review"
            : status === "reviewed"
              ? "Ready to import"
              : status.replaceAll("_", " "))}
    </span>
  );
}
function Button({
  children,
  className = "",
  busy = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button
      className={"button " + className}
      disabled={busy || props.disabled}
      {...props}
    >
      {busy ? <LoaderCircle className="spin" size={17} /> : null}
      {children}
    </button>
  );
}
function Empty({
  title,
  description,
  icon: Icon = FolderOpen,
  action,
}: {
  title: string;
  description: string;
  icon?: any;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Icon size={34} strokeWidth={1.3} />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
function ErrorBox({ error }: { error: string }) {
  return error ? (
    <div className="error" role="alert">
      <AlertCircle size={17} />
      {error}
    </div>
  ) : null;
}
function useData(path: string | null, deps: unknown[] = [], pollMs = 0) {
  const [data, setData] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) {
      setData(null);
      setLoading(false);
      setError("");
      return;
    }
    let live = true;
    let pending = true;
    setLoading(true);
    setError("");
    const load = () =>
      api(path)
        .then((d) => {
          if (live) {
            setData(d);
            pending = Boolean(
              d.items?.some((item: Row) =>
                ["queued", "processing"].includes(item.status),
              ),
            );
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    void load();
    const timer = pollMs
      ? setInterval(() => {
          if (live && pending && !document.hidden) void load();
        }, pollMs)
      : undefined;
    return () => {
      live = false;
      if (timer) clearInterval(timer);
    };
  }, [path, tick, pollMs, ...deps]);
  return { data, error, loading, reload: () => setTick((t) => t + 1) };
}
function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" /> Loading your workspace…
    </div>
  );
}
function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => previous?.focus();
  }, []);
  return (
    <dialog
      aria-label={title}
      ref={ref}
      className={"modal " + (wide ? "wide" : "")}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <header>
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={22} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Pagination({
  data,
  page,
  setPage,
}: {
  data: Row | null;
  page: number;
  setPage: (v: number) => void;
}) {
  if (!data?.total) return null;
  return (
    <div className="pagination">
      <span>
        Showing {fmt((page - 1) * data.limit + 1)}–
        {fmt(Math.min(page * data.limit, data.total))} of {fmt(data.total)}
      </span>
      <div>
        <button
          className="icon-button"
          aria-label="Previous page"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <span>Page {page}</span>
        <button
          className="icon-button"
          aria-label="Next page"
          disabled={page * data.limit >= data.total}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
function App() {
  const [session, setSession] = useState<Row | null>(null),
    [initial, setInitial] = useState(true),
    [page, setPage] = useState(
      decodeURIComponent(location.hash.slice(1)) || "Overview",
    ),
    [drawer, setDrawer] = useState(false),
    [toast, setToast] = useState(""),
    [searchOpen, setSearchOpen] = useState(false),
    [entry, setEntry] = useState<string | null>(null);
  const refresh = useCallback(() => {
    api("/auth/me")
      .then((s) => {
        setCsrf(s.csrf);
        setSession(s);
      })
      .catch(() => setSession(null))
      .finally(() => setInitial(false));
  }, []);
  useEffect(refresh, [refresh]);
  useEffect(() => {
    const expired = () => {
      setCsrf("");
      setParish("");
      setChangeReason("");
      setSession(null);
      setEntry(null);
      setSearchOpen(false);
      setDrawer(false);
    };
    window.addEventListener("vestry-session-expired", expired);
    return () => window.removeEventListener("vestry-session-expired", expired);
  }, []);
  useEffect(() => {
    const handler = () =>
      setPage(decodeURIComponent(location.hash.slice(1)) || "Overview");
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((s) => !s);
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);
  const navigate = (v: string) => {
    location.hash = encodeURIComponent(v);
    setPage(v);
    setDrawer(false);
  };
  if (initial)
    return (
      <div className="boot">
        <Brand />
        <Loading />
      </div>
    );
  if (!session)
    return (
      <Login
        onLogin={() => {
          navigate("Overview");
          refresh();
        }}
      />
    );
  const can = (p: string) => session.user.permissions.includes(p),
    platform = ["platform_admin", "archdiocese_admin", "forane_admin"].includes(
      session.user.role,
    ),
    current = session.mfa_required
      ? "My account"
      : platform &&
          !session.tenant &&
          ![
            "My account",
            "Foranes",
            "Forane activities",
            "Forane dashboard",
            "Platform",
          ].includes(page)
        ? session.user.role === "forane_admin"
          ? "Forane dashboard"
          : "Platform"
        : page;
  const ctx = { session, refresh, notify: setToast, can, navigate };
  return (
    <Ctx.Provider value={ctx}>
      <a
        className="skip-link"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <div className="app-shell">
        {drawer && (
          <button
            className="drawer-scrim"
            aria-label="Close navigation"
            onClick={() => setDrawer(false)}
          />
        )}
        <aside className={"sidebar " + (drawer ? "open" : "")}>
          <Brand />
          <div className="church-switch">
            <div className="church-avatar">
              <Church size={20} />
            </div>
            <div>
              <strong>
                {session.tenant?.name ||
                  session.forane?.name ||
                  "Archdiocese office"}
              </strong>
              <span>
                {session.tenant
                  ? session.forane?.name || "Parish workspace"
                  : session.user.role === "forane_admin"
                    ? "Forane office"
                    : "Central administration"}
              </span>
            </div>
            <LockKeyhole size={14} />
          </div>
          <nav aria-label="Main navigation">
            {platform && (
              <button
                className={
                  "nav-item " + (current === "Platform" ? "active" : "")
                }
                onClick={() => {
                  setParish("");
                  setEntry(null);
                  setSearchOpen(false);
                  refresh();
                  navigate("Platform");
                }}
              >
                <Church size={19} />
                Parish directory
              </button>
            )}
            {platform && (
              <button
                className={
                  "nav-item " +
                  (["Foranes", "Forane dashboard"].includes(current)
                    ? "active"
                    : "")
                }
                onClick={() => {
                  setParish("");
                  refresh();
                  navigate(
                    session.user.role === "forane_admin"
                      ? "Forane dashboard"
                      : "Foranes",
                  );
                }}
              >
                <Layers size={19} />
                {session.user.role === "forane_admin"
                  ? "Forane dashboard"
                  : "Foranes"}
              </button>
            )}
            {platform && !session.tenant && (
              <button
                className={
                  "nav-item " +
                  (current === "Forane activities" ? "active" : "")
                }
                onClick={() => navigate("Forane activities")}
              >
                <Clock size={19} />
                Forane activities
              </button>
            )}
            {(!platform || session.tenant) &&
              navGroups.map((g) => (
                <div className="nav-group" key={g.title}>
                  <p>{g.title}</p>
                  {g.items
                    .filter(([, p]) => can(p))
                    .map(([name]) => {
                      const Icon = icons[name];
                      return (
                        <button
                          key={name}
                          aria-label={name}
                          className={
                            "nav-item " + (current === name ? "active" : "")
                          }
                          onClick={() => navigate(name)}
                          aria-current={current === name ? "page" : undefined}
                        >
                          <Icon size={19} />
                          <span>{name}</span>
                          {name === "Digitisation" && (
                            <span className="nav-mini">OCR</span>
                          )}
                        </button>
                      );
                    })}
                </div>
              ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="preserve-note">
              <Leaf size={20} />
              <p>
                Every record has a story.
                <br />
                <strong>Keep it for generations.</strong>
              </p>
            </div>
            <button className="account" onClick={() => navigate("My account")}>
              <span className="avatar">
                {session.user.name
                  .split(" ")
                  .map((s: string) => s[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <span>
                <strong>{session.user.name}</strong>
                <small>
                  {session.user.role === "admin"
                    ? "Parish administrator"
                    : session.user.role.replaceAll("_", " ")}
                </small>
              </span>
              <Settings size={16} />
            </button>
          </div>
        </aside>
        <div className="main-shell">
          <header className="topbar">
            <div className="topbar-left">
              <button
                className="icon-button mobile-menu"
                aria-label="Open navigation"
                onClick={() => setDrawer(true)}
              >
                <Menu size={22} />
              </button>
              <span className="breadcrumb">
                Workspace <span>/</span> <strong>{current}</strong>
              </span>
            </div>
            <div className="topbar-actions">
              <button
                aria-label="Search parish records"
                className="search-trigger"
                onClick={() => setSearchOpen(true)}
              >
                <Search size={17} />
                <span>Find a record, person, or book</span>
                <kbd>Ctrl K</kbd>
              </button>
              <button
                className="notification-button icon-button"
                aria-label="Open warning alerts"
                onClick={() => navigate("Alerts")}
              >
                <Bell size={20} />
              </button>
              <span className="top-avatar">{session.user.name[0]}</span>
            </div>
          </header>
          {platform && <OversightBanner />}
          <main
            id="main"
            tabIndex={-1}
            key={current + (session.tenant?.id || "central")}
            className="page-enter"
          >
            {current === "Overview" ? (
              <Dashboard onEntry={setEntry} />
            ) : current === "Members" ? (
              <People />
            ) : current === "Households" ? (
              <HouseholdWorkspace />
            ) : current === "Registers" || current === "Approvals" ? (
              <Registers
                approval={current === "Approvals"}
                onEntry={setEntry}
              />
            ) : current === "Digital archive" ? (
              <ArchivePage />
            ) : current === "Digitisation" ? (
              <Digitisation />
            ) : current === "Certificates" ? (
              <Certificates />
            ) : current === "Reports" ? (
              <Reports />
            ) : current === "Administration" ? (
              <Administration />
            ) : current === "Audit history" ? (
              <Audit />
            ) : current === "My account" ? (
              <Account />
            ) : current === "Platform" ? (
              <Platform />
            ) : current === "Foranes" ? (
              <Foranes />
            ) : current === "Forane dashboard" ? (
              <ForaneDashboard id={session.user.forane_id} />
            ) : current === "Forane activities" ? (
              <ForaneActivities />
            ) : current === "Alerts" ? (
              <Alerts />
            ) : current === "Record management" ? (
              <RecordManagement />
            ) : (
              <Empty
                title="Workspace unavailable"
                description="Choose an available module from the navigation."
              />
            )}
          </main>
          <footer className="workspace-footer">
            <span>
              <ShieldCheck size={14} /> Private church workspace
            </span>
            <span>Preserving the past. Serving the present.</span>
            <span>Vestry · {new Date().getFullYear()}</span>
          </footer>
        </div>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {searchOpen && (
        <GlobalSearch
          onClose={() => setSearchOpen(false)}
          onEntry={(id) => {
            setSearchOpen(false);
            setEntry(id);
          }}
        />
      )}
      {entry && <EntryDetail id={entry} onClose={() => setEntry(null)} />}
    </Ctx.Provider>
  );
}
function ChurchIllustration() {
  return (
    <svg
      viewBox="0 0 420 230"
      fill="none"
      aria-hidden="true"
      className="church-illustration"
    >
      <g
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M34 205h359M153 202V87l39-38 39 38v115M167 87h50M173 79l19-19 20 19M184 49V23h16v26M192 10v24m-9-16h18M136 203V121l-47 24v58m142-82 89 30v52M136 133l-49 25m146-25 91 31M87 145l-10 14h59m95-8 92 14 8 6M178 203v-46a14 14 0 0 1 28 0v46m-14-60v60M170 124h44m-34 0V99a12 12 0 0 1 24 0v25m-12-36v36m-12-15h24M102 181v-13a7 7 0 0 1 14 0v13zm146 4v-18a8 8 0 0 1 16 0v18zm32 0v-13a7 7 0 0 1 14 0v13zM161 203V89m62 114V89M58 204v-41m0 27c-30-4-27-31-11-35-9-22 21-31 27-11 15-3 25 20 7 29m277 31v-61m0 40c-25 0-30-25-17-34-9-20 16-34 29-18 15-2 25 22 10 31 10 13-2 24-18 23M41 205l7-6m-1 6 4-6m288 6 5-6m-5 6 1-9M176 207l-12 16m44-16 12 16M277 48h28m-14-9v18M80 79h14m-7-7v14" />
        <path d="M329 85c4-7 11-7 15 0m-28-25c3-5 8-5 11 0M118 49c3-5 8-5 11 0" />
      </g>
      <circle
        cx="284"
        cy="50"
        r="26"
        stroke="currentColor"
        strokeDasharray="2 6"
        opacity=".45"
      />
    </svg>
  );
}
function Dashboard({ onEntry }: { onEntry: (id: string) => void }) {
  const { data, error, loading } = useData("/dashboard"),
    { session, navigate, can } = useApp();
  const [create, setCreate] = useState(false);
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const d = data!,
    c = d.counts;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR PARISH, CONNECTED</p>
          <h1>A little care. A lasting legacy.</h1>
          <p>
            Welcome back, {session.user.name.split(" ")[0]}. Here’s your parish
            at a glance.
          </p>
        </div>
        <div className="heading-date">
          <Sun size={17} />
          {new Intl.DateTimeFormat("en-IN", {
            weekday: "short",
            day: "numeric",
            month: "long",
            year: "numeric",
          }).format(new Date())}
        </div>
      </div>
      <section className="hero-banner">
        <div>
          <span className="hero-kicker">
            <span /> THE RECORDS WE KEEP. THE STORIES WE CARRY.
          </span>
          <h2>
            Faithfully recorded.
            <br />
            <em>Thoughtfully preserved.</em>
          </h2>
          <p>
            A living archive of your parish community, from the first
            <br className="desktop-break" /> handwritten page to the next
            generation.
          </p>
          <div className="hero-actions">
            {can("registers.create") && (
              <Button className="coral" onClick={() => setCreate(true)}>
                <Plus size={17} />
                Create a record
              </Button>
            )}
            <button
              className="text-button light"
              onClick={() => navigate("Digital archive")}
            >
              Explore the archive <FolderOpen size={17} />
            </button>
          </div>
        </div>
        <ChurchIllustration />
        <span className="hero-caption">A HOME FOR YOUR PARISH HISTORY</span>
      </section>
      <section className="stats-grid" aria-label="Parish statistics">
        {[
          {
            label: "Parish members",
            value: c.members,
            icon: Users,
            detail: `Across ${fmt(c.households)} households`,
            color: "green",
            page: "Members",
          },
          {
            label: "Register entries",
            value: c.entries,
            icon: BookOpen,
            detail: "Every milestone, accounted for",
            color: "orange",
            page: "Registers",
          },
          {
            label: "Originals preserved",
            value: c.pages,
            icon: Archive,
            detail: "Originals kept safely, always",
            color: "blue",
            page: "Digital archive",
          },
          {
            label: "Awaiting approval",
            value: c.pending,
            icon: Clock,
            detail: Number(c.pending)
              ? "Ready for a second pair of eyes"
              : "Your approval inbox is clear",
            color: "purple",
            page: "Approvals",
          },
        ].map((s) => (
          <button
            key={s.label}
            className="stat-card"
            onClick={() => navigate(s.page)}
          >
            <div>
              <span>{s.label}</span>
              <span className={"stat-icon " + s.color}>
                <s.icon size={20} />
              </span>
            </div>
            <strong>{fmt(s.value)}</strong>
            <p>
              {s.detail}
              {s.page === "Approvals" && <ChevronRight size={15} />}
            </p>
          </button>
        ))}
      </section>
      <div className="dashboard-grid">
        <section className="panel recent-panel">
          <div className="panel-heading">
            <div>
              <h2>Recent register entries</h2>
              <p>The latest chapters in your parish story.</p>
            </div>
            <button
              className="text-button"
              onClick={() => navigate("Registers")}
            >
              View all records <ChevronRight size={15} />
            </button>
          </div>
          <EntryTable items={d.recent} onEntry={onEntry} compact />
          <div className="panel-bottom">
            <ShieldCheck size={15} />
            <span>
              Official records are protected by a human approval workflow.
            </span>
          </div>
        </section>
        <section className="panel attention-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">A HELPING HAND</p>
              <h2>A little attention needed</h2>
            </div>
            <span className="attention-symbol">✦</span>
          </div>
          <button className="task-item" onClick={() => navigate("Alerts")}>
            <span className="task-icon orange">
              <CheckCheck size={19} />
            </span>
            <span>
              <strong>{fmt(c.pending)} records to approve</strong>
              <small>Review submitted register entries</small>
            </span>
            <ChevronRight size={16} />
          </button>
          <button
            className="task-item"
            onClick={() => navigate("Digitisation")}
          >
            <span className="task-icon green">
              <ScanLine size={19} />
            </span>
            <span>
              <strong>{fmt(c.review)} transcriptions to review</strong>
              <small>Give historical records a new life</small>
            </span>
            <ChevronRight size={16} />
          </button>
          <div className="workflow-note">
            <ShieldCheck size={20} />
            <div>
              <strong>Human care, at every step.</strong>
              <p>
                Transcriptions stay drafts until an authorised person approves
                them.
              </p>
            </div>
          </div>
          <button
            className="button secondary full"
            onClick={() => navigate("Alerts")}
          >
            Open review workspace
          </button>
        </section>
      </div>
      <div className="dashboard-lower">
        <section className="panel archive-panel">
          <div className="panel-heading">
            <div>
              <h2>From the parish archive</h2>
              <p>Old pages. A future worth preserving.</p>
            </div>
            <button
              className="text-button"
              onClick={() => navigate("Digital archive")}
            >
              Browse archive <ChevronRight size={15} />
            </button>
          </div>
          <div className="book-grid">
            {d.volumes.map((v: Row, i: number) => (
              <button
                className="book-card"
                key={v.id}
                onClick={() => navigate("Digital archive")}
              >
                <div className={"book-cover book-" + i}>
                  <span className="book-spine" />
                  <span className="book-label">
                    <span>PARISH ARCHIVES</span>
                    <BookOpen size={26} strokeWidth={1} />
                    <strong>
                      {v.kind === "historical"
                        ? "Parish chronicles"
                        : v.kind + " register"}
                    </strong>
                    <small>{v.date_range}</small>
                  </span>
                </div>
                <div>
                  <h3>{v.title}</h3>
                  <p>
                    {v.date_range} <span>·</span> {v.language}
                  </p>
                  <span className="book-meta">
                    {fmt(v.pages)} originals preserved
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
        <section className="panel register-summary">
          <div className="panel-heading">
            <div>
              <h2>A record of our community</h2>
              <p>Milestones, through the years.</p>
            </div>
          </div>
          <div className="distribution">
            {d.distribution.map((r: Row, i: number) => (
              <div key={r.kind}>
                <span className={"distribution-dot dot-" + i} />
                <span>{r.label}</span>
                <strong>{fmt(r.count)}</strong>
                <div className="bar-track">
                  <i
                    style={{
                      width:
                        Math.max(
                          0,
                          (r.count /
                            Math.max(
                              1,
                              ...d.distribution.map((x: Row) => x.count),
                            )) *
                            100,
                        ) + "%",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="summary-foot">
            Each entry is a connection to someone’s story.
          </p>
        </section>
      </div>
      {create && (
        <RecordForm
          onClose={() => setCreate(false)}
          onSaved={(id) => {
            setCreate(false);
            onEntry(id);
          }}
        />
      )}
    </>
  );
}
function EntryTable({
  items,
  onEntry,
  compact = false,
}: {
  items: Row[];
  onEntry: (id: string) => void;
  compact?: boolean;
}) {
  if (!items?.length)
    return (
      <Empty
        title="A new chapter starts here"
        description="Create a draft register entry to get started."
        icon={BookOpen}
      />
    );
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>NAME & REFERENCE</th>
            <th>REGISTER</th>
            {!compact && <th>EVENT DATE</th>}
            <th>STATUS</th>
            <th>
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((e, i) => (
            <tr key={e.id}>
              <td>
                <button className="person-cell" onClick={() => onEntry(e.id)}>
                  <span className={"initials tone-" + (i % 4)}>
                    {e.person_name
                      ?.split(" ")
                      .map((s: string) => s[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <span>
                    <strong>{e.person_name}</strong>
                    <small>{e.entry_no}</small>
                  </span>
                </button>
              </td>
              <td>
                <span className={"register-tag " + e.kind}>
                  {e.register_label}
                </span>
              </td>
              {!compact && <td>{e.event_date || "Unknown"}</td>}
              <td>
                <Badge status={e.status} />
              </td>
              <td>
                <button
                  className="icon-button"
                  aria-label={"Open record for " + e.person_name}
                  onClick={() => onEntry(e.id)}
                >
                  <ChevronRight size={16} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow || "PARISH WORKSPACE"}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
function Registers({
  approval,
  onEntry,
}: {
  approval: boolean;
  onEntry: (id: string) => void;
}) {
  const [q, setQ] = useState(""),
    [kind, setKind] = useState(""),
    [year, setYear] = useState(""),
    [status, setStatus] = useState(approval ? "submitted" : ""),
    [page, setPage] = useState(1),
    [create, setCreate] = useState(false);
  const { can } = useApp();
  const { data, error, loading, reload } = useData(
    `/entries?q=${encodeURIComponent(q)}&kind=${kind}&year=${year}&status=${status}&page=${page}`,
  );
  return (
    <>
      <SectionHeading
        eyebrow="SACRAMENTAL & PARISH REGISTERS"
        title={
          approval ? "A second pair of eyes." : "Life, faithfully recorded."
        }
        description={
          approval
            ? "Review submitted records before they become official."
            : "One place for every sacrament, milestone and lasting connection."
        }
        action={
          can("registers.create") && (
            <Button className="primary" onClick={() => setCreate(true)}>
              <Plus size={17} />
              New record
            </Button>
          )
        }
      />
      <div className="register-tabs" role="group" aria-label="Register type">
        {[
          ["", "All registers"],
          ["baptism", "Baptism"],
          ["birth", "Birth"],
          ["confirmation", "Confirmation"],
          ["holy_communion", "Holy Communion"],
          ["marriage", "Marriage"],
          ["death", "Death"],
          ["burial", "Burial"],
        ].map(([k, label]) => (
          <button
            className={kind === k ? "selected" : ""}
            key={k}
            onClick={() => {
              setKind(k);
              setYear("");
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <StatusCounts summary={data?.summary} />
      <section className="panel">
        <div className="list-toolbar">
          <div className="input-icon">
            <Search size={17} />
            <input
              aria-label="Search register entries"
              placeholder="Search by name, reference or date…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            aria-label="Register year"
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All years</option>
            {data?.years?.map((y: Row) => (
              <option key={y.year || "unknown"} value={y.year || "unknown"}>
                {y.year || "Unknown / uncertain year"} ({fmt(y.count)})
              </option>
            ))}
          </select>
          <select
            aria-label="Record status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {[
              "draft",
              "submitted",
              "approved",
              "rejected",
              "corrected",
              "void",
            ].map((s) => (
              <option key={s} value={s}>
                {s === "submitted" ? "Awaiting approval" : s}
              </option>
            ))}
          </select>
        </div>
        <ErrorBox error={error} />
        {loading ? (
          <Loading />
        ) : data?.items?.length ? (
          [
            ...new Set<string>(
              data.items.map((entry: Row) => entry.event_year || "unknown"),
            ),
          ].map((group) => (
            <section
              className="year-group"
              key={group}
              aria-label={
                group === "unknown"
                  ? "Unknown / uncertain year"
                  : `Year ${group}`
              }
            >
              <div className="year-heading">
                <h2>
                  {group === "unknown" ? "Unknown / uncertain year" : group}
                </h2>
                <span>
                  {
                    data.items.filter(
                      (entry: Row) => (entry.event_year || "unknown") === group,
                    ).length
                  }{" "}
                  on this page
                </span>
              </div>
              <EntryTable
                items={data.items.filter(
                  (entry: Row) => (entry.event_year || "unknown") === group,
                )}
                onEntry={onEntry}
              />
            </section>
          ))
        ) : (
          <EntryTable items={[]} onEntry={onEntry} />
        )}
        <Pagination data={data} page={page} setPage={setPage} />
      </section>
      {create && (
        <RecordForm
          onClose={() => setCreate(false)}
          onSaved={(id) => {
            setCreate(false);
            reload();
            onEntry(id);
          }}
        />
      )}
    </>
  );
}
function RecordFields({
  value,
  setValue,
  schemas,
  persons,
  assets = [],
}: {
  value: Row;
  setValue: (v: Row) => void;
  schemas: Row[];
  persons: Row[];
  assets?: Row[];
}) {
  const [personQuery, setPersonQuery] = useState("");
  const { data: memberResults } = useData(
    "/persons?limit=100&q=" + encodeURIComponent(personQuery),
  );
  const set = (key: string, v: any) => setValue({ ...value, [key]: v });
  const schema = schemas.find((s) => s.id === value.schema_id);
  return (
    <>
      <div className="form-grid">
        <Field label="Register type *">
          <select
            required
            value={value.schema_id || ""}
            onChange={(e) =>
              setValue({ ...value, schema_id: e.target.value, fields: {} })
            }
          >
            <option value="">Choose a register</option>
            {schemas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label} · v{s.version}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Find a member">
          <input
            aria-label="Filter available people"
            placeholder="Type a name or membership number?"
            value={personQuery}
            onChange={(e) => setPersonQuery(e.target.value)}
          />
        </Field>
        <Field
          label="Person *"
          hint="Search for duplicates in Members before creating a new person."
        >
          <select
            required
            value={value.person_id || ""}
            onChange={(e) => set("person_id", e.target.value)}
          >
            <option value="">Choose a member</option>
            {(personQuery ? memberResults?.items || [] : persons).map(
              (p: Row) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.membership_no}
                </option>
              ),
            )}
          </select>
        </Field>
        <Field
          label="Name as recorded"
          hint="Preserves the event-time name independently of the current member profile."
        >
          <input
            value={value.subject_name || ""}
            onChange={(e) => set("subject_name", e.target.value || undefined)}
            placeholder="Defaults to the selected member name"
          />
        </Field>
        <Field label="Entry reference *">
          <input
            required
            maxLength={300}
            value={value.entry_no || ""}
            onChange={(e) => set("entry_no", e.target.value)}
            placeholder="BAP-2026-001"
          />
        </Field>
        <Field label="Date precision">
          <select
            value={value.date_precision || "unknown"}
            onChange={(e) => set("date_precision", e.target.value)}
          >
            <option value="unknown">Unknown</option>
            <option value="exact">Exact date</option>
            <option value="year">Year only</option>
            <option value="approximate">Approximate</option>
          </select>
        </Field>
        <Field
          label="Event date"
          hint="Leave blank if unknown. Approximate dates may use free text."
        >
          <input
            type={value.date_precision === "exact" ? "date" : "text"}
            value={value.event_date || ""}
            onChange={(e) => set("event_date", e.target.value || null)}
          />
        </Field>
        <Field label="Place">
          <input
            value={value.place || ""}
            onChange={(e) => set("place", e.target.value)}
          />
        </Field>
        <Field label="Minister / officiant">
          <input
            value={value.minister || ""}
            onChange={(e) => set("minister", e.target.value)}
          />
        </Field>
        {schema?.fields.map((f: Row) => (
          <Field key={f.key} label={f.label + (f.required ? " *" : "")}>
            <input
              required={f.required}
              type={
                f.type === "date"
                  ? "date"
                  : f.type === "number"
                    ? "number"
                    : "text"
              }
              value={value.fields?.[f.key] ?? ""}
              onChange={(e) =>
                set("fields", {
                  ...value.fields,
                  [f.key]: e.target.value || null,
                })
              }
            />
          </Field>
        ))}
      </div>
      <h3 className="form-section-title">Source & provenance</h3>
      <div className="form-grid">
        <Field label="Original document">
          <select
            value={value.source_id || ""}
            onChange={(e) => set("source_id", e.target.value || null)}
          >
            <option value="">Born-digital / no source linked</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.filename} · {a.page_label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Page / folio">
          <input
            value={value.source_page || ""}
            onChange={(e) => set("source_page", e.target.value)}
          />
        </Field>
        <Field label="Row / entry position">
          <input
            value={value.source_row || ""}
            onChange={(e) => set("source_row", e.target.value)}
          />
        </Field>
      </div>
    </>
  );
}
function RecordForm({
  onClose,
  onSaved,
  initial,
}: {
  onClose: () => void;
  onSaved: (id: string) => void;
  initial?: Row;
}) {
  const [value, setValue] = useState<Row>(
      initial || { fields: {}, date_precision: "unknown" },
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const { data: schemas } = useData("/schemas?limit=100"),
    { data: persons } = useData("/persons?limit=100"),
    { data: assets } = useData("/assets?limit=100");
  return (
    <Modal
      title={initial ? "Edit draft entry" : "A new parish record"}
      subtitle="Start with what you know. Every entry begins as a draft."
      onClose={onClose}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const r = initial
              ? await patch("/entries/" + initial.id, value)
              : await post("/entries", value);
            onSaved(r.id);
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-body">
          <div className="notice">
            <Info size={18} />
            <p>
              Roman Catholic register templates are configurable. Follow your
              diocese’s approved recording requirements.
            </p>
          </div>
          <ErrorBox error={error} />
          <RecordFields
            value={value}
            setValue={setValue}
            schemas={schemas?.items || []}
            persons={persons?.items || []}
            assets={assets?.items || []}
          />
        </div>
        <div className="modal-actions">
          <Button type="button" className="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={busy} className="primary">
            <Check size={17} />
            Save draft
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function EntryDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: e, error, loading, reload } = useData("/entries/" + id),
    { can, notify } = useApp();
  const [busy, setBusy] = useState(false),
    [err, setErr] = useState(""),
    [edit, setEdit] = useState(false),
    [reason, setReason] = useState(""),
    [history, setHistory] = useState<Row[] | null>(null),
    [annotation, setAnnotation] = useState(""),
    [amend, setAmend] = useState(false),
    [proposed, setProposed] = useState<Row>({});
  const action = async (status: string) => {
    setBusy(true);
    setErr("");
    try {
      await post("/entries/" + id + "/transition", { status, reason });
      notify(
        status === "submitted"
          ? "Record submitted for independent approval."
          : "Record " + status + ".",
      );
      reload();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (edit && e)
    return (
      <RecordForm
        initial={e}
        onClose={() => setEdit(false)}
        onSaved={() => {
          setEdit(false);
          reload();
        }}
      />
    );
  return (
    <Modal
      title={e?.subject_name || e?.person?.name || "Register entry"}
      subtitle={e ? `${e.schema.label} · ${e.entry_no}` : undefined}
      onClose={onClose}
      wide
    >
      {loading ? (
        <Loading />
      ) : (
        <div className="modal-body">
          <ErrorBox error={error || err} />
          {e && (
            <>
              <div className="detail-meta">
                <Badge status={e.status} />
                <span>Revision {e.revision}</span>
                <span>Created {date(e.created_at)}</span>
              </div>
              <dl className="detail-grid">
                {[
                  ["Event date", e.event_date || "Unknown"],
                  ["Date precision", e.date_precision],
                  ["Place", e.place],
                  ["Minister", e.minister],
                  ["Member reference", e.person.membership_no],
                  [
                    "Source page / row",
                    [e.source_page, e.source_row].filter(Boolean).join(" / "),
                  ],
                  ...e.schema.fields.map((f: Row) => [
                    f.label,
                    e.fields[f.key],
                  ]),
                ].map(([label, v]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{v || "Not recorded"}</dd>
                  </div>
                ))}
              </dl>
              {e.source && (
                <a
                  className="source-link"
                  href={"/api/v1/assets/" + e.source.id + "/file"}
                  target="_blank"
                  rel="noreferrer"
                >
                  <FileText size={20} />
                  <span>
                    <strong>{e.source.filename}</strong>
                    <small>
                      Preserved original · SHA-256 checksum recorded
                    </small>
                  </span>
                  <ExternalLink size={17} />
                </a>
              )}
              {e.approved_at && (
                <div className="notice success">
                  <ShieldCheck size={19} />
                  Approved {date(e.approved_at)}. Changes require a traceable
                  amendment.
                </div>
              )}
              <div className="detail-actions">
                {["draft", "rejected"].includes(e.status) && (
                  <>
                    {can("registers.update_draft") && (
                      <Button
                        className="secondary"
                        onClick={() => setEdit(true)}
                      >
                        Edit draft
                      </Button>
                    )}
                    {can("registers.submit") && (
                      <Button
                        busy={busy}
                        className="primary"
                        onClick={() => action("submitted")}
                      >
                        Submit for approval
                      </Button>
                    )}
                  </>
                )}
                {e.status === "submitted" && can("registers.approve") && (
                  <>
                    <Field label="Review comment / return reason">
                      <input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Required when returning an entry"
                      />
                    </Field>
                    <Button
                      busy={busy}
                      className="secondary"
                      onClick={() => action("rejected")}
                    >
                      Return for correction
                    </Button>
                    <Button
                      busy={busy}
                      className="primary"
                      onClick={() => action("approved")}
                    >
                      <CheckCheck size={17} />
                      Approve record
                    </Button>
                  </>
                )}
                {["approved", "corrected"].includes(e.status) &&
                  can("registers.correct") && (
                    <Button
                      className="secondary"
                      onClick={() => {
                        setAmend((s) => !s);
                        setProposed({
                          subject_name: e.subject_name,
                          event_date: e.event_date,
                          place: e.place,
                          minister: e.minister,
                          fields: e.fields,
                        });
                      }}
                    >
                      Request amendment
                    </Button>
                  )}
              </div>
              {amend && (
                <form
                  className="inset-form"
                  onSubmit={async (ev) => {
                    ev.preventDefault();
                    try {
                      await post("/entries/" + id + "/amendments", {
                        proposed,
                        reason,
                      });
                      notify(
                        "Amendment requested. A separate reviewer must approve it.",
                      );
                      setAmend(false);
                      reload();
                    } catch (e: any) {
                      setErr(e.message);
                    }
                  }}
                >
                  <h3>Proposed correction</h3>
                  <div className="form-grid">
                    {["subject_name", "event_date", "place", "minister"].map(
                      (key) => (
                        <Field key={key} label={key.replace("_", " ")}>
                          <input
                            value={proposed[key] || ""}
                            onChange={(ev) =>
                              setProposed({
                                ...proposed,
                                [key]: ev.target.value,
                              })
                            }
                          />
                        </Field>
                      ),
                    )}
                    {e.schema.fields.map((f: Row) => (
                      <Field key={f.key} label={f.label}>
                        <input
                          value={proposed.fields?.[f.key] || ""}
                          onChange={(ev) =>
                            setProposed({
                              ...proposed,
                              fields: {
                                ...proposed.fields,
                                [f.key]: ev.target.value,
                              },
                            })
                          }
                        />
                      </Field>
                    ))}
                  </div>
                  <Field label="Reason for correction *">
                    <textarea
                      required
                      minLength={10}
                      value={reason}
                      onChange={(ev) => setReason(ev.target.value)}
                    />
                  </Field>
                  <Button className="primary">
                    Request independent approval
                  </Button>
                </form>
              )}
              {e.amendments
                ?.filter((a: Row) => a.status === "pending")
                .map((a: Row) => (
                  <div className="notice" key={a.id}>
                    <div>
                      <strong>Pending amendment</strong>
                      <p>{a.reason}</p>
                      <pre>{JSON.stringify(a.proposed, null, 2)}</pre>
                      {can("registers.approve") && (
                        <Button
                          className="secondary"
                          onClick={async () => {
                            try {
                              await post(
                                "/amendments/" + a.id + "/approve",
                                {},
                              );
                              notify("Amendment approved; history preserved.");
                              reload();
                            } catch (e: any) {
                              setErr(e.message);
                            }
                          }}
                        >
                          Approve amendment
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              <h3 className="form-section-title">Annotations</h3>
              {e.annotations.length ? (
                e.annotations.map((a: Row) => (
                  <div className="annotation" key={a.id}>
                    <p>{a.text}</p>
                    <small>{date(a.created_at)}</small>
                  </div>
                ))
              ) : (
                <p className="muted">No annotations have been added.</p>
              )}
              {can("registers.annote") &&
                ["approved", "corrected"].includes(e.status) && (
                  <form
                    className="inline-form"
                    onSubmit={async (ev) => {
                      ev.preventDefault();
                      try {
                        await post("/entries/" + id + "/annotations", {
                          text: annotation,
                        });
                        setAnnotation("");
                        reload();
                      } catch (e: any) {
                        setErr(e.message);
                      }
                    }}
                  >
                    <input
                      aria-label="New annotation"
                      placeholder="Add an authorised annotation…"
                      minLength={5}
                      required
                      value={annotation}
                      onChange={(e) => setAnnotation(e.target.value)}
                    />
                    <Button className="secondary">Add</Button>
                  </form>
                )}
              <button
                className="text-button history-trigger"
                onClick={async () => {
                  try {
                    setHistory(await api("/entries/" + id + "/history"));
                  } catch (e: any) {
                    setErr(e.message);
                  }
                }}
              >
                <History size={17} />
                View complete version history
              </button>
              {history && (
                <div className="timeline">
                  {history.map((v) => (
                    <div key={v.id}>
                      <span className="timeline-mark" />
                      <strong>
                        Revision {v.revision} · {v.reason}
                      </strong>
                      <p>
                        {v.actor_name} · {date(v.created_at)}
                      </p>
                      <details>
                        <summary>View preserved values</summary>
                        <pre>{JSON.stringify(v.snapshot, null, 2)}</pre>
                      </details>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
function People() {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [editing, setEditing] = useState<Row | null>(null),
    [create, setCreate] = useState(false);
  const { data, error, loading, reload } = useData(
      `/persons?q=${encodeURIComponent(q)}&page=${page}`,
    ),
    { can } = useApp();
  return (
    <>
      <SectionHeading
        eyebrow="PEOPLE & CONNECTIONS"
        title="A community, by name."
        description="Thoughtful records for the people at the heart of your parish."
        action={
          can("members.create") && (
            <Button className="primary" onClick={() => setCreate(true)}>
              <Plus size={17} />
              Add member
            </Button>
          )
        }
      />
      <section className="panel">
        <div className="list-toolbar">
          <div className="input-icon">
            <Search size={17} />
            <input
              aria-label="Search members"
              placeholder="Search names, alternate spellings, or membership numbers…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <span className="muted">{fmt(data?.total)} members</span>
        </div>
        <ErrorBox error={error} />
        {loading ? (
          <Loading />
        ) : data?.items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>MEMBER</th>
                  <th>MEMBERSHIP NO.</th>
                  <th>HOUSEHOLD</th>
                  <th>STATUS</th>
                  <th>PROFILE</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((p: Row, i: number) => (
                  <tr key={p.id}>
                    <td>
                      <div className="person-cell">
                        <span className={"initials tone-" + (i % 4)}>
                          {p.photo_version ? (
                            <img
                              className="member-photo"
                              src={`/api/v1/persons/${p.id}/photo?v=${p.photo_version}${parishQuery()}`}
                              alt=""
                              loading="lazy"
                              width="40"
                              height="40"
                            />
                          ) : (
                            p.name
                              .split(" ")
                              .map((s: string) => s[0])
                              .slice(0, 2)
                              .join("")
                          )}
                        </span>
                        <span>
                          <strong>{p.name}</strong>
                          <small>
                            {p.local_name || p.email || "Parish member"}
                          </small>
                        </span>
                      </div>
                    </td>
                    <td>{p.membership_no}</td>
                    <td>{p.household_name || "Unassigned"}</td>
                    <td>
                      <Badge status={p.status} />
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setEditing(p)}
                      >
                        View profile <ChevronRight size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Make your first connection"
            description="Add a member or adjust your search."
            icon={Users}
          />
        )}
        <Pagination data={data} page={page} setPage={setPage} />
      </section>
      {(create || editing) && (
        <PersonForm
          initial={editing || undefined}
          onClose={() => {
            setCreate(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreate(false);
            setEditing(null);
            reload();
          }}
        />
      )}
    </>
  );
}
function PersonForm({
  initial,
  onClose,
  onSaved,
}: {
  initial?: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [savedId, setSavedId] = useState<string | undefined>(initial?.id);
  const [value, setValue] = useState<Row>(
      initial || { date_precision: "unknown", status: "active" },
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    { can } = useApp();
  const [householdQuery, setHouseholdQuery] = useState("");
  const { data } = useData(
    "/households?limit=100&q=" + encodeURIComponent(householdQuery),
  );
  const editable = can(initial ? "members.update" : "members.create");
  const set = (k: string, v: any) => setValue({ ...value, [k]: v });
  return (
    <Modal
      title={initial ? initial.name : "Welcome someone to the registry"}
      subtitle="Keep personal information accurate, necessary and private."
      onClose={onClose}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const saved = savedId
              ? await patch("/persons/" + savedId, value)
              : await post("/persons", value);
            setSavedId(saved.id);
            if (photo) {
              const body = new FormData();
              body.append("file", photo);
              try {
                await api(`/persons/${saved.id}/photo`, {
                  method: "POST",
                  body,
                });
              } catch (e: any) {
                throw new Error(
                  "Member details saved. Photo upload failed: " +
                    e.message +
                    " You can retry saving.",
                );
              }
            } else if (removePhoto && initial?.photo_version)
              await api(`/persons/${saved.id}/photo`, { method: "DELETE" });
            onSaved();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-body">
          <ErrorBox error={error} />
          {!initial && value.name?.length > 2 && (
            <DuplicateSuggestions name={value.name} />
          )}
          <fieldset disabled={!editable}>
            <MemberPhotoPicker
              person={initial}
              file={photo}
              removed={removePhoto}
              editable={editable && can("members.update")}
              onChange={(file) => {
                setPhoto(file);
                setRemovePhoto(false);
              }}
              onRemove={() => {
                setPhoto(null);
                setRemovePhoto(true);
              }}
            />
            <div className="form-grid">
              {[
                ["name", "Full / preferred name *"],
                ["membership_no", "Membership number *"],
                ["local_name", "Name in local script"],
                ["alternate_names", "Alternate / transliterated names"],
                ["email", "Email"],
                ["phone", "Phone"],
                ["birth_date", "Birth date / year"],
              ].map(([k, l]) => (
                <Field key={k} label={l}>
                  <input
                    required={k === "name" || k === "membership_no"}
                    type={k === "email" ? "email" : "text"}
                    value={value[k] || ""}
                    onChange={(e) => set(k, e.target.value)}
                  />
                </Field>
              ))}
              <Field label="Date precision">
                <select
                  value={value.date_precision}
                  onChange={(e) => set("date_precision", e.target.value)}
                >
                  {["unknown", "exact", "year", "approximate"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="Find a household">
                <input
                  aria-label="Filter available households"
                  placeholder="Search household names"
                  value={householdQuery}
                  onChange={(e) => setHouseholdQuery(e.target.value)}
                />
              </Field>
              <Field label="Household">
                <select
                  value={value.household_id || ""}
                  onChange={(e) => set("household_id", e.target.value || null)}
                >
                  <option value="">Unassigned</option>
                  {initial?.household_id &&
                    !data?.items.some(
                      (h: Row) => h.id === initial.household_id,
                    ) && (
                      <option value={initial.household_id}>
                        {initial.household_name || "Current household"}
                      </option>
                    )}
                  {data?.items.map((h: Row) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Membership status">
                <select
                  value={value.status}
                  onChange={(e) => set("status", e.target.value)}
                >
                  {["active", "inactive", "deceased", "transferred"].map(
                    (s) => (
                      <option key={s}>{s}</option>
                    ),
                  )}
                </select>
              </Field>
            </div>
            <Field label="Address">
              <textarea
                value={value.address || ""}
                onChange={(e) => set("address", e.target.value)}
              />
            </Field>
          </fieldset>
          {initial && <PersonHistory person={initial} />}
          {!initial && (
            <div className="notice">
              <Info size={18} />
              Search existing members before adding someone. Similar names are
              never merged automatically.
            </div>
          )}
        </div>
        <div className="modal-actions">
          <Button type="button" className="secondary" onClick={onClose}>
            Close
          </Button>
          {editable && (
            <Button busy={busy} className="primary">
              Save member
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
function StatusCounts({
  summary,
  household = false,
}: {
  summary?: Row;
  household?: boolean;
}) {
  const metrics = [
    ["total", household ? "Households" : "Records"],
    ["approved", "Approved"],
    ["not_approved", "Not approved"],
    ["draft", "Draft"],
    ["submitted", "Awaiting approval"],
    ["rejected", "Rejected"],
    ...(household
      ? []
      : [
          ["corrected", "Corrected"],
          ["void", "Void"],
        ]),
  ];
  return (
    <div
      className="register-summary"
      aria-label={household ? "Household counts" : "Register counts"}
    >
      <dl>
        {metrics.map(([key, label]) => (
          <div key={key} className={`summary-${key}`}>
            <dt>{label}</dt>
            <dd>{summary ? fmt(summary[key] || 0) : "—"}</dd>
          </div>
        ))}
      </dl>
      <p>
        Counts follow your search
        {household ? " and unit" : ", register and year"}. All statuses are
        counted across every page. Not approved includes draft, awaiting
        approval and rejected.
      </p>
    </div>
  );
}
function MemberPhotoPicker({
  person,
  file,
  removed,
  editable,
  onChange,
  onRemove,
}: {
  person?: Row;
  file: File | null;
  removed: boolean;
  editable: boolean;
  onChange: (file: File) => void;
  onRemove: () => void;
}) {
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function choose(file?: File) {
    setDragging(false);
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > (import.meta.env.VITE_SERVERLESS === "true" ? 4 : 5) * 1024 * 1024
    ) {
      setError(`Choose a JPEG, PNG or WebP photo up to ${import.meta.env.VITE_SERVERLESS === "true" ? 4 : 5} MB.`);
      return;
    }
    setError("");
    onChange(file);
  }
  const source =
    preview ||
    (!removed && person?.photo_version
      ? `/api/v1/persons/${person.id}/photo?v=${person.photo_version}${parishQuery()}`
      : "");
  return (
    <div
      className={`photo-picker ${dragging ? "dragging" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (editable) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        if (editable) choose(e.dataTransfer.files[0]);
      }}
    >
      <div className="photo-preview">
        {source ? (
          <img
            src={source}
            alt="Member profile preview"
            width="88"
            height="88"
          />
        ) : (
          <Users size={30} />
        )}
      </div>
      <div>
        <h3>
          Profile photo <span className="muted">· optional</span>
        </h3>
        <p>
          {editable
            ? "Drop a photo here, or choose one from your computer."
            : "Private parish member photo."}
        </p>
        {editable && (
          <div className="photo-actions">
            <label className="button secondary photo-file">
              <Upload size={16} />
              Choose photo
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Member profile photo"
                onChange={(e) => {
                  choose(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {source && (
              <Button
                type="button"
                className="text-button"
                onClick={() => {
                  setError("");
                  onRemove();
                }}
              >
                Remove photo
              </Button>
            )}
          </div>
        )}
        <small>
          JPEG, PNG or WebP · up to 5 MB / 16 megapixels. Saved privately;
          location metadata is removed.
        </small>
        <ErrorBox error={error} />
      </div>
    </div>
  );
}
function HouseholdWorkspace() {
  const [q, setQ] = useState(""),
    [unit, setUnit] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Row | null>(null),
    [create, setCreate] = useState(false),
    [manage, setManage] = useState(false);
  const { can } = useApp();
  const { data, error, loading, reload } = useData(
    `/households?q=${encodeURIComponent(q)}&unit=${unit}&status=${status}&page=${page}`,
  );
  const {
    data: units,
    error: unitError,
    reload: reloadUnits,
  } = useData("/units");
  const refresh = () => {
    reload();
    reloadUnits();
  };
  return (
    <>
      <SectionHeading
        eyebrow="FAMILIES & PARISH UNITS"
        title="Where belonging begins."
        description="Every home, connected to its parish community."
        action={
          <div className="button-group">
            {can("tenant.manage") && (
              <Button className="secondary" onClick={() => setManage(true)}>
                Manage units
              </Button>
            )}
            {can("members.create") && (
              <Button className="primary" onClick={() => setCreate(true)}>
                <Plus size={17} />
                Add household
              </Button>
            )}
          </div>
        }
      />
      <StatusCounts summary={data?.summary} household />
      <section className="panel">
        <div className="list-toolbar">
          <div className="input-icon">
            <Search size={17} />
            <input
              aria-label="Search households"
              placeholder="Search household names…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            aria-label="Parish unit"
            value={unit}
            onChange={(e) => {
              setUnit(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All units</option>
            <option value="unassigned">Unassigned</option>
            {units?.items.map((u: Row) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.household_count})
              </option>
            ))}
          </select>
          <select
            aria-label="Household status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {["draft", "submitted", "approved", "rejected"].map((s) => (
              <option key={s} value={s}>
                {s === "submitted" ? "Awaiting approval" : s}
              </option>
            ))}
          </select>
        </div>
        <ErrorBox error={error || unitError} />
        {loading ? (
          <Loading />
        ) : data?.items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>HOUSEHOLD</th>
                  <th>PARISH UNIT</th>
                  <th>MEMBERS</th>
                  <th>STATUS</th>
                  <th>
                    <span className="sr-only">Details</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((h: Row) => (
                  <tr key={h.id}>
                    <td>
                      <strong>{h.name}</strong>
                      <small className="block muted">
                        {h.address || "Address not recorded"}
                      </small>
                    </td>
                    <td>{h.unit || "Unassigned"}</td>
                    <td>{fmt(h.member_count)}</td>
                    <td>
                      <Badge status={h.status} />
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setEditing(h)}
                      >
                        View household
                        <ChevronRight size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Room for every family"
            description="Add a household or adjust your filters."
            icon={House}
          />
        )}
        <Pagination data={data} page={page} setPage={setPage} />
      </section>
      {(create || editing) && (
        <HouseholdEditor
          initial={editing || undefined}
          units={units?.items || []}
          onClose={() => {
            setCreate(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreate(false);
            setEditing(null);
            refresh();
          }}
        />
      )}
      {manage && (
        <UnitManager
          onClose={() => {
            setManage(false);
            refresh();
          }}
        />
      )}
    </>
  );
}
function UnitManager({ onClose }: { onClose: () => void }) {
  const { data, error, reload } = useData("/units");
  const [name, setName] = useState(""),
    [editing, setEditing] = useState(""),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Parish units"
      subtitle="Create the communities that connect your parish families."
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr("");
          try {
            if (editing) await patch("/units/" + editing, { name });
            else await post("/units", { name });
            setName("");
            setEditing("");
            reload();
          } catch (e: any) {
            setErr(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-body">
          <ErrorBox error={err || error} />
          <Field label={editing ? "Rename unit" : "New unit name"}>
            <input
              required
              maxLength={300}
              placeholder="e.g. St Alphonsa Unit"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <p className="muted">
            Use your parish’s own names, such as St Mary’s Unit or St Joseph
            Unit. Renaming keeps household assignments intact.
          </p>
          <div className="unit-list">
            {data?.items.map((u: Row) => (
              <div key={u.id}>
                <span>
                  <strong>{u.name}</strong>
                  <small>{fmt(u.household_count)} households</small>
                </span>
                <Button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setEditing(u.id);
                    setName(u.name);
                  }}
                >
                  Rename
                </Button>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <Button type="button" className="secondary" onClick={onClose}>
            Done
          </Button>
          {editing && (
            <Button
              type="button"
              className="secondary"
              onClick={() => {
                setEditing("");
                setName("");
              }}
            >
              Cancel rename
            </Button>
          )}
          <Button className="primary" busy={busy}>
            {editing ? "Save name" : "Create unit"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function HouseholdEditor({
  initial,
  units,
  onClose,
  onSaved,
}: {
  initial?: Row;
  units: Row[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [value, setValue] = useState<Row>(
      initial || { name: "", unit_id: "", address: "", contact: "" },
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState("");
  const { can, session } = useApp();
  const editable = can(initial ? "members.update" : "members.create");
  const [memberPage, setMemberPage] = useState(1);
  const dirty = Boolean(
    initial &&
    ["name", "unit_id", "address", "contact"].some(
      (key) => (value[key] || "") !== (initial[key] || ""),
    ),
  );
  const { data: members } = useData(
    initial ? `/persons?household_id=${initial.id}&page=${memberPage}` : null,
  );
  async function transition(status: string) {
    setBusy(true);
    setError("");
    try {
      await post(`/households/${initial!.id}/transition`, {
        status,
        revision: initial!.revision,
        ...(reason ? { reason } : {}),
      });
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const reviewer =
    initial?.status === "submitted" &&
    can("registers.approve") &&
    ![initial.created_by, initial.submitted_by].includes(session.user.id);
  return (
    <Modal
      title={initial?.name || "A home in your parish"}
      subtitle={
        initial
          ? "Household details and review"
          : "Create a draft household and assign its parish unit."
      }
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const body = { ...value, unit_id: value.unit_id || null };
            if (initial) await patch("/households/" + initial.id, body);
            else await post("/households", body);
            onSaved();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-body">
          <ErrorBox error={error} />
          {initial && (
            <p>
              <Badge status={initial.status} />
            </p>
          )}
          <fieldset disabled={!editable || busy}>
            <Field label="Household name">
              <input
                required
                maxLength={300}
                value={value.name}
                onChange={(e) => setValue({ ...value, name: e.target.value })}
              />
            </Field>
            <Field label="Assigned parish unit">
              <select
                value={value.unit_id || ""}
                onChange={(e) =>
                  setValue({ ...value, unit_id: e.target.value })
                }
              >
                <option value="">Unassigned — draft only</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </Field>
            {["address", "contact"].map((k) => (
              <Field
                key={k}
                label={k === "address" ? "Address" : "Primary contact"}
              >
                <input
                  maxLength={2000}
                  value={value[k] || ""}
                  onChange={(e) => setValue({ ...value, [k]: e.target.value })}
                />
              </Field>
            ))}
          </fieldset>
          {initial?.review_note && (
            <div className="notice">
              <Info size={18} />
              <p>{initial.review_note}</p>
            </div>
          )}
          {editable && initial && (
            <p className="muted">
              Saving changes returns this household to draft for a fresh review.
              A different staff member must approve it.
            </p>
          )}
          {reviewer && (
            <Field label="Review note (required to reject)">
              <textarea
                value={reason}
                maxLength={2000}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          )}
          {initial && (
            <>
              <h3>Household members</h3>
              {members?.items.length ? (
                members.items.map((p: Row) => (
                  <div className="family-member" key={p.id}>
                    {p.photo_version ? (
                      <img
                        className="member-photo"
                        src={`/api/v1/persons/${p.id}/photo?v=${p.photo_version}${parishQuery()}`}
                        alt=""
                        width="36"
                        height="36"
                      />
                    ) : (
                      <Users size={18} />
                    )}
                    <strong>{p.name}</strong>
                    <span>{p.membership_no}</span>
                  </div>
                ))
              ) : (
                <p className="muted">
                  No members assigned yet. Assign this household from a member’s
                  profile.
                </p>
              )}
              <Pagination
                data={members}
                page={memberPage}
                setPage={setMemberPage}
              />
            </>
          )}
        </div>
        {dirty && (
          <p className="household-save-notice">
            Save your changes as draft before submitting or reviewing this
            household.
          </p>
        )}
        <div className="modal-actions household-actions">
          <Button type="button" className="secondary" onClick={onClose}>
            Close
          </Button>
          {initial &&
            ["draft", "rejected"].includes(initial.status) &&
            can("members.update") && (
              <Button
                type="button"
                className="secondary"
                disabled={busy || dirty}
                onClick={() => transition("submitted")}
              >
                Submit for approval
              </Button>
            )}
          {reviewer && (
            <>
              <Button
                type="button"
                className="secondary"
                disabled={busy || dirty}
                onClick={() => transition("rejected")}
              >
                Reject
              </Button>
              <Button
                type="button"
                className="primary"
                disabled={busy || dirty}
                onClick={() => transition("approved")}
              >
                Approve household
              </Button>
            </>
          )}
          {editable && (
            <Button className="primary" busy={busy}>
              {initial ? "Save changes as draft" : "Create household"}
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}
function Directory({ type }: { type: "households" | "organisations" }) {
  const { data, error, reload } = useData("/" + type + "?limit=100");
  const [create, setCreate] = useState(false),
    [selected, setSelected] = useState<Row | null>(null),
    { can } = useApp();
  const config =
    type === "households"
      ? {
          title: "Where belonging begins.",
          description: "Households, families and the connections between them.",
          label: "household",
          fields: [
            ["name", "Household name"],
            ["unit", "Unit / ward"],
            ["address", "Address"],
            ["contact", "Primary contact"],
          ],
        }
      : {
          title: "Connected parishes.",
          description: "Your church structure, made clear.",
          label: "organisation",
          fields: [
            ["name", "Name"],
            ["kind", "Type"],
            ["code", "Code"],
            ["address", "Address"],
          ],
        };
  return (
    <>
      <SectionHeading
        title={config.title}
        description={config.description}
        action={
          can(
            type === "households" ? "members.create" : "organisation.manage",
          ) && (
            <Button className="primary" onClick={() => setCreate(true)}>
              <Plus size={17} />
              Add {config.label}
            </Button>
          )
        }
      />
      <ErrorBox error={error} />
      <div className="directory-grid">
        {data?.items.map((h: Row) => (
          <button
            className="panel household-card"
            key={h.id}
            onClick={() => setSelected(h)}
          >
            <span className="household-icon">
              {type === "households" ? (
                <House size={25} />
              ) : (
                <Church size={25} />
              )}
            </span>
            <h2>{h.name}</h2>
            <p>{h.unit || h.kind || "Parish household"}</p>
            <span>{h.address || "Address not recorded"}</span>
            <div>
              View details <ChevronRight size={16} />
            </div>
          </button>
        ))}
      </div>
      {!data?.items.length && (
        <Empty
          title="Room for every family"
          description="Create a household to connect its members."
          icon={House}
        />
      )}{" "}
      {create && (
        <SimpleForm
          title={"New " + config.label}
          path={"/" + type}
          fields={config.fields}
          onClose={() => setCreate(false)}
          onSaved={() => {
            setCreate(false);
            reload();
          }}
        />
      )}
      {selected && (
        <HouseholdDetail row={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}
function HouseholdDetail({ row, onClose }: { row: Row; onClose: () => void }) {
  const { data } = useData("/persons?limit=100");
  return (
    <Modal title={row.name} subtitle={row.unit || row.kind} onClose={onClose}>
      <div className="modal-body">
        <dl className="detail-grid">
          <div>
            <dt>Address</dt>
            <dd>{row.address || "Not recorded"}</dd>
          </div>
          <div>
            <dt>Contact</dt>
            <dd>{row.contact || "Not recorded"}</dd>
          </div>
        </dl>
        <h3>Household members</h3>
        {data?.items
          .filter((p: Row) => p.household_id === row.id)
          .map((p: Row) => (
            <div className="family-member" key={p.id}>
              <Users size={18} />
              <strong>{p.name}</strong>
              <span>{p.membership_no}</span>
            </div>
          ))}
      </div>
    </Modal>
  );
}
function SimpleForm({
  title,
  path,
  fields,
  onClose,
  onSaved,
  defaults = {},
}: {
  title: string;
  path: string;
  fields: string[][];
  onClose: () => void;
  onSaved: (r: Row) => void;
  defaults?: Row;
}) {
  const [v, setV] = useState<Row>(defaults),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await post(path, v);
            onSaved(r);
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-body">
          <ErrorBox error={error} />
          {fields.map(([key, label, inputType]) => (
            <Field key={key} label={label}>
              <input
                required
                type={inputType || "text"}
                minLength={inputType === "password" ? 14 : undefined}
                autoComplete={
                  inputType === "password" ? "new-password" : undefined
                }
                value={v[key] || ""}
                onChange={(e) => setV({ ...v, [key]: e.target.value })}
              />
            </Field>
          ))}
        </div>
        <div className="modal-actions">
          <Button type="button" className="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={busy} className="primary">
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function ArchivePage() {
  const [selected, setSelected] = useState(""),
    [upload, setUpload] = useState(false),
    [create, setCreate] = useState(false),
    [viewer, setViewer] = useState<Row | null>(null);
  const { data: volumes, reload: reloadVolumes } =
      useData("/volumes?limit=100"),
    { data, error, loading, reload } = useData("/assets?volume=" + selected),
    { can, navigate } = useApp();
  return (
    <>
      <SectionHeading
        eyebrow="THE PARISH ARCHIVE"
        title="The past has a place here."
        description="Preserve original pages. Keep their stories connected."
        action={
          <div className="button-group">
            {can("archive.upload") && (
              <>
                <Button className="secondary" onClick={() => setCreate(true)}>
                  <Plus size={17} />
                  New volume
                </Button>
                <Button className="primary" onClick={() => setUpload(true)}>
                  <Upload size={17} />
                  Upload originals
                </Button>
              </>
            )}
          </div>
        }
      />
      <div className="notice">
        <ShieldCheck size={19} />
        <p>
          Original files are preserved without alteration. Every upload carries
          a SHA-256 checksum and a permanent source reference.
        </p>
      </div>
      <div className="archive-layout">
        <aside className="panel collection-list">
          <h3>
            <Layers size={18} />
            Collections & volumes
          </h3>
          <button
            className={!selected ? "selected" : ""}
            onClick={() => setSelected("")}
          >
            <Archive size={17} />
            All originals
          </button>
          {volumes?.items.map((v: Row) => (
            <button
              key={v.id}
              className={selected === v.id ? "selected" : ""}
              onClick={() => setSelected(v.id)}
            >
              <BookOpen size={17} />
              <span>
                <strong>{v.title}</strong>
                <small>
                  {v.date_range} · {v.condition}
                </small>
              </span>
            </button>
          ))}
        </aside>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>
                {selected
                  ? volumes?.items.find((v: Row) => v.id === selected)?.title
                  : "Preserved originals"}
              </h2>
              <p>{fmt(data?.total)} original files in this view</p>
            </div>
          </div>
          <ErrorBox error={error} />
          {loading ? (
            <Loading />
          ) : data?.items.length ? (
            <div className="asset-grid">
              {data.items.map((a: Row) => (
                <button
                  className="asset-card"
                  key={a.id}
                  onClick={() => setViewer(a)}
                >
                  <div className="asset-preview">
                    {a.mime.startsWith("image") ? (
                      <img
                        loading="lazy"
                        src={
                          "/api/v1/assets/" +
                          a.id +
                          "/file?view=1" +
                          parishQuery()
                        }
                        alt={"Original " + a.page_label}
                      />
                    ) : (
                      <FileText size={48} strokeWidth={1} />
                    )}
                    <span>
                      {a.mime === "application/pdf" ? "PDF" : "IMAGE"}
                    </span>
                  </div>
                  <strong>{a.filename}</strong>
                  <p>
                    Page {a.page_label} ·{" "}
                    {(a.size_bytes / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <small>{a.volume_title}</small>
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title="A lasting home for original pages"
              description="Upload a scanned register, photograph or PDF to begin preserving this volume."
              icon={Archive}
              action={
                can("archive.upload") && (
                  <Button className="secondary" onClick={() => setUpload(true)}>
                    Upload an original
                  </Button>
                )
              }
            />
          )}
        </section>
      </div>
      {upload && (
        <UploadForm
          volumes={volumes?.items || []}
          defaultVolume={selected}
          onClose={() => setUpload(false)}
          onSaved={() => {
            setUpload(false);
            reload();
          }}
        />
      )}
      {create && (
        <SimpleForm
          title="Create an archival volume"
          path="/volumes"
          defaults={{ language: "English", condition: "Good" }}
          fields={[
            ["title", "Volume title"],
            ["collection", "Collection"],
            ["kind", "Register type"],
            ["date_range", "Date range"],
            ["language", "Language / script"],
            ["condition", "Physical condition"],
            ["custodian", "Custodian"],
          ]}
          onClose={() => setCreate(false)}
          onSaved={() => {
            setCreate(false);
            reloadVolumes();
          }}
        />
      )}
      {viewer && (
        <Modal
          title={viewer.filename}
          subtitle={"Page " + viewer.page_label + " · " + viewer.volume_title}
          wide
          onClose={() => setViewer(null)}
        >
          <div className="modal-body">
            <SourceViewer asset={viewer} />
            <p className="checksum">SHA-256 · {viewer.checksum}</p>
            <div className="button-group">
              <a
                className="button secondary"
                href={"/api/v1/assets/" + viewer.id + "/file"}
                target="_blank"
                rel="noreferrer"
              >
                <Download size={16} />
                Open original
              </a>
              {can("ocr.process") && (
                <Button
                  className="primary"
                  onClick={() => {
                    setViewer(null);
                    navigate("Digitisation");
                  }}
                >
                  Start transcription
                </Button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
function UploadForm({
  volumes,
  defaultVolume,
  onClose,
  onSaved,
}: {
  volumes: Row[];
  defaultVolume: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [volume, setVolume] = useState(defaultVolume),
    [label, setLabel] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Preserve an original"
      subtitle="PDF, JPEG or PNG · Maximum 25 MB per upload"
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!file) return;
          setBusy(true);
          setError("");
          try {
            const form = new FormData();
            form.append("file", file);
            form.append("volume_id", volume);
            form.append("page_label", label);
            await api("/assets", { method: "POST", body: form });
            onSaved();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-body">
          <ErrorBox error={error} />
          <label className="dropzone">
            <Upload size={30} />
            <strong>{file ? file.name : "Choose an original file"}</strong>
            <span>Your source is preserved exactly as uploaded.</span>
            <input
              required
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
          <Field label="Archive volume *">
            <select
              required
              value={volume}
              onChange={(e) => setVolume(e.target.value)}
            >
              <option value="">Select a volume</option>
              {volumes.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Page / folio label *">
            <input
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. 42, 42 verso, or pages 1–20"
            />
          </Field>
          <div className="notice">
            <Info size={18} />
            Scans never become official records automatically. Review and
            approval are separate steps.
          </div>
        </div>
        <div className="modal-actions">
          <Button type="button" className="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={busy} disabled={!volumes.length} className="primary">
            <Upload size={17} />
            Preserve original
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function SourceViewer({
  asset,
  regions = [],
}: {
  asset: Row;
  regions?: Row[];
}) {
  const [overlay, setOverlay] = useState(false);
  const [zoom, setZoom] = useState(1),
    [rotation, setRotation] = useState(0);
  return (
    <div className="source-viewer">
      <div className="viewer-toolbar">
        <span>Original · page {asset.page_label}</span>
        <div>
          <button
            className="icon-button"
            aria-label="Zoom out"
            onClick={() => setZoom((v) => Math.max(0.25, v - 0.25))}
          >
            <ZoomOut size={18} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            className="icon-button"
            aria-label="Zoom in"
            onClick={() => setZoom((v) => Math.min(4, v + 0.25))}
          >
            <ZoomIn size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Rotate view"
            onClick={() => setRotation((v) => v + 90)}
          >
            <RotateCw size={17} />
          </button>
          <button
            className="text-button"
            onClick={() => {
              setZoom(1);
              setRotation(0);
            }}
          >
            Fit
          </button>
          {regions.length > 0 && (
            <button
              className="text-button"
              aria-pressed={overlay}
              onClick={() => setOverlay((s) => !s)}
            >
              Text regions
            </button>
          )}
        </div>
      </div>
      <div className="image-canvas">
        {asset.mime === "application/pdf" ? (
          <iframe
            title="Original register PDF"
            src={
              (asset.file_url || "/api/v1/assets/" + asset.id + "/file") +
              "?view=1" +
              parishQuery()
            }
            sandbox="allow-same-origin"
          />
        ) : (
          <div
            className="page-image"
            style={{
              width: zoom * 100 + "%",
              transform: `rotate(${rotation}deg)`,
            }}
          >
            <img
              draggable={false}
              alt="Source page for transcription"
              src={
                (asset.file_url || "/api/v1/assets/" + asset.id + "/file") +
                "?view=1" +
                parishQuery()
              }
            />
            {overlay &&
              regions.map((r, i) => (
                <span
                  key={i}
                  className="text-region"
                  title={r.text + " ? " + Math.round(r.confidence * 100) + "%"}
                  style={{
                    left: r.box[0] * 100 + "%",
                    top: r.box[1] * 100 + "%",
                    width: (r.box[2] - r.box[0]) * 100 + "%",
                    height: (r.box[3] - r.box[1]) * 100 + "%",
                  }}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
function Digitisation() {
  const { data, error, loading, reload } = useData("/jobs", [], 5000),
    { data: assets } = useData("/assets?limit=100"),
    { data: schemas } = useData("/schemas?limit=100"),
    { can, notify } = useApp();
  const [create, setCreate] = useState(false),
    [selected, setSelected] = useState<Row | null>(null),
    [asset, setAsset] = useState(""),
    [schema, setSchema] = useState(""),
    [provider, setProvider] = useState("manual"),
    [err, setErr] = useState("");
  return (
    <>
      <SectionHeading
        eyebrow="DIGITISATION STUDIO"
        title="Old handwriting. New possibilities."
        description="A careful journey from original page to verified parish record."
        action={
          can("ocr.process") && (
            <Button className="primary" onClick={() => setCreate(true)}>
              <Plus size={17} />
              New transcription
            </Button>
          )
        }
      />
      <div className="workflow-steps">
        {[
          ["01", "Preserve originals"],
          ["02", "Extract or transcribe"],
          ["03", "Review against source"],
          ["04", "Submit & approve"],
        ].map(([n, l], i) => (
          <div key={n}>
            <span>{n}</span>
            <strong>{l}</strong>
            {i < 3 && <ChevronRight size={17} />}
          </div>
        ))}
      </div>
      <div className="notice">
        <LockKeyhole size={19} />
        <p>
          Local processing only. OCR output is an unverified suggestion; manual
          transcription remains available at every step.
        </p>
      </div>
      <ErrorBox error={error || err} />
      <section className="panel">
        {loading ? (
          <Loading />
        ) : data?.items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>SOURCE</th>
                  <th>PROCESSING</th>
                  <th>STATUS</th>
                  <th>CREATED</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((j: Row) => (
                  <tr key={j.id}>
                    <td>
                      <strong>{j.filename}</strong>
                      <small className="block">
                        {j.volume_title} · page {j.page_label}
                      </small>
                    </td>
                    <td>
                      {j.provider === "manual"
                        ? "Human transcription"
                        : "Tesseract · local"}
                    </td>
                    <td>
                      <Badge status={j.status} />
                      {j.error && (
                        <small className="block danger-text">{j.error}</small>
                      )}
                    </td>
                    <td>{date(j.created_at)}</td>
                    <td>
                      {j.status === "split" ? (
                        <span className="muted">
                          Separate page jobs created
                        </span>
                      ) : j.status === "failed" ? (
                        <Button
                          className="secondary"
                          onClick={async () => {
                            try {
                              await post("/jobs/" + j.id + "/retry", {});
                              reload();
                            } catch (e: any) {
                              setErr(e.message);
                            }
                          }}
                        >
                          <RefreshCw size={15} />
                          Retry
                        </Button>
                      ) : (
                        <Button
                          className="secondary"
                          onClick={() => setSelected(j)}
                        >
                          {j.status === "imported"
                            ? "View transcription"
                            : "Review page"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Give a page a new life"
            description="Create a transcription from a preserved original. Work manually or use the local printed-text OCR adapter."
            icon={ScanLine}
          />
        )}
      </section>
      {create && (
        <Modal title="Begin a transcription" onClose={() => setCreate(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await post("/jobs", {
                  asset_id: asset,
                  schema_id: schema,
                  provider,
                });
                setCreate(false);
                reload();
                notify("Transcription created. Original source preserved.");
              } catch (e: any) {
                setErr(e.message);
              }
            }}
          >
            <div className="modal-body">
              <ErrorBox error={err} />
              <Field label="Original page *">
                <select
                  required
                  value={asset}
                  onChange={(e) => setAsset(e.target.value)}
                >
                  <option value="">Choose a preserved original</option>
                  {assets?.items.map((a: Row) => (
                    <option key={a.id} value={a.id}>
                      {a.filename} · {a.page_label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Register schema *">
                <select
                  required
                  value={schema}
                  onChange={(e) => setSchema(e.target.value)}
                >
                  <option value="">Choose register type</option>
                  {schemas?.items.map((s: Row) => (
                    <option key={s.id} value={s.id}>
                      {s.label} v{s.version}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Processing method">
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                >
                  <option value="manual">
                    Manual transcription · always available
                  </option>
                  <option value="tesseract">
                    Tesseract · local printed text
                  </option>
                </select>
              </Field>
              <p className="muted">
                Local OCR must be enabled in Administration and the worker must
                be running. Historical handwriting requires human transcription.
              </p>
            </div>
            <div className="modal-actions">
              <Button className="primary">Create transcription</Button>
            </div>
          </form>
        </Modal>
      )}
      {selected && (
        <ReviewJobLoader
          id={selected.id}
          onClose={() => {
            setSelected(null);
            reload();
          }}
        />
      )}
    </>
  );
}
function ReviewJob({ job, onClose }: { job: Row; onClose: () => void }) {
  const { data: assets } = useData("/assets?limit=100"),
    { data: schemas } = useData("/schemas?limit=100"),
    { data: persons } = useData("/persons?limit=100");
  const [v, setV] = useState<Row>({
      ...job.extraction,
      schema_id: job.schema_id,
      fields: job.extraction.fields || {},
      date_precision: job.extraction.date_precision || "unknown",
    }),
    [raw, setRaw] = useState(job.raw_text || ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reviewed, setReviewed] = useState(job.status === "reviewed");
  const { can, notify } = useApp();
  const original = assets?.items.find((a: Row) => a.id === job.asset_id);
  const a =
    job.source ||
    (original && job.page_id
      ? {
          ...original,
          mime: "image/png",
          file_url: "/api/v1/jobs/" + job.id + "/page",
          page_label: job.page_label,
        }
      : original);
  const save = async (complete: boolean) => {
    setBusy(true);
    try {
      await patch("/jobs/" + job.id + "/review", {
        extraction: v,
        raw_text: raw,
        complete,
      });
      setReviewed(complete);
      notify(
        complete
          ? "Human review completed. Import creates a draft."
          : "Transcription saved.",
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Every detail deserves a second look."
      subtitle={job.filename + " · " + job.volume_title}
      onClose={onClose}
      wide
    >
      <div className="review-layout">
        <div>
          {a ? (
            <SourceViewer asset={a} regions={job.result?.regions} />
          ) : (
            <Loading />
          )}
          {job.result && (
            <div className="notice recognition-note">
              <Info size={18} />
              <div>
                <strong>
                  Recognition confidence:{" "}
                  {Math.round(Number(job.result.confidence) * 100)}%
                </strong>
                <p>
                  Provider-level score only. Verify every field against the
                  source.
                </p>
                <details>
                  <summary>Preserved original OCR text</summary>
                  <pre>{job.result.raw_text || "No text recognised."}</pre>
                </details>
              </div>
            </div>
          )}
          <details className="raw-text">
            <summary>Recognised / transcribed text</summary>
            <textarea
              aria-label="Raw recognised text"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
            />
          </details>
        </div>
        <div className="review-fields">
          <div className="notice">
            <Info size={18} />
            Compare every field with the original. Leave unreadable information
            blank.
          </div>
          <ErrorBox error={error} />
          <fieldset disabled={job.status === "imported"}>
            <RecordFields
              value={v}
              setValue={(value) => {
                setV(value);
                setReviewed(false);
              }}
              schemas={schemas?.items || []}
              persons={persons?.items || []}
            />
          </fieldset>
        </div>
      </div>
      <div className="modal-actions">
        <Button type="button" className="secondary" onClick={onClose}>
          Close
        </Button>
        {job.status !== "imported" && (
          <>
            <Button
              busy={busy}
              className="secondary"
              onClick={() => save(false)}
            >
              Save progress
            </Button>
            <Button busy={busy} className="primary" onClick={() => save(true)}>
              <Check size={17} />
              Complete human review
            </Button>
            {reviewed && can("ocr.approve_import") && (
              <Button
                busy={busy}
                className="primary"
                onClick={async () => {
                  try {
                    await post("/jobs/" + job.id + "/import", {});
                    notify(
                      "Imported as a draft. Submit for separate official approval.",
                    );
                    onClose();
                  } catch (e: any) {
                    setError(e.message);
                  }
                }}
              >
                Import as draft
              </Button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
function Certificates() {
  const { data, error, reload } = useData("/certificates"),
    { data: templates, reload: reloadTemplates } = useData(
      "/templates?limit=100",
    ),
    { data: entries } = useData("/entries?limit=100");
  const [create, setCreate] = useState(false),
    [templateForm, setTemplateForm] = useState(false),
    [entry, setEntry] = useState(""),
    [template, setTemplate] = useState(""),
    [err, setErr] = useState(""),
    [revoke, setRevoke] = useState<Row | null>(null),
    [reason, setReason] = useState(""),
    { can, notify } = useApp();
  return (
    <>
      <SectionHeading
        eyebrow="CERTIFICATES & EXTRACTS"
        title="An official record. With care."
        description="Issue church-approved documents from verified register entries."
        action={
          <div className="button-group">
            {can("tenant.manage") && (
              <Button
                className="secondary"
                onClick={() => setTemplateForm(true)}
              >
                Add approved template
              </Button>
            )}
            <Button className="primary" onClick={() => setCreate(true)}>
              <Plus size={17} />
              Issue certificate
            </Button>
          </div>
        }
      />
      <div className="notice">
        <ShieldCheck size={19} />
        Certificate wording requires church-authority approval. Church documents
        do not replace civil birth or marriage certificates.
      </div>
      <ErrorBox error={error || err} />
      <section className="panel">
        {data?.items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>REFERENCE</th>
                  <th>PERSON</th>
                  <th>ISSUED</th>
                  <th>STATUS</th>
                  <th>DOCUMENT</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c: Row) => (
                  <tr key={c.id}>
                    <td>{c.reference}</td>
                    <td>{c.person_name}</td>
                    <td>{date(c.created_at)}</td>
                    <td>
                      <Badge status={c.revoked_at ? "revoked" : "valid"} />
                    </td>
                    <td>
                      <div className="button-group">
                        <a
                          className="text-button"
                          href={
                            "/api/v1/certificates/" +
                            c.id +
                            "/pdf?view=1" +
                            parishQuery()
                          }
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Download size={16} />
                          PDF
                        </a>
                        {!c.revoked_at && (
                          <button
                            className="text-button danger-text"
                            onClick={() => setRevoke(c)}
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Official words, thoughtfully issued"
            description="Add an authority-approved template, then issue a certificate from an approved entry."
            icon={FileBadge}
          />
        )}
      </section>
      {create && (
        <Modal title="Issue a certificate" onClose={() => setCreate(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await post("/certificates", {
                  entry_id: entry,
                  template_id: template,
                });
                setCreate(false);
                reload();
                notify("Certificate issued and recorded in the audit trail.");
              } catch (e: any) {
                setErr(e.message);
              }
            }}
          >
            <div className="modal-body">
              <ErrorBox error={err} />
              <Field label="Approved register entry">
                <select
                  required
                  value={entry}
                  onChange={(e) => setEntry(e.target.value)}
                >
                  <option value="">Choose an approved entry</option>
                  {entries?.items
                    .filter((e: Row) =>
                      ["approved", "corrected"].includes(e.status),
                    )
                    .map((e: Row) => (
                      <option key={e.id} value={e.id}>
                        {e.person_name} · {e.entry_no}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Approved template">
                <select
                  required
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                >
                  <option value="">Choose a church-approved template</option>
                  {templates?.items
                    .filter((t: Row) => t.approved)
                    .map((t: Row) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </Field>
            </div>
            <div className="modal-actions">
              <Button className="primary">Issue & record</Button>
            </div>
          </form>
        </Modal>
      )}
      {templateForm && (
        <TemplateForm
          onClose={() => setTemplateForm(false)}
          onSaved={() => {
            setTemplateForm(false);
            reloadTemplates();
          }}
        />
      )}
      {revoke && (
        <Modal
          title="Revoke certificate"
          subtitle={revoke.reference}
          onClose={() => setRevoke(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await post("/certificates/" + revoke.id + "/revoke", {
                  reason,
                });
                setRevoke(null);
                reload();
              } catch (e: any) {
                setErr(e.message);
              }
            }}
          >
            <div className="modal-body">
              <Field label="Reason *">
                <textarea
                  required
                  minLength={5}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
            </div>
            <div className="modal-actions">
              <Button className="primary">Confirm revocation</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
function TemplateForm({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [v, setV] = useState<Row>({ approved: false }),
    [error, setError] = useState("");
  return (
    <Modal
      title="Church-approved certificate template"
      subtitle="Enter wording supplied by your church authority."
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await post("/templates", v);
            onSaved();
          } catch (e: any) {
            setError(e.message);
          }
        }}
      >
        <div className="modal-body">
          <ErrorBox error={error} />
          <Field label="Template name">
            <input
              required
              onChange={(e) => setV({ ...v, name: e.target.value })}
            />
          </Field>
          <Field label="Authorised signatory">
            <input
              required
              onChange={(e) => setV({ ...v, signatory: e.target.value })}
            />
          </Field>
          <Field
            label="Approved wording"
            hint="Available placeholders: {{name}}, {{date}}, {{entry_no}}"
          >
            <textarea
              required
              minLength={20}
              rows={7}
              onChange={(e) => setV({ ...v, wording: e.target.value })}
            />
          </Field>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={v.approved}
              onChange={(e) => setV({ ...v, approved: e.target.checked })}
            />
            I confirm that the church authority has approved this wording.
          </label>
          <label className="checkbox" style={{ marginTop: 18 }}>
            <input
              type="checkbox"
              checked={v.include_annotations || false}
              onChange={(e) =>
                setV({ ...v, include_annotations: e.target.checked })
              }
            />
            Include official annotations under the church authority’s approved
            certificate policy.
          </label>
        </div>
        <div className="modal-actions">
          <Button className="primary">Save template</Button>
        </div>
      </form>
    </Modal>
  );
}
function Reports() {
  const { data, error, loading } = useData("/reports"),
    { can } = useApp();
  const [purpose, setPurpose] = useState("");
  return (
    <>
      <SectionHeading
        eyebrow="REPORTS & INSIGHTS"
        title="The bigger parish picture."
        description="Clear, accountable reporting across your registers and archive."
      />
      <ErrorBox error={error} />
      {loading ? (
        <Loading />
      ) : (
        <div className="report-grid">
          <section className="panel">
            <div className="panel-heading">
              <h2>Register coverage</h2>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>REGISTER</th>
                    <th>STATUS</th>
                    <th>ENTRIES</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.entries.map((r: Row) => (
                    <tr key={r.label + r.status}>
                      <td>{r.label}</td>
                      <td>
                        <Badge status={r.status} />
                      </td>
                      <td>{fmt(r.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Preservation report</h2>
            </div>
            <div className="report-volumes">
              {data?.archive.map((a: Row) => (
                <div key={a.title}>
                  <BookOpen size={22} />
                  <div>
                    <strong>{a.title}</strong>
                    <p>
                      {a.condition} · {fmt(a.pages)} files ·{" "}
                      {(a.bytes / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {can("members.export") && (
              <div className="export-box">
                <h3>Member directory export</h3>
                <p>
                  A CSV export contains personal data. Enter a purpose for the
                  audit trail.
                </p>
                <input
                  aria-label="Export purpose"
                  placeholder="Purpose of export (required)"
                  minLength={5}
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                />
                {purpose.length >= 5 && (
                  <a
                    className="button secondary"
                    href={
                      "/api/v1/export?purpose=" + encodeURIComponent(purpose)
                    }
                  >
                    <Download size={16} />
                    Download CSV
                  </a>
                )}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
function Audit() {
  const [q, setQ] = useState(""),
    [page, setPage] = useState(1);
  const { data, error, loading } = useData(
    `/audit?q=${encodeURIComponent(q)}&page=${page}`,
  );
  return (
    <>
      <SectionHeading
        eyebrow="ACCOUNTABILITY, BY DESIGN"
        title="A clear trail of care."
        description="Sensitive access and consequential changes, recorded in an append-only history."
      />
      <section className="panel">
        <div className="list-toolbar">
          <div className="input-icon">
            <Search size={17} />
            <input
              aria-label="Filter audit actions"
              placeholder="Filter by action, e.g. entry.approved…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <ShieldCheck size={22} />
        </div>
        <ErrorBox error={error} />
        {loading ? (
          <Loading />
        ) : (
          <div className="audit-list">
            {data?.items.map((a: Row) => (
              <div key={a.id}>
                <span className="audit-icon">
                  <History size={18} />
                </span>
                <div>
                  <strong>{a.action.replaceAll(".", " · ")}</strong>
                  <p>
                    {a.actor_name || "System"} <span>·</span> {a.resource}
                    {a.resource_id && " · " + a.resource_id.slice(0, 8)}
                  </p>
                  <small>Request {a.request_id}</small>
                </div>
                <time>
                  {new Intl.DateTimeFormat("en-IN", {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(new Date(a.created_at))}
                </time>
              </div>
            ))}
          </div>
        )}
        <Pagination data={data} page={page} setPage={setPage} />
      </section>
    </>
  );
}
function Administration() {
  const [tab, setTab] = useState("Church profile");
  const { data, error, reload } = useData("/settings"),
    { data: users, reload: reloadUsers } = useData("/users");
  const [v, setV] = useState<Row | null>(null),
    [invite, setInvite] = useState(false),
    [message, setMessage] = useState(""),
    [permissionUser, setPermissionUser] = useState<Row | null>(null),
    [err, setErr] = useState(""),
    { notify, refresh, session } = useApp();
  useEffect(() => {
    if (data) setV(data);
  }, [data]);
  return (
    <>
      <SectionHeading
        eyebrow="PARISH ADMINISTRATION"
        title="Set up for your community."
        description="Your church, your staff and the way you work."
      />
      <div className="register-tabs">
        {[
          "Church profile",
          "Staff & access",
          "Organisation",
          "Register schemas",
        ].map((t) => (
          <button
            className={t === tab ? "selected" : ""}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <ErrorBox error={error || err} />
      {tab === "Church profile" && v && (
        <section className="panel settings-panel">
          <h2>Church profile & workflow</h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await patch("/settings", v);
                notify("Church settings saved.");
                refresh();
                reload();
              } catch (e: any) {
                setErr(e.message);
              }
            }}
          >
            <div className="form-grid">
              <Field label="Church name">
                <input
                  required
                  value={v.name}
                  onChange={(e) => setV({ ...v, name: e.target.value })}
                />
              </Field>
              <Field label="Church code">
                <input disabled value={v.code} />
              </Field>
              {[
                ["tradition", "Church tradition"],
                ["timezone", "Timezone"],
                ["locale", "Locale"],
              ].map(([k, l]) => (
                <Field key={k} label={l}>
                  <input
                    value={v.settings[k]}
                    onChange={(e) =>
                      setV({
                        ...v,
                        settings: { ...v.settings, [k]: e.target.value },
                      })
                    }
                  />
                </Field>
              ))}
            </div>
            <div className="setting-toggle">
              <div>
                <strong>Independent approval</strong>
                <p>
                  The creator or submitting clerk cannot approve their own
                  record.
                </p>
              </div>
              <label className="switch">
                <input
                  aria-label="Require independent approval"
                  type="checkbox"
                  checked={v.settings.maker_checker}
                  onChange={(e) =>
                    setV({
                      ...v,
                      settings: {
                        ...v.settings,
                        maker_checker: e.target.checked,
                      },
                    })
                  }
                />
                <span />
              </label>
            </div>
            <div className="setting-toggle">
              <div>
                <strong>Local OCR processing</strong>
                <p>
                  Enable the self-hosted Tesseract adapter. External cloud
                  processing stays disabled.
                </p>
              </div>
              <label className="switch">
                <input
                  aria-label="Enable local OCR"
                  type="checkbox"
                  checked={v.settings.ai_enabled}
                  onChange={(e) =>
                    setV({
                      ...v,
                      settings: { ...v.settings, ai_enabled: e.target.checked },
                    })
                  }
                />
                <span />
              </label>
            </div>
            <Button className="primary">Save church settings</Button>
          </form>
        </section>
      )}
      {tab === "Staff & access" && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>People with access</h2>
              <p>Role changes and deactivation revoke existing sessions.</p>
            </div>
            <Button className="primary" onClick={() => setInvite(true)}>
              <Plus size={16} />
              Invite staff
            </Button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>STAFF MEMBER</th>
                  <th>ROLE</th>
                  <th>STATUS</th>
                  <th>SECURITY</th>
                  <th>ACCESS</th>
                </tr>
              </thead>
              <tbody>
                {users?.items.map((u: Row) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.name}</strong>
                      <small className="block">{u.email}</small>
                    </td>
                    <td>
                      <select
                        aria-label={"Role for " + u.name}
                        value={u.role}
                        disabled={u.id === session.user.id}
                        onChange={async (e) => {
                          try {
                            await patch("/users/" + u.id, {
                              role: e.target.value,
                              active: u.active,
                              permissions: u.permissions,
                            });
                            reloadUsers();
                            notify("Staff role updated; sessions revoked.");
                          } catch (e: any) {
                            setErr(e.message);
                          }
                        }}
                      >
                        {[
                          "admin",
                          "priest",
                          "secretary",
                          "clerk",
                          "archivist",
                          "auditor",
                        ].map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <Badge status={u.active ? "active" : "inactive"} />
                    </td>
                    <td>{u.mfa_enabled ? "MFA enabled" : "MFA not enabled"}</td>
                    <td>
                      <div className="button-group">
                        <button
                          type="button"
                          className="text-button"
                          disabled={u.id === session.user.id}
                          onClick={() => setPermissionUser(u)}
                        >
                          Permissions
                        </button>
                        <button
                          className="text-button"
                          disabled={u.id === session.user.id}
                          onClick={async () => {
                            try {
                              await patch("/users/" + u.id, {
                                role: u.role,
                                active: !u.active,
                                permissions: u.permissions,
                              });
                              reloadUsers();
                            } catch (e: any) {
                              setErr(e.message);
                            }
                          }}
                        >
                          {u.active ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {tab === "Organisation" && <Directory type="organisations" />}
      {tab === "Register schemas" && <SchemaManager />}
      {permissionUser && (
        <PermissionEditor
          user={permissionUser}
          onClose={() => setPermissionUser(null)}
          onSaved={() => {
            setPermissionUser(null);
            reloadUsers();
            notify("Permissions saved; existing staff sessions revoked.");
          }}
        />
      )}
      {invite && (
        <InviteForm
          onClose={() => setInvite(false)}
          onSaved={(r) => {
            setInvite(false);
            reloadUsers();
            setMessage(r.setup_url || r.message);
          }}
        />
      )}
      {message && (
        <Modal title="Staff invitation prepared" onClose={() => setMessage("")}>
          <div className="modal-body">
            <p>
              Share this single-use setup link securely with the invited staff
              member. It expires in two days.
            </p>
            <textarea
              aria-label="Invitation setup link"
              readOnly
              value={message}
            />
            <p className="muted">
              Development uses a private local mail outbox. Configure a delivery
              provider before launch.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}
function InviteForm({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (r: Row) => void;
}) {
  const [v, setV] = useState<Row>({ role: "clerk" }),
    [err, setErr] = useState("");
  return (
    <Modal title="Invite a trusted colleague" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            onSaved(await post("/invitations", v));
          } catch (e: any) {
            setErr(e.message);
          }
        }}
      >
        <div className="modal-body">
          <ErrorBox error={err} />
          <Field label="Full name">
            <input
              required
              onChange={(e) => setV({ ...v, name: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <input
              required
              type="email"
              onChange={(e) => setV({ ...v, email: e.target.value })}
            />
          </Field>
          <Field label="Role">
            <select
              value={v.role}
              onChange={(e) => setV({ ...v, role: e.target.value })}
            >
              {[
                "admin",
                "priest",
                "secretary",
                "clerk",
                "archivist",
                "auditor",
              ].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="modal-actions">
          <Button className="primary">
            <Mail size={16} />
            Prepare invitation
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function SchemaManager() {
  const { data, reload } = useData("/schemas?limit=100");
  const [selected, setSelected] = useState<Row | null>(null),
    [fields, setFields] = useState<Row[]>([]),
    [err, setErr] = useState("");
  return (
    <section className="panel settings-panel">
      <div className="schema-heading">
        <h2>Register forms & versions</h2>
        <Button
          className="primary"
          onClick={() => {
            setSelected({ kind: "", label: "", version: 0 });
            setFields([]);
            setErr("");
          }}
        >
          <Plus size={17} />
          New register type
        </Button>
      </div>
      <p className="muted">
        Create a new version to change fields. Existing entries retain their
        original schema.
      </p>
      {data?.items.map((s: Row) => (
        <div className="schema-row" key={s.id}>
          <BookOpen size={20} />
          <div>
            <strong>
              {s.label} · v{s.version}
            </strong>
            <p>{s.fields.map((f: Row) => f.label).join(" · ")}</p>
          </div>
          {!data.items.some(
            (other: Row) => other.kind === s.kind && other.version > s.version,
          ) && (
            <Button
              className="secondary"
              onClick={() => {
                setSelected(s);
                setFields(s.fields.map((f: Row) => ({ ...f })));
                setErr("");
              }}
            >
              New version
            </Button>
          )}
        </div>
      ))}
      {selected && (
        <Modal
          title={
            selected.version
              ? "New version - " + selected.label
              : "Create a parish register"
          }
          onClose={() => setSelected(null)}
          wide
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await post("/schemas", {
                  kind: selected.kind,
                  label: selected.label,
                  version: selected.version + 1,
                  fields,
                });
                setSelected(null);
                reload();
              } catch (e: any) {
                setErr(e.message);
              }
            }}
          >
            <div className="modal-body">
              <ErrorBox error={err} />
              <div className="form-grid">
                <Field label="Register name">
                  <input
                    required
                    value={selected.label}
                    onChange={(e) =>
                      setSelected({ ...selected, label: e.target.value })
                    }
                  />
                </Field>
                <Field
                  label="Stable register identifier"
                  hint="Lowercase letters and underscores, for example first_communion."
                >
                  <input
                    required
                    pattern="[a-z_]{1,50}"
                    readOnly={selected.version > 0}
                    value={selected.kind}
                    onChange={(e) =>
                      setSelected({ ...selected, kind: e.target.value })
                    }
                  />
                </Field>
              </div>
              <div className="notice">
                <Info size={18} />
                Every form already includes person, name as recorded, entry
                reference, event date, place, minister and source. Add the extra
                fields approved for this register.
              </div>
              <div className="schema-field-builder">
                {fields.map((f, index) => (
                  <div className="schema-field" key={f.key}>
                    <Field label={"Field " + (index + 1) + " label"}>
                      <input
                        required
                        value={f.label}
                        onChange={(e) =>
                          setFields(
                            fields.map((r, i) =>
                              i === index ? { ...r, label: e.target.value } : r,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label={"Field " + (index + 1) + " type"}>
                      <select
                        value={f.type}
                        onChange={(e) =>
                          setFields(
                            fields.map((r, i) =>
                              i === index ? { ...r, type: e.target.value } : r,
                            ),
                          )
                        }
                      >
                        <option value="text">Text</option>
                        <option value="date">Exact date</option>
                        <option value="number">Number</option>
                      </select>
                    </Field>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={f.required}
                        onChange={(e) =>
                          setFields(
                            fields.map((r, i) =>
                              i === index
                                ? { ...r, required: e.target.checked }
                                : r,
                            ),
                          )
                        }
                      />
                      Required
                    </label>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={"Remove field " + (index + 1)}
                      onClick={() =>
                        setFields(fields.filter((_, i) => i !== index))
                      }
                    >
                      <X size={18} />
                    </button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                className="secondary"
                disabled={fields.length >= 40}
                onClick={() =>
                  setFields([
                    ...fields,
                    {
                      key:
                        "field_" +
                        Date.now().toString(36) +
                        "_" +
                        fields.length,
                      label: "",
                      type: "text",
                      required: false,
                    },
                  ])
                }
              >
                <Plus size={16} />
                Add field
              </Button>
            </div>
            <div className="modal-actions">
              <Button className="primary">
                Save form version {selected.version + 1}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
function Account() {
  const { session, refresh, notify } = useApp(),
    { data, reload } = useData("/auth/sessions");
  const [mfa, setMfa] = useState<Row | null>(null),
    [otp, setOtp] = useState(""),
    [error, setError] = useState("");
  return (
    <>
      <SectionHeading
        title="Your workspace, securely."
        description="Manage your authenticator and active sessions."
      />
      <ErrorBox error={error} />
      <div className="report-grid">
        <section className="panel settings-panel">
          <h2>{session.user.name}</h2>
          <p>{session.user.email}</p>
          <div className="notice">
            <ShieldCheck size={20} />
            Two-factor authentication:{" "}
            {session.user.mfa_enabled ? "enabled" : "not yet enabled"}
          </div>
          {!session.user.mfa_enabled && !mfa && (
            <Button
              className="primary"
              onClick={async () => {
                try {
                  setMfa(await post("/auth/mfa/setup", {}));
                } catch (e: any) {
                  setError(e.message);
                }
              }}
            >
              Set up authenticator
            </Button>
          )}
          {mfa && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await post("/auth/mfa/enable", { otp });
                  notify("Authenticator enabled.");
                  setMfa(null);
                  refresh();
                } catch (e: any) {
                  setError(e.message);
                }
              }}
            >
              <p>
                Add this secret to your authenticator app. Store it securely.
              </p>
              <code className="mfa-secret">{mfa.secret}</code>
              <Field label="Six-digit authenticator code">
                <input
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                />
              </Field>
              <Button className="primary">Verify & enable</Button>
            </form>
          )}
          <Button
            className="secondary sign-out"
            onClick={async () => {
              await post("/auth/logout", {});
              setParish("");
              setChangeReason("");
              refresh();
            }}
          >
            <LogOut size={17} />
            Sign out
          </Button>
        </section>
        <section className="panel settings-panel">
          <h2>Active sessions</h2>
          {(data as unknown as Row[])?.map?.((s: Row) => (
            <div className="session-row" key={s.id}>
              <div>
                <strong>{s.current ? "This session" : "Other session"}</strong>
                <p>{s.device?.slice(0, 100)}</p>
                <small>Expires {date(s.expires_at)}</small>
              </div>
              {!s.current && (
                <Button
                  className="secondary"
                  onClick={async () => {
                    await api("/auth/sessions/" + s.id, { method: "DELETE" });
                    reload();
                  }}
                >
                  Revoke
                </Button>
              )}
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
const foraneCategories: Record<string, string> = activityCategories;
const isOffice = (session: Row) =>
  ["platform_admin", "archdiocese_admin", "forane_admin"].includes(
    session.user.role,
  );
const isArchdiocese = (session: Row) =>
  ["platform_admin", "archdiocese_admin"].includes(session.user.role);
function ParishProvisionForm({
  foranes,
  onClose,
  onSaved,
}: {
  foranes: Row[];
  onClose: () => void;
  onSaved: (r: Row) => void;
}) {
  const { session } = useApp();
  const [v, setV] = useState<Row>({ forane_id: session.user.forane_id || "" }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Add a parish and administrator" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            onSaved(await post("/platform/tenants", v));
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-body">
          <ErrorBox error={error} />
          <Field label="Assigned forane">
            <select
              required
              value={v.forane_id}
              onChange={(e) => setV({ ...v, forane_id: e.target.value })}
            >
              <option value="">Choose a forane</option>
              {foranes
                .filter((f) => f.status === "active")
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
          </Field>
          {!foranes.some((f) => f.status === "active") && (
            <p>
              Create an active forane in the Foranes module before adding a
              parish.
            </p>
          )}
          {[
            ["name", "Parish / church name", "text"],
            ["code", "Unique parish code (uppercase)", "text"],
            ["admin_name", "Administrator name", "text"],
            ["email", "Administrator email", "email"],
            [
              "password",
              "Initial password (at least 14 characters)",
              "password",
            ],
          ].map(([k, label, type]) => (
            <Field key={k} label={label}>
              <input
                required
                type={type}
                value={v[k] || ""}
                minLength={type === "password" ? 14 : undefined}
                autoComplete={type === "password" ? "new-password" : undefined}
                onChange={(e) => setV({ ...v, [k]: e.target.value })}
              />
            </Field>
          ))}
        </div>
        <div className="modal-actions">
          <Button type="button" className="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={busy} className="primary">
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function Foranes() {
  const { session } = useApp();
  const { data, error, reload } = useData("/foranes");
  const [selected, setSelected] = useState(""),
    [create, setCreate] = useState(false),
    [query, setQuery] = useState("");
  if (selected)
    return (
      <ForaneDashboard
        id={selected}
        onBack={() => {
          setSelected("");
          reload();
        }}
      />
    );
  return (
    <>
      <SectionHeading
        eyebrow="FORANE DIRECTORY"
        title="A bridge between communities."
        description="Foranes coordinate parish life within the archdiocese. Manage their churches, vicars, parish assignments and shared work."
        action={
          isArchdiocese(session) && (
            <Button className="primary" onClick={() => setCreate(true)}>
              <Plus size={17} />
              Add forane
            </Button>
          )
        }
      />
      <ErrorBox error={error} />
      <section className="hero-banner">
        <div>
          <span className="hero-kicker">ARCHDIOCESE / FORANE / PARISH</span>
          <h2>
            Many parishes.
            <br />
            <em>One shared purpose.</em>
          </h2>
          <p>
            {fmt(data?.items.length)} foranes / {fmt(data?.unassigned.length)}{" "}
            parishes awaiting assignment
          </p>
        </div>
        <ChurchIllustration />
      </section>
      {data && data.unassigned.length > 0 && (
        <div className="notice">
          <Info size={20} />
          <p>
            {data.unassigned.length} existing parishes need a confirmed forane.
            Assign them using the Forane selector in Parish directory. Existing
            records stay available to archdiocese and parish users.
          </p>
        </div>
      )}
      <Field label="Find a forane">
        <input
          type="search"
          placeholder="Search forane name or code"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </Field>
      <div className="forane-grid">
        {data?.items
          .filter((f: Row) =>
            (f.name + " " + f.code).toLowerCase().includes(query.toLowerCase()),
          )
          .map((f: Row) => (
            <article className="panel forane-card" key={f.id}>
              <div className="forane-card-heading">
                <span className="household-icon">
                  <Church size={26} />
                </span>
                <Badge status={f.status} />
              </div>
              <h2>{f.name}</h2>
              <p>{f.vicar_name || "Vicar not recorded"}</p>
              <p className="muted">{f.code}</p>
              <div className="forane-card-counts">
                <span>
                  <strong>{fmt(f.parish_count)}</strong> parishes
                </span>
                <span>
                  <strong>{fmt(f.open_activities)}</strong> open activities
                </span>
              </div>
              <Button className="secondary" onClick={() => setSelected(f.id)}>
                Open forane
              </Button>
            </article>
          ))}
      </div>
      {data && !data.items.length && (
        <Empty
          title="Begin with a forane"
          description="Create a forane, assign its parishes and provision its administrator."
          icon={Church}
        />
      )}
      {create && (
        <ForaneEditor
          archdioceses={data?.archdioceses || []}
          onClose={() => setCreate(false)}
          onSaved={() => {
            setCreate(false);
            reload();
          }}
        />
      )}
    </>
  );
}
function ForaneEditor({
  initial,
  parishes = [],
  archdioceses = [],
  onClose,
  onSaved,
}: {
  initial?: Row;
  parishes?: Row[];
  archdioceses?: Row[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [v, setV] = useState<Row>(
      initial || {
        name: "",
        code: "",
        vicar_name: "",
        contact_email: "",
        address: "",
        archdiocese_id: archdioceses[0]?.id || "",
        head_parish_id: "",
        status: "active",
      },
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={initial ? "Edit forane details" : "Create a forane"}
      subtitle="A forane church remains a parish and can be selected after it is assigned to this forane."
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const payload = {
              ...v,
              head_parish_id: v.head_parish_id || null,
              contact_email: v.contact_email || null,
            };
            if (initial) await patch("/foranes/" + initial.id, payload);
            else
              await post("/foranes", {
                ...payload,
                archdiocese_id: v.archdiocese_id || undefined,
              });
            onSaved();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-body">
          <ErrorBox error={error} />
          {!initial && archdioceses.length > 0 && (
            <Field label="Archdiocese">
              <select
                required
                value={v.archdiocese_id}
                onChange={(e) => setV({ ...v, archdiocese_id: e.target.value })}
              >
                {archdioceses.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {[
            ["name", "Forane name"],
            ["code", "Forane code (uppercase)"],
            ["vicar_name", "Forane vicar"],
            ["contact_email", "Office email"],
            ["address", "Office address"],
          ].map(([k, label]) => (
            <Field label={label} key={k}>
              <input
                required={["name", "code"].includes(k)}
                type={k === "contact_email" ? "email" : "text"}
                value={v[k] || ""}
                onChange={(e) => setV({ ...v, [k]: e.target.value })}
              />
            </Field>
          ))}
          {initial && (
            <>
              <Field label="Forane church (head parish)">
                <select
                  value={v.head_parish_id || ""}
                  onChange={(e) =>
                    setV({ ...v, head_parish_id: e.target.value })
                  }
                >
                  <option value="">Not yet designated</option>
                  {parishes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Office status">
                <select
                  value={v.status}
                  onChange={(e) => setV({ ...v, status: e.target.value })}
                >
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </Field>
              <p className="muted">
                Archiving preserves history and revokes forane logins. Parish
                accounts remain separate.
              </p>
            </>
          )}
        </div>
        <div className="modal-actions">
          <Button type="button" className="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button className="primary" busy={busy}>
            {initial ? "Save forane" : "Create forane"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function ForaneDashboard({ id, onBack }: { id?: string; onBack?: () => void }) {
  const { session, refresh, navigate } = useApp(),
    { data, error, reload, loading } = useData(
      id ? `/foranes/${id}/dashboard` : null,
    );
  const [edit, setEdit] = useState(false),
    [account, setAccount] = useState(false),
    [err, setErr] = useState(""),
    [reset, setReset] = useState<Row | null>(null),
    [activity, setActivity] = useState<string | null>(null);
  if (!id)
    return (
      <Empty
        title="Choose a forane"
        description="Open a forane from the Foranes directory."
      />
    );
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  const f = data.forane,
    c = data.counts;
  return (
    <>
      {onBack && (
        <Button className="secondary" onClick={onBack}>
          <ChevronLeft size={16} />
          All foranes
        </Button>
      )}
      <SectionHeading
        eyebrow="FORANE WORKSPACE"
        title={f.name}
        description={`Forane office / ${f.vicar_name || "Vicar not recorded"}`}
        action={
          isArchdiocese(session) && (
            <Button className="secondary" onClick={() => setEdit(true)}>
              Edit forane
            </Button>
          )
        }
      />
      <ErrorBox error={err} />
      <section className="hero-banner">
        <div>
          <span className="hero-kicker">FORANE WORKSPACE</span>
          <h2>
            Closer to every parish.
            <br />
            <em>Connected to the archdiocese.</em>
          </h2>
          <p>{f.contact_email || "Office contact not recorded"}</p>
        </div>
        <ChurchIllustration />
      </section>
      <div className="forane-metrics">
        {[
          ["Parishes", c.parishes],
          ["Units", c.units],
          ["Households", c.households],
          ["Members", c.members],
        ].map(([label, value]) => (
          <div className="panel forane-metric" key={label}>
            <span>{label}</span>
            <strong>{fmt(value)}</strong>
          </div>
        ))}
      </div>
      <div className="forane-work-grid">
        <section className="panel forane-section">
          <div className="forane-section-heading">
            <h2>Shared work, at a glance</h2>
            <Button
              className="secondary"
              onClick={() => navigate("Forane activities")}
            >
              View activities
            </Button>
          </div>
          <div className="forane-work-counts">
            <span>
              <strong>{c.open}</strong> open activities
            </span>
            <span>
              <strong>{c.awaiting_review}</strong> reports awaiting review
            </span>
            <span>
              <strong>{c.overdue}</strong> overdue activities
            </span>
            <span>
              <strong>{c.pending_reports}</strong> parish reports pending
            </span>
          </div>
          {data.upcoming.map((a: Row) => (
            <button
              className="forane-agenda"
              key={a.id}
              onClick={() => setActivity(a.id)}
            >
              <span>
                <strong>{a.title}</strong>
                <small>{foraneCategories[a.category]}</small>
              </span>
              <span>{a.due_on ? date(a.due_on) : "No due date"}</span>
            </button>
          ))}
          {!data.upcoming.length && (
            <p className="muted">
              No open activities. Create shared plans in Forane activities.
            </p>
          )}
        </section>
        <section className="panel forane-section">
          <h2>Forane church & office</h2>
          <p>
            <strong>Head parish:</strong>{" "}
            {data.parishes.find((p: Row) => p.id === f.head_parish_id)?.name ||
              "Not yet designated"}
          </p>
          <p>
            <strong>Vicar:</strong> {f.vicar_name || "Not recorded"}
          </p>
          <p>
            <strong>Office:</strong> {f.address || "Not recorded"}
          </p>
          <p>
            <Badge status={f.status} />
          </p>
          <p className="muted">
            Shared pastoral plans, catechesis, clergy meetings, parish visits,
            church care and stewardship are coordinated through this office.
          </p>
        </section>
      </div>
      <section className="panel">
        <div className="forane-section-heading forane-section">
          <h2>Parishes in this forane</h2>
          <span>{fmt(c.parishes)} parishes</span>
        </div>
        <div
          className="table-scroll"
          tabIndex={0}
          role="region"
          aria-label="Parishes in this forane"
        >
          <table>
            <thead>
              <tr>
                <th>PARISH</th>
                <th>UNITS</th>
                <th>HOUSEHOLDS</th>
                <th>MEMBERS</th>
                <th>ACCESS</th>
              </tr>
            </thead>
            <tbody>
              {data.parishes.map((p: Row) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.name}</strong>
                    <div className="muted">{p.code}</div>
                    {p.id === f.head_parish_id && <small>Forane church</small>}
                  </td>
                  <td>{fmt(p.units)}</td>
                  <td>{fmt(p.households)}</td>
                  <td>{fmt(p.members)}</td>
                  <td>
                    <Button
                      className="secondary"
                      onClick={() => {
                        setParish(p.id);
                        refresh();
                        navigate("Overview");
                      }}
                    >
                      Open parish
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.parishes.length && (
          <Empty
            title="No parishes assigned"
            description="Use Parish directory to assign parishes to this forane."
          />
        )}
      </section>
      {isArchdiocese(session) && (
        <section className="panel forane-section">
          <div className="forane-section-heading">
            <h2>Forane login accounts</h2>
            <Button className="secondary" onClick={() => setAccount(true)}>
              Add forane user
            </Button>
          </div>
          {data.users.map((u: Row) => (
            <div className="staff-reset" key={u.id}>
              <div>
                <strong>{u.name}</strong>
                <p>
                  {u.email} / {u.active ? "Active" : "Disabled"}
                </p>
              </div>
              <div className="forane-inline-actions">
                <Button className="secondary" onClick={() => setReset(u)}>
                  Reset password
                </Button>
                <Button
                  className="secondary"
                  onClick={async () => {
                    try {
                      await patch(`/foranes/${f.id}/users/${u.id}`, {
                        active: !u.active,
                      });
                      reload();
                    } catch (e: any) {
                      setErr(e.message);
                    }
                  }}
                >
                  {u.active ? "Disable" : "Enable"}
                </Button>
              </div>
            </div>
          ))}
        </section>
      )}
      <section className="panel forane-section">
        <details>
          <summary>Office change history</summary>
          {data.history.map((h: Row) => (
            <div className="forane-history" key={h.id}>
              <strong>{h.action.replaceAll(".", " ")}</strong>
              <p>
                {h.actor_name} / {date(h.created_at)}
              </p>
              <p>{h.reason}</p>
            </div>
          ))}
        </details>
      </section>
      {edit && (
        <ForaneEditor
          initial={f}
          parishes={data.parishes}
          onClose={() => setEdit(false)}
          onSaved={() => {
            setEdit(false);
            reload();
            refresh();
          }}
        />
      )}
      {account && (
        <SimpleForm
          title="Add forane administrator"
          path={`/foranes/${f.id}/users`}
          fields={[
            ["name", "Administrator name"],
            ["email", "Login email", "email"],
            [
              "password",
              "Initial password (at least 14 characters)",
              "password",
            ],
          ]}
          onClose={() => setAccount(false)}
          onSaved={() => {
            setAccount(false);
            reload();
          }}
        />
      )}
      {reset && (
        <ForanePasswordReset
          foraneId={f.id}
          user={reset}
          onClose={() => setReset(null)}
          onSaved={() => {
            setReset(null);
            reload();
          }}
        />
      )}
      {activity && (
        <ForaneActivityDetail
          id={activity}
          onClose={() => {
            setActivity(null);
            reload();
          }}
        />
      )}
    </>
  );
}
function ForanePasswordReset({
  foraneId,
  user,
  onClose,
  onSaved,
}: {
  foraneId: string;
  user: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Reset forane password"
      subtitle={user.email}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await patch(`/foranes/${foraneId}/users/${user.id}`, {
              active: user.active,
              password,
            });
            onSaved();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-body">
          <ErrorBox error={error} />
          <Field label="New password (at least 14 characters)">
            <input
              required
              type="password"
              minLength={14}
              maxLength={200}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <p>
            Existing sessions and unused password setup links will be revoked.
            Share the replacement password privately.
          </p>
        </div>
        <div className="modal-actions">
          <Button type="button" className="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={busy} className="primary">
            Reset password
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function ForaneActivities() {
  const { session } = useApp(),
    office = isOffice(session);
  const [page, setPage] = useState(1),
    [status, setStatus] = useState(""),
    [foraneId, setForaneId] = useState(session.user.forane_id || ""),
    [selected, setSelected] = useState<string | null>(null),
    [create, setCreate] = useState(false);
  const { data, error, reload } = useData(
      `/forane-activities?page=${page}&status=${status}${foraneId ? "&forane_id=" + foraneId : ""}`,
    ),
    { data: directory } = useData(office ? "/foranes" : null);
  return (
    <>
      <SectionHeading
        eyebrow="FORANE COORDINATION"
        title="Shared work. Faithful follow-through."
        description={
          office
            ? "Coordinate forane plans, parish visits, catechesis, clergy meetings and reports. Track each request through review and completion."
            : "Your parish's forane activities and reporting requests. Only your own parish responses are visible."
        }
        action={
          office && (
            <Button className="primary" onClick={() => setCreate(true)}>
              <Plus size={17} />
              Plan activity
            </Button>
          )
        }
      />
      <ErrorBox error={error} />
      <div className="toolbar forane-filters">
        {office && (
          <Field label="Filter by forane">
            <select
              value={foraneId}
              onChange={(e) => {
                setForaneId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All accessible foranes</option>
              {directory?.items.map((f: Row) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Activity status">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="planned">Planned</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </Field>
      </div>
      <div className="forane-grid">
        {data?.items.map((a: Row) => (
          <article className="panel forane-card" key={a.id}>
            <div className="forane-card-heading">
              <span className="eyebrow">{foraneCategories[a.category]}</span>
              <Badge status={a.status} />
            </div>
            <h2>{a.title}</h2>
            <p>
              {a.description.length > 180
                ? a.description.slice(0, 180) + "..."
                : a.description ||
                  "Open this activity for instructions and follow-up."}
            </p>
            <p className="muted">
              Scheduled: {a.scheduled_on ? date(a.scheduled_on) : "Not set"}
              <br />
              Due: {a.due_on ? date(a.due_on) : "Not set"}
            </p>
            <p>
              {office
                ? `${a.parish_count} parishes / ${a.submitted} reports awaiting review`
                : `Your report: ${a.response_status || "pending"}`}
            </p>
            <Button className="secondary" onClick={() => setSelected(a.id)}>
              View activity
            </Button>
          </article>
        ))}
      </div>
      {data && !data.items.length && (
        <Empty
          title="Room for shared purpose"
          description={
            office
              ? "Plan an activity and invite the parishes that need to take part."
              : "Your forane has not assigned any activities matching this filter."
          }
          icon={Clock}
        />
      )}
      <Pagination data={data} page={page} setPage={setPage} />
      {selected && (
        <ForaneActivityDetail
          id={selected}
          onClose={() => {
            setSelected(null);
            reload();
          }}
        />
      )}
      {create && (
        <ForaneActivityEditor
          foranes={directory?.items || []}
          defaultForane={foraneId}
          onClose={() => setCreate(false)}
          onSaved={() => {
            setCreate(false);
            reload();
          }}
        />
      )}
    </>
  );
}
function ForaneActivityEditor({
  initial,
  participants = [],
  foranes,
  defaultForane = "",
  onClose,
  onSaved,
}: {
  initial?: Row;
  participants?: Row[];
  foranes: Row[];
  defaultForane?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [v, setV] = useState<Row>(
      initial
        ? {
            ...initial,
            checklist: initial.checklist?.length
              ? initial.checklist
              : initialChecklist(initial.category),
            scheduled_on: initial.scheduled_on?.slice(0, 10) || "",
            due_on: initial.due_on?.slice(0, 10) || "",
            parish_ids: participants
              .filter((p) => !p.withdrawn_at)
              .map((p) => p.tenant_id),
          }
        : {
            forane_id:
              defaultForane ||
              foranes.find((f) => f.status === "active")?.id ||
              "",
            category: "pastoral",
            title: "",
            description: "",
            parish_ids: [],
            status: "planned",
          },
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const { data: scope, error: scopeError } = useData(
    v.forane_id ? `/foranes/${v.forane_id}/dashboard` : null,
  );
  return (
    <Modal
      title={initial ? "Edit forane activity" : "Plan a forane activity"}
      subtitle="Share instructions with participating parishes. Minutes and office follow-up remain visible to oversight users."
      onClose={onClose}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const payload = {
              ...v,
              scheduled_on: v.scheduled_on || null,
              due_on: v.due_on || null,
            };
            if (initial)
              await patch("/forane-activities/" + initial.id, payload);
            else await post("/forane-activities", payload);
            onSaved();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="modal-body">
          <ErrorBox error={error || scopeError} />
          <div className="forane-form-grid">
            <Field label="Activity forane">
              <select
                required
                disabled={Boolean(initial)}
                value={v.forane_id}
                onChange={(e) =>
                  setV({ ...v, forane_id: e.target.value, parish_ids: [] })
                }
              >
                <option value="">Choose a forane</option>
                {foranes
                  .filter((f) => f.status === "active" || f.id === v.forane_id)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Activity category">
              <select
                value={v.category}
                onChange={(e) =>
                  setV({
                    ...v,
                    category: e.target.value,
                    checklist: initialChecklist(e.target.value),
                    parish_ids:
                      e.target.value === "clergy_care" ? [] : v.parish_ids,
                  })
                }
              >
                {Object.entries(foraneCategories).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Activity title">
            <input
              required
              maxLength={300}
              value={v.title}
              onChange={(e) => setV({ ...v, title: e.target.value })}
            />
          </Field>
          <Field label="Instructions for participating parishes">
            <textarea
              rows={4}
              maxLength={12000}
              value={v.description}
              onChange={(e) => setV({ ...v, description: e.target.value })}
            />
          </Field>
          <div className="forane-form-grid">
            {[
              ["coordinator", "Coordinator"],
              ["venue", "Venue"],
              ["scheduled_on", "Scheduled date"],
              ["due_on", "Report due date"],
            ].map(([k, label]) => (
              <Field key={k} label={label}>
                <input
                  type={k.endsWith("_on") ? "date" : "text"}
                  value={v[k] || ""}
                  onChange={(e) => setV({ ...v, [k]: e.target.value })}
                />
              </Field>
            ))}
          </div>
          {v.category === "delegated_request" && (
            <Field
              label="Delegated authority / approval reference"
              hint="Record the competent authority's reference. This log does not issue a dispensation or appointment."
            >
              <input
                required
                maxLength={2000}
                value={v.authority_reference || ""}
                onChange={(e) =>
                  setV({ ...v, authority_reference: e.target.value })
                }
              />
            </Field>
          )}
          <fieldset
            className="forane-participants"
            disabled={v.category === "clergy_care"}
          >
            <legend>Participating parishes</legend>
            {v.category === "clergy_care" ? (
              <p>Clergy support coordination is restricted to the office.</p>
            ) : (
              <>
                {scope?.parishes
                  .filter((p: Row) => p.status !== "archived")
                  .map((p: Row) => (
                    <label className="checkbox" key={p.id}>
                      <input
                        type="checkbox"
                        checked={v.parish_ids.includes(p.id)}
                        onChange={(e) =>
                          setV({
                            ...v,
                            parish_ids: e.target.checked
                              ? [...v.parish_ids, p.id]
                              : v.parish_ids.filter(
                                  (id: string) => id !== p.id,
                                ),
                          })
                        }
                      />
                      {p.name}
                    </label>
                  ))}
                {scope && !scope.parishes.length && (
                  <p>No parishes are assigned to this forane yet.</p>
                )}
              </>
            )}
          </fieldset>
          {(v.checklist || []).length > 0 && (
            <fieldset className="forane-checklist">
              <legend>Visitation & stewardship observations</legend>
              {v.checklist.map((item: Row, index: number) => (
                <div className="forane-checklist-item" key={item.key}>
                  <Field
                    label={
                      observationLabels[
                        item.key as keyof typeof observationLabels
                      ]
                    }
                  >
                    <select
                      value={item.status}
                      onChange={(e) =>
                        setV({
                          ...v,
                          checklist: v.checklist.map((r: Row, i: number) =>
                            i === index ? { ...r, status: e.target.value } : r,
                          ),
                        })
                      }
                    >
                      <option value="pending">Not yet reviewed</option>
                      <option value="satisfactory">Satisfactory</option>
                      <option value="follow_up">Follow-up required</option>
                      <option value="not_applicable">Not applicable</option>
                    </select>
                  </Field>
                  <Field
                    label={
                      "Observation note: " +
                      observationLabels[
                        item.key as keyof typeof observationLabels
                      ]
                    }
                  >
                    <input
                      required={item.status === "follow_up"}
                      maxLength={2000}
                      value={item.note}
                      onChange={(e) =>
                        setV({
                          ...v,
                          checklist: v.checklist.map((r: Row, i: number) =>
                            i === index ? { ...r, note: e.target.value } : r,
                          ),
                        })
                      }
                    />
                  </Field>
                </div>
              ))}
            </fieldset>
          )}
          <Field label="Office minutes / outcome">
            <textarea
              rows={4}
              required={v.status === "completed"}
              maxLength={16000}
              value={v.minutes || ""}
              onChange={(e) => setV({ ...v, minutes: e.target.value })}
            />
          </Field>
          <Field label="Office action items / follow-up">
            <textarea
              rows={3}
              maxLength={12000}
              value={v.action_items || ""}
              onChange={(e) => setV({ ...v, action_items: e.target.value })}
            />
          </Field>
          {initial && (
            <Field label="Activity progress">
              <select
                value={v.status}
                onChange={(e) => setV({ ...v, status: e.target.value })}
              >
                <option value="planned">Planned</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </Field>
          )}
          <p className="muted">
            To complete an activity, record its outcome and review all
            participating parish reports. Closed activities are preserved;
            create a new activity for follow-up.
          </p>
        </div>
        <div className="modal-actions">
          <Button type="button" className="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button busy={busy} className="primary">
            {initial ? "Save activity" : "Create activity"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function ForaneActivityDetail({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const { session, can } = useApp(),
    office = isOffice(session),
    { data, error, reload, loading } = useData("/forane-activities/" + id),
    { data: directory } = useData(office ? "/foranes" : null);
  const [edit, setEdit] = useState(false);
  if (loading)
    return (
      <Modal title="Activity details" onClose={onClose}>
        <Loading />
      </Modal>
    );
  if (error || !data)
    return (
      <Modal title="Activity details" onClose={onClose}>
        <div className="modal-body">
          <ErrorBox error={error} />
        </div>
      </Modal>
    );
  const a = data.activity,
    closed = ["completed", "cancelled"].includes(a.status);
  if (edit)
    return (
      <ForaneActivityEditor
        initial={a}
        participants={data.participants}
        foranes={directory?.items || []}
        onClose={() => setEdit(false)}
        onSaved={() => {
          setEdit(false);
          reload();
        }}
      />
    );
  return (
    <Modal
      title={a.title}
      subtitle={foraneCategories[a.category]}
      onClose={onClose}
      wide
    >
      <div className="modal-body">
        <div className="forane-section-heading">
          <Badge status={a.status} />
          {office && !closed && a.office_status !== "archived" && (
            <Button className="secondary" onClick={() => setEdit(true)}>
              Edit activity
            </Button>
          )}
        </div>
        {a.office_status === "archived" && (
          <div className="notice">
            <Info size={18} />
            <p>
              This forane is archived. Activity history remains available;
              submissions and changes are closed.
            </p>
          </div>
        )}
        <p className="forane-preserve-lines">
          {a.description || "No shared instructions recorded."}
        </p>
        <dl className="detail-grid">
          <div>
            <dt>Scheduled</dt>
            <dd>{a.scheduled_on ? date(a.scheduled_on) : "Not set"}</dd>
          </div>
          <div>
            <dt>Report due</dt>
            <dd>{a.due_on ? date(a.due_on) : "Not set"}</dd>
          </div>
          <div>
            <dt>Coordinator</dt>
            <dd>{a.coordinator || "Not recorded"}</dd>
          </div>
          <div>
            <dt>Venue</dt>
            <dd>{a.venue || "Not recorded"}</dd>
          </div>
        </dl>
        {office && (
          <>
            {a.checklist?.length > 0 && (
              <>
                <h3>Visitation & stewardship observations</h3>
                {a.checklist.map((item: Row) => (
                  <div className="forane-history" key={item.key}>
                    <strong>
                      {
                        observationLabels[
                          item.key as keyof typeof observationLabels
                        ]
                      }
                    </strong>
                    <p>{item.status.replaceAll("_", " ")}</p>
                    {item.note && <p>{item.note}</p>}
                  </div>
                ))}
              </>
            )}
            <h3>Office minutes / outcome</h3>
            <p className="forane-preserve-lines">
              {a.minutes || "No minutes recorded yet."}
            </p>
            <h3>Action items / follow-up</h3>
            <p className="forane-preserve-lines">
              {a.action_items || "No follow-up recorded yet."}
            </p>
            {a.authority_reference && (
              <p>
                <strong>Authority reference:</strong> {a.authority_reference}
              </p>
            )}
            <h3>Parish reports</h3>
            {!data.participants.length && (
              <p>This is an office-only activity.</p>
            )}
          </>
        )}
        {data.participants.map((p: Row) =>
          office ? (
            <ForaneResponseReview
              key={p.tenant_id + ":" + p.revision}
              activityId={id}
              row={p}
              closed={closed}
              onSaved={reload}
            />
          ) : (
            <ParishActivityReport
              key={p.revision}
              activityId={id}
              row={p}
              editable={
                can("members.update") &&
                !closed &&
                a.office_status !== "archived"
              }
              onSaved={reload}
            />
          ),
        )}
        {office && (
          <details className="forane-history">
            <summary>Activity change history</summary>
            {data.history.map((h: Row) => (
              <div key={h.id}>
                <p>
                  <strong>{h.action.replaceAll(".", " ")}</strong> /{" "}
                  {h.actor_name} / {date(h.created_at)}
                </p>
                <p>{h.reason}</p>
              </div>
            ))}
          </details>
        )}
      </div>
      <div className="modal-actions">
        <Button className="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
}
function ParishActivityReport({
  activityId,
  row,
  editable,
  onSaved,
}: {
  activityId: string;
  row: Row;
  editable: boolean;
  onSaved: () => void;
}) {
  const [report, setReport] = useState(row.report || ""),
    [attendance, setAttendance] = useState(row.attendance || 0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="forane-response">
      <h3>Your parish report</h3>
      <p>
        <Badge
          status={row.status}
          label={row.status === "reviewed" ? "Reviewed" : undefined}
        />
      </p>
      {row.review_note && (
        <div className="notice">
          <p>{row.review_note}</p>
        </div>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await patch(`/forane-activities/${activityId}/report`, {
              report,
              attendance: Number(attendance),
              revision: row.revision,
            });
            onSaved();
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <ErrorBox error={error} />
        <fieldset disabled={!editable || row.status === "reviewed"}>
          <Field label="Attendance / participants count">
            <input
              type="number"
              required
              min={0}
              max={1000000}
              value={attendance}
              onChange={(e) => setAttendance(Number(e.target.value))}
            />
          </Field>
          <Field label="Parish report / follow-up">
            <textarea
              required
              rows={5}
              maxLength={12000}
              value={report}
              onChange={(e) => setReport(e.target.value)}
            />
          </Field>
          {editable && row.status !== "reviewed" && (
            <Button busy={busy} className="primary">
              Submit parish report
            </Button>
          )}
        </fieldset>
      </form>
    </section>
  );
}
function ForaneResponseReview({
  activityId,
  row,
  closed,
  onSaved,
}: {
  activityId: string;
  row: Row;
  closed: boolean;
  onSaved: () => void;
}) {
  const [note, setNote] = useState(row.review_note || ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function review(status: string) {
    setBusy(true);
    try {
      await patch(
        `/forane-activities/${activityId}/responses/${row.tenant_id}`,
        { status, review_note: note, revision: row.revision },
      );
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="forane-response">
      <div className="forane-section-heading">
        <h4>{row.parish_name}</h4>
        <Badge
          status={row.withdrawn_at ? "withdrawn" : row.status}
          label={
            !row.withdrawn_at && row.status === "reviewed"
              ? "Reviewed"
              : undefined
          }
        />
      </div>
      <p>Attendance: {fmt(row.attendance)}</p>
      <p className="forane-preserve-lines">
        {row.report || "No report submitted yet."}
      </p>
      <ErrorBox error={error} />
      {!closed &&
        !row.withdrawn_at &&
        ["submitted", "reviewed"].includes(row.status) && (
          <>
            <Field label={"Review note for " + row.parish_name}>
              <textarea
                value={note}
                maxLength={4000}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Explain any changes required"
              />
            </Field>
            <div className="forane-inline-actions">
              <Button
                busy={busy}
                className="secondary"
                onClick={() => review("returned")}
              >
                Return for revision
              </Button>
              {row.status === "submitted" && (
                <Button
                  busy={busy}
                  className="primary"
                  onClick={() => review("reviewed")}
                >
                  Mark reviewed
                </Button>
              )}
            </div>
          </>
        )}
    </section>
  );
}
function OversightBanner() {
  const { session } = useApp();
  const [reason, setReason] = useState("");
  useEffect(() => {
    setChangeReason(reason);
  }, [reason]);
  return (
    <section className="oversight-banner" aria-label="Central oversight">
      <ShieldCheck size={22} />
      <div>
        <strong>
          {session.tenant
            ? "Managing: " + session.tenant.name
            : session.user.role === "forane_admin"
              ? "Forane oversight"
              : "Archdiocese oversight"}
        </strong>
        <p>
          Central changes are audited. Parish staff and configured contacts
          receive warning alerts.
        </p>
      </div>
      <Field label="Reason for changes">
        <input
          value={reason}
          maxLength={2000}
          placeholder="Explain the purpose before saving"
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
    </section>
  );
}
function Platform() {
  const { session, refresh, navigate } = useApp();
  const [page, setPage] = useState(1),
    [query, setQuery] = useState("");
  const { data, error, reload } = useData(
    `/archdiocese/overview?page=${page}&q=${encodeURIComponent(query)}`,
  );
  const { data: foraneDirectory, reload: reloadForanes } = useData("/foranes");
  const [create, setCreate] = useState(false),
    [err, setErr] = useState(""),
    [result, setResult] = useState<Row | null>(null);
  return (
    <>
      <SectionHeading
        title={
          session.user.role === "forane_admin"
            ? "Your forane. Every parish."
            : "One archdiocese. Every community."
        }
        description="Oversee parishes, units, households and members. Open a parish to manage its complete workspace."
        action={
          <Button className="primary" onClick={() => setCreate(true)}>
            <Plus size={17} />
            Add parish
          </Button>
        }
      />
      <ErrorBox error={error || err} />
      <section className="hero-banner">
        <div>
          <span className="hero-kicker">
            ARCHDIOCESE / FORANE / PARISH / UNIT / HOUSEHOLD / MEMBER
          </span>
          <h2>
            Connected in faith.
            <br />
            <em>Accountable in care.</em>
          </h2>
          <p>
            {fmt(data?.total)} parishes in your directory. Each parish login can
            access only its own records.
          </p>
        </div>
        <ChurchIllustration />
      </section>
      <div className="toolbar">
        <Field label="Find a parish">
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search name or parish code"
          />
        </Field>
      </div>
      <section className="panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>PARISH</th>
                <th>FORANE</th>
                <th>UNITS</th>
                <th>HOUSEHOLDS</th>
                <th>MEMBERS</th>
                <th>STATUS</th>
                <th>WORKSPACE</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((t: Row) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.name}</strong>
                    <div className="muted">
                      {t.code} / {t.staff} staff
                    </div>
                    {(t.unassigned_households > 0 ||
                      t.unassigned_members > 0) && (
                      <small>
                        {t.unassigned_households} households /{" "}
                        {t.unassigned_members} members need assignment
                      </small>
                    )}
                  </td>
                  <td>
                    {session.user.role === "forane_admin" ? (
                      session.forane?.name
                    ) : (
                      <select
                        aria-label={"Forane of " + t.name}
                        value={t.forane_id || ""}
                        onChange={async (e) => {
                          if (!e.target.value) return;
                          try {
                            await patch(
                              `/foranes/${e.target.value}/parishes/${t.id}`,
                              { previous_forane_id: t.forane_id },
                            );
                            reload();
                            reloadForanes();
                          } catch (e: any) {
                            setErr(e.message);
                          }
                        }}
                      >
                        <option value="" disabled>
                          Assignment required
                        </option>
                        {foraneDirectory?.items
                          .filter(
                            (f: Row) =>
                              f.archdiocese_id === t.archdiocese_id &&
                              f.status === "active",
                          )
                          .map((f: Row) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                      </select>
                    )}
                  </td>
                  <td>{fmt(t.units)}</td>
                  <td>{fmt(t.households)}</td>
                  <td>{fmt(t.members)}</td>
                  <td>
                    <select
                      aria-label={"Status of " + t.name}
                      value={t.status}
                      onChange={async (e) => {
                        try {
                          await patch("/platform/tenants/" + t.id, {
                            status: e.target.value,
                          });
                          reload();
                        } catch (e: any) {
                          setErr(e.message);
                        }
                      }}
                    >
                      {["trial", "active", "suspended", "archived"].map(
                        (status) => (
                          <option key={status}>{status}</option>
                        ),
                      )}
                    </select>
                  </td>
                  <td>
                    <Button
                      className="secondary"
                      onClick={() => {
                        setParish(t.id);
                        refresh();
                        navigate("Overview");
                      }}
                    >
                      Open parish
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && !data.items.length && (
          <Empty
            title="No parishes found"
            description="Add a parish to establish its secure workspace."
          />
        )}
        <Pagination data={data} page={page} setPage={setPage} />
      </section>
      {session.user.role === "platform_admin" && <CentralAccounts />}
      {create && (
        <ParishProvisionForm
          foranes={foraneDirectory?.items || []}
          onClose={() => setCreate(false)}
          onSaved={(r) => {
            setCreate(false);
            reload();
            setResult(r);
          }}
        />
      )}
      {result && (
        <Modal title="Parish is ready" onClose={() => setResult(null)}>
          <div className="modal-body">
            <p>
              The administrator can sign in at this site's login page using the
              email and initial password you entered. Share these privately. The
              parish sees only its own units, households and members.
            </p>
            <p>
              A single-use password setup invitation was also queued for email
              delivery.
            </p>
            {result.setup_url && (
              <Field label="Development setup link">
                <textarea readOnly value={result.setup_url} />
              </Field>
            )}
            <Button
              className="primary"
              onClick={() => {
                setParish(result.id);
                setResult(null);
                refresh();
                navigate("Overview");
              }}
            >
              Open parish workspace
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
function CentralAccounts() {
  const { data, error, reload } = useData("/archdiocese/users");
  const [create, setCreate] = useState(false),
    [err, setErr] = useState("");
  return (
    <section className="panel central-accounts">
      <SectionHeading
        title="Archdiocese access"
        description="Archdiocese administrators oversee the parishes assigned to their archdiocese."
        action={
          <Button className="secondary" onClick={() => setCreate(true)}>
            Add archdiocese user
          </Button>
        }
      />
      <ErrorBox error={error || err} />
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>NAME</th>
              <th>LOGIN EMAIL</th>
              <th>ROLE</th>
              <th>ACCESS</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((u: Row) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.role.replaceAll("_", " ")}</td>
                <td>
                  {u.role === "archdiocese_admin" ? (
                    <Button
                      className="secondary"
                      onClick={async () => {
                        try {
                          await patch("/archdiocese/users/" + u.id, {
                            active: !u.active,
                          });
                          reload();
                        } catch (e: any) {
                          setErr(e.message);
                        }
                      }}
                    >
                      {u.active ? "Disable" : "Enable"}
                    </Button>
                  ) : (
                    "Super administrator"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {create && (
        <SimpleForm
          title="Add archdiocese administrator"
          path="/archdiocese/users"
          defaults={{ archdiocese_id: data?.archdioceses?.[0]?.id }}
          fields={[
            ["name", "Full name"],
            ["email", "Login email", "email"],
            [
              "password",
              "Initial password (at least 14 characters)",
              "password",
            ],
          ]}
          onClose={() => setCreate(false)}
          onSaved={() => {
            setCreate(false);
            reload();
          }}
        />
      )}
    </section>
  );
}
function Alerts() {
  const [page, setPage] = useState(1),
    [err, setErr] = useState("");
  const { data, error, reload } = useData("/alerts?page=" + page);
  return (
    <>
      <SectionHeading
        title="Changes, with accountability."
        description="Warning alerts for this parish. Email delivery requires configured contacts and a running mail worker."
      />
      <ErrorBox error={error || err} />
      <div className="alert-list">
        {data?.items.map((a: Row) => (
          <article
            className={"panel alert-card " + (!a.read_at ? "unread" : "")}
            key={a.id}
          >
            <div>
              <Bell size={20} />
              <strong>{a.action.replaceAll(".", " ")}</strong>
              <span className="muted">{date(a.created_at)}</span>
            </div>
            <p>{a.message}</p>
            <p>
              <strong>Recorded by:</strong> {a.actor_name}
            </p>
            {a.reason && (
              <p>
                <strong>Reason:</strong> {a.reason}
              </p>
            )}
            <p className="muted">
              Email: {a.delivered_count} / {a.email_count} delivered /{" "}
              {a.failed_count} failed /{" "}
              {a.email_count - a.delivered_count - a.failed_count} pending
            </p>
            {!a.read_at && (
              <Button
                className="secondary"
                onClick={async () => {
                  try {
                    await post("/alerts/" + a.id + "/read", {});
                    reload();
                  } catch (e: any) {
                    setErr(e.message);
                  }
                }}
              >
                Mark as read
              </Button>
            )}
          </article>
        ))}
      </div>
      {data && !data.items.length && (
        <Empty
          title="No warning alerts yet"
          description="Changes to parish details, units, households and members will appear here."
          icon={Bell}
        />
      )}
      <Pagination data={data} page={page} setPage={setPage} />
    </>
  );
}
function RecordManagement() {
  const [kind, setKind] = useState("units"),
    [page, setPage] = useState(1),
    [q, setQ] = useState(""),
    [selected, setSelected] = useState<Row | null>(null),
    [email, setEmail] = useState(""),
    [reason, setReason] = useState(""),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(false);
  const { session } = useApp();
  const { data, error, reload } = useData(
    `/${kind}?page=${page}&q=${encodeURIComponent(q)}`,
  );
  return (
    <>
      <SectionHeading
        title="Care for your community."
        description="Manage alert contacts and remove unlinked records. Edit parish details in Administration, units and households in Households, and members in Members."
      />
      <ErrorBox error={error || err} />
      <div className="toolbar">
        <Field label="Record type">
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(1);
              setQ("");
            }}
          >
            <option value="units">Units</option>
            <option value="households">Households</option>
            <option value="persons">Members</option>
          </select>
        </Field>
        {kind !== "units" && (
          <Field label="Search records">
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </Field>
        )}
      </div>
      <section className="panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>NAME</th>
                <th>DETAILS</th>
                <th>MANAGE</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((r: Row) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>
                    {r.authority_email ||
                      r.alert_email ||
                      r.membership_no ||
                      "No alert email configured"}
                  </td>
                  <td>
                    <Button
                      className="secondary"
                      onClick={() => {
                        setSelected(r);
                        setEmail(r.authority_email || r.alert_email || "");
                        setReason("");
                        setErr("");
                      }}
                    >
                      Manage record
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination data={data} page={page} setPage={setPage} />
      </section>
      {session.user.role !== "admin" &&
        ["platform_admin", "archdiocese_admin", "forane_admin"].includes(
          session.user.role,
        ) && <ParishStaffReset />}
      {selected && (
        <Modal
          title={selected.name}
          subtitle="Contact and deletion controls"
          onClose={() => setSelected(null)}
        >
          <div className="modal-body">
            <ErrorBox error={err} />
            {kind !== "persons" && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  try {
                    await patch(
                      `/contacts/${kind === "units" ? "unit" : "household"}/${selected.id}`,
                      { email },
                    );
                    setSelected(null);
                    reload();
                  } catch (e: any) {
                    setErr(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Field
                  label={
                    kind === "units"
                      ? "Unit authority email"
                      : "Household warning email"
                  }
                >
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Button busy={busy} className="primary">
                  Save alert contact
                </Button>
              </form>
            )}
            <div className="notice">
              <p>
                Deletion is permanent. Linked records and official history
                prevent deletion. Reassign children first, or mark a member
                inactive in their profile. Parish records are archived using the
                parish directory status control.
              </p>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await api(`/${kind}/${selected.id}`, {
                    method: "DELETE",
                    body: JSON.stringify({ reason }),
                  });
                  setSelected(null);
                  reload();
                } catch (e: any) {
                  setErr(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field label="Reason for permanent deletion">
                <textarea
                  required
                  minLength={5}
                  maxLength={2000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
              <Button busy={busy} className="secondary">
                Delete record and alert contacts
              </Button>
            </form>
          </div>
        </Modal>
      )}
    </>
  );
}
function ParishStaffReset() {
  const { data, error } = useData("/users");
  const [message, setMessage] = useState("");
  return (
    <section className="panel central-accounts">
      <h2>Parish login recovery</h2>
      <p>
        Send a single-use password reset email and revoke existing sessions.
      </p>
      <ErrorBox error={error} />
      {message && <p role="status">{message}</p>}
      {data?.items.map((u: Row) => (
        <div className="staff-reset" key={u.id}>
          <span>
            {u.name} / {u.email}
          </span>
          <Button
            className="secondary"
            onClick={async () => {
              try {
                await post("/parish-admin/reset", { id: u.id });
                setMessage("Password reset queued for " + u.email);
              } catch (e: any) {
                setMessage(e.message);
              }
            }}
          >
            Send password reset
          </Button>
        </div>
      ))}
    </section>
  );
}
function GlobalSearch({
  onClose,
  onEntry,
}: {
  onClose: () => void;
  onEntry: (id: string) => void;
}) {
  const [q, setQ] = useState(""),
    [term, setTerm] = useState("");
  const { navigate } = useApp();
  useEffect(() => {
    const t = setTimeout(() => setTerm(q), 200);
    return () => clearTimeout(t);
  }, [q]);
  const { data, error, loading } = useData(
    "/search?q=" + encodeURIComponent(term),
  );
  return (
    <Modal
      title="Find a connection"
      subtitle="Search people, register references, dates and archive files."
      onClose={onClose}
    >
      <div className="modal-body">
        <div className="input-icon large">
          <Search size={20} />
          <input
            autoFocus
            placeholder="Start with a name or reference…"
            aria-label="Global search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <ErrorBox error={error} />
        {q.length < 2 ? (
          <p className="search-help">
            Type at least two characters. Results stay within your parish and
            permissions.
          </p>
        ) : loading ? (
          <Loading />
        ) : data?.items.length ? (
          <div className="search-results">
            {data.items.map((r: Row) => (
              <button
                key={r.type + r.id}
                onClick={() => {
                  if (r.type === "entry") onEntry(r.id);
                  else {
                    navigate(
                      r.type === "person" ? "Members" : "Digital archive",
                    );
                    onClose();
                  }
                }}
              >
                {r.type === "person" ? (
                  <Users size={20} />
                ) : r.type === "entry" ? (
                  <BookOpen size={20} />
                ) : (
                  <Archive size={20} />
                )}
                <span>
                  <strong>{r.title}</strong>
                  <small>{r.subtitle}</small>
                </span>
                <ChevronRight size={17} />
              </button>
            ))}
          </div>
        ) : (
          <Empty
            title="No matching records"
            description="Try another spelling, a register number or a year."
            icon={Search}
          />
        )}
      </div>
    </Modal>
  );
}
function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [otp, setOtp] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [mode, setMode] = useState(
      new URLSearchParams(location.search).has("token") ? "setup" : "login",
    ),
    [message, setMessage] = useState("");
  return (
    <div className="login-page">
      <section className="login-story">
        <Brand />
        <div>
          <span className="hero-kicker">
            A LIVING ARCHIVE. A LASTING LEGACY.
          </span>
          <h1>
            Some stories
            <br />
            deserve to be
            <br />
            <em>kept forever.</em>
          </h1>
          <p>
            A considered home for the records, people and history of your
            parish.
          </p>
          <ChurchIllustration />
        </div>
        <span className="login-foot">
          <ShieldCheck size={17} />
          Private by design. Preserved with care.
        </span>
      </section>
      <section className="login-form-area">
        <div className="mobile-brand">
          <Brand />
        </div>
        <div className="login-form">
          <p className="eyebrow">WELCOME TO VESTRY</p>
          <h2>
            {mode === "setup"
              ? "A secure beginning."
              : mode === "forgot"
                ? "Let’s get you back in."
                : "Your parish awaits."}
          </h2>
          <p>
            {mode === "setup"
              ? "Choose a strong password for your account."
              : mode === "forgot"
                ? "Enter your staff email to request a password setup link."
                : "Sign in to your church records workspace."}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                if (mode === "setup") {
                  await post("/auth/accept", {
                    token: new URLSearchParams(location.search).get("token"),
                    password,
                  });
                  history.replaceState(null, "", "/");
                  setMode("login");
                  setMessage("Password saved. Sign in to continue.");
                } else if (mode === "forgot") {
                  const r = await post("/auth/forgot", { email });
                  setMessage(r.message);
                } else {
                  await post("/auth/login", {
                    email,
                    password,
                    ...(otp ? { otp } : {}),
                  });
                  onLogin();
                }
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <ErrorBox error={error} />
            {message && <div className="notice success">{message}</div>}
            {mode !== "setup" && (
              <Field label="Email address">
                <div className="input-icon">
                  <Mail size={18} />
                  <input
                    autoComplete="username"
                    type="email"
                    required
                    placeholder="you@yourparish.org"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </Field>
            )}
            {mode !== "forgot" && (
              <Field
                label={
                  mode === "setup"
                    ? "New password (14 characters minimum)"
                    : "Password"
                }
              >
                <div className="input-icon">
                  <LockKeyhole size={18} />
                  <input
                    type="password"
                    minLength={mode === "setup" ? 14 : 1}
                    maxLength={256}
                    required
                    autoComplete={
                      mode === "setup" ? "new-password" : "current-password"
                    }
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </Field>
            )}
            {mode === "login" && (
              <Field label="Authenticator code (if enabled)">
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="Six-digit code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                />
              </Field>
            )}
            <Button busy={busy} className="primary full">
              {mode === "setup"
                ? "Set password"
                : mode === "forgot"
                  ? "Request password link"
                  : "Sign in to workspace"}
              <LockKeyhole size={16} />
            </Button>
          </form>
          <button
            className="text-button forgot-link"
            onClick={() => {
              setMode(mode === "login" ? "forgot" : "login");
              setError("");
              setMessage("");
            }}
          >
            {mode === "login" ? "Forgot your password?" : "Back to sign in"}
          </button>
          <div className="login-security">
            <ShieldCheck size={21} />
            <p>
              Access is by invitation from your church administrator.
              <br />
              Your parish records are never publicly accessible.
            </p>
          </div>
        </div>
        <p className="login-copyright">
          Vestry · Church records, faithfully preserved.
        </p>
      </section>
    </div>
  );
}
function ReviewJobLoader({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, error } = useData("/jobs/" + id);
  return data ? (
    <ReviewJob job={data} onClose={onClose} />
  ) : (
    <Modal title="Loading source & transcription" onClose={onClose}>
      <div className="modal-body">
        {error ? <ErrorBox error={error} /> : <Loading />}
      </div>
    </Modal>
  );
}
function PermissionEditor({
  user,
  onClose,
  onSaved,
}: {
  user: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { data, error } = useData("/roles");
  const [grants, setGrants] = useState<string[]>(user.permissions || []),
    [denials, setDenials] = useState<string[]>(user.denied_permissions || []),
    [err, setErr] = useState("");
  const defaults: string[] = data?.roles[user.role] || [];
  const all: string[] = [
    ...new Set(Object.values(data?.roles || {}).flat() as string[]),
  ].sort();
  return (
    <Modal
      title={"Permissions · " + user.name}
      subtitle="Role defaults can be restricted or extended for this staff member."
      onClose={onClose}
      wide
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await patch("/users/" + user.id, {
              role: user.role,
              active: user.active,
              permissions: grants,
              denied_permissions: denials,
            });
            onSaved();
          } catch (e: any) {
            setErr(e.message);
          }
        }}
      >
        <div className="modal-body">
          <ErrorBox error={error || err} />
          <div className="notice">
            <ShieldCheck size={18} />
            Deny overrides a role default or additional grant. Saving revokes
            existing sessions.
          </div>
          <div className="permission-grid">
            {all.map((p) => {
              const enabled =
                !denials.includes(p) &&
                (defaults.includes(p) || grants.includes(p));
              return (
                <label className="checkbox" key={p}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setDenials((v) => v.filter((x) => x !== p));
                        if (!defaults.includes(p))
                          setGrants((v) => [...new Set([...v, p])]);
                      } else {
                        setGrants((v) => v.filter((x) => x !== p));
                        setDenials((v) => [...new Set([...v, p])]);
                      }
                    }}
                  />
                  <span>
                    {p.replaceAll(".", " · ")}
                    {defaults.includes(p) && (
                      <small className="block">Role default</small>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
        <div className="modal-actions">
          <Button className="primary">Save permissions</Button>
        </div>
      </form>
    </Modal>
  );
}
function DuplicateSuggestions({ name }: { name: string }) {
  const [term, setTerm] = useState(name);
  useEffect(() => {
    const t = setTimeout(() => setTerm(name), 350);
    return () => clearTimeout(t);
  }, [name]);
  const { data } = useData("/duplicates?name=" + encodeURIComponent(term));
  return data?.items.length ? (
    <div className="notice">
      <Users size={19} />
      <div>
        <strong>Possible existing profiles — review before adding</strong>
        {data.items.map((p: Row) => (
          <p key={p.id}>
            {p.name} · {p.membership_no} {p.birth_date && " · " + p.birth_date}
          </p>
        ))}
      </div>
    </div>
  ) : null;
}
function PersonHistory({ person }: { person: Row }) {
  const { data, error, reload } = useData("/persons/" + person.id + "/profile"),
    { data: members } = useData("/persons?limit=100"),
    { can, notify } = useApp();
  const [mode, setMode] = useState(""),
    [v, setV] = useState<Row>({
      event: "joined",
      effective_date: new Date().toISOString().slice(0, 10),
      relationship: "parent",
    }),
    [err, setErr] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      await post("/persons/" + person.id + "/" + mode, v);
      setMode("");
      reload();
      notify(
        mode === "merge"
          ? "Profiles linked. Historical register identities remain preserved."
          : "Member history updated.",
      );
    } catch (e: any) {
      setErr(e.message);
    }
  }
  return (
    <div className="profile-history">
      <h3 className="form-section-title">Connections & membership history</h3>
      <ErrorBox error={error || err} />
      {data?.person.merged_into && (
        <div className="notice">
          <Info size={18} />
          This profile redirects to a verified member profile. Historical
          register references are preserved.
        </div>
      )}
      <div className="relationship-tree">
        <div className="tree-root">
          <Users size={18} />
          {person.name}
        </div>
        {data?.relationships.map((r: Row) => (
          <div className="tree-branch" key={r.id}>
            <span>{r.relationship}</span>
            <strong>{r.related_name}</strong>
            <small>
              {r.start_date ? date(r.start_date) : "Date not specified"}
              {r.end_date ? " – " + date(r.end_date) : ""}
            </small>
          </div>
        ))}
      </div>
      {data?.memberships.map((m: Row) => (
        <div className="history-row" key={m.id}>
          <Badge status={m.event} />
          <div>
            <strong>{date(m.effective_date)}</strong>
            <p>{m.reason}</p>
            {(m.previous_parish || m.next_parish) && (
              <small>
                {m.previous_parish || "This parish"} to{" "}
                {m.next_parish || "this parish"}
              </small>
            )}
          </div>
        </div>
      ))}
      {data?.households.length > 0 && (
        <details className="profile-details">
          <summary>Household membership history</summary>
          {data?.households.map((h: Row) => (
            <p key={h.id}>
              {h.name} · {date(h.start_date)} to{" "}
              {h.end_date ? date(h.end_date) : "present"}
            </p>
          ))}
        </details>
      )}
      {data?.merges.map((m: Row) => (
        <div className="notice" key={m.id}>
          <div>
            <strong>
              {m.reversed_at ? "Reversed merge" : "Linked duplicate"} ·{" "}
              {m.target_name}
            </strong>
            <p>{m.reason}</p>
            {!m.reversed_at && can("members.merge") && (
              <Button
                type="button"
                className="secondary"
                onClick={async () => {
                  try {
                    await post("/merges/" + m.id + "/reverse", {
                      reason: "Authorised reversal after identity review.",
                    });
                    reload();
                    notify("Merge reversed. Original identities retained.");
                  } catch (e: any) {
                    setErr(e.message);
                  }
                }}
              >
                Reverse merge
              </Button>
            )}
          </div>
        </div>
      ))}
      <div className="button-group">
        {can("members.update") && (
          <>
            <Button
              type="button"
              className="secondary"
              onClick={() =>
                setMode(mode === "relationships" ? "" : "relationships")
              }
            >
              Add relationship
            </Button>
            <Button
              type="button"
              className="secondary"
              onClick={() => setMode(mode === "membership" ? "" : "membership")}
            >
              Record membership change
            </Button>
          </>
        )}
        {can("members.merge") && (
          <Button
            type="button"
            className="secondary"
            onClick={() => setMode(mode === "merge" ? "" : "merge")}
          >
            Link duplicate profile
          </Button>
        )}
      </div>
      {mode && (
        <div className="inset-form">
          <h3>
            {mode === "merge"
              ? "Controlled duplicate merge"
              : mode === "membership"
                ? "Record a membership event"
                : "Add a family connection"}
          </h3>
          {mode === "membership" ? (
            <>
              <Field label="Membership event">
                <select
                  value={v.event}
                  onChange={(e) => setV({ ...v, event: e.target.value })}
                >
                  {[
                    "joined",
                    "transferred_in",
                    "transferred_out",
                    "deceased",
                    "inactive",
                    "reactivated",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="Effective date">
                <input
                  type="date"
                  value={v.effective_date}
                  onChange={(e) =>
                    setV({ ...v, effective_date: e.target.value })
                  }
                />
              </Field>
              <Field label="Previous parish">
                <input
                  onChange={(e) =>
                    setV({ ...v, previous_parish: e.target.value })
                  }
                />
              </Field>
              <Field label="Next parish">
                <input
                  onChange={(e) => setV({ ...v, next_parish: e.target.value })}
                />
              </Field>
            </>
          ) : (
            <Field
              label={
                mode === "merge" ? "Verified target profile" : "Related person"
              }
            >
              <select
                value={
                  v[mode === "merge" ? "target_id" : "related_person_id"] || ""
                }
                onChange={(e) =>
                  setV({
                    ...v,
                    [mode === "merge" ? "target_id" : "related_person_id"]:
                      e.target.value,
                  })
                }
              >
                <option value="">Choose another member</option>
                {members?.items
                  .filter((p: Row) => p.id !== person.id && !p.merged_into)
                  .map((p: Row) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.membership_no}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          {mode === "relationships" && (
            <>
              <Field label="Their relationship to this person">
                <select
                  value={v.relationship}
                  onChange={(e) => setV({ ...v, relationship: e.target.value })}
                >
                  {[
                    "parent",
                    "child",
                    "spouse",
                    "guardian",
                    "sibling",
                    "other",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <div className="form-grid">
                <Field label="Start date (optional)">
                  <input
                    type="date"
                    onChange={(e) =>
                      setV({ ...v, start_date: e.target.value || null })
                    }
                  />
                </Field>
                <Field label="End date (optional)">
                  <input
                    type="date"
                    onChange={(e) =>
                      setV({ ...v, end_date: e.target.value || null })
                    }
                  />
                </Field>
              </div>
            </>
          )}
          {mode !== "relationships" && (
            <Field label="Reason / identity evidence reviewed">
              <textarea
                value={v.reason || ""}
                onChange={(e) => setV({ ...v, reason: e.target.value })}
              />
            </Field>
          )}
          {mode === "merge" && (
            <p className="muted">
              No names or historical sacramental entries are overwritten. This
              creates a reversible identity redirect after your manual
              verification.
            </p>
          )}
          <Button type="button" className="primary" onClick={submit}>
            Save to history
          </Button>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
