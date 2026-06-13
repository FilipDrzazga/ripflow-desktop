import { useState, useEffect, useRef } from "react";
import { onReadFoldersProgress } from "../../services/fileService";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import style from "./StartupLoader.module.css";
import MaakeLogo from "@/assets/image/Maake_Logo.webp";

const StartupLoader = ({ onDone }) => {
  const containerRef = useRef(null);
  const fillRef = useRef(null);
  const logoRef = useRef(null);
  const doneOnceRef = useRef(false);
  const [progressLabel, setProgressLabel] = useState("");
  const [realProgressPercent, setRealProgressPercent] = useState(0);

  // Initial state + entry animation
  useGSAP(() => {
    gsap.set(fillRef.current, { width: "0%" });
    gsap.set(logoRef.current, { opacity: 0 });
    gsap.from(containerRef.current, { opacity: 0, duration: 0.35, ease: "power2.out" });
  }, { scope: containerRef });

  // Progress listener
  useEffect(() => {
    const unsubscribe = onReadFoldersProgress((payload) => {
      setProgressLabel(payload.label);
      setRealProgressPercent(payload.percent);
    });
    return () => unsubscribe?.();
  }, []);

  // Animate bar + logo in sync, trigger exit at 100%
  useEffect(() => {
    if (!fillRef.current || !logoRef.current) return;

    gsap.to(fillRef.current, {
      width: `${realProgressPercent}%`,
      duration: 0.5,
      ease: "power1.out",
      overwrite: "auto",
    });

    gsap.to(logoRef.current, {
      opacity: realProgressPercent / 100,
      duration: 0.5,
      ease: "power1.out",
      overwrite: "auto",
    });

    if (realProgressPercent >= 100 && !doneOnceRef.current) {
      doneOnceRef.current = true;
      gsap.to(containerRef.current, {
        opacity: 0,
        scale: 0.97,
        duration: 0.4,
        delay: 0.35,
        ease: "power2.in",
        onComplete: () => onDone?.(),
      });
    }
  }, [realProgressPercent, onDone]);

  return (
    <div ref={containerRef} className={style.loader_container}>
      <div className={style.loader_content}>
        <h1 className={style.loader_title}>{progressLabel}</h1>
        <div className={style.loader_track}>
          <div ref={fillRef} className={style.loader_fill} />
        </div>
        <img ref={logoRef} src={MaakeLogo} alt="Maake Logo" className={style.loader_logo} />
      </div>
    </div>
  );
};

export default StartupLoader;
