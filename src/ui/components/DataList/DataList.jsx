import { useStore } from "../../store/useStore";
import Badge from "../Badge/Badge";
import Counter from "../Counter/Counter";
import style from "./DataList.module.css";

const DataList = () => {
  const store = useStore();

  return (
    <div className={style.list_container}>
      {store.files.map((file) => (
        <div key={file.printGroup} className={style.list_content}>
          <div className={style.list_title}>{file.printGroup}</div>
          <ul className={style.list_items}>
            {file.items.map((item) => (
              <li key={item.id} className={style.list_item}>
                <div className={style.item_info}>
                  <div className={style.item_radio}></div>
                  <div className={style.item_name}>{item.file.name}</div>
                </div>
                <div className={style.item_badges}>
                  <Counter diffDays={item.diffDays}>
                    <Badge type="DiffDays" badgeText={item.diffDays === 1 ? `NEW` : `${item.diffDays} DAYS`} />
                  </Counter>
                  <Badge type={item.printType} badgeText={item.printType} />
                  <Badge type={item.materialType} badgeText={item.materialType} />
                  <Badge type={item.status} badgeText={item.status} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

export default DataList;
