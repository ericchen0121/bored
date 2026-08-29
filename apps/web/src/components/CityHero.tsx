"use client";

import type { ReactNode } from "react";
import type { FeedArea, FeedCity } from "@bored/shared";
import {
  CITY_HERO_IMAGES,
  CITY_HERO_STYLES,
  cityHeroLede,
  cityHeroTitle,
} from "@/lib/city-heroes";
import { CityHeroFx } from "@/components/CityHeroFx";

type Props = {
  city: FeedCity;
  area?: FeedArea;
  children?: ReactNode;
};

export function CityHero({ city, area, children }: Props) {
  const image = CITY_HERO_IMAGES[city];
  const style = CITY_HERO_STYLES[city];
  const title = cityHeroTitle(city, area);
  const lede = cityHeroLede(city, area);

  return (
    <header className="city-hero" data-city={city}>
      <div className="city-hero__bleed">
        <div className="city-hero__media">
          <img
            className="city-hero__photo"
            src={image.src}
            alt={image.alt}
            width={1800}
            height={900}
            decoding="async"
            fetchPriority="high"
            style={{ objectPosition: image.objectPosition }}
          />
          <div
            className="city-hero__veil"
            style={{ background: style.veil }}
            aria-hidden
          />
          <CityHeroFx
            key={city}
            mode={style.fxMode}
            colors={style.palette}
            blendMode={style.fxBlendMode}
          />
          <div className="city-hero__fade city-hero__fade--top" aria-hidden />
          <div className="city-hero__fade city-hero__fade--bottom" aria-hidden />
        </div>
        <div className="city-hero__copy">
          <p className="city-hero__eyebrow">What&apos;s on in</p>
          <h1 className="city-hero__title">{title}</h1>
          <p className="city-hero__lede">{lede}</p>
          {children}
        </div>
      </div>
    </header>
  );
}
