"use client";

import { useState } from "react";

type MaskKind = "phone" | "business";

type MaskedInputProps = {
  name: string;
  label: string;
  kind: MaskKind;
  required?: boolean;
  defaultValue?: string | null;
};

function digitsOnly(value: string, maxLength: number) {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

function formatPhone(value: string) {
  const digits = digitsOnly(value, 11);

  if (digits.length <= 3) {
    return digits;
  }

  if (digits.length <= 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }

  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function formatBusinessNo(value: string) {
  const digits = digitsOnly(value, 10);

  if (digits.length <= 3) {
    return digits;
  }

  if (digits.length <= 5) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }

  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function applyMask(value: string, kind: MaskKind) {
  return kind === "phone" ? formatPhone(value) : formatBusinessNo(value);
}

export function MaskedInput({ name, label, kind, required, defaultValue }: MaskedInputProps) {
  const [value, setValue] = useState(() => applyMask(defaultValue ?? "", kind));

  return (
    <label className="block text-sm font-medium">
      {label}
      <input
        name={name}
        required={required}
        value={value}
        onChange={(event) => setValue(applyMask(event.target.value, kind))}
        inputMode="numeric"
        autoComplete={kind === "phone" ? "tel" : "off"}
        placeholder={kind === "phone" ? "010-0000-0000" : "000-00-00000"}
        className="mt-1 h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}
