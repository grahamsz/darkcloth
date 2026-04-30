import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { Camera, Lens, FilmStock, Roll } from "../api/client";

type Section = "cameras" | "lenses" | "films" | "rolls";

interface GearPageProps {
  section: Section;
}

function CamerasSection() {
  const [items, setItems] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [maker, setMaker] = useState("");
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    api.listCameras()
      .then(r => setItems(r.cameras))
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      const { camera } = await api.createCamera({ name, maker: maker || null });
      setItems(c => [...c, camera]);
      setName(""); setMaker(""); setShowForm(false);
    } finally {
      setAdding(false);
    }
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
          <input placeholder="Name" value={name} onChange={e => setName(e.target.value)} required />
          <input placeholder="Maker (optional)" value={maker} onChange={e => setMaker(e.target.value)} />
          <button type="submit" disabled={adding}>{adding ? "Adding…" : "Add"}</button>
        </form>
      )}
      {loading && <p className="muted">Loading…</p>}
      {!loading && items.length === 0 && <p className="muted">No cameras yet.</p>}
      <ul className="gear-list">
        {items.map(c => (
          <li key={c.id} className="gear-row">
            <span className="gear-name">{c.name}</span>
            {c.maker && <span className="gear-meta">{c.maker}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function LensesSection() {
  const [items, setItems] = useState<Lens[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [focalLength, setFocalLength] = useState("");
  const [maxAperture, setMaxAperture] = useState("");
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    api.listLenses()
      .then(r => setItems(r.lenses))
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      const { lens } = await api.createLens({
        name,
        focal_length_mm: focalLength ? parseFloat(focalLength) : null,
        max_aperture: maxAperture || null,
      });
      setItems(l => [...l, lens]);
      setName(""); setFocalLength(""); setMaxAperture(""); setShowForm(false);
    } finally {
      setAdding(false);
    }
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
          <input placeholder="Name" value={name} onChange={e => setName(e.target.value)} required />
          <input placeholder="Focal length (mm)" type="number" value={focalLength} onChange={e => setFocalLength(e.target.value)} />
          <input placeholder="Max aperture" value={maxAperture} onChange={e => setMaxAperture(e.target.value)} />
          <button type="submit" disabled={adding}>{adding ? "Adding…" : "Add"}</button>
        </form>
      )}
      {loading && <p className="muted">Loading…</p>}
      {!loading && items.length === 0 && <p className="muted">No lenses yet.</p>}
      <ul className="gear-list">
        {items.map(l => (
          <li key={l.id} className="gear-row">
            <span className="gear-name">{l.name}</span>
            <span className="gear-meta">
              {[l.focal_length_mm != null ? `${l.focal_length_mm}mm` : null, l.max_aperture]
                .filter(Boolean).join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FilmsSection() {
  const [items, setItems] = useState<FilmStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [iso, setIso] = useState("");
  const [process, setProcess] = useState("");
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    api.listFilms()
      .then(r => setItems(r.films))
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      const { film } = await api.createFilm({
        name,
        iso: iso ? parseInt(iso, 10) : null,
        process: process || null,
      });
      setItems(f => [...f, film]);
      setName(""); setIso(""); setProcess(""); setShowForm(false);
    } finally {
      setAdding(false);
    }
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
          <input placeholder="Name" value={name} onChange={e => setName(e.target.value)} required />
          <input placeholder="ISO" type="number" value={iso} onChange={e => setIso(e.target.value)} />
          <input placeholder="Process (C-41, E-6…)" value={process} onChange={e => setProcess(e.target.value)} />
          <button type="submit" disabled={adding}>{adding ? "Adding…" : "Add"}</button>
        </form>
      )}
      {loading && <p className="muted">Loading…</p>}
      {!loading && items.length === 0 && <p className="muted">No film stocks yet.</p>}
      <ul className="gear-list">
        {items.map(f => (
          <li key={f.id} className="gear-row">
            <span className="gear-name">{f.name}</span>
            <span className="gear-meta">
              {[f.iso != null ? `ISO ${f.iso}` : null, f.process].filter(Boolean).join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RollsSection() {
  const [items, setItems] = useState<Roll[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    api.listRolls()
      .then(r => setItems(r.rolls))
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      const { roll } = await api.createRoll({ name });
      setItems(r => [...r, roll]);
      setName(""); setShowForm(false);
    } finally {
      setAdding(false);
    }
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
          <input placeholder="Roll name" value={name} onChange={e => setName(e.target.value)} required />
          <button type="submit" disabled={adding}>{adding ? "Adding…" : "Add"}</button>
        </form>
      )}
      {loading && <p className="muted">Loading…</p>}
      {!loading && items.length === 0 && <p className="muted">No rolls yet.</p>}
      <ul className="gear-list">
        {items.map(r => (
          <li key={r.id} className="gear-row">
            <span className="gear-name">{r.name}</span>
            <span className="gear-meta">
              {r.developed_at ? "Developed" : r.loaded_at ? "Loaded" : "Not loaded"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GearPage({ section }: GearPageProps) {
  return (
    <div className="page">
      {section === "cameras" && <CamerasSection />}
      {section === "lenses" && <LensesSection />}
      {section === "films" && <FilmsSection />}
      {section === "rolls" && <RollsSection />}
    </div>
  );
}
