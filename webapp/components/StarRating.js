"use client";

import { useState } from "react";
import { StarIcon } from "@/components/Icons";

// Rating bintang 1-5 dengan ikon SVG; onRate dipanggil per pilihan user.
export default function StarRating({ onRate, size = 15 }) {
  const [value, setValue] = useState(0);
  const [hover, setHover] = useState(0);

  return (
    <span className="stars" aria-label="Beri rating 1 sampai 5">
      {[1, 2, 3, 4, 5].map((v) => (
        <button
          key={v}
          type="button"
          className={v <= (hover || value) ? "on" : ""}
          onMouseEnter={() => setHover(v)}
          onMouseLeave={() => setHover(0)}
          onClick={() => {
            setValue(v);
            onRate(v);
          }}
          aria-label={v + " bintang"}
        >
          <StarIcon filled={v <= (hover || value)} size={size} />
        </button>
      ))}
    </span>
  );
}
