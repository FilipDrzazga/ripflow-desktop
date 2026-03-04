import { useRef, useEffect } from "react";
import { useStore } from "../../store/useStore";
import { Flip } from "gsap/Flip";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { IoWarningOutline } from "react-icons/io5";
import { MdErrorOutline } from "react-icons/md";
import { IoCheckmarkCircleOutline } from "react-icons/io5";
import style from "./AlertsHost.module.css";

gsap.registerPlugin(Flip);

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

const AlertsHost = () => {
  const containerRef = useRef(null);
  const flipState = useRef(null);
  const store = useStore();

  useEffect(()=>{
    const unsubscribe = useStore.subscribe(
      (state) => state.alerts,
      (alerts, prevState) => {
        if(!containerRef.current) return;
        if(!prevState) return;
        if(alerts.length !== prevState.length) {
        flipState.current = Flip.getState(Array.from(containerRef.current.children));
      }
      }
    );
    return () => unsubscribe();
  }, []);

  useGSAP(()=>{
    if(!containerRef.current) return;
    const children = containerRef.current ? Array.from(containerRef.current.children) : [];

    if(flipState.current) {

      Flip.from(flipState.current, {
      duration: 0.3,
      ease: "power1.inOut",
      absolute: true,
      onComplete: () =>{
        gsap.to(children, {
          scale: (i) => Math.max(1-i*0.06, 0.8),
          zIndex: (i) => 999 - i,
          duration: 0.3,
          ease: "power1.inOut",
          overwrite: true,
        });
      }
    });

    flipState.current = null;

    } else {
       gsap.to(children, {
          scale: (i) => Math.max(1-i*0.06, 0.8),
          zIndex: (i) => 999 - i,
          duration: 0.3,
          ease: "power1.inOut",
          overwrite: true,
        });
    }

    const newEl = containerRef.current.firstElementChild;
    if(!newEl) return;

    if(newEl.dataset.entered === '1') return;
    newEl.dataset.entered = '1';

    gsap.set(newEl, { zIndex: 1000 });
    gsap.from(newEl, { y: -70, duration: 0.3, ease: "power1.inOut",onComplete:()=>{
      gsap.to(newEl, {
          scale: (i) => Math.max(1-i*0.06, 0.8),
          zIndex: (i) => 999 - i,
          duration: 0.3,
          ease: "power1.inOut",
          overwrite: true,
        });
    } });

  },{dependencies:[store.alerts], scope: containerRef});

  return (
    <div ref={containerRef} className={style.alert_container}>
      {store.alerts.map((alert) => {
        const alertType = alertTypes.find((type) => type.type === alert.type);
        return (
          <div
            key={alert.id}
            className={style.alert_content}
            style={{ backgroundColor: alertType.bgColor, color: alertType.textColor }}
            data-id='item'
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
