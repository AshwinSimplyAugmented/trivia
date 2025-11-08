# Stage 1: Build the React application
FROM node:14 AS build

WORKDIR /usr/src/app

# Copy package.json and package-lock.json from the frontend directory
COPY frontend/package*.json ./frontend/

# Change the working directory to frontend
WORKDIR /usr/src/app/frontend

# Install dependencies
RUN npm install

# Copy the rest of the frontend files after dependencies are installed
COPY frontend/ ./

# Set environment variable to ensure proper bundling for Shadow DOM
ENV INLINE_RUNTIME_CHUNK=false

# Build the React application
RUN npm run build

# Stage 2: Setup the Python environment and copy the React build files
FROM python:3.9-slim-buster

ENV FLASK_CORS_ALLOW_ORIGINS="*"

WORKDIR /usr/src/app

# Copy the backend directory and the React build files
COPY backend/ ./backend/
COPY --from=build /usr/src/app/frontend/build ./backend/build

WORKDIR /usr/src/app/backend

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Make port 5000 available to the world outside this container
EXPOSE 5000

# Use Gunicorn to run the Python application
CMD ["python", "app.py"]