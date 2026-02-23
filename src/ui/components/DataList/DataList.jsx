import { useStore } from "../../store/useStore";
import style from "./DataList.module.css";

const DataList = () => {
  const store = useStore();

  return (
    <div className={style.list_container}>
      {store.files.map((group) => (
        <div key={group.printGroup} className={style.list_content}>
          <div className={style.list_title}>
            <div className={style.title_highlight}></div>
            {group.printGroup}
          </div>
          <ul className={style.list_items}>
            {group.items.map((item) => (
              <li key={item.id} className={style.list_item}>
                <div className={style.item_radio}></div>
                <div className={style.item_name}>{item.file.name}</div>
                <div className={style.item_type}>{item.printType}</div>
                <div className={style.item_material}>{item.materialType}</div>
                <div className={style.item_status}>{item.status}</div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

export default DataList;
