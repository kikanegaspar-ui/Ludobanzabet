import os

worker_class = "gevent"
workers = 1
worker_connections = 1000
timeout = 120
keepalive = 5
bind = "0.0.0.0:" + os.environ.get("PORT", "5000")
