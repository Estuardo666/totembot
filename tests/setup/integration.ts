const databaseUrl = process.env["DATABASE_URL"];

if (databaseUrl !== undefined) {
  const withoutQuery = databaseUrl.split("?")[0] ?? "";
  const databaseName = withoutQuery.split("/").pop() ?? "";
  if (!databaseName.endsWith("_test")) {
    throw new Error(
      `Refusing to run integration tests against database "${databaseName}": ` +
        'DATABASE_URL must point to a database whose name ends with "_test".',
    );
  }
}
