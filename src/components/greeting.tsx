"use client";

import { motion } from "framer-motion";
import { authClient } from "lib/auth/auth-client";
import { useMemo } from "react";
import { FlipWords } from "ui/flip-words";
function getGreetingByTime() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const createWords = (name: string) => {
  return [
    `${getGreetingByTime()}, ${name}`,
    `Nice to see you again, ${name}.`,
    `Welcome, ${name}. Are you ready to get started?`,
    `What are you working on today?`,
    `Let me know when you're ready to begin.`,
    `What are your thoughts today?`,
    `Where would you like to start?`,
  ];
};

export const Greeting = () => {
  const { data: session } = authClient.useSession();

  const user = session?.user;

  const word = useMemo(() => {
    if (!user?.name) return "";
    const words = createWords(user.name);
    return words[Math.floor(Math.random() * words.length)];
  }, [user?.name]);

  return (
    <motion.div
      key="welcome"
      className="max-w-3xl mx-auto my-4 h-24"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ delay: 0.3 }}
    >
      <div className="rounded-xl p-6 flex flex-col gap-2 leading-relaxed text-center">
        <h1 className="text-4xl font-semibold">
          {word ? <FlipWords words={[word]} /> : ""}
        </h1>
        <div className="text-4xl"></div>
      </div>
    </motion.div>
  );
};
