import { useLayoutEffect, useRef, useState } from "react";
import { FiEye, FiFolder, FiShoppingBag, FiX } from "react-icons/fi";
import { HiChevronRight } from "react-icons/hi2";
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
  const submenuRef = useRef(null);
  const [activeSubmenu, setActiveSubmenu] = useState(null);
  const hideTimerRef = useRef(null);

  const showSubmenu = (id) => {
    clearTimeout(hideTimerRef.current);
    setActiveSubmenu(id);
  };

  const scheduleHideSubmenu = () => {
    hideTimerRef.current = setTimeout(() => setActiveSubmenu(null), 150);
  };

  useLayoutEffect(() => {
    const submenu = submenuRef.current;
    if (!submenu || !activeSubmenu) return;

    submenu.style.top = "";
    submenu.style.left = "";

    const rect = submenu.getBoundingClientRect();
    const { innerWidth, innerHeight } = window;

    const bottomOverflow = rect.bottom - (innerHeight - EDGE_OFFSET);
    if (bottomOverflow > 0) {
      const maxShift = Math.max(0, rect.top - EDGE_OFFSET);
      submenu.style.top = `-${Math.min(bottomOverflow, maxShift)}px`;
    }

    if (rect.right > innerWidth - EDGE_OFFSET) {
      submenu.style.left = `-${submenu.offsetWidth + 8}px`;
    }
  }, [activeSubmenu]);

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

          if (option.children) {
            return (
              <div
                key={option.id}
                className={style.menu_item_wrapper}
                onMouseEnter={() => showSubmenu(option.id)}
                onMouseLeave={scheduleHideSubmenu}
              >
                <button
                  type="button"
                  className={`${style.menu_item} ${style.hasSubmenu} ${option.danger ? style.menu_item_danger : ""}`}
                  role="menuitem"
                  aria-haspopup="true"
                  aria-expanded={activeSubmenu === option.id}
                >
                  <span className={style.menu_item_icon}>{resolveIcon(option)}</span>
                  {option.label}
                  <span className={style.arrow}><HiChevronRight /></span>
                </button>
                {activeSubmenu === option.id && (
                  <div ref={submenuRef} className={style.submenu} role="menu" onMouseEnter={() => showSubmenu(option.id)}>
                    {option.children.map((child) => {
                      if (child.separator) {
                        return <div key={child.id} className={style.menu_divider} aria-hidden="true" />;
                      }
                      return (
                        <button
                          key={child.id}
                          type="button"
                          className={`${style.menu_item} ${child.danger ? style.menu_item_danger : ""}`}
                          onClick={() => {
                            onClose();
                            child.onClick();
                          }}
                          role="menuitem"
                        >
                          {child.icon && <span className={style.menu_item_icon}>{child.icon}</span>}
                          {child.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
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
