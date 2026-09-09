"use client";

import { useState } from "react";

const USE_CASES = [
  {
    label: "Cafes",
    problem:
      "New hires slow down service when training lives in the owner's head.",
    outcomes: [
      "Open and close the same way",
      "Check barista basics before rush",
      "Track signed phone and food rules",
    ],
  },
  {
    label: "Construction",
    problem:
      "Site safety, tool rules, and daily standards need proof before work starts.",
    outcomes: [
      "Run PPE checks by text",
      "Confirm site safety briefings",
      "Nudge crews on missed sign-offs",
    ],
  },
  {
    label: "Cleaning",
    problem:
      "Quality slips when every location has a slightly different checklist.",
    outcomes: [
      "Teach room-by-room standards",
      "Confirm supply and lockup steps",
      "Flag repeat quality misses",
    ],
  },
  {
    label: "Salons",
    problem:
      "Client experience depends on small standards that are easy to skip.",
    outcomes: [
      "Train front-desk scripts",
      "Confirm sanitation routines",
      "Coach service recovery moments",
    ],
  },
] as const;

export function UseCases() {
  const [active, setActive] = useState(0);
  const useCase = USE_CASES[active];

  return (
    <section
      className="landing-section landing-use-cases"
      style={{
        maxWidth: 1440,
        margin: "0 auto",
        padding: "16px 48px 72px",
      }}
    >
      <div
        className="landing-use-cases-panel"
        style={{
          background: "#fff",
          border: "1px solid #F0EDEA",
          borderRadius: 22,
          boxShadow: "0px 5px 18px rgba(3,17,40,0.05)",
          padding: 32,
          display: "grid",
          gridTemplateColumns: "minmax(0, 0.82fr) minmax(0, 1fr)",
          gap: 32,
          alignItems: "start",
        }}
      >
        <div>
          <p
            style={{
              color: "#3E2EC0",
              fontSize: 15,
              fontWeight: 800,
              letterSpacing: 0,
              margin: "0 0 10px",
            }}
          >
            Use cases
          </p>
          <h2
            className="landing-use-cases-heading"
            style={{
              color: "#0D1A2F",
              fontFamily: "'Inter Tight', Inter, system-ui, sans-serif",
              fontSize: 42,
              fontWeight: 800,
              letterSpacing: 0,
              lineHeight: 1.05,
              margin: 0,
            }}
          >
            Built for businesses where standards happen on the floor.
          </h2>
        </div>

        <div>
          <div
            role="tablist"
            aria-label="Business use cases"
            className="landing-use-case-tabs"
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginBottom: 22,
            }}
          >
            {USE_CASES.map((item, index) => {
              const selected = index === active;
              return (
                <button
                  key={item.label}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActive(index)}
                  style={{
                    border: selected
                      ? "1px solid #0D1A2F"
                      : "1px solid #E8E4DF",
                    background: selected ? "#0D1A2F" : "#FAF7F0",
                    color: selected ? "#fff" : "#0D1A2F",
                    borderRadius: 999,
                    padding: "10px 14px",
                    fontSize: 15,
                    fontWeight: 800,
                    fontFamily: "inherit",
                    cursor: "pointer",
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <div
            role="tabpanel"
            aria-label={`${useCase.label} use case`}
            style={{
              background: "#FAF7F0",
              borderRadius: 18,
              padding: 24,
            }}
          >
            <h3
              style={{
                color: "#0D1A2F",
                fontSize: 26,
                fontWeight: 800,
                letterSpacing: 0,
                lineHeight: 1.08,
                margin: "0 0 10px",
              }}
            >
              {useCase.label}
            </h3>
            <p
              style={{
                color: "rgba(13,26,47,0.72)",
                fontSize: 18,
                letterSpacing: 0,
                lineHeight: 1.35,
                margin: "0 0 18px",
              }}
            >
              {useCase.problem}
            </p>
            <ul
              style={{
                display: "grid",
                gap: 10,
                listStyle: "none",
                margin: 0,
                padding: 0,
              }}
            >
              {useCase.outcomes.map((outcome) => (
                <li
                  key={outcome}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    color: "#0D1A2F",
                    fontSize: 17,
                    fontWeight: 700,
                    letterSpacing: 0,
                    lineHeight: 1.28,
                  }}
                >
                  <svg
                    aria-hidden="true"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#3E2EC0"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ flexShrink: 0, marginTop: 2 }}
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  {outcome}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
