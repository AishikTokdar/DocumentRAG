/**
 * AnimatedCounter Component
 *
 * Framer Motion powered counter that animates from 0 to a target value
 * when scrolled into the viewport. Supports numeric and text values.
 */

import * as React from "react";
import { motion, useInView, useSpring, useTransform } from "framer-motion";

interface AnimatedCounterProps {
  /** Target value — numeric string like "100" or "50" */
  value: string;
  /** Suffix to append (e.g. "%", "MB") */
  suffix?: string;
  /** Prefix to prepend */
  prefix?: string;
  /** Duration of the counting animation in seconds */
  duration?: number;
  /** Additional className */
  className?: string;
}

export function AnimatedCounter({
  value,
  suffix = "",
  prefix = "",
  duration = 1.5,
  className,
}: AnimatedCounterProps) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });

  const numericValue = Number.parseInt(value, 10);
  const isNumeric = !Number.isNaN(numericValue);

  const spring = useSpring(0, {
    duration: duration * 1000,
    bounce: 0,
  });

  const display = useTransform(spring, (current) =>
    Math.round(current).toString(),
  );

  React.useEffect(() => {
    if (isInView && isNumeric) {
      spring.set(numericValue);
    }
  }, [isInView, isNumeric, numericValue, spring]);

  if (!isNumeric) {
    return (
      <motion.span
        ref={ref}
        className={className}
        initial={{ opacity: 0, y: 8 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        {value}
      </motion.span>
    );
  }

  return (
    <span ref={ref} className={className}>
      {isInView ? (
        <>
          {prefix}
          <motion.span>{display}</motion.span>
          {suffix}
        </>
      ) : (
        <span className="opacity-0">
          {prefix}
          {value}
          {suffix}
        </span>
      )}
    </span>
  );
}
