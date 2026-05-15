import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../../store/useStore";
import { notify } from "../../utils/notify";
import Badge from "../Badge/Badge";
import ContextMenu from "../ContextMenu/ContextMenu";
import DataDaysCounter from "../DataDaysCounter/DataDaysCounter";
import { estimatePrintLength } from "../../../shared/estimatePrintLength";
import { FiInbox } from "react-icons/fi";
import style from "./DataList.module.css";

const DataList = () => {
  const filteredFiles = useStore((state) => state.filteredFiles);
  const selectedIds = useStore((state) => state.selectedIds);
  const toggleGroupSelection = useStore((state) => state.toggleGroupSelection);
  const toggleItemSelection = useStore((state) => state.toggleItemSelection);
  const [contextMenu, setContextMenu] = useState(null);
  const activeContextItemId = contextMenu?.item?.id || null;

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

    setContextMenu({
      item,
      x: e.clientX,
      y: e.clientY,
    });
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
        if (item.id === nextItemId) {
          nextItem = item;
        }
      });
    });

    if (!nextItem) {
      closeContextMenu();
      return;
    }

    setContextMenu({
      item: nextItem,
      x: event.clientX,
      y: event.clientY,
    });
  };

  useEffect(() => {
    if (!contextMenu) return undefined;

    const handleEscape = (event) => {
      if (event.key === "Escape") closeContextMenu();
    };

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
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
                const isLocked = hasSelection && lockMaterial && item.materialType !== lockMaterial;

                let tooltip = null;
                if (isInvalid) tooltip = "File failed validation";
                else if (isLocked) tooltip = `Cannot mix ${lockMaterial} with ${item.materialType}`;

                return (
                  <li
                    key={item.id}
                    data-context-item-id={item.id}
                    className={`${style.list_item} ${activeContextItemId === item.id ? style.list_item_active : ""}`}
                    onContextMenu={(e) => handleItemContextMenu(e, item)}
                  >
                    <div className={style.item_info}>
                      <label htmlFor={item.id} className={style.item_name} data-tooltip={tooltip}>
                        <input
                          disabled={isInvalid || isLocked}
                          id={item.id}
                          type="checkbox"
                          className={style.checkbox}
                          checked={selectedIds.has(item.id)}
                          onChange={(e) => handleItemCheckboxChange(e, item)}
                        />
                        {item.file.name}
                      </label>
                    </div>
                    <div className={style.item_badges}>
                      <DataDaysCounter diffDays={item.diffDays} />
                      <Badge type={item.printType} badgeText={item.printType} />
                      <Badge type={item.materialType} badgeText={item.materialType} />
                      <Badge type={item.status} badgeText={item.status} />
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
                label: "Preview image",
                onClick: async () => {
                  closeContextMenu();
                  await handleOpenPreview(contextMenu.item);
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
    </div>
  );
};

export default DataList;
