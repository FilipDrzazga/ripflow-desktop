import { Toaster as ChakraToaster, Portal, Stack, Toast, createToaster } from "@chakra-ui/react";

export const toaster = createToaster({
  placement: "top-end",
  overlap: false,
  gap: 12,
});

export const Toaster = () => {
  return (
    <Portal>
      <ChakraToaster toaster={toaster}>
        {(toast) => (
          <Toast.Root
            width="420px" // 🔹 stała szerokość
            maxWidth="90vw" // 🔹 mobile safety
            p="18px" // 🔹 padding
            borderRadius="12px"
            boxShadow="lg"
            display="flex"
            alignItems="flex-start"
            gap="12px"
          >
            <Toast.Indicator mt="4px" />

            <Stack spacing="6px" flex="1">
              {toast.title && (
                <Toast.Title fontWeight="600" fontSize="15px">
                  {toast.title}
                </Toast.Title>
              )}

              {toast.description && (
                <Toast.Description fontSize="14px" opacity="0.9" lineHeight="1.4" whiteSpace="pre-wrap">
                  {toast.description}
                </Toast.Description>
              )}
            </Stack>

            {toast.meta?.closable && <Toast.CloseTrigger />}
          </Toast.Root>
        )}
      </ChakraToaster>
    </Portal>
  );
};
