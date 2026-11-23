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
  height = 37,
}: EduKitLogoProps) {
  return (
    <span className={cn("inline-flex items-center select-none", className)}>
      {compact ? (
        <Image
          src="/isotipo_450.png"
          alt="EduKit"
          width={34}
          height={34}
          priority
          className={cn(
            "h-8.5 w-8.5 shrink-0 rounded-[10px] object-cover shadow-[0_4px_14px_rgba(3,83,164,0.3)]",
            imageClassName,
          )}
        />
      ) : (
        <>
          <Image
            src="/logo_alpha_clear.png"
            alt="EduKit - Gestión escolar"
            width={width}
            height={height}
            priority
            className={cn("block dark:hidden h-9 w-auto shrink-0 object-contain", imageClassName)}
          />
          <Image
            src="/logo_alpha_dark.png"
            alt="EduKit - Gestión escolar"
            width={width}
            height={height}
            priority
            className={cn("hidden dark:block h-9 w-auto shrink-0 object-contain", imageClassName)}
          />
        </>
      )}
    </span>
  );
}
