"use client";

import { useEffect, useState } from "react";

const WORDS = [
  "an email.",
  "a support ticket.",
  "a customer call.",
  "a Slack thread.",
];

const LEAVE_DURATION_MS = 340;
const CYCLE_MS = 2400;

export function HeroRotator() {
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const interval = setInterval(() => {
      setLeaving(true);
      const swap = setTimeout(() => {
        setIndex((i) => (i + 1) % WORDS.length);
        setLeaving(false);
      }, LEAVE_DURATION_MS);
      return () => clearTimeout(swap);
    }, CYCLE_MS);

    return () => clearInterval(interval);
  }, []);

  return (
    <span className="rot-wrap">
      <span key={index} className={`rot${leaving ? " rot-leaving" : ""}`}>
        {WORDS[index]}
      </span>
    </span>
  );
}
