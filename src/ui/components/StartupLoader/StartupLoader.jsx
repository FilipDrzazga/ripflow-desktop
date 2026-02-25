import style from "./StartapLoader.module.css";

const StartupLoader = ({ progress }) => {
  return (
    <div className={style.loader_container}>
      <div className={style.loader_content}>
        <h1 className={style.loader_title}>Loading...</h1>
        <div className={style.loader_track}>
          <div className={style.loader_fill}></div>
        </div>
      </div>
    </div>
  );
};

export default StartupLoader;
