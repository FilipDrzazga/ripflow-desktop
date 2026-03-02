import style from "./DataPrintSelection.module.css";

const DataPrintSelection = () => {
  return (
    <div className={style.selection_container}>
      <div className={style.selection_items}>Selected Item 5</div>
      <div className={style.separator}></div>
      <form className={style.selection_form}>
        <label className={style.selection_label} htmlFor="dgen">
          <input className={style.selection_input} id="dgen" name="printSelection" type="radio" value="DGEN" />
          DGEN
        </label>

        <label className={style.selection_label} htmlFor="yoko">
          <input className={style.selection_input} id="yoko" name="printSelection" type="radio" value="YOKO" />
          YOKO
        </label>

        <label className={style.selection_label} htmlFor="yumi">
          <input className={style.selection_input} id="yumi" name="printSelection" type="radio" value="YUMI" />
          YUMI
        </label>
        <div className={style.separator}></div>
        <button className={style.submit_button} type="submit">
          Rip
        </button>
        <button className={style.clear_button} type="reset">
          Clear Selection
        </button>
      </form>
    </div>
  );
};

export default DataPrintSelection;
