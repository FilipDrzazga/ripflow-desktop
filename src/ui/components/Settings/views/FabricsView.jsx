import React, { useEffect, useState, useMemo } from "react";
import { LuPencil, LuTrash2, LuPlus } from "react-icons/lu";
import { useStore } from "@/store/useStore";
import {
  setFabricGlobals as setFabricGlobalsApi,
  getFabrics,
  saveFabric as saveFabricApi,
  deleteFabric as deleteFabricApi,
} from "../../../services/fabricService";
import { getShopProfile, setShopProfile } from "../../../services/profileService";
import { showConfirm } from "../../../services/systemService";
import { notify } from "@/utils/notify";
import { saveClassNumbers } from "@/utils/saveClassNumbers";
import { PROFILE_STATUS } from "@/utils/profileStatus";
import { classGlobalsFromProfile } from "../../../../shared/classGlobals";
import { MARGIN_COTTON, MARGIN_POLY, LM_ROLL_COTTON_DEFAULT, LM_ROLL_POLY } from "../../../../shared/printWidths";
import styles from "./FabricsView.module.css";

// The class numbers (ETAP 2g-3c): owned by the shop profile's materialClasses, edited here.
// The two "XML Width Cotton/Poly" fields are gone - no reader since 0bf8aa6, the editor lied.
// Grid order: the grid has two columns, so Cotton sits left and Poly right on each row.
const GLOBAL_FIELDS_GROUPED = [
  { key: "marginCotton", label: "Margin Cotton", unit: "mm" },
  { key: "marginPoly", label: "Margin Poly", unit: "mm" },
  { key: "defaultRollWidthCotton", label: "Roll Width Cotton", unit: "mm" },
  { key: "defaultRollWidthPoly", label: "Roll Width Poly", unit: "mm" },
];

// What the estimator uses for a number the profile does not carry - shown, so the field says
// what is in effect rather than a blank.
const CLASS_CONSTANTS = {
  marginCotton: MARGIN_COTTON,
  marginPoly: MARGIN_POLY,
  defaultRollWidthCotton: LM_ROLL_COTTON_DEFAULT,
  defaultRollWidthPoly: LM_ROLL_POLY,
};

const valuesFromProfile = (profile) => ({ ...CLASS_CONSTANTS, ...classGlobalsFromProfile(profile) });

const DEFAULT_NEW_FABRIC = {
  name: "",
  type: "Cottons",
  xmlWidth: 1420,
  rollWidth: 1420,
  isVelvet: false,
  isLinen: false,
  isBlossom: false,
  alias: "",
};

const FLAG_DEFS = [
  { key: "isVelvet", label: "Velvet" },
  { key: "isLinen", label: "Linen" },
  { key: "isBlossom", label: "Blossom" },
];

// ── Global Params Card ───────────────────────────────────────────────────────

