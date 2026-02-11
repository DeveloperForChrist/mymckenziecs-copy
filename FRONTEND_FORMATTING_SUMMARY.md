# Frontend Formatting Summary

## ✅ Already Implemented

### 1. Section Title Underlining
**Location:** `src/components/chatbot/ChatInterface.tsx` (lines 2270-2298)

Current styling for assistant message headings:
```typescript
{
  textDecoration: 'underline',
  textDecorationThickness: '2px',
  textUnderlineOffset: '6px',
  borderBottom: '2px solid rgba(255,255,255,0.15)',
  fontSize: '19px',
  fontWeight: 600,
  letterSpacing: '0.01em',
  paddingLeft: '12px',
  borderLeft: '3px solid rgba(129,140,248,0.6)'
}
```

**Visual Effects:**
- Underline decoration with 2px thickness
- 6px offset from text
- Bottom border for emphasis
- Left accent bar (3px indigo)
- Larger font size (19px)
- Bold weight (600)

### 2. Section Dividers
**Location:** Lines 2369-2377

Horizontal dividers between sections:
```typescript
{
  marginTop: '10px',
  height: '2px',
  width: '100%',
  background: 'rgba(255,255,255,0.22)'
}
```

### 3. Heading Detection Algorithm
**Location:** Lines 226-249

Smart heading recognition:
- Lines ending with `:` (colon)
- ALL CAPS lines (3+ letters)
- **Title case lines** (2-12 words, 50%+ capitalized, starts with capital, no ending punctuation)

This ensures "Hit and Run: What to Do When You Have the Number Plate" is recognized as a heading.

### 4. Typography
**Font:** Open Sans, sans-serif
**Sizes:**
- Headings: 19px
- Body text: 17px
- User messages: 17px
- List items: 17px

### 5. Content Structure
**Elements:**
- Paragraphs with 8px bottom margin
- Bullet lists (•) with proper indentation
- Sections separated by 20px gap
- Short paragraphs (maintained by research agent)

## 🎯 Optional Enhancements (if needed)

### 1. Improve Visual Hierarchy
```typescript
// Make section gaps more pronounced
<div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}> // from 20px

// Add top padding to headings after first section
style={{
  paddingTop: sectionIndex > 0 ? '8px' : '0',
  // ... existing styles
}}
```

### 2. Enhance Divider Visibility
```typescript
// Stronger divider with gradient
<div
  style={{
    marginTop: '16px',
    marginBottom: '16px',
    height: '2px',
    width: '100%',
    background: 'linear-gradient(90deg, rgba(129,140,248,0.4), rgba(255,255,255,0.3), rgba(129,140,248,0.4))'
  }}
/>
```

### 3. Add Heading Icons
```typescript
{section.heading && (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <span style={{ color: 'rgba(129,140,248,0.8)', fontSize: '20px' }}>▸</span>
    <p style={{ /* existing heading styles */ }}>
      {renderMessageContent(section.heading, sources)}
    </p>
  </div>
)}
```

### 4. Improve Paragraph Spacing
```typescript
// In paragraph rendering
style={{
  fontFamily: 'Open Sans, sans-serif',
  fontSize: '17px',
  fontWeight: 500,
  margin: '0 0 12px 0', // from 8px for better breathing room
  lineHeight: 1.7, // add explicit line height
  color: '#f8fafc'
}}
```

### 5. Enhance Bullet Lists
```typescript
// In list rendering
<ul style={{
  margin: '0 0 12px 0', // from 8px
  paddingLeft: '20px', // from 0
  listStylePosition: 'outside', // from 'inside' for better alignment
  listStyleType: 'disc'
}}>
  <li style={{
    fontFamily: 'Open Sans, sans-serif',
    fontSize: '17px',
    fontWeight: 500,
    margin: '0 0 8px 0', // from 6px
    paddingLeft: '8px',
    color: '#f8f4ff'
  }}>
```

## 🔧 Backend Agent Instructions

### Legal Agent (`src/lib/ai/agents/legal-agent.ts`)
Current instructions ensure:
- Clear section titles (plain text, no colons at end)
- Short paragraphs (2-4 sentences)
- Blank lines between sections
- Bullets (•) for lists
- No markdown

### Research Agent (`src/lib/ai/agents/research-agent.ts`)
Responsible for:
- **Presentation, organisation, structure**
- Reviewing and improving structure
- Clear section titles (no colons at end)
- Removing markdown artifacts
- Ensuring readability

## 📊 Current Status

✅ **Working Well:**
- Heading detection (colon, all-caps, title-case)
- Underlined headings with accent bar
- Section dividers
- Font hierarchy
- Clean typography

⚠️ **Consider Adding:**
- More whitespace between sections
- Gradient dividers for visual appeal
- Icon markers for headings
- Better bullet list indentation
- Explicit line height for paragraphs

## 🚀 Quick Wins

If you want immediate visual improvements without changing agent behavior:

1. **Increase section gap** from 20px to 24-28px
2. **Stronger dividers** with gradient or higher opacity
3. **More paragraph spacing** from 8px to 12px bottom margin
4. **Better list indentation** from `paddingLeft: 0` to `paddingLeft: 20px`
5. **Explicit line heights** (1.7 for body, 1.5 for headings)

All these can be changed in `ChatInterface.tsx` without touching agent logic.
