"use client";

import React, { useState, useEffect, useRef } from "react";
import { CheckCircle2, Clock, AlertCircle, Calendar, ChevronRight, Sparkles } from "lucide-react";

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
  color?: string;
}

interface EnhancedVisualTimelineProps {
  events: TimelineEvent[];
  isCompact?: boolean;
  showProgress?: boolean;
}

export const EnhancedVisualTimeline: React.FC<EnhancedVisualTimelineProps> = ({
  events,
  isCompact = false,
  showProgress = true,
}) => {
  const [activeEvent, setActiveEvent] = useState<string | null>(null);
  const [visibleEvents, setVisibleEvents] = useState<Set<string>>(new Set());
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Animate events appearing one by one
    const timer = setTimeout(() => {
      events.forEach((event, index) => {
        setTimeout(() => {
          setVisibleEvents(prev => new Set(prev).add(event.id));
        }, index * 150);
      });
    }, 100);

    return () => clearTimeout(timer);
  }, [events]);

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500">
        <Calendar className="w-12 h-12 mb-3 text-gray-300" />
        <p className="text-lg font-medium">No events scheduled</p>
        <p className="text-sm mt-1">Add deadlines to see your timeline</p>
      </div>
    );
  }

  // Sort events by date
  const sortedEvents = [...events].sort((a, b) => a.date.getTime() - b.date.getTime());
  
  // Calculate progress
  const completedEvents = sortedEvents.filter(e => e.isPast).length;
  const progressPercentage = (completedEvents / sortedEvents.length) * 100;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle2 className="w-5 h-5" />;
      case "today":
        return <Clock className="w-5 h-5" />;
      default:
        return <AlertCircle className="w-5 h-5" />;
    }
  };

  const getStatusColor = (status: string, isPast: boolean, customColor?: string) => {
    if (customColor) {
      if (isPast) return { bg: `${customColor}10`, color: customColor, border: `${customColor}30` };
      if (status === "today") return { bg: "#fef3c7", color: "#d97706", border: "#fbbf24" };
      return { bg: `${customColor}15`, color: customColor, border: `${customColor}40` };
    }
    
    if (isPast) return { bg: "rgba(16, 185, 129, 0.1)", color: "#10b981", border: "#d1fae5" };
    if (status === "today") return { bg: "rgba(251, 191, 36, 0.1)", color: "#f59e0b", border: "#fde68a" };
    return { bg: "rgba(59, 130, 246, 0.1)", color: "#3b82f6", border: "#dbeafe" };
  };

  const getDaysUntilColor = (daysUntil: number) => {
    if (daysUntil < 0) return "text-green-600";
    if (daysUntil === 0) return "text-amber-600";
    if (daysUntil <= 3) return "text-red-600";
    if (daysUntil <= 7) return "text-orange-600";
    if (daysUntil <= 14) return "text-yellow-600";
    return "text-blue-600";
  };

  return (
    <div className="relative" ref={timelineRef}>
      {/* Progress Bar */}
      {showProgress && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Case Progress</span>
            <span className="text-sm text-gray-500">{completedEvents} of {sortedEvents.length} completed</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full transition-all duration-1000 ease-out"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-gray-300 via-gray-400 to-gray-300" />

        {/* Events */}
        <div className="space-y-6">
          {sortedEvents.map((event, index) => {
            const statusColor = getStatusColor(event.status, event.isPast, event.color);
            const isVisible = visibleEvents.has(event.id);
            const dateStr = event.date.toLocaleDateString("en-GB", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric"
            });

            return (
              <div
                key={event.id}
                className={`relative flex items-start gap-4 transition-all duration-500 ${
                  isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'
                }`}
                onMouseEnter={() => setActiveEvent(event.id)}
                onMouseLeave={() => setActiveEvent(null)}
              >
                {/* Timeline dot */}
                <div className="relative z-10">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${
                      activeEvent === event.id ? 'scale-110' : 'scale-100'
                    }`}
                    style={{
                      backgroundColor: statusColor.bg,
                      border: `3px solid ${statusColor.color}`,
                      color: statusColor.color,
                    }}
                  >
                    {getStatusIcon(event.status)}
                  </div>
                  {/* Pulse animation for today/upcoming */}
                  {event.status === "today" && (
                    <div className="absolute inset-0 rounded-full bg-amber-400 opacity-30 animate-ping" />
                  )}
                </div>

                {/* Event card */}
                <div
                  className={`flex-1 bg-white rounded-xl border-2 p-5 transition-all duration-300 hover:shadow-lg ${
                    activeEvent === event.id ? 'transform scale-[1.02] border-opacity-100' : 'border-opacity-60'
                  }`}
                  style={{
                    borderColor: statusColor.border,
                    backgroundColor: event.isDemo ? '#faf5ff' : '#ffffff',
                  }}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        {event.label}
                        {event.isDemo && <Sparkles className="w-4 h-4 text-purple-500" />}
                      </h3>
                      {event.description && (
                        <p className="text-sm text-gray-600 mt-1">{event.description}</p>
                      )}
                    </div>
                    <div
                      className={`px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wide`}
                      style={{
                        backgroundColor: statusColor.bg,
                        color: statusColor.color,
                      }}
                    >
                      {event.status === "completed" ? "Completed" : 
                       event.status === "today" ? "Today" : "Upcoming"}
                    </div>
                  </div>

                  {/* Date and time info */}
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1 text-gray-500">
                      <Calendar className="w-4 h-4" />
                      <span>{dateStr}</span>
                    </div>
                    <div className={`font-medium ${getDaysUntilColor(event.daysUntil)}`}>
                      {event.daysUntil < 0
                        ? `${Math.abs(event.daysUntil)} days ago`
                        : event.daysUntil === 0
                        ? "Today"
                        : `In ${event.daysUntil} days`}
                    </div>
                  </div>

                  {/* Demo badge */}
                  {event.isDemo && (
                    <div className="mt-3 text-xs text-purple-600 font-medium italic">
                      Example milestone - your actual deadlines will appear here
                    </div>
                  )}

                  {/* Action button for active event */}
                  {activeEvent === event.id && !event.isPast && (
                    <div className="mt-4 flex gap-2">
                      <button className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1">
                        View Details
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Timeline completion indicator */}
      {completedEvents === sortedEvents.length && sortedEvents.length > 0 && (
        <div className="mt-8 text-center p-6 bg-green-50 rounded-xl border border-green-200">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-green-900">All milestones completed!</h3>
          <p className="text-sm text-green-700 mt-1">Great job managing your case timeline</p>
        </div>
      )}
    </div>
  );
};

// Horizontal Timeline Variant
export const HorizontalTimeline: React.FC<EnhancedVisualTimelineProps> = ({
  events,
  isCompact = false,
}) => {
  const [activeEvent, setActiveEvent] = useState<string | null>(null);

  if (events.length === 0) return null;

  const sortedEvents = [...events].sort((a, b) => a.date.getTime() - b.date.getTime());
  const today = new Date();
  
  return (
    <div className="relative overflow-x-auto pb-4">
      <div className="relative min-w-max px-8">
        {/* Horizontal line */}
        <div className="absolute top-8 left-8 right-8 h-0.5 bg-gray-300" />

        {/* Events */}
        <div className="relative flex gap-8 pt-2">
          {sortedEvents.map((event, index) => {
            const statusColor = getStatusColor(event.status, event.isPast, event.color);
            const isActive = activeEvent === event.id;

            return (
              <div
                key={event.id}
                className="flex flex-col items-center"
                onMouseEnter={() => setActiveEvent(event.id)}
                onMouseLeave={() => setActiveEvent(null)}
              >
                {/* Dot */}
                <div
                  className={`w-4 h-4 rounded-full border-2 border-white transition-all duration-300 z-10 ${
                    isActive ? 'scale-150' : ''
                  }`}
                  style={{ backgroundColor: statusColor.color }}
                />

                {/* Card */}
                <div
                  className={`mt-4 bg-white rounded-lg border p-3 transition-all duration-300 cursor-pointer ${
                    isActive ? 'shadow-lg transform scale-105' : 'shadow-sm'
                  }`}
                  style={{ borderColor: statusColor.border }}
                >
                  <h4 className="font-medium text-sm text-gray-900 mb-1">{event.label}</h4>
                  <p className="text-xs text-gray-500">{event.date.toLocaleDateString()}</p>
                  <div className={`text-xs font-medium mt-1`} style={{ color: statusColor.color }}>
                    {event.status === "completed" ? "Done" : 
                     event.status === "today" ? "Today" : 
                     `In ${event.daysUntil} days`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// Helper function
function getStatusColor(status: string, isPast: boolean, customColor?: string) {
  if (customColor) {
    if (isPast) return { bg: `${customColor}10`, color: customColor, border: `${customColor}30` };
    if (status === "today") return { bg: "#fef3c7", color: "#d97706", border: "#fbbf24" };
    return { bg: `${customColor}15`, color: customColor, border: `${customColor}40` };
  }
  
  if (isPast) return { bg: "rgba(16, 185, 129, 0.1)", color: "#10b981", border: "#d1fae5" };
  if (status === "today") return { bg: "rgba(251, 191, 36, 0.1)", color: "#f59e0b", border: "#fde68a" };
  return { bg: "rgba(59, 130, 246, 0.1)", color: "#3b82f6", border: "#dbeafe" };
}

export default EnhancedVisualTimeline;
