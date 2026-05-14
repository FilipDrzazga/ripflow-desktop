import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../../store/useStore";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { IoWarningOutline } from "react-icons/io5";
import { MdErrorOutline } from "react-icons/md";
import { IoCheckmarkCircleOutline } from "react-icons/io5";
import style from "./AlertsHost.module.css";

const alertTypes = [
  {
    type: "Error",
    bgColor: "#fee2e2",
    textColor: "#b91c1c",
    icon: <MdErrorOutline color="#b91c1c" />,
  },
  {
    type: "Warning",
    bgColor: "#fef3c7",
    textColor: "#b45309",
    icon: <IoWarningOutline color="#b45309" />,
  },
  {
    type: "Success",
    bgColor: "#d1fae5",
    textColor: "#047857",
    icon: <IoCheckmarkCircleOutline color="#047857" />,
  },
];

const MAX_VISIBLE_ALERTS = 3;
const STACK_OFFSET = 16;
const EXPANDED_OFFSET = 78;
const SCALE_STEP = 0.06;
const MIN_SCALE = 0.82;
const AUTO_DISMISS_MS = 3000;
const RESUME_STAGGER_MS = 240;
const EXIT_DURATION = 0.46;

const mergeRenderedAlerts = (previousAlerts, nextAlerts) => {
  const previousById = new Map(previousAlerts.map((item) => [item.id, item]));
  const previousVisibleIndexById = new Map(
    previousAlerts.filter((item) => !item.isExiting).map((item, index) => [item.id, index]),
  );
  const desiredIds = new Set(nextAlerts.map((item) => item.id));
  const next = [];

  nextAlerts.forEach((alert) => {
    const previousAlert = previousById.get(alert.id);
    next.push(previousAlert ? { ...previousAlert, ...alert, isExiting: false } : { ...alert, isExiting: false });
    previousById.delete(alert.id);
  });

  previousById.forEach((item) => {
    if (desiredIds.has(item.id)) return;
    if (item.isExiting) {
      next.push(item);
      return;
    }

    const previousIndex = previousVisibleIndexById.get(item.id) ?? 1;
    next.push({
      ...item,
      isExiting: true,
      exitDirection: previousIndex === 0 ? "up" : "down",
    });
  });

  return next;
};

