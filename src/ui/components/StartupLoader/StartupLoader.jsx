import { useState, useEffect, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import style from "./StartapLoader.module.css";
import MaakeLogo from "@/assets/image/Maake_Logo.webp";

const StartupLoader = ({ onDone }) => {
  const loaderRef = useRef(null);
  const doneOnceRef = useRef(false);
  const [progressLabel, setProgressLabel] = useState("");
  const [realProgressPercent, setRealProgressPercent] = useState(0);
  const [displayedProgressPercent, setDisplayedProgressPercent] = useState(0);
  const [isDone, setIsDone] = useState(false);

  useGSAP(() => {
    if (loaderRef.current) {
      gsap.set(loaderRef.current, {
        width: "0%",
      });
    }
  });

  // Nasłuchiwanie postępu czytania folderów z main process
  useEffect(() => {
    let unsubscribe;
    const listenProgress = () => {
      unsubscribe = window.api.onReadFoldersProgress((payload) => {
        setProgressLabel(payload.label);
        setRealProgressPercent(payload.percent);
      });
    };

    listenProgress();

    return () => {
      unsubscribe && unsubscribe();
    };
  }, []);

  // Animacja płynnego wzrostu paska postępu
  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayedProgressPercent((prev) => {
        if (realProgressPercent === 100 && prev === 99) {
          setIsDone(true);
          return 100;
        }
        if (prev < realProgressPercent) {
          return prev + 1;
        }
        return prev;
      });
    }, 16);

    return () => clearInterval(interval);
  }, [realProgressPercent]);

  // Wywołanie onDone po zakończeniu ładowania, ale tylko raz
  useEffect(() => {
    if (!isDone) return;
    if (doneOnceRef.current) return;
    doneOnceRef.current = true;
    onDone?.();
  }, [isDone, onDone]);

  // Animacja GSAP do płynnej zmiany szerokości paska postępu
  useEffect(() => {
    if (!loaderRef.current) return;
    gsap.to(loaderRef.current, {
      width: `${displayedProgressPercent}%`,
      duration: 0.5,
      ease: "power1.out",
      overwrite: "auto",
    });
  }, [displayedProgressPercent]);

  if (isDone) return null;

  return (
    <div className={style.loader_container}>
      <div className={style.loader_content}>
        <h1 className={style.loader_title}>{progressLabel}</h1>
        <div className={style.loader_track}>
          <div ref={loaderRef} className={style.loader_fill} style={{ width: `${realProgressPercent}%` }}></div>
        </div>
        <img src={MaakeLogo} alt="Maake Logo" className={style.loader_logo} />
      </div>
    </div>
  );
};

export default StartupLoader;
