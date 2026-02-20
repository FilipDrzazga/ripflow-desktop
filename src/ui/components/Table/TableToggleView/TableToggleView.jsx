import { RadioGroup } from "@chakra-ui/react";

export default function TableToggleView({ value, onChange }) {
  return (
    <RadioGroup.Root
      value={value}
      onValueChange={(e) => onChange(e.value)}
      variant='subtle'
      display="flex"
      gap="12px"
      alignItems="center" >
      <RadioGroup.Item value="all" >
        <RadioGroup.ItemHiddenInput />
        <RadioGroup.ItemIndicator />
        <RadioGroup.ItemText>All</RadioGroup.ItemText>
      </RadioGroup.Item>

      <RadioGroup.Item value="cotton" >
        <RadioGroup.ItemHiddenInput />
        <RadioGroup.ItemIndicator />
        <RadioGroup.ItemText>Cottons</RadioGroup.ItemText>
      </RadioGroup.Item>

      <RadioGroup.Item value="polyester" >
        <RadioGroup.ItemHiddenInput />
        <RadioGroup.ItemIndicator />
        <RadioGroup.ItemText>Poliesters</RadioGroup.ItemText>
      </RadioGroup.Item>
    </RadioGroup.Root>
  );
}

