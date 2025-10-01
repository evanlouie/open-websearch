import { Effect } from "effect";
import { AppConfigLayer } from "../src/config.js";
import { searchDuckDuckGo } from "../src/engines/duckduckgo.js";

const program = Effect.gen(function* (_) {
  const query = "websearch mcp";
  const maxResults = 30;

  yield* _(
    Effect.sync(() => {
      console.log("🔍 Starting DuckDuckGo search test...");
      console.log(`📝 Search query: ${query}`);
      console.log(`📊 Maximum results: ${maxResults}`);
    }),
  );

  const results = yield* _(searchDuckDuckGo(query, maxResults));

  yield* _(
    Effect.sync(() => {
      console.log(`🎉 Search completed, retrieved ${results.length} results:`);
      results.forEach((result, index) => {
        console.log(`\n${index + 1}. ${result.title}`);
        console.log(`   🔗 ${result.url}`);
        console.log(`   📄 ${result.description.substring(0, 100)}...`);
        console.log(`   🌐 Source: ${result.source}`);
      });
    }),
  );
});

Effect.runPromise(program.pipe(Effect.provide(AppConfigLayer))).catch(
  (error) => {
    console.error("❌ Test failed:", error);
    process.exit(1);
  },
);
