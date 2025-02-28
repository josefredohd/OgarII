#!/bin/bash

# Process name in PM2
APP_NAME="agario-server"

# Check if the process is already running
if pm2 list | grep -i "$APP_NAME" > /dev/null; then
    echo "The server is already running. Attaching to the terminal..."
    pm2 attach 0
else
    echo "Starting the server with PM2..."
    pm2 start index.js --name $APP_NAME
    pm2 logs 0
fi
