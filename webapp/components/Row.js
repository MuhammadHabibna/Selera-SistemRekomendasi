"use client";

import { useRef } from "react";
import { ChevronIcon } from "@/components/Icons";

// Baris horizontal ala storefront: judul section + scroll snap + tombol panah.
export default function Row({ title, children }) {
  const ref = useRef(null);

  function scrollBy(dir) {
    if (ref.current) {
      ref.current.scrollBy({ left: dir * 560, behavior: "smooth" });
    }
  }

  return (
    <section className="hrow">
      <div className="hrow-head">
        <h2>{title}</h2>
        <div className="hrow-nav">
          <button
            type="button"
            className="arrow"
            aria-label="Geser ke kiri"
            onClick={() => scrollBy(-1)}
          >
            <ChevronIcon dir="left" />
          </button>
          <button
            type="button"
            className="arrow"
            aria-label="Geser ke kanan"
            onClick={() => scrollBy(1)}
          >
            <ChevronIcon />
          </button>
        </div>
      </div>
      <div className="hrow-scroll" ref={ref}>
        {children}
      </div>
    </section>
  );
}
