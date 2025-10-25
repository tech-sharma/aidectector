# AI Phishing & Deepfake Detector

A web application that detects phishing emails and deepfake media using **AI-powered analysis** and **heuristic checks**. This project provides a simple dashboard to track analysis history and statistics.

---

## Table of Contents
- [Demo](#demo)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Installation](#installation)
- [Usage](#usage)
- [API Endpoints](#api-endpoints)
- [Dashboard](#dashboard)
- [Environment Variables](#environment-variables)
- [License](#license)

---

## Demo
*(Optional: Add link or screenshot of the app)*

---

## Features

- **Email Phishing Detection**
  - AI analysis using Google Gemini
  - Heuristic keyword detection
  - Risk score and explanation
- **Deepfake Media Detection**
  - AI analysis for images/videos
  - Heuristic detection based on file metadata
  - Fake confidence percentage
- **Dashboard**
  - Track analyzed emails and media
  - Average risk/fake scores
  - Recent activity history
  - Persistent data via localStorage
- **UI Enhancements**
  - Light & dark theme toggle
  - Responsive design
  - Clear input/result buttons

---

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript  
- **Backend:** Node.js, Express  
- **AI:** Google Gemini API  
- **File Uploads:** express-fileupload  
- **Data Persistence:** LocalStorage (frontend dashboard)

---

## Installation

1. Clone the repository:

```bash
git clone <your-repo-url>
cd <your-project-folder>
