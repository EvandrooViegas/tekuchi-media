// components/SubmitButton.tsx
"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function SubmitButton({ 
  defaultText, 
  loadingText, 
  variant = "default" 
}: { 
  defaultText: string; 
  loadingText: string;
  variant?: "default" | "outline";
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full" variant={variant} disabled={pending}>
      {pending ? loadingText : defaultText}
    </Button>
  );
}