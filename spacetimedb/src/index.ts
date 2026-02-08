import { schema, table, t } from "spacetimedb/server";
import { tables } from "./schema";

export const spacetimedb = tables;

spacetimedb.init((_ctx) => {
  // Called when the module is initially published
});

spacetimedb.clientConnected((_ctx) => {
  // Called every time a new client connects
});

spacetimedb.clientDisconnected((_ctx) => {
  // Called every time a client disconnects
});

spacetimedb.reducer("add", { name: t.string() }, (ctx, { name }) => {
  ctx.db.person.insert({ name });
});

spacetimedb.reducer("say_hello", (ctx) => {
  for (const person of ctx.db.person.iter()) {
    console.info(`Hello, ${person.name}!`);
  }
  console.info("Hello, World!");
});
