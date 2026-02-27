import { useStore } from "../../store/useStore";
import Badge from "../Badge/Badge";
import Counter from "../Counter/Counter";
import style from "./DataList.module.css";

const DataList = () => {
  const store = useStore();

  const handleGroupCheckboxChange = (e, group) => {
    e.stopPropagation();
    store.toggleGroupSelection(group.items);
  };
  const handleItemCheckboxChange = (e, item) => {
    e.stopPropagation();
    store.toggleItemSelection(item.id);
  };

  return (
    <div className={style.list_container}>
      {store.filteredFiles.map((group, groupId) => {
        const groupIds = group.items.map((item) => item.id);
        const groupSelectedCount = groupIds.filter((id) => store.selectedIds.has(id)).length;

        const isGroupSelected = groupIds.length > 0 && groupSelectedCount === groupIds.length;
        const isGroupIndeterminate = groupSelectedCount > 0 && !isGroupSelected;

        const unqGroupId = `grp-${groupId}-${group.printGroup}`;
        return (
          <div key={unqGroupId} className={style.list_content}>
            <label htmlFor={unqGroupId} className={style.list_title}>
              <input
                ref={(e) => {
                  if (e) e.indeterminate = isGroupIndeterminate;
                }}
                id={unqGroupId}
                type="checkbox"
                className={style.checkbox}
                checked={isGroupSelected}
                onChange={(e) => handleGroupCheckboxChange(e, group)}
              />
              {group.printGroup}
            </label>
            <ul className={style.list_items}>
              {group.items.map((item) => (
                <li key={item.id} className={style.list_item}>
                  <div className={style.item_info}>
                    <label htmlFor={item.id} className={style.item_name}>
                      <input
                        id={item.id}
                        type="checkbox"
                        className={style.checkbox}
                        checked={store.selectedIds.has(item.id)}
                        onChange={(e) => handleItemCheckboxChange(e, item)}
                      />
                      {item.file.name}
                    </label>
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
        );
      })}
    </div>
  );
};

export default DataList;
