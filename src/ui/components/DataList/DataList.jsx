import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../../store/useStore";
import { notify } from "../../utils/notify";
import ContextMenu from "../ContextMenu/ContextMenu";
import PdfPreviewModal from "../PdfPreviewModal/PdfPreviewModal";
import { usePdfPreview } from "../../hooks/usePdfPreview";
import { estimatePrintLength } from "../../../shared/estimatePrintLength";
import { FiInbox, FiLock, FiUnlock } from "react-icons/fi";
import {
  LuClock,
  LuFile,
  LuRuler,
  LuScissors,
  LuFlaskConical,
  LuUtensils,
  LuSofa,
  LuLeaf,
  LuCircleHelp,
  LuCircleCheck,
  LuCircleX,
  LuTriangleAlert,
  LuEye,
} from "react-icons/lu";
import { PiPolygon } from "react-icons/pi";
import style from "./DataList.module.css";

const formatFileSize = (bytes) => {
  if (bytes == null) return null;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
};

const PRINT_TYPE_MAP = {
  LM:        { Icon: LuRuler,        color: "#185FA5", label: "LM" },
  FQ:        { Icon: LuScissors,     color: "#534AB7", label: "FQ" },
  SAMPLE:    { Icon: LuFlaskConical, color: "#534AB7", label: "Sample" },
  TEA_TOWEL: { Icon: LuUtensils,     color: "#0F6E56", label: "TT" },
  CUSHION:   { Icon: LuSofa,         color: "#993C1D", label: "Cushion" },
};

const MATERIAL_MAP = {
  Cottons:    { Icon: LuLeaf,       color: "#3B6D11", label: "Cottons" },
  Polyesters: { Icon: PiPolygon,    color: "#185FA5", label: "Polyesters" },
  Unknown:    { Icon: LuCircleHelp, color: "#888780", label: "Unknown" },
};

const STATUS_MAP = {
  READY:   { Icon: LuCircleCheck,   color: "#3B6D11" },
  INVALID: { Icon: LuCircleX,       color: "#A32D2D" },
  WARNING: { Icon: LuTriangleAlert, color: "#BA7517" },
};

const DataList = () => {
  const filteredFiles = useStore((state) => state.filteredFiles);
  const selectedIds = useStore((state) => state.selectedIds);
  const heldIds = useStore((state) => state.heldIds);
  const toggleGroupSelection = useStore((state) => state.toggleGroupSelection);
  const toggleItemSelection = useStore((state) => state.toggleItemSelection);
  const toggleHold = useStore((state) => state.toggleHold);
  const [contextMenu, setContextMenu] = useState(null);
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

  const handleOpenPreview = async (item) => {
    try {
      const response = await window.api.openPreview(item.file.fullPath);
      if (response?.success) return;
      const firstError = response?.errors?.[0];
      throw {
        type: firstError?.type || "Error",
        title: firstError?.title || "Preview failed",
        message: firstError?.message || "The file could not be opened.",
      };
    } catch (error) {
      notify(
        {
          type: error?.type || "Error",
          title: error?.title || "Preview failed",
          message: error?.message || "The file could not be opened.",
        },
        { stage: "app", code: "OPEN_PREVIEW_FAILED" },
      );
    }
  };

  const handleOpenInFolder = async (item) => {
    try {
      const response = await window.api.openInFolder(item.file.fullPath);
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

  const handleOpenInShopify = (item) => {
    notify(
      {
        type: "Warning",
        title: "Shopify pending",
        message: `Shopify action for ${item.orderId || item.file.name} is not connected yet.`,
      },
      { stage: "app", code: "SHOPIFY_NOT_CONNECTED" },
    );
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
          group.items.some((item) => item.status !== "INVALID" && item.materialType === lockMaterial);

        return (
          <div key={unqGroupId} className={style.list_content}>
            <label htmlFor={unqGroupId} className={style.list_title}>
              <input
                ref={(e) => {
                  if (e) e.indeterminate = isGroupIndeterminate;
                }}
                disabled={!groupHasSelectable}
                id={unqGroupId}
                type="checkbox"
                className={style.checkbox}
                checked={isGroupSelected}
                onChange={(e) => handleGroupCheckboxChange(e, group)}
              />
              {group.printGroup}
              <div className={style.estimated_length}>{estimatePrintLength(group.items).fixedTotalLengthM} m</div>
            </label>
            <ul className={style.list_items}>
              {group.items.map((item) => {
                const isInvalid = item.status === "INVALID";
                const isWarning = item.status === "WARNING";
                const isLocked = hasSelection && lockMaterial && item.materialType !== lockMaterial;
                const isHeld = heldIds.has(item.id);

                let tooltip = null;
                if (isInvalid) tooltip = "File failed validation";
                else if (isHeld) tooltip = "File is on hold";
                else if (isLocked) tooltip = `Cannot mix ${lockMaterial} with ${item.materialType}`;

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
                          disabled={isInvalid || isLocked || isHeld}
                          id={item.id}
                          type="checkbox"
                          className={style.checkbox}
                          checked={selectedIds.has(item.id)}
                          onChange={(e) => handleItemCheckboxChange(e, item)}
                        />
                        {item.file.name}
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
              { id: "sep-hold", separator: true },
              heldIds.has(contextMenu.item.id)
                ? {
                    id: "hold",
                    label: "Unhold",
                    icon: <FiUnlock />,
                    danger: true,
                    onClick: () => {
                      closeContextMenu();
                      toggleHold(contextMenu.item.id);
                    },
                  }
                : {
                    id: "hold",
                    label: "Hold",
                    icon: <FiLock />,
                    onClick: () => {
                      closeContextMenu();
                      toggleHold(contextMenu.item.id);
                    },
                  },
              {
                id: "shopify",
                label: "Open in Shopify",
                onClick: () => {
                  closeContextMenu();
                  handleOpenInShopify(contextMenu.item);
                },
              },
            ]}
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
    </div>
  );
};

export default DataList;
