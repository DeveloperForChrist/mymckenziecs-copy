"use client";

import React from "react";

export interface TimelineEvent {
  id: string;
  date: Date;
  label: string;
  description?: string;
  daysUntil: number;
  isPast: boolean;
  isUpcoming: boolean;
  status: "completed" | "upcoming" | "today";
  type?: string;
  isDemo?: boolean;
}

interface VisualTimelineProps {
  events: TimelineEvent[];
  isCompact?: boolean;
}

export const VisualTimeline: React.FC<VisualTimelineProps> = ({
  events,
  isCompact = false,
}) => {
  if (events.length === 0) {
    return (
      <div
        style={{
          padding: "20px",
          textAlign: "center",
          color: "#6b7280",
          fontSize: 14,
        }}
      >
        No events scheduled yet. Add deadlines to see your timeline.
      </div>
    );
  }

  // Sort events by date
  const sortedEvents = [...events].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  // Calculate timeline range
  const minDate = sortedEvents[0]?.date || new Date();
  const maxDate = sortedEvents[sortedEvents.length - 1]?.date || new Date();

  const getStatusColor = (status: string, isPast: boolean) => {
    if (isPast) return { bg: "rgba(16, 185, 129, 0.1)", color: "#10b981", border: "#d1fae5" };
    if (status === "today") return { bg: "rgba(244, 114, 182, 0.1)", color: "#f472b6", border: "#fbcfe8" };
    return { bg: "rgba(59, 130, 246, 0.1)", color: "#3b82f6", border: "#dbeafe" };
  };

  const getDaysUntilColor = (daysUntil: number) => {
    if (daysUntil < 0) return "#10b981";
    if (daysUntil === 0) return "#f472b6";
    if (daysUntil <= 3) return "#ef4444";
    if (daysUntil <= 7) return "#f97316";
    if (daysUntil <= 14) return "#f59e0b";
    return "#3b82f6";
  };

  return (
    <div
      style={{
        padding: isCompact ? "16px" : "24px",
        borderRadius: 16,
        border: "1px solid #e5e7eb",
        background: "#fefefe",
      }}
    >
      {/* Vertical Timeline (Primary view - works on all sizes) */}
      <div style={{ width: "100%" }}>
        <TimelineVertical
          events={sortedEvents}
          getStatusColor={getStatusColor}
          getDaysUntilColor={getDaysUntilColor}
          isCompact={isCompact}
        />
      </div>
    </div>
  );
};

interface TimelineLayoutProps {
  events: TimelineEvent[];
  getStatusColor: (status: string, isPast: boolean) => {
    bg: string;
    color: string;
    border: string;
  };
  getDaysUntilColor: (daysUntil: number) => string;
  isCompact?: boolean;
}

