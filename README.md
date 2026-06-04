# Spider-Man Website

This project includes a Spider-Man fan website with a City Patrol backend.

## Run locally

1. Open a terminal in `e:\spider-man`
2. Copy `.env.example` to `.env`
3. Set `DATABASE_URL` in `.env` to your PostgreSQL database URL
4. Run `npm install`
5. Run `npm start`
6. Open `http://localhost:3000` in your browser

## Features

- Static frontend with HTML, CSS, and JavaScript
- User sign-up and login system
- Admin-only patrol dashboard
- Backend using Express and PostgreSQL to store users and patrol entries
- Subtle Spider-Man theme and background styling

## PostgreSQL setup

Your app uses `DATABASE_URL` to connect to PostgreSQL. On Render, set `DATABASE_URL` in the environment settings.
