import * as readline from "readline";
import { createAgent } from "@/lib/ai/agents/doc-agent";

async function main() {
  const agent = await createAgent();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log("Doc Agent ready! Type your query or 'exit' to quit.");

  rl.on("line", async (input: string) => {
    if (input.toLowerCase() === "exit") {
      rl.close();
      return;
    }

    try {
      const result = await agent.call({ input });
      console.log("\n=== Agent Response ===");
      console.log(result.output ?? result);
      console.log("=====================\n");
    } catch (err) {
      console.error("Error:", err);
    }
  });
}

main();
