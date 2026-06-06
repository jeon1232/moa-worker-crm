"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

type ConfirmSubmitButtonProps = ButtonProps & {
  confirmMessage: string;
};

export function ConfirmSubmitButton({ confirmMessage, disabled, onClick, ...props }: ConfirmSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <Button
      disabled={pending || disabled}
      onClick={(event) => {
        onClick?.(event);

        if (!event.defaultPrevented && !window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
      {...props}
    />
  );
}
