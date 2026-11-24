import React from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface EduKitLogoProps {
  compact?: boolean;
  className?: string;
  imageClassName?: string;
  width?: number;
  height?: number;
}

export function EduKitLogo({
  compact = false,
  className,
  imageClassName,
  width = 132,
  height = 36,
}: EduKitLogoProps) {
  const sizeClass = compact ? "h-7 w-auto" : "h-9 w-auto";
  const resolvedWidth = compact ? 103 : width;
  const resolvedHeight = compact ? 28 : height;

  return (
    <span className={cn("inline-flex items-center select-none", className)}>
      <Image
        src="/profekit_horarios_clear.png"
        alt="ProfeKit Horarios"
        width={resolvedWidth}
        height={resolvedHeight}
        priority
        className={cn("block dark:hidden shrink-0 object-contain", sizeClass, imageClassName)}
      />
      <Image
        src="/profekit_horarios_dark.png"
        alt="ProfeKit Horarios"
        width={resolvedWidth}
        height={resolvedHeight}
        priority
        className={cn("hidden dark:block shrink-0 object-contain", sizeClass, imageClassName)}
      />
    </span>
  );
}
