import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const votes = sqliteTable("votes", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	ai_name: text("ai_name").notNull(),
	created_at: text("created_at").default(sql`CURRENT_TIMESTAMP`),
});
