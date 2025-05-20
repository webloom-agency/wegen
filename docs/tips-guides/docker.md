# Using Docker

Docker provides a streamlined and efficient method for managing containerized applications, making it an ideal choice for deploying this project.

## Requirements

- **Architecture:** An x86-64 or ARM(64) based computer.
- **Operating System:** Linux, macOS (with Docker Desktop or equivalent), or Windows (with WSL).
- **Software:** Docker and Docker Compose installed and configured.

## Steps

1.  **Clone the Repository:**
    Navigate to the desired directory in your terminal and clone the project repository. If you're not already in the project directory after cloning, change into it:

    ```sh
    git clone https://github.com/cgoinglove/mcp-client-chatbot
    cd mcp-client-chatbot
    ```

2.  **Set up Environment Variables:**
    Copy the example environment file and then open the newly created `.env.local` file to fill in the necessary environment variables. You only need to provide the API keys for the AI provider you intend to use. You need an auth secret which can be made with `pnpx auth secret`. Database is handled by docker so the default .env.example is fine.

    ```sh
    pnpm i
    ```

3.  **Build and Start the Container:**
    From the project's root directory, build the Docker image and start the container in detached mode (running in the background):

    ```sh
    pnpm docker-compose:up
    ```

    Your application should now be running. You can access it by visiting `http://<ipofserver>:3000/` in your web browser. Replace `<ipofserver>` with the IP address of the server where Docker is running (this will likely be `localhost` if you're running it on your local machine).

## What is possible in docker and what is not

- Full support for MCP stdio servers that work with bunx, uvx and npx.
- Full support for SSE servers.
- And everything else as you would expect.

## Managing the Container

### Stopping the Container

To stop the running container, ensure you are in the project's root directory and execute:

```sh
pnpm docker-compose:down
```

### Updating the Application

To update the application to the latest version:

```sh
pnpm docker-compose:update
```
