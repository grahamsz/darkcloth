import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { Camera, Lens, FilmStock, Roll, FilmHolder } from "../api/client";

type Section = "cameras" | "lenses" | "films" | "rolls" | "film_holders";

function CamerasSection() {
  const [items, setItems] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [maker, setMaker] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    api.listCameras()
      .then(r => setItems(r.items))
      .catch(e => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setAddError(null);
    setAdding(true);
    try {
      const camera = await api.createCamera({ name, maker: maker || undefined });
      setItems(c => [...c, camera]);
      setName(""); setMaker(""); setShowForm(false);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this camera?")) return;
    await api.deleteCamera(id);
    setItems(c => c.filter(x => x.id !== id));
  };

  return (
    <div>
      <div className="page-header">
        <h1>Cameras</h1>
        <button className="btn-primary" onClick={() => setShowForm(v => !v)}>
          {showForm ? "Cancel" : "Add camera"}
        </button>
      </div>
      {showForm && (
        <form onSubmit={handleAdd} className="inline-form">
          {addError && <p className="form-error" style={{ width: "100%", margin: 0 }}>{addError}</p>}
          <input placeholder="Name" value={name} onChange={e => setName(e.target.value)} required />
          <input placeholder="Maker (optional)" value={maker} onChange={e => setMaker(e.target.value)} />
          <button type="submit" disabled={adding}>{adding ? "Adding…" : "Add"}</button>
        </form>
      )}
      {loading && <p className="muted">Loading…</p>}
      {loadError && <p className="form-error">{loadError}</p>}
      {!loading && !loadError && items.length === 0 && <p className="muted">No cameras yet.</p>}
      <ul className="gear-list">
        {items.map(c => (
          <li key={c.id} className="gear-row">
            <span className="gear-name">{c.name}</span>
            {c.maker && <span className="gear-meta">{c.maker}</span>}
            <button className="gear-delete" onClick={() => handleDelete(c.id)} aria-label="Delete">×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LensesSection() {
  const [items, setItems] = useState<Lens[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [focalLength, setFocalLength] = useState("");
  const [maxAperture, setMaxAperture] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    api.listLenses()
      .then(r => setItems(r.items))
      .catch(e => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setAddError(null);
    setAdding(true);
    try {
      const lens = await api.createLens({
        name,
        focal_length_mm: focalLength ? parseFloat(focalLength) : undefined,
        max_aperture: maxAperture || undefined,
      });
      setItems(l => [...l, lens]);
      setName(""); setFocalLength(""); setMaxAperture(""); setShowForm(false);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this lens?")) return;
    await api.deleteLens(id);
    setItems(l => l.filter(x => x.id !== id));
  };

  return (
    <div>
      <div className="page-header">
        <h1>Lenses</h1>
        <button className="btn-primary" onClick={() => setShowForm(v => !v)}>
          {showForm ? "Cancel" : "Add lens"}
        </button>
      </div>
      {showForm && (
        <form onSubmit={handleAdd} className="inline-form">
          {addError && <p className="form-error" style={{ width: "100%", margin: 0 }}>{addError}</p>}
          <input placeholder="Name" value={name} onChange={e => setName(e.target.value)} required />
          <input placeholder="Focal length mm" type="number" value={focalLength} onChange={e => setFocalLength(e.target.value)} />
          <input placeholder="Max aperture" value={maxAperture} onChange={e => setMaxAperture(e.target.value)} />
          <button type="submit" disabled={adding}>{adding ? "Adding…" : "Add"}</button>
        </form>
      )}
      {loading && <p className="muted">Loading…</p>}
      {loadError && <p className="form-error">{loadError}</p>}
      {!loading && !loadError && items.length === 0 && <p className="muted">No lenses yet.</p>}
      <ul className="gear-list">
        {items.map(l => (
          <li key={l.id} className="gear-row">
            <span className="gear-name">{l.name}</span>
            <span className="gear-meta">
              {[l.focal_length_mm != null ? `${l.focal_length_mm}mm` : null, l.max_aperture]
                .filter(Boolean).join(" · ")}
            </span>
            <button className="gear-delete" onClick={() => handleDelete(l.id)} aria-label="Delete">×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FilmsSection() {
  const [items, setItems] = useState<FilmStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [iso, setIso] = useState("");
  const [process, setProcess] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    api.listFilms()
      .then(r => setItems(r.items))
      .catch(e => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setAddError(null);
    setAdding(true);
    try {
      const film = await api.createFilm({
        name,
        iso: iso ? parseInt(iso, 10) : undefined,
        process: process || undefined,
      });
      setItems(f => [...f, film]);
      setName(""); setIso(""); setProcess(""); setShowForm(false);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this film stock?")) return;
    await api.deleteFilm(id);
    setItems(f => f.filter(x => x.id !== id));
  };

  return (
    <div>
      <div className="page-header">
        <h1>Film stocks</h1>
        <button className="btn-primary" onClick={() => setShowForm(v => !v)}>
          {showForm ? "Cancel" : "Add film"}
        </button>
      </div>
      {showForm && (
        <form onSubmit={handleAdd} className="inline-form">
          {addError && <p className="form-error" style={{ width: "100%", margin: 0 }}>{addError}</p>}
          <input placeholder="Name" value={name} onChange={e => setName(e.target.value)} required />
          <input placeholder="ISO" type="number" value={iso} onChange={e => setIso(e.target.value)} />
          <input placeholder="Process (C-41, E-6…)" value={process} onChange={e => setProcess(e.target.value)} />
          <button type="submit" disabled={adding}>{adding ? "Adding…" : "Add"}</button>
        </form>
      )}
      {loading && <p className="muted">Loading…</p>}
      {loadError && <p className="form-error">{loadError}</p>}
      {!loading && !loadError && items.length === 0 && <p className="muted">No film stocks yet.</p>}
      <ul className="gear-list">
        {items.map(f => (
          <li key={f.id} className="gear-row">
            <span className="gear-name">{f.name}</span>
            <span className="gear-meta">
              {[f.iso != null ? `ISO ${f.iso}` : null, f.process].filter(Boolean).join(" · ")}
            </span>
            <button className="gear-delete" onClick={() => handleDelete(f.id)} aria-label="Delete">×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RollsSection() {
  const [items, setItems] = useState<Roll[]>([]);
  const [films, setFilms] = useState<FilmStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [filmId, setFilmId] = useState("");
  const [loadedAt, setLoadedAt] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    Promise.all([
      api.listRolls(),
      api.listFilms().catch(() => ({ items: [] as FilmStock[] })),
    ])
      .then(([rollsRes, filmsRes]) => {
        setItems(rollsRes.items);
        setFilms(filmsRes.items);
      })
      .catch(e => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setAddError(null);
    setAdding(true);
    try {
      const roll = await api.createRoll({
        name,
        film_id: filmId || undefined,
        loaded_at: loadedAt ? new Date(loadedAt).toISOString() : undefined,
      });
      setItems(r => [...r, roll]);
      setName(""); setFilmId(""); setLoadedAt(""); setShowForm(false);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setAdding(false);
    }
  };

  const markDeveloped = async (roll: Roll) => {
    const updated = await api.updateRoll(roll.id, { developed_at: new Date().toISOString() });
    setItems(rs => rs.map(r => r.id === roll.id ? updated : r));
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this roll?")) return;
    await api.deleteRoll(id);
    setItems(r => r.filter(x => x.id !== id));
  };

  return (
    <div>
      <div className="page-header">
        <h1>Rolls</h1>
        <button className="btn-primary" onClick={() => setShowForm(v => !v)}>
          {showForm ? "Cancel" : "Add roll"}
        </button>
      </div>
      {showForm && (
        <form onSubmit={handleAdd} className="inline-form">
          {addError && <p className="form-error" style={{ width: "100%", margin: 0 }}>{addError}</p>}
          <input placeholder="Roll name" value={name} onChange={e => setName(e.target.value)} required />
          <select value={filmId} onChange={e => setFilmId(e.target.value)}>
            <option value="">No film</option>
            {films.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <input
            type="datetime-local"
            title="Loaded at"
            value={loadedAt}
            onChange={e => setLoadedAt(e.target.value)}
          />
          <button type="submit" disabled={adding}>{adding ? "Adding…" : "Add"}</button>
        </form>
      )}
      {loading && <p className="muted">Loading…</p>}
      {loadError && <p className="form-error">{loadError}</p>}
      {!loading && !loadError && items.length === 0 && <p className="muted">No rolls yet.</p>}
      <ul className="gear-list">
        {items.map(r => {
          const filmName = r.film_id ? films.find(f => f.id === r.film_id)?.name : null;
          return (
            <li key={r.id} className="gear-row">
              <span className="gear-name">{r.name}</span>
              {filmName && <span className="gear-meta">{filmName}</span>}
              <span className={`gear-status gear-status--${r.developed_at ? "done" : r.loaded_at ? "active" : "idle"}`}>
                {r.developed_at ? "Developed" : r.loaded_at ? "Loaded" : "Not loaded"}
              </span>
              {!r.developed_at && r.loaded_at && (
                <button className="link-btn" onClick={() => markDeveloped(r)}>Mark developed</button>
              )}
              <button className="gear-delete" onClick={() => handleDelete(r.id)} aria-label="Delete">×</button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FilmHoldersSection() {
  const [items, setItems] = useState<FilmHolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [brand, setBrand] = useState("");
  const [capacity, setCapacity] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    api.listFilmHolders()
      .then(r => setItems(r.items))
      .catch(e => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setAddError(null);
    setAdding(true);
    try {
      const holder = await api.createFilmHolder({
        name,
        type: type || undefined,
        brand: brand || undefined,
        capacity: capacity ? parseInt(capacity, 10) : undefined,
      });
      setItems(h => [...h, holder]);
      setName(""); setType(""); setBrand(""); setCapacity(""); setShowForm(false);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this film holder?")) return;
    await api.deleteFilmHolder(id);
    setItems(h => h.filter(x => x.id !== id));
  };

  return (
    <div>
      <div className="page-header">
        <h1>Film holders</h1>
        <button className="btn-primary" onClick={() => setShowForm(v => !v)}>
          {showForm ? "Cancel" : "Add film holder"}
        </button>
      </div>
      {showForm && (
        <form onSubmit={handleAdd} className="inline-form">
          {addError && <p className="form-error" style={{ width: "100%", margin: 0 }}>{addError}</p>}
          <input placeholder="Name" value={name} onChange={e => setName(e.target.value)} required />
          <input placeholder="Type (4x5, 8x10…)" value={type} onChange={e => setType(e.target.value)} />
          <input placeholder="Brand (optional)" value={brand} onChange={e => setBrand(e.target.value)} />
          <input placeholder="Capacity" type="number" value={capacity} onChange={e => setCapacity(e.target.value)} />
          <button type="submit" disabled={adding}>{adding ? "Adding…" : "Add"}</button>
        </form>
      )}
      {loading && <p className="muted">Loading…</p>}
      {loadError && <p className="form-error">{loadError}</p>}
      {!loading && !loadError && items.length === 0 && <p className="muted">No film holders yet.</p>}
      <ul className="gear-list">
        {items.map(h => (
          <li key={h.id} className="gear-row">
            <span className="gear-name">{h.name}</span>
            <span className="gear-meta">
              {[h.type, h.brand, h.capacity != null ? `${h.capacity} sheets` : null]
                .filter(Boolean).join(" · ")}
            </span>
            <button className="gear-delete" onClick={() => handleDelete(h.id)} aria-label="Delete">×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GearPage({ section }: { section: Section }) {
  return (
    <div className="page">
      {section === "cameras" && <CamerasSection />}
      {section === "lenses" && <LensesSection />}
      {section === "films" && <FilmsSection />}
      {section === "rolls" && <RollsSection />}
      {section === "film_holders" && <FilmHoldersSection />}
    </div>
  );
}
