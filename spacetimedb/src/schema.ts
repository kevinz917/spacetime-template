import { schema, t, table } from "spacetimedb";

// These are the tables that will be used in the database. To add any logic that existing tables cannot satisfy, always start with the tables.
export const tables = schema(
  table(
    { name: "person", public: true },
    {
      name: t.string(),
    }
  )
);
