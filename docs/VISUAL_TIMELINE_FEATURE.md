# Visual Timeline Feature

## Overview
A new visual timeline component has been implemented in the Calendar pages to display deadlines and case milestones in an engaging, easy-to-understand format.

## Components Added

### 1. `VisualTimeline.tsx`
Located at: `src/components/dashboard/VisualTimeline.tsx`

**Key Features:**
- Displays events in a vertical timeline layout (responsive for all screen sizes)
- Color-coded status indicators (completed, today, upcoming)
- Shows days until deadline with intelligent color coding
- Compact and full-size display modes
- Responsive design that works on mobile, tablet, and desktop

**Props:**
- `events: TimelineEvent[]` - Array of events to display
- `isCompact?: boolean` - Optional compact display mode (default: false)

**Event Interface:**
```typescript
interface TimelineEvent {
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
```

## Integration Points

### 1. Deadline Radar Section
The "Deadline radar (next 30 days)" section now displays:
- Visual timeline of upcoming deadlines (up to 6 events)
- Compact timeline mode for better space usage
- Traditional list view for additional details

### 2. Case Timeline Section
The "Case Timeline" section now displays:
- Visual timeline of all case milestones
- Auto-synced from calendar entries
- Shows claim issuance, defence due, hearing dates, etc.

## Color Coding System

### Status Colors
- **Green** (#10b981): Completed events
- **Pink** (#f472b6): Today's deadline
- **Blue** (#3b82f6): Upcoming events

### Days Until Color
- **Red** (#ef4444): 0-1 days
- **Orange** (#f97316): 2-3 days
- **Amber** (#f59e0b): 4-7 days
- **Purple** (#8b5cf6): 8-14 days
- **Blue** (#3b82f6): 15-30 days
- **Green** (#10b981): 30+ days or past

## Features

1. **Timeline Dots** - Visual markers for each event on the timeline
2. **Status Badges** - Quick identification of event status (Done, Today, Upcoming)
3. **Date Display** - Shows event date in user-friendly format
4. **Days Counter** - Displays "X days ago", "Today", or "in X days"
5. **Demo Badges** - Distinguishes demo events from real user data
6. **Responsive Layout** - Adapts to different screen sizes
7. **Description Support** - Optional descriptions for each event

## Usage Example

```typescript
import VisualTimeline from "@/components/dashboard/VisualTimeline";

const events: TimelineEvent[] = [
  {
    id: "hearing-1",
    date: new Date("2026-02-15"),
    label: "Court Hearing",
    description: "District Judge hearing at local county court",
    daysUntil: 42,
    isPast: false,
    isUpcoming: true,
    status: "upcoming"
  }
];

<VisualTimeline events={events} />
```

## Styling

The component uses inline CSS for styling with the following color palette:
- Background: `#fefefe`
- Borders: `#e5e7eb`
- Text: `#111827` (primary), `#6b7280` (secondary)

All styles are responsive and adapt based on the `isCompact` prop.

## Future Enhancements

Potential improvements:
- [ ] Horizontal timeline view for desktop (commented code available)
- [ ] Animation on load/scroll
- [ ] Click handlers for drill-down views
- [ ] Export timeline as PDF/image
- [ ] Timeline filters by event type
- [ ] Milestone celebration indicators
