import React, { useEffect, useState, useMemo } from "react";
import { LuPencil, LuTrash2, LuPlus } from "react-icons/lu";
import { useStore } from "@/store/useStore";
import {
  getFabricGlobals,
  setFabricGlobals as setFabricGlobalsApi,
  getFabrics,
  saveFabric as saveFabricApi,
  deleteFabric as deleteFabricApi,
} from "../../../services/fabricService";
import { showConfirm } from "../../../services/systemService";
import { notify } from "@/utils/notify";
import styles from "./FabricsView.module.css";

const GLOBAL_FIELDS_GROUPED = [
  { key: "marginCotton",          label: "Margin Cotton",        unit: "mm" },
  { key: "marginPoly",            label: "Margin Poly",          unit: "mm" },
  { key: "defaultXmlWidthCotton", label: "XML Width Cotton",     unit: "mm" },
  { key: "defaultXmlWidthPoly",   label: "XML Width Poly",       unit: "mm" },
  { key: "defaultRollWidthCotton",label: "Roll Width Cotton",    unit: "mm" },
  { key: "defaultRollWidthPoly",  label: "Roll Width Poly",      unit: "mm" },
];

const DEFAULT_GLOBALS = {
  marginCotton: 10, marginPoly: 5,
  defaultXmlWidthCotton: 1420, defaultXmlWidthPoly: 1420,
  defaultRollWidthCotton: 1420, defaultRollWidthPoly: 1550,
};

const DEFAULT_NEW_FABRIC = {
  name: "", type: "Cottons", xmlWidth: 1420, rollWidth: 1420,
  isVelvet: false, isLinen: false, isBlossom: false,
};

const FLAG_DEFS = [
  { key: "isVelvet", label: "Velvet" },
  { key: "isLinen",  label: "Linen" },
  { key: "isBlossom",label: "Blossom" },
];

// ── Global Params Card ───────────────────────────────────────────────────────

