/**
 * SafeImage Component
 * 
 * A robust image component that gracefully handles loading errors.
 * When the primary image fails to load, it falls back to a native img tag
 * or displays a placeholder.
 * 
 * Features:
 * - Error handling with fallback
 * - Loading state with skeleton
 * - Lazy loading support
 * - Responsive sizing
 * 
 * Usage:
 * <SafeImage src="/path/to/image.jpg" alt="Description" />
 * <SafeImage src={remoteUrl} fallbackSrc="/placeholder.png" />
 */

import * as React from "react";
import { cn } from "@/lib/utils";

export interface SafeImageProps
  extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
  fallbackSrc?: string;
  showSkeleton?: boolean;
  wrapperClassName?: string;
}

const SafeImage = React.forwardRef<HTMLImageElement, SafeImageProps>(
  (
    {
      src,
      alt,
      fallbackSrc = "/logo.svg",
      showSkeleton = true,
      className,
      wrapperClassName,
      ...props
    },
    ref
  ) => {
    const [isLoading, setIsLoading] = React.useState(true);
    const [hasError, setHasError] = React.useState(false);
    const [currentSrc, setCurrentSrc] = React.useState(src);

    React.useEffect(() => {
      setIsLoading(true);
      setHasError(false);
      setCurrentSrc(src);
    }, [src]);

    const handleLoad = () => {
      setIsLoading(false);
    };

    const handleError = () => {
      setIsLoading(false);
      if (!hasError && fallbackSrc && currentSrc !== fallbackSrc) {
        setHasError(true);
        setCurrentSrc(fallbackSrc);
      }
    };

    return (
      <div className={cn("relative overflow-hidden", wrapperClassName)}>
        {showSkeleton && isLoading && (
          <div
            className={cn(
              "absolute inset-0 bg-white/10 animate-pulse rounded-lg",
              className
            )}
          />
        )}

        <img
          ref={ref}
          src={currentSrc}
          alt={alt}
          onLoad={handleLoad}
          onError={handleError}
          loading="lazy"
          className={cn(
            "transition-opacity duration-300",
            isLoading ? "opacity-0" : "opacity-100",
            className
          )}
          {...props}
        />
      </div>
    );
  }
);

SafeImage.displayName = "SafeImage";

export { SafeImage };
