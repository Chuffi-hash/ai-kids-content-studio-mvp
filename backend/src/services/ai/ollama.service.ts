import ollama from "ollama";

export async function generateJson<T>(
  prompt: string,
  schema: object
): Promise<T> {
  const response = await ollama.chat({
    model: "llama3.2:3b",

    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],

    format: schema,

    options: {
      temperature: 0.3,
      num_predict: 4096,
    },
  });

  return JSON.parse(response.message.content) as T;
}