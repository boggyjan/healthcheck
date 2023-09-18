# HealthCheck Installation Guide

## Clone Repository
```
git clone git@github.com:boggyjan/linode-object-storage-cert-updater.git
```

## Config
```
cp config.json.sample config.json
```
Then, edit users array to add your admin users and passwords.

Create a Slack App and replace the "token_xxxxx" by Slack Token

## Start Service
```
pm2 start pm2.config.cjs
```
Done!