const TimelineHorizontal: React.FC<Omit<TimelineLayoutProps, "isCompact">> = ({
  events,
  getStatusColor,
  getDaysUntilColor,
}) => {
  const today = new Date();
  const timelineWidth = 100;
  const minDate = events[0]?.date || new Date();
  const maxDate = events[events.length - 1]?.date || new Date();
  const totalDays = Math.max(
    1,
    Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24))
  );

  return (
    <div style={{ position: "relative", padding: "40px 0" }}>
      {/* Main timeline line */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "5%",
          right: "5%",
          height: 2,
          background: "linear-gradient(to right, #e5e7eb 0%, #9ca3af 50%, #e5e7eb 100%)",
          transform: "translateY(-50%)",
        }}
      />

      {/* Today marker */}
      {today >= minDate && today <= maxDate && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: `${5 + (90 * (today.getTime() - minDate.getTime())) / (maxDate.getTime() - minDate.getTime())}%`,
            transform: "translate(-50%, -50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            zIndex: 5,
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: "#f472b6",
              border: "3px solid #fff",
              boxShadow: "0 0 0 3px #f472b6",
            }}
          />
          <span
            style={{
              marginTop: 16,
              fontSize: 10,
              fontWeight: 700,
              color: "#f472b6",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            Today
          </span>
        </div>
      )}

      {/* Events */}
      <div style={{ position: "relative", height: 200, display: "flex", alignItems: "center" }}>
        {events.map((event, index) => {
          const position =
            5 +
            (90 * (event.date.getTime() - minDate.getTime())) /
              (maxDate.getTime() - minDate.getTime());
          const statusColor = getStatusColor(event.status, event.isPast);
          const isAbove = index % 2 === 0;

          return (
            <div
              key={event.id}
              style={{
                position: "absolute",
                left: `${position}%`,
                transform: "translateX(-50%)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              {/* Connection line */}
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 1,
                  height: 20,
                  background: statusColor.color,
                  top: isAbove ? "-20px" : "auto",
                  bottom: isAbove ? "auto" : "-20px",
                }}
              />

              {/* Event dot */}
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: statusColor.color,
                  border: `3px solid #fff`,
                  boxShadow: `0 0 0 2px ${statusColor.color}`,
                  zIndex: 10,
                }}
              />

              {/* Event card */}
              <div
                style={{
                  marginTop: isAbove ? 0 : 60,
                  marginBottom: isAbove ? 60 : 0,
                  background: statusColor.bg,
                  border: `1px solid ${statusColor.border}`,
                  borderRadius: 10,
                  padding: "8px 12px",
                  minWidth: 120,
                  textAlign: "center",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#111827",
                }}
              >
                <div style={{ fontWeight: 700, color: statusColor.color }}>
                  {event.label}
                </div>
                <div style={{ fontSize: 10, color: "#6b7280", marginTop: 4 }}>
                  {event.date.toLocaleDateString("en-GB")}
                </div>
                {event.daysUntil !== undefined && (
                  <div style={{ fontSize: 10, color: getDaysUntilColor(event.daysUntil), fontWeight: 700, marginTop: 2 }}>
                    {event.daysUntil < 0
                      ? `${Math.abs(event.daysUntil)} days ago`
                      : event.daysUntil === 0
                      ? "Today"
                      : `in ${event.daysUntil} days`}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const TimelineVertical: React.FC<TimelineLayoutProps> = ({
  events,
  getStatusColor,
  getDaysUntilColor,
  isCompact = false,
}) => {
  return (
    <div
      style={{
        position: "relative",
        paddingLeft: isCompact ? "20px" : "40px",
      }}
    >
      {/* Vertical timeline line */}
      <div
        style={{
          position: "absolute",
          left: isCompact ? "7px" : "15px",
          top: 0,
          bottom: 0,
          width: 2,
          background: "linear-gradient(to bottom, #e5e7eb 0%, #9ca3af 50%, #e5e7eb 100%)",
        }}
      />

      {/* Events */}
      <div style={{ display: "flex", flexDirection: "column", gap: isCompact ? 16 : 24 }}>
        {events.map((event) => {
          const statusColor = getStatusColor(event.status, event.isPast);
          const dateStr = event.date.toLocaleDateString("en-GB", {
            weekday: "short",
            month: "short",
            day: "numeric",
          });

          return (
            <div
              key={event.id}
              style={{
                position: "relative",
                display: "flex",
                gap: isCompact ? 8 : 16,
              }}
            >
              {/* Event dot */}
              <div
                style={{
                  position: "absolute",
                  left: isCompact ? "-26px" : "-34px",
                  top: isCompact ? "6px" : "8px",
                  width: isCompact ? 14 : 16,
                  height: isCompact ? 14 : 16,
                  borderRadius: "50%",
                  background: statusColor.color,
                  border: "3px solid #fff",
                  boxShadow: `0 0 0 2px ${statusColor.color}`,
                  zIndex: 10,
                  flexShrink: 0,
                }}
              />

              {/* Event card */}
              <div
                style={{
                  flex: 1,
                  background: statusColor.bg,
                  border: `1px solid ${statusColor.border}`,
                  borderRadius: 12,
                  padding: isCompact ? "10px 12px" : "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {/* Header */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        color: statusColor.color,
                        fontSize: isCompact ? 13 : 14,
                      }}
                    >
                      {event.label}
                    </div>
                    {event.description && (
                      <div
                        style={{
                          fontSize: isCompact ? 11 : 12,
                          color: "#6b7280",
                          marginTop: 2,
                        }}
                      >
                        {event.description}
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      background: statusColor.color,
                      color: "#fff",
                      padding: "4px 8px",
                      borderRadius: 6,
                      fontSize: 10,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      textTransform: "uppercase",
                      letterSpacing: 0.3,
                      flexShrink: 0,
                    }}
                  >
                    {event.status === "completed" ? "Done" : event.status === "today" ? "Today" : "Upcoming"}
                  </div>
                </div>

                {/* Date and time info */}
                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    fontSize: isCompact ? 11 : 12,
                    color: "#6b7280",
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{dateStr}</span>
                  {event.daysUntil !== undefined && (
                    <span
                      style={{
                        color: getDaysUntilColor(event.daysUntil),
                        fontWeight: 700,
                      }}
                    >
                      {event.daysUntil < 0
                        ? `${Math.abs(event.daysUntil)} days ago`
                        : event.daysUntil === 0
                        ? "Today"
                        : `in ${event.daysUntil} days`}
                    </span>
                  )}
                </div>

                {/* Demo badge */}
                {event.isDemo && (
                  <div
                    style={{
                      fontSize: 10,
                      color: "#7c3aed",
                      fontWeight: 600,
                      fontStyle: "italic",
                    }}
                  >
                    Example – your deadlines will appear here
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VisualTimeline;
