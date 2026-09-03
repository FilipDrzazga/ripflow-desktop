import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../../store/useStore";
import { notify } from "../../utils/notify";
import ContextMenu from "../ContextMenu/ContextMenu";
import PdfPreviewModal from "../PdfPreviewModal/PdfPreviewModal";
import { usePdfPreview } from "../../hooks/usePdfPreview";
import { estimatePrintLength } from "../../../shared/estimatePrintLength";
import { FILE_STATUS } from "../../../shared/constants";
import { resolveIcon } from "../../constants/rollbackReasonIcons";
import { openInFolder as openInFolderApi, openInShopify as openInShopifyApi } from "../../services/fileService";
import { isFeatureEnabled } from "../../utils/featureVisibility";
import { FiInbox, FiLock, FiUnlock } from "react-icons/fi";
import {
  LuClock,
  LuFile,
  LuFileText,
  LuLeaf,
  LuCircleHelp,
  LuCircleCheck,
  LuCircleX,
  LuTriangleAlert,
  LuEye,
  LuPencil,
  LuRotateCcw,
} from "react-icons/lu";
import { PiPolygon } from "react-icons/pi";
import { PRINT_TYPE_MAP } from "@/constants/printTypeMap";
import style from "./DataList.module.css";

const formatFileSize = (bytes) => {
  if (bytes == null) return null;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
};

// Original printed quantity for override comparisons: meters for LM, piece count otherwise.
const getOriginalQty = (item) =>
  item.printTypeCode === "LM" ? (item.height != null ? item.height / 1000 : null) : item.qty;

const MATERIAL_MAP = {
  Cottons: { Icon: LuLeaf, color: "#3B6D11", label: "Cottons" },
  Polyesters: { Icon: PiPolygon, color: "#185FA5", label: "Polyesters" },
  Unknown: { Icon: LuCircleHelp, color: "#888780", label: "Unknown" },
};

const STATUS_MAP = {
  READY: { Icon: LuCircleCheck, color: "#3B6D11" },
  INVALID: { Icon: LuCircleX, color: "#A32D2D" },
  WARNING: { Icon: LuTriangleAlert, color: "#BA7517" },
};

