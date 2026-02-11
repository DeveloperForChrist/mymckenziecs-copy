# Mode Selector Repositioning Plan

## Current Structure Analysis
The mode selector is currently positioned inside the chatbar form at the bottom of the interface, within the "Buttons row" section alongside the attachment and send buttons.

## Required Changes

### 1. Extract Mode Selector from Chatbar
- Remove the mode selector from the chatbar form
- This includes the button with dropdown functionality and all related state management (showDropdown, dropdownRef)

### 2. Position Mode Selector at Top
- Move the mode selector to the top area of the interface, above the messages container
- Place it in a prominent position for better visibility and accessibility
- Maintain the same styling and functionality

### 3. Layout Adjustments
- Update the chatbar to remove the left-side mode selector space
- Ensure the top positioning doesn't interfere with existing top spacer
- Maintain responsive design and proper spacing

### 4. State Management
- Keep all existing state variables and handlers for mode selection
- Ensure dropdown functionality remains intact
- Preserve mode selection persistence

## Implementation Steps
1. Identify the current mode selector section in the chatbar
2. Create a new top-positioned mode selector section
3. Remove the mode selector from the chatbar
4. Test functionality and styling
5. Ensure responsive behavior is maintained

## Files to Modify
- `src/components/chatbot/ChatInterface.tsx` - Main component file
