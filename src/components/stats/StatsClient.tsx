"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DayBucket } from "@/lib/stats";

export interface UpcomingCard {
  id: string;
  front: string;
  back: string;
  deckName: string;
}

export interface UpcomingBucket {
  key: string;
  label: string;
  count: number;
  cards: UpcomingCard[];
}

interface StatsClientProps {
  streak: number;
  totalReviewedLast30: number;
  dailyActivity: DayBucket[];
  upcoming: UpcomingBucket[];
  decks: { id: string; name: string }[];
  selectedDeckId?: string;
}

function formatAxisDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function StatsClient({
  streak,
  totalReviewedLast30,
  dailyActivity,
  upcoming,
  decks,
  selectedDeckId,
}: StatsClientProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const router = useRouter();

  const maxDaily = Math.max(1, ...dailyActivity.map((d) => d.count));
  const maxUpcoming = Math.max(1, ...upcoming.map((b) => b.count));

  return (
    <div className="page-container">
      <div className="masthead">
        <p className="eyebrow">Progress</p>
        <div className="masthead-title-row">
          <h1 className="page-heading">Stats.</h1>
          {decks.length > 0 && (
            <select
              className="field-input deck-filter-select"
              value={selectedDeckId ?? ""}
              onChange={(e) => {
                const deckId = e.target.value;
                router.push(deckId ? `/stats?deck=${deckId}` : "/stats");
              }}
            >
              <option value="">All decks</option>
              {decks.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}
        </div>
        <div className="rule my-4" />
      </div>

      {/* KPI row */}
      <div className="stats-kpi-row">
        <div className="stat-card" style={{ borderColor: "rgba(200,147,26,0.33)", background: "rgba(200,147,26,0.07)" }}>
          <p className="stat-num" style={{ color: "var(--amber)", fontSize: "1.5rem" }}>{streak}</p>
          <p className="stat-label" style={{ color: "rgba(200,147,26,0.55)" }}>Day streak</p>
        </div>
        <div className="stat-card" style={{ borderColor: "rgba(61,92,68,0.33)", background: "rgba(61,92,68,0.07)" }}>
          <p className="stat-num" style={{ color: "var(--sage)", fontSize: "1.5rem" }}>{totalReviewedLast30}</p>
          <p className="stat-label" style={{ color: "rgba(61,92,68,0.55)" }}>Reviewed / 30d</p>
        </div>
      </div>

      {/* 30-day activity chart */}
      <div className="chart-card">
        <p className="chart-title">Practice pattern — last 30 days</p>
        <div className="chart-bars">
          {dailyActivity.map((d) => (
            <div key={d.date} className="chart-bar-col">
              <div
                className="chart-bar"
                style={{ height: `${(d.count / maxDaily) * 100}%` }}
                title={`${formatAxisDate(d.date)} — ${d.count} review${d.count === 1 ? "" : "s"}`}
              />
            </div>
          ))}
        </div>
        <div className="chart-axis">
          <span>{formatAxisDate(dailyActivity[0].date)}</span>
          <span>Today</span>
        </div>
      </div>

      {/* Upcoming schedule */}
      <div className="section-header">
        <span className="section-title">Upcoming schedule</span>
      </div>
      <div className="upcoming-list">
        {upcoming.map((bucket) => {
          const isExpanded = expanded === bucket.key;
          const hasCards = bucket.count > 0;
          return (
            <div key={bucket.key} className="upcoming-row">
              <button
                type="button"
                className="upcoming-row-header"
                disabled={!hasCards}
                onClick={() => setExpanded(isExpanded ? null : bucket.key)}
              >
                <span className="upcoming-label">{bucket.label}</span>
                <span className="upcoming-bar-track">
                  <span className="upcoming-bar-fill" style={{ width: `${(bucket.count / maxUpcoming) * 100}%` }} />
                </span>
                <span className="upcoming-count">{bucket.count}</span>
                <span className="upcoming-chevron">{hasCards ? (isExpanded ? "▾" : "▸") : ""}</span>
              </button>
              {isExpanded && hasCards && (
                <div className="upcoming-cards">
                  {bucket.cards.map((c) => (
                    <div key={c.id} className="upcoming-card-item">
                      <span className="upcoming-card-front">{c.front}</span>
                      <span className="upcoming-card-deck">{c.deckName}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
