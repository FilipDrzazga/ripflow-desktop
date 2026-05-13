import { useLayoutEffect, useRef } from "react";
import { FiEye, FiFolder, FiShoppingBag, FiX } from "react-icons/fi";
import style from "./ContextMenu.module.css";

const EDGE_OFFSET = 12;

const resolveIcon = (option) => {
  if (option.icon) return option.icon;
  if (option.id === "preview") return <FiEye />;
  if (option.id === "folder") return <FiFolder />;
  if (option.id === "shopify") return <FiShoppingBag />;
  return null;
};

const ContextMenu = ({ id, anchorX, anchorY, options, onClose, onBackdropContextMenu }) => {
  const menuRef = useRef(null);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const { innerWidth, innerHeight } = window;
    const { offsetWidth, offsetHeight } = menu;

    let nextLeft = anchorX;
    let nextTop = anchorY;

    if (anchorX + offsetWidth + EDGE_OFFSET > innerWidth) {
      nextLeft = Math.max(EDGE_OFFSET, innerWidth - offsetWidth - EDGE_OFFSET);
    }

    if (anchorY + offsetHeight + EDGE_OFFSET > innerHeight) {
      nextTop = Math.max(EDGE_OFFSET, innerHeight - offsetHeight - EDGE_OFFSET);
    }

    menu.style.left = `${nextLeft}px`;
    menu.style.top = `${nextTop}px`;
  }, [anchorX, anchorY, options.length]);

  return (
    <>
      <div
        className={style.backdrop}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();

          if (onBackdropContextMenu) {
            onBackdropContextMenu(event);
            return;
          }

          onClose();
        }}
      />
      <div
        ref={menuRef}
        id={id}
        className={style.menu}
        style={{ left: `${anchorX}px`, top: `${anchorY}px` }}
        role="menu"
        aria-label="Item actions"
      >
        {options.map((option) => {
          if (option.separator) {
            return <div key={option.id} className={style.menu_divider} aria-hidden="true" />;
          }

          return (
            <button
              key={option.id}
              type="button"
              className={`${style.menu_item} ${option.danger ? style.menu_item_danger : ""}`}
              onClick={option.onClick}
              role="menuitem"
            >
              <span className={style.menu_item_icon}>{resolveIcon(option)}</span>
              {option.label}
            </button>
          );
        })}
        <div className={style.menu_divider} aria-hidden="true" />
        <button type="button" className={style.menu_item_secondary} onClick={onClose}>
          <span className={style.menu_item_icon}>
            <FiX />
          </span>
          Cancel
        </button>
      </div>
    </>
  );
};

export default ContextMenu;
