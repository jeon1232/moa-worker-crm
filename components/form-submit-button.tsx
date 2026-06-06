"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

export function FormSubmitButton({ disabled, ...props }: ButtonProps) {
  const { pending } = useFormStatus();

  return <Button disabled={pending || disabled} {...props} />;
}