const AlertsHost = () => {
  const containerRef = useRef(null);
  const alertRefs = useRef(new Map());
  const previousVisibleIdsRef = useRef(new Set());
  const exitingIdsRef = useRef(new Set());
  const isHoveringRef = useRef(false);
  const dismissTimersRef = useRef(new Map());
  const deleteAlert = useStore((state) => state.deleteAlert);
  const [isHovered, setIsHovered] = useState(false);
  const [renderedAlerts, setRenderedAlerts] = useState(() => {
    const initialAlerts = useStore.getState().alerts.slice(0, MAX_VISIBLE_ALERTS);
    return initialAlerts.map((alert) => ({ ...alert, isExiting: false }));
  });

  const clearDismissTimers = useCallback(() => {
    const dismissTimers = dismissTimersRef.current;
    dismissTimers.forEach((timeoutId) => clearTimeout(timeoutId));
    dismissTimers.clear();
  }, []);

  const scheduleDismissTimer = useCallback(
    (alertId, delay = AUTO_DISMISS_MS) => {
      const dismissTimers = dismissTimersRef.current;
      const timeoutId = setTimeout(() => {
        dismissTimers.delete(alertId);
        deleteAlert(alertId);
      }, delay);

      dismissTimers.set(alertId, timeoutId);
    },
    [deleteAlert],
  );

  useEffect(() => {
    const dismissTimers = dismissTimersRef.current;

    const unsubscribe = useStore.subscribe(
      (state) => state.alerts,
      (alerts) => {
        const idsInStore = new Set(alerts.map((alert) => alert.id));

        dismissTimers.forEach((timeoutId, id) => {
          if (idsInStore.has(id)) return;
          clearTimeout(timeoutId);
          dismissTimers.delete(id);
        });

        if (!isHoveringRef.current) {
          alerts.forEach((alert) => {
            if (dismissTimers.has(alert.id)) return;
            scheduleDismissTimer(alert.id);
          });
        }

        const nextVisibleAlerts = alerts.slice(0, MAX_VISIBLE_ALERTS);
        setRenderedAlerts((prev) => mergeRenderedAlerts(prev, nextVisibleAlerts));
      },
    );

    return () => {
      unsubscribe();
      clearDismissTimers();
    };
  }, [clearDismissTimers, scheduleDismissTimer]);

  useGSAP(
    () => {
      const previousVisibleIds = previousVisibleIdsRef.current;
      const currentVisible = renderedAlerts.filter((item) => !item.isExiting);
      const currentVisibleIds = new Set(currentVisible.map((item) => item.id));
      const isExpanded = isHovered && currentVisible.length > 1;

      renderedAlerts.forEach((alert) => {
        const element = alertRefs.current.get(alert.id);
        if (!element) return;

        if (alert.isExiting) {
          if (exitingIdsRef.current.has(alert.id)) return;
          exitingIdsRef.current.add(alert.id);
          const exitY = alert.exitDirection === "up" ? "-=24" : "+=24";
          const exitScale = alert.exitDirection === "up" ? 1 : 0.9;
          const exitAutoAlpha = alert.exitDirection === "up" ? 1 : 0;

          gsap.to(element, {
            y: exitY,
            scale: exitScale,
            autoAlpha: exitAutoAlpha,
            duration: EXIT_DURATION,
            ease: "power2.in",
            overwrite: true,
            onComplete: () => {
              exitingIdsRef.current.delete(alert.id);
              setRenderedAlerts((prev) => prev.filter((item) => item.id !== alert.id));
            },
          });
          return;
        }

        const visibleIndex = currentVisible.findIndex((item) => item.id === alert.id);
        if (visibleIndex < 0) return;

        const targetY = visibleIndex * (isExpanded ? EXPANDED_OFFSET : STACK_OFFSET);
        const targetScale = isExpanded ? 1 : Math.max(1 - visibleIndex * SCALE_STEP, MIN_SCALE);
        const isEntering = !previousVisibleIds.has(alert.id);

        if (isEntering) {
          gsap.fromTo(
            element,
            { y: -72, autoAlpha: 0, scale: 1.04 },
            {
              y: targetY,
              autoAlpha: 1,
              scale: targetScale,
              duration: 0.34,
              ease: "power2.out",
              overwrite: true,
            },
          );
          return;
        }

        gsap.to(element, {
          y: targetY,
          scale: targetScale,
          autoAlpha: 1,
          duration: 0.34,
          ease: "power2.out",
          overwrite: true,
        });
      });

      currentVisible.forEach((item, index) => {
        const element = alertRefs.current.get(item.id);
        if (!element) return;
        gsap.set(element, { zIndex: 100 - index });
      });

      previousVisibleIdsRef.current = currentVisibleIds;
    },
    { dependencies: [renderedAlerts, isHovered], scope: containerRef },
  );

  const setAlertRef = (id) => (node) => {
    if (!node) {
      alertRefs.current.delete(id);
      return;
    }
    alertRefs.current.set(id, node);
  };

  const handleMouseEnter = () => {
    const visibleCount = renderedAlerts.filter((item) => !item.isExiting).length;
    if (visibleCount <= 1) return;

    isHoveringRef.current = true;
    setIsHovered(true);
    clearDismissTimers();
  };

  const handleMouseLeave = () => {
    if (!isHoveringRef.current) return;

    isHoveringRef.current = false;
    setIsHovered(false);
    clearDismissTimers();

    const oldestToNewest = [...useStore.getState().alerts].reverse();
    oldestToNewest.forEach((alert, index) => {
      const delay = AUTO_DISMISS_MS + index * RESUME_STAGGER_MS;
      scheduleDismissTimer(alert.id, delay);
    });
  };

  return (
    <div
      ref={containerRef}
      className={style.alert_container}
      style={{ pointerEvents: renderedAlerts.length === 0 ? "none" : "auto" }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {renderedAlerts.map((alert) => {
        const alertType = alertTypes.find((type) => type.type === alert.type) || alertTypes[0];
        return (
          <div
            key={alert.id}
            ref={setAlertRef(alert.id)}
            className={style.alert_content}
            style={{ backgroundColor: alertType.bgColor, color: alertType.textColor }}
          >
            <div className={style.alert_icon}>{alertType.icon}</div>
            <div className={style.alert_description}>
              <div className={style.alert_title} style={{ color: alertType.textColor }}>
                {alert.title}
              </div>
              <div className={style.alert_message} style={{ color: alertType.textColor }}>
                {alert.message}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AlertsHost;
