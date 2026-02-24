import { useStore } from "../../store/useStore";
import  Badge from "../Badge/Badge";
import style from "./DataList.module.css";

const DataList = () => {
  const store = useStore();

  return (
    <div className={style.list_container}>
      {store.files.map((file) => (
        <div key={file.printGroup} className={style.list_content}>
          <div className={style.list_title}>
            {file.printGroup} <Badge type={file.count} />
          </div>
          <ul className={style.list_items}>
            {file.items.map((item) => (
              <li key={item.id} className={style.list_item}>
                <div className={style.item_radio}></div>
                <div className={style.item_name}>{item.file.name}</div>
                <Badge type={item.printType} />
                <Badge type={item.materialType} />
                <Badge type={item.status} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

export default DataList;
