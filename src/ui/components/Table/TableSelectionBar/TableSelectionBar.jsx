import { useState, useEffect } from "react";
import { LuShare, LuTrash2 } from "react-icons/lu";
import { Button, ActionBar, RadioGroup } from "@chakra-ui/react";

const TableSelectionBar = ({table, selectedCount}) => {
    const open = selectedCount > 0;
    if(!open) return null;
    const [radioValue, setRadioValue] = useState('undefined');
    const printersArr = [{name: 'YUMI', value: 'YUMI'}, {name: 'YOKO', value:'YOKO'}];

    const handleClearSelection = () => {
       table.resetRowSelection();
       setRadioValue('undefined');
    }

    const handleSelectItems = () => {
        const selectedRows = table.getSelectedRowModel().flatRows.map(row=>row.original);
        console.log(selectedRows);
        return selectedRows;
    } 

    useEffect(()=>{
        if(!open) {
            setRadioValue('undefined');
        }
    },[open])

    return(
         <ActionBar.Root
        open={open}
        closeOnInteractOutside={false}
      >
          <ActionBar.Positioner>
            <ActionBar.Content>
              <span style={{width:'auto', height:'34px', border: '1px dashed var(--border-default)', borderRadius: '4px', padding: '0 8px', display: 'flex', alignItems: 'center', fontSize: '14px'}}>
                {selectedCount} item{selectedCount > 1 ? 's' : ''} selected
              </span>
            <ActionBar.Separator />
                <RadioGroup.Root variant='subtle' size='sm' value={radioValue} onValueChange={(e) => setRadioValue(e.value)} style={{display:'flex', gap:'10px'}}>
                {printersArr.map(printer =>{
                    return(
                            <RadioGroup.Item key={printer.value} value={printer.value}>
                                <RadioGroup.ItemHiddenInput />
                                <RadioGroup.ItemIndicator />
                                <RadioGroup.ItemText>{printer.name}</RadioGroup.ItemText>
                            </RadioGroup.Item>
                    )
                })}
                </RadioGroup.Root>
              <ActionBar.Separator />
              <Button size='sm' variant='solid' bg='var(--accent-emerald)' color='var(--text-inverse)' onClick={handleSelectItems}>
                <LuShare />
                Rip
              </Button>
                <Button size='sm' variant='solid' bg='red.500' color='var(--text-inverse)' onClick={handleClearSelection}>
                    <LuTrash2 />
                  Clear Selection
                </Button>
            </ActionBar.Content>
          </ActionBar.Positioner>
      </ActionBar.Root>
    )
}

export default TableSelectionBar;