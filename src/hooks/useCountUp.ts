import { useState, useEffect, useRef } from "react";

interface CountUpOptions {
    duration?: number;   // ms — default 900
    delay?: number;      // ms — default 0
    easing?: "linear" | "easeOut"; // default easeOut
}

/**
 * Animates a numeric value from 0 to `end` when the element enters viewport.
 * Respects `prefers-reduced-motion` — returns final value immediately if set.
 */
export function useCountUp(end: number, options: CountUpOptions = {}) {
    const { duration = 900, delay = 0, easing = "easeOut" } = options;
    const [value, setValue] = useState(0);
    const [isAnimating, setIsAnimating] = useState(false);
    const frameRef = useRef<number>(0);
    const startTimeRef = useRef<number>(0);

    // Respect prefers-reduced-motion
    const prefersReduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    useEffect(() => {
        if (prefersReduced || end === 0) {
            setValue(end);
            return;
        }

        const run = () => {
            setIsAnimating(true);
            startTimeRef.current = performance.now();

            const tick = (now: number) => {
                const elapsed = now - startTimeRef.current;
                const progress = Math.min(elapsed / duration, 1);
                const easedProgress =
                    easing === "easeOut"
                        ? 1 - Math.pow(1 - progress, 3) // easeOutCubic
                        : progress;

                setValue(Math.round(easedProgress * end));

                if (progress < 1) {
                    frameRef.current = requestAnimationFrame(tick);
                } else {
                    setValue(end);
                    setIsAnimating(false);
                }
            };

            frameRef.current = requestAnimationFrame(tick);
        };

        const timer = delay > 0 ? setTimeout(run, delay) : undefined;
        if (!timer) run();

        return () => {
            if (timer) clearTimeout(timer);
            if (frameRef.current) cancelAnimationFrame(frameRef.current);
        };
    }, [end, duration, delay, easing, prefersReduced]);

    return { value, isAnimating };
}
