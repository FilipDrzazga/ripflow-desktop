import { useStore } from "../../store/useStore";
import Badge from "../Badge/Badge";
import DataDaysCounter from "../DataDaysCounter/DataDaysCounter";
import { estimatePrintLength } from "../../helpers/estimatePrintLength";
import { FiInbox } from "react-icons/fi";
import style from "./DataList.module.css";

const DataList = () => {
  const store = useStore();

  const selectedMaterialTypes = new Set();

  store.filteredFiles.forEach((group) => {
    group.items.forEach((item) => {
      if (store.selectedIds.has(item.id)) selectedMaterialTypes.add(item.materialType);
    });
  });

  const lockMaterial = selectedMaterialTypes.size === 1 ? [...selectedMaterialTypes][0] : null;
  const hasSelection = store.selectedIds.size > 0;
  const hasItems = store.filteredFiles.some((group) => group.items.length > 0);

  const handleGroupCheckboxChange = (e, group) => {
    e.stopPropagation();
    store.toggleGroupSelection(group.items);
  };
  const handleItemCheckboxChange = (e, item) => {
    e.stopPropagation();
    store.toggleItemSelection(item.id);
  };

  if (!hasItems) {
    return (
      <div className={style.list_container}>
        <div className={style.empty_state}>
          <FiInbox className={style.empty_state_icon} />
          <p className={style.empty_state_text}>Great job! All Done.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={style.list_container}>
      {store.filteredFiles.map((group, groupId) => {
        const groupIds = group.items.map((item) => item.id);

        const groupSelectedCount = groupIds.filter((id) => store.selectedIds.has(id)).length;

        const isGroupSelected = groupIds.length > 0 && groupSelectedCount === groupIds.length;
        const isGroupIndeterminate = groupSelectedCount > 0 && !isGroupSelected;

        const unqGroupId = `grp-${groupId}-${group.printGroup}`;
        const groupHasSelectable =
          !hasSelection ||
          !lockMaterial ||
          group.items.some((item) => item.status !== "INVALID" && item.materialType === lockMaterial);
        return (
          <div key={unqGroupId} className={style.list_content}>
            <label htmlFor={unqGroupId} className={style.list_title}>
              <input
                ref={(e) => {
                  if (e) e.indeterminate = isGroupIndeterminate;
                }}
                disabled={!groupHasSelectable}
                id={unqGroupId}
                type="checkbox"
                className={style.checkbox}
                checked={isGroupSelected}
                onChange={(e) => handleGroupCheckboxChange(e, group)}
              />
              {group.printGroup}
              <div className={style.estimated_length}>{estimatePrintLength(group.items).fixedTotalLengthM} m</div>
            </label>
            <ul className={style.list_items}>
              {group.items.map((item) => {
                const isInvalid = item.status === "INVALID";
                const isLocked = hasSelection && lockMaterial && item.materialType !== lockMaterial;

                let tooltip = null;
                if (isInvalid) tooltip = "File failed validation";
                else if (isLocked) tooltip = `Cannot mix ${lockMaterial} with ${item.materialType}`;

                return (
                  <li key={item.id} className={style.list_item}>
                    <div className={style.item_info}>
                      <label htmlFor={item.id} className={style.item_name} data-tooltip={tooltip}>
                        <input
                          disabled={isInvalid || isLocked}
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
                      <DataDaysCounter diffDays={item.diffDays}>
                        <Badge type="DiffDays" badgeText={item.diffDays === 1 ? `NEW` : `${item.diffDays} DAYS`} />
                      </DataDaysCounter>
                      <Badge type={item.printType} badgeText={item.printType} />
                      <Badge type={item.materialType} badgeText={item.materialType} />
                      <Badge type={item.status} badgeText={item.status} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
};

export default DataList;
