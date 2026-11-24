import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  SlidersHorizontal,
  Church,
  MapPin,
  Upload,
  Trash2,
  Settings,
  LogOut,
  UserRound,
  ChevronDown,
  Users,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import {
  api,
  post,
  patch,
  setParish,
  setChangeReason,
  parishQuery,
  type Row,
} from "./api";
import { ageGroups } from "../shared/directory";
export function useDirectoryData(path: string, revision = 0) {
  const [data, setData] = useState<Row | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    setLoading(true);
    api(path)
      .then((d) => {
        if (live) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => {
        if (live) {
          setError(e.message);
          setData(null);
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [path, revision]);
  return { data, error, loading };
}
export function IdentityPhoto({
  kind,
  id,
  name,
  version = 0,
  editable = false,
  onSaved,
  compact = false,
}: {
  kind: string;
  id: string;
  name: string;
  version?: number;
  editable?: boolean;
  onSaved?: () => void;
  compact?: boolean;
}) {
  const [current, setCurrent] = useState(version),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => setCurrent(version), [version]);
  const path =
    kind === "user" ? "/auth/photo" : `/identity/${kind}/${id}/photo`;
  return (
    <div className={"identity-photo " + (compact ? "compact" : "")}>
      <div className="identity-photo-preview">
        {current ? (
          <img
            src={`/api/v1${path}?v=${current}${parishQuery()}`}
            alt={name}
            loading="lazy"
          />
        ) : kind === "user" ? (
          <UserRound size={30} />
        ) : (
          <Church size={38} />
        )}
      </div>
      {editable && (
        <div className="identity-photo-controls">
          <label className={"button secondary " + (busy ? "busy" : "")}>
            <Upload size={16} />
            {busy ? "Saving..." : "Choose image"}
            <input
              aria-label={`Upload ${kind} image for ${name}`}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (
                  file.size > 4 * 1024 * 1024 ||
                  !["image/jpeg", "image/png", "image/webp"].includes(file.type)
                ) {
                  setError("Choose a JPEG, PNG or WebP up to 4 MB.");
                  return;
                }
                setBusy(true);
                setError("");
                try {
                  const body = new FormData();
                  body.append("file", file);
                  const result = await api(path, { method: "POST", body });
                  setCurrent(Number(result.version));
                  onSaved?.();
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
          {current > 0 && (
            <button
              type="button"
              className="text-button"
              disabled={busy}
              aria-label={`Remove image for ${kind} ${name}`}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(path, { method: "DELETE" });
                  setCurrent(0);
                  onSaved?.();
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Trash2 size={15} />
              Remove image
            </button>
          )}
          <small>JPEG, PNG or WebP. Up to 4 MB; metadata removed.</small>
        </div>
      )}
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function ProfileMenu({
  session,
  navigate,
  refresh,
  notify,
  can,
}: {
  session: Row;
  navigate: (p: string) => void;
  refresh: () => void;
  notify: (s: string) => void;
  can: (s: string) => boolean;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const items = Array.from(
          root.current?.querySelectorAll<HTMLButtonElement>(
            '[role="menuitem"]',
          ) || [],
        );
        const at = items.indexOf(document.activeElement as HTMLButtonElement);
        e.preventDefault();
        items[
          (at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length
        ]?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    root.current?.addEventListener("keydown", keys);
    return () => {
      document.removeEventListener("pointerdown", outside);
      root.current?.removeEventListener("keydown", keys);
    };
  }, [open]);
  const go = (p: string) => {
    setOpen(false);
    navigate(p);
  };
  return (
    <div className="profile-dropdown" ref={root}>
      <button
        className="profile-trigger"
        aria-label="Open profile menu"
        aria-haspopup="menu"
        aria-expanded={open}
        ref={trigger}
        onClick={() => {
          setOpen(!open);
          if (!open)
            setTimeout(
              () =>
                root.current
                  ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
                  ?.focus(),
              0,
            );
        }}
      >
        <span className="top-avatar">
          {session.profile_photo_version ? (
            <img
              src={`/api/v1/auth/photo?v=${session.profile_photo_version}`}
              alt=""
            />
          ) : (
            session.user.name[0]
          )}
        </span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div
          className="profile-popover"
          role="menu"
          aria-label="Account options"
        >
          <div className="profile-menu-heading">
            <strong>{session.user.name}</strong>
            <small>{session.user.email}</small>
          </div>
          <button role="menuitem" onClick={() => go("My account")}>
            <UserRound size={17} />
            My profile & photo
          </button>
          <button
            role="menuitem"
            onClick={() =>
              go(
                can("tenant.manage") && session.tenant
                  ? "Administration"
                  : "My account",
              )
            }
          >
            <Settings size={17} />
            Quick settings
          </button>
          <button role="menuitem" onClick={() => go("Church directory")}>
            <Church size={17} />
            Church directory
          </button>
          <button
            role="menuitem"
            className="logout-option"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await post("/auth/logout", {});
                setParish("");
                setChangeReason("");
                setOpen(false);
                refresh();
              } catch (e: any) {
                notify(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <LogOut size={17} />
            {busy ? "Signing out..." : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
export function MemberDirectory({
  session,
  refresh,
  onEdit,
  onAdd,
  revision,
  canAdd,
}: {
  session: Row;
  refresh: () => void;
  onEdit: (r: Row) => void;
  onAdd: () => void;
  revision: number;
  canAdd: boolean;
}) {
  const [filters, setFilters] = useState<Row>({
      q: "",
      state: "",
      place: "",
      unit: "",
      status: "",
      age_group: "",
      min_age: "",
      max_age: "",
    }),
    [page, setPage] = useState(1),
    [limit, setLimit] = useState(25),
    [view, setView] = useState("list"),
    [forane, setForane] = useState(session.forane?.id || "");
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== "") params.set(k, String(v));
  });
  const { data, error, loading } = useDirectoryData(
    "/persons?" + params,
    revision,
  );
  const { data: units } = useDirectoryData("/units");
  const { data: churches } = useDirectoryData("/directory/churches");
  const set = (key: string, value: string) => {
    setFilters((f) => ({
      ...f,
      [key]: value,
      ...(key === "state" ? { place: "" } : {}),
    }));
    setPage(1);
  };
  const states = Array.from(
    new Set((data?.locations || []).map((r: Row) => r.state).filter(Boolean)),
  ) as string[];
  const places = Array.from(
    new Set(
      (data?.locations || [])
        .filter((r: Row) => !filters.state || r.state === filters.state)
        .map((r: Row) => r.place)
        .filter(Boolean),
    ),
  ) as string[];
  const office = [
    "platform_admin",
    "archdiocese_admin",
    "forane_admin",
  ].includes(session.user.role);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">PEOPLE & CONNECTIONS</p>
          <h1>Every person. Every generation.</h1>
          <p className="muted">
            The complete parish directory, with age groups counted across all
            matching records.
          </p>
        </div>
        {canAdd && (
          <button className="button primary" onClick={onAdd}>
            Add member
          </button>
        )}
      </div>
      <div className="directory-scope">
        <Church size={20} />
        <div>
          <strong>{session.tenant?.name}</strong>
          <small>{session.forane?.name || "Forane assignment pending"}</small>
        </div>
        {office && (
          <div className="scope-selectors">
            <label>
              Forane
              <select
                aria-label="Member directory forane"
                value={forane}
                onChange={(e) => setForane(e.target.value)}
              >
                <option value="">All permitted foranes</option>
                {churches?.items
                  .filter((c: Row) => c.kind === "forane")
                  .map((c: Row) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Parish
              <select
                aria-label="Member directory parish"
                value={
                  churches?.items.some(
                    (c: Row) =>
                      c.kind === "parish" &&
                      c.id === session.tenant?.id &&
                      (!forane || c.forane_id === forane),
                  )
                    ? session.tenant?.id
                    : ""
                }
                onChange={(e) => {
                  setParish(e.target.value);
                  refresh();
                }}
              >
                <option value="" disabled>
                  Select a parish
                </option>
                {churches?.items
                  .filter(
                    (c: Row) =>
                      c.kind === "parish" &&
                      (!forane || c.forane_id === forane),
                  )
                  .map((c: Row) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        )}
      </div>
      <div className="age-summary" aria-label="Age group totals">
        <button
          className={!filters.age_group ? "selected" : ""}
          onClick={() => set("age_group", "")}
        >
          <strong>{data?.summary?.total ?? 0}</strong>
          <span>All ages</span>
          <small>Matching members</small>
        </button>
        {ageGroups.map((g) => (
          <button
            key={g.key}
            className={filters.age_group === g.key ? "selected" : ""}
            aria-pressed={filters.age_group === g.key}
            onClick={() =>
              set("age_group", filters.age_group === g.key ? "" : g.key)
            }
          >
            <strong>{data?.summary?.[g.key] ?? 0}</strong>
            <span>{g.label}</span>
            <small>{g.range}</small>
          </button>
        ))}
      </div>
      <section className="panel member-directory">
        <div className="directory-toolbar">
          <div className="input-icon">
            <Search size={17} />
            <input
              aria-label="Search members"
              placeholder="Name or membership number"
              value={filters.q}
              onChange={(e) => set("q", e.target.value)}
            />
          </div>
          <div className="view-switch" aria-label="Member view">
            <button
              aria-label="List view"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <List size={18} />
            </button>
            <button
              aria-label="Card view"
              aria-pressed={view === "cards"}
              onClick={() => setView("cards")}
            >
              <LayoutGrid size={18} />
            </button>
          </div>
        </div>
        <div className="directory-filters">
          <label>
            State
            <select
              aria-label="Member state"
              value={filters.state}
              onChange={(e) => set("state", e.target.value)}
            >
              <option value="">All states</option>
              {states.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Place
            <select
              aria-label="Member place"
              value={filters.place}
              onChange={(e) => set("place", e.target.value)}
            >
              <option value="">All places</option>
              {places.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Unit
            <select
              aria-label="Member unit"
              value={filters.unit}
              onChange={(e) => set("unit", e.target.value)}
            >
              <option value="">All units</option>
              <option value="unassigned">Unassigned</option>
              {units?.items.map((u: Row) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Category
            <select
              aria-label="Membership category"
              value={filters.status}
              onChange={(e) => set("status", e.target.value)}
            >
              <option value="">All statuses</option>
              {["active", "inactive", "deceased", "transferred"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Minimum age
            <input
              aria-label="Minimum age"
              type="number"
              min="0"
              max="150"
              value={filters.min_age}
              onChange={(e) => set("min_age", e.target.value)}
            />
          </label>
          <label>
            Maximum age
            <input
              aria-label="Maximum age"
              type="number"
              min="0"
              max="150"
              value={filters.max_age}
              onChange={(e) => set("max_age", e.target.value)}
            />
          </label>
          <button
            className="text-button"
            onClick={() => {
              setFilters({
                q: "",
                state: "",
                place: "",
                unit: "",
                status: "",
                age_group: "",
                min_age: "",
                max_age: "",
              });
              setPage(1);
            }}
          >
            <X size={15} />
            Clear filters
          </button>
        </div>
        <div className="directory-result-bar" role="status">
          <strong>{data?.total ?? 0} matching members</strong>
          <small>
            Age in completed years. Partial or future birth dates appear as
            unknown.
          </small>
        </div>
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <div className="loading" role="status">
            Loading members...
          </div>
        ) : data?.items.length ? (
          view === "list" ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>MEMBER</th>
                    <th>AGE</th>
                    <th>UNIT / HOUSEHOLD</th>
                    <th>PLACE</th>
                    <th>STATUS</th>
                    <th>PROFILE</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((p: Row) => (
                    <tr key={p.id}>
                      <td>
                        <div className="person-cell">
                          <span className="initials">
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
                              p.name[0]
                            )}
                          </span>
                          <span>
                            <strong>{p.name}</strong>
                            <small className="block muted">
                              {p.membership_no}
                            </small>
                          </span>
                        </div>
                      </td>
                      <td>{p.age ?? "Unknown"}</td>
                      <td>
                        {p.unit_name || "Unassigned"}
                        <small className="block muted">
                          {p.household_name || "No household"}
                        </small>
                      </td>
                      <td>
                        {[p.effective_place, p.effective_state]
                          .filter(Boolean)
                          .join(", ") || "Not recorded"}
                      </td>
                      <td>
                        <span className={"badge " + p.status}>{p.status}</span>
                      </td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => onEdit(p)}
                        >
                          View profile
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="member-card-grid">
              {data.items.map((p: Row) => (
                <button
                  className="member-directory-card"
                  key={p.id}
                  onClick={() => onEdit(p)}
                >
                  <span className="initials">
                    {p.photo_version ? (
                      <img
                        src={`/api/v1/persons/${p.id}/photo?v=${p.photo_version}${parishQuery()}`}
                        alt=""
                      />
                    ) : (
                      p.name[0]
                    )}
                  </span>
                  <strong>{p.name}</strong>
                  <small>{p.membership_no}</small>
                  <span>
                    {p.age === null ? "Age unknown" : `${p.age} years`} /{" "}
                    {p.status}
                  </span>
                  <small>{p.unit_name || "Unit unassigned"}</small>
                </button>
              ))}
            </div>
          )
        ) : (
          <div className="empty">
            <Users size={28} />
            <h3>No matching members</h3>
            <p>Adjust the filters or add a member.</p>
          </div>
        )}
        <div className="directory-pagination">
          <label>
            Per page
            <select
              aria-label="Members per page"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
            >
              {[25, 50, 100].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <span>
            Page {page} of {Math.max(1, Math.ceil((data?.total || 0) / limit))}
          </span>
          <button
            className="button secondary"
            aria-label="Previous members page"
            disabled={page === 1 || loading}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            className="button secondary"
            aria-label="Next members page"
            disabled={page * limit >= (data?.total || 0) || loading}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </section>
    </>
  );
}
export function ChurchDirectory({
  onMembers,
}: {
  onMembers: (id: string) => void;
}) {
  const [revision, reload] = useState(0),
    [query, setQuery] = useState(""),
    [kind, setKind] = useState(""),
    [state, setState] = useState(""),
    [place, setPlace] = useState(""),
    [forane, setForane] = useState(""),
    [parish, setParishFilter] = useState(""),
    [active, setActive] = useState<Row | null>(null);
  const { data, error, loading } = useDirectoryData(
    "/directory/churches",
    revision,
  );
  const items: Row[] = data?.items || [];
  const filtered = items.filter(
    (c) =>
      (!kind || c.kind === kind) &&
      (!state || c.state === state) &&
      (!place || c.place === place) &&
      (!forane ||
        c.id === forane ||
        c.forane_id === forane ||
        items.some(
          (p) =>
            p.id === c.parent_id && (p.id === forane || p.forane_id === forane),
        )) &&
      (!parish || c.id === parish || c.parent_id === parish) &&
      (c.name + " " + c.place + " " + c.state)
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CHURCHES & PLACES</p>
          <h1>Recognise every community.</h1>
          <p className="muted">
            Churches and buildings within your permitted archdiocese, forane and
            parish scope.
          </p>
        </div>
      </div>
      <section className="panel">
        <div className="directory-filters">
          <label>
            Search
            <input
              aria-label="Search church directory"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Church name or location"
            />
          </label>
          <label>
            Church type
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">All church types</option>
              {["archdiocese", "forane", "parish", "building"].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
          <label>
            State
            <select
              value={state}
              onChange={(e) => {
                setState(e.target.value);
                setPlace("");
              }}
            >
              <option value="">All states</option>
              {Array.from(
                new Set(items.map((c) => c.state).filter(Boolean)),
              ).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Place
            <select value={place} onChange={(e) => setPlace(e.target.value)}>
              <option value="">All places</option>
              {Array.from(
                new Set(
                  items
                    .filter((c) => !state || c.state === state)
                    .map((c) => c.place)
                    .filter(Boolean),
                ),
              ).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Forane
            <select
              aria-label="Church directory forane"
              value={forane}
              onChange={(e) => {
                setForane(e.target.value);
                setParishFilter("");
              }}
            >
              <option value="">All permitted foranes</option>
              {items
                .filter((c) => c.kind === "forane")
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Parish
            <select
              aria-label="Church directory parish"
              value={parish}
              onChange={(e) => setParishFilter(e.target.value)}
            >
              <option value="">All permitted parishes</option>
              {items
                .filter(
                  (c) =>
                    c.kind === "parish" && (!forane || c.forane_id === forane),
                )
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <strong>{filtered.length} places</strong>
        </div>
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
      </section>
      {loading ? (
        <div className="loading">Loading directory...</div>
      ) : (
        <div className="church-directory-grid">
          {filtered.map((c) => (
            <article className="panel church-directory-card" key={c.id}>
              <IdentityPhoto
                kind={c.kind}
                id={c.id}
                name={c.name}
                version={c.photo_version}
              />
              <div className="church-directory-body">
                <span className="eyebrow">{c.kind}</span>
                <h2>{c.name}</h2>
                <p>
                  <MapPin size={15} />
                  {[c.place, c.state].filter(Boolean).join(", ") ||
                    "Location not recorded"}
                </p>
                <button
                  className="button secondary"
                  onClick={() =>
                    setActive(
                      c.kind === "building"
                        ? items.find((p) => p.id === c.parent_id) || c
                        : c,
                    )
                  }
                >
                  Church details & buildings
                </button>
                {c.kind === "parish" && (
                  <button
                    className="text-button parish-members-link"
                    onClick={() => onMembers(c.id)}
                  >
                    <Users size={16} />
                    Full parish member list
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {!loading && !filtered.length && (
        <div className="empty">
          <Church size={32} />
          <h3>No matching churches</h3>
          <p>Try another name or location.</p>
        </div>
      )}
      {active && (
        <ChurchDetails
          key={active.id}
          church={active}
          onClose={() => {
            setActive(null);
            reload((n) => n + 1);
          }}
        />
      )}
    </>
  );
}
function ChurchDetails({
  church,
  onClose,
}: {
  church: Row;
  onClose: () => void;
}) {
  const [revision, reload] = useState(0),
    [state, setState] = useState(church.state),
    [place, setPlace] = useState(church.place),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const { data, error: loadError } = useDirectoryData(
    `/directory/${church.kind}/${church.id}/buildings`,
    revision,
  );
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog
      className="church-detail-dialog"
      aria-label={church.name + " details"}
      ref={dialog}
      onCancel={onClose}
    >
      <div className="church-detail-heading">
        <div>
          <span className="eyebrow">{church.kind}</span>
          <h2>{church.name}</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close church details"
          onClick={onClose}
        >
          <X size={22} />
        </button>
      </div>
      <div className="church-detail-content">
        <IdentityPhoto
          kind={church.kind}
          id={church.id}
          name={church.name}
          version={church.photo_version}
          editable={church.editable}
        />
        {church.editable ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await patch(`/directory/${church.kind}/${church.id}`, {
                  state,
                  place,
                });
                setError("");
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="form-grid">
              <label>
                State
                <input
                  value={state}
                  maxLength={200}
                  onChange={(e) => setState(e.target.value)}
                />
              </label>
              <label>
                Place
                <input
                  value={place}
                  maxLength={200}
                  onChange={(e) => setPlace(e.target.value)}
                />
              </label>
            </div>
            <button className="button primary" disabled={busy}>
              Save location
            </button>
          </form>
        ) : (
          <p>{[place, state].filter(Boolean).join(", ")}</p>
        )}
        {(error || loadError) && (
          <p className="error-box" role="alert">
            {error || loadError}
          </p>
        )}
        <h3>Buildings & landmarks</h3>
        <div className="building-grid">
          {data?.items.map((b: Row) => (
            <article className="building-card" key={b.id}>
              <IdentityPhoto
                kind="building"
                id={b.id}
                name={b.name}
                version={b.photo_version}
                editable={church.editable}
              />
              <h4>{b.name}</h4>
              <p>{b.description}</p>
              <small>{[b.place, b.state].filter(Boolean).join(", ")}</small>
              {church.editable && (
                <button
                  className="text-button"
                  onClick={async () => {
                    try {
                      await api(`/directory/building/${b.id}`, {
                        method: "DELETE",
                      });
                      reload((n) => n + 1);
                    } catch (e: any) {
                      setError(e.message);
                    }
                  }}
                >
                  <Trash2 size={15} />
                  Remove building
                </button>
              )}
            </article>
          ))}
        </div>
        {!data?.items.length && (
          <p className="muted">No buildings recorded yet.</p>
        )}
        {church.editable && (
          <form
            className="building-add-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await post(`/directory/${church.kind}/${church.id}/buildings`, {
                  name,
                  description,
                  state,
                  place,
                });
                setName("");
                setDescription("");
                setError("");
                reload((n) => n + 1);
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h3>Add a building</h3>
            <label>
              Building name
              <input
                required
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Parish hall, chapel, office..."
              />
            </label>
            <label>
              Description
              <input
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <button className="button primary" disabled={busy}>
              Add building
            </button>
          </form>
        )}
      </div>
    </dialog>
  );
}
