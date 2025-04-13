export const CREATE_THREAD_TITLE_PROMPT = `\n
      - you will generate a short title based on the first message a user begins a conversation with
      - ensure it is not more than 80 characters long
      - the title should be a summary of the user's message
      - do not use quotes or colons`;

export const SYSTEM_TIME_PROMPT = `\n
system time: ${new Date().toLocaleString()}
- You are a helpful assistant.
`;
