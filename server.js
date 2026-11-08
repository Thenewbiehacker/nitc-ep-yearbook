import { createApp } from "./backend/app.js";
const port = Number(process.env.PORT || 3000);
const service = createApp();
const server = service.app.listen(port, () => {
  console.log(
    `Yearbook running at ${process.env.PUBLIC_ORIGIN || `http://localhost:${port}`}`,
  );
  if (!process.env.ADMIN_PASSWORD)
    console.log("Admin login is disabled until ADMIN_PASSWORD is set in .env.");
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      service.close();
      process.exit(0);
    }),
  );
