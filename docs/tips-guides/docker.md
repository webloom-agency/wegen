# Using docker
Docker is a convent way to manage containers and is perfect for this sort of app. 
## Requirements 
- x86-64 or arm(64) computer
- Linux, mac (with docker desktop or equivalent) or Windows (w/wsl)
- Docker and docker compose installed
## Steps
1. In your terminal make sure you are in side the project, if you are not type 
```sh 
git clone https://github.com/cgoinglove/mcp-client-chatbot
cd mcp-client-chatbot
``` 
2. Set up envs
```sh
cp .env.example .env
```
now file in the envs (you only need api keys for the AI provider you want to use)
3. Now start and build the container
```sh
docker compose up -d --build
```
You are now good to go, visit http://<ipofserver>:3000/
To stop container make sure you are in the directory
```sh
docker compose down
```
To update 
```sh
docker compose down
git pull
docker compose up -d --build
```