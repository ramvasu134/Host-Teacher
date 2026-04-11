# Host-Teacher Meeting Portal

A lightweight, browser-based application that enables **Hosts** and **Teachers** to schedule meetings and collaboratively manage discussion points — all without a backend server, using `localStorage` for persistence.

## Features

- **Schedule Meetings** – Create a meeting with a title, date/time, host name, and teacher name, plus optional agenda notes.
- **Discussion Points** – Add discussion points to any meeting; mark them resolved or delete them as the conversation progresses.
- **Meeting Notes** – Attach free-form notes to each meeting and save them at any time.
- **Dashboard Stats** – At-a-glance counts for total meetings, upcoming meetings, open discussion points, and resolved discussion points.
- **Filter View** – Switch between All, Upcoming, and Past meetings.
- **Delete Meetings** – Remove a meeting (and all its discussion points) when it is no longer needed.

## Getting Started

No build step required.

1. Clone or download this repository.
2. Open **`index.html`** in any modern browser.
3. Start scheduling meetings!

All data is stored in the browser's `localStorage`, so it persists across page refreshes on the same device.

## File Structure

```
index.html   – Application markup
styles.css   – Styling (CSS variables, responsive layout)
app.js       – Application logic (meetings & discussion-point management)
README.md    – This file
```

## Usage

1. Fill in the **Schedule a New Meeting** form and click **+ Create Meeting**.
2. Click any meeting card to open its detail panel.
3. Add discussion points in the **Discussion Points** section and check them off as they are addressed.
4. Save free-form notes using the **Meeting Notes** section.
5. Use the **Filter** dropdown to show only Upcoming or Past meetings.

