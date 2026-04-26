import { google } from "@ai-sdk/google";
import { generateText } from "ai";

async function main() {
  try {
    console.log(
      "Key starting with:",
      process.env.GOOGLE_GENERATIVE_AI_API_KEY?.substring(0, 10),
    );
    const { text } = await generateText({
      model: google("gemini-3-flash"),
      prompt: "Write a short greeting in Japanese.",
    });
    console.log("Success! Output:", text);
  } catch (error) {
    console.error("Error occurred:", error);
  }
}

main();
