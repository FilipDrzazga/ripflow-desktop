import { useRef } from "react";
import { useStore } from "../../store/useStore";
import { Flip } from "gsap/Flip";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { IoWarningOutline } from "react-icons/io5";
import style from "./AlertsHost.module.css";

gsap.registerPlugin(Flip);

const alertTypes = [
  {
    type: "Error",
    bgColor: "#fee2e2",
    textColor: "#b91c1c",
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
  },
];

const AlertsHost = () => {
  const containerRef = useRef(null);
  const flipState = useRef(null);
  const store = useStore();

  useGSAP(
    () => {
      if (!containerRef.current) return;

      const items = Array.from(containerRef.current.children);

      gsap.set(items, {
        scale: (i) => 1 - i * 0.05,
        zIndex: (i, el, arr) => arr.length - i,
        boxShadow: (i) => `0 ${6 + i * 2}px ${16 + i * 4}px rgba(0,0,0,0.15)`,
      });

      if (flipState.current) {
        Flip.from(flipState.current, {
          duration: 0.4,
          ease: "power2.out",
          stagger: 0.05,
          absolute: true,
        });
      }

      if (items[0]) {
        gsap.from(items[0], {
          y: -100,
          duration: 0.3,
          ease: "power2.out",
        });
      }

      flipState.current = Flip.getState(items);
    },
    { scope: containerRef, dependencies: [store.alerts] },
  );

  return (
    <div ref={containerRef} className={style.alert_container}>
      {store.alerts.map((alert) => {
        const alertType = alertTypes.find((type) => type.type === alert.type);
        return (
          <div
            key={alert.id}
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