const DataList = () => {
  const filteredFiles = useStore((state) => state.filteredFiles);
  const fabricConfig = useStore((state) => state.fabricConfig);
  const selectedIds = useStore((state) => state.selectedIds);
  const isBatchSubmitting = useStore((state) => state.isBatchSubmitting);
  const heldIds = useStore((state) => state.heldIds);
  const heldReasons = useStore((state) => state.heldReasons);
  const rollbackReasons = useStore((state) => state.rollbackReasons);
  // The inbox entry to Shopify; the others are the two Production context-menu items
  // and the BatchHistory one, whose components already read the profile. Gated at the
  // call site below, fail-closed: a profile we could not read grants nothing.
  const shopProfile = useStore((state) => state.shopProfile);
  const reasonDefinitions = useStore((state) => state.reasonDefinitions);
  const toggleGroupSelection = useStore((state) => state.toggleGroupSelection);
  const toggleItemSelection = useStore((state) => state.toggleItemSelection);
  const toggleHold = useStore((state) => state.toggleHold);
  const holdSelectedFiles = useStore((state) => state.holdSelectedFiles);
  const selectedOverrides = useStore((state) => state.selectedOverrides);
  const setOverridesBulk = useStore((state) => state.setOverridesBulk);
  const clearOverride = useStore((state) => state.clearOverride);
  const [contextMenu, setContextMenu] = useState(null);
  const [holdModal, setHoldModal] = useState(null);
  const [holdReason, setHoldReason] = useState("");
  const [overrideModal, setOverrideModal] = useState(null);
  const [overrideValue, setOverrideValue] = useState("");
  const activeContextItemId = contextMenu?.item?.id || null;
  const { openPreview, closePreview, navigate, isOpen, isLoading, imgSrc, error, currentPath, currentIndex, fileList } =
    usePdfPreview();

  const lockMaterial = useMemo(() => {
    const types = new Set();
    filteredFiles.forEach((group) => {
      group.items.forEach((item) => {
        if (selectedIds.has(item.id)) types.add(item.materialType);
      });
    });
    return types.size === 1 ? [...types][0] : null;
  }, [filteredFiles, selectedIds]);

  const hasSelection = selectedIds.size > 0;
  const hasItems = filteredFiles.some((group) => group.items.length > 0);

  const handleGroupCheckboxChange = (e, group) => {
    e.stopPropagation();
    toggleGroupSelection(group.items);
  };
  const handleItemCheckboxChange = (e, item) => {
    e.stopPropagation();
    toggleItemSelection(item.id);
  };
  const closeContextMenu = () => setContextMenu(null);

  // Apply the entered quantity to every file the override modal targets (one file, or the
  // whole selection in bulk mode). Each file is interpreted by its own print type (meters
  // for LM, pieces otherwise); a value equal to a file's original is skipped (no-op override).
  const applyOverride = () => {
    if (!overrideModal) return;
    const val = Number(overrideValue);
    const items = overrideModal.bulk ? overrideModal.items : [overrideModal.item];
    const entries = [];
    items.forEach((it) => {
      if (overrideValue && val >= 1 && val !== getOriginalQty(it)) {
        entries.push({ id: it.id, override: it.printTypeCode === "LM" ? { meters: val } : { qty: val } });
      }
    });
    if (entries.length) setOverridesBulk(entries);
    setOverrideModal(null);
  };

  // Cancel/backdrop/Escape. Single mode clears the item's override (matches prior behavior);
  // bulk mode leaves existing overrides untouched.
  const cancelOverride = () => {
    if (overrideModal && !overrideModal.bulk) clearOverride(overrideModal.item.id);
    setOverrideModal(null);
  };

  const handleOpenInFolder = async (item) => {
    try {
      const response = await openInFolderApi(item.file.fullPath);
      if (response?.success) return;
      const firstError = response?.errors?.[0];
      throw {
        type: firstError?.type || "Error",
        title: firstError?.title || "Open folder failed",
        message: firstError?.message || "The folder could not be opened.",
      };
    } catch (error) {
      notify(
        {
          type: error?.type || "Error",
          title: error?.title || "Open folder failed",
          message: error?.message || "The folder could not be opened.",
        },
        { stage: "app", code: "OPEN_FOLDER_FAILED" },
      );
    }
  };

  const handleOpenInShopify = async (item) => {
    const orderId = item.orderId ?? item.file?.name?.match(/ON\d+/i)?.[0]?.toUpperCase() ?? null;
    if (!orderId) {
      notify(
        { type: "Warning", title: "No order number", message: "No order number for this file." },
        { stage: "app", code: "SHOPIFY_NO_ORDER_ID" },
      );
      return;
    }
    const res = await openInShopifyApi(orderId);
    if (!res?.success) {
      const err = res?.errors?.[0];
      notify(
        {
          type: err?.type || "Error",
          title: err?.title || "Open in Shopify failed",
          message: err?.message || "Could not open Shopify order.",
        },
        { stage: "app", code: "OPEN_SHOPIFY_FAILED" },
      );
    }
  };

  const handleItemContextMenu = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ item, x: e.clientX, y: e.clientY });
  };

  const handleBackdropContextMenu = (event) => {
    const backdrop = event.currentTarget;
    backdrop.style.pointerEvents = "none";
    const underlyingElement = document.elementFromPoint(event.clientX, event.clientY);
    backdrop.style.pointerEvents = "";

    const nextItemId = underlyingElement?.closest?.("[data-context-item-id]")?.dataset?.contextItemId;

    if (!nextItemId) {
      closeContextMenu();
      return;
    }

    let nextItem = null;
    filteredFiles.forEach((group) => {
      group.items.forEach((item) => {
        if (item.id === nextItemId) nextItem = item;
      });
    });

    if (!nextItem) {
      closeContextMenu();
      return;
    }

    setContextMenu({ item: nextItem, x: event.clientX, y: event.clientY });
  };

  useEffect(() => {
    if (!contextMenu) return undefined;
    const handleEscape = (event) => {
      if (event.key === "Escape") closeContextMenu();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [contextMenu]);

  if (!hasItems) {
    return (
      <div className={style.list_container}>
        <div className={style.empty_state}>
          <FiInbox className={style.empty_state_icon} />
          <p className={style.empty_state_text}>Great job! All Done.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={style.list_container}>
      {filteredFiles.map((group, groupId) => {
        const groupIds = group.items.map((item) => item.id);
        const groupSelectedCount = groupIds.filter((id) => selectedIds.has(id)).length;
        const isGroupSelected = groupIds.length > 0 && groupSelectedCount === groupIds.length;
        const isGroupIndeterminate = groupSelectedCount > 0 && !isGroupSelected;
        const unqGroupId = `grp-${groupId}-${group.printGroup}`;
        const groupHasSelectable =
          !hasSelection ||
          !lockMaterial ||
          group.items.some((item) => item.status !== FILE_STATUS.INVALID && item.materialType === lockMaterial);

        return (
          <div key={unqGroupId} className={style.list_content}>
            <label htmlFor={unqGroupId} className={style.list_title}>
              <input
                ref={(e) => {
                  if (e) e.indeterminate = isGroupIndeterminate;
                }}
                disabled={!groupHasSelectable || isBatchSubmitting}
                id={unqGroupId}
                type="checkbox"
                className={style.checkbox}
                checked={isGroupSelected}
                onChange={(e) => handleGroupCheckboxChange(e, group)}
              />
              {group.printGroup}
              <div className={style.estimated_length}>{estimatePrintLength(group.items, fabricConfig).fixedTotalLengthM} m</div>
            </label>
            <ul className={style.list_items}>
              {group.items.map((item) => {
                const isInvalid = item.status === FILE_STATUS.INVALID;
                const isWarning = item.status === FILE_STATUS.WARNING;
                const isLocked = hasSelection && lockMaterial && item.materialType !== lockMaterial;
                const isHeld = heldIds.has(item.id);
                const rollbackReason = rollbackReasons.get(item.file.name.replace(/\.[^.]+$/, "")) ?? null;

                let tooltip = null;
                if (isInvalid) tooltip = "File failed validation";
                else if (isHeld) {
                  const detail = heldReasons.get(item.id);
                  tooltip = detail ? `On hold · ${detail}` : "File is on hold";
                } else if (isLocked) tooltip = `Cannot mix ${lockMaterial} with ${item.materialType}`;

                const age = item.diffDays;
                const ageColor = age <= 1 ? "#3B6D11" : age === 2 ? "#D4860E" : age === 3 ? "#C05208" : "#A32D2D";
                const ageLabel = age === 0 ? "New" : `${age}d`;

                const printTypeDef = PRINT_TYPE_MAP[item.printTypeCode];
                const materialDef = MATERIAL_MAP[item.materialType];
                const statusDef = STATUS_MAP[item.status];

                const rowClasses = [
                  style.list_item,
                  isHeld ? style.list_item_held : null,
                  isInvalid ? style.list_item_invalid : null,
                  isWarning ? style.list_item_warning : null,
                  activeContextItemId === item.id ? style.list_item_active : null,
                  selectedIds.has(item.id) ? style.list_item_selected : null,
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <li
                    key={item.id}
                    data-context-item-id={item.id}
                    className={rowClasses}
                    onContextMenu={(e) => handleItemContextMenu(e, item)}
                  >
                    <div className={style.item_info}>
                      <label htmlFor={item.id} className={style.item_name} data-tooltip={tooltip}>
                        <input
                          disabled={isInvalid || isLocked || isHeld || isBatchSubmitting}
                          id={item.id}
                          type="checkbox"
                          className={style.checkbox}
                          checked={selectedIds.has(item.id)}
                          onChange={(e) => handleItemCheckboxChange(e, item)}
                        />
                        <LuFileText className={style.file_icon} />
                        <span className={style.file_name_text}>{item.file.name}</span>
                        {rollbackReason &&
                          (() => {
                            const def = reasonDefinitions.find((r) => r.code === rollbackReason.reasonCode);
                            const ReasonIcon = resolveIcon(def?.iconName);
                            return (
                              <span className={style.rollback_badge}>
                                {ReasonIcon && <ReasonIcon className={style.rollback_badge_icon} />}
                                Rollback: {rollbackReason.reasonLabel}
                              </span>
                            );
                          })()}
                        {(() => {
                          // Manual operator override — always shown when present.
                          // Independent of the Reprint badge; both may appear together.
                          const ov = selectedOverrides.get(item.id);
                          if (!ov) return null;
                          const label = ov.meters != null ? `${ov.meters}m` : `x${ov.qty}`;
                          return <span className={style.override_badge}>Override: {label}</span>;
                        })()}
                        {item.reprintQty != null &&
                          (() => {
                            const fmt = (v) => (item.printTypeCode === "LM" ? `${v}m` : `x${v}`);
                            const partial = item.reprintQtyOriginal != null && item.reprintQtyOriginal !== item.reprintQty;
                            return (
                              <span className={style.reprint_badge}>
                                <LuRotateCcw className={style.rollback_badge_icon} />
                                Reprint: {fmt(item.reprintQty)}{partial ? ` of ${fmt(item.reprintQtyOriginal)}` : ""}
                              </span>
                            );
                          })()}
                        {isHeld && <FiLock className={style.hold_icon} />}
                      </label>
                    </div>
                    <div className={style.item_badges}>
                      <span className={`${style.tag} ${style.tag_age}`} style={{ color: ageColor }}>
                        <LuClock style={{ fontSize: 19, color: ageColor }} />
                        <span>{ageLabel}</span>
                      </span>
                      <span className={`${style.tag} ${style.tag_size}`}>
                        {item.fileSizeBytes != null && (
                          <>
                            <LuFile style={{ fontSize: 19, color: "#9ca3af" }} />
                            <span>{formatFileSize(item.fileSizeBytes)}</span>
                          </>
                        )}
                      </span>
                      <span className={`${style.tag} ${style.tag_type}`}>
                        {printTypeDef && (
                          <>
                            <printTypeDef.Icon style={{ fontSize: 19, color: printTypeDef.color }} />
                            <span>{printTypeDef.label}</span>
                          </>
                        )}
                      </span>
                      <span className={`${style.tag} ${style.tag_material}`}>
                        {materialDef && (
                          <>
                            <materialDef.Icon style={{ fontSize: 19, color: materialDef.color }} />
                            <span>{materialDef.label}</span>
                          </>
                        )}
                      </span>
                      <span className={`${style.tag} ${style.tag_status}`}>
                        {statusDef && <statusDef.Icon style={{ fontSize: 19, color: statusDef.color }} />}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {contextMenu &&
        createPortal(
          <ContextMenu
            id="data-list-context-menu"
            anchorX={contextMenu.x}
            anchorY={contextMenu.y}
            onClose={closeContextMenu}
            onBackdropContextMenu={handleBackdropContextMenu}
            options={[
              {
                id: "preview",
                label: "Quick Preview",
                icon: <LuEye />,
                onClick: () => {
                  const item = contextMenu.item;
                  closeContextMenu();
                  const group = filteredFiles.find((g) => g.items.some((i) => i.id === item.id));
                  const groupItems = group
                    ? group.items.map((i) => ({ path: i.file.fullPath, name: i.file.name }))
                    : [{ path: item.file.fullPath, name: item.file.name }];
                  openPreview(item.file.fullPath, groupItems);
                },
              },
              {
                id: "folder",
                label: "Open in Folder",
                onClick: async () => {
                  closeContextMenu();
                  await handleOpenInFolder(contextMenu.item);
                },
              },
              // Hidden, not greyed out, like the label-printing entries elsewhere: a
              // shop without features.shopify has no store to open, so a disabled row
              // would only advertise something it cannot use.
              ...(isFeatureEnabled("shopify", shopProfile)
                ? [
                    {
                      id: "shopify",
                      label: "Open in Shopify",
                      onClick: () => {
                        closeContextMenu();
                        handleOpenInShopify(contextMenu.item);
                      },
                    },
                  ]
                : []),
              { id: "sep-hold", separator: true },
              (() => {
                const item = contextMenu.item;
                const isItemHeld = heldIds.has(item.id);
                const isItemSelected = selectedIds.has(item.id);
                const bulkCount = [...selectedIds].filter((id) => !heldIds.has(id)).length;
                const showBulkHold = !isItemHeld && isItemSelected && bulkCount > 1;

                if (isItemHeld) {
                  return {
                    id: "hold",
                    label: "Unhold",
                    icon: <FiUnlock />,
                    danger: true,
                    onClick: () => {
                      closeContextMenu();
                      toggleHold(item.id);
                    },
                  };
                }
                if (showBulkHold) {
                  return {
                    id: "hold",
                    label: `Hold ${bulkCount} selected`,
                    icon: <FiLock />,
                    onClick: () => {
                      closeContextMenu();
                      setHoldReason("");
                      setHoldModal({ bulk: true, count: bulkCount });
                    },
                  };
                }
                return {
                  id: "hold",
                  label: "Hold",
                  icon: <FiLock />,
                  onClick: () => {
                    closeContextMenu();
                    setHoldReason("");
                    setHoldModal({ item });
                  },
                };
              })(),
              (() => {
                const item = contextMenu.item;
                const isItemInvalid = item.status === FILE_STATUS.INVALID;
                const isItemHeld = heldIds.has(item.id);
                if (isItemInvalid || isItemHeld) return null;

                // Bulk override: right-clicked item is part of a multi-selection. Apply one
                // quantity to every eligible selected file. Selected files are already
                // guaranteed valid + not held (see toggleItemSelection), but filter defensively.
                const isItemSelected = selectedIds.has(item.id);
                if (isItemSelected) {
                  const selectedItems = [];
                  filteredFiles.forEach((g) =>
                    g.items.forEach((it) => {
                      if (selectedIds.has(it.id) && it.status !== FILE_STATUS.INVALID && !heldIds.has(it.id)) {
                        selectedItems.push(it);
                      }
                    }),
                  );
                  if (selectedItems.length > 1) {
                    return {
                      id: "set-qty",
                      label: `Override ${selectedItems.length} selected`,
                      icon: <LuPencil />,
                      onClick: () => {
                        closeContextMenu();
                        setOverrideValue("");
                        setOverrideModal({ bulk: true, items: selectedItems });
                      },
                    };
                  }
                }

                const hasOverride = selectedOverrides.has(item.id);
                if (hasOverride) {
                  return {
                    id: "set-qty",
                    label: "Clear override",
                    icon: <LuPencil />,
                    danger: true,
                    onClick: () => {
                      closeContextMenu();
                      clearOverride(item.id);
                    },
                  };
                }
                return {
                  id: "set-qty",
                  label: "Override quantity",
                  icon: <LuPencil />,
                  onClick: () => {
                    closeContextMenu();
                    setOverrideValue("");
                    setOverrideModal({ item });
                  },
                };
              })(),
            ].filter(Boolean)}
          />,
          document.body,
        )}
      <PdfPreviewModal
        isOpen={isOpen}
        isLoading={isLoading}
        imgSrc={imgSrc}
        error={error}
        currentPath={currentPath}
        currentIndex={currentIndex}
        fileList={fileList}
        onClose={closePreview}
        onNavigate={navigate}
      />
      {overrideModal &&
        createPortal(
          (() => {
            const isBulk = !!overrideModal.bulk;
            const items = isBulk ? overrideModal.items : [overrideModal.item];
            const single = isBulk ? null : items[0];
            const allLm = items.every((i) => i.printTypeCode === "LM");
            const noneLm = items.every((i) => i.printTypeCode !== "LM");
            const val = Number(overrideValue);
            // Files whose override would actually change something (value differs from original).
            const willApplyCount = items.filter((it) => overrideValue && val >= 1 && val !== getOriginalQty(it)).length;
            const placeholder = isBulk
              ? allLm
                ? "e.g. 10m"
                : noneLm
                  ? "e.g. x4"
                  : "e.g. 10"
              : single.printTypeCode === "LM"
                ? single.height != null
                  ? `${single.height / 1000}m`
                  : "e.g. 10m"
                : single.qty != null
                  ? `x${single.qty}`
                  : "e.g. x4";
            return (
              <>
                <div className={style.hold_backdrop} onClick={cancelOverride} />
                <div className={style.hold_modal}>
                  <p className={style.hold_modal_title}>Set quantity override</p>
                  <p className={style.hold_modal_filename}>
                    {isBulk ? `${items.length} selected files` : single.file.name}
                  </p>
                  <p
                    className={style.override_modal_hint}
                    style={{ visibility: !isBulk && overrideValue && val === getOriginalQty(single) ? "visible" : "hidden" }}
                  >
                    Value is the same as the original - no override needed.
                  </p>
                  <input
                    className={style.hold_modal_input}
                    type="number"
                    min={1}
                    max={isBulk ? undefined : (getOriginalQty(single) ?? undefined)}
                    placeholder={placeholder}
                    value={overrideValue}
                    autoFocus
                    onChange={(e) => setOverrideValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") cancelOverride();
                      if (e.key === "Enter") applyOverride();
                    }}
                  />
                  <div className={style.hold_modal_actions}>
                    <button type="button" className={style.hold_modal_cancel} onClick={cancelOverride}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={style.hold_modal_confirm}
                      disabled={willApplyCount === 0}
                      onClick={applyOverride}
                    >
                      {isBulk ? `Set override (${willApplyCount})` : "Set override"}
                    </button>
                  </div>
                </div>
              </>
            );
          })(),
          document.body,
        )}
      {holdModal &&
        createPortal(
          <>
            <div className={style.hold_backdrop} onClick={() => setHoldModal(null)} />
            <div className={style.hold_modal}>
              <p className={style.hold_modal_title}>Hold file</p>
              <p className={style.hold_modal_filename}>
                {holdModal.bulk ? `${holdModal.count} selected files` : holdModal.item.file.name}
              </p>
              <input
                className={style.hold_modal_input}
                type="text"
                placeholder="Reason (optional)..."
                value={holdReason}
                autoFocus
                onChange={(e) => setHoldReason(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setHoldModal(null);
                  if (e.key === "Enter") {
                    const reason = holdReason.trim();
                    if (holdModal.bulk) holdSelectedFiles(reason);
                    else toggleHold(holdModal.item.id, reason);
                    setHoldModal(null);
                  }
                }}
              />
              <div className={style.hold_modal_actions}>
                <button type="button" className={style.hold_modal_cancel} onClick={() => setHoldModal(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={style.hold_modal_confirm}
                  onClick={() => {
                    const reason = holdReason.trim();
                    if (holdModal.bulk) holdSelectedFiles(reason);
                    else toggleHold(holdModal.item.id, reason);
                    setHoldModal(null);
                  }}
                >
                  Hold file
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
};

export default DataList;
