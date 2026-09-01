import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  FEED_CITIES,
  FEED_TOPICS,
  FEED_TOPIC_EMOJI,
  FEED_TOPIC_LABELS,
  type FeedArea,
  type FeedCity,
} from "@bored/shared";
import { cityShareLabel } from "@/lib/city-share";
import { formatWhen, timeZoneForArea } from "@/lib/datetime";
import { getTopicHubFeed } from "@/lib/server-api";
import {
  faqPageJsonLd,
  jsonLdScript,
  topicHubBreadcrumbJsonLd,
  topicHubItemListJsonLd,
} from "@/lib/structured-data";
import {
  cardDetailPath,
  isFeedTopic,
  topicHubArea,
  topicHubFaqs,
  topicHubIntroText,
  topicHubMetadata,
  topicHubTitle,
} from "@/lib/topic-seo";

type Props = { params: Promise<{ city: string; topic: string }> };

/** On-demand ISR — avoid 30+ slow API calls during Docker build. */
export const revalidate = 1800;

function parseCity(value: string): FeedCity | null {
  return FEED_CITIES.includes(value as FeedCity) ? (value as FeedCity) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city: cityParam, topic: topicParam } = await params;
  const city = parseCity(cityParam);
  const topic = isFeedTopic(topicParam) ? topicParam : null;
  if (!city || !topic) notFound();

  const area = topicHubArea(city) as FeedArea;
  const data = await getTopicHubFeed(area, topic, 1);
  const count = data?.cards?.length ?? 0;
  return topicHubMetadata(city, topic, count);
}

export default async function TopicHubPage({ params }: Props) {
  const { city: cityParam, topic: topicParam } = await params;
  const city = parseCity(cityParam);
  const topic = isFeedTopic(topicParam) ? topicParam : null;
  if (!city || !topic) notFound();

  const area = topicHubArea(city) as FeedArea;
  const timeZone = timeZoneForArea(area);
  const data = await getTopicHubFeed(area, topic);
  const cards = data?.cards ?? [];
  const title = topicHubTitle(city, topic);
  const intro = topicHubIntroText(city, topic);
  const cityLabel = cityShareLabel(city);
  const faqs = topicHubFaqs(city, topic, cards.length);

  const itemListLd = topicHubItemListJsonLd(city, topic, cards);
  const breadcrumbLd = topicHubBreadcrumbJsonLd(city, topic);
  const faqLd = faqPageJsonLd(faqs);

  return (
    <article className="topic-hub">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript([itemListLd, breadcrumbLd, faqLd]),
        }}
      />

      <nav className="topic-hub__crumbs" aria-label="Breadcrumb">
        <Link href="/">Bored</Link>
        <span aria-hidden> / </span>
        <Link href={`/${city}`}>{cityLabel}</Link>
        <span aria-hidden> / </span>
        <span>{FEED_TOPIC_LABELS[topic]}</span>
      </nav>

      <header className="topic-hub__header">
        <h1>{title}</h1>
        <p className="topic-hub__intro">{intro}</p>
        <p className="meta topic-hub__meta">
          {cards.length > 0
            ? `${cards.length} upcoming listing${cards.length === 1 ? "" : "s"}`
            : "No upcoming listings right now"}
          {" · "}
          <Link href={`/${city}?topics=${topic}&mode=all`}>Browse in feed</Link>
          {" · "}
          <a href={`/feed/${city}/${topic}`}>RSS</a>
        </p>
      </header>

      <nav className="nav nav--topics topic-hub__topics" aria-label="Other topics">
        {FEED_TOPICS.map((id) => (
          <Link
            key={id}
            href={`/${city}/${id}`}
            className={`chip ${id === topic ? "active" : ""}`}
            aria-current={id === topic ? "page" : undefined}
          >
            <span aria-hidden>{FEED_TOPIC_EMOJI[id]}</span> {FEED_TOPIC_LABELS[id]}
          </Link>
        ))}
      </nav>

      {cards.length > 0 ? (
        <ul className="topic-hub__list">
          {cards.map((card) => (
            <li key={card.id} className="topic-hub__item">
              <Link href={cardDetailPath(card)} className="topic-hub__link">
                <h2 className="topic-hub__event-title">{card.title}</h2>
                <p className="meta">
                  {formatWhen(card.startsAt, timeZone)}
                  {card.venueName ? ` · ${card.venueName}` : ""}
                  {card.neighborhood ? ` · ${card.neighborhood}` : ""}
                  {card.isFree ? " · Free" : ""}
                </p>
                {card.subtitle ? (
                  <p className="topic-hub__subtitle">{card.subtitle}</p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted topic-hub__empty">
          Check back soon, or{" "}
          <Link href={`/${city}`}>browse everything in {cityLabel}</Link>.
        </p>
      )}

      <section className="topic-hub__faq" aria-labelledby="topic-faq-heading">
        <h2 id="topic-faq-heading">Frequently asked questions</h2>
        <dl>
          {faqs.map((faq) => (
            <div key={faq.question} className="topic-hub__faq-item">
              <dt>{faq.question}</dt>
              <dd>{faq.answer}</dd>
            </div>
          ))}
        </dl>
      </section>
    </article>
  );
}
