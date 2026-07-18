"use client";

import { useState } from "react";
import Link from "next/link";
import StarRating from "@/components/StarRating";
import { HeartIcon, SparkIcon, StarIcon } from "@/components/Icons";
import { logInteraction, tileStyle, tileInitial } from "@/lib/interactions";

// Kartu produk standar. Penjelasan AI (jika ada) tidak lagi inline —
// tampil sebagai chip "AI" dengan popover saat hover/klik supaya tinggi
// kartu tetap seragam dengan kartu tanpa penjelasan.
export default function ProductCard({ item, index = 0, explanation, fixed = false }) {
  const [liked, setLiked] = useState(false);
  const [showWhy, setShowWhy] = useState(false);

  return (
    <div
      className={"card anim-up" + (fixed ? " card-fixed" : "")}
      style={{ "--d": Math.min(index, 10) * 55 + "ms" }}
    >
      <Link
        href={"/item/" + item.item_idx}
        onClick={() => logInteraction(item.item_idx, "click")}
        aria-label={"Buka " + item.product_title}
      >
        <div className="tile" style={tileStyle(item.item_idx)}>
          {tileInitial(item.product_title)}
        </div>
      </Link>
      <div className="card-meta">
        <span className="category">{item.product_category}</span>
        {explanation !== undefined ? (
          <span
            className="why-wrap"
            onMouseEnter={() => setShowWhy(true)}
            onMouseLeave={() => setShowWhy(false)}
          >
            <button
              type="button"
              className="why-chip"
              aria-expanded={showWhy}
              aria-label="Kenapa direkomendasikan?"
              onClick={() => setShowWhy((v) => !v)}
            >
              <SparkIcon size={12} />
              <span>Kenapa ini?</span>
            </button>
            {showWhy ? (
              <span className="why-pop" role="tooltip">
                {explanation || "Menyusun penjelasan ..."}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>
      <Link
        href={"/item/" + item.item_idx}
        className="title"
        onClick={() => logInteraction(item.item_idx, "click")}
      >
        {item.product_title}
      </Link>
      {item.avg_rating != null ? (
        <span className="rating-line">
          <span className="rating-star">
            <StarIcon filled size={13} />
          </span>
          {Number(item.avg_rating).toFixed(1)}
          <span className="rating-count">
            ({item.review_count} ulasan)
          </span>
        </span>
      ) : null}
      <div className="actions">
        <button
          type="button"
          className={"icon-btn" + (liked ? " liked" : "")}
          disabled={liked}
          aria-label="Suka produk ini"
          onClick={async () => {
            setLiked(true);
            await logInteraction(item.item_idx, "like");
          }}
        >
          <HeartIcon filled={liked} />
          <span>{liked ? "Disukai" : "Suka"}</span>
        </button>
        <StarRating onRate={(v) => logInteraction(item.item_idx, "rate", v)} />
      </div>
    </div>
  );
}