const GlobalParamsCard = () => {
  const shopProfile = useStore((s) => s.shopProfile);
  const shopProfileStatus = useStore((s) => s.shopProfileStatus);
  const loadShopProfile = useStore((s) => s.loadShopProfile);
  const profileFailed = shopProfileStatus === PROFILE_STATUS.FAILED;
  // The form follows the stored profile: filled when it loads, refilled after every save
  // (loadShopProfile). Adjusting state during render instead of an effect -
  // react-hooks/set-state-in-effect.
  const [loadedFrom, setLoadedFrom] = useState(shopProfile);
  const [values, setValues] = useState(() => valuesFromProfile(shopProfile));
  if (loadedFrom !== shopProfile) {
    setLoadedFrom(shopProfile);
    setValues(valuesFromProfile(shopProfile));
  }
  const initialValues = valuesFromProfile(shopProfile);
  // The profile was saved but the fabric_globals copy was not: the form then matches the
  // profile, and Save must stay available to retry the copy.
  const [legacyPending, setLegacyPending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { outcome, error } = await saveClassNumbers(values, {
        getProfile: getShopProfile,
        setProfile: setShopProfile,
        setLegacyGlobals: setFabricGlobalsApi,
      });
      // Reload whatever happened after a write was attempted: main reloads its cache from the
      // DB after profile:set, so the store and the estimates show what the DB holds now.
      if (outcome !== "no-profile" && outcome !== "missing-class") await loadShopProfile();
      setLegacyPending(outcome === "legacy-failed");
      if (outcome === "saved") {
        notify({ type: "Success", title: "Saved", message: "Material class numbers updated." });
      } else if (outcome === "legacy-failed") {
        notify({
          type: "Error",
          title: "Saved only in part",
          message: `The shop profile was saved, but the copy read by stations on older versions was not (${error}). Press Save again.`,
        });
      } else if (outcome === "profile-failed") {
        notify({ type: "Error", title: "Save failed", message: `${error} The form now shows what the database holds.` });
      } else {
        notify({ type: "Error", title: "Save failed", message: `${error} Nothing was changed.` });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const hasInvalid = GLOBAL_FIELDS_GROUPED.some(({ key }) => {
    const v = Number(values[key]);
    return !v || v <= 0;
  });

  const isUnchanged =
    !legacyPending && GLOBAL_FIELDS_GROUPED.every(({ key }) => Number(values[key]) === Number(initialValues[key]));

  return (
    <div className={`${styles.card} ${styles.card_globals}`}>
      <div className={styles.card_header}>
        <p className={styles.card_title}>Global Parameters</p>
        <p className={styles.card_desc}>
          Margins and roll widths per material class — the roll width is used when a material has none set.
        </p>
      </div>
      <div className={styles.globals_body}>
        {GLOBAL_FIELDS_GROUPED.map(({ key, label, unit }) => {
          const invalid = !Number(values[key]) || Number(values[key]) <= 0;
          return (
            <div key={key} className={styles.globals_field}>
              <span className={styles.globals_label}>{label}</span>
              <div className={styles.globals_input_wrap}>
                <input
                  type="number"
                  className={`${styles.globals_input} ${invalid ? styles.globals_input_error : ""}`}
                  value={values[key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                  spellCheck={false}
                />
                <span className={styles.globals_unit}>{unit}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className={styles.globals_footer}>
        {profileFailed && (
          <p className={styles.globals_error_msg}>The shop profile could not be read — these numbers cannot be saved.</p>
        )}
        {hasInvalid && <p className={styles.globals_error_msg}>All values must be greater than 0.</p>}
        <button
          className={styles.save_btn}
          onClick={handleSave}
          disabled={isSaving || hasInvalid || isUnchanged || !shopProfile}
        >
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

        <div className={styles.edit_name_wrap}>
          <span className={styles.edit_field_label}>Alias</span>
          <input
            className={styles.edit_name}
            value={draft.alias ?? ""}
            onChange={(e) => set("alias", e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
            placeholder="Alias path…"
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
          <button className={styles.cancel_btn} onClick={onCancel}>
            Cancel
          </button>
          <button className={styles.save_row_btn} onClick={() => onSave(draft)} disabled={isSaving || !draft.name.trim()}>
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

  useEffect(() => {
    loadFabrics();
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return fabrics.filter((f) => {
      if (typeFilter !== "All" && f.type !== typeFilter) return false;
      if (q && !f.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [fabrics, typeFilter, search]);

  const counts = useMemo(
    () => ({
      all: fabrics.length,
      cottons: fabrics.filter((f) => f.type === "Cottons").length,
      polyesters: fabrics.filter((f) => f.type === "Polyesters").length,
    }),
    [fabrics],
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
        alias: (fabric.alias || "").trim() || null,
      });
      if (res?.success) {
        await loadFabrics();
        await loadFabricConfig();
        setEditingName(null);
        setIsAdding(false);
        notify({ type: "Success", title: "Saved", message: `Material "${fabric.name}" saved.` });
      } else {
        notify({
          type: "Error",
          title: "Save failed",
          message: res?.error || "Could not save — check the database connection.",
        });
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
      notify({
        type: "Error",
        title: "Delete failed",
        message: res?.error || "Could not delete — check the database connection.",
      });
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
            { id: "All", label: `All (${counts.all})` },
            { id: "Cottons", label: `Cottons (${counts.cottons})` },
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
        <div className={styles.empty_state}>{search ? "No materials match the search." : "No materials found."}</div>
      ) : (
        <div className={styles.mat_columns}>
          {[0, 1].map((col) => (
            <div key={col} className={styles.mat_column}>
              {visible
                .filter((_, i) => i % 2 === col)
                .map((fabric) => {
                  const isEditing = editingName === fabric.name;
                  const activeFlags = FLAG_DEFS.filter(({ key }) => fabric[key]);
                  return (
                    <React.Fragment key={fabric.name}>
                      <div className={`${styles.mat_row} ${isEditing ? styles.mat_row_editing : ""}`}>
                        <span className={styles.mat_row_name}>{fabric.name}</span>
                        {fabric.alias ? (
                          <span className={styles.mat_flag} title="Path alias">{`→ ${fabric.alias}`}</span>
                        ) : null}
                        <div className={styles.mat_row_badges}>
                          <span
                            className={`${styles.mat_type_badge} ${fabric.type === "Cottons" ? styles.mat_type_cottons : styles.mat_type_polyesters}`}
                          >
                            {fabric.type === "Cottons" ? "Cotton" : "Poly"}
                          </span>
                          {activeFlags.map(({ key, label }) => (
                            <span key={key} className={styles.mat_flag}>
                              {label}
                            </span>
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
