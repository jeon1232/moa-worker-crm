"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";

type SecretInputProps = {
  name: string;
  label: string;
  defaultValue?: string | null;
  className?: string;
  labelClassName?: string;
};

export function SecretInput({
  name,
  label,
  defaultValue,
  className,
  labelClassName
}: SecretInputProps) {
  const hasSavedValue = Boolean(defaultValue);
  const [visible, setVisible] = useState(!hasSavedValue);

  return (
    <label className={labelClassName ?? "block text-sm font-medium"}>
      {label}
      <div className="mt-1 flex rounded-md border bg-background focus-within:ring-2 focus-within:ring-ring">
        <input
          name={name}
          defaultValue={defaultValue ?? ""}
          type={visible ? "text" : "password"}
          className={
            className ??
            "h-10 min-w-0 flex-1 rounded-l-md bg-transparent px-3 text-sm outline-none"
          }
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 shrink-0 rounded-l-none"
          aria-label={visible ? "비밀번호 숨김" : "비밀번호 보기"}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>
    </label>
  );
}
