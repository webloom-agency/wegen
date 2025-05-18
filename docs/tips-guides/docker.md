# Using Docker

Docker provides a streamlined and efficient method for managing containerized applications, making it an ideal choice for deploying this project.

## Requirements

*   **Architecture:** An x86-64 or ARM(64) based computer.
*   **Operating System:** Linux, macOS (with Docker Desktop or equivalent), or Windows (with WSL).
*   **Software:** Docker and Docker Compose installed and configured.

## Steps

1.  **Clone the Repository:**
    Navigate to the desired directory in your terminal and clone the project repository. If you're not already in the project directory after cloning, change into it:

    ```sh
    git clone https://github.com/cgoinglove/mcp-client-chatbot
    cd mcp-client-chatbot
    ```

2.  **Set up Environment Variables:**
    Copy the example environment file and then open the newly created `.env` file to fill in the necessary environment variables. You only need to provide the API keys for the AI provider you intend to use. You need an auth secret which can be made with `pnpx auth secret` and a database which I recommend neon or vercel postgres - any provider works

    ```sh
    cp .env.example .env
    ```

3.  **Build and Start the Container:**
    From the project's root directory, build the Docker image and start the container in detached mode (running in the background):

    ```sh
    docker compose up -d --build
    ```

    Your application should now be running. You can access it by visiting `http://<ipofserver>:3000/` in your web browser. Replace `<ipofserver>` with the IP address of the server where Docker is running (this will likely be `localhost` if you're running it on your local machine).
## Hosting your own postgres
Hosting the app your self is great and all, but you DB is hosted somewhere else. This small guide shows you how to host your postgres with the APP. This guide is initened if you have done the steps above. If you haven't go do them now. 
1. Open up compose.yml in a text editor
2. Uncomment lines 16-17 and 18-34, chnage db name, db username and password if you want but the DB only accessible to the app making it secure. 
3. Update env, change the database you had before to postgres://your_username:your_password@postgres:5432/your_database_name, if you changed DB name etc remeber to update here aswell. 
4. Rerun the app
```sh 
docker compose up -d --build 
```
## What is possible in docker and what is not
- Full support for MCP stdio servers that work with bunx, uvx and npx. 
- Full support for SSE servers. 
- And everything else as you would expect.
## Managing the Container

### Stopping the Container

To stop the running container, ensure you are in the project's root directory and execute:

```sh
docker compose down
```

### Updating the Application

To update the application to the latest version:

1.  Stop the running container:

    ```sh
    docker compose down
    ```

2.  Pull the latest changes from the Git repository:

    ```sh
    git pull
    ```

3.  Rebuild the Docker image and start a new container:

    ```sh
    docker compose up -d --build
    ```
