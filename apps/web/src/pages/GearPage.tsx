import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { Camera, Lens, FilmStock, Roll, FilmHolder } from "../api/client";

type Section = "cameras" | "lenses" | "films" | "rolls" | "film_holders";

function CamerasSection() {
  const [items, setItems] = useState<Camera[]>([]);
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [maker, setMaker] = useState("");
  const [filmType, setFilmType] = useState<"" | "roll" | "sheet">("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editMaker, setEditMaker] = useState("");
  const [editFilmType, setEditFilmType] = useState<"" | "roll" | "sheet">("");
  const [editCompatibleLenses, setEditCompatibleLenses] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.listCameras(),
      api.listLenses().catch(() => ({ items: [] as Lens[] })),
    ])
      .then(([camsRes, lensRes]) => {
        setItems(camsRes.items);
        setLenses(lensRes.items);
      })
      .catch(e => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setAddError(null);
    setAdding(true);
    try {
      const camera = await api.createCamera({
        name,
        maker: maker || undefined,
        film_type: filmType || undefined,
      });
      setItems(c => [...c, camera]);
      setName(""); setMaker(""); setFilmType(""); setShowForm(false);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (c: Camera) => {
    setEditingId(c.id);
    setEditName(c.name);
    setEditMaker(c.maker ?? "");
    setEditFilmType((c.film_type ?? "") as "" | "roll" | "sheet");
    setEditCompatibleLenses(c.compatible_lenses);
    setSaveError(null);
  };

  const cancelEdit = () => { setEditingId(null); setSaveError(null); };

  const toggleLens = (lensId: string) => {
    setEditCompatibleLenses(prev => {
      if (prev === null) return [lensId];
      if (prev.includes(lensId)) {
        const next = prev.filter(id => id !== lensId);
        return next.length === 0 ? null : next;
      }
      return [...prev, lensId];
    });
  };

  const handleSave = async (e: FormEvent, id: string) => {
    e.preventDefault();
    setSaveError(null);
    setSaving(true);
    try {
      const updated = await api.updateCamera(id, {
        name: editName,
        maker: editMaker || undefined,
        film_type: editFilmType || null,
        compatible_lenses: editCompatibleLenses,
      });
      setItems(cs => cs.map(c => c.id === id ? updated : c));
      setEditingId(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
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
          <select value={filmType} onChange={e => setFilmType(e.target.value as "" | "roll" | "sheet")}>
            <option value="">Film format…</option>
            <option value="roll">Roll film</option>
            <option value="sheet">Sheet film</option>
          </select>
          <button type="submit" disabled={adding}>{adding ? "Adding…" : "Add"}</button>
        </form>
      )}
      {loading && <p className="muted">Loading…</p>}
      {loadError && <p className="form-error">{loadError}</p>}
      {!loading && !loadError && items.length === 0 && <p className="muted">No cameras yet.</p>}
      <ul className="gear-list">
        {items.map(c => (
          <li key={c.id} className="gear-row" style={editingId === c.id ? { flexWrap: "wrap" } : undefined}>
            {editingId === c.id ? (
              <form onSubmit={e => handleSave(e, c.id)} style={{ flex: "1 1 100%", display: "flex", flexDirection: "column", gap: 8 }}>
                {saveError && <p className="form-error" style={{ margin: 0 }}>{saveError}</p>}
                <div className="inline-form" style={{ margin: 0 }}>
                  <input placeholder="Name" value={editName} onChange={e => setEditName(e.target.value)} required />
                  <input placeholder="Maker (optional)" value={editMaker} onChange={e => setEditMaker(e.target.value)} />
                  <select value={editFilmType} onChange={e => setEditFilmType(e.target.value as "" | "roll" | "sheet")}>
                    <option value="">Film format…</option>
                    <option value="roll">Roll film</option>
                    <option value="sheet">Sheet film</option>
                  </select>
                  <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
                  <button type="button" onClick={cancelEdit}>Cancel</button>
                </div>
                {lenses.length > 0 && (
                  <div>
                    <p style={{ margin: "0 0 4px", fontSize: "0.85em", color: "var(--text-muted, #666)" }}>
                      Compatible lenses ({editCompatibleLenses === null ? "all" : `${editCompatibleLenses.length} selected`})
                    </p>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.9em", marginBottom: 4 }}>
                      <input
                        type="checkbox"
                        checked={editCompatibleLenses === null}
                        onChange={() => setEditCompatibleLenses(null)}
                      />
                      All lenses / no restriction
                    </label>
                    {lenses.map(l => (
                      <label key={l.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.9em", marginBottom: 2 }}>
                        <input
                          type="checkbox"
                          checked={editCompatibleLenses !== null && editCompatibleLenses.includes(l.id)}
                          onChange={() => toggleLens(l.id)}
                        />
                        {l.name}{l.focal_length_mm != null ? ` (${l.focal_length_mm}mm)` : ""}
                      </label>
                    ))}
                  </div>
                )}
              </form>
            ) : (
              <>
                <span className="gear-name">{c.name}</span>
                <span className="gear-meta">
                  {[
                    c.maker,
                    c.film_type === "roll" ? "Roll film" : c.film_type === "sheet" ? "Sheet film" : null,
                    c.compatible_lenses !== null ? `${c.compatible_lenses.length} lens${c.compatible_lenses.length === 1 ? "" : "es"}` : null,
                  ].filter(Boolean).join(" · ")}
                </span>
                <button className="link-btn" onClick={() => startEdit(c)}>Edit</button>
                <button className="gear-delete" onClick={() => handleDelete(c.id)} aria-label="Delete">×</button>
              </>
            )}
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editFocalLength, setEditFocalLength] = useState("");
  const [editMaxAperture, setEditMaxAperture] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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

  const startEdit = (l: Lens) => {
    setEditingId(l.id);
    setEditName(l.name);
    setEditFocalLength(l.focal_length_mm != null ? String(l.focal_length_mm) : "");
    setEditMaxAperture(l.max_aperture ?? "");
    setSaveError(null);
  };

  const cancelEdit = () => { setEditingId(null); setSaveError(null); };

  const handleSave = async (e: FormEvent, id: string) => {
    e.preventDefault();
    setSaveError(null);
    setSaving(true);
    try {
      const updated = await api.updateLens(id, {
        name: editName,
        focal_length_mm: editFocalLength ? parseFloat(editFocalLength) : undefined,
        max_aperture: editMaxAperture || undefined,
      });
      setItems(ls => ls.map(l => l.id === id ? updated : l));
      setEditingId(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
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
            {editingId === l.id ? (
              <form onSubmit={e => handleSave(e, l.id)} className="inline-form" style={{ flex: 1 }}>
                {saveError && <p className="form-error" style={{ width: "100%", margin: 0 }}>{saveError}</p>}
                <input placeholder="Name" value={editName} onChange={e => setEditName(e.target.value)} required />
                <input placeholder="Focal length mm" type="number" value={editFocalLength} onChange={e => setEditFocalLength(e.target.value)} />
                <input placeholder="Max aperture" value={editMaxAperture} onChange={e => setEditMaxAperture(e.target.value)} />
                <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
                <button type="button" onClick={cancelEdit}>Cancel</button>
              </form>
            ) : (
              <>
                <span className="gear-name">{l.name}</span>
                <span className="gear-meta">
                  {[l.focal_length_mm != null ? `${l.focal_length_mm}mm` : null, l.max_aperture]
                    .filter(Boolean).join(" · ")}
                </span>
                <button className="link-btn" onClick={() => startEdit(l)}>Edit</button>
                <button className="gear-delete" onClick={() => handleDelete(l.id)} aria-label="Delete">×</button>
              </>
            )}
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editIso, setEditIso] = useState("");
  const [editProcess, setEditProcess] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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

  const startEdit = (f: FilmStock) => {
    setEditingId(f.id);
    setEditName(f.name);
    setEditIso(f.iso != null ? String(f.iso) : "");
    setEditProcess(f.process ?? "");
    setSaveError(null);
  };

  const cancelEdit = () => { setEditingId(null); setSaveError(null); };

  const handleSave = async (e: FormEvent, id: string) => {
    e.preventDefault();
    setSaveError(null);
    setSaving(true);
    try {
      const updated = await api.updateFilm(id, {
        name: editName,
        iso: editIso ? parseInt(editIso, 10) : undefined,
        process: editProcess || undefined,
      });
      setItems(fs => fs.map(f => f.id === id ? updated : f));
      setEditingId(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
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
            {editingId === f.id ? (
              <form onSubmit={e => handleSave(e, f.id)} className="inline-form" style={{ flex: 1 }}>
                {saveError && <p className="form-error" style={{ width: "100%", margin: 0 }}>{saveError}</p>}
                <input placeholder="Name" value={editName} onChange={e => setEditName(e.target.value)} required />
                <input placeholder="ISO" type="number" value={editIso} onChange={e => setEditIso(e.target.value)} />
                <input placeholder="Process (C-41, E-6…)" value={editProcess} onChange={e => setEditProcess(e.target.value)} />
                <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
                <button type="button" onClick={cancelEdit}>Cancel</button>
              </form>
            ) : (
              <>
                <span className="gear-name">{f.name}</span>
                <span className="gear-meta">
                  {[f.iso != null ? `ISO ${f.iso}` : null, f.process].filter(Boolean).join(" · ")}
                </span>
                <button className="link-btn" onClick={() => startEdit(f)}>Edit</button>
                <button className="gear-delete" onClick={() => handleDelete(f.id)} aria-label="Delete">×</button>
              </>
            )}
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
