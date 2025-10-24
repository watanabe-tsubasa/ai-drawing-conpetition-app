import type { Config } from "drizzle-kit";

export default {
	schema: "./app/lib/schema.ts",
	out: "./drizzle",
	dialect: "sqlite",
	driver: "d1-http",
	dbCredentials: {
		wranglerConfigPath: "./wrangler.toml",
		dbName: "AI_DRAW_VOTES",
	},
} satisfies Config;
