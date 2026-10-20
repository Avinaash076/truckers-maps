cd backend
gunicorn config.wsgi:application --bind 0.0.0.0:8000 &
echo $! > server_pid.txt
cd ..
