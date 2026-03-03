import { useState } from 'react';
import {useStore} from '../../store/useStore';
import style from "./DataPrintSelection.module.css";

const DataPrintSelection = () => {
  const printers = [{name:'DGEN', value:'DGEN', materialType:'Cottons'}, {name:'YOKO', value:'YOKO', materialType:'Polyesters'}, {name:'YUMI', value:'YUMI', materialType:'Polyesters'}];
  const [selectedPrinter, setSelectedPrinter] = useState(null);
  const store = useStore();

  const isSelectionMode = store.selectedIds.size > 0;
  const selectedMaterialTypes = new Set();
  store.filteredFiles.forEach((group) => {
    group.items.forEach((item) => {
      if (store.selectedIds.has(item.id)) {
        selectedMaterialTypes.add(item.materialType);
      }
    });
  });

  const materialType = selectedMaterialTypes.size === 1 ? [...selectedMaterialTypes][0] : null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedPrinter) {
      console.log("No printer selected");
      return;
    }; // brak wybranego printera wyslij error lub alert
    // Tutaj możesz dodać logikę wysyłania danych do ripowania
    console.log(`Ripowanie na ${selectedPrinter} dla materiału ${materialType}`);
    store.toggleClearSelection();
    setSelectedPrinter(null);
  };

  const handleClearBtn = ()=>{
    setSelectedPrinter(null);
    store.toggleClearSelection();
  }

  return (
    <div className={`${style.selection_container} ${isSelectionMode ? style.active : ""}`}>
      <div className={style.selection_items}>{store.selectedIds.size > 1 ? `${store.selectedIds.size} items selected` : `${store.selectedIds.size} item selected`}</div>
      <div className={style.separator}></div>
      <form className={style.selection_form} onSubmit={handleSubmit}>
        {printers.map((printer) => (
          <label key={printer.value} className={style.selection_label} htmlFor={printer.value}>
            <input className={style.selection_input} id={printer.value} name="printSelection" type="radio" value={printer.value} disabled={materialType !== printer.materialType} checked={selectedPrinter === printer.value} onChange={() => setSelectedPrinter(printer.value)} />
            {printer.name}
          </label>
        ))}
        <div className={style.separator}></div>
        <button className={style.submit_button} type="submit">
          Rip
        </button>
        <button className={style.clear_button} type="reset" onClick={handleClearBtn}>
          Clear Selection
        </button>
      </form>
    </div>
  );
};

export default DataPrintSelection;