const GlobalParamsCard = () => {
  const loadFabricConfig = useStore((s) => s.loadFabricConfig);
  const [values, setValues] = useState(DEFAULT_GLOBALS);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    getFabricGlobals().then((res) => {
      if (res?.success && res.data) setValues({ ...DEFAULT_GLOBALS, ...res.data });
    });
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const parsed = {};
      for (const { key } of GLOBAL_FIELDS_GROUPED) parsed[key] = Number(values[key]) || 0;
      const res = await setFabricGlobalsApi(parsed);
      if (res?.success) {
        await loadFabricConfig();
        notify({ type: "Success", title: "Saved", message: "Global fabric parameters updated." });
      } else {
        notify({ type: "Error", title: "Save failed", message: res?.error || "Could not save." });
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={`${styles.card} ${styles.card_globals}`}>
      <div className={styles.card_header}>
        <p className={styles.card_title}>Global Parameters</p>
        <p className={styles.card_desc}>
          Default margins and widths — used when no per-material value is set.
        </p>
      </div>
      <div className={styles.globals_body}>
        {GLOBAL_FIELDS_GROUPED.map(({ key, label, unit }) => (
          <div key={key} className={styles.globals_field}>
            <span className={styles.globals_label}>{label}</span>
            <div className={styles.globals_input_wrap}>
              <input
                type="number"
                className={styles.globals_input}
                value={values[key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                spellCheck={false}
              />
              <span className={styles.globals_unit}>{unit}</span>
            </div>
          </div>
        ))}
      </div>
      <div className={styles.globals_footer}>
        <button className={styles.save_btn} onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
};

// ── Edit Panel ───────────────────────────────────────────────────────────────

const EditPanel = ({ fabric, title, onSave, onCancel, isSaving }) => {
  const [draft, setDraft] = useState({ ...fabric });
  const set = (key, val) => setDraft((d) => ({ ...d, [key]: val }));

  return (
    <div className={styles.edit_panel}>
      <p className={styles.edit_panel_title}>{title}</p>
      <div className={styles.edit_row}>
        <div className={styles.edit_name_wrap}>
          <span className={styles.edit_field_label}>Name</span>
          <input
            className={styles.edit_name}
            value={draft.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Material name…"
            autoFocus
            spellCheck={false}
          />
        </div>

        <div className={styles.type_toggle}>
          <span className={styles.edit_field_label}>Type</span>
          <div className={styles.type_toggle_btns}>
            <button
              type="button"
              className={`${styles.type_btn} ${draft.type === "Cottons" ? styles.type_btn_active_cottons : ""}`}
              onClick={() => set("type", "Cottons")}
            >
              Cottons
            </button>
            <button
              type="button"
              className={`${styles.type_btn} ${draft.type === "Polyesters" ? styles.type_btn_active_polyesters : ""}`}
              onClick={() => set("type", "Polyesters")}
            >
              Polyesters
            </button>
          </div>
        </div>

        <div className={styles.width_field}>
          <span className={styles.edit_field_label}>XML Width</span>
          <div className={styles.width_input_wrap}>
            <input
              type="number"
              className={styles.width_input}
              value={draft.xmlWidth}
              onChange={(e) => set("xmlWidth", Number(e.target.value))}
            />
            <span className={styles.width_unit}>mm</span>
          </div>
        </div>

        <div className={styles.width_field}>
          <span className={styles.edit_field_label}>Roll Width</span>
          <div className={styles.width_input_wrap}>
            <input
              type="number"
              className={styles.width_input}
              value={draft.rollWidth}
              onChange={(e) => set("rollWidth", Number(e.target.value))}
            />
            <span className={styles.width_unit}>mm</span>
          </div>
        </div>

        <div className={styles.flags_wrap}>
          <span className={styles.edit_field_label}>Flags</span>
          <div className={styles.flags_row}>
            {FLAG_DEFS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={`${styles.flag_toggle} ${draft[key] ? styles.flag_toggle_active : ""}`}
                onClick={() => set(key, !draft[key])}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className={styles.edit_actions}>
          <button className={styles.cancel_btn} onClick={onCancel}>Cancel</button>
          <button
            className={styles.save_row_btn}
            onClick={() => onSave(draft)}
            disabled={isSaving || !draft.name.trim()}
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Materials Card ───────────────────────────────────────────────────────────

const MaterialsCard = () => {
  const loadFabricConfig = useStore((s) => s.loadFabricConfig);
  const [fabrics, setFabrics] = useState([]);
  const [typeFilter, setTypeFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [editingName, setEditingName] = useState(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadFabrics = async () => {
    const res = await getFabrics();
    if (res?.success) setFabrics(res.data);
  };

  useEffect(() => { loadFabrics(); }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return fabrics.filter((f) => {
      if (typeFilter !== "All" && f.type !== typeFilter) return false;
      if (q && !f.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [fabrics, typeFilter, search]);

  const counts = useMemo(() => ({
    all: fabrics.length,
    cottons: fabrics.filter((f) => f.type === "Cottons").length,
    polyesters: fabrics.filter((f) => f.type === "Polyesters").length,
  }), [fabrics]);

  const editingFabric = useMemo(
    () => editingName !== null ? fabrics.find((f) => f.name === editingName) : null,
    [editingName, fabrics],
  );

  const handleSave = async (oldName, fabric) => {
    setIsSaving(true);
    try {
      const res = await saveFabricApi(oldName, {
        ...fabric,
        xmlWidth: Number(fabric.xmlWidth),
        rollWidth: Number(fabric.rollWidth),
        isVelvet: fabric.isVelvet ? 1 : 0,
        isLinen: fabric.isLinen ? 1 : 0,
        isBlossom: fabric.isBlossom ? 1 : 0,
      });
      if (res?.success) {
        await loadFabrics();
        await loadFabricConfig();
        setEditingName(null);
        setIsAdding(false);
        notify({ type: "Success", title: "Saved", message: `Material "${fabric.name}" saved.` });
      } else {
        notify({ type: "Error", title: "Save failed", message: res?.error || "Could not save." });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (name) => {
    const confirmed = await showConfirm(`Delete material "${name}"? This cannot be undone.`);
    if (!confirmed) return;
    const res = await deleteFabricApi(name);
    if (res?.success) {
      await loadFabrics();
      await loadFabricConfig();
      if (editingName === name) setEditingName(null);
      notify({ type: "Success", title: "Deleted", message: `Material "${name}" removed.` });
    } else {
      notify({ type: "Error", title: "Delete failed", message: res?.error || "Could not delete." });
    }
  };

  const handleStartEdit = (name) => {
    setEditingName(name);
    setIsAdding(false);
  };

  const handleStartAdd = () => {
    setIsAdding(true);
    setEditingName(null);
  };

  const handleCancel = () => {
    setEditingName(null);
    setIsAdding(false);
  };

  return (
    <div className={styles.card}>
      <div className={styles.card_header}>
        <p className={styles.card_title}>Materials</p>
        <p className={styles.card_desc}>
          Controls printer routing (Cottons → DGEN, Polyesters → YOKO/YUMI), XML width, roll width, and special flags.
        </p>
      </div>

      <div className={styles.materials_toolbar}>
        <div className={styles.filter_group}>
          {[
            { id: "All",        label: `All (${counts.all})` },
            { id: "Cottons",    label: `Cottons (${counts.cottons})` },
            { id: "Polyesters", label: `Polyesters (${counts.polyesters})` },
          ].map(({ id, label }) => (
            <button
              key={id}
              className={`${styles.filter_btn} ${typeFilter === id ? styles.filter_btn_active : ""}`}
              onClick={() => setTypeFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          className={styles.search_input}
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          spellCheck={false}
        />
      </div>

      {visible.length === 0 ? (
        <div className={styles.empty_state}>
          {search ? "No materials match the search." : "No materials found."}
        </div>
      ) : (
        <div className={styles.mat_columns}>
          {[0, 1].map((col) => (
            <div key={col} className={styles.mat_column}>
              {visible.filter((_, i) => i % 2 === col).map((fabric) => {
                const isEditing = editingName === fabric.name;
                const activeFlags = FLAG_DEFS.filter(({ key }) => fabric[key]);
                return (
                  <React.Fragment key={fabric.name}>
                    <div className={`${styles.mat_row} ${isEditing ? styles.mat_row_editing : ""}`}>
                      <span className={styles.mat_row_name}>{fabric.name}</span>
                      <div className={styles.mat_row_badges}>
                        <span className={`${styles.mat_type_badge} ${fabric.type === "Cottons" ? styles.mat_type_cottons : styles.mat_type_polyesters}`}>
                          {fabric.type === "Cottons" ? "Cotton" : "Poly"}
                        </span>
                        {activeFlags.map(({ key, label }) => (
                          <span key={key} className={styles.mat_flag}>{label}</span>
                        ))}
                      </div>
                      <span className={styles.mat_row_width}>
                        <span className={styles.mat_row_width_label}>XML</span>
                        {fabric.xmlWidth} mm
                      </span>
                      <span className={styles.mat_row_width}>
                        <span className={styles.mat_row_width_label}>Roll</span>
                        {fabric.rollWidth} mm
                      </span>
                      <div className={styles.mat_row_actions}>
                        <button
                          className={styles.mat_icon_btn}
                          onClick={() => handleStartEdit(fabric.name)}
                          title="Edit"
                        >
                          <LuPencil size={12} />
                        </button>
                        <button
                          className={`${styles.mat_icon_btn} ${styles.mat_icon_btn_danger}`}
                          onClick={() => handleDelete(fabric.name)}
                          title="Delete"
                        >
                          <LuTrash2 size={12} />
                        </button>
                      </div>
                    </div>
                    {isEditing && (
                      <div className={styles.edit_panel_inline}>
                        <EditPanel
                          fabric={{
                            ...fabric,
                            isVelvet: !!fabric.isVelvet,
                            isLinen: !!fabric.isLinen,
                            isBlossom: !!fabric.isBlossom,
                          }}
                          title={`Editing: ${fabric.name}`}
                          onSave={(draft) => handleSave(fabric.name, draft)}
                          onCancel={handleCancel}
                          isSaving={isSaving}
                        />
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
              {isAdding && col === 0 && (
                <div className={styles.edit_panel_inline}>
                  <EditPanel
                    fabric={DEFAULT_NEW_FABRIC}
                    title="New material"
                    onSave={(draft) => handleSave(null, draft)}
                    onCancel={handleCancel}
                    isSaving={isSaving}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className={styles.add_area}>
        <button className={styles.add_btn} onClick={handleStartAdd}>
          <LuPlus size={14} />
          Add material
        </button>
      </div>
    </div>
  );
};

// ── Main view ────────────────────────────────────────────────────────────────

const FabricsView = () => (
  <div className={styles.layout}>
    <GlobalParamsCard />
    <MaterialsCard />
  </div>
);

export default FabricsView;
