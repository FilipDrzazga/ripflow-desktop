import { useEffect, useState } from "react";
import { LuPencil, LuChevronDown, LuPlus } from "react-icons/lu";
import { useStore } from "@/store/useStore";
import { resolveIcon, ICON_OPTIONS } from "@/constants/rollbackReasonIcons";
import { setReasonDefinitions } from "../../../services/reasonDefsService";
import { notify } from "@/utils/notify";
import viewStyles from "./SettingsView.module.css";
import styles from "./RollbackReasonsView.module.css";

const generateCode = (label) =>
  label.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");

const DEFAULT_NEW = { label: "", iconName: "LuEllipsis" };

const RollbackReasonsView = () => {
  const reasonDefinitions = useStore((s) => s.reasonDefinitions);
  const loadReasonDefinitions = useStore((s) => s.loadReasonDefinitions);

  const [draft, setDraft] = useState(() => reasonDefinitions.map((r) => ({ ...r })));
  const [editingCode, setEditingCode] = useState(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [isAdding, setIsAdding] = useState(false);
  const [newReason, setNewReason] = useState(DEFAULT_NEW);
  const [addIconPickerOpen, setAddIconPickerOpen] = useState(false);

  useEffect(() => {
    if (!editingCode) {
      setDraft(reasonDefinitions.map((r) => ({ ...r })));
    }
  }, [reasonDefinitions, editingCode]);

  const handleStartEdit = (code) => {
    setEditingCode(code);
    setIconPickerOpen(false);
    setIsAdding(false);
    setAddIconPickerOpen(false);
  };

  const handleCancelEdit = () => {
    const original = reasonDefinitions.find((r) => r.code === editingCode);
    if (original) {
      setDraft((prev) => prev.map((r) => (r.code === editingCode ? { ...original } : r)));
    }
    setEditingCode(null);
    setIconPickerOpen(false);
  };

  const handleLabelChange = (code, label) => {
    setDraft((prev) => prev.map((r) => (r.code === code ? { ...r, label } : r)));
  };

  const handleIconSelect = (iconName) => {
    setDraft((prev) => prev.map((r) => (r.code === editingCode ? { ...r, iconName } : r)));
    setIconPickerOpen(false);
  };

  const handleSave = async (nextDraft = draft) => {
    setIsSaving(true);
    try {
      const res = await setReasonDefinitions(nextDraft);
      if (res.success) {
        await loadReasonDefinitions();
        setEditingCode(null);
        setIconPickerOpen(false);
        notify({ type: "Success", title: "Saved", message: "Rollback reasons updated." });
      } else {
        notify({ type: "Error", title: "Save failed", message: res.error || "Could not save — check the database connection." });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartAdd = () => {
    setIsAdding(true);
    setNewReason(DEFAULT_NEW);
    setAddIconPickerOpen(false);
    setEditingCode(null);
    setIconPickerOpen(false);
  };

  const handleCancelAdd = () => {
    setIsAdding(false);
    setNewReason(DEFAULT_NEW);
    setAddIconPickerOpen(false);
  };

  const handleAddSave = async () => {
    const code = generateCode(newReason.label);
    if (!code) {
      notify({ type: "Error", title: "Invalid label", message: "Label cannot be empty." });
      return;
    }
    if (draft.some((r) => r.code === code)) {
      notify({ type: "Error", title: "Duplicate code", message: `A reason with code "${code}" already exists.` });
      return;
    }
    const nextDraft = [...draft, { code, label: newReason.label.trim(), iconName: newReason.iconName }];
    setDraft(nextDraft);
    setIsAdding(false);
    setNewReason(DEFAULT_NEW);
    setAddIconPickerOpen(false);
    await handleSave(nextDraft);
  };

  const previewCode = generateCode(newReason.label);
  const NewIcon = resolveIcon(newReason.iconName);

  return (
    <div className={viewStyles.view}>
      <div className={viewStyles.view_header}>
        <h2 className={viewStyles.view_title}>Rollback Reasons</h2>
        <p className={viewStyles.view_desc}>
          Customise the label and icon for each reason. Codes stored in the database never change.
        </p>
      </div>

      <div className={styles.list}>
        {draft.map((reason) => {
          const Icon = resolveIcon(reason.iconName);
          const isEditing = editingCode === reason.code;
          const isOther = reason.code === "OTHER";

          if (isEditing) {
            const original = reasonDefinitions.find((r) => r.code === reason.code);
            const isUnchanged = original
              ? (isOther
                  ? reason.iconName === original.iconName
                  : reason.label === original.label && reason.iconName === original.iconName)
              : false;
            const labelEmpty = !isOther && !reason.label.trim();

            return (
              <div key={reason.code} className={styles.row_editing}>
                <div className={styles.edit_wrap}>
                  <div className={styles.edit_controls}>
                    <button
                      className={styles.icon_trigger}
                      onClick={() => setIconPickerOpen((v) => !v)}
                      title="Change icon"
                    >
                      {Icon && <Icon size={15} />}
                      <LuChevronDown size={12} />
                    </button>
                    <input
                      className={styles.label_input}
                      value={reason.label}
                      onChange={(e) => handleLabelChange(reason.code, e.target.value)}
                      disabled={isOther}
                      autoFocus={!isOther}
                      spellCheck={false}
                    />
                    <div className={styles.row_actions}>
                      <button className={styles.cancel_btn} onClick={handleCancelEdit}>
                        Cancel
                      </button>
                      <button className={styles.save_row_btn} onClick={() => handleSave()} disabled={isSaving || isUnchanged || labelEmpty}>
                        {isSaving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </div>

                  {iconPickerOpen && (
                    <div className={styles.icon_picker}>
                      {ICON_OPTIONS.map((opt) => {
                        const OptIcon = opt.component;
                        return (
                          <button
                            key={opt.name}
                            className={`${styles.icon_opt} ${reason.iconName === opt.name ? styles.icon_opt_active : ""}`}
                            onClick={() => handleIconSelect(opt.name)}
                            title={opt.name}
                          >
                            <OptIcon size={16} />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          }

          return (
            <div key={reason.code} className={styles.row}>
              <div className={styles.row_view}>
                <span className={styles.row_icon}>
                  {Icon && <Icon size={15} />}
                </span>
                <span className={styles.row_label}>{reason.label}</span>
                {isOther && <span className={styles.row_locked_badge}>label locked</span>}
                <button className={styles.edit_btn} onClick={() => handleStartEdit(reason.code)}>
                  <LuPencil size={13} />
                </button>
              </div>
            </div>
          );
        })}

        {isAdding && (
          <div className={styles.row_editing}>
            <div className={styles.edit_wrap}>
              <div className={styles.edit_controls}>
                <button
                  className={styles.icon_trigger}
                  onClick={() => setAddIconPickerOpen((v) => !v)}
                  title="Choose icon"
                >
                  {NewIcon && <NewIcon size={15} />}
                  <LuChevronDown size={12} />
                </button>
                <input
                  className={styles.label_input}
                  value={newReason.label}
                  onChange={(e) => setNewReason((r) => ({ ...r, label: e.target.value }))}
                  placeholder="Reason label…"
                  autoFocus
                  spellCheck={false}
                />
                <div className={styles.row_actions}>
                  <button className={styles.cancel_btn} onClick={handleCancelAdd}>
                    Cancel
                  </button>
                  <button
                    className={styles.save_row_btn}
                    onClick={handleAddSave}
                    disabled={isSaving || !newReason.label.trim()}
                  >
                    {isSaving ? "Saving…" : "Add"}
                  </button>
                </div>
              </div>

              {previewCode && (
                <p className={styles.code_preview}>
                  Code: <span>{previewCode}</span>
                </p>
              )}

              {addIconPickerOpen && (
                <div className={styles.icon_picker}>
                  {ICON_OPTIONS.map((opt) => {
                    const OptIcon = opt.component;
                    return (
                      <button
                        key={opt.name}
                        className={`${styles.icon_opt} ${newReason.iconName === opt.name ? styles.icon_opt_active : ""}`}
                        onClick={() => {
                          setNewReason((r) => ({ ...r, iconName: opt.name }));
                          setAddIconPickerOpen(false);
                        }}
                        title={opt.name}
                      >
                        <OptIcon size={16} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {!isAdding && (
        <div className={styles.add_area}>
          <button className={styles.add_btn} onClick={handleStartAdd}>
            <LuPlus size={14} />
            Add reason
          </button>
        </div>
      )}
    </div>
  );
};

export default RollbackReasonsView;
