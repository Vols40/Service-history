# Service History

Service History is a static web application for tracking assets, maintenance events, and service history records in the browser.

## Features

- Add and view assets
- Record service history events
- Track upcoming service reminders
- View recent activities
- See quick statistics and report summaries
- Export data as JSON, CSV, and PDF
- Dark mode toggle
- English and Romanian language switch
- Team roles and comments stored locally

## Tech Stack

- HTML
- CSS
- JavaScript
- Browser `localStorage` for persistence
- jsPDF and jsPDF-AutoTable for PDF export

## Project Structure

```text
.
├── index.html
├── css/
│   └── styles.css
├── js/
│   └── app.js
└── images/
    └── logo.PNG
```

## How to Run

1. Clone the repository.
2. Open the project folder in VS Code.
3. Open `index.html` in a browser.

You can also use the VS Code Live Server extension for a smoother local development experience.

## Data Storage

This app currently stores data in the browser using `localStorage`.
That means:

- data is local to the browser/device
- clearing browser storage may remove saved data
- there is currently no backend or cloud sync

## Current Status

This project is currently an MVP/prototype and includes working front-end functionality for service history management.

## Roadmap

Planned improvements:

- edit and delete assets
- improved asset data consistency
- better responsive design
- cleanup of placeholder/demo content
- modular JavaScript structure
- optional backend/database integration

## Repository

GitHub repository:
`https://github.com/Vols40/Service-history`
