"use client";

import { useState } from "react";
import Link from "next/link";
import StarRating from "@/components/StarRating";
import { HeartIcon, SparkIcon } from "@/components/Icons";
import { logInteraction, tileStyle, tileInitial } from "@/lib/interactions";

// Kartu produk standar: tile gradien, kategori, judul, aksi suka + rating.
// index untuk stagger animasi; explanation opsional (slot penjelasan AI);
// fixed=true dipakai di baris horizontal (lebar tetap).
export default function ProductCard({ item, index = 0, explanation, fixed = false }) {
  const [liked, setLiked] = useState(false);

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
      <span className="category">{item.product_category}</span>
      <Link
        href={"/item/" + item.item_idx}
        className="title"
        onClick={() => logInteraction(item.item_idx, "click")}
      >
        {item.product_title}
      </Link>
      {explanation !== undefined ? (
        <div className="explanation">
          <span className="spark">
            <SparkIcon />
          </span>
          <span>{explanation || "Menyusun penjelasan ..."}</span>
        </div>
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